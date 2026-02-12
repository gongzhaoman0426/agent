-- Add missing Better Auth fields to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "image" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "displayUsername" TEXT;

UPDATE "users"
SET "email" = COALESCE("email", "username" || '@agent.local');

UPDATE "users"
SET "name" = COALESCE("name", "username");

UPDATE "users"
SET "displayUsername" = COALESCE("displayUsername", "username");

ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");

-- Better Auth account table
CREATE TABLE IF NOT EXISTS "accounts" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMP(3),
  "refreshTokenExpiresAt" TIMESTAMP(3),
  "scope" TEXT,
  "password" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "accounts_providerId_accountId_key" ON "accounts"("providerId", "accountId");
CREATE INDEX IF NOT EXISTS "accounts_userId_idx" ON "accounts"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'accounts_userId_fkey'
  ) THEN
    ALTER TABLE "accounts"
      ADD CONSTRAINT "accounts_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

-- Better Auth session table
CREATE TABLE IF NOT EXISTS "sessions" (
  "id" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "token" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL,

  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sessions_token_key" ON "sessions"("token");
CREATE INDEX IF NOT EXISTS "sessions_userId_idx" ON "sessions"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sessions_userId_fkey'
  ) THEN
    ALTER TABLE "sessions"
      ADD CONSTRAINT "sessions_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

-- Better Auth verification table
CREATE TABLE IF NOT EXISTS "verifications" (
  "id" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "verifications_identifier_idx" ON "verifications"("identifier");

-- Migrate legacy users.password into accounts.password
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name = 'password'
  ) THEN
    INSERT INTO "accounts" (
      "id",
      "accountId",
      "providerId",
      "userId",
      "password",
      "createdAt",
      "updatedAt"
    )
    SELECT
      'migrated_' || md5(u."id"),
      u."id",
      'credential',
      u."id",
      u."password",
      u."createdAt",
      u."updatedAt"
    FROM "users" u
    WHERE u."password" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "accounts" a
        WHERE a."providerId" = 'credential'
          AND a."accountId" = u."id"
      );

    ALTER TABLE "users" DROP COLUMN IF EXISTS "password";
  END IF;
END $$;
