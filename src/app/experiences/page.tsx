import { ExperienceList } from '@/components/experiences/experience-list';
import { PayoutSetupCard } from '@/components/experiences/payout-setup-card';
import { Button } from '@/components/ui/button';
import { Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export default async function MyExperiencesPage() {
  const session = await auth();
  
  // Fetch user data and experience counts
  const user = session?.user?.id ? await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { stripeOnboardingStatus: true, payoutsEnabled: true }
  }) : null;

  // Check if user has any experiences (is a host)
  const experienceCount = session?.user?.id ? await prisma.$transaction([
    prisma.experienceDraft.count({ where: { userId: session.user.id } }),
    prisma.hostExperience.count({ where: { hostId: session.user.id } }),
  ]) : [0, 0];
  
  const isHost = (experienceCount[0] + experienceCount[1]) > 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FFF5F0] to-[#FFF0EB] dark:from-zinc-950 dark:to-zinc-900 pb-24">
      <div className="max-w-md mx-auto min-h-screen flex flex-col">
        
        {/* Header */}
        <div className="p-6 pt-12 pb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[var(--foreground)]">My Experiences</h1>
          <Link href="/become-host?new=true">
            <Button size="sm" className="rounded-full bg-gradient-to-r from-[var(--princeton-orange)] to-red-500 hover:opacity-90 text-white shadow-lg shadow-orange-500/20 border-0 gap-1.5 pl-3 pr-4">
              <Plus className="w-4 h-4 mr-2" />
              <span>Create</span>
            </Button>
          </Link>
        </div>

        {/* List Content */}
        <div className="flex-1 px-4">
          {/* Non-host empty state */}
          {!isHost && (
            <div className="text-center py-12 px-6">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[var(--princeton-orange)] to-red-500 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <h2 className="text-xl font-bold text-[var(--foreground)] mb-2">Become a Host</h2>
              <p className="text-[var(--muted-foreground)] mb-6">
                Share your passion with travelers and earn money doing what you love.
              </p>
              <Link href="/become-host">
                <Button className="bg-[var(--princeton-orange)] hover:bg-[#E04F2E] text-white">
                  Create Your First Experience
                </Button>
              </Link>
            </div>
          )}
          
          {/* Show payout card only for existing hosts */}
          {isHost && user && (
             <PayoutSetupCard 
               status={user.stripeOnboardingStatus} 
               payoutsEnabled={user.payoutsEnabled} 
             />
          )}
          
          {/* Only show experience list for hosts */}
          {isHost && <ExperienceList />}
        </div>

      </div>
    </div>
  );
}
