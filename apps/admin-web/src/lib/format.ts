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

export function formatSessionTime(totalSeconds: number | null | undefined) {
  const seconds = totalSeconds ?? 0

  if (seconds < 60) {
    return `${seconds}s`
  }

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes} min`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes === 0 ? `${hours} hr` : `${hours} hr ${remainingMinutes} min`
}

export function formatMegabytes(value: number | null | undefined) {
  const megabytes = value ?? 0

  if (megabytes >= 1024) {
    return `${(megabytes / 1024).toFixed(2)} GB`
  }

  return `${megabytes.toFixed(2)} MB`
}

export function formatLatency(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'N/A'
  }

  return `${value} ms`
}

export function formatBasisPoints(value: number | null | undefined) {
  const basisPoints = value ?? 0
  const percentage = basisPoints / 100
  return Number.isInteger(percentage) ? `${percentage}%` : `${percentage.toFixed(2)}%`
}

export function getStatusBadgeClass(status: string) {
  switch (status) {
    case 'ACTIVE':
    case 'COMPLETED':
    case 'CREDIT':
    case 'GENERATED':
    case 'accepted':
    case 'success':
      return 'badge badge-success'
    case 'PENDING':
    case 'READY':
    case 'PROCESSING':
    case 'INITIATED':
    case 'INDETERMINATE':
    case 'WARNING':
    case 'HIGH':
    case 'DEBIT':
    case 'SOLD':
    case 'SUSPENDED':
    case 'pending':
      return 'badge badge-warning'
    case 'REDEEMED':
      return 'badge badge-info'
    case 'ARCHIVED':
    case 'DISABLED':
    case 'EXCEEDED':
    case 'BLOCKED':
    case 'CRITICAL':
    case 'FAILED':
    case 'REVERSED':
    case 'CANCELLED':
    case 'EXPIRED':
    case 'VOID':
    case 'rejected':
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
