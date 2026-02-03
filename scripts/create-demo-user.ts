
import { PrismaClient } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient({
    accelerateUrl: process.env.DATABASE_URL,
}).$extends(withAccelerate());

async function main() {
  const email = 'demo@localhost.com';
  const password = process.env.DEMO_USER_PASSWORD;
  if (!password) {
    throw new Error('DEMO_USER_PASSWORD is required.');
  }
  const hashedPassword = await bcrypt.hash(password, 10);

  console.log(`Creating demo user: ${email}`);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      password: hashedPassword,
    },
    create: {
      email,
      name: 'Demo User',
      password: hashedPassword,
      image: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop',
      city: 'San Francisco',
      country: 'USA',
      isHost: false,
      isVerified: true,
      verificationTier: 'VERIFIED',
    },
  });

  console.log(`✅ Demo user ready!`);
  console.log(`📧 Email: ${email}`);
  console.log(`🔑 Password: [loaded from DEMO_USER_PASSWORD]`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
