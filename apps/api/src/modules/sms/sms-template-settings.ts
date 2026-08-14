export type SmsTemplateConfig = {
  enabled: boolean
  body: string
}

export type SmsNotificationTemplates = {
  welcomeTenant: SmsTemplateConfig
  adminSignupAlert: SmsTemplateConfig
  adminRouterOnboardingSuccess: SmsTemplateConfig
}

export const DEFAULT_SMS_NOTIFICATION_TEMPLATES: SmsNotificationTemplates = {
  welcomeTenant: {
    enabled: false,
    body: "Welcome to AROFi, {{firstName}}. Your business workspace '{{tenantName}}' is ready. Log in at https://arofi.net to set up your router.",
  },
  adminSignupAlert: {
    enabled: true,
    body: 'AROFi New Registration!\nBusiness: {{tenantName}}\nOwner: {{ownerName}}\nPhone: {{supportPhone}}\nEmail: {{email}}\nDomain: {{domain}}\nType: {{accountType}}',
  },
  adminRouterOnboardingSuccess: {
    enabled: true,
    body: 'AROFi router script OK\nBusiness: {{tenantName}}\nRouter: {{routerName}}\nLocation: {{location}}\nNAS: {{nasIp}}\nHost: {{host}}\nMode: {{mode}}\nScript: {{scriptUrl}}{{warningLine}}',
  },
}

const TEMPLATE_KEYS = Object.keys(DEFAULT_SMS_NOTIFICATION_TEMPLATES) as Array<keyof SmsNotificationTemplates>

export function normalizeSmsNotificationTemplates(value: unknown): SmsNotificationTemplates {
  const source = isRecord(value) ? value : {}
  return TEMPLATE_KEYS.reduce((settings, key) => {
    const incoming = isRecord(source[key]) ? source[key] : {}
    const fallback = DEFAULT_SMS_NOTIFICATION_TEMPLATES[key]
    settings[key] = {
      enabled: typeof incoming.enabled === 'boolean' ? incoming.enabled : fallback.enabled,
      body: typeof incoming.body === 'string' && incoming.body.trim() ? incoming.body.trim().slice(0, 1000) : fallback.body,
    }
    return settings
  }, {} as SmsNotificationTemplates)
}

export function renderSmsTemplate(template: string, variables: Record<string, string | number | null | undefined>) {
  return template
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => String(variables[key] ?? ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 480)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
