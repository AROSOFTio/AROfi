DO $$ BEGIN
  CREATE TYPE "BlogPostStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "BlogPost" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "excerpt" TEXT,
  "contentHtml" TEXT NOT NULL,
  "status" "BlogPostStatus" NOT NULL DEFAULT 'DRAFT',
  "metaTitle" TEXT,
  "metaDescription" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "coverImageId" TEXT,
  "authorId" TEXT,
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BlogImage" (
  "id" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "fileData" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "inlinePostId" TEXT,
  CONSTRAINT "BlogImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BlogPost_slug_key" ON "BlogPost"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "BlogPost_coverImageId_key" ON "BlogPost"("coverImageId");
CREATE INDEX IF NOT EXISTS "BlogPost_status_publishedAt_idx" ON "BlogPost"("status", "publishedAt");
CREATE INDEX IF NOT EXISTS "BlogImage_inlinePostId_idx" ON "BlogImage"("inlinePostId");

DO $$ BEGIN
  ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_coverImageId_fkey"
    FOREIGN KEY ("coverImageId") REFERENCES "BlogImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "BlogImage" ADD CONSTRAINT "BlogImage_inlinePostId_fkey"
    FOREIGN KEY ("inlinePostId") REFERENCES "BlogPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
