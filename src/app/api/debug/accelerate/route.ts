import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Simple query to verify connection
    const userCount = await prisma.user.count();
    
    return NextResponse.json({ 
      status: 'ok', 
      message: 'Connected to Prisma Accelerate', 
      userCount 
    });
  } catch (error) {
    console.error('Prisma Accelerate Connection Error:', error);
    return NextResponse.json(
      { 
        status: 'error', 
        message: 'Failed to connect via Prisma Accelerate',
        error: String(error)
      },
      { status: 500 }
    );
  }
}
