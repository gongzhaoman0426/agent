-- AlterTable
ALTER TABLE "toolkits" ADD COLUMN "settings_schema" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "user_toolkit_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toolkitId" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_toolkit_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_toolkit_settings_userId_toolkitId_key" ON "user_toolkit_settings"("userId", "toolkitId");

-- AddForeignKey
ALTER TABLE "user_toolkit_settings" ADD CONSTRAINT "user_toolkit_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_toolkit_settings" ADD CONSTRAINT "user_toolkit_settings_toolkitId_fkey" FOREIGN KEY ("toolkitId") REFERENCES "toolkits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
