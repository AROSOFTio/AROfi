'use client'

import type { AdminSessionResponse, RouterItem } from '@/lib/admin-types'

type VendorOnboardingTourProps = {
  session: AdminSessionResponse
  initialRouter: RouterItem | null
  initialHasPackage: boolean
  initialHasVouchers: boolean
}

export default function VendorOnboardingTour({
  session: _session,
  initialRouter: _initialRouter,
  initialHasPackage: _initialHasPackage,
  initialHasVouchers: _initialHasVouchers,
}: VendorOnboardingTourProps) {
  // Setup must never block a new business from using its dashboard. The
  // lightweight, click-through guide lives in RouterOnboardingNudge; router
  // registration and its generated script remain available from Network.
  return null
}
