import 'dotenv/config';
import { ExperienceCategory } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcryptjs';

async function main() {
  console.log('🌱 Seeding database...');

  // Clear existing data
  await prisma.message.deleteMany();
  await prisma.review.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.experienceAvailability.deleteMany();
  await prisma.experience.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();

  console.log('✓ Cleared existing data');

  // Create demo users
  const password = await bcrypt.hash('password', 10);

  const host1 = await prisma.user.create({
    data: {
      email: 'maria@localhost.com',
      name: 'Maria Rossi',
      bio: 'Born and raised in Rome. I love sharing my family\'s traditional recipes with travelers from around the world.',
      image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop',
      city: 'Rome',
      country: 'Italy',
      languages: ['Italian', 'English'],
      interests: ['Cooking', 'Wine', 'History'],
      isHost: true,
      isVerified: true,
      verificationTier: 'TRUSTED',
      trustScore: 95,
      password,
    },
  });

  const host2 = await prisma.user.create({
    data: {
      email: 'carlos@localhost.com',
      name: 'Carlos Mendez',
      bio: 'Street art enthusiast and local historian. Let me show you the hidden murals that tell the story of our city.',
      image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop',
      city: 'Mexico City',
      country: 'Mexico',
      languages: ['Spanish', 'English'],
      interests: ['Street Art', 'History', 'Photography'],
      isHost: true,
      isVerified: true,
      verificationTier: 'VERIFIED',
      trustScore: 88,
      password,
    },
  });

  const host3 = await prisma.user.create({
    data: {
      email: 'yuki@localhost.com',
      name: 'Yuki Tanaka',
      bio: 'Nature lover and certified hiking guide. Join me for sunrise hikes with traditional Japanese breakfast.',
      image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop',
      city: 'Kyoto',
      country: 'Japan',
      languages: ['Japanese', 'English'],
      interests: ['Hiking', 'Nature', 'Tea Ceremony'],
      isHost: true,
      isVerified: true,
      verificationTier: 'TRUSTED',
      trustScore: 92,
      password,
    },
  });

  const demoGuest = await prisma.user.create({
    data: {
      email: 'demo@localhost.com',
      name: 'Demo User',
      bio: 'Adventurous traveler looking for authentic local experiences.',
      city: 'San Francisco',
      country: 'USA',
      languages: ['English'],
      interests: ['Travel', 'Food', 'Culture'],
      isHost: false,
      isVerified: true,
      verificationTier: 'VERIFIED',
      trustScore: 75,
      password,
    },
  });

  console.log('✓ Created users');

  // Create experiences
  const experience1 = await prisma.experience.create({
    data: {
      hostId: host1.id,
      title: 'Sunset Cooking Class with Nonna Maria',
      description: `Join me in my family home for an authentic Italian cooking experience. We'll prepare a traditional Roman dinner together—fresh pasta from scratch, classic cacio e pepe, and my grandmother's secret tiramisù recipe.

The evening starts at golden hour on my rooftop terrace with an aperitivo while I share stories of my family's culinary traditions. Then we'll head to my kitchen where you'll learn techniques passed down through four generations.

This isn't just a cooking class—it's an invitation into my family's home and heritage.

What to expect:
• Hands-on pasta making from scratch
• Traditional Roman recipes
• Stories and tips from a local
• A full meal with wine pairing
• Recipes to take home`,
      category: 'FOOD_DRINK',
      neighborhood: 'Trastevere',
      city: 'Rome',
      country: 'Italy',
      duration: 180, // 3 hours
      minGroupSize: 2,
      maxGroupSize: 6,
      price: 7500, // $75
      currency: 'USD',
      includedItems: ['All ingredients', 'Wine pairing', 'Recipe cards', 'Apron to keep'],
      excludedItems: ['Transportation to venue'],
      photos: [
        'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800&h=600&fit=crop',
        'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&h=600&fit=crop',
        'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=800&h=600&fit=crop',
      ],
      rating: 4.9,
      reviewCount: 127,
      isActive: true,
    },
  });

  const experience2 = await prisma.experience.create({
    data: {
      hostId: host2.id,
      title: 'Hidden Murals Walking Tour',
      description: `Discover the stories painted on the walls of Mexico City's most vibrant neighborhoods. As a local street art historian, I'll take you beyond the tourist spots to see murals that tell the real story of our city.

We'll explore hidden alleys, meet local artists, and learn about the political and cultural movements that inspired these works. Each mural has a story, and I know them all.

What we'll see:
• Historic murals from the 1920s-present
• Hidden artist studios
• Underground galleries
• Local street food stops

This tour is perfect for photography lovers—I'll show you the best angles and times for capturing these incredible works.`,
      category: 'ARTS_CULTURE',
      neighborhood: 'Roma Norte',
      city: 'Mexico City',
      country: 'Mexico',
      duration: 150, // 2.5 hours
      minGroupSize: 1,
      maxGroupSize: 8,
      price: 3500, // $35
      currency: 'USD',
      includedItems: ['Local snacks', 'Bottled water', 'Digital photo album'],
      excludedItems: ['Transportation', 'Lunch'],
      photos: [
        'https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=800&h=600&fit=crop',
        'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=800&h=600&fit=crop',
        'https://images.unsplash.com/photo-1499781350541-7783f6c6a0c8?w=800&h=600&fit=crop',
      ],
      rating: 4.8,
      reviewCount: 89,
      isActive: true,
    },
  });

  const experience3 = await prisma.experience.create({
    data: {
      hostId: host3.id,
      title: 'Mountain Sunrise Hike & Breakfast',
      description: `Experience the magic of a Japanese mountain sunrise followed by a traditional breakfast in nature.

We'll start early (5am pickup) to hike up Mount Daimonji as the first light appears. The trail is moderate and suitable for most fitness levels. At the summit, we'll watch the sun rise over Kyoto's ancient temples.

After descending, we'll enjoy a traditional Japanese breakfast I've prepared—rice, miso soup, grilled fish, pickles, and freshly brewed green tea—all while overlooking the city.

What makes this special:
• Certified hiking guide (safety first!)
• Authentic Japanese breakfast
• Small groups only
• Sunrise meditation (optional)
• Photography tips for capturing the moment`,
      category: 'OUTDOOR_ADVENTURE',
      neighborhood: 'Higashiyama',
      city: 'Kyoto',
      country: 'Japan',
      duration: 240, // 4 hours
      minGroupSize: 2,
      maxGroupSize: 4,
      price: 5000, // $50
      currency: 'USD',
      includedItems: ['Traditional breakfast', 'Green tea', 'Hiking poles', 'First aid kit'],
      excludedItems: ['Hotel pickup outside central Kyoto'],
      photos: [
        'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&h=600&fit=crop',
        'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&h=600&fit=crop',
        'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&h=600&fit=crop',
      ],
      rating: 5.0,
      reviewCount: 64,
      isActive: true,
    },
  });

  console.log('✓ Created experiences');

  // Create availability for experiences
  const today = new Date();
  for (let i = 1; i <= 14; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);

    // Experience 1 availability (evenings)
    await prisma.experienceAvailability.create({
      data: {
        experienceId: experience1.id,
        date: date,
        startTime: '17:00',
        endTime: '20:00',
        spotsLeft: 6,
      },
    });

    // Experience 2 availability (mornings and afternoons)
    await prisma.experienceAvailability.create({
      data: {
        experienceId: experience2.id,
        date: date,
        startTime: '10:00',
        endTime: '12:30',
        spotsLeft: 8,
      },
    });

    // Experience 3 availability (early mornings, only weekends)
    if (date.getDay() === 0 || date.getDay() === 6) {
      await prisma.experienceAvailability.create({
        data: {
          experienceId: experience3.id,
          date: date,
          startTime: '05:00',
          endTime: '09:00',
          spotsLeft: 4,
        },
      });
    }
  }

  console.log('✓ Created availability');

  // Create a sample booking
  const booking = await prisma.booking.create({
    data: {
      experienceId: experience1.id,
      guestId: demoGuest.id,
      date: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
      guests: 2,
      totalPrice: 15000, // $150 for 2 people
      currency: 'USD',
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
    },
  });

  console.log('✓ Created sample booking');

  // Create sample reviews
  await prisma.review.create({
    data: {
      bookingId: booking.id,
      experienceId: experience1.id,
      reviewerId: demoGuest.id,
      revieweeId: host1.id,
      type: 'GUEST_TO_HOST',
      rating: 5,
      content: 'Absolutely magical evening! Maria welcomed us like family, and her pasta is the best I\'ve ever had. The stories about her grandmother brought tears to my eyes. A must-do experience in Rome!',
    },
  });

  await prisma.review.create({
    data: {
      bookingId: booking.id,
      experienceId: experience1.id,
      reviewerId: host1.id,
      revieweeId: demoGuest.id,
      type: 'HOST_TO_GUEST',
      rating: 5,
      content: 'Wonderful guests! They were curious, engaged, and really appreciated the traditions I shared. Would love to host them again.',
    },
  });

  console.log('✓ Created sample reviews');

  console.log('');
  console.log('🎉 Seeding complete!');
  console.log('');
  console.log('Demo credentials:');
  console.log('  Email: demo@localhost.com');
  console.log('  (Use credentials login in development)');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
