/*
  Warnings:

  - A unique constraint covering the columns `[userId,content]` on the table `Memory` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Memory_userId_idx";

-- AlterTable
ALTER TABLE "Memory" ADD COLUMN     "conversationId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Memory_userId_createdAt_idx" ON "Memory"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Memory_userId_content_key" ON "Memory"("userId", "content");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
