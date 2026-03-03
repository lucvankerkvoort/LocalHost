/*
  Warnings:

  - You are about to drop the column `embedding` on the `Experience` table. All the data in the column will be lost.
  - You are about to drop the column `engagementScore` on the `Experience` table. All the data in the column will be lost.
  - You are about to drop the column `placeId` on the `ItineraryItem` table. All the data in the column will be lost.
  - You are about to drop the column `currentVersion` on the `Trip` table. All the data in the column will be lost.
  - You are about to drop the `Activity` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `City` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TripRevision` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Activity" DROP CONSTRAINT "Activity_cityId_fkey";

-- DropForeignKey
ALTER TABLE "TripRevision" DROP CONSTRAINT "TripRevision_tripId_fkey";

-- DropIndex
DROP INDEX "ItineraryItem_placeId_idx";

-- AlterTable
ALTER TABLE "Experience" DROP COLUMN "embedding",
DROP COLUMN "engagementScore";

-- AlterTable
ALTER TABLE "ItineraryItem" DROP COLUMN "placeId";

-- AlterTable
ALTER TABLE "Trip" DROP COLUMN "currentVersion";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "occupation" TEXT,
ADD COLUMN     "travelPreferences" JSONB DEFAULT '{}';

-- DropTable
DROP TABLE "Activity";

-- DropTable
DROP TABLE "City";

-- DropTable
DROP TABLE "TripRevision";

-- CreateTable
CREATE TABLE "ChatParticipant" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrchestratorJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "stage" TEXT NOT NULL DEFAULT 'draft',
    "message" TEXT NOT NULL DEFAULT '',
    "progressCurrent" INTEGER,
    "progressTotal" INTEGER,
    "generationId" TEXT,
    "generationMode" TEXT,
    "plan" JSONB,
    "hostMarkers" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrchestratorJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrchestratorSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrchestratorSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationSession" (
    "id" TEXT NOT NULL,
    "intent" TEXT NOT NULL DEFAULT 'general',
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitEntry" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "windowKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatParticipant_userId_idx" ON "ChatParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatParticipant_threadId_userId_key" ON "ChatParticipant"("threadId", "userId");

-- CreateIndex
CREATE INDEX "OrchestratorJob_userId_idx" ON "OrchestratorJob"("userId");

-- CreateIndex
CREATE INDEX "OrchestratorJob_status_idx" ON "OrchestratorJob"("status");

-- CreateIndex
CREATE INDEX "OrchestratorSession_userId_idx" ON "OrchestratorSession"("userId");

-- CreateIndex
CREATE INDEX "RateLimitEntry_expiresAt_idx" ON "RateLimitEntry"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimitEntry_identifier_windowKey_key" ON "RateLimitEntry"("identifier", "windowKey");

-- CreateIndex
CREATE INDEX "ChatThread_bookingId_idx" ON "ChatThread"("bookingId");

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatParticipant" ADD CONSTRAINT "ChatParticipant_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatParticipant" ADD CONSTRAINT "ChatParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
