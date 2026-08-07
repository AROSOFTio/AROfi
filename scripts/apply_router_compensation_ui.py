#!/usr/bin/env python3
"""Replace the large router compensation block with the compact review panel."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'apps/admin-web/src/components/RoutersManager.tsx'
text = PATH.read_text()

if "<RouterCompensationPanel routerId={selectedSetup.router.id}" in text:
    print('Router compensation UI patch already applied.')
    raise SystemExit(0)

text = text.replace(
    "  RouterCompensationOverview,\n",
    "",
    1,
)
text = text.replace(
    "import FormProcessStatus from '@/components/FormProcessStatus'",
    "import FormProcessStatus from '@/components/FormProcessStatus'\nimport RouterCompensationPanel from '@/components/RouterCompensationPanel'",
    1,
)
text = text.replace(
    "  const [compensationOverview, setCompensationOverview] = useState<RouterCompensationOverview | null>(null)\n",
    "",
    1,
)

old_duration = '''function formatSecondsDuration(seconds?: number | null) {
  if (!seconds || seconds <= 0) return '0 min'
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return `${hours} hr${hours === 1 ? '' : 's'}${remainder ? ` ${remainder} min` : ''}`
}

'''
text = text.replace(old_duration, '', 1)

old_load = '''  async function loadSetup(routerId: string) {
    try {
      setLoadingSetup(true)
      setError(null)
      const [setup, compensation] = await Promise.all([
        clientFetchApi<RouterSetupResponse>(`/routers/${routerId}/setup`),
        clientFetchApi<RouterCompensationOverview>(`/routers/${routerId}/compensation`).catch(() => null),
      ])
      setSelectedSetup(setup)
      setCompensationOverview(compensation)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load router setup')
    } finally {
      setLoadingSetup(false)
    }
  }
'''
new_load = '''  async function loadSetup(routerId: string) {
    try {
      setLoadingSetup(true)
      setError(null)
      const setup = await clientFetchApi<RouterSetupResponse>(`/routers/${routerId}/setup`)
      setSelectedSetup(setup)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load router setup')
    } finally {
      setLoadingSetup(false)
    }
  }
'''
if text.count(old_load) != 1:
    raise RuntimeError('Could not find the existing loadSetup compensation block.')
text = text.replace(old_load, new_load, 1)

old_handlers = '''  async function handleToggleAutoCompensation(enabled: boolean) {
    try {
      setError(null)
      setSuccess(null)
      const settings = await clientPostApi<{ autoCompensateRouterOutages: boolean }>('/routers/compensation/settings', { enabled })
      setCompensationOverview((previous) => previous
        ? { ...previous, settings }
        : { settings, outages: [], compensations: [] })
      setSuccess(enabled ? 'Automatic outage compensation is enabled.' : 'Automatic outage compensation is disabled.')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update compensation setting')
    }
  }

  async function handleManualCompensation() {
    if (!selectedSetup?.router.id) return
    try {
      setError(null)
      setSuccess(null)
      await clientPostApi(`/routers/${selectedSetup.router.id}/compensation/manual`, {})
      setSuccess('Latest resolved outage was compensated.')
      await loadSetup(selectedSetup.router.id)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to compensate latest outage')
    }
  }

'''
if text.count(old_handlers) != 1:
    raise RuntimeError('Could not find the old compensation handlers.')
text = text.replace(old_handlers, '', 1)

start = '''      {activeRouterView === 'overview' && selectedSetup?.router && (
        <div className="card" style={{ marginBottom: 18 }}>'''
end = '''      {groupModalOpen && ('''
start_index = text.find(start)
if start_index < 0:
    raise RuntimeError('Could not find the old compensation card start.')
end_index = text.find(end, start_index)
if end_index < 0:
    raise RuntimeError('Could not find the compensation card end marker.')
replacement = '''      {activeRouterView === 'overview' && selectedSetup?.router && (
        <RouterCompensationPanel routerId={selectedSetup.router.id} />
      )}

'''
text = text[:start_index] + replacement + text[end_index:]

for obsolete in [
    'compensationOverview',
    'handleToggleAutoCompensation',
    'handleManualCompensation',
    'formatSecondsDuration',
]:
    if obsolete in text:
        raise RuntimeError(f'Obsolete compensation UI symbol remains: {obsolete}')

PATH.write_text(text)
print('Compact selective router compensation UI applied.')
