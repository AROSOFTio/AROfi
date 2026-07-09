-- In-app notifications from Dev Admin to businesses, with file attachments.
-- Deliberately no browser push — this is an in-app inbox only.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationAudience') THEN
    CREATE TYPE "NotificationAudience" AS ENUM ('ALL_BUSINESSES', 'SINGLE_BUSINESS');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Notification" (
  "id"          TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "body"        TEXT NOT NULL,
  "audience"    "NotificationAudience" NOT NULL DEFAULT 'SINGLE_BUSINESS',
  "tenantId"    TEXT,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NotificationAttachment" (
  "id"             TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "fileName"       TEXT NOT NULL,
  "mimeType"       TEXT NOT NULL,
  "fileSize"       INTEGER NOT NULL,
  "fileData"       BYTEA NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NotificationAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NotificationRead" (
  "id"             TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "readAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NotificationRead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Notification_tenantId_createdAt_idx" ON "Notification"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_audience_createdAt_idx" ON "Notification"("audience", "createdAt");
CREATE INDEX IF NOT EXISTS "NotificationAttachment_notificationId_idx" ON "NotificationAttachment"("notificationId");
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationRead_notificationId_userId_key" ON "NotificationRead"("notificationId", "userId");
CREATE INDEX IF NOT EXISTS "NotificationRead_userId_readAt_idx" ON "NotificationRead"("userId", "readAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Notification_tenantId_fkey'
  ) THEN
    ALTER TABLE "Notification"
      ADD CONSTRAINT "Notification_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Notification_createdById_fkey'
  ) THEN
    ALTER TABLE "Notification"
      ADD CONSTRAINT "Notification_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'NotificationAttachment_notificationId_fkey'
  ) THEN
    ALTER TABLE "NotificationAttachment"
      ADD CONSTRAINT "NotificationAttachment_notificationId_fkey"
      FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'NotificationRead_notificationId_fkey'
  ) THEN
    ALTER TABLE "NotificationRead"
      ADD CONSTRAINT "NotificationRead_notificationId_fkey"
      FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'NotificationRead_userId_fkey'
  ) THEN
    ALTER TABLE "NotificationRead"
      ADD CONSTRAINT "NotificationRead_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
