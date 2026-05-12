-- CreateEnum
CREATE TYPE "TravelStyle" AS ENUM ('ROAD_TRIP', 'REGION_EXPLORER', 'MULTI_COUNTRY', 'BACKPACKER', 'LUXURY', 'CULTURAL', 'ADVENTURE', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "TravelPace" AS ENUM ('RELAXED', 'BALANCED', 'PACKED');

-- CreateEnum
CREATE TYPE "TravelBudget" AS ENUM ('BUDGET', 'MID', 'PREMIUM');

-- CreateEnum
CREATE TYPE "TravelGroup" AS ENUM ('SOLO', 'COUPLE', 'FAMILY', 'GROUP');

-- CreateTable
CREATE TABLE "TravelProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "travelStyle" "TravelStyle" NOT NULL DEFAULT 'FLEXIBLE',
    "pace" "TravelPace" NOT NULL DEFAULT 'BALANCED',
    "budget" "TravelBudget" NOT NULL DEFAULT 'MID',
    "groupType" "TravelGroup" NOT NULL DEFAULT 'SOLO',
    "transportPreference" TEXT,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TravelProfile_userId_key" ON "TravelProfile"("userId");

-- AddForeignKey
ALTER TABLE "TravelProfile" ADD CONSTRAINT "TravelProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
