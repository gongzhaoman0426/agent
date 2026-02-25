-- AlterTable
ALTER TABLE "chat_sessions" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'web';

-- CreateTable
CREATE TABLE "session_summaries" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "turnStart" INTEGER NOT NULL,
    "turnEnd" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_tasks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "user_prompt" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_tokens" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_summaries_sessionId_idx" ON "session_summaries"("sessionId");

-- CreateIndex
CREATE INDEX "session_summaries_agentId_idx" ON "session_summaries"("agentId");

-- CreateIndex
CREATE INDEX "scheduled_tasks_userId_enabled_idx" ON "scheduled_tasks"("userId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "access_tokens_token_hash_key" ON "access_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "access_tokens_userId_idx" ON "access_tokens"("userId");

-- CreateIndex
CREATE INDEX "agents_createdById_deleted_isWorkflowGenerated_idx" ON "agents"("createdById", "deleted", "isWorkflowGenerated");

-- CreateIndex
CREATE INDEX "chat_messages_sessionId_createdAt_idx" ON "chat_messages"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_sessions_userId_source_deleted_idx" ON "chat_sessions"("userId", "source", "deleted");

-- CreateIndex
CREATE INDEX "chat_sessions_agentId_userId_deleted_idx" ON "chat_sessions"("agentId", "userId", "deleted");

-- CreateIndex
CREATE INDEX "files_knowledgeBaseId_status_idx" ON "files"("knowledgeBaseId", "status");

-- AddForeignKey
ALTER TABLE "session_summaries" ADD CONSTRAINT "session_summaries_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
