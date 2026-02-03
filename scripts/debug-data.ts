import { HOSTS } from '../src/lib/data/hosts';

const yuki = HOSTS.find(h => h.id === 'yuki-lagos-0');
console.log('--- Yuki Lagos Experience Photos ---');
console.log(JSON.stringify(yuki?.experiences[0].photos, null, 2));

console.log('\n--- Curated Host Experience Photos ---');
const maria = HOSTS.find(h => h.id === 'maria-rome');
console.log(JSON.stringify(maria?.experiences[0].photos, null, 2));
