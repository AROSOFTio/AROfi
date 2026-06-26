import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'

export type SendMailInput = {
  to: string
  subject: string
  html: string
  text?: string
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)
  private transporter: nodemailer.Transporter | null = null

  constructor(private readonly configService: ConfigService) {}

  private getTransporter(): nodemailer.Transporter | null {
    const host = this.configService.get<string>('SMTP_HOST')
    const port = Number(this.configService.get<string>('SMTP_PORT') ?? '587')
    const user = this.configService.get<string>('SMTP_USER')
    const pass = this.configService.get<string>('SMTP_PASS')

    if (!host || !user || !pass) {
      return null
    }

    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      })
    }

    return this.transporter
  }

  async sendMail(input: SendMailInput): Promise<boolean> {
    const transporter = this.getTransporter()
    if (!transporter) {
      this.logger.warn(`SMTP is not configured — skipping email to ${input.to}: ${input.subject}`)
      return false
    }

    const fromEmail = this.configService.get<string>('SMTP_FROM_EMAIL') ?? this.configService.get<string>('SMTP_USER')
    const fromName = this.configService.get<string>('SMTP_FROM_NAME') ?? 'AROFi'

    try {
      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      })
      return true
    } catch (error) {
      this.logger.error(`Failed to send email to ${input.to}`, error instanceof Error ? error.stack : String(error))
      return false
    }
  }

  async sendOnboardingCompleteEmail(input: { to: string; tenantName: string; recipientName: string }): Promise<boolean> {
    const subject = 'Your AROFi WiFi system is set up — enjoy your business!'
    const body = `
      <h2 style="color:#2563EB; margin-top:0;">Hi ${this.escapeHtml(input.recipientName)},</h2>
      <p>Great news — the WiFi hotspot billing system for <strong>${this.escapeHtml(input.tenantName)}</strong> has been fully onboarded and is now live.</p>
      <p>Your router is connected, your first internet package is published, and your starter voucher batch is ready to sell.</p>
      <p style="font-size:16px; font-weight:700; margin-top:24px;">Enjoy your business! 🎉</p>
    `
    const text = `Hi ${input.recipientName},\n\nThe WiFi hotspot billing system for ${input.tenantName} has been fully onboarded and is now live. Your router is connected, your first internet package is published, and your starter voucher batch is ready to sell.\n\nEnjoy your business!\n\n— The AROFi Team`

    return this.sendMail({ to: input.to, subject, html: this.renderLayout(body), text })
  }

  async sendSaleReceiptEmail(input: {
    to: string
    tenantName: string
    recipientName: string
    packageName: string
    channel: 'Mobile Money' | 'Voucher'
    grossAmountUgx: number
    feeAmountUgx: number
    netAmountUgx: number
    customerReference?: string | null
    reference: string
    occurredAt: Date
  }): Promise<boolean> {
    const amount = (value: number) => `UGX ${value.toLocaleString('en-UG')}`
    const subject = `New sale: ${amount(input.grossAmountUgx)} — ${input.packageName}`
    const row = (label: string, value: string) => `
      <tr>
        <td style="padding:6px 0; color:#64748b;">${this.escapeHtml(label)}</td>
        <td style="padding:6px 0; text-align:right; font-weight:600;">${this.escapeHtml(value)}</td>
      </tr>
    `
    const body = `
      <h2 style="color:#2563EB; margin-top:0;">Hi ${this.escapeHtml(input.recipientName)},</h2>
      <p>A new sale was just recorded for <strong>${this.escapeHtml(input.tenantName)}</strong>.</p>
      <table style="width:100%; border-collapse:collapse; margin-top:16px; font-size:14px;">
        ${row('Package', input.packageName)}
        ${row('Channel', input.channel)}
        ${input.customerReference ? row('Customer', input.customerReference) : ''}
        ${row('Gross Amount', amount(input.grossAmountUgx))}
        ${row('Platform Fee', amount(input.feeAmountUgx))}
        ${row('Net to Wallet', amount(input.netAmountUgx))}
        ${row('Reference', input.reference)}
        ${row('Date', input.occurredAt.toLocaleString('en-UG'))}
      </table>
    `
    const text = `New sale for ${input.tenantName}\nPackage: ${input.packageName}\nChannel: ${input.channel}\nGross: ${amount(input.grossAmountUgx)}\nFee: ${amount(input.feeAmountUgx)}\nNet: ${amount(input.netAmountUgx)}\nReference: ${input.reference}\nDate: ${input.occurredAt.toLocaleString('en-UG')}`

    return this.sendMail({ to: input.to, subject, html: this.renderLayout(body), text })
  }

  async sendWithdrawalStatusEmail(input: {
    to: string
    tenantName: string
    recipientName: string
    status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
    amountUgx: number
    reference: string
    reason?: string | null
  }): Promise<boolean> {
    const amount = `UGX ${input.amountUgx.toLocaleString('en-UG')}`
    const statusCopy: Record<typeof input.status, { subject: string; lead: string }> = {
      REQUESTED: { subject: `Withdrawal requested — ${amount}`, lead: 'Your withdrawal request has been submitted and is awaiting review.' },
      APPROVED: { subject: `Withdrawal approved — ${amount}`, lead: 'Your withdrawal request has been approved and will be processed shortly.' },
      REJECTED: { subject: `Withdrawal rejected — ${amount}`, lead: 'Your withdrawal request was rejected.' },
      PROCESSING: { subject: `Withdrawal processing — ${amount}`, lead: 'Your withdrawal is now being sent to your mobile money number.' },
      COMPLETED: { subject: `Withdrawal completed — ${amount}`, lead: 'Your withdrawal has been paid out successfully.' },
      FAILED: { subject: `Withdrawal failed — ${amount}`, lead: 'Your withdrawal could not be completed.' },
    }
    const { subject, lead } = statusCopy[input.status]
    const body = `
      <h2 style="color:#2563EB; margin-top:0;">Hi ${this.escapeHtml(input.recipientName)},</h2>
      <p>${lead}</p>
      <p style="font-size:20px; font-weight:700; margin:20px 0;">${amount}</p>
      <p style="color:#64748b; font-size:13px;">Reference: ${this.escapeHtml(input.reference)}</p>
      ${input.reason ? `<p style="color:#b91c1c; font-size:13px;">Reason: ${this.escapeHtml(input.reason)}</p>` : ''}
      <p style="margin-top:24px;">— ${this.escapeHtml(input.tenantName)} wallet</p>
    `
    const text = `${lead}\n\nAmount: ${amount}\nReference: ${input.reference}${input.reason ? `\nReason: ${input.reason}` : ''}`

    return this.sendMail({ to: input.to, subject, html: this.renderLayout(body), text })
  }

  async sendSubscriptionExpiryReminderEmail(input: {
    to: string
    tenantName: string
    recipientName: string
    plan: 'PRO' | 'ENTERPRISE'
    expiresAt: Date
    daysRemaining: number
  }): Promise<boolean> {
    const subject = `Your AROFi ${input.plan} plan renews in ${input.daysRemaining} day${input.daysRemaining === 1 ? '' : 's'}`
    const body = `
      <h2 style="color:#2563EB; margin-top:0;">Hi ${this.escapeHtml(input.recipientName)},</h2>
      <p>Your <strong>${this.escapeHtml(input.tenantName)}</strong> account is on the <strong>${input.plan}</strong> plan, which renews on <strong>${input.expiresAt.toLocaleDateString('en-UG')}</strong> (${input.daysRemaining} day${input.daysRemaining === 1 ? '' : 's'} from now).</p>
      <p>Pay before then from Settings → Subscription Plan to keep your ${input.plan} commission rate and features without interruption. If your subscription lapses, your account automatically reverts to the Starter (Free) plan and its commission rate.</p>
    `
    const text = `Your ${input.tenantName} account is on the ${input.plan} plan, renewing on ${input.expiresAt.toLocaleDateString('en-UG')} (${input.daysRemaining} day(s) from now). Pay before then from Settings to avoid reverting to the Starter plan.`

    return this.sendMail({ to: input.to, subject, html: this.renderLayout(body), text })
  }

  private renderLayout(bodyHtml: string) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #0f172a;">
        ${bodyHtml}
        <p style="color:#64748b; font-size:13px; margin-top:32px;">— The AROFi Team</p>
      </div>
    `
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (char) => {
      switch (char) {
        case '&': return '&amp;'
        case '<': return '&lt;'
        case '>': return '&gt;'
        case '"': return '&quot;'
        default: return '&#39;'
      }
    })
  }
}
