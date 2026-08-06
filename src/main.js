import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { AREAS, CONTEXT_POINTS, COMPANY_INFO, DATA_SOURCES, STARTUPS } from "./data.js";
import {
  SZ_MAINLAND,
  SZ_EAST,
  DACHAN_ISLAND,
  SZ_HK,
  HARBOR_ISLANDS,
  CENTRAL_PARK,
  CENTRAL_PARK_FEATURES,
  PARKS,
  DISTRICTS,
  SUBWAY_LINES,
  LANDMARKS,
  BRIDGES,
  pointInPoly,
  inEllipse,
} from "./geo.js";

const CENTER = { lat: 22.545, lng: 113.955 };
const SCALE = { lat: 1180, lng: 1090 };
const AREA_BY_ID = Object.fromEntries(AREAS.map((area) => [area.id, area]));

const state = {
  activeAreaId: "all",
  selectedId: null,
  labelsMode: window.matchMedia("(max-width: 54rem)").matches ? "key" : "all",
  flight: null,
};

const canvas = document.querySelector("#scene");
const labelsLayer = document.querySelector("#labelsLayer");
const areaList = document.querySelector("#areaList");
const detailCard = document.querySelector("#detailCard");
const miniMapPoints = document.querySelector("#miniMapPoints");
const searchInput = document.querySelector("#companySearch");
const searchResults = document.querySelector("#searchResults");
const searchTrigger = document.querySelector("#searchTrigger");
const searchModal = document.querySelector("#searchModal");
let searchActiveIndex = -1;
const pinLegend = document.querySelector("#pinLegend");

// Active-area description, moved under the selected row in the rail.
const areaDescEl = document.createElement("p");
areaDescEl.className = "area-desc";

const HORIZON = 0xcfe6f2; // pale sky at the horizon; fog fades toward this

function makeSkyTexture() {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 256;
  const ctx = c.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#6fa8d6"); // zenith
  grad.addColorStop(0.45, "#9cc7e6");
  grad.addColorStop(0.8, "#cfe6f2"); // horizon
  grad.addColorStop(1, "#e4f0f6");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const scene = new THREE.Scene();
scene.background = makeSkyTexture();
scene.fog = new THREE.FogExp2(HORIZON, 0.0052);

// Phones get a lighter GPU budget: capped pixel ratio and a smaller shadow map.
const smallScreen = window.matchMedia("(max-width: 54rem)").matches;

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 500);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, smallScreen ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 18;
controls.maxDistance = 140;
controls.maxPolarAngle = Math.PI * 0.47;
controls.screenSpacePanning = false;

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const UP = new THREE.Vector3(0, 1, 0);

const markerMeshes = [];
const startupMarkers = new Map();
const labelElements = new Map();
const labelDims = new Map();
const landmarkLabelElements = [];
const waterSurfaces = [];
const vehicleFleet = [];
const ferryFleet = [];
const planeFleet = [];
const subwayFleet = [];
const birdFleet = [];
let birdMesh = null;
const sidewalkPlates = []; // block-plate centers, filled by createBuildings
const pedFleet = [];
let pedMesh = null;
let pedRect = null;
const treeBuffer = []; // { x, z, type: "conifer"|"round", scale, rot, colorIndex }
let hoverCandidate = null;
let pointerDown = null; // { x, y, item } captured on pointerdown to tell clicks from drags

// Greenery palette: a spread of Shenzhen park greens for per-instance tree color.
const GREEN_PALETTE = [
  0x3d6b39, 0x4a7d45, 0x557f42, 0x5e8a4c, 0x6d9a58, 0x7fa866, 0x4f7237,
].map((c) => new THREE.Color(c));

const colors = {
  accent: new THREE.Color(0x2664ff),
  cyan: new THREE.Color(0x33d6c7),
  green: new THREE.Color(0x32bd7b),
  yellow: new THREE.Color(0xffcc4d),
  red: new THREE.Color(0xe54c42),
  graphite: new THREE.Color(0x19202b),
  land: new THREE.Color(0xd2cec2),
  land2: new THREE.Color(0xc7c2b2),
  road: new THREE.Color(0x2b2f38),
  building: new THREE.Color(0xd9d6ca),
  buildingDark: new THREE.Color(0x8e9899),
};

// Near-white concrete mottle multiplied over the land fills: block-scale
// tonal blotches plus fine speckle, so the ground stops reading as one
// flat sheet of beige. Generated once; zero per-frame cost.
function makeGroundTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 512, 512);
  const rand = seededRandom(4242);
  for (let i = 0; i < 70; i += 1) {
    const r = 36 + rand() * 96;
    const x = rand() * 512;
    const y = rand() * 512;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const warm = rand() > 0.5;
    g.addColorStop(0, warm ? "rgba(150, 138, 116, 0.05)" : "rgba(96, 104, 116, 0.05)");
    g.addColorStop(1, "rgba(120, 120, 120, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 2400; i += 1) {
    ctx.fillStyle = `rgba(72, 78, 88, ${0.012 + rand() * 0.03})`;
    const s = 1 + rand() * 2.4;
    ctx.fillRect(rand() * 512, rand() * 512, s, s);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(0.22, 0.22);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const groundTexture = makeGroundTexture();

const materials = {
  water: new THREE.MeshStandardMaterial({
    color: 0x2a6488,
    roughness: 0.4,
    metalness: 0.18,
  }),
  land: new THREE.MeshStandardMaterial({
    color: colors.land,
    map: groundTexture,
    roughness: 0.82,
    side: THREE.DoubleSide,
  }),
  // The mainland ground plane IS the street surface; blocks sit on it as
  // raised sidewalk plates, so streets need no line meshes at all.
  asphalt: new THREE.MeshStandardMaterial({
    color: 0x7a7e85,
    map: groundTexture,
    roughness: 0.96,
    side: THREE.DoubleSide,
  }),
  landAlt: new THREE.MeshStandardMaterial({
    color: colors.land2,
    map: groundTexture,
    roughness: 0.9,
    side: THREE.DoubleSide,
  }),
  park: new THREE.MeshStandardMaterial({
    color: 0x679c58,
    roughness: 0.9,
    side: THREE.DoubleSide,
  }),
  parkLight: new THREE.MeshStandardMaterial({
    color: 0x86ad6c,
    roughness: 0.92,
    side: THREE.DoubleSide,
  }),
  parkDark: new THREE.MeshStandardMaterial({
    color: 0x4c7847,
    roughness: 0.95,
    side: THREE.DoubleSide,
  }),
  path: new THREE.MeshStandardMaterial({
    color: 0xd8cfaa,
    roughness: 0.86,
  }),
  pond: new THREE.MeshStandardMaterial({
    color: 0x467f9b,
    roughness: 0.46,
    metalness: 0.04,
    side: THREE.DoubleSide,
  }),
  road: new THREE.MeshStandardMaterial({
    color: 0x5b6068,
    roughness: 0.82,
  }),
  street: new THREE.MeshStandardMaterial({
    color: 0x767b82,
    roughness: 0.86,
  }),
  rail: new THREE.MeshStandardMaterial({
    color: 0xb7c0c6,
    roughness: 0.6,
  }),
  bridge: new THREE.MeshStandardMaterial({
    color: 0xd6c9a8,
    roughness: 0.65,
  }),
  seawall: new THREE.MeshStandardMaterial({
    color: 0xcfc6a8,
    roughness: 0.8,
  }),
  building: new THREE.MeshStandardMaterial({
    color: colors.building,
    roughness: 0.72,
  }),
  roof: new THREE.MeshStandardMaterial({
    color: 0x657071,
    roughness: 0.7,
  }),
  roofColored: new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.74,
  }),
  treeLeaf: new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.92,
    flatShading: true,
  }),
  treeTrunk: new THREE.MeshStandardMaterial({
    color: 0x6b4f33,
    roughness: 0.9,
  }),
  hill: new THREE.MeshStandardMaterial({
    color: 0x63904f,
    roughness: 0.96,
    flatShading: true,
  }),
  glass: new THREE.MeshStandardMaterial({
    color: 0x8fb4bd,
    roughness: 0.26,
    metalness: 0.1,
    transparent: true,
    opacity: 0.9,
  }),
  landmark: new THREE.MeshStandardMaterial({
    color: 0xcfc8b8,
    roughness: 0.55,
  }),
  copper: new THREE.MeshStandardMaterial({
    color: 0x5fac85,
    roughness: 0.62,
    metalness: 0.04,
  }),
  subway: new THREE.MeshStandardMaterial({
    color: 0x169b62,
    roughness: 0.44,
    emissive: new THREE.Color(0x072b19),
  }),
  ghost: new THREE.MeshStandardMaterial({
    color: 0xd8d4c9,
    roughness: 0.95,
  }),
  ferry: new THREE.MeshStandardMaterial({
    color: 0xf4f1e8,
    roughness: 0.48,
  }),
  plane: new THREE.MeshStandardMaterial({
    color: 0xf0f4f6,
    roughness: 0.4,
  }),
  window: new THREE.MeshStandardMaterial({
    color: 0x36495c,
    roughness: 0.38,
    metalness: 0.08,
    emissive: new THREE.Color(0x07121b),
  }),
  context: new THREE.MeshStandardMaterial({
    color: 0xe8b500,
    roughness: 0.62,
    emissive: new THREE.Color(0x211600),
  }),
};

function project(lat, lng, y = 0) {
  return new THREE.Vector3((lng - CENTER.lng) * SCALE.lng, y, -(lat - CENTER.lat) * SCALE.lat);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function logoPath(item) {
  return `/logos/${item.id}.svg`;
}

function sourceLabel(item) {
  if (item.source === "felt+airtable") return "Airtable matched";
  if (item.source === "user") return "User supplied";
  return "Felt mapped";
}

function areaItems(areaId) {
  if (areaId === "all") return STARTUPS;
  return STARTUPS.filter((startup) => startup.area === areaId);
}

function stageColor(stage) {
  if (stage === "上市") return colors.yellow;
  if (stage === "后期") return colors.cyan;
  if (stage === "早期") return colors.green;
  return colors.accent;
}

function seededRandom(seed) {
  let t = seed + 0x6d2b79f5;
  return function random() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function makeShape(coords, material, y = 0, shadow = false) {
  const shape = new THREE.Shape();
  coords.forEach(([lat, lng], index) => {
    const p = project(lat, lng);
    if (index === 0) shape.moveTo(p.x, p.z);
    else shape.lineTo(p.x, p.z);
  });
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = y;
  mesh.receiveShadow = shadow;
  scene.add(mesh);
  return mesh;
}

function makeTube(coords, radius, material, y = 0.05, segments = 80) {
  const points = coords.map(([lat, lng]) => project(lat, lng, y));
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, segments, radius, 8, false);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return { mesh, points };
}

function makeCurveTube(points, radius, material, segments = 48) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, segments, radius, 8, false);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function createLights() {
  const hemi = new THREE.HemisphereLight(0xdbefff, 0x4a4335, 2.75);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffedc9, 3.45);
  sun.castShadow = true;
  sun.shadow.mapSize.set(smallScreen ? 1024 : 2048, smallScreen ? 1024 : 2048);
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 220;
  // The city footprint spans roughly x [-45, 55], z [-110, 45], so the shadow
  // box is recentered on it (the old origin-centered box cut Harlem off).
  // The bias pair removes acne/peter-panning on the box facades.
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80;
  sun.shadow.camera.bottom = -80;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.02;
  sun.target.position.set(5, 0, -32);
  sun.position.set(5 - 52, 46, -32 + 40);
  scene.add(sun.target);
  scene.add(sun);

  createSunGlow();
}

// A single additive glow sprite hanging in the sun's direction: gives the
// sky a light source and the haze a reason, for the cost of one sprite.
function createSunGlow() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255, 247, 224, 0.95)");
  g.addColorStop(0.22, "rgba(255, 238, 200, 0.5)");
  g.addColorStop(0.55, "rgba(255, 228, 184, 0.16)");
  g.addColorStop(1, "rgba(255, 228, 184, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  // Same azimuth as the sun light, dropped near the horizon so orbiting
  // cameras actually catch it over the Hudson.
  sprite.position.set(-200, 82, 128);
  sprite.scale.setScalar(170);
  scene.add(sprite);
}

function createShoreline(coords) {
  makeTube([...coords, coords[0]], 0.045, materials.seawall, 0.12, Math.max(48, coords.length * 14));
}

function createPier(lat, lng, width, depth, rotation = 0) {
  const p = project(lat, lng, 0.08);
  const group = new THREE.Group();
  group.position.copy(p);
  group.rotation.y = rotation;

  const deck = new THREE.Mesh(new THREE.BoxGeometry(width, 0.16, depth), materials.seawall);
  deck.position.y = 0.1;
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  const postGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.42, 8);
  for (const x of [-width * 0.38, width * 0.38]) {
    for (const z of [-depth * 0.36, depth * 0.36]) {
      const post = new THREE.Mesh(postGeo, materials.bridge);
      post.position.set(x, -0.04, z);
      post.castShadow = true;
      group.add(post);
    }
  }
  scene.add(group);
}

function ellipseCoords(lat, lng, latRadius, lngRadius, steps = 28) {
  return Array.from({ length: steps }, (_, index) => {
    const angle = (index / steps) * Math.PI * 2;
    return [lat + Math.sin(angle) * latRadius, lng + Math.cos(angle) * lngRadius];
  });
}

function createBlockAt(lat, lng, width, depth, height, material, rotation = 0, y = 0) {
  const p = project(lat, lng, y);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(p.x, y + height / 2, p.z);
  mesh.rotation.y = rotation;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function addLandmarkLabel(name, lat, lng, y = 3) {
  const el = document.createElement("div");
  el.className = "landmark-label";
  el.textContent = name;
  labelsLayer.appendChild(el);
  landmarkLabelElements.push({ el, point: { lat, lng, y } });
}

// Queue a tree to be built later in one batched instanced draw.
function addTree(lat, lng, random, { type, scaleBase = 1 } = {}) {
  const p = project(lat, lng);
  treeBuffer.push({
    x: p.x,
    z: p.z,
    type: type || (random() < 0.42 ? "conifer" : "round"),
    scale: scaleBase * (0.62 + random() * 0.7),
    rot: random() * Math.PI,
    colorIndex: Math.floor(random() * GREEN_PALETTE.length),
  });
}

// Fill a polygon with trees at a given target count; optional water exclusion.
function scatterTreesInPoly(poly, count, random, opts = {}) {
  const lats = poly.map((c) => c[0]);
  const lngs = poly.map((c) => c[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  let placed = 0;
  let guard = 0;
  const cap = count * 20;
  while (placed < count && guard < cap) {
    guard += 1;
    const lat = minLat + random() * (maxLat - minLat);
    const lng = minLng + random() * (maxLng - minLng);
    if (!pointInPoly(lat, lng, poly)) continue;
    if (opts.avoidWater && CENTRAL_PARK_FEATURES.some((f) => f.kind === "water" && inEllipse(lat, lng, f))) continue;
    addTree(lat, lng, random, opts);
    placed += 1;
  }
}

// Build every queued tree into three instanced meshes (cones, blobs, trunks).
// Street-tree rows along the boulevards where Shenzhen residents expect them:
// Shennan Avenue median plus the Binhai and Beihuan esplanades.
function createStreetTrees() {
  const rows = [
    { from: [22.533, 113.930], to: [22.545, 114.060], step: 0.8 },
    { from: [22.508, 113.930], to: [22.520, 114.030], step: 0.95 },
    { from: [22.568, 113.930], to: [22.580, 114.060], step: 1.05 },
  ];
  const random = seededRandom(9001);
  rows.forEach((row) => {
    const a = project(row.from[0], row.from[1]);
    const b = project(row.to[0], row.to[1]);
    const count = Math.max(2, Math.floor(a.distanceTo(b) / row.step));
    for (let i = 0; i <= count; i += 1) {
      const t = i / count;
      const lat = row.from[0] + (row.to[0] - row.from[0]) * t;
      const lng = row.from[1] + (row.to[1] - row.from[1]) * t;
      if (!pointInPoly(lat, lng, SZ_MAINLAND)) continue;
      if (pointInPoly(lat, lng, CENTRAL_PARK)) continue;
      const p = project(lat, lng);
      treeBuffer.push({
        x: p.x + (random() - 0.5) * 0.16,
        z: p.z + (random() - 0.5) * 0.16,
        type: "round",
        scale: 0.48 + random() * 0.24,
        rot: random() * Math.PI,
        colorIndex: Math.floor(random() * GREEN_PALETTE.length),
      });
    }
  });
}

function buildTrees() {
  if (!treeBuffer.length) return;
  const conifers = treeBuffer.filter((t) => t.type === "conifer");
  const rounds = treeBuffer.filter((t) => t.type === "round");

  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const col = new THREE.Color();

  if (conifers.length) {
    const geo = new THREE.ConeGeometry(0.16, 0.62, 6);
    const mesh = new THREE.InstancedMesh(geo, materials.treeLeaf, conifers.length);
    mesh.castShadow = true;
    conifers.forEach((t, i) => {
      pos.set(t.x, 0.31 * t.scale + 0.05, t.z);
      quat.setFromAxisAngle(UP, t.rot);
      scl.setScalar(t.scale);
      matrix.compose(pos, quat, scl);
      mesh.setMatrixAt(i, matrix);
      col.copy(GREEN_PALETTE[t.colorIndex]);
      mesh.setColorAt(i, col);
    });
    scene.add(mesh);
  }

  if (rounds.length) {
    const leafGeo = new THREE.IcosahedronGeometry(0.24, 0);
    const leafMesh = new THREE.InstancedMesh(leafGeo, materials.treeLeaf, rounds.length);
    leafMesh.castShadow = true;
    const trunkGeo = new THREE.CylinderGeometry(0.035, 0.05, 0.22, 5);
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, materials.treeTrunk, rounds.length);
    trunkMesh.castShadow = true;
    rounds.forEach((t, i) => {
      const trunkH = 0.2 * t.scale;
      pos.set(t.x, trunkH / 2 + 0.05, t.z);
      quat.setFromAxisAngle(UP, 0);
      scl.set(t.scale, t.scale, t.scale);
      matrix.compose(pos, quat, scl);
      trunkMesh.setMatrixAt(i, matrix);

      pos.set(t.x, trunkH + 0.2 * t.scale + 0.05, t.z);
      quat.setFromAxisAngle(UP, t.rot);
      scl.set(t.scale, t.scale * 0.92, t.scale);
      matrix.compose(pos, quat, scl);
      leafMesh.setMatrixAt(i, matrix);
      col.copy(GREEN_PALETTE[t.colorIndex]);
      leafMesh.setColorAt(i, col);
    });
    scene.add(trunkMesh);
    scene.add(leafMesh);
  }
}

// Low-poly faceted grass mound for gentle, rolling terrain.
function createHill(lat, lng, radius, height, tint = 0) {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const mat = materials.hill.clone();
  if (tint) mat.color.offsetHSL(0, 0, tint);
  const mesh = new THREE.Mesh(geo, mat);
  const p = project(lat, lng);
  mesh.scale.set(radius, height, radius);
  mesh.position.set(p.x, 0.05, p.z); // equator at the grass plane; cap forms the hill
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

function createCentralParkDetails() {
  const random = seededRandom(930);

  // Green base.
  makeShape(CENTRAL_PARK, materials.park, 0.045, true);

  // Rolling hills (the summit ridge and surrounding slopes).
  const hills = [
    [22.5640, 114.0700, 3.2, 0.5, 0.04],
    [22.5620, 114.0680, 2.8, 0.42, 0.0],
    [22.5650, 114.0720, 3.0, 0.46, -0.03],
    [22.5605, 114.0710, 2.4, 0.36, 0.05],
    [22.5660, 114.0690, 2.6, 0.4, 0.02],
    [22.5590, 114.0690, 2.2, 0.34, 0.03],
  ];
  hills.forEach(([lat, lng, r, h, tint]) => createHill(lat, lng, r, h, tint));

  // Lawns + water sit on the flat ground (the hills are placed away from them).
  CENTRAL_PARK_FEATURES.forEach((f) => {
    const coords = ellipseCoords(f.lat, f.lng, f.rLat, f.rLng, 30);
    if (f.kind === "water") makeShape(coords, materials.pond, 0.085, true);
    else makeShape(coords, materials.parkLight, 0.07, true);
  });

  // Park walking loop around the summit.
  makeTube(
    [
      [22.5575, 114.0690],
      [22.5600, 114.0750],
      [22.5660, 114.0730],
      [22.5650, 114.0670],
      [22.5610, 114.0645],
      [22.5575, 114.0690],
    ],
    0.02,
    materials.path,
    0.06,
    90,
  );

  // A tree-lined allée up to the summit plaza.
  const mallA = [22.5585, 114.0690];
  const mallB = [22.5630, 114.0710];
  for (let i = 0; i <= 9; i += 1) {
    const t = i / 9;
    const lat = mallA[0] + (mallB[0] - mallA[0]) * t;
    const lng = mallA[1] + (mallB[1] - mallA[1]) * t;
    addTree(lat - 0.0004, lng - 0.00055, random, { type: "round", scaleBase: 1.25 });
    addTree(lat + 0.0004, lng + 0.00055, random, { type: "round", scaleBase: 1.25 });
  }

  // General canopy across the park (avoid the water bodies).
  scatterTreesInPoly(CENTRAL_PARK, 260, random, { avoidWater: true });

  // Dense woodland on the north slope.
  const northWoods = ellipseCoords(22.5660, 114.0695, 0.0022, 0.0028, 12);
  scatterTreesInPoly(northWoods, 80, random, { type: "conifer", scaleBase: 1.15 });
}

function createParks() {
  PARKS.forEach((coords) => makeShape(coords, materials.park, 0.05, true));

  const random = seededRandom(311);
  PARKS.filter((p) => p.length >= 4).forEach((poly) => scatterTreesInPoly(poly, 16, random));
}

function createHarborIslands() {
  HARBOR_ISLANDS.forEach((isle) => {
    const coords = ellipseCoords(isle.lat, isle.lng, isle.rLat, isle.rLng, 24);
    makeShape(coords, materials.landAlt, 0.01, true);
    createShoreline(coords);
    if (isle.name === "Nei Lingding Island") {
      makeShape(ellipseCoords(isle.lat, isle.lng, isle.rLat * 0.6, isle.rLng * 0.6, 18), materials.park, 0.05, true);
    }
  });
}

function createBaseMap() {
  const waterGeo = new THREE.PlaneGeometry(260, 230, 80, 72);
  const water = new THREE.Mesh(waterGeo, materials.water);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.18;
  water.receiveShadow = true;
  water.userData.baseZ = waterGeo.attributes.position.array.slice();
  scene.add(water);
  waterSurfaces.push(water);

  makeShape(SZ_MAINLAND, materials.asphalt, 0, true);
  createShoreline(SZ_MAINLAND);

  makeShape(SZ_EAST, materials.landAlt, 0, true);
  createShoreline(SZ_EAST);

  makeShape(SZ_HK, materials.land, 0, true);
  createShoreline(SZ_HK);

  makeShape(DACHAN_ISLAND, materials.landAlt, 0.01, true);
  createShoreline(DACHAN_ISLAND);

  createHarborIslands();
  createParks();
  createCentralParkDetails();

  // Chiwan/Shekou port piers (west coast, Pearl River side)
  createPier(22.465, 113.884, 2.4, 0.5, 0.4); // Chiwan Container Terminal
  createPier(22.460, 113.895, 2.4, 0.5, 0.4); // Shekou Container Terminal
  createPier(22.470, 113.912, 2.6, 0.52, 0.4); // Shekou Cruise Center
  // Shenzhen Bay marina piers
  createPier(22.500, 113.950, 1.8, 0.42, -0.7); // SZ Bay Port area
  createPier(22.510, 113.965, 1.8, 0.42, -0.7); // SZ Bay Park
}

// Shenzhen's grid is ~N-S/E-W with a slight tilt. Build it in a local frame
// and clip every segment to the landmass so streets never run over water.
const GRID = (() => {
  const theta = (5 * Math.PI) / 180;
  const k = Math.cos((22.55 * Math.PI) / 180); // lng compression
  // unit vectors (in lat/lng degrees) for "uptown" and "crosstown-east"
  const av = { dlat: Math.cos(theta), dlng: Math.sin(theta) / k }; // along avenues
  const st = { dlat: Math.cos(theta + Math.PI / 2), dlng: Math.sin(theta + Math.PI / 2) / k };
  const origin = { lat: 22.538, lng: 113.950 }; // near Nanshan-Futian boundary
  return { av, st, origin };
})();

// Lattice spacing shared by the buildings, the sidewalk plates, and the
// traffic network, so cars drive in the same gaps the blocks leave open.
const CELL_U = 0.00094; // street-to-street spacing (degree units along av)
const CELL_V = 0.0026; // avenue-to-avenue spacing (degree units along st)
const GRID_METRICS = (() => {
  const gridOrigin = project(GRID.origin.lat, GRID.origin.lng);
  const uVec = project(
    GRID.origin.lat + GRID.av.dlat * CELL_U,
    GRID.origin.lng + GRID.av.dlng * CELL_U,
  ).sub(gridOrigin); // short block side (street to street)
  const vVec = project(
    GRID.origin.lat + GRID.st.dlat * CELL_V,
    GRID.origin.lng + GRID.st.dlng * CELL_V,
  ).sub(gridOrigin); // long block side (avenue to avenue)
  return {
    uVec,
    vVec,
    uLen: uVec.length(),
    vLen: vVec.length(),
    rot: Math.atan2(uVec.x, uVec.z),
  };
})();

function createBridgeDetails() {
  const deckHeight = 0.62;
  const towerHeight = 2.2;
  BRIDGES.forEach((bridge) => {
    // Roadway deck
    const deckPts = bridge.deck.map(([lat, lng]) => project(lat, lng, deckHeight));
    makeCurveTube(deckPts, 0.07, materials.bridge, 60);

    // Towers
    const towerW = bridge.type === "suspension" ? 0.22 : 0.26;
    bridge.towers.forEach(([lat, lng]) => {
      const p = project(lat, lng);
      const tStruct = new THREE.Group();
      for (const offset of [-0.22, 0.22]) {
        const leg = new THREE.Mesh(
          new THREE.BoxGeometry(towerW, towerHeight, towerW),
          materials.bridge,
        );
        leg.position.set(p.x + offset, deckHeight + towerHeight / 2, p.z);
        leg.castShadow = true;
        tStruct.add(leg);
      }
      // Cross beam
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.16, towerW),
        materials.bridge,
      );
      beam.position.set(p.x, deckHeight + towerHeight - 0.2, p.z);
      tStruct.add(beam);
      scene.add(tStruct);
    });

    // Suspension cables: catenary from tower tops sagging to mid-deck
    if (bridge.type === "suspension" && bridge.towers.length === 2) {
      const t0 = bridge.towers[0];
      const t1 = bridge.towers[1];
      const p0 = project(t0[0], t0[1], deckHeight + towerHeight);
      const p1 = project(t1[0], t1[1], deckHeight + towerHeight);
      for (const side of [-0.22, 0.22]) {
        const mid = new THREE.Vector3()
          .addVectors(p0, p1)
          .multiplyScalar(0.5);
        mid.y = deckHeight + 0.5;
        const a = p0.clone();
        const b = p1.clone();
        a.x += side;
        b.x += side;
        mid.x += side;
        makeCurveTube([a, mid, b], 0.015, materials.bridge, 40);
      }
    }
  });
}

function createSubwayTrainMesh(color = 0x169b62) {
  const group = new THREE.Group();
  const carMaterial = new THREE.MeshStandardMaterial({ color: 0xe6eaec, roughness: 0.34, metalness: 0.1 });
  const stripeMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.4,
    emissive: new THREE.Color(color).multiplyScalar(0.2),
  });
  for (let i = 0; i < 3; i += 1) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.62), carMaterial);
    car.position.z = (i - 1) * 0.66;
    car.position.y = 0.14;
    car.castShadow = true;
    group.add(car);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.035, 0.5), stripeMaterial);
    stripe.position.set(0, 0.2, (i - 1) * 0.66);
    group.add(stripe);
  }
  group.scale.setScalar(0.7);
  return group;
}

// Lines that run outdoors once they leave the mainland climb onto elevated
// viaducts outside the core, so overground tracks visibly weave through the cityscape.
const ELEVATED_OUTSIDE = new Set(["7", "L"]);
const VIADUCT_Y = 0.58;

function trackY(line, lat, lng, baseY) {
  const onMainland = pointInPoly(lat, lng, SZ_MAINLAND) || pointInPoly(lat, lng, DACHAN_ISLAND);
  if (onMainland) return baseY;
  const onFarBank = pointInPoly(lat, lng, SZ_EAST) || pointInPoly(lat, lng, SZ_HK);
  if (onFarBank) return ELEVATED_OUTSIDE.has(line.name) ? VIADUCT_Y : baseY;
  return -0.62; // over open water: dive into a river tunnel
}

// Densely resampled route with a real vertical profile: surface ribbon on
// On the mainland, a dip below the rivers, a viaduct on the far bank.
function subwayProfile(line, baseY) {
  const points = [];
  const elevated = [];
  const stops = line.stops;
  for (let s = 0; s < stops.length - 1; s += 1) {
    const [aLat, aLng] = stops[s];
    const [bLat, bLng] = stops[s + 1];
    const segs = Math.max(2, Math.round(project(aLat, aLng).distanceTo(project(bLat, bLng)) / 0.9));
    for (let k = 0; k < segs; k += 1) {
      const t = k / segs;
      const lat = aLat + (bLat - aLat) * t;
      const lng = aLng + (bLng - aLng) * t;
      const y = trackY(line, lat, lng, baseY);
      const point = project(lat, lng, y);
      points.push(point);
      if (y === VIADUCT_Y) elevated.push(point);
    }
  }
  const [lastLat, lastLng] = stops[stops.length - 1];
  points.push(project(lastLat, lastLng, trackY(line, lastLat, lastLng, baseY)));
  return { points, elevated };
}

function createSubwayLayer() {
  // MTA-diagram styling: white station discs with a dark rim over the
  // colored route lines.
  const stationMaterial = new THREE.MeshStandardMaterial({
    color: 0xf6f7f4,
    roughness: 0.4,
    emissive: new THREE.Color(0x1a1a1a),
  });
  const stationRimMaterial = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.6 });
  const stationGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.05, 16);
  const stationRimGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.036, 16);
  const pierGeo = new THREE.CylinderGeometry(0.032, 0.05, 1, 8);
  const pierMaterial = new THREE.MeshStandardMaterial({ color: 0x4b5158, roughness: 0.7 });

  SUBWAY_LINES.forEach((line, lineIndex) => {
    const lineMaterial = new THREE.MeshStandardMaterial({
      color: line.color,
      roughness: 0.45,
      emissive: new THREE.Color(line.color).multiplyScalar(0.3),
    });
    const y = 0.05 + lineIndex * 0.007; // tiny stagger so overlapping lines don't z-fight
    const { points, elevated } = subwayProfile(line, y);
    const curve = new THREE.CatmullRomCurve3(points);
    const track = new THREE.Mesh(
      new THREE.TubeGeometry(curve, points.length * 3, 0.04, 8, false),
      lineMaterial,
    );
    track.castShadow = true;
    track.receiveShadow = true;
    scene.add(track);

    // Viaduct piers hold the elevated stretches up.
    elevated.forEach((point, index) => {
      if (index % 2 !== 0) return;
      const pier = new THREE.Mesh(pierGeo, pierMaterial);
      pier.scale.y = point.y;
      pier.position.set(point.x, point.y / 2, point.z);
      pier.castShadow = true;
      scene.add(pier);
    });

    line.stops.forEach(([lat, lng]) => {
      const stationY = trackY(line, lat, lng, y);
      if (stationY < 0) return; // no station discs in the river
      const p = project(lat, lng, stationY + 0.035);
      const rim = new THREE.Mesh(stationRimGeo, stationRimMaterial);
      rim.position.copy(p);
      scene.add(rim);
      const disk = new THREE.Mesh(stationGeo, stationMaterial);
      disk.position.copy(p);
      disk.position.y += 0.02;
      scene.add(disk);
    });

    // One train per line; the long trunk lines run a second. Trains ride the
    // same profile, so they visibly dive into the river tunnels and climb
    // the viaducts.
    const trainCount = line.stops.length >= 10 ? 2 : 1;
    for (let i = 0; i < trainCount; i += 1) {
      const train = createSubwayTrainMesh(line.color);
      scene.add(train);
      subwayFleet.push({
        mesh: train,
        path: points,
        t: lineIndex * 0.27 + i * 0.5,
        speed: 0.016 + lineIndex * 0.002,
      });
    }
  });

  addLandmarkLabel("市民中心", LANDMARKS.civicCenter.lat, LANDMARKS.civicCenter.lng, 2.7);
}

function createFerryMesh(accent = 0x2e6cff) {
  const group = new THREE.Group();
  const hullMaterial = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.42 });
  const cabinMaterial = materials.ferry;
  const hull = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 1.3), hullMaterial);
  hull.position.y = 0.12;
  hull.castShadow = true;
  group.add(hull);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.28, 0.6), cabinMaterial);
  cabin.position.y = 0.34;
  cabin.castShadow = true;
  group.add(cabin);

  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.42, 4), hullMaterial);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.z = Math.PI / 4;
  bow.position.set(0, 0.12, 0.82);
  group.add(bow);
  group.scale.setScalar(0.86);
  return group;
}

function createFerries() {
  const routes = [
    {
      // Shenzhen Bay: ferries running along the bay shore from Shekou to Futian
      color: 0x2e6cff,
      path: [
        [22.455, 113.915],
        [22.470, 113.935],
        [22.485, 113.955],
        [22.498, 113.975],
        [22.510, 113.995],
        [22.518, 114.015],
        [22.512, 114.035],
      ],
    },
    {
      // Pearl River / Qianhai: ferries up the west channel from Chiwan to Bao'an
      color: 0xffcc4d,
      path: [
        [22.465, 113.875],
        [22.485, 113.868],
        [22.510, 113.862],
        [22.540, 113.858],
        [22.568, 113.850],
        [22.590, 113.842],
      ],
    },
    {
      // Shekou harbor loop: around the port peninsula, in ferry orange.
      color: 0xf25c19,
      path: [
        [22.452, 113.900],
        [22.448, 113.888],
        [22.455, 113.875],
        [22.463, 113.875],
        [22.468, 113.888],
        [22.465, 113.902],
        [22.452, 113.900],
      ],
    },
  ];
  routes.forEach((route, index) => {
    const points = route.path.map(([lat, lng]) => project(lat, lng, 0.1));
    const mesh = createFerryMesh(route.color);
    mesh.add(createWake());
    scene.add(mesh);
    ferryFleet.push({ mesh, path: points, t: index * 0.43, speed: 0.013 + index * 0.004, lane: 0 });
  });
}

// A soft white trail that rides behind each ferry; static texture, no
// per-frame updates, it just travels with its parent.
function createWake() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext("2d");
  // After the plane is laid flat (rotation.x = -PI/2) the canvas bottom edge
  // faces the stern, so the bright end of the trail lives at y = 128.
  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(0.65, "rgba(255,255,255,0.3)");
  grad.addColorStop(1, "rgba(255,255,255,0.75)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 128);
  const tex = new THREE.CanvasTexture(c);
  const wake = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 1.7),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  wake.rotation.x = -Math.PI / 2;
  wake.position.set(0, -0.05, -1.25);
  return wake;
}

function createPlaneMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 1.6), materials.plane);
  body.castShadow = true;
  group.add(body);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.05, 0.34), materials.plane);
  wing.position.z = -0.08;
  group.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.05, 0.22), materials.plane);
  tail.position.z = -0.66;
  tail.position.y = 0.16;
  group.add(tail);
  group.scale.setScalar(0.9);
  return group;
}

function createPlanes() {
  const flightPaths = [
    [
      [22.520, 113.800, 17],
      [22.535, 113.870, 20],
      [22.545, 113.950, 19],
    ],
    [
      [22.580, 113.790, 24],
      [22.560, 113.860, 22],
      [22.540, 113.940, 20],
    ],
  ];
  flightPaths.forEach((path, index) => {
    const mesh = createPlaneMesh();
    scene.add(mesh);
    planeFleet.push({
      mesh,
      path: path.map(([lat, lng, y]) => project(lat, lng, y)),
      t: index * 0.48,
      speed: 0.01 + index * 0.003,
    });
  });
}

// Streets ARE the gaps between the sidewalk block plates, so traffic paths
// are generated on the same lattice the buildings use: every avenue with
// enough land under it, the major crosstown streets, the two shoreline
// highways, and the bridge decks. Every path is clipped to land, so cars
// never drive through buildings, parks, or water.
const ROAD_Y = 0.055;

function streetAllowed(lat, lng) {
  if (!pointInPoly(lat, lng, SZ_MAINLAND)) return false;
  if (pointInPoly(lat, lng, CENTRAL_PARK)) return false;
  for (const park of PARKS) {
    if (pointInPoly(lat, lng, park)) return false;
  }
  return true;
}

function gridStreetPoint(u, v, y) {
  const lat = GRID.origin.lat + GRID.av.dlat * u + GRID.st.dlat * v;
  const lng = GRID.origin.lng + GRID.av.dlng * u + GRID.st.dlng * v;
  return { lat, lng, point: project(lat, lng, y) };
}

function createStreetNetwork() {
  const paths = [];
  const flushRun = (run, minLength) => {
    if (run.length >= minLength) paths.push(run);
    return [];
  };

  // Avenues: one traffic lane per lattice line, broken at parks and water.
  for (let j = -70; j <= 70; j += 1) {
    let run = [];
    for (let i = -100; i <= 140; i += 1) {
      const { lat, lng, point } = gridStreetPoint(i * CELL_U, j * CELL_V, ROAD_Y);
      if (streetAllowed(lat, lng)) run.push(point);
      else run = flushRun(run, 8);
    }
    flushRun(run, 8);
  }

  // Major crosstown boulevards: Binhai, Shennan, Beihuan, etc.
  for (const i of [-90, -70, -50, -30, -10, 10, 30, 50, 70, 90, 110, 130]) {
    let run = [];
    for (let j = -70; j <= 70; j += 0.5) {
      const { lat, lng, point } = gridStreetPoint(i * CELL_U, j * CELL_V, ROAD_Y);
      if (streetAllowed(lat, lng)) run.push(point);
      else run = flushRun(run, 5);
    }
    flushRun(run, 5);
  }

  // Shoreline highways: west coast (Pearl River) and south coast (SZ Bay),
  // inset from the water.
  const westShore = SZ_MAINLAND.slice(0, 14)
    .map(([lat, lng]) => [lat, lng + 0.0016])
    .filter(([lat, lng]) => pointInPoly(lat, lng, SZ_MAINLAND))
    .map(([lat, lng]) => project(lat, lng, ROAD_Y));
  if (westShore.length >= 4) paths.push(westShore);
  const bayShore = SZ_MAINLAND.slice(16, 26)
    .map(([lat, lng]) => [lat + 0.0016, lng])
    .filter(([lat, lng]) => pointInPoly(lat, lng, SZ_MAINLAND))
    .map(([lat, lng]) => project(lat, lng, ROAD_Y));
  if (bayShore.length >= 4) paths.push(bayShore);

  // Bridge decks carry their own traffic, up at deck height.
  BRIDGES.forEach((bridge) => {
    paths.push(bridge.deck.map(([lat, lng]) => project(lat, lng, 0.72)));
  });

  createBridgeDetails();
  return paths;
}

function buildingAllowed(lat, lng) {
  // Must be on a real landmass...
  const onLand =
    pointInPoly(lat, lng, SZ_MAINLAND) ||
    pointInPoly(lat, lng, SZ_EAST) ||
    pointInPoly(lat, lng, SZ_HK) ||
    pointInPoly(lat, lng, DACHAN_ISLAND);
  if (!onLand) return false;
  // ...and not inside a park or Central Park.
  if (pointInPoly(lat, lng, CENTRAL_PARK)) return false;
  for (const park of PARKS) {
    if (pointInPoly(lat, lng, park)) return false;
  }
  return true;
}

// Bake a "street canyon" gradient into a unit box: vertices near the base get
// darker vertex colors, which multiply with per-instance colors for free
// ambient-occlusion-style grounding (no per-frame cost).
function bakeBaseShade(geometry, floor = 0.78) {
  const pos = geometry.attributes.position;
  const shades = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) + 0.5) / 0.45));
    const shade = floor + (1 - floor) * t;
    shades[i * 3] = shade;
    shades[i * 3 + 1] = shade;
    shades[i * 3 + 2] = shade;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(shades, 3));
  return geometry;
}

function createBuildings() {
  const random = seededRandom(43);
  const instances = [];

  // Mainland buildings live INSIDE street blocks, aligned to the same
  // lattice the visible grid draws. Shared block placement is what makes the
  // city read as a real city instead of scattered boxes.
  const { uVec, vVec, uLen, vLen, rot: gridRot } = GRID_METRICS;

  const filledCells = new Set();
  const blockPlates = []; // one raised sidewalk plate per city block
  DISTRICTS.filter((district) => !district.faded).forEach((district) => {
    const [latMin, latMax, lngMin, lngMax] = district.bbox;
    for (let i = -100; i <= 140; i += 1) {
      for (let j = -70; j <= 70; j += 1) {
        const u = (i + 0.5) * CELL_U;
        const v = (j + 0.5) * CELL_V;
        const lat = GRID.origin.lat + GRID.av.dlat * u + GRID.st.dlat * v;
        const lng = GRID.origin.lng + GRID.av.dlng * u + GRID.st.dlng * v;
        if (lat < latMin || lat > latMax || lng < lngMin || lng > lngMax) continue;
        const key = `${i}:${j}`;
        if (filledCells.has(key)) continue;
        if (!buildingAllowed(lat, lng)) continue;
        // Skip cells near company HQ buildings (reserved above).
        const projected = project(lat, lng);
        if (companyReservedCells.has(`${Math.round(projected.x)}:${Math.round(projected.z)}`)) continue;
        filledCells.add(key);
        const center = project(lat, lng);
        blockPlates.push({ x: center.x, z: center.z });
        // 2-3 lots along the long side of each block; a few stay vacant.
        const lots = random() < 0.3 ? 3 : 2;
        for (let slot = 0; slot < lots; slot += 1) {
          if (random() < 0.09) continue;
          const tall = random() < district.tall;
          const base = district.h[0];
          const span = district.h[1] - district.h[0];
          // Bias toward shorter buildings; only "tall" picks reach the top.
          const h = tall ? base + (0.55 + random() * 0.45) * span : base + Math.pow(random(), 1.7) * span * 0.7;
          const slotT = (slot + 0.5) / lots - 0.5;
          const p = center
            .clone()
            .addScaledVector(vVec, slotT * 0.8)
            .addScaledVector(uVec, (random() - 0.5) * 0.08);
          const grow = tall ? 1.12 : 1;
          const w = Math.min(vLen * 0.42, ((vLen * 0.78) / lots) * (0.68 + random() * 0.24) * grow);
          const d = uLen * (0.5 + random() * 0.15) * grow;
          instances.push({ x: p.x, z: p.z, h, w, d, rot: gridRot, shade: random(), roof: random(), faded: false });
        }
      }
    }
  });

  // Outer boroughs keep loose placement, but each borough shares one street
  // orientation (with a whisper of jitter) and buildings never interpenetrate.
  const boroughRot = {
    Longgang: gridRot + 0.9,
    HongKong: gridRot + 0.12,
  };
  DISTRICTS.filter((district) => district.faded).forEach((district) => {
    const [latMin, latMax, lngMin, lngMax] = district.bbox;
    const placedSpots = [];
    let count = 0;
    let guard = 0;
    const cap = district.count * 16;
    while (count < district.count && guard < cap) {
      guard += 1;
      const lat = latMin + random() * (latMax - latMin);
      const lng = lngMin + random() * (lngMax - lngMin);
      if (!buildingAllowed(lat, lng)) continue;
      const p = project(lat, lng);
      const w = 0.34 + random() * 0.6;
      const d = 0.34 + random() * 0.66;
      const r = Math.max(w, d) * 0.72;
      if (
        placedSpots.some(
          (q) => (q.x - p.x) * (q.x - p.x) + (q.z - p.z) * (q.z - p.z) < (q.r + r) * (q.r + r) * 0.62,
        )
      )
        continue;
      placedSpots.push({ x: p.x, z: p.z, r });
      const base = district.h[0];
      const span = district.h[1] - district.h[0];
      const h = base + Math.pow(random(), 1.6) * span;
      instances.push({
        x: p.x,
        z: p.z,
        h,
        w,
        d,
        rot: (boroughRot[district.name] ?? gridRot) + (random() - 0.5) * 0.1,
        shade: random(),
        roof: random(),
        faded: true,
      });
      count += 1;
    }
  });

  // Faded outer-borough buildings render as flat, pale "ghost" blocks.
  const fadedBoxes = instances.filter((b) => b.faded);
  const solidBoxes = instances.filter((b) => !b.faded);
  if (fadedBoxes.length) {
    const ghostGeo = bakeBaseShade(new THREE.BoxGeometry(1, 1, 1), 0.88);
    // Clone: landmark blocks reuse these materials with plain geometry, and
    // vertexColors on a geometry without a color attribute renders black.
    const ghostMaterial = materials.ghost.clone();
    ghostMaterial.vertexColors = true;
    const ghostMesh = new THREE.InstancedMesh(ghostGeo, ghostMaterial, fadedBoxes.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const pp = new THREE.Vector3();
    fadedBoxes.forEach((box, i) => {
      pp.set(box.x, box.h / 2, box.z);
      q.setFromAxisAngle(UP, box.rot);
      s.set(box.w, box.h, box.d);
      m.compose(pp, q, s);
      ghostMesh.setMatrixAt(i, m);
    });
    ghostMesh.renderOrder = 1;
    scene.add(ghostMesh);
  }

  // Solid (mainland) buildings keep full detail: palette, roofs, windows.
  instances.length = 0;
  instances.push(...solidBoxes);

  const geometry = bakeBaseShade(new THREE.BoxGeometry(1, 1, 1));
  const buildingMaterial = materials.building.clone();
  buildingMaterial.vertexColors = true;
  const mesh = new THREE.InstancedMesh(geometry, buildingMaterial, instances.length);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const pos = new THREE.Vector3();
  // Shenzhen facade palette: predominantly glass curtain-wall, with some
  // concrete and stone tones for older stock. More glass, less brick/terra.
  const palette = [
    new THREE.Color(0xa6b8c4), // blue glass (dominant)
    new THREE.Color(0xb4c0c8), // silver glass
    new THREE.Color(0x9ab0bc), // teal glass
    new THREE.Color(0xb7b9b3), // concrete
    new THREE.Color(0xc4ccc8), // light stone
    new THREE.Color(0xa8b4b8), // green glass
  ];
  const color = new THREE.Color();
  // Roof tones: mostly modern flat/glass, with occasional colored accents.
  const roofPalette = [
    new THREE.Color(0x5a6a72), // dark glass
    new THREE.Color(0x4a5a62), // deep slate
    new THREE.Color(0x6a7278), // metal roof
    new THREE.Color(0x808890), // light metal
    new THREE.Color(0x5f6a6a), // tinted glass
    new THREE.Color(0x72787a), // gray
  ];
  const roofColor = new THREE.Color();

  const roofMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.roofColored, instances.length);
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  let roofCount = 0;

  const windowMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.window, instances.length * 22);
  windowMesh.castShadow = false;
  windowMesh.receiveShadow = true;
  let windowCount = 0;

  const storefrontMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x2e343c, roughness: 0.35, metalness: 0.08 }),
    instances.length,
  );
  storefrontMesh.castShadow = false;
  storefrontMesh.receiveShadow = true;
  let storefrontCount = 0;

  // Rooftop detail collected during the main pass, instanced afterwards:
  // wedding-cake setback tiers, wooden water tanks, and AC units.
  const tiers = [];
  const tanks = [];
  const acUnits = [];
  const rooftopOffset = new THREE.Vector3();

  instances.forEach((box, index) => {
    pos.set(box.x, box.h / 2, box.z);
    quat.setFromAxisAngle(UP, box.rot);
    scale.set(box.w, box.h, box.d);
    matrix.compose(pos, quat, scale);
    mesh.setMatrixAt(index, matrix);
    // Shenzhen: almost all buildings use glass tones; height only shifts
    // toward cooler/darker glass for tall towers.
    let tone;
    if (box.h > 2.4) tone = box.shade < 0.5 ? palette[2] : palette[0];
    else if (box.h > 1.3) tone = palette[[0, 1, 4, 5][Math.floor(box.shade * 4) % 4]];
    else tone = palette[[1, 3, 4, 5][Math.floor(box.shade * 4) % 4]];
    color.copy(tone).offsetHSL(0, 0, (box.shade - 0.5) * 0.06);
    mesh.setColorAt(index, color);

    // Classic setback: taller towers step in for their top section.
    const tiered = box.h > 2.6 && box.roof > 0.35;
    if (tiered) {
      tiers.push({
        x: box.x,
        z: box.z,
        rot: box.rot,
        w: box.w * 0.62,
        d: box.d * 0.62,
        y: box.h,
        h: Math.min(1.6, box.h * 0.28),
        color: color.clone().offsetHSL(0, 0, 0.03),
      });
    }
    const roofTopY = tiered ? box.h + tiers[tiers.length - 1].h : box.h;
    const roofW = tiered ? box.w * 0.62 : box.w;
    const roofD = tiered ? box.d * 0.62 : box.d;

    if (box.roof > 0.5 || box.h > 4.4) {
      pos.set(box.x, roofTopY + 0.08, box.z);
      scale.set(roofW * (0.46 + box.roof * 0.28), 0.12, roofD * (0.44 + box.roof * 0.26));
      matrix.compose(pos, quat, scale);
      roofMesh.setMatrixAt(roofCount, matrix);
      // Mostly muted slate/gravel; ~30% get a warmer terracotta/red/green pop.
      const warm = box.shade > 0.84 && box.h < 2.2;
      roofColor.copy(roofPalette[warm ? 2 + (Math.floor(box.roof * 3) % 3) : box.roof > 0.5 ? 0 : 5]);
      roofMesh.setColorAt(roofCount, roofColor);
      roofCount += 1;
    }

    // Rooftop AC units and small equipment boxes — modern Shenzhen buildings
    // have dense rooftop MEP clusters rather than wooden water tanks.
    if (box.h > 0.85 && box.shade > 0.35) {
      rooftopOffset.set(-box.w * 0.21, 0, box.d * 0.2).applyAxisAngle(UP, box.rot);
      acUnits.push({ x: box.x + rooftopOffset.x, z: box.z + rooftopOffset.z, y: roofTopY, rot: box.rot });
      if (box.shade > 0.65 && !tiered) {
        rooftopOffset.set(box.w * 0.24, 0, -box.d * 0.18).applyAxisAngle(UP, box.rot);
        acUnits.push({ x: box.x + rooftopOffset.x, z: box.z + rooftopOffset.z, y: box.h, rot: box.rot + 0.5 });
      }
    }

    const front = new THREE.Vector3(Math.sin(box.rot), 0, Math.cos(box.rot));
    const side = new THREE.Vector3(Math.cos(box.rot), 0, -Math.sin(box.rot));

    if (box.h > 1.7) {
      const floors = Math.min(5, Math.floor(box.h / 1.05));
      // Taller buildings get bands on all four faces; mid-rises on two.
      const allFaces = box.h > 2.2;
      for (let floor = 1; floor <= floors; floor += 1) {
        const y = Math.min(box.h - 0.35, floor * (box.h / (floors + 1)));
        pos.set(box.x, y, box.z).addScaledVector(front, box.d / 2 + 0.018);
        scale.set(box.w * 0.72, 0.035, 0.02);
        matrix.compose(pos, quat, scale);
        windowMesh.setMatrixAt(windowCount, matrix);
        windowCount += 1;

        pos.set(box.x, y + 0.1, box.z).addScaledVector(side, box.w / 2 + 0.018);
        scale.set(0.02, 0.035, box.d * 0.7);
        matrix.compose(pos, quat, scale);
        windowMesh.setMatrixAt(windowCount, matrix);
        windowCount += 1;

        if (allFaces) {
          pos.set(box.x, y + 0.05, box.z).addScaledVector(front, -(box.d / 2 + 0.018));
          scale.set(box.w * 0.72, 0.035, 0.02);
          matrix.compose(pos, quat, scale);
          windowMesh.setMatrixAt(windowCount, matrix);
          windowCount += 1;

          pos.set(box.x, y + 0.15, box.z).addScaledVector(side, -(box.w / 2 + 0.018));
          scale.set(0.02, 0.035, box.d * 0.7);
          matrix.compose(pos, quat, scale);
          windowMesh.setMatrixAt(windowCount, matrix);
          windowCount += 1;
        }
      }
    }

    // Street-level storefront glazing on the avenue-facing side.
    if (box.h > 0.55 && box.shade > 0.25) {
      pos.set(box.x, 0.13, box.z).addScaledVector(front, box.d / 2 + 0.012);
      scale.set(box.w * 0.78, 0.22, 0.02);
      matrix.compose(pos, quat, scale);
      storefrontMesh.setMatrixAt(storefrontCount, matrix);
      storefrontCount += 1;
    }
  });
  scene.add(mesh);
  roofMesh.count = roofCount;
  scene.add(roofMesh);
  windowMesh.count = windowCount;
  scene.add(windowMesh);
  storefrontMesh.count = storefrontCount;
  scene.add(storefrontMesh);

  // Keep the plate centers around: pedestrians walk their perimeters.
  sidewalkPlates.length = 0;
  sidewalkPlates.push(...blockPlates);

  // Sidewalk plates: the city blocks themselves, floated just above the
  // asphalt ground so the streets are the gaps between them. Avenue gaps run
  // wider than cross-street gaps, like the real grid.
  if (blockPlates.length) {
    const plateMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 0.06, 1),
      new THREE.MeshStandardMaterial({ color: 0xd7d3c7, roughness: 0.9 }),
      blockPlates.length,
    );
    plateMesh.receiveShadow = true;
    const plateColor = new THREE.Color();
    blockPlates.forEach((plate, i) => {
      pos.set(plate.x, 0, plate.z);
      quat.setFromAxisAngle(UP, gridRot);
      scale.set(vLen - 0.26, 1, uLen - 0.12);
      matrix.compose(pos, quat, scale);
      plateMesh.setMatrixAt(i, matrix);
      plateColor.setHSL(0.09, 0.06, 0.8 + ((i * 2654435761) % 100) / 100 * 0.05);
      plateMesh.setColorAt(i, plateColor);
    });
    scene.add(plateMesh);
  }

  if (tiers.length) {
    const tierMesh = new THREE.InstancedMesh(geometry, buildingMaterial, tiers.length);
    tierMesh.castShadow = true;
    tierMesh.receiveShadow = true;
    tiers.forEach((tier, i) => {
      pos.set(tier.x, tier.y + tier.h / 2, tier.z);
      quat.setFromAxisAngle(UP, tier.rot);
      scale.set(tier.w, tier.h, tier.d);
      matrix.compose(pos, quat, scale);
      tierMesh.setMatrixAt(i, matrix);
      tierMesh.setColorAt(i, tier.color);
    });
    scene.add(tierMesh);
  }

  // (Water tank props removed — not a Shenzhen building feature.)


  if (acUnits.length) {
    const acMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.095, 0.05, 0.075),
      new THREE.MeshStandardMaterial({ color: 0xc3c8ce, roughness: 0.7 }),
      acUnits.length,
    );
    acUnits.forEach((unit, i) => {
      pos.set(unit.x, unit.y + 0.025, unit.z);
      quat.setFromAxisAngle(UP, unit.rot);
      scale.setScalar(1);
      matrix.compose(pos, quat, scale);
      acMesh.setMatrixAt(i, matrix);
    });
    scene.add(acMesh);
  }
}

// Helper: a tapered tower with optional setbacks. Returns top Y.
function stackTower(lat, lng, levels, material, rotation = 0) {
  const p = project(lat, lng);
  let y = 0;
  levels.forEach((lvl) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(lvl.w, lvl.h, lvl.d), lvl.material || material);
    box.position.set(p.x, y + lvl.h / 2, p.z);
    box.rotation.y = rotation;
    box.castShadow = true;
    box.receiveShadow = true;
    scene.add(box);
    y += lvl.h;
  });
  return { p, top: y };
}

function createLandmarks() {
  const stone = materials.landmark;
  const glass = materials.glass;

  // --- Ping An Finance Center (599m): tallest in Shenzhen, tapered glass tower + needle ---
  {
    const { p, top } = stackTower(LANDMARKS.pingAn.lat, LANDMARKS.pingAn.lng, [
      { w: 0.95, h: 0.5, d: 0.95 },
      { w: 0.72, h: 4.8, d: 0.72 },
      { w: 0.42, h: 1.2, d: 0.42 },
    ], glass, 0.5);
    const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 1.4, 8), materials.window);
    needle.position.set(p.x, top + 0.7, p.z);
    needle.castShadow = true;
    scene.add(needle);
    addLandmarkLabel("平安金融中心", LANDMARKS.pingAn.lat, LANDMARKS.pingAn.lng, top + 1.6);
  }

  // --- China Resources "Spring Bamboo" (392m): organic tapered form ---
  {
    const cp = project(LANDMARKS.chunSun.lat, LANDMARKS.chunSun.lng);
    let cy = 0;
    for (let i = 0; i < 5; i += 1) {
      const r = 0.48 - i * 0.06;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.05, 0.85, 20), glass);
      seg.position.set(cp.x, cy + 0.425, cp.z);
      seg.castShadow = true;
      scene.add(seg);
      cy += 0.85;
    }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 16), glass);
    tip.position.set(cp.x, cy + 0.3, cp.z);
    tip.castShadow = true;
    scene.add(tip);
    addLandmarkLabel("春笋", LANDMARKS.chunSun.lat, LANDMARKS.chunSun.lng, cy + 0.8);
  }

  // --- KK100 / Kingkey 100 (442m): tall glass tower with crown ---
  {
    const kp = project(LANDMARKS.kingKey.lat, LANDMARKS.kingKey.lng);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.62, 4.2, 0.62), glass);
    shaft.position.set(kp.x, 2.1, kp.z);
    shaft.castShadow = true;
    scene.add(shaft);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.8, 4), glass);
    crown.position.set(kp.x, 4.6, kp.z);
    crown.rotation.y = Math.PI / 4;
    crown.castShadow = true;
    scene.add(crown);
    addLandmarkLabel("京基100", LANDMARKS.kingKey.lat, LANDMARKS.kingKey.lng, 5.4);
  }

  // --- Diwang Mansion / Shun Hing Square (384m): twin spires ---
  {
    const dp = project(LANDMARKS.diwang.lat, LANDMARKS.diwang.lng);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.6, 0.7), glass);
    tower.position.set(dp.x, 1.8, dp.z);
    tower.castShadow = true;
    scene.add(tower);
    for (const dx of [-0.16, 0.16]) {
      const spire = new THREE.Mesh(new THREE.ConeGeometry(0.06, 1.0, 8), materials.window);
      spire.position.set(dp.x + dx, 3.6 + 0.5, dp.z);
      spire.castShadow = true;
      scene.add(spire);
    }
    addLandmarkLabel("地王大厦", LANDMARKS.diwang.lat, LANDMARKS.diwang.lng, 4.8);
  }

  // --- Tencent Binhai Building: twin connected towers ---
  {
    const tp = project(LANDMARKS.tencentBH.lat, LANDMARKS.tencentBH.lng);
    for (const dx of [-0.35, 0.35]) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(0.42, 2.8, 0.42), glass);
      tower.position.set(tp.x + dx, 1.4, tp.z);
      tower.castShadow = true;
      scene.add(tower);
    }
    // Sky bridge connecting the towers
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.36), glass);
    bridge.position.set(tp.x, 2.4, tp.z);
    bridge.castShadow = true;
    scene.add(bridge);
    addLandmarkLabel("腾讯", LANDMARKS.tencentBH.lat, LANDMARKS.tencentBH.lng, 3.2);
  }

  // --- Tencent Penguin Island (企鹅岛): new global HQ campus at Dachan Bay ---
  {
    const qp = project(LANDMARKS.tencentQD.lat, LANDMARKS.tencentQD.lng);
    // Tencent Helix (腾讯螺旋): 4 spiral towers, centerpiece (~153m ≈ 1.7 units)
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const r = 0.32;
      const tower = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.7, 0.26), glass);
      tower.position.set(qp.x + Math.cos(angle) * r, 0.85, qp.z + Math.sin(angle) * r);
      tower.rotation.y = angle * 0.3;
      tower.castShadow = true;
      scene.add(tower);
    }
    // Surrounding office buildings (云海大厦 cluster)
    const bldOffsets = [
      [0.65, 0.45, 0.9], [-0.55, 0.6, 0.7], [0.45, -0.55, 0.8], [-0.6, -0.35, 0.6],
      [0.85, -0.15, 0.5], [-0.25, 0.85, 0.65],
    ];
    for (const [dx, dz, h] of bldOffsets) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, h, 0.28), glass);
      b.position.set(qp.x + dx, h / 2, qp.z + dz);
      b.castShadow = true;
      scene.add(b);
    }
    addLandmarkLabel("腾讯企鹅岛", LANDMARKS.tencentQD.lat, LANDMARKS.tencentQD.lng, 2.0);
  }

  // --- DJI Sky City: distinctive flared twin towers ---
  {
    const dp = project(LANDMARKS.djiSky.lat, LANDMARKS.djiSky.lng);
    for (const dx of [-0.28, 0.28]) {
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.4, 0.32), glass);
      shaft.position.set(dp.x + dx, 1.2, dp.z);
      shaft.castShadow = true;
      scene.add(shaft);
      // Flared crown
      const flare = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.16, 0.4, 6), glass);
      flare.position.set(dp.x + dx, 2.6, dp.z);
      flare.castShadow = true;
      scene.add(flare);
    }
    addLandmarkLabel("大疆天空之城", LANDMARKS.djiSky.lat, LANDMARKS.djiSky.lng, 3.2);
  }

  // --- Civic Center: long, low building with wing-like roof ---
  {
    const cp = project(LANDMARKS.civicCenter.lat, LANDMARKS.civicCenter.lng);
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.36, 0.8), stone);
    base.position.set(cp.x, 0.18, cp.z);
    base.castShadow = true;
    scene.add(base);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.06, 1.0), stone);
    roof.position.set(cp.x, 0.4, cp.z);
    roof.castShadow = true;
    scene.add(roof);
  }

  // --- SEG Plaza (Huaqiangbei): electronics market tower ---
  {
    const sp = project(LANDMARKS.seg.lat, LANDMARKS.seg.lng);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.58, 2.6, 0.58), stone);
    tower.position.set(sp.x, 1.3, sp.z);
    tower.castShadow = true;
    scene.add(tower);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.3, 8), stone);
    cap.position.set(sp.x, 2.75, sp.z);
    cap.castShadow = true;
    scene.add(cap);
  }

  // --- Huaqiangbei label ---
  addLandmarkLabel("华强北", LANDMARKS.huaqiangbei.lat, LANDMARKS.huaqiangbei.lng, 1.4);

  // --- Shenzhen Bay Sports Center "Spring Cocoon": lattice shell ---
  {
    const sp = project(LANDMARKS.szBaySports.lat, LANDMARKS.szBaySports.lng);
    const cocoon = new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 12), glass);
    cocoon.scale.set(1.3, 0.5, 1.0);
    cocoon.position.set(sp.x, 0.35, sp.z);
    cocoon.castShadow = true;
    scene.add(cocoon);
    addLandmarkLabel("深圳湾体育中心", LANDMARKS.szBaySports.lat, LANDMARKS.szBaySports.lng, 1.2);
  }

  // --- Window of the World: miniature Eiffel Tower (theme park icon) ---
  {
    const wp = project(LANDMARKS.windowWorld.lat, LANDMARKS.windowWorld.lng);
    // Tapered lattice tower (mini Eiffel Tower silhouette)
    const eiffelMat = new THREE.MeshStandardMaterial({
      color: 0x8a7a5a, roughness: 0.5, metalness: 0.3,
    });
    // 4 base legs splayed outward
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.04, 0.9, 6), eiffelMat);
      leg.position.set(
        wp.x + Math.cos(angle) * 0.12,
        0.45,
        wp.z + Math.sin(angle) * 0.12,
      );
      // Tilt legs inward
      leg.rotation.z = -Math.cos(angle) * 0.35;
      leg.rotation.x = Math.sin(angle) * 0.35;
      leg.castShadow = true;
      scene.add(leg);
    }
    // Mid section (narrower)
    const mid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.1, 0.7, 8), eiffelMat);
    mid.position.set(wp.x, 1.25, wp.z);
    mid.castShadow = true;
    scene.add(mid);
    // Platform ring at midpoint
    const ring1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 0.04, 12), eiffelMat);
    ring1.position.set(wp.x, 0.9, wp.z);
    scene.add(ring1);
    // Upper section
    const upper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.05, 0.55, 6), eiffelMat);
    upper.position.set(wp.x, 1.9, wp.z);
    upper.castShadow = true;
    scene.add(upper);
    // Top platform
    const ring2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.03, 8), eiffelMat);
    ring2.position.set(wp.x, 1.6, wp.z);
    scene.add(ring2);
    // Antenna spire
    const spire = new THREE.Mesh(
      new THREE.ConeGeometry(0.015, 0.3, 6), eiffelMat);
    spire.position.set(wp.x, 2.35, wp.z);
    spire.castShadow = true;
    scene.add(spire);
    addLandmarkLabel("世界之窗", LANDMARKS.windowWorld.lat, LANDMARKS.windowWorld.lng, 2.6);
  }

  // --- Shenzhen Convention & Exhibition Center (会展中心): wave-roof hall ---
  {
    const ep = project(LANDMARKS.expoCenter.lat, LANDMARKS.expoCenter.lng);
    // Large low exhibition hall base
    const hall = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.4, 1.2), stone);
    hall.position.set(ep.x, 0.2, ep.z);
    hall.castShadow = true;
    scene.add(hall);
    // Curved/wave roof (half-cylinder laid flat, spanning the length)
    const waveRoof = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 2.8, 16, 1, false, 0, Math.PI),
      glass);
    waveRoof.rotation.z = Math.PI / 2; // lay along X-axis
    waveRoof.rotation.x = 0; // half-cylinder opening downward
    waveRoof.position.set(ep.x, 0.42, ep.z);
    waveRoof.scale.set(1, 0.45, 1.0); // flatten the curve
    waveRoof.castShadow = true;
    scene.add(waveRoof);
    addLandmarkLabel("会展中心", LANDMARKS.expoCenter.lat, LANDMARKS.expoCenter.lng, 0.9);
  }

  // --- Shenzhen Stock Exchange (深圳证券交易所): elevated cube on stilts (OMA design) ---
  {
    const sp = project(LANDMARKS.szse.lat, LANDMARKS.szse.lng);
    const szseMat = new THREE.MeshStandardMaterial({
      color: 0x6a8fa8, roughness: 0.2, metalness: 0.15,
      transparent: true, opacity: 0.88,
    });
    // Three support pillars
    for (const dx of [-0.28, 0, 0.28]) {
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.85, 0.08), stone);
      pillar.position.set(sp.x + dx, 0.425, sp.z);
      pillar.castShadow = true;
      scene.add(pillar);
    }
    // Elevated floating cube (the iconic raised trading floor)
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.65, 0.55), szseMat);
    cube.position.set(sp.x, 1.2, sp.z);
    cube.castShadow = true;
    scene.add(cube);
    // Recessed darker band (windows detail)
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 0.08, 0.57), materials.window);
    band.position.set(sp.x, 1.15, sp.z);
    scene.add(band);
    addLandmarkLabel("深圳证券交易所", LANDMARKS.szse.lat, LANDMARKS.szse.lng, 1.65);
  }

  // --- Shenzhen Bay One (深圳湾1号): ultra-slender luxury tower ---
  {
    const sp = project(LANDMARKS.szBayOne.lat, LANDMARKS.szBayOne.lng);
    const bayOneMat = new THREE.MeshStandardMaterial({
      color: 0xa0c4d8, roughness: 0.22, metalness: 0.12,
      transparent: true, opacity: 0.9,
    });
    // Very slender shaft (~350m ≈ 3.9 units in scale)
    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 3.9, 0.28), bayOneMat);
    shaft.position.set(sp.x, 1.95, sp.z);
    shaft.castShadow = true;
    scene.add(shaft);
    // Crown: flared top with gold accent
    const crown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.14, 0.3, 8), bayOneMat);
    crown.position.set(sp.x, 4.05, sp.z);
    crown.castShadow = true;
    scene.add(crown);
    const goldTip = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.4, 6), materials.copper);
    goldTip.position.set(sp.x, 4.4, sp.z);
    goldTip.castShadow = true;
    scene.add(goldTip);
    addLandmarkLabel("深圳湾1号", LANDMARKS.szBayOne.lat, LANDMARKS.szBayOne.lng, 4.7);
  }

  // --- Lianhua Hill (莲花山): green hill + Deng Xiaoping statue plaza ---
  {
    const lp = project(LANDMARKS.lianHua.lat, LANDMARKS.lianHua.lng);
    const hillMat = new THREE.MeshStandardMaterial({
      color: 0x3d6b3d, roughness: 0.9, metalness: 0,
    });
    // Dome-shaped hill
    const hill = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      hillMat);
    hill.position.set(lp.x, 0, lp.z);
    hill.scale.set(1, 0.55, 0.8);
    hill.castShadow = true;
    scene.add(hill);
    // Summit plaza (flat circular platform)
    const plaza = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.15, 0.04, 12), stone);
    plaza.position.set(lp.x, 0.34, lp.z);
    scene.add(plaza);
    // Bronze statue silhouette (Deng Xiaoping walking)
    const statue = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.04, 0.12, 4, 8), materials.copper);
    statue.position.set(lp.x, 0.42, lp.z);
    statue.castShadow = true;
    scene.add(statue);
    addLandmarkLabel("莲花山", LANDMARKS.lianHua.lat, LANDMARKS.lianHua.lng, 0.6);
  }

  // --- Qianhai Stone (前海石): iconic stone monument ---
  {
    const qp = project(LANDMARKS.qianHaiStone.lat, LANDMARKS.qianHaiStone.lng);
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x9a9a8a, roughness: 0.7, metalness: 0.05,
    });
    // Irregular boulder-like obelisk
    const stone1 = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.5, 0.1), stoneMat);
    stone1.position.set(qp.x, 0.25, qp.z);
    stone1.rotation.z = 0.06;
    stone1.castShadow = true;
    scene.add(stone1);
    // Base plinth
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.08, 0.22), stone);
    base.position.set(qp.x, 0.04, qp.z);
    scene.add(base);
    addLandmarkLabel("前海石", LANDMARKS.qianHaiStone.lat, LANDMARKS.qianHaiStone.lng, 0.65);
  }

  // --- OCT Harbour (欢乐海岸): waterfront complex with curved pavilions ---
  {
    const op = project(LANDMARKS.octHarbour.lat, LANDMARKS.octHarbour.lng);
    const octMat = new THREE.MeshStandardMaterial({
      color: 0x7da8b8, roughness: 0.28, metalness: 0.1,
      transparent: true, opacity: 0.88,
    });
    // Low waterfront pavilions with curved roofs
    const pavilions = [
      { dx: 0, dz: 0, w: 0.8, h: 0.35, d: 0.5, curve: 0.18 },
      { dx: 0.55, dz: 0.2, w: 0.5, h: 0.28, d: 0.4, curve: 0.14 },
      { dx: -0.5, dz: 0.15, w: 0.45, h: 0.3, d: 0.35, curve: 0.12 },
      { dx: 0.2, dz: -0.35, w: 0.55, h: 0.25, d: 0.4, curve: 0.16 },
    ];
    for (const pv of pavilions) {
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(pv.w, pv.h, pv.d), octMat);
      base.position.set(op.x + pv.dx, pv.h / 2, op.z + pv.dz);
      base.castShadow = true;
      scene.add(base);
      // Curved roof (half-cylinder)
      const roof = new THREE.Mesh(
        new THREE.CylinderGeometry(pv.curve, pv.curve, pv.w * 0.95, 10, 1, false, 0, Math.PI),
        glass);
      roof.rotation.z = Math.PI / 2;
      roof.position.set(op.x + pv.dx, pv.h + pv.curve * 0.3, op.z + pv.dz);
      roof.scale.set(1, 0.5, 1);
      roof.castShadow = true;
      scene.add(roof);
    }
    addLandmarkLabel("欢乐海岸", LANDMARKS.octHarbour.lat, LANDMARKS.octHarbour.lng, 0.8);
  }

  // --- Shenzhen North Station: rail hub label ---
  addLandmarkLabel("深圳北站", LANDMARKS.shenzhenNorth.lat, LANDMARKS.shenzhenNorth.lng, 2.2);
  {
    const np = project(LANDMARKS.shenzhenNorth.lat, LANDMARKS.shenzhenNorth.lng);
    const station = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.7), stone);
    station.position.set(np.x, 0.25, np.z);
    station.castShadow = true;
    scene.add(station);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 0.9), glass);
    canopy.position.set(np.x, 0.55, np.z);
    canopy.castShadow = true;
    scene.add(canopy);
  }
}

function createMarker(item) {
  const color = stageColor(item.stage);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.36,
    emissive: color.clone().multiplyScalar(0.12),
  });
  const p = project(item.lat, item.lng);
  const group = new THREE.Group();
  group.position.set(p.x, 0.18, p.z);
  group.userData.item = item;

  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 1.05, 10), material);
  pin.position.y = 0.52;
  pin.castShadow = true;
  pin.userData.item = item;
  group.add(pin);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 12), material);
  head.position.y = 1.12;
  head.castShadow = true;
  head.userData.item = item;
  group.add(head);

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.44, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.34, side: THREE.DoubleSide }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.08;
  halo.userData.item = item;
  group.add(halo);

  const hitArea = new THREE.Mesh(
    new THREE.SphereGeometry(0.48, 12, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hitArea.position.y = 1.05;
  hitArea.userData.item = item;
  hitArea.userData.hitArea = true;
  group.add(hitArea);

  scene.add(group);
  markerMeshes.push(pin, head, halo, hitArea);
  startupMarkers.set(item.id, { group, item, halo });
}

function createContextMarker(item) {
  const color =
    item.category === "投资机构"
      ? 0xe8b500
      : item.category === "高校院所"
        ? 0xd74a3d
        : item.category === "Coworking"
          ? 0x71c97f
          : 0xb9c7cf;
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.48,
    emissive: new THREE.Color(color).multiplyScalar(0.06),
  });
  const p = project(item.lat, item.lng);
  const geometry = item.category === "投资机构" ? new THREE.OctahedronGeometry(0.56) : new THREE.BoxGeometry(0.82, 0.82, 0.82);
  const marker = new THREE.Mesh(geometry, material);
  marker.position.set(p.x, 0.72, p.z);
  marker.castShadow = true;
  marker.userData.context = item;
  scene.add(marker);
}

// Company HQ building config: brand color + building template type.
// Companies that already have handcrafted landmark 3D models are excluded.
const COMPANY_BUILDING_SKIP = new Set(["tencent", "dji", "pingan-tech"]);
const COMPANY_BUILDING_CONFIG = {
  // Brand colors (hex) for accent strips / rooftop details.
  autox:            { color: 0xe8453c },
  corerain:         { color: 0x1a73e8 },
  deeproute:        { color: 0x00bcd4 },
  "dji-automotive": { color: 0x4a4a4a },
  dobot:            { color: 0xf5a623 },
  goodix:           { color: 0xf5a623 },
  "hai-robotics":   { color: 0x1976d2 },
  "hans-laser":     { color: 0xd4423f },
  icarbonx:         { color: 0x00bcd4 },
  intellifusion:    { color: 0x1565c0 },
  kingdee:          { color: 0x6c5ce7 },
  leadshine:        { color: 0xe65100 },
  leju:             { color: 0x3f51b5 },
  limx:             { color: 0x6a1b9a },
  linklogis:        { color: 0x00897b },
  mindray:          { color: 0x1565c0 },
  moffett:          { color: 0x2e7d32 },
  narwal:           { color: 0x00bcd4 },
  orbbec:           { color: 0x1976d2 },
  "pingan-tech":    { color: 0xf5a623 },
  pudu:             { color: 0xff7043 },
  robosense:        { color: 0xe8453c },
  sangfor:          { color: 0x1976d2 },
  "sensetime-sz":   { color: 0x8b6cef },
  "sf-tech":        { color: 0xd4423f },
  smartmore:        { color: 0x4a148c },
  speakin:          { color: 0xe91e63 },
  "standard-robots":{ color: 0x3f51b5 },
  stardust:         { color: 0x6a1b9a },
  sunline:          { color: 0x00897b },
  topband:          { color: 0x43a047 },
  ubtech:           { color: 0xe8453c },
  webank:           { color: 0x1976d2 },
  wondershare:      { color: 0x6c5ce7 },
  xverse:           { color: 0x6a1b9a },
  xtalpi:           { color: 0x1565c0 },
  zhuiyi:           { color: 0x00bcd4 },
  zte:              { color: 0x1976d2 },
};

// Building template by company sector + stage.
function getBuildingType(startup) {
  const mfg = ["制造与工业", "家用机器人", "服务机器人", "工业AMR", "智能控制"];
  if (mfg.includes(startup.sector)) return "industrial";
  if (startup.stage === "上市" && ["金融服务", "AI/数据基础设施", "AI芯片", "金融科技", "医疗AI"].includes(startup.sector))
    return "tower";
  if (startup.stage === "上市" || startup.stage === "后期") return "midrise";
  return "campus";
}

// Pre-compute company positions so createBuildings() can leave space.
const companyReservedCells = new Set();
for (const s of STARTUPS) {
  if (COMPANY_BUILDING_SKIP.has(s.id)) continue;
  const p = project(s.lat, s.lng);
  for (let di = -2; di <= 2; di++)
    for (let dj = -1; dj <= 1; dj++)
      companyReservedCells.add(`${Math.round(p.x + di)}:${Math.round(p.z + dj)}`);
}
// Reserve cells around ALL landmark buildings so random buildings don't poke through
for (const key of Object.keys(LANDMARKS)) {
  const lm = LANDMARKS[key];
  const p = project(lm.lat, lm.lng);
  for (let di = -2; di <= 2; di++)
    for (let dj = -2; dj <= 2; dj++)
      companyReservedCells.add(`${Math.round(p.x + di)}:${Math.round(p.z + dj)}`);
}

function createCompanyBuildings() {
  const glass = materials.glass;
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xc8cdd2, roughness: 0.6, metalness: 0.12 });
  const alumMat = new THREE.MeshStandardMaterial({ color: 0xb0b8c0, roughness: 0.45, metalness: 0.2 });

  for (const s of STARTUPS) {
    if (COMPANY_BUILDING_SKIP.has(s.id)) continue;
    const cfg = COMPANY_BUILDING_CONFIG[s.id] || { color: 0x8fb4bd };
    const brandColor = new THREE.Color(cfg.color);
    const type = getBuildingType(s);
    const p = project(s.lat, s.lng);
    const accentMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.3, metalness: 0.3, emissive: brandColor.clone().multiplyScalar(0.12) });

    if (type === "tower") {
      // Tall glass tower with slight taper + brand-colored crown.
      const levels = [
        { w: 0.52, h: 0.3, d: 0.52 },
        { w: 0.46, h: 2.4, d: 0.46 },
        { w: 0.34, h: 0.8, d: 0.34 },
      ];
      let y = 0;
      for (const lvl of levels) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(lvl.w, lvl.h, lvl.d), glass);
        box.position.set(p.x, y + lvl.h / 2, p.z);
        box.castShadow = true;
        box.receiveShadow = true;
        scene.add(box);
        y += lvl.h;
      }
      // Brand-colored crown strip
      const crown = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.36), accentMat);
      crown.position.set(p.x, y + 0.06, p.z);
      crown.castShadow = true;
      scene.add(crown);
      // Antenna
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, 0.5, 6), accentMat);
      ant.position.set(p.x, y + 0.35, p.z);
      scene.add(ant);
    } else if (type === "midrise") {
      // Medium glass office block with rooftop accent.
      const h = 1.4 + Math.random() * 0.5;
      const w = 0.42, d = 0.42;
      const main = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glass);
      main.position.set(p.x, h / 2, p.z);
      main.castShadow = true;
      main.receiveShadow = true;
      scene.add(main);
      // Glass top floor (slightly set back, brand-tinted)
      const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.22, d * 0.8), accentMat);
      top.position.set(p.x, h + 0.11, p.z);
      top.castShadow = true;
      scene.add(top);
      // Entrance canopy
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(w * 1.1, 0.06, d * 0.5), stoneMat);
      canopy.position.set(p.x, 0.18, p.z + d * 0.35);
      scene.add(canopy);
    } else if (type === "industrial") {
      // Low, wide industrial building with aluminum panels.
      const h = 0.55 + Math.random() * 0.35;
      const w = 0.62, d = 0.52;
      // Dark base
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.45, d), new THREE.MeshStandardMaterial({ color: 0x6a7079, roughness: 0.7 }));
      base.position.set(p.x, h * 0.225, p.z);
      base.castShadow = true;
      base.receiveShadow = true;
      scene.add(base);
      // Glass upper section
      const upper = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, h * 0.55, d * 0.96), glass);
      upper.position.set(p.x, h * 0.45 + h * 0.275, p.z);
      upper.castShadow = true;
      scene.add(upper);
      // Flat roof detail
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.06, d * 0.6), alumMat);
      roof.position.set(p.x, h + 0.03, p.z);
      scene.add(roof);
      // Brand-colored entrance strip
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, 0.08, 0.04), accentMat);
      strip.position.set(p.x, 0.12, p.z + d / 2);
      scene.add(strip);
    } else {
      // campus: two connected low blocks for early-stage companies.
      const h1 = 0.5 + Math.random() * 0.25;
      const h2 = 0.35 + Math.random() * 0.2;
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.38, h1, 0.38), glass);
      b1.position.set(p.x - 0.1, h1 / 2, p.z);
      b1.castShadow = true;
      b1.receiveShadow = true;
      scene.add(b1);
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.28, h2, 0.32), glass);
      b2.position.set(p.x + 0.16, h2 / 2, p.z + 0.06);
      b2.castShadow = true;
      scene.add(b2);
      // Connector
      const conn = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.12), accentMat);
      conn.position.set(p.x + 0.05, Math.min(h1, h2) * 0.6, p.z + 0.02);
      scene.add(conn);
      // Small roof accent
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.16), accentMat);
      cap.position.set(p.x - 0.1, h1 + 0.02, p.z);
      scene.add(cap);
    }
  }
}

function createMarkers() {
  STARTUPS.forEach(createMarker);
  CONTEXT_POINTS.forEach(createContextMarker);
}

/* ---------------------------------------------------------------- */
/* Cinematic selection: spotlight beam, pulse rings, focus easing    */
/* ---------------------------------------------------------------- */

const FOG_BASE = scene.fog.density;
const FOG_FOCUS = FOG_BASE * 1.38;
const FOV_BASE = camera.fov;
const FOV_FOCUS = FOV_BASE - 3;
const FOCUS_COLOR = 0x3a6bff;
let fogTarget = FOG_BASE;
let fovTarget = FOV_BASE;
let focusFx = null;

function makeBeamTexture() {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 128;
  const ctx = c.getContext("2d");
  const grad = ctx.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, "rgba(255,255,255,0.85)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.26)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}

function ensureFocusFx() {
  if (focusFx) return focusFx;
  const group = new THREE.Group();
  group.visible = false;

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.4, 7.5, 20, 1, true),
    new THREE.MeshBasicMaterial({
      color: FOCUS_COLOR,
      map: makeBeamTexture(),
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  beam.position.y = 3.75;
  group.add(beam);

  // Two expanding ground rings, half a cycle apart, for a continuous pulse.
  const rings = [0, 1].map((i) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.6, 40),
      new THREE.MeshBasicMaterial({
        color: FOCUS_COLOR,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    ring.userData.phase = i * 0.5;
    group.add(ring);
    return ring;
  });

  scene.add(group);
  focusFx = { group, beam, rings };
  return focusFx;
}

function engageFocus(startup) {
  const fx = ensureFocusFx();
  const p = project(startup.lat, startup.lng);
  fx.group.position.set(p.x, 0.05, p.z);
  fx.group.visible = true;
  fogTarget = FOG_FOCUS;
  fovTarget = FOV_FOCUS;
}

function releaseFocus() {
  if (focusFx) focusFx.group.visible = false;
  fogTarget = FOG_BASE;
  fovTarget = FOV_BASE;
}

function updateFocusFx(elapsed, delta) {
  // Ease fog density and FOV toward their targets for a soft push-in.
  scene.fog.density += (fogTarget - scene.fog.density) * Math.min(1, delta * 2.6);
  const fovStep = (fovTarget - camera.fov) * Math.min(1, delta * 3);
  if (Math.abs(fovStep) > 0.0004) {
    camera.fov += fovStep;
    camera.updateProjectionMatrix();
  }

  if (!focusFx || !focusFx.group.visible) return;
  focusFx.beam.material.opacity = 0.42 + Math.sin(elapsed * 2.1) * 0.1;
  focusFx.beam.rotation.y = elapsed * 0.4;
  focusFx.rings.forEach((ring) => {
    const t = (elapsed * 0.62 + ring.userData.phase) % 1;
    const scale = 1 + t * 2.3;
    ring.scale.setScalar(scale);
    ring.material.opacity = 0.5 * (1 - t) * (1 - t);
  });
}

function createCarMesh(color) {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.02 });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x9ec6d4,
    roughness: 0.18,
    metalness: 0.04,
    transparent: true,
    opacity: 0.88,
  });
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x171a1f, roughness: 0.72 });
  const lightMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff4c8,
    emissive: new THREE.Color(0xffd56f).multiplyScalar(0.45),
    roughness: 0.3,
  });
  const tailMaterial = new THREE.MeshStandardMaterial({
    color: 0xe13c36,
    emissive: new THREE.Color(0xe13c36).multiplyScalar(0.25),
    roughness: 0.4,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.18, 0.72), bodyMaterial);
  body.position.y = 0.16;
  body.castShadow = true;
  group.add(body);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.24), bodyMaterial);
  hood.position.set(0, 0.22, 0.24);
  hood.castShadow = true;
  group.add(hood);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.18, 0.34), glassMaterial);
  cabin.position.set(0, 0.32, -0.05);
  cabin.castShadow = true;
  group.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.075, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const x of [-0.26, 0.26]) {
    for (const z of [-0.24, 0.24]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMaterial);
      wheel.position.set(x, 0.08, z);
      wheel.castShadow = true;
      group.add(wheel);
    }
  }

  const headLightGeo = new THREE.BoxGeometry(0.08, 0.045, 0.025);
  for (const x of [-0.12, 0.12]) {
    const headlight = new THREE.Mesh(headLightGeo, lightMaterial);
    headlight.position.set(x, 0.17, 0.374);
    group.add(headlight);

    const tail = new THREE.Mesh(headLightGeo, tailMaterial);
    tail.position.set(x, 0.17, -0.374);
    group.add(tail);
  }

  group.scale.setScalar(0.92);
  return group;
}

function createBusMesh() {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.5 });
  const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0x1c4fd6, roughness: 0.45 });
  const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x9ec6d4, roughness: 0.2, transparent: true, opacity: 0.88 });
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x171a1f, roughness: 0.72 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 1.5), bodyMaterial);
  body.position.y = 0.26;
  body.castShadow = true;
  group.add(body);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.07, 1.5), stripeMaterial);
  stripe.position.y = 0.18;
  group.add(stripe);
  const windows = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.09, 1.3), glassMaterial);
  windows.position.y = 0.34;
  group.add(windows);
  const wheelGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.075, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const x of [-0.22, 0.22]) {
    for (const z of [-0.52, 0.52]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMaterial);
      wheel.position.set(x, 0.08, z);
      group.add(wheel);
    }
  }
  return group;
}

function createTruckMesh(color) {
  const group = new THREE.Group();
  const cabMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.45 });
  const boxMaterial = new THREE.MeshStandardMaterial({ color: 0xe9e6dd, roughness: 0.6 });
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x171a1f, roughness: 0.72 });

  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.26, 0.34), cabMaterial);
  cab.position.set(0, 0.21, 0.5);
  cab.castShadow = true;
  group.add(cab);
  const cargo = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.4, 0.86), boxMaterial);
  cargo.position.set(0, 0.28, -0.12);
  cargo.castShadow = true;
  group.add(cargo);
  const wheelGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.075, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const x of [-0.22, 0.22]) {
    for (const z of [-0.4, 0.48]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMaterial);
      wheel.position.set(x, 0.08, z);
      group.add(wheel);
    }
  }
  return group;
}

function pathWorldLength(path) {
  let length = 0;
  for (let i = 1; i < path.length; i += 1) length += path[i].distanceTo(path[i - 1]);
  return length;
}

function createVehicles(roadPaths) {
  // Weighted toward taxi yellow: roughly 4 in 10 cars read as cabs.
  const carColors = [0xf7b500, 0xe54c42, 0xf7b500, 0x2e6cff, 0xf7b500, 0x30b37c, 0xf4f1e8, 0xf7b500, 0x3c414b, 0x2e6cff];
  const truckColors = [0x8a4b3a, 0x3c5a48, 0x39424e];
  const random = seededRandom(700);
  // Long avenues get proportionally more traffic than short bridge decks.
  let built = 0;
  roadPaths.forEach((path) => {
    const length = pathWorldLength(path);
    const count = Math.max(1, Math.round(length / 16));
    for (let i = 0; i < count && built < 96; i += 1) {
      const kind = built % 9 === 4 ? "bus" : built % 7 === 3 ? "truck" : "car";
      const mesh =
        kind === "bus"
          ? createBusMesh()
          : kind === "truck"
            ? createTruckMesh(truckColors[built % truckColors.length])
            : createCarMesh(carColors[built % carColors.length]);
      // Vehicles are scaled to fit inside the avenue gaps between block plates.
      mesh.scale.setScalar(kind === "car" ? 0.58 : 0.6);
      scene.add(mesh);
      vehicleFleet.push({
        mesh,
        path,
        t: random(),
        // Normalize by path length so world speed is consistent everywhere.
        speed: (0.65 + random() * 0.5) / Math.max(4, length),
        lane: (random() - 0.5) * 0.09,
      });
      built += 1;
    }
  });
}

function samplePath(path, t) {
  const wrapped = ((t % 1) + 1) % 1;
  const scaled = wrapped * (path.length - 1);
  const index = Math.floor(scaled);
  const frac = scaled - index;
  const a = path[index];
  const b = path[Math.min(index + 1, path.length - 1)];
  const point = new THREE.Vector3().lerpVectors(a, b, frac);
  const tangent = new THREE.Vector3().subVectors(b, a).normalize();
  const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
  return { point, tangent, normal };
}

function updateVehicles(delta) {
  vehicleFleet.forEach((vehicle) => {
    vehicle.t += delta * vehicle.speed;
    const { point, tangent, normal } = samplePath(vehicle.path, vehicle.t);
    vehicle.mesh.position.copy(point).addScaledVector(normal, vehicle.lane);
    vehicle.mesh.position.y = point.y + 0.02; // wheels on the asphalt (or the bridge deck)
    vehicle.mesh.rotation.y = Math.atan2(tangent.x, tangent.z);
  });
}

function updateTransit(delta) {
  subwayFleet.forEach((vehicle) => {
    vehicle.t += delta * vehicle.speed;
    const { point, tangent } = samplePath(vehicle.path, vehicle.t);
    vehicle.mesh.position.copy(point);
    vehicle.mesh.position.y = point.y + 0.09;
    vehicle.mesh.rotation.y = Math.atan2(tangent.x, tangent.z);
  });

  ferryFleet.forEach((vehicle) => {
    vehicle.t += delta * vehicle.speed;
    const { point, tangent } = samplePath(vehicle.path, vehicle.t);
    vehicle.mesh.position.copy(point);
    vehicle.mesh.position.y = 0.16;
    vehicle.mesh.rotation.y = Math.atan2(tangent.x, tangent.z);
  });

  planeFleet.forEach((vehicle) => {
    vehicle.t += delta * vehicle.speed;
    const { point, tangent } = samplePath(vehicle.path, vehicle.t);
    vehicle.mesh.position.copy(point);
    vehicle.mesh.rotation.y = Math.atan2(tangent.x, tangent.z);
    vehicle.mesh.rotation.z = Math.sin(vehicle.t * Math.PI * 2) * 0.08;
  });
}

// A dozen gulls circling the parks and the harbor: one instanced chevron
// mesh, one draw call, a handful of matrix updates per frame.
function createBirds() {
  const wing = new Float32Array([
    // left wing
    0, 0, 0.16, -0.5, 0.12, -0.12, -0.05, 0, -0.06,
    // right wing
    0, 0, 0.16, 0.05, 0, -0.06, 0.5, 0.12, -0.12,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(wing, 3));
  const material = new THREE.MeshBasicMaterial({ color: 0x2b3038, side: THREE.DoubleSide });

  const flocks = [
    { lat: 22.560, lng: 113.965, alt: 6.4, radius: 4.6, count: 5 }, // Lianhuashan Park
    { lat: 22.498, lng: 113.965, alt: 4.6, radius: 5.2, count: 4 }, // Shenzhen Bay
    { lat: 22.520, lng: 114.000, alt: 5.2, radius: 3.4, count: 3 }, // OCT Bay
  ];
  const random = seededRandom(77);
  flocks.forEach((flock) => {
    const center = project(flock.lat, flock.lng, flock.alt);
    for (let i = 0; i < flock.count; i += 1) {
      birdFleet.push({
        center,
        radius: flock.radius * (0.72 + random() * 0.5),
        alt: flock.alt + (random() - 0.5) * 1.6,
        speed: (0.24 + random() * 0.2) * (random() < 0.5 ? 1 : -1),
        phase: random() * Math.PI * 2,
        flapHz: 5 + random() * 2.5,
        size: 0.44 + random() * 0.22,
      });
    }
  });

  birdMesh = new THREE.InstancedMesh(geo, material, birdFleet.length);
  birdMesh.frustumCulled = false;
  scene.add(birdMesh);
}

const birdMatrix = new THREE.Matrix4();
const birdQuat = new THREE.Quaternion();
const birdEuler = new THREE.Euler();
const birdPos = new THREE.Vector3();
const birdScale = new THREE.Vector3();

function updateBirds(elapsed) {
  if (!birdMesh) return;
  birdFleet.forEach((bird, i) => {
    const dir = Math.sign(bird.speed);
    const theta = bird.phase + elapsed * Math.abs(bird.speed) * dir;
    birdPos.set(
      bird.center.x + Math.cos(theta) * bird.radius,
      bird.alt + Math.sin(elapsed * 1.1 + bird.phase) * 0.5,
      bird.center.z + Math.sin(theta) * bird.radius,
    );
    // Face along the circle's tangent, banked gently into the turn.
    const heading = Math.atan2(-Math.sin(theta) * dir, Math.cos(theta) * dir) + Math.PI / 2;
    birdEuler.set(0, heading, 0.3 * dir, "YXZ");
    birdQuat.setFromEuler(birdEuler);
    // Wing flap: squash/stretch the chevron height.
    const flap = 0.25 + Math.abs(Math.sin(elapsed * bird.flapHz + bird.phase)) * 1.35;
    birdScale.set(bird.size, bird.size * flap, bird.size);
    birdMatrix.compose(birdPos, birdQuat, birdScale);
    birdMesh.setMatrixAt(i, birdMatrix);
  });
  birdMesh.instanceMatrix.needsUpdate = true;
}

function createClouds() {
  const material = new THREE.MeshStandardMaterial({
    color: 0xf4f1e8,
    roughness: 0.92,
    transparent: true,
    opacity: 0.72,
  });
  const random = seededRandom(12);
  for (let i = 0; i < 8; i += 1) {
    const group = new THREE.Group();
    const parts = 3 + Math.floor(random() * 4);
    for (let j = 0; j < parts; j += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(1.2 + random() * 1.5, 12, 8), material);
      puff.scale.y = 0.38;
      puff.position.set((random() - 0.5) * 5, (random() - 0.5) * 0.6, (random() - 0.5) * 2);
      group.add(puff);
    }
    group.position.set(-62 + random() * 130, 26 + random() * 12, -70 + random() * 55);
    group.userData.speed = 0.45 + random() * 0.5;
    scene.add(group);
  }
}

function updateClouds(delta) {
  scene.children.forEach((child) => {
    if (!child.userData.speed) return;
    child.position.x += delta * child.userData.speed;
    if (child.position.x > 78) child.position.x = -78;
  });
}

// Soft-edged translucent pads hovering low over the out-of-focus areas
// (eastern districts, Hong Kong side): a cheap stand-in for depth-of-field blur that
// keeps the mainland crisp while the map's edges dissolve into atmosphere.
// Company pins out there still poke above the haze.
function makeHazeTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(128, 128, 24, 128, 128, 128);
  g.addColorStop(0, "rgba(226, 236, 243, 0.8)");
  g.addColorStop(0.65, "rgba(226, 236, 243, 0.45)");
  g.addColorStop(1, "rgba(226, 236, 243, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createHaze() {
  const tex = makeHazeTexture();
  const pads = [
    { lat: 22.600, lng: 114.160, w: 48, d: 36 }, // Longgang / Pingshan (faded)
    { lat: 22.575, lng: 114.130, w: 32, d: 26 }, // Henggang (faded)
    { lat: 22.455, lng: 113.950, w: 32, d: 28 }, // Hong Kong NW (faded)
    { lat: 22.488, lng: 114.000, w: 28, d: 36 }, // Hong Kong NE (faded)
  ];
  pads.forEach((pad, index) => {
    const material = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    plane.rotation.x = -Math.PI / 2;
    const p = project(pad.lat, pad.lng, 0.85 + index * 0.02);
    plane.position.copy(p);
    plane.scale.set(pad.w, pad.d, 1);
    plane.renderOrder = 4;
    scene.add(plane);
  });
}

// Tiny walkers looping the sidewalk edges of the mainland blocks: one
// instanced mesh, a couple hundred matrix updates per frame.
function rectPerimeterPoint(t, hx, hz, out) {
  const perimeter = 4 * (hx + hz);
  let d = (((t % 1) + 1) % 1) * perimeter;
  if (d < 2 * hx) return out.set(-hx + d, 0, -hz);
  d -= 2 * hx;
  if (d < 2 * hz) return out.set(hx, 0, -hz + d);
  d -= 2 * hz;
  if (d < 2 * hx) return out.set(hx - d, 0, hz);
  d -= 2 * hx;
  return out.set(-hx, 0, hz - d);
}

const PED_PALETTE = [0x30343c, 0x6b7280, 0x9a4a3f, 0x3b5f8a, 0x7d6a4f, 0xb8b2a4, 0x51606b, 0x8c3f5d].map(
  (c) => new THREE.Color(c),
);

function createPedestrians() {
  if (!sidewalkPlates.length) return;
  const random = seededRandom(515);
  const { uLen, vLen, rot } = GRID_METRICS;
  pedRect = {
    hx: (vLen - 0.26) / 2 + 0.06, // just outside the plate edge: the curb line
    hz: (uLen - 0.12) / 2 + 0.05,
    cos: Math.cos(rot),
    sin: Math.sin(rot),
  };
  const total = Math.min(240, sidewalkPlates.length * 3);
  for (let i = 0; i < total; i += 1) {
    const plate = sidewalkPlates[Math.floor(random() * sidewalkPlates.length)];
    pedFleet.push({
      cx: plate.x,
      cz: plate.z,
      t: random(),
      speed: (0.008 + random() * 0.009) * (random() < 0.5 ? 1 : -1),
      phase: random() * Math.PI * 2,
      size: 0.8 + random() * 0.45,
    });
  }
  const geo = new THREE.BoxGeometry(0.05, 0.15, 0.05);
  geo.translate(0, 0.075, 0); // feet at the origin
  pedMesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
    pedFleet.length,
  );
  pedFleet.forEach((_, i) => pedMesh.setColorAt(i, PED_PALETTE[i % PED_PALETTE.length]));
  scene.add(pedMesh);
}

const pedMatrix = new THREE.Matrix4();
const pedLocal = new THREE.Vector3();
const pedPos = new THREE.Vector3();
const pedScale = new THREE.Vector3();
const pedQuat = new THREE.Quaternion();

function updatePedestrians(delta, elapsed) {
  if (!pedMesh) return;
  pedFleet.forEach((ped, i) => {
    ped.t += delta * ped.speed;
    rectPerimeterPoint(ped.t, pedRect.hx, pedRect.hz, pedLocal);
    pedPos.set(
      ped.cx + pedLocal.x * pedRect.cos + pedLocal.z * pedRect.sin,
      0.032,
      ped.cz - pedLocal.x * pedRect.sin + pedLocal.z * pedRect.cos,
    );
    // A whisper of bounce sells the walk without skeletal anything.
    const bob = 1 + Math.sin(elapsed * 9 + ped.phase) * 0.06;
    pedScale.set(ped.size, ped.size * bob, ped.size);
    pedMatrix.compose(pedPos, pedQuat, pedScale);
    pedMesh.setMatrixAt(i, pedMatrix);
  });
  pedMesh.instanceMatrix.needsUpdate = true;
}

function updateWater(elapsed) {
  for (const water of waterSurfaces) {
    const geo = water.geometry;
    const pos = geo.attributes.position;
    const base = water.userData.baseZ;
    if (!base) continue;
    for (let i = 0; i < pos.count; i += 1) {
      const ix = i * 3;
      const x = base[ix];
      const y = base[ix + 1];
      const wave =
        Math.sin(x * 0.18 + elapsed * 0.6) * 0.08 +
        Math.cos(y * 0.22 - elapsed * 0.45) * 0.06;
      pos.array[ix + 2] = base[ix + 2] + wave;
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }
}

function createLabels() {
  STARTUPS.forEach((startup) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "marker-label";
    button.dataset.id = startup.id;
    button.dataset.stage = startup.stage ?? "";
    button.style.setProperty("--label-color", startup.stage === "上市" ? "var(--color-warning)" : startup.stage === "后期" ? "var(--color-accent-2)" : "var(--color-success)");
    button.innerHTML = `
      <img class="marker-label__logo" src="${escapeHtml(logoPath(startup))}" alt="" loading="lazy" decoding="async" draggable="false">
      <span>${escapeHtml(startup.nameZh || startup.name)}</span>
      ${startup.stage ? `<small>${escapeHtml(startup.stage)}</small>` : ""}
    `;
    button.addEventListener("click", () => selectStartup(startup.id));
    labelsLayer.appendChild(button);
    labelElements.set(startup.id, button);
  });

}

function updateLabels() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const activeItems = new Set(areaItems(state.activeAreaId).map((item) => item.id));
  const activeArea = state.activeAreaId;
  const keyNames = new Set(["Tencent", "DJI", "SenseTime (SZ)", "PingAn Tech", "UBTech", "ZTE", "RoboSense", "WeBank", "Han's Laser", "XtalPi", "Huawei", "Foxconn", "Honor", "SF Express", "Transsion", "Mindray", "Kingdee", "Goodix"]);

  // Phase 1: figure out which labels are visible and where their pins land.
  const candidates = [];
  STARTUPS.forEach((startup) => {
    const marker = startupMarkers.get(startup.id);
    const label = labelElements.get(startup.id);
    if (!marker || !label) return;
    const world = marker.group.position.clone();
    world.y += 1.55;
    const projected = world.project(camera);
    const visibleOnScreen =
      projected.z > -1 &&
      projected.z < 1 &&
      projected.x > -1.08 &&
      projected.x < 1.08 &&
      projected.y > -1.08 &&
      projected.y < 1.08;
    const inArea = activeArea === "all" || activeItems.has(startup.id);
    const isKey = keyNames.has(startup.name) || startup.stage === "上市" || startup.stage === "后期";
    const showByMode = state.labelsMode === "all" ? inArea : inArea && (isKey || state.selectedId === startup.id);
    const selected = state.selectedId === startup.id;

    label.classList.toggle("is-muted", activeArea !== "all" && !activeItems.has(startup.id));
    label.classList.toggle("is-dimmed", Boolean(state.selectedId) && !selected);
    label.classList.toggle("is-selected", selected);

    const show = visibleOnScreen && showByMode;
    if (!show) {
      label.classList.add("is-hidden");
      label.classList.remove("has-leader");
      return;
    }

    const ax = (projected.x * 0.5 + 0.5) * width;
    const ay = (-projected.y * 0.5 + 0.5) * height;
    let w = labelDims.get(startup.id)?.w;
    let h = labelDims.get(startup.id)?.h;
    if (!w) {
      w = label.offsetWidth || 120;
      h = label.offsetHeight || 28;
      labelDims.set(startup.id, { w, h });
    }
    candidates.push({
      label,
      ax,
      ay,
      w,
      h,
      depth: projected.z,
      priority: selected ? 3 : isKey ? 2 : 1,
    });
  });

  // Phase 2: greedy declutter. Higher priority places first; later labels that
  // collide get pushed straight up, with a leader line back down to their pin.
  candidates.sort((a, b) => b.priority - a.priority || a.ay - b.ay);
  const placed = [];
  const PAD = 3;
  const STEP = 5;
  const MAX_SHIFT = 150;
  candidates.forEach((c) => {
    let shift = 0;
    const rectAt = (s) => ({
      left: c.ax - c.w / 2 - PAD,
      right: c.ax + c.w / 2 + PAD,
      top: c.ay - s - 1.1 * c.h - PAD,
      bottom: c.ay - s - 0.1 * c.h + PAD,
    });
    const hits = (r) =>
      placed.some(
        (p) => r.left < p.right && r.right > p.left && r.top < p.bottom && r.bottom > p.top,
      );
    let rect = rectAt(shift);
    while (hits(rect) && shift < MAX_SHIFT) {
      shift += STEP;
      rect = rectAt(shift);
    }
    // Lowest-priority labels that still can't fit step aside (hidden) to keep it tidy.
    if (hits(rect) && c.priority === 1) {
      c.label.classList.add("is-hidden");
      c.label.classList.remove("has-leader");
      return;
    }
    placed.push(rect);
    c.label.classList.remove("is-hidden");
    c.label.style.left = `${c.ax}px`;
    c.label.style.top = `${c.ay - shift}px`;
    c.label.style.setProperty("--leader", `${shift + 4}px`);
    c.label.classList.toggle("has-leader", shift > 6);
  });

  landmarkLabelElements.forEach(({ el, point }) => {
    const world = project(point.lat, point.lng, point.y);
    const projected = world.project(camera);
    const visibleOnScreen =
      projected.z > -1 &&
      projected.z < 1 &&
      projected.x > -1.08 &&
      projected.x < 1.08 &&
      projected.y > -1.08 &&
      projected.y < 1.08;
    const show = visibleOnScreen && (state.activeAreaId === "all" || state.labelsMode === "all");
    el.style.left = `${(projected.x * 0.5 + 0.5) * width}px`;
    el.style.top = `${(-projected.y * 0.5 + 0.5) * height}px`;
    el.style.opacity = show ? "1" : "0";
  });
}

// Static legend explaining the stage colors used by pins and label tags.
function renderPinLegend() {
  const entries = [
    { label: "早期", css: "var(--color-success)" },
    { label: "后期", css: "var(--color-accent-2)" },
    { label: "上市", css: "var(--color-warning)" },
  ];
  pinLegend.innerHTML = entries
    .map(
      (entry) =>
        `<span class="pin-legend__item"><i style="background:${entry.css}"></i>${escapeHtml(entry.label)}</span>`,
    )
    .join("");
}

function renderAreaList() {
  areaList.innerHTML = "";
  AREAS.forEach((area) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "area-button";
    button.dataset.area = area.id;
    const count = areaItems(area.id).length;
    button.innerHTML = `<span class="area-button__number">${area.number}</span><span class="area-button__label">${escapeHtml(area.label)}</span><span class="area-button__count">${count}</span>`;
    button.addEventListener("click", () => setActiveArea(area.id));
    areaList.appendChild(button);
  });
}

function miniMapPosition(item) {
  const x = 10 + ((item.lng - 113.80) / 0.40) * 140;
  const y = 10 + ((22.66 - item.lat) / 0.23) * 100;
  return { x: Math.max(5, Math.min(155, x)), y: Math.max(5, Math.min(115, y)) };
}

function renderMiniMap() {
  miniMapPoints.innerHTML = "";
  STARTUPS.forEach((startup) => {
    const point = miniMapPosition(startup);
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", point.x);
    circle.setAttribute("cy", point.y);
    circle.setAttribute("r", startup.stage === "后期" || startup.stage === "上市" ? "2.4" : "1.6");
    circle.classList.add("mini-point");
    circle.dataset.id = startup.id;
    miniMapPoints.appendChild(circle);
  });
}

function updateUiState() {
  document.querySelectorAll(".area-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.area === state.activeAreaId);
  });
  document.querySelectorAll(".mini-point").forEach((point) => {
    const item = STARTUPS.find((startup) => startup.id === point.dataset.id);
    point.classList.toggle("is-active", item?.area === state.activeAreaId || state.activeAreaId === "all");
  });
  document.body.classList.toggle("is-focused", Boolean(state.selectedId));

  // Slide the active area's description in right below its row.
  const activeButton = areaList.querySelector(`.area-button[data-area="${state.activeAreaId}"]`);
  const area = AREA_BY_ID[state.activeAreaId];
  if (activeButton && area) {
    areaDescEl.textContent = area.description;
    activeButton.insertAdjacentElement("afterend", areaDescEl);
  } else {
    areaDescEl.remove();
  }
}

/* ---------------------------------------------------------------- */
/* Deep links: #/company/:id and #/area/:id, with back/forward       */
/* ---------------------------------------------------------------- */

let suppressHashEvent = false;

function writeHash(hash) {
  if (location.hash === hash) return;
  suppressHashEvent = true;
  location.hash = hash;
}

function shareUrl(hash) {
  return `${location.origin}${location.pathname}${hash}`;
}

function applyHashFromLocation() {
  const hash = location.hash || "#/";
  const company = hash.match(/^#\/company\/([\w-]+)$/);
  if (company && STARTUPS.some((s) => s.id === company[1])) {
    selectStartup(company[1]);
    return;
  }
  const area = hash.match(/^#\/area\/([\w-]+)$/);
  if (area && AREA_BY_ID[area[1]]) {
    setActiveArea(area[1]);
    return;
  }
  if (hash === "#/" || hash === "#") setActiveArea("all");
}

function setActiveArea(areaId, { keepSelection = false } = {}) {
  state.activeAreaId = areaId;
  if (!keepSelection) {
    state.selectedId = null;
    releaseFocus();
  }
  const area = AREA_BY_ID[areaId];
  flyTo(area.focus);
  renderAreaDetail(area);
  updateUiState();
  if (!keepSelection) {
    writeHash(areaId === "all" ? "#/" : `#/area/${areaId}`);
  }
}

function selectStartup(id) {
  const startup = STARTUPS.find((item) => item.id === id);
  if (!startup) return;
  state.selectedId = id;
  state.activeAreaId = startup.area;
  flyTo({ lat: startup.lat, lng: startup.lng, distance: 18, height: 16, rotation: 0.72 }, { cinematic: true });
  engageFocus(startup);
  renderStartupDetail(startup);
  updateUiState();
  writeHash(`#/company/${id}`);
}

function renderAreaDetail() {
  // The card slot shows a persistent "how to explore" guide whenever no
  // company is selected; selecting a company swaps in its details.
  if (state.selectedId) {
    detailCard.classList.add("is-hidden");
    detailCard.classList.remove("is-onboard");
    return;
  }
  detailCard.classList.add("is-onboard");
  detailCard.classList.remove("is-hidden");
  detailCard.innerHTML = `
    <p class="onboard-title">探索方式</p>
    <ul class="onboard">
      <li><span class="onboard__keys"><kbd>↑</kbd><kbd>↓</kbd></span><span>切换街区区域</span></li>
      <li><span class="onboard__keys"><kbd>⌘</kbd><kbd>K</kbd></span><span>搜索任意公司</span></li>
      <li><span class="onboard__keys"><kbd class="onboard__click">点击</kbd></span><span>点击标记查看详情</span></li>
    </ul>
  `;
}

function renderStartupDetail(startup) {
  const url = safeUrl(startup.website);
  const info = COMPANY_INFO[startup.id] || {};
  const blurb =
    info.blurb ||
    startup.notes ||
    `${startup.sector || "AI公司"}，位于深圳地图。`;
  const loc = info.loc || AREA_BY_ID[startup.area]?.shortLabel || "深圳";

  let host = "";
  if (url) {
    try {
      host = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      host = "";
    }
  }

  const meta = [startup.stage, startup.office, loc]
    .filter(Boolean)
    .join(" · ");
  // Optional enrichment fields; rendered only when the data actually has them.
  const facts = [
    startup.founded ? `成立于${startup.founded}年` : null,
    startup.team ? `约${startup.team}人` : null,
    startup.raised ? `融资${startup.raised}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const jobsUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(startup.name)}&location=Shenzhen`;

  detailCard.classList.remove("is-hidden", "is-onboard");
  detailCard.innerHTML = `
    <button class="detail-card__close" type="button" aria-label="关闭">&times;</button>
    <div class="detail-card__head">
      <img class="detail-card__logo" src="${escapeHtml(logoPath(startup))}" alt="" loading="lazy" decoding="async" draggable="false">
      <div class="detail-card__heading">
        <h2>${escapeHtml(startup.nameZh || startup.name)}</h2>
        ${startup.sector ? `<p class="detail-card__sector">${escapeHtml(startup.sector)}</p>` : ""}
      </div>
    </div>
    <p class="detail-card__blurb">${escapeHtml(blurb)}</p>
    ${meta ? `<p class="detail-card__meta">${escapeHtml(meta)}</p>` : ""}
    ${facts ? `<p class="detail-card__meta">${escapeHtml(facts)}</p>` : ""}
    <div class="detail-card__actions">
      ${url ? `<a class="detail-card__link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(host || "访问官网")} ↗</a>` : ""}
      <a class="detail-card__ghost" href="${escapeHtml(jobsUrl)}" target="_blank" rel="noreferrer">招聘 ↗</a>
      <button class="detail-card__ghost" type="button" data-copy>复制链接</button>
    </div>
  `;
  const closeBtn = detailCard.querySelector(".detail-card__close");
  if (closeBtn) closeBtn.addEventListener("click", () => clearSelection());
  const copyBtn = detailCard.querySelector("[data-copy]");
  if (copyBtn)
    copyBtn.addEventListener("click", async () => {
      copyBtn.textContent = (await copyText(shareUrl(`#/company/${startup.id}`))) ? "已复制" : "复制失败";
      setTimeout(() => {
        copyBtn.textContent = "复制链接";
      }, 1400);
    });
}

// Clipboard API first, hidden-textarea execCommand as the fallback.
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

function clearSelection() {
  state.selectedId = null;
  releaseFocus();
  const area = AREA_BY_ID[state.activeAreaId] || AREA_BY_ID.all;
  renderAreaDetail(area);
  updateUiState();
  writeHash(area.id === "all" ? "#/" : `#/area/${area.id}`);
}

function cameraDestination(focus) {
  const target = project(focus.lat, focus.lng, 0.8);
  const rotation = focus.rotation ?? 0.66;
  const distance = focus.distance ?? 40;
  const height = focus.height ?? 28;
  const position = new THREE.Vector3(
    target.x + Math.sin(rotation) * distance,
    height,
    target.z + Math.cos(rotation) * distance,
  );
  return { target, position };
}

function flyTo(focus, { cinematic = false } = {}) {
  const destination = cameraDestination(focus);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const flight = {
    startTime: performance.now(),
    duration: reduced ? 120 : cinematic ? 1900 : 1300,
    fromPos: camera.position.clone(),
    fromTarget: controls.target.clone(),
    toPos: destination.position,
    toTarget: destination.target,
  };

  // Startup selections dolly along a lift -> arc -> settle curve instead of a
  // straight lerp, so flying across the city reads like a camera move.
  if (cinematic && !reduced) {
    const from = flight.fromPos.clone();
    const to = flight.toPos.clone();
    const dist = from.distanceTo(to);
    const lift = Math.min(30, 8 + dist * 0.34);
    const mid1 = from.clone().lerp(to, 0.28);
    mid1.y = Math.max(from.y, to.y) + lift;
    const mid2 = from.clone().lerp(to, 0.8);
    mid2.y = to.y + lift * 0.42;
    flight.path = new THREE.CatmullRomCurve3([from, mid1, mid2, to], false, "centripetal");
  }
  state.flight = flight;
}

function updateFlight() {
  if (!state.flight) return;
  const elapsed = performance.now() - state.flight.startTime;
  const raw = Math.min(1, elapsed / state.flight.duration);
  const t = 1 - Math.pow(1 - raw, 3);
  if (state.flight.path) camera.position.copy(state.flight.path.getPointAt(t));
  else camera.position.lerpVectors(state.flight.fromPos, state.flight.toPos, t);
  controls.target.lerpVectors(state.flight.fromTarget, state.flight.toTarget, t);
  if (raw >= 1) state.flight = null;
}

function updateMarkerScale(time) {
  const activeItems = new Set(areaItems(state.activeAreaId).map((item) => item.id));
  const hasSelection = Boolean(state.selectedId);
  startupMarkers.forEach(({ group, halo, item }) => {
    const active = state.activeAreaId === "all" || activeItems.has(item.id);
    const selected = state.selectedId === item.id;
    const pulse = 1 + Math.sin(time * 3.2 + item.lat) * 0.04;
    const scale = selected ? 1.24 * pulse : active ? (hasSelection ? 0.8 : 0.92) : 0.58;
    group.scale.setScalar(scale);
    // With a company in focus, every other pin steps back into the haze.
    const targetOpacity = selected ? 1 : active ? (hasSelection ? 0.45 : 1) : hasSelection ? 0.18 : 0.32;
    group.children.forEach((child) => {
      if (child.userData.hitArea) {
        child.material.opacity = 0;
        return;
      }
      if (child.material?.opacity !== undefined) {
        child.material.transparent = targetOpacity < 1;
        child.material.opacity = targetOpacity;
      }
    });
    halo.rotation.z += 0.01;
  });
}

function pickMarker(event) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(markerMeshes, false);
  return hits[0]?.object?.userData?.item || null;
}

function onPointerMove(event) {
  hoverCandidate = pickMarker(event);
  canvas.style.cursor = hoverCandidate ? "pointer" : "grab";
}

function onPointerDown(event) {
  pointerDown = { x: event.clientX, y: event.clientY, item: pickMarker(event) };
}

// Selection happens on release so an orbit drag never triggers it. A click on
// a marker selects it; a click on empty map clears the current selection.
function onPointerUp(event) {
  if (!pointerDown) return;
  const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
  const item = pointerDown.item;
  pointerDown = null;
  if (moved > 6) return; // a drag, not a click
  if (item) selectStartup(item.id);
  else if (state.selectedId) clearSelection();
}

function renderSearchResults(query) {
  const value = query.trim().toLowerCase();
  searchActiveIndex = -1;

  // No query: show a few suggested companies so the modal is never empty.
  let results;
  if (!value) {
    const featured = ["Tencent", "DJI", "SenseTime (SZ)", "PingAn Tech", "UBTech", "ZTE"];
    results = featured
      .map((name) => STARTUPS.find((s) => s.name === name))
      .filter(Boolean)
      .slice(0, 6);
  } else {
    results = STARTUPS.filter((startup) => {
      const info = COMPANY_INFO[startup.id] || {};
      const haystack =
        `${startup.name} ${startup.nameZh ?? ""} ${startup.sector ?? ""} ${startup.stage ?? ""} ${AREA_BY_ID[startup.area]?.label ?? ""} ${info.loc ?? ""} ${info.blurb ?? ""}`.toLowerCase();
      return haystack.includes(value);
    }).slice(0, 8);
  }

  if (!results.length) {
    searchResults.innerHTML = `<div class="search-result" aria-disabled="true"><span class="search-result__body"><strong>未找到结果</strong><span>试试公司名称、行业、阶段或区域。</span></span></div><a class="search-results__cta" href="https://github.com/yzengchn/shenzhen-map/blob/main/CONTRIBUTING.md" target="_blank" rel="noreferrer noopener">知道有公司应该出现在这里？添加到地图 ↗</a>`;
    return;
  }

  searchResults.innerHTML = results
    .map((startup) => {
      const info = COMPANY_INFO[startup.id] || {};
      const sub = [startup.sector, info.loc]
        .filter(Boolean)
        .join(" · ");
      return `
        <button class="search-result" type="button" role="option" data-id="${startup.id}">
          <img class="search-result__logo" src="${escapeHtml(logoPath(startup))}" alt="" loading="lazy" decoding="async">
          <span class="search-result__body">
            <strong>${escapeHtml(startup.nameZh || startup.name)}</strong>
            <span>${escapeHtml(sub || "AI公司")}</span>
          </span>
        </button>
      `;
    })
    .join("");
}

function searchResultButtons() {
  return [...searchResults.querySelectorAll(".search-result[data-id]")];
}

function setSearchActive(index) {
  const buttons = searchResultButtons();
  if (!buttons.length) return;
  searchActiveIndex = (index + buttons.length) % buttons.length;
  buttons.forEach((b, i) => b.classList.toggle("is-active", i === searchActiveIndex));
  buttons[searchActiveIndex].scrollIntoView({ block: "nearest" });
}

function openSearch() {
  if (searchModal.open) return;
  searchInput.value = "";
  renderSearchResults("");
  searchModal.showModal();
  requestAnimationFrame(() => searchInput.focus());
}

function closeSearch() {
  if (searchModal.open) searchModal.close();
}

function bindEvents() {
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", () => {
    pointerDown = null;
  });

  searchTrigger.addEventListener("click", openSearch);

  searchInput.addEventListener("input", () => renderSearchResults(searchInput.value));
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSearchActive(searchActiveIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSearchActive(searchActiveIndex - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const buttons = searchResultButtons();
      const choice = buttons[searchActiveIndex] || buttons[0];
      if (choice) {
        selectStartup(choice.dataset.id);
        closeSearch();
      }
    }
  });

  searchResults.addEventListener("click", (event) => {
    const button = event.target.closest(".search-result[data-id]");
    if (!button) return;
    selectStartup(button.dataset.id);
    closeSearch();
  });

  // Click on the backdrop (outside the content) closes the dialog.
  searchModal.addEventListener("click", (event) => {
    if (event.target === searchModal) closeSearch();
  });

  window.addEventListener("keydown", (event) => {
    const isSearchShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
    if (isSearchShortcut) {
      event.preventDefault();
      if (searchModal.open) closeSearch();
      else openSearch();
      return;
    }

    // Don't hijack typing or the open search dialog.
    if (searchModal.open) return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    // ↑ / ↓ cycle through every view, wrapping between the east districts and Whole Board.
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const current = Math.max(0, AREAS.findIndex((a) => a.id === state.activeAreaId));
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const next = (current + direction + AREAS.length) % AREAS.length;
      setActiveArea(AREAS[next].id);
    }
  });

  const brand = document.querySelector(".brand");
  if (brand)
    brand.addEventListener("click", (event) => {
      event.preventDefault();
      setActiveArea("all");
    });

  // Browser back/forward re-applies the hash route.
  window.addEventListener("hashchange", () => {
    if (suppressHashEvent) {
      suppressHashEvent = false;
      return;
    }
    applyHashFromLocation();
  });

}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.04);
  const elapsed = clock.elapsedTime;
  updateFlight();
  updateWater(elapsed);
  updateVehicles(delta);
  updatePedestrians(delta, elapsed);
  updateTransit(delta);
  updateClouds(delta);
  updateBirds(elapsed);
  updateMarkerScale(elapsed);
  updateFocusFx(elapsed, delta);
  controls.update();
  renderer.render(scene, camera);
  updateLabels();
  window.requestAnimationFrame(animate);
}

function init() {
  createLights();
  createBaseMap();
  createStreetTrees();
  buildTrees();
  const roadPaths = createStreetNetwork();
  createSubwayLayer();
  createBuildings();
  createPedestrians();
  createLandmarks();
  createCompanyBuildings();
  createMarkers();
  createVehicles(roadPaths);
  createFerries();
  createPlanes();
  createClouds();
  createBirds();
  createHaze();
  createLabels();
  renderAreaList();
  renderMiniMap();
  renderPinLegend();
  bindEvents();
  // Label sizes are cached for the declutter pass; re-measure once the pixel font lands.
  if (document.fonts?.ready) document.fonts.ready.then(() => labelDims.clear());
  const initial = cameraDestination(AREA_BY_ID.all.focus);
  camera.position.copy(initial.position);
  controls.target.copy(initial.target);
  renderAreaDetail(AREA_BY_ID.all);
  updateUiState();
  // Deep links: land directly on a shared company or area.
  if (location.hash && location.hash !== "#/") applyHashFromLocation();
  animate();
}

init();

window.SZAIAtlas = {
  startups: STARTUPS.length,
  sources: DATA_SOURCES,
  flyToArea: setActiveArea,
};

window.__atlas = { scene, camera, controls, project, THREE, selectStartup };
