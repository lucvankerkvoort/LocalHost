import { EditorLayout } from '@/components/features/host-creation/editor-layout';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ draftId: string }>;
}

export default async function BecomeHostEditorPage({ params }: PageProps) {
  const { draftId } = await params;
  const session = await auth();
  
  if (!session?.user) {
    redirect('/api/auth/signin');
  }

  // Verify ownership
  const draft = await prisma.experienceDraft.findUnique({
    where: { id: draftId },
  });

  if (!draft || draft.userId !== session.user.id) {
    // Determine if we should redirect to correct draft or 404
    // For now, if not found or not owner, redirect to root to find/create valid one
    redirect('/become-host');
  }

  return <EditorLayout draftId={draftId} initialData={draft} />;
}
