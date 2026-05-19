-- AlterTable
ALTER TABLE "BotSettings" ADD COLUMN IF NOT EXISTS "voiceNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
