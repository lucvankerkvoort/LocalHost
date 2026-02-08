
import { convertPlanToGlobeData } from '../src/lib/ai/plan-converter';
import { ItineraryPlan } from '../src/lib/ai/types';

// Mock Data
const mockPlan: ItineraryPlan = {
  id: 'test-trip',
  title: 'Test Rome Trip',
  request: 'Rome trip',
  summary: 'A test trip',
  days: [
    {
      dayNumber: 1,
      title: 'Rome Day 1',
      city: 'Rome',
      country: 'Italy',
      anchorLocation: {
        id: 'anchor-1',
        name: 'Colosseum Area',
        location: { lat: 41.8902, lng: 12.4922 },
        city: 'Rome'
      },
      activities: [],
      suggestedHosts: []
    },
    {
      dayNumber: 2,
      title: 'Rome Day 2',
      city: 'Rome', // SAME CITY
      country: 'Italy',
      anchorLocation: {
        id: 'anchor-2',
        name: 'Vatican Area',
        location: { lat: 41.9029, lng: 12.4534 },
        city: 'Rome'
      },
      activities: [],
      suggestedHosts: []
    },
    {
      dayNumber: 3,
      title: 'Florence Day 1',
      city: 'Florence', // DIFFERENT CITY
      country: 'Italy',
      anchorLocation: {
        id: 'anchor-3',
        name: 'Duomo Area',
        location: { lat: 43.7731, lng: 11.256 },
        city: 'Florence'
      },
      activities: [],
      suggestedHosts: []
    }
  ]
};

async function runTest() {
  console.log('Running Consolidation Verification...');
  
  // existingRoutes can be empty for this test
  const result = await convertPlanToGlobeData(mockPlan, []);
  
  const destinations = result.destinations;
  
  console.log(`Generated ${destinations.length} destinations.`);
  
  // Expectation: 2 Destinations (Rome, Florence)
  // NOT 3 (Rome, Rome, Florence)
  
  if (destinations.length === 2) {
    const firstchk = destinations[0].city === 'Rome' && destinations[0].activities.length === 0; // Activities logic adds items, here we have 0 activities but they should be merged. 
    // Wait, the activities merge logic pushes to the array. 
    
    console.log('PASS: Correctly consolidated to 2 destinations.');
    console.log(`Dest 1: ${destinations[0].city} (Lat: ${destinations[0].lat})`);
    console.log(`Dest 2: ${destinations[1].city} (Lat: ${destinations[1].lat})`);
  } else {
    console.error('FAIL: Did not consolidate correctly.');
    destinations.forEach((d, i) => console.log(`Dest ${i+1}: ${d.city}`));
    process.exit(1);
  }
}

runTest().catch(e => {
  console.error(e);
  process.exit(1);
});
