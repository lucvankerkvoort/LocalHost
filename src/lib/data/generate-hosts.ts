// Script to generate fake host profiles
// Run with: npx ts-node src/lib/data/generate-hosts.ts

const FIRST_NAMES = ['Emma', 'Liam', 'Sofia', 'Noah', 'Olivia', 'Lucas', 'Ava', 'Mason', 'Isabella', 'Ethan', 'Mia', 'Aiden', 'Luna', 'Leo', 'Aria', 'James', 'Chloe', 'Benjamin', 'Ella', 'Jack', 'Amara', 'Kofi', 'Yuki', 'Chen', 'Priya', 'Mohammed', 'Fatima', 'Raj', 'Mei', 'Omar', 'Zara', 'Diego', 'Carmen', 'Luis', 'Ana', 'Marco', 'Giulia', 'Hans', 'Ingrid', 'Sven', 'Freya', 'Kenji', 'Sakura', 'Hiroshi', 'Yuna', 'Jin', 'Min', 'Tao', 'Wei', 'Aisha'];
const LAST_NAMES = ['Smith', 'Garcia', 'Kim', 'Patel', 'Chen', 'Nguyen', 'Mueller', 'Silva', 'Santos', 'Yamamoto', 'Tanaka', 'Park', 'Lee', 'Wang', 'Ali', 'Hassan', 'Rossi', 'Ferrari', 'Schmidt', 'Weber', 'Johansson', 'Andersen', 'Larsen', 'Okonkwo', 'Mensah', 'Delgado', 'Hernandez', 'Lopez', 'Martinez', 'Rodriguez'];

const CITIES = [
  { city: 'Tokyo', country: 'Japan' }, { city: 'Paris', country: 'France' }, { city: 'New York', country: 'USA' },
  { city: 'London', country: 'UK' }, { city: 'Barcelona', country: 'Spain' }, { city: 'Rome', country: 'Italy' },
  { city: 'Berlin', country: 'Germany' }, { city: 'Amsterdam', country: 'Netherlands' }, { city: 'Lisbon', country: 'Portugal' },
  { city: 'Sydney', country: 'Australia' }, { city: 'Melbourne', country: 'Australia' }, { city: 'Bangkok', country: 'Thailand' },
  { city: 'Seoul', country: 'South Korea' }, { city: 'Singapore', country: 'Singapore' }, { city: 'Dubai', country: 'UAE' },
  { city: 'Cape Town', country: 'South Africa' }, { city: 'Marrakech', country: 'Morocco' }, { city: 'Cairo', country: 'Egypt' },
  { city: 'Mumbai', country: 'India' }, { city: 'Delhi', country: 'India' }, { city: 'Buenos Aires', country: 'Argentina' },
  { city: 'Rio de Janeiro', country: 'Brazil' }, { city: 'Mexico City', country: 'Mexico' }, { city: 'Bogota', country: 'Colombia' },
  { city: 'Lima', country: 'Peru' }, { city: 'Havana', country: 'Cuba' }, { city: 'San Juan', country: 'Puerto Rico' },
  { city: 'Stockholm', country: 'Sweden' }, { city: 'Copenhagen', country: 'Denmark' }, { city: 'Oslo', country: 'Norway' },
  { city: 'Vienna', country: 'Austria' }, { city: 'Prague', country: 'Czech Republic' }, { city: 'Budapest', country: 'Hungary' },
  { city: 'Athens', country: 'Greece' }, { city: 'Istanbul', country: 'Turkey' }, { city: 'Tel Aviv', country: 'Israel' },
  { city: 'Accra', country: 'Ghana' }, { city: 'Lagos', country: 'Nigeria' }, { city: 'Nairobi', country: 'Kenya' },
  { city: 'Kyoto', country: 'Japan' }, { city: 'Osaka', country: 'Japan' }, { city: 'Florence', country: 'Italy' },
  { city: 'Milan', country: 'Italy' }, { city: 'Vancouver', country: 'Canada' }, { city: 'Montreal', country: 'Canada' },
  { city: 'Toronto', country: 'Canada' }, { city: 'San Francisco', country: 'USA' }, { city: 'Los Angeles', country: 'USA' },
  { city: 'Chicago', country: 'USA' }, { city: 'New Orleans', country: 'USA' },
];

const INTEREST_SETS = [
  ['cooking', 'wine', 'farmers markets', 'food history'],
  ['street art', 'urban exploration', 'photography', 'graffiti'],
  ['hiking', 'nature', 'wildlife', 'camping'],
  ['nightlife', 'cocktails', 'live music', 'dancing'],
  ['meditation', 'yoga', 'wellness', 'mindfulness'],
  ['history', 'architecture', 'museums', 'walking tours'],
  ['surfing', 'beach', 'water sports', 'diving'],
  ['music', 'jazz', 'local bands', 'concerts'],
  ['coffee', 'cafes', 'barista skills', 'roasting'],
  ['vintage shops', 'antiques', 'flea markets', 'thrifting'],
  ['craft beer', 'breweries', 'pub crawls', 'tasting'],
  ['street food', 'night markets', 'local eats', 'food tours'],
  ['cycling', 'bike tours', 'urban cycling', 'mountain biking'],
  ['photography', 'instagram spots', 'golden hour', 'portraits'],
  ['traditional crafts', 'pottery', 'weaving', 'artisan workshops'],
  ['tea ceremonies', 'traditional culture', 'temples', 'spirituality'],
  ['fashion', 'shopping', 'local designers', 'boutiques'],
  ['gardening', 'urban farms', 'sustainability', 'permaculture'],
  ['sailing', 'boats', 'coastal tours', 'fishing'],
  ['rock climbing', 'bouldering', 'adventure sports', 'adrenaline'],
];

const CATEGORIES = ['food-drink', 'arts-culture', 'outdoor-adventure', 'nightlife-social', 'wellness', 'learning'] as const;

const EXPERIENCE_TEMPLATES = {
  'food-drink': [
    { title: 'Secret {adj} Food Tour', desc: 'Discover hidden gems where locals actually eat' },
    { title: '{adj} Cooking Class', desc: 'Learn to make authentic dishes in my home kitchen' },
    { title: 'Wine & {noun} Evening', desc: 'Sample the best local wines paired with delicious bites' },
    { title: 'Market Tour & {noun}', desc: 'Explore the morning market and cook what we find' },
  ],
  'arts-culture': [
    { title: 'Hidden {noun} Walking Tour', desc: 'See the art and history tourists miss' },
    { title: '{adj} Street Art Safari', desc: 'Discover murals and meet local artists' },
    { title: 'Museum Insider {noun}', desc: 'Skip the crowds with a local expert' },
    { title: '{adj} Architecture Walk', desc: 'Explore iconic and hidden architectural gems' },
  ],
  'outdoor-adventure': [
    { title: 'Sunrise {noun} Adventure', desc: 'Early morning escape to breathtaking views' },
    { title: '{adj} Nature Hike', desc: 'Discover trails only locals know about' },
    { title: 'Coastal {noun} Experience', desc: 'Explore stunning coastline and hidden beaches' },
    { title: '{adj} Bike Tour', desc: 'Cycle through scenic routes and secret spots' },
  ],
  'nightlife-social': [
    { title: 'Secret {noun} Crawl', desc: 'Hit the best spots locals love after dark' },
    { title: '{adj} Rooftop Night', desc: 'Experience the city skyline at its best' },
    { title: 'Live Music & {noun}', desc: 'Discover the local music scene' },
    { title: '{adj} Night Market Tour', desc: 'Experience the city when it comes alive' },
  ],
  'wellness': [
    { title: 'Morning {noun} Session', desc: 'Start your day with peaceful practice' },
    { title: '{adj} Meditation Walk', desc: 'Find inner peace in sacred spaces' },
    { title: 'Spa & {noun} Day', desc: 'Traditional wellness rituals and relaxation' },
    { title: '{adj} Yoga Retreat', desc: 'Mindful movement in beautiful settings' },
  ],
  'learning': [
    { title: '{adj} Photography Walk', desc: 'Capture stunning shots with a local pro' },
    { title: 'Language & {noun} Exchange', desc: 'Learn local phrases over coffee' },
    { title: '{adj} Craft Workshop', desc: 'Create something beautiful to take home' },
    { title: 'Local {noun} Masterclass', desc: 'Learn skills from a passionate expert' },
  ],
};

const ADJECTIVES = ['Hidden', 'Secret', 'Authentic', 'Local', 'Traditional', 'Scenic', 'Vibrant', 'Magical', 'Urban', 'Peaceful'];
const NOUNS = ['Gems', 'Spots', 'Experience', 'Adventure', 'Journey', 'Discovery', 'Escape', 'Tour', 'Culture', 'Vibes'];

const PHOTOS = [
  'photo-1438761681033-6461ffad8d80', 'photo-1507003211169-0a1dd7228f2d', 'photo-1494790108377-be9c29b29330',
  'photo-1534528741775-53994a69daeb', 'photo-1500648767791-00dcc994a43e', 'photo-1580489944761-15a19d654956',
  'photo-1539571696357-5a69c17a67c6', 'photo-1517841905240-472988babdf9', 'photo-1524504388940-b1c1722653e1',
  'photo-1506794778202-cad84cf45f1d', 'photo-1544005313-94ddf0286df2', 'photo-1531746020798-e6953c6e8e04',
  'photo-1507591064344-4c6ce005b128', 'photo-1463453091185-61582044d556', 'photo-1519085360753-af0119f7cbe7',
  'photo-1488426862026-3ee34a7d66df', 'photo-1487412720507-e7ab37603c6f', 'photo-1502685104226-ee32379fefbe',
  'photo-1472099645785-5658abf4ff4e', 'photo-1519345182560-3f2917c472ef',
];

const EXP_PHOTOS = {
  'food-drink': ['photo-1556910103-1c02745aae4d', 'photo-1551024709-8f23befc6f87', 'photo-1414235077428-338989a2e8c0'],
  'arts-culture': ['photo-1518998053901-5348d3961a04', 'photo-1548707309-dcebeab9ea9b', 'photo-1499781350541-7783f6c6a0c8'],
  'outdoor-adventure': ['photo-1501785888041-af3ef285b470', 'photo-1469474968028-56623f02e42e', 'photo-1506905925346-21bda4d32df4'],
  'nightlife-social': ['photo-1514525253161-7a46d19cd819', 'photo-1470225620780-dba8ba36b745', 'photo-1516450360452-9312f5e86fc7'],
  'wellness': ['photo-1503899036084-c55cdd92da26', 'photo-1544367567-0f2fcb009e0b', 'photo-1506126613408-eca07ce68773'],
  'learning': ['photo-1452587925148-ce544e77e70d', 'photo-1513475382585-d06e58bcb0e0', 'photo-1460518451285-97b6aa326961'],
};

function random<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randomInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }

function generateHost(index: number) {
  const firstName = random(FIRST_NAMES);
  const lastName = random(LAST_NAMES);
  const location = random(CITIES);
  const interests = random(INTEREST_SETS);
  const photo = random(PHOTOS);
  
  const numExperiences = randomInt(1, 3);
  const experiences = [];
  const usedCategories = new Set<string>();
  
  for (let i = 0; i < numExperiences; i++) {
    const category = random(CATEGORIES.filter(c => !usedCategories.has(c)));
    usedCategories.add(category);
    const templates = EXPERIENCE_TEMPLATES[category];
    const template = random(templates);
    const adj = random(ADJECTIVES);
    const noun = random(NOUNS);
    
    experiences.push({
      id: `exp-${index}-${i}`,
      title: template.title.replace('{adj}', adj).replace('{noun}', noun),
      description: template.desc,
      category,
      duration: random([90, 120, 150, 180, 240]),
      price: randomInt(25, 150) * 100,
      rating: (4.5 + Math.random() * 0.5).toFixed(1),
      reviewCount: randomInt(5, 200),
      photo: `https://images.unsplash.com/${random(EXP_PHOTOS[category])}?w=600&h=400&fit=crop`,
    });
  }

  return {
    id: `${firstName.toLowerCase()}-${location.city.toLowerCase().replace(/\s+/g, '-')}-${index}`,
    name: `${firstName} ${lastName}`,
    photo: `https://images.unsplash.com/${photo}?w=400&h=400&fit=crop&crop=face`,
    city: location.city,
    country: location.country,
    bio: `Born and raised in ${location.city}. I love sharing my favorite spots with travelers who want to experience the real ${location.city}.`,
    quote: `Let me show you the ${location.city} that only locals know.`,
    interests,
    languages: ['English', random(['Spanish', 'French', 'German', 'Japanese', 'Mandarin', 'Portuguese', 'Italian', 'Korean', 'Arabic', 'Hindi'])],
    responseTime: random(['within an hour', 'within a few hours', 'within a day']),
    memberSince: String(randomInt(2020, 2025)),
    experiences,
  };
}

// Generate 100 hosts
const generatedHosts = Array.from({ length: 100 }, (_, i) => generateHost(i));
console.log(JSON.stringify(generatedHosts, null, 2));
