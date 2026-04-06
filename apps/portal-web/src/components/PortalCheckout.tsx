'use client'

import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import {
  PortalActivation,
  PortalContextResponse,
  PortalPackage,
  PortalPayment,
  VoucherRedemptionResponse,
} from '../lib/portal-types'

const pendingStatuses = ['INITIATED', 'PENDING', 'INDETERMINATE']

function formatCurrency(value: number) {
  return `UGX ${new Intl.NumberFormat('en-UG').format(value)}`
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'N/A'
  }

  return new Intl.DateTimeFormat('en-UG', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatDuration(minutes: number) {
  if (minutes % 1440 === 0) {
    return `${minutes / 1440} day`
  }

  if (minutes % 60 === 0) {
    return `${minutes / 60} hour`
  }

  return `${minutes} min`
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

export default function PortalCheckout() {
  const [context, setContext] = useState<PortalContextResponse | null>(null)
  const [selectedPackage, setSelectedPackage] = useState<PortalPackage | null>(null)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [customerReference, setCustomerReference] = useState('')
  const [network, setNetwork] = useState<'MTN' | 'AIRTEL'>('MTN')
  const [currentPayment, setCurrentPayment] = useState<PortalPayment | null>(null)
  const [activeActivation, setActiveActivation] = useState<PortalActivation | null>(null)
  const [voucherCode, setVoucherCode] = useState('')
  const [voucherMessage, setVoucherMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isVoucherLoading, setIsVoucherLoading] = useState(false)

  useEffect(() => {
    void loadContext()
  }, [])

  useEffect(() => {
    if (!currentPayment || !pendingStatuses.includes(currentPayment.status)) {
      return
    }

    const interval = window.setInterval(() => {
      void pollPayment(currentPayment.id)
    }, 5000)

    return () => window.clearInterval(interval)
  }, [currentPayment])

  async function loadContext(phone?: string) {
    const params = new URLSearchParams()

    if (phone) {
      params.set('phoneNumber', phone)
    }

    const response = await fetch(`/api/payments/portal/context${params.toString() ? `?${params}` : ''}`, {
      cache: 'no-store',
    })

    if (!response.ok) {
      return
    }

    const data = await readJson<PortalContextResponse>(response)
    setContext(data)
    setSelectedPackage((previous) => {
      if (previous) {
        return data.packages.find((item) => item.id === previous.id) ?? data.packages[0] ?? null
      }

      return data.packages[0] ?? null
    })
    setActiveActivation(data.activeActivation ?? null)
    setCurrentPayment(data.latestPayment ?? null)
  }

  async function pollPayment(paymentId: string) {
    const response = await fetch(`/api/payments/${paymentId}/check-status`, {
      method: 'POST',
    })

    if (!response.ok) {
      return
    }

    const payment = await readJson<PortalPayment>(response)
    setCurrentPayment(payment)

    if (payment.activation) {
      setActiveActivation(payment.activation)
      await loadContext(payment.phoneNumber)
    }
  }

  async function handlePaymentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setVoucherMessage('')

    if (!selectedPackage) {
      setErrorMessage('Please select a package first.')
      return
    }

    if (!phoneNumber.trim()) {
      setErrorMessage('Enter the mobile money number that will approve the payment.')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/payments/portal/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          packageId: selectedPackage.id,
          phoneNumber,
          customerReference: customerReference || phoneNumber,
          network,
          idempotencyKey: crypto.randomUUID(),
        }),
      })

      const body = await response.json().catch(() => ({}))

      if (!response.ok) {
        setErrorMessage(body.message ?? 'Unable to start the payment request.')
        return
      }

      const payment = body as PortalPayment
      setCurrentPayment(payment)

      if (payment.activation) {
        setActiveActivation(payment.activation)
      }

      await loadContext(payment.phoneNumber)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleVoucherRedeem() {
    setErrorMessage('')
    setVoucherMessage('')

    if (!voucherCode.trim()) {
      setErrorMessage('Enter a voucher code to redeem.')
      return
    }

    setIsVoucherLoading(true)

    try {
      const response = await fetch('/api/vouchers/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: voucherCode.trim(),
          customerReference: customerReference || phoneNumber || 'portal-user',
        }),
      })

      const body = await response.json().catch(() => ({}))

      if (!response.ok) {
        setErrorMessage(body.message ?? 'Voucher redemption failed.')
        return
      }

      const redemption = body as VoucherRedemptionResponse
      setVoucherMessage(`Voucher redeemed for ${redemption.redemption.package.name}. Access is being activated now.`)
      setVoucherCode('')

      await loadContext(phoneNumber || undefined)
    } finally {
      setIsVoucherLoading(false)
    }
  }

  return (
    <div className="flex flex-col space-y-5">
      <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-4">
        <div className="text-xs uppercase tracking-[0.2em] text-sky-200">Portal</div>
        <h1 className="mt-2 text-2xl font-semibold text-white">
          {context?.tenant.name ?? 'AROFi Hotspot Access'}
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          Buy a package with Yo! Uganda mobile money or redeem an existing voucher to get online.
        </p>
      </div>

      <div className={`rounded-xl border p-4 ${activeActivation ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/60'}`}>
        <div className="text-xs uppercase tracking-[0.16em] text-slate-400">
          {activeActivation ? 'Connected' : 'Not Connected'}
        </div>
        {activeActivation ? (
          <>
            <h2 className="mt-2 text-lg font-semibold text-emerald-200">{activeActivation.package.name} is active</h2>
            <p className="mt-1 text-sm text-slate-300">
              Access phone: {activeActivation.accessPhoneNumber ?? 'N/A'} . Ends {formatDate(activeActivation.endsAt)}.
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-300">
            Select a package below, send the payment prompt to your phone, and we will activate access automatically.
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Available Packages</h3>
          <span className="text-xs text-slate-500">{context?.packages.length ?? 0} available</span>
        </div>

        <div className="grid gap-3">
          {(context?.packages ?? []).length === 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">
              No active packages are published for this portal yet.
            </div>
          )}
          {(context?.packages ?? []).map((pkg) => (
            <button
              key={pkg.id}
              type="button"
              onClick={() => setSelectedPackage(pkg)}
              className={`rounded-xl border p-4 text-left transition ${
                selectedPackage?.id === pkg.id
                  ? 'border-sky-400 bg-sky-500/10'
                  : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-white">{pkg.name}</span>
                    {pkg.isFeatured && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200">
                        Popular
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatDuration(pkg.durationMinutes)}
                    {pkg.dataLimitMb ? ` . ${pkg.dataLimitMb} MB` : ' . Unlimited data'}
                    {pkg.deviceLimit ? ` . ${pkg.deviceLimit} device(s)` : ''}
                  </p>
                  {pkg.description && <p className="mt-2 text-sm text-slate-300">{pkg.description}</p>}
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-sky-300">{formatCurrency(pkg.amountUgx)}</div>
                  <div className="mt-1 text-xs text-slate-500">{pkg.code}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handlePaymentSubmit} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Mobile Money Checkout</h3>
          {selectedPackage && <span className="text-xs text-slate-500">{selectedPackage.name}</span>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-2 text-sm text-slate-300">
            <span>Phone Number</span>
            <input
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="0772000000 or 256772000000"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-sky-400"
            />
          </label>

          <label className="space-y-2 text-sm text-slate-300">
            <span>Customer Reference</span>
            <input
              value={customerReference}
              onChange={(event) => setCustomerReference(event.target.value)}
              placeholder="Phone, room, table, or user name"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-sky-400"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-2 text-sm text-slate-300">
            <span>Network</span>
            <select
              value={network}
              onChange={(event) => setNetwork(event.target.value as 'MTN' | 'AIRTEL')}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-sky-400"
            >
              <option value="MTN">MTN Mobile Money</option>
              <option value="AIRTEL">Airtel Money</option>
            </select>
          </label>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Selected Amount</div>
            <div className="mt-2 text-2xl font-bold text-white">
              {formatCurrency(selectedPackage?.amountUgx ?? 0)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {selectedPackage ? `${formatDuration(selectedPackage.durationMinutes)} access` : 'Choose a package'}
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading || !selectedPackage}
          className="w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700"
        >
          {isLoading ? 'Sending Payment Prompt...' : 'Pay with Mobile Money'}
        </button>
      </form>

      {currentPayment && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Latest Payment</div>
              <h3 className="mt-2 text-lg font-semibold text-white">{currentPayment.package.name}</h3>
              <p className="mt-1 text-sm text-slate-300">
                {currentPayment.phoneNumber} . {currentPayment.network} . {formatCurrency(currentPayment.amountUgx)}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
                currentPayment.status === 'COMPLETED'
                  ? 'bg-emerald-500/15 text-emerald-200'
                  : currentPayment.status === 'FAILED'
                    ? 'bg-rose-500/15 text-rose-200'
                    : 'bg-amber-500/15 text-amber-100'
              }`}
            >
              {currentPayment.status}
            </span>
          </div>

          <div className="mt-3 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
            <div>External Ref: <span className="font-mono text-xs text-slate-400">{currentPayment.externalReference}</span></div>
            <div>Provider Ref: <span className="font-mono text-xs text-slate-400">{currentPayment.providerReference ?? 'Pending'}</span></div>
            <div>Provider Status: {currentPayment.providerStatus ?? currentPayment.status}</div>
            <div>Last Update: {formatDate(currentPayment.completedAt ?? currentPayment.createdAt)}</div>
          </div>

          {currentPayment.statusMessage && (
            <p className="mt-3 text-sm text-slate-400">{currentPayment.statusMessage}</p>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Voucher Redemption</h3>
          <span className="text-xs text-slate-500">Already bought a code?</span>
        </div>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            value={voucherCode}
            onChange={(event) => setVoucherCode(event.target.value)}
            placeholder="Enter voucher code"
            className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-sky-400"
          />
          <button
            type="button"
            onClick={() => void handleVoucherRedeem()}
            disabled={isVoucherLoading}
            className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-200"
          >
            {isVoucherLoading ? 'Redeeming...' : 'Redeem Voucher'}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {errorMessage}
        </div>
      )}

      {voucherMessage && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {voucherMessage}
        </div>
      )}
    </div>
  )
}
