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

  if (complete || (initialHasRouter && initialHasPackage && initialHasVouchers)) {
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
