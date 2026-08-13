'use client'

import { useState } from 'react'
import type { AdminSessionResponse, RouterItem } from '@/lib/admin-types'
import OnboardingWizard from './OnboardingWizard'

type VendorOnboardingTourProps = {
  session: AdminSessionResponse
  initialRouter: RouterItem | null
  initialHasPackage: boolean
  initialHasVouchers: boolean
}

export default function VendorOnboardingTour({
  session,
  initialRouter,
  initialHasPackage,
  initialHasVouchers,
}: VendorOnboardingTourProps) {
  const [complete, setComplete] = useState(false)
  const initialHasRouter = Boolean(initialRouter)

  // Router onboarding ends after the customer has the scripts needed to
  // connect their MikroTik. Packages and vouchers are optional Sell Internet
  // tasks, never prerequisites for leaving the dashboard tour.
  if (complete || (initialHasRouter && (initialRouter?.provisioningCallbackReceived || initialRouter?.onboardingStatus === 'VERIFIED_ONLINE'))) {
    return null
  }

  return (
    <OnboardingWizard
      session={session}
      initialHasRouter={initialHasRouter}
      initialRouter={initialRouter}
      initialHasPackage={initialHasPackage}
      initialHasVouchers={initialHasVouchers}
      onComplete={() => setComplete(true)}
    />
  )
}
