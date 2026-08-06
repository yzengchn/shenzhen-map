import { MANHATTAN, BROOKLYN_QUEENS, pointInPoly } from '../src/geo.js';
import { STARTUPS } from '../src/data.js';

// Combine all land polygons
const LAND_POLYS = [MANHATTAN, BROOKLYN_QUEENS].filter(Boolean);

function isOnLand(lat, lng) {
  return LAND_POLYS.some(poly => pointInPoly(lat, lng, poly));
}

console.log('=== Verifying all STARTUPS against corrected coastline ===\n');
let issues = 0;
for (const s of STARTUPS) {
  const onLand = isOnLand(s.lat, s.lng);
  if (!onLand) {
    issues++;
    console.log(`[IN WATER] ${s.nameZh ?? s.name} at [${s.lat}, ${s.lng}] (area: ${s.area})`);
  }
}
if (issues === 0) {
  console.log('All companies are on land!');
} else {
  console.log(`\n${issues} company(ies) in water — need to fix.`);
}

// Also verify key reference points
console.log('\n=== Key reference points ===');
const refs = [
  { name: 'Tencent HQ', lat: 22.540, lng: 113.944 },
  { name: 'DJI Skyworth', lat: 22.577, lng: 113.942 },
  { name: 'Ping An HQ', lat: 22.540, lng: 114.054 },
  { name: 'Shenzhen Bay Port', lat: 22.496, lng: 113.948 },
  { name: 'Xixiang station', lat: 22.575, lng: 113.863 },
  { name: 'Gushu station', lat: 22.601, lng: 113.847 },
  { name: 'Airport East', lat: 22.647, lng: 113.823 },
  { name: 'Houhai station', lat: 22.519, lng: 113.942 },
  { name: "Han's Laser current", lat: 22.610, lng: 113.850 },
  { name: "Han's Laser proposed", lat: 22.610, lng: 113.860 },
];
for (const r of refs) {
  const onLand = isOnLand(r.lat, r.lng);
  console.log(`[${onLand ? 'OK' : 'IN WATER'}] ${r.name} at [${r.lat}, ${r.lng}]`);
}

// Verify shore highway slice indices
console.log('\n=== Shore highway slice verification ===');
console.log('westShore slice(0, 11):');
for (let i = 0; i < 11; i++) {
  console.log(`  [${i}] ${JSON.stringify(MANHATTAN[i])}`);
}
console.log('bayShore slice(13, 23):');
for (let i = 13; i < 23; i++) {
  console.log(`  [${i}] ${JSON.stringify(MANHATTAN[i])}`);
}
console.log(`Total MANHATTAN points: ${MANHATTAN.length}`);
