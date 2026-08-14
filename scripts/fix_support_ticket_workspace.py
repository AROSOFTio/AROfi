#!/usr/bin/env python3
"""Apply guarded build-time safety fixes to the support ticket workspace."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'apps/admin-web/src/components/SupportTicketWorkspace.tsx'
text = PATH.read_text()
changed = False

# closeCreateTicket() refuses to close while submitting=true. On a successful
# async create, close the modal directly and reset only its controlled state.
old_create = '''      setNotice(`Ticket ${ticket.reference} submitted`)
      closeCreateTicket()
      await loadData(ticket.id)'''
new_create = '''      setNotice(`Ticket ${ticket.reference} submitted`)
      setCreateOpen(false)
      setCreateStep(1)
      setCreateCategory('')
      setCreateUrgency('NORMAL')
      await loadData(ticket.id)'''

if old_create in text:
    text = text.replace(old_create, new_create, 1)
    changed = True
elif new_create not in text:
    raise RuntimeError('Support ticket success block was not found; refusing an unsafe patch.')

# React form events must not be dereferenced after awaited requests. The reply
# modal unmounts when it closes, so resetting the stale event target is both
# unnecessary and the source of the reported currentTarget/null crash.
old_reply = '''      setNotice('Reply sent')
      event.currentTarget.reset()
      await loadData(selectedTicket.id)
      setReplyOpen(false)'''
new_reply = '''      setNotice('Reply sent')
      await loadData(selectedTicket.id)
      setReplyOpen(false)'''

if old_reply in text:
    text = text.replace(old_reply, new_reply, 1)
    changed = True
elif new_reply not in text:
    raise RuntimeError('Support ticket reply block was not found; refusing an unsafe patch.')

if changed:
    PATH.write_text(text)
    print('Support ticket modal and reply safety fixes applied.')
else:
    print('Support ticket modal and reply safety fixes already applied.')

# ---------------------------------------------------------------------------
# Support Floor V2 — keep routing codes internal. Customers only need human
# issue names. Also expose whether the support mailbox notification succeeded
# instead of claiming mail was delivered when SMTP returned false.
# ---------------------------------------------------------------------------
V2_PATH = ROOT / 'apps/admin-web/src/components/SupportTicketWorkspaceV2.tsx'
if V2_PATH.exists():
    v2 = V2_PATH.read_text()
    v2_changed = False

    old_ticket_type = '''  updatedAt: string
  tenant?: { id: string; name: string } | null'''
    new_ticket_type = '''  updatedAt: string
  emailNotificationSent?: boolean
  tenant?: { id: string; name: string } | null'''
    if old_ticket_type in v2:
        v2 = v2.replace(old_ticket_type, new_ticket_type, 1)
        v2_changed = True
    elif new_ticket_type not in v2:
        raise RuntimeError('Support Floor V2 ticket type anchor was not found; refusing an unsafe patch.')

    old_option = '''{group.issues.map((issue) => <option key={issue.code} value={issue.code}>{issue.code} — {issue.label}</option>)}'''
    new_option = '''{group.issues.map((issue) => <option key={issue.code} value={issue.code}>{issue.label}</option>)}'''
    if old_option in v2:
        v2 = v2.replace(old_option, new_option, 1)
        v2_changed = True
    elif new_option not in v2:
        raise RuntimeError('Support Floor V2 issue option markup was not found; refusing an unsafe patch.')

    old_help = 'Choose the closest coded issue so it reaches the right support team faster.'
    new_help = 'Choose the issue that best matches your problem so it reaches the right support team faster.'
    if old_help in v2:
        v2 = v2.replace(old_help, new_help, 1)
        v2_changed = True
    elif new_help not in v2:
        raise RuntimeError('Support Floor V2 issue helper text was not found; refusing an unsafe patch.')

    old_subject = '''        subject: `${createIssueCode} - ${issueName}`,
        category: `${createIssueCode} · ${issueName}`,'''
    new_subject = '''        subject: issueName,
        category: issueName,'''
    if old_subject in v2:
        v2 = v2.replace(old_subject, new_subject, 1)
        v2_changed = True
    elif new_subject not in v2:
        raise RuntimeError('Support Floor V2 ticket subject/category block was not found; refusing an unsafe patch.')

    old_notice = '''      setNotice(`Ticket ${ticket.reference} submitted. AROFi Support has been notified.`)'''
    new_notice = '''      setNotice(
        ticket.emailNotificationSent === false
          ? `Ticket ${ticket.reference} submitted. It is visible to AROFi Support, but the mailbox notification could not be delivered.`
          : `Ticket ${ticket.reference} submitted. support@arofi.net has been notified.`,
      )'''
    if old_notice in v2:
        v2 = v2.replace(old_notice, new_notice, 1)
        v2_changed = True
    elif new_notice not in v2:
        raise RuntimeError('Support Floor V2 success notice was not found; refusing an unsafe patch.')

    if v2_changed:
        V2_PATH.write_text(v2)
        print('Support Floor V2 issue labels and notification feedback updated.')
    else:
        print('Support Floor V2 issue labels and notification feedback already updated.')

# ---------------------------------------------------------------------------
# Support Floor mail — support tickets have one operational destination:
# support@arofi.net. Do not let a stale SUPPORT_EMAIL environment variable send
# customer tickets somewhere else. MailService already records SMTP failures.
# Return the send result to the UI so a failed mailbox notification is visible.
# ---------------------------------------------------------------------------
SERVICE_PATH = ROOT / 'apps/api/src/modules/system/support-floor.service.ts'
if SERVICE_PATH.exists():
    service = SERVICE_PATH.read_text()
    service_changed = False

    old_address = '''  private supportAddress() {
    return process.env.SUPPORT_EMAIL?.trim() || 'support@arofi.net'
  }'''
    new_address = '''  private supportAddress() {
    return 'support@arofi.net'
  }'''
    if old_address in service:
        service = service.replace(old_address, new_address, 1)
        service_changed = True
    elif new_address not in service:
        raise RuntimeError('Support Floor supportAddress() block was not found; refusing an unsafe patch.')

    old_create_mail = '''    const detailed = await this.getDetailedTicket(ticket.id, tenantId)
    await this.notifySupportNewTicket(detailed, dto.body.trim()).catch(() => undefined)
    return detailed'''
    new_create_mail = '''    const detailed = await this.getDetailedTicket(ticket.id, tenantId)
    const emailNotificationSent = await this.notifySupportNewTicket(detailed, dto.body.trim()).catch(() => false)
    return { ...detailed, emailNotificationSent }'''
    if old_create_mail in service:
        service = service.replace(old_create_mail, new_create_mail, 1)
        service_changed = True
    elif new_create_mail not in service:
        raise RuntimeError('Support Floor create-ticket mail block was not found; refusing an unsafe patch.')

    old_new_ticket_method = '''  private async notifySupportNewTicket(ticket: any, body: string) {
    await this.mailService.sendMail({'''
    new_new_ticket_method = '''  private async notifySupportNewTicket(ticket: any, body: string) {
    return this.mailService.sendMail({'''
    if old_new_ticket_method in service:
        service = service.replace(old_new_ticket_method, new_new_ticket_method, 1)
        service_changed = True
    elif new_new_ticket_method not in service:
        raise RuntimeError('Support Floor new-ticket mail method was not found; refusing an unsafe patch.')

    old_customer_reply_method = '''  private async notifySupportCustomerReply(ticket: any, body: string) {
    await this.mailService.sendMail({'''
    new_customer_reply_method = '''  private async notifySupportCustomerReply(ticket: any, body: string) {
    return this.mailService.sendMail({'''
    if old_customer_reply_method in service:
        service = service.replace(old_customer_reply_method, new_customer_reply_method, 1)
        service_changed = True
    elif new_customer_reply_method not in service:
        raise RuntimeError('Support Floor customer-reply mail method was not found; refusing an unsafe patch.')

    if service_changed:
        SERVICE_PATH.write_text(service)
        print('Support Floor mail now targets support@arofi.net and reports delivery status.')
    else:
        print('Support Floor mail routing already updated.')

# ---------------------------------------------------------------------------
# Developer Admin Team & Roles — do not server-render the page from a nullable
# /platform-staff response. A temporary backend/network non-200 used to pass
# null into PlatformStaffManager and crash the entire page. Let the authenticated
# browser client load/retry the directory instead.
# ---------------------------------------------------------------------------
USERS_PAGE = ROOT / 'apps/admin-web/src/app/(dashboard)/users/page.tsx'
if USERS_PAGE.exists():
    users_page = USERS_PAGE.read_text()
    users_changed = False

    old_platform_block = '''  if (session?.user.permissions.includes('ALL')) {
    const staff = await fetchApi<PlatformStaffResponse>('/platform-staff')
    return <PlatformStaffManager initialData={staff} />
  }'''
    new_platform_block = '''  if (session?.user.permissions.includes('ALL')) {
    return <PlatformStaffManager initialData={null} />
  }'''
    if old_platform_block in users_page:
        users_page = users_page.replace(old_platform_block, new_platform_block, 1)
        users_changed = True
    elif new_platform_block not in users_page:
        raise RuntimeError('Developer Admin users page platform block was not found; refusing an unsafe patch.')

    old_import = '''import PlatformStaffManager, { type PlatformStaffResponse } from '@/components/PlatformStaffManager'\n'''
    new_import = '''import PlatformStaffManager from '@/components/PlatformStaffManager'\n'''
    if old_import in users_page:
        users_page = users_page.replace(old_import, new_import, 1)
        users_changed = True
    elif new_import not in users_page:
        raise RuntimeError('Developer Admin users page PlatformStaffManager import was not found; refusing an unsafe patch.')

    if users_changed:
        USERS_PAGE.write_text(users_page)
        print('Developer Admin Team & Roles page switched to resilient client loading.')
    else:
        print('Developer Admin Team & Roles page already uses resilient client loading.')

STAFF_MANAGER = ROOT / 'apps/admin-web/src/components/PlatformStaffManager.tsx'
if STAFF_MANAGER.exists():
    manager = STAFF_MANAGER.read_text()
    manager_changed = False

    old_react_import = "import { FormEvent, useMemo, useState } from 'react'"
    new_react_import = "import { FormEvent, useEffect, useMemo, useState } from 'react'"
    if old_react_import in manager:
        manager = manager.replace(old_react_import, new_react_import, 1)
        manager_changed = True
    elif new_react_import not in manager:
        raise RuntimeError('PlatformStaffManager React import was not found; refusing an unsafe patch.')

    old_signature = '''export default function PlatformStaffManager({ initialData }: { initialData: PlatformStaffResponse }) {
  const [data, setData] = useState(initialData)'''
    new_signature = '''export default function PlatformStaffManager({ initialData }: { initialData: PlatformStaffResponse | null }) {
  const [data, setData] = useState<PlatformStaffResponse>(initialData ?? { roles: [], users: [] })'''
    if old_signature in manager:
        manager = manager.replace(old_signature, new_signature, 1)
        manager_changed = True
    elif new_signature not in manager:
        raise RuntimeError('PlatformStaffManager signature was not found; refusing an unsafe patch.')

    old_refresh = '''  async function refresh() { setData(await clientFetchApi<PlatformStaffResponse>('/platform-staff')) }
'''
    new_refresh = '''  async function refresh() {
    try {
      const next = await clientFetchApi<PlatformStaffResponse>('/platform-staff')
      setData(next)
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load AROFi staff directory')
    }
  }

  useEffect(() => {
    void refresh()
    // The first browser load intentionally replaces nullable SSR data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
'''
    if old_refresh in manager:
        manager = manager.replace(old_refresh, new_refresh, 1)
        manager_changed = True
    elif new_refresh not in manager:
        raise RuntimeError('PlatformStaffManager refresh function was not found; refusing an unsafe patch.')

    if manager_changed:
        STAFF_MANAGER.write_text(manager)
        print('PlatformStaffManager now loads safely and reports API errors instead of crashing.')
    else:
        print('PlatformStaffManager resilient loading already applied.')

# ---------------------------------------------------------------------------
# Shared dashboard modal viewport safety.
# Several historical mobile rules conflict: one caps a bottom-sheet modal at
# 92dvh, while a later <=640px rule forces min-height:100dvh and max-height:none.
# On real phones (browser chrome, notches, soft keyboard) that can push the card
# beyond the visible canvas and make the Close control unreachable. Append one
# final, deliberately high-specificity override so all dashboard modals remain
# inside the visual viewport, scroll internally, and keep Close sticky.
# ---------------------------------------------------------------------------
GLOBAL_CSS = ROOT / 'apps/admin-web/src/app/globals.css'
MODAL_SAFETY_MARKER = '/* AROFi mobile modal viewport safety — guarded build patch */'
if GLOBAL_CSS.exists():
    css = GLOBAL_CSS.read_text()
    if MODAL_SAFETY_MARKER not in css:
        css += '''

/* AROFi mobile modal viewport safety — guarded build patch */
@media (max-width: 768px) {
  html,
  body {
    max-width: 100%;
    overflow-x: hidden;
  }

  .modal-overlay {
    box-sizing: border-box !important;
    width: 100vw !important;
    height: 100dvh !important;
    min-height: 100dvh !important;
    padding: max(8px, env(safe-area-inset-top)) 0 0 !important;
    align-items: end !important;
    justify-items: stretch !important;
    overflow: hidden !important;
    overscroll-behavior: contain;
  }

  .modal-card,
  .modal-card.compact,
  .modal-card.wide {
    box-sizing: border-box !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    min-height: 0 !important;
    max-height: calc(100dvh - 8px - env(safe-area-inset-top)) !important;
    margin: 0 !important;
    padding: 14px 14px max(18px, env(safe-area-inset-bottom)) !important;
    border-radius: 18px 18px 0 0 !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }

  .modal-close {
    position: sticky !important;
    top: 0 !important;
    right: auto !important;
    z-index: 30 !important;
    display: block !important;
    width: max-content !important;
    min-height: 40px;
    margin: 0 0 6px auto !important;
    padding: 8px 12px !important;
    border: 1px solid var(--border) !important;
    border-radius: 9px !important;
    background: var(--bg-card) !important;
    color: var(--text-1) !important;
    box-shadow: var(--shadow-sm);
  }

  .modal-card form,
  .modal-card label,
  .modal-card fieldset,
  .modal-card .form-input,
  .modal-card input,
  .modal-card select,
  .modal-card textarea {
    min-width: 0 !important;
    max-width: 100% !important;
  }

  .modal-card select.form-input,
  .modal-card input.form-input,
  .modal-card textarea.form-input {
    width: 100% !important;
  }
}
'''
        GLOBAL_CSS.write_text(css)
        print('Mobile modal viewport safety override appended.')
    else:
        print('Mobile modal viewport safety override already applied.')
