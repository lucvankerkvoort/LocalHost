#!/bin/bash

# Reset Staging Database
# Drops all data and re-seeds with E2E test data
#
# Usage:
#   npm run db:reset:staging
#   OR
#   ./scripts/reset-staging.sh

set -e

echo ""
echo "🔄 RESET STAGING DATABASE"
echo "========================="
echo ""

# Check if .env.staging exists
if [ ! -f ".env.staging" ]; then
    echo "❌ .env.staging not found. Please create it first."
    exit 1
fi

# Load staging environment
export $(grep -v '^#' .env.staging | xargs)

echo "📍 Target: $DATABASE_URL"
echo ""

# Confirm reset (skip if CI environment)
if [ -z "$CI" ]; then
    read -p "⚠️  This will DELETE all data in the staging database. Continue? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
fi

echo ""
echo "1️⃣  Pushing schema to database..."
npx dotenv -e .env.staging -- npx prisma db push --force-reset

echo ""
echo "2️⃣  Running E2E seed script..."
npx dotenv -e .env.staging -- npx tsx prisma/seed-staging.ts

echo ""
echo "3️⃣  Verifying seed data..."
npx dotenv -e .env.staging -- npx tsx scripts/verify-staging.ts

echo ""
echo "✅ Staging database reset complete!"
echo ""
