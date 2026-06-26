DO $$ BEGIN
  CREATE TYPE "ChatMessageSender" AS ENUM ('VISITOR', 'ADMIN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TYPE "SupportTicketChannel" ADD VALUE IF NOT EXISTS 'CHAT';

CREATE TABLE IF NOT EXISTS "ChatSession" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "supportTicketId" TEXT,
  "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatSession_sessionId_key" ON "ChatSession"("sessionId");
CREATE UNIQUE INDEX IF NOT EXISTS "ChatSession_code_key" ON "ChatSession"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "ChatSession_supportTicketId_key" ON "ChatSession"("supportTicketId");
CREATE INDEX IF NOT EXISTS "ChatSession_lastActiveAt_idx" ON "ChatSession"("lastActiveAt");

DO $$ BEGIN
  ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_supportTicketId_fkey"
    FOREIGN KEY ("supportTicketId") REFERENCES "SupportTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ChatMessage" (
  "id" TEXT NOT NULL,
  "chatSessionId" TEXT NOT NULL,
  "sender" "ChatMessageSender" NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ChatMessage_chatSessionId_createdAt_idx" ON "ChatMessage"("chatSessionId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_chatSessionId_fkey"
    FOREIGN KEY ("chatSessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
