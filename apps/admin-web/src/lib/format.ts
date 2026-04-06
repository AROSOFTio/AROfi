export function formatCurrency(value: number | null | undefined) {
  return `UGX ${new Intl.NumberFormat('en-US').format(value ?? 0)}`
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) {
    return 'N/A'
  }

  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('en-UG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes} min`
  }

  if (minutes % 1440 === 0) {
    return `${minutes / 1440} day`
  }

  if (minutes % 60 === 0) {
    return `${minutes / 60} hr`
  }

  return `${minutes} min`
}

export function getStatusBadgeClass(status: string) {
  switch (status) {
    case 'ACTIVE':
    case 'COMPLETED':
    case 'CREDIT':
    case 'GENERATED':
    case 'success':
      return 'badge badge-success'
    case 'PENDING':
    case 'DEBIT':
    case 'SOLD':
    case 'pending':
      return 'badge badge-warning'
    case 'REDEEMED':
      return 'badge badge-info'
    case 'ARCHIVED':
    case 'FAILED':
    case 'REVERSED':
    case 'VOID':
    case 'failed':
      return 'badge badge-danger'
    default:
      return 'badge badge-info'
  }
}

export function formatTransactionType(type: string) {
  return type
    .toLowerCase()
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}
