-- AlterTable
ALTER TABLE "Router" ADD COLUMN "remotePort" INTEGER,
ADD COLUMN "isRemotePortOpen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "remoteSstpIp" TEXT,
ADD COLUMN "remoteToken" TEXT,
ADD COLUMN "remoteClientName" TEXT DEFAULT 'AROFI_REMOTE',
ADD COLUMN "remoteAccessEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Router_remoteToken_key" ON "Router"("remoteToken");
