#!/usr/bin/env python3
"""Apply a small build-time safety fix to the support ticket workspace."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'apps/admin-web/src/components/SupportTicketWorkspace.tsx'
text = PATH.read_text()

old = '''      setNotice(`Ticket ${ticket.reference} submitted`)
      closeCreateTicket()
      await loadData(ticket.id)'''
new = '''      setNotice(`Ticket ${ticket.reference} submitted`)
      setCreateOpen(false)
      setCreateStep(1)
      setCreateCategory('')
      setCreateUrgency('NORMAL')
      await loadData(ticket.id)'''

if new in text:
    print('Support ticket modal fix already applied.')
elif old in text:
    PATH.write_text(text.replace(old, new, 1))
    print('Support ticket modal fix applied.')
else:
    raise RuntimeError('Support ticket success block was not found; refusing an unsafe patch.')
