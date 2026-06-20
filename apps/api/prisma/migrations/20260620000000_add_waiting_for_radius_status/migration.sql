-- Add WAITING_FOR_RADIUS to RouterOnboardingStatus enum
-- This status is set when the router has sent a heartbeat but no RADIUS packet has been seen yet.
ALTER TYPE "RouterOnboardingStatus" ADD VALUE IF NOT EXISTS 'WAITING_FOR_RADIUS' AFTER 'WAITING_FOR_ROUTER';
