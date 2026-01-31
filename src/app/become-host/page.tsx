import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { createExperienceDraft } from '@/actions/experiences';

export default async function BecomeHostRootPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const session = await auth();
  if (!session?.user) {
    redirect('/api/auth/signin?callbackUrl=/become-host');
  }

  const userId = session.user.id;
  const { new: isNew } = await searchParams;

  // 1. Check for most recent existing draft (unless forced new)
  if (!isNew) {
    const latestDraft = await prisma.experienceDraft.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' }
    });

    if (latestDraft) {
      redirect(`/become-host/${latestDraft.id}`);
    }
  }

  // 2. Create new draft
  const result = await createExperienceDraft();
  
  if (result.success && result.draftId) {
    redirect(`/become-host/${result.draftId}`);
  }

  // Fallback error handling
  redirect('/experiences?error=creation_failed');
}
