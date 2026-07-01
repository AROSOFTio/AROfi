-- AlterTable: add WireGuard key fields to Router for WireGuard-based remote access
-- (replaces SSTP which is device-mode restricted on RouterOS 7 consumer routers)
ALTER TABLE "Router" ADD COLUMN "remoteWgPrivKey" TEXT;
ALTER TABLE "Router" ADD COLUMN "remoteWgPubKey" TEXT;
