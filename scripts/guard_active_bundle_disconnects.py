#!/usr/bin/env python3
"""Prevent delayed/stale disconnect jobs from cutting an active bundle.

Expiry and quota workers change the activation out of ACTIVE before requesting a
router disconnect. A retry can survive long enough for the same Smart TV/MAC
username to receive a newer active package; delivering the old retry would then
remove the new valid RouterOS session. This final source patch re-checks the
activation/username immediately before every CoA/API logout.

Explicit manual/admin revocation remains allowed. Local router idle/keepalive
protection is handled separately by the MikroTik captive-flow policy.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIFECYCLE = ROOT / "apps/api/src/modules/radius/access-lifecycle.service.ts"
SENTINEL = "Active bundle protection: never deliver a stale disconnect"


def main() -> None:
    text = LIFECYCLE.read_text(encoding="utf-8")

    if SENTINEL not in text:
        old = """    for (const attempt of attempts) {
      try {
        const secret = process.env.RADIUS_DISCONNECT_SECRET?.trim() || process.env.RADIUS_SHARED_SECRET
"""
        new = """    for (const attempt of attempts) {
      try {
        // Active bundle protection: never deliver a stale disconnect against
        // an activation that is ACTIVE and unexpired now. This also protects a
        // newer Smart TV/MAC package that reused the same RADIUS username while
        // an old expiry/quota retry was still queued.
        const explicitRevocation = /(?:manual|admin|revok|suspend)/i.test(attempt.message ?? '')
        if (!explicitRevocation && (attempt.activationId || attempt.username)) {
          const protectedActivation = await this.prisma.packageActivation.findFirst({
            where: {
              status: PackageActivationStatus.ACTIVE,
              endsAt: { gt: now },
              OR: [
                ...(attempt.activationId ? [{ id: attempt.activationId }] : []),
                ...(attempt.username ? [{ radiusUsername: attempt.username }] : []),
              ],
            },
            select: { id: true, endsAt: true },
          })

          if (protectedActivation) {
            await this.prisma.disconnectionAttempt.update({
              where: { id: attempt.id },
              data: {
                status: DisconnectionStatus.NOT_SUPPORTED,
                completedAt: now,
                nextRetryAt: null,
                message: `Disconnect suppressed: active bundle ${protectedActivation.id} remains valid until ${protectedActivation.endsAt.toISOString()}`,
              },
            })
            this.logger.warn(
              `Suppressed stale disconnect ${attempt.id} for active bundle ${protectedActivation.id}`,
            )
            continue
          }
        }

        const secret = process.env.RADIUS_DISCONNECT_SECRET?.trim() || process.env.RADIUS_SHARED_SECRET
"""
        count = text.count(old)
        if count != 1:
            raise RuntimeError(
                "access-lifecycle.service.ts: expected one pending-disconnect loop insertion point, "
                f"found {count}"
            )
        text = text.replace(old, new, 1)
        LIFECYCLE.write_text(text, encoding="utf-8")

    final = LIFECYCLE.read_text(encoding="utf-8")
    required = (
        SENTINEL,
        "status: PackageActivationStatus.ACTIVE",
        "endsAt: { gt: now }",
        "Disconnect suppressed: active bundle",
        "DisconnectionStatus.NOT_SUPPORTED",
        "const explicitRevocation = /(?:manual|admin|revok|suspend)/i",
    )
    missing = [marker for marker in required if marker not in final]
    if missing:
        raise RuntimeError(
            "Active-bundle disconnect protection incomplete; missing: " + ", ".join(missing)
        )

    print(
        "Active-bundle disconnect guard installed: stale CoA/API logout retries cannot cut valid access."
    )


if __name__ == "__main__":
    main()
