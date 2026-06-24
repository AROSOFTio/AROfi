import { IsIn } from 'class-validator'

export const SUBSCRIPTION_PLAN_KEYS = ['FREE', 'PRO', 'ENTERPRISE'] as const
export type SubscriptionPlanKey = (typeof SUBSCRIPTION_PLAN_KEYS)[number]

export class SelectPlanDto {
  @IsIn(SUBSCRIPTION_PLAN_KEYS)
  plan!: SubscriptionPlanKey
}
