import {
  MANHATTAN,
  BROOKLYN_QUEENS,
  JERSEY,
  ROOSEVELT_ISLAND,
} from "../src/geo.js";

const VIEW_W = 160;
const VIEW_H = 120;
const PAD = 8;

const allPoints = [
  ...MANHATTAN,
  ...BROOKLYN_QUEENS,
  ...JERSEY,
  ...ROOSEVELT_ISLAND,
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

console.log("\nMANHATTAN (Shenzhen landmass):");
console.log(path(MANHATTAN));
console.log("\nBROOKLYN_QUEENS (Longgang/Pingshan):");
console.log(path(BROOKLYN_QUEENS));
console.log("\nJERSEY (Hong Kong sketch):");
console.log(path(JERSEY));
console.log("\nROOSEVELT_ISLAND (Dachan island):");
console.log(path(ROOSEVELT_ISLAND));
