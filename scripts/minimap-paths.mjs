import {
  SZ_MAINLAND,
  SZ_EAST,
  SZ_HK,
  DACHAN_ISLAND,
} from "../src/geo.js";

const VIEW_W = 160;
const VIEW_H = 120;
const PAD = 8;

const allPoints = [
  ...SZ_MAINLAND,
  ...SZ_EAST,
  ...SZ_HK,
  ...DACHAN_ISLAND,
];

// Match the miniMapPosition() bounds in src/main.js
const minLat = 22.43;
const maxLat = 22.66;
const minLng = 113.80;
const maxLng = 114.20;

console.log("Bounds used:", { minLat, maxLat, minLng, maxLng });

const latSpan = maxLat - minLat;
const lngSpan = maxLng - minLng;
const scaleX = (VIEW_W - PAD * 2) / lngSpan;
const scaleY = (VIEW_H - PAD * 2) / latSpan;

function toSvg([lat, lng]) {
  const x = PAD + (lng - minLng) * scaleX;
  const y = PAD + (maxLat - lat) * scaleY;
  return `${x.toFixed(1)} ${y.toFixed(1)}`;
}

function path(points) {
  if (!points.length) return "";
  return `M ${toSvg(points[0])} ` + points.slice(1).map((p) => `L ${toSvg(p)}`).join(" ") + " Z";
}

console.log("\nSZ_MAINLAND (Shenzhen landmass):");
console.log(path(SZ_MAINLAND));
console.log("\nSZ_EAST (Longgang/Pingshan):");
console.log(path(SZ_EAST));
console.log("\nSZ_HK (Hong Kong sketch):");
console.log(path(SZ_HK));
console.log("\nDACHAN_ISLAND (Dachan island):");
console.log(path(DACHAN_ISLAND));
