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
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #0f172a;">
        <h2 style="color:#2563EB;">Hi ${this.escapeHtml(input.recipientName)},</h2>
        <p>Great news — the WiFi hotspot billing system for <strong>${this.escapeHtml(input.tenantName)}</strong> has been fully onboarded and is now live.</p>
        <p>Your router is connected, your first internet package is published, and your starter voucher batch is ready to sell.</p>
        <p style="font-size:16px; font-weight:700; margin-top:24px;">Enjoy your business! 🎉</p>
        <p style="color:#64748b; font-size:13px; margin-top:32px;">— The AROFi Team</p>
      </div>
    `
    const text = `Hi ${input.recipientName},\n\nThe WiFi hotspot billing system for ${input.tenantName} has been fully onboarded and is now live. Your router is connected, your first internet package is published, and your starter voucher batch is ready to sell.\n\nEnjoy your business!\n\n— The AROFi Team`

    return this.sendMail({ to: input.to, subject, html, text })
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
