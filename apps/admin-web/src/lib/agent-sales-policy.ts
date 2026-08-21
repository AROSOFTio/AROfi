export const AGENT_SALES_POLICY_MARKER = '[[AROFI_AGENT_SALES_POLICY]]'

export type AgentSalesPolicy = {
  cashEnabled: boolean
  mobileMoneyEnabled: boolean
  allowedPackageIds: string[]
}

export const defaultAgentSalesPolicy: AgentSalesPolicy = {
  cashEnabled: true,
  mobileMoneyEnabled: true,
  allowedPackageIds: [],
}

export function parseAgentSalesPolicy(notes?: string | null) {
  if (!notes) return { humanNotes: '', policy: defaultAgentSalesPolicy }
  const index = notes.lastIndexOf(AGENT_SALES_POLICY_MARKER)
  if (index < 0) return { humanNotes: notes.trim(), policy: defaultAgentSalesPolicy }

  const humanNotes = notes.slice(0, index).trim()
  try {
    const parsed = JSON.parse(notes.slice(index + AGENT_SALES_POLICY_MARKER.length).trim()) as Partial<AgentSalesPolicy>
    return {
      humanNotes,
      policy: {
        cashEnabled: parsed.cashEnabled !== false,
        mobileMoneyEnabled: parsed.mobileMoneyEnabled !== false,
        allowedPackageIds: Array.isArray(parsed.allowedPackageIds)
          ? parsed.allowedPackageIds.filter((item): item is string => typeof item === 'string')
          : [],
      },
    }
  } catch {
    return { humanNotes, policy: defaultAgentSalesPolicy }
  }
}

export function encodeAgentSalesPolicy(humanNotes: string, policy: AgentSalesPolicy) {
  const prefix = humanNotes.trim() ? `${humanNotes.trim()}\n` : ''
  return `${prefix}${AGENT_SALES_POLICY_MARKER}${JSON.stringify(policy)}`
}
