/**
 * Database Debug Script - Check Host Records
 * 
 * Checks for hosts that may have booking issues due to:
 * - Missing chargesEnabled
 * - Missing stripeConnectedAccountId
 * - No availability
 * - Expired availability
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL,
});

async function main() {
  console.log('\n🔍 DATABASE DEBUG: Checking Host Records\n');
  console.log('='.repeat(70));
  
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // 1. Check specifically for Olivia
  console.log('\n📍 OLIVIA GARCIA (olivia-amsterdam-21):\n');
  
  const olivia = await prisma.user.findUnique({
    where: { id: 'olivia-amsterdam-21' },
  });
  
  if (!olivia) {
    console.log('  ❌ User NOT FOUND in database');
  } else {
    console.log(`  ✓ User found: ${olivia.name} (${olivia.email || 'no email'})`);
    console.log(`    isHost: ${olivia.isHost}`);
    console.log(`    isVerified: ${olivia.isVerified}`);
    console.log(`    chargesEnabled: ${olivia.chargesEnabled}`);
    console.log(`    payoutsEnabled: ${olivia.payoutsEnabled}`);
    console.log(`    stripeConnectedAccountId: ${olivia.stripeConnectedAccountId || 'MISSING'}`);
    console.log(`    stripeOnboardingStatus: ${olivia.stripeOnboardingStatus}`);
  }

  // Check Olivia's experience by hostId (not by hardcoded ID)
  const oliviaExps = await prisma.experience.findMany({
    where: { hostId: 'olivia-amsterdam-21' },
    include: {
      availability: {
        where: { date: { gte: today } },
        orderBy: { date: 'asc' },
        take: 5,
      },
    },
  });

  if (oliviaExps.length === 0) {
    console.log('  ❌ NO Experiences found for host olivia-amsterdam-21');
  } else {
    for (const exp of oliviaExps) {
      console.log(`  ✓ Experience: ${exp.id} - ${exp.title}`);
      console.log(`    Price: $${exp.price / 100}`);
      console.log(`    isActive: ${exp.isActive}`);
      console.log(`    Future availability slots: ${exp.availability.length}`);
      if (exp.availability.length > 0) {
        console.log(`    Next dates: ${exp.availability.map(a => a.date.toISOString().split('T')[0]).join(', ')}`);
      } else {
        console.log('    ⚠️ NO FUTURE AVAILABILITY');
      }
    }
  }

  // 2. Summary of all hosts with booking issues
  console.log('\n' + '='.repeat(70));
  console.log('\n📊 ALL HOSTS SUMMARY:\n');
  
  const hosts = await prisma.user.findMany({
    where: { isHost: true },
    select: {
      id: true,
      name: true,
      chargesEnabled: true,
      payoutsEnabled: true,
      stripeConnectedAccountId: true,
      stripeOnboardingStatus: true,
    },
  });

  const experiences = await prisma.experience.findMany({
    include: {
      availability: {
        where: { date: { gte: today } },
      },
    },
  });

  // Group experiences by hostId
  const expByHost = new Map<string, typeof experiences>();
  for (const exp of experiences) {
    if (!expByHost.has(exp.hostId)) {
      expByHost.set(exp.hostId, []);
    }
    expByHost.get(exp.hostId)!.push(exp);
  }

  interface Issue {
    hostId: string;
    hostName: string;
    issues: string[];
  }

  const issues: Issue[] = [];

  for (const host of hosts) {
    const hostIssues: string[] = [];
    
    // Check Stripe setup
    if (!host.chargesEnabled) {
      hostIssues.push('chargesEnabled=false');
    }
    if (!host.payoutsEnabled) {
      hostIssues.push('payoutsEnabled=false');
    }
    if (!host.stripeConnectedAccountId) {
      hostIssues.push('No Stripe account');
    }
    
    // Check availability
    const hostExps = expByHost.get(host.id) || [];
    if (hostExps.length === 0) {
      hostIssues.push('No experiences');
    } else {
      const totalAvail = hostExps.reduce((sum, e) => sum + e.availability.length, 0);
      if (totalAvail === 0) {
        hostIssues.push('No future availability');
      }
    }

    if (hostIssues.length > 0) {
      issues.push({
        hostId: host.id,
        hostName: host.name || 'Unknown',
        issues: hostIssues,
      });
    }
  }

  console.log(`Total hosts: ${hosts.length}`);
  console.log(`Hosts with issues: ${issues.length}`);
  console.log('');

  if (issues.length > 0) {
    console.log('⚠️  HOSTS WITH BOOKING ISSUES:\n');
    for (const issue of issues.slice(0, 20)) { // Limit to first 20
      console.log(`  ${issue.hostId} (${issue.hostName})`);
      console.log(`    Issues: ${issue.issues.join(', ')}`);
    }
    if (issues.length > 20) {
      console.log(`  ... and ${issues.length - 20} more`);
    }
  } else {
    console.log('✓ All hosts are properly configured for booking!');
  }

  // 3. Availability expiry check
  console.log('\n' + '='.repeat(70));
  console.log('\n📅 AVAILABILITY STATUS:\n');
  
  const allAvail = await prisma.experienceAvailability.groupBy({
    by: ['experienceId'],
    where: { date: { gte: today } },
    _count: { id: true },
  });
  
  const expsWithAvail = allAvail.length;
  const expsTotal = experiences.length;
  
  console.log(`Experiences with future availability: ${expsWithAvail}/${expsTotal}`);
  
  if (expsWithAvail < expsTotal) {
    console.log(`\n⚠️  ${expsTotal - expsWithAvail} experiences have NO future availability`);
    
    const noAvailExps = experiences.filter(e => e.availability.length === 0);
    console.log('\nExperiences without availability (first 10):');
    for (const exp of noAvailExps.slice(0, 10)) {
      console.log(`  - ${exp.id}: ${exp.title} (host: ${exp.hostId})`);
    }
    if (noAvailExps.length > 10) {
      console.log(`  ... and ${noAvailExps.length - 10} more`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('\n💡 FIX: Run `npm run db:seed` to refresh all data including availability.\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
