import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

const profilePatchSchema = z.object({
  name: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  occupation: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  languages: z.array(z.string()).optional(),
  interests: z.array(z.string()).optional(),
  travelPreferences: z.record(z.string(), z.unknown()).optional(),
  image: z.string().nullable().optional(),
});

const PROFILE_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
  city: true,
  country: true,
  occupation: true,
  bio: true,
  languages: true,
  interests: true,
  travelPreferences: true,
} as const;

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: PROFILE_SELECT,
    });

    if (!user) {
      return new NextResponse('User not found', { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('[PROFILE_GET]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const body = await req.json();
    const parsed = profilePatchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: parsed.data,
      select: PROFILE_SELECT,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[PROFILE_PATCH]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
