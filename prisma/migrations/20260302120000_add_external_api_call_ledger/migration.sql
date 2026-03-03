-- CreateEnum
CREATE TYPE "ExternalApiProvider" AS ENUM ('GOOGLE_PLACES', 'GOOGLE_ROUTES');

-- CreateTable
CREATE TABLE "ExternalApiCall" (
    "id" TEXT NOT NULL,
    "provider" "ExternalApiProvider" NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "tripId" TEXT,
    "sessionId" TEXT,
    "userId" TEXT,
    "statusCode" INTEGER,
    "success" BOOLEAN NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "estimatedCostMicros" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalApiCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalApiCall_provider_createdAt_idx" ON "ExternalApiCall"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "ExternalApiCall_endpoint_createdAt_idx" ON "ExternalApiCall"("endpoint", "createdAt");

-- CreateIndex
CREATE INDEX "ExternalApiCall_requestHash_idx" ON "ExternalApiCall"("requestHash");

-- CreateIndex
CREATE INDEX "ExternalApiCall_tripId_idx" ON "ExternalApiCall"("tripId");

-- CreateIndex
CREATE INDEX "ExternalApiCall_sessionId_idx" ON "ExternalApiCall"("sessionId");

-- CreateIndex
CREATE INDEX "ExternalApiCall_userId_idx" ON "ExternalApiCall"("userId");
