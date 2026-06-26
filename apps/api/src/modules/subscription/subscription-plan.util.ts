import { SubscriptionPlanTier } from '@prisma/client'

// A tenant may still have PRO/ENTERPRISE stored as their plan after a missed
// renewal. Every consumer of "what plan is this tenant on" (fee engine, router
// limits, analytics window, support ticket priority, ...) must resolve the
// plan through here so a lapsed subscription falls back to FREE everywhere,
// instead of each call site re-implementing its own expiry check and risking drift.
export function resolveEffectiveSubscriptionTier(
  subscriptionPlan: SubscriptionPlanTier,
  subscriptionPlanExpiresAt: Date | null,
): SubscriptionPlanTier {
  if (subscriptionPlan === SubscriptionPlanTier.FREE) {
    return SubscriptionPlanTier.FREE
  }

  if (subscriptionPlanExpiresAt && subscriptionPlanExpiresAt.getTime() > Date.now()) {
    return subscriptionPlan
  }

  return SubscriptionPlanTier.FREE
}
