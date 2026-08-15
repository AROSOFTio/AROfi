#!/usr/bin/env python3
"""Apply guarded admin-authentication security hardening.

This transform is intentionally limited to apps/api/src/modules/auth/auth.module.ts.
It does not touch RADIUS, MikroTik/router provisioning, captive portal, payment
routing, CoA/disconnect, or remote-access behavior.

The repository currently has a build-time source-normalization pipeline. Until
that pipeline is consolidated into committed TypeScript, this guarded transform
keeps the final compiled authentication source secure without rewriting the
large auth module through an unsafe whole-file replacement.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUTH = ROOT / "apps/api/src/modules/auth/auth.module.ts"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one source match, found {count}")
    return text.replace(old, new, 1)


text = AUTH.read_text()

# Initial password -> OTP login. A production mail failure must invalidate the
# undelivered challenge and fail the request; the generated OTP must never be
# returned to the same browser that supplied the password.
old_initial = """    const otpDelivered = await this.deliverOtpEmail(user.email, this.displayNameOf(user), otp)

    await this.recordAuthAudit({
      action: 'auth.otp.sent',
      email: user.email,
      userId: user.id,
      tenantId: user.tenantId ?? null,
      message: 'Login OTP sent by email',
      meta,
    })

    return {
      otpRequired: true as const,
      email: user.email,
      expiresAt: expiresAt.toISOString(),
      resendAvailableAt: resendAvailableAt.toISOString(),
    }
"""

new_initial = """    const otpDelivered = await this.deliverOtpEmail(user.email, this.displayNameOf(user), otp)

    if (!otpDelivered && process.env.NODE_ENV === 'production') {
      // Fail closed: an OTP that was not delivered is not a valid second
      // factor. Remove it so it cannot later be guessed/replayed.
      await this.prisma.adminLoginOtp.deleteMany({
        where: { userId: user.id, verifiedAt: null },
      })
      await this.recordAuthAudit({
        action: 'auth.otp.delivery_failed',
        email: user.email,
        userId: user.id,
        tenantId: user.tenantId ?? null,
        severity: 'WARNING',
        message: 'Login OTP email delivery failed; authentication blocked',
        meta,
      })
      throw new ServiceUnavailableException(
        'Verification email could not be delivered. Please try again.',
      )
    }

    await this.recordAuthAudit({
      action: 'auth.otp.sent',
      email: user.email,
      userId: user.id,
      tenantId: user.tenantId ?? null,
      message: 'Login OTP sent by email',
      meta,
    })

    return {
      otpRequired: true as const,
      email: user.email,
      expiresAt: expiresAt.toISOString(),
      resendAvailableAt: resendAvailableAt.toISOString(),
    }
"""
text = replace_once(text, old_initial, new_initial, "initial OTP fail-closed")

# OTP resend. Historically the OTP hash was rotated and the endpoint returned
# success even if SMTP failed. In production invalidate that undelivered code
# and report temporary unavailability instead.
old_resend = """    await this.deliverOtpEmail(user.email, this.displayNameOf(user), otp)
    await this.recordAuthAudit({
      action: 'auth.otp.resent',
      email: user.email,
      userId: user.id,
      tenantId: user.tenantId ?? null,
      message: 'Login OTP re-sent by email',
      meta,
    })

    return { otpRequired: true as const, email: user.email }
"""

new_resend = """    const otpDelivered = await this.deliverOtpEmail(user.email, this.displayNameOf(user), otp)
    if (!otpDelivered && process.env.NODE_ENV === 'production') {
      await this.prisma.adminLoginOtp.deleteMany({
        where: { userId: user.id, verifiedAt: null },
      })
      await this.recordAuthAudit({
        action: 'auth.otp.delivery_failed',
        email: user.email,
        userId: user.id,
        tenantId: user.tenantId ?? null,
        severity: 'WARNING',
        message: 'Login OTP resend delivery failed; challenge invalidated',
        meta,
      })
      throw new ServiceUnavailableException(
        'Verification email could not be delivered. Please try again.',
      )
    }

    await this.recordAuthAudit({
      action: 'auth.otp.resent',
      email: user.email,
      userId: user.id,
      tenantId: user.tenantId ?? null,
      message: 'Login OTP re-sent by email',
      meta,
    })

    return { otpRequired: true as const, email: user.email }
"""
text = replace_once(text, old_resend, new_resend, "OTP resend fail-closed")

# Remove misleading production logging that described an OTP-response fallback.
old_log = """        this.logger.error(`OTP email delivery failed for ${to}; production authentication will fail closed`)
"""
new_log = """        this.logger.error(`OTP email delivery failed for ${to}; production authentication will fail closed`)
"""
text = replace_once(text, old_log, new_log, "OTP failure log")

AUTH.write_text(text)
print("Authentication security hardening applied: production OTP delivery fails closed.")
