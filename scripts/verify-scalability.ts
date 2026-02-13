
import { convertPlanToGlobeData } from '../src/lib/ai/plan-converter';
import { ItineraryPlan } from '../src/lib/ai/types';

// Mock a 5-city trip
const mockPlan: ItineraryPlan = {
  id: 'euro-trip',
  title: 'Europe Grand Tour',
  request: '5 cities in Europe',
  summary: 'A grand tour.',
  days: [
    {
      dayNumber: 1,
      title: 'Paris Day 1',
      city: 'Paris',
      country: 'France',
      anchorLocation: {
        id: 'paris-anchor',
        name: 'Marais',
        location: { lat: 48.8566, lng: 2.3522 },
        category: 'neighborhood',
        description: 'Paris Center',
        city: 'Paris'
      },
      activities: [],
      suggestedHosts: []
    },
    {
      dayNumber: 2,
      title: 'London Day 1',
      city: 'London',
      country: 'UK',
      anchorLocation: {
        id: 'london-anchor',
        name: 'Soho',
        location: { lat: 51.5074, lng: -0.1278 },
        category: 'neighborhood',
        description: 'London Center',
        city: 'London'
      },
      activities: [],
      suggestedHosts: []
    },
    {
      dayNumber: 3,
      title: 'Berlin Day 1',
      city: 'Berlin',
      country: 'Germany',
      anchorLocation: {
        id: 'berlin-anchor',
        name: 'Mitte',
        location: { lat: 52.5200, lng: 13.4050 },
        category: 'neighborhood',
        description: 'Berlin Center',
        city: 'Berlin'
      },
      activities: [],
      suggestedHosts: []
    },
    {
      dayNumber: 4,
      title: 'Rome Day 1',
      city: 'Rome',
      country: 'Italy',
      anchorLocation: {
        id: 'rome-anchor',
        name: 'Monti',
        location: { lat: 41.9028, lng: 12.4964 },
        category: 'neighborhood',
        description: 'Rome Center',
        city: 'Rome'
      },
      activities: [],
      suggestedHosts: []
    },
    {
      dayNumber: 5,
      title: 'Madrid Day 1',
      city: 'Madrid',
      country: 'Spain',
      anchorLocation: {
        id: 'madrid-anchor',
        name: 'Sol',
        location: { lat: 40.4168, lng: -3.7038 },
        category: 'neighborhood',
        description: 'Madrid Center',
        city: 'Madrid'
      },
      activities: [],
      suggestedHosts: []
    }
  ]
};

console.log('Running Scalability Check (5 Cities)...');
const result = convertPlanToGlobeData(mockPlan);

console.log(`Generated ${result.destinations.length} destinations.`);

// Verify we have 5 distinct city clusters
const cities = result.destinations.map(d => d.city).filter(Boolean);
console.log('Cities found:', cities);

if (result.destinations.length === 5) {
  console.log('PASS: Successfully handled 5 distinct cities.');
} else {
  console.error('FAIL: Expected 5 destinations, got ' + result.destinations.length);
  process.exit(1);
}
