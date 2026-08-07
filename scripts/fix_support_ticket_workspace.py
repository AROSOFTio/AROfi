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
