// Shenzhen geography for the atlas, all coordinates [lat, lng] in GCJ-02.
// Coastline traced from confirmed Tencent Maps GCJ-02 coordinates for key
// landmarks (ports, metro stations, parks). Building scatter is clipped to
// these polygons so nothing lands in the sea.

// ---- Coastlines -----------------------------------------------------------

// Core landmass: Bao'an -> Nanshan (Shekou peninsula) -> Futian -> Luohou,
// traced clockwise from the northwest (Bao'an Pearl River mouth).
export const SZ_MAINLAND = [
  // West (Pearl River / Lingdingyang) side, north -> south
  [22.640, 113.815], // Bao'an NW (near Airport East coast)
  [22.615, 113.830], // Bao'an N (west of Hourui station 22.629, 113.836)
  [22.590, 113.848], // Bao'an Center W (west of Xixiang station 22.575, 113.863)
  [22.568, 113.860], // Dachan Bay S (west of Pingzhou station 22.569, 113.871)
  // Dachan Bay reclaimed land — Tencent Penguin Island (企鹅岛)
  [22.555, 113.856], // Tencent island NW (campus north shore)
  [22.542, 113.853], // Tencent island W (Pearl River waterfront, GCJ-02 ~113.853)
  [22.530, 113.857], // Tencent island SW
  [22.524, 113.870], // Tencent island S (coast curves back east)
  [22.526, 113.882], // Qianhai W (rejoin mainland coast)
  [22.528, 113.888], // Qianhai SW (near Qianhai Stone Park 22.527, 113.890)
  [22.510, 113.876], // Mawan N (south of Mawan station 22.508, 113.886)
  [22.490, 113.873], // Mawan (Mawan Port GCJ-02: 22.490, 113.873)
  [22.480, 113.876], // Mawan S (Mawan GCJ-02: 22.485, 113.876)
  [22.467, 113.882], // Chiwan (Chiwan Container Terminal: 22.465, 113.883)
  // Shekou peninsula south coast, SW -> SE
  [22.458, 113.894], // Shekou SW (Shekou Container Terminal: 22.458, 113.894)
  [22.469, 113.912], // Shekou Port (Shekou Port station: 22.477, 113.912)
  [22.475, 113.920], // Shekou SE
  // Shenzhen Bay (east shore of peninsula), south -> north
  [22.480, 113.933], // Peninsula tip (Peninsula City: 22.480, 113.933)
  [22.486, 113.935], // Dongjiaotou (Dongjiaotou station: 22.486, 113.931)
  [22.496, 113.948], // Shenzhen Bay Port (SZ Bay Port: 22.496, 113.948)
  [22.505, 113.955], // Coast curves NE
  [22.512, 113.968], // Shenzhen Bay Park S
  [22.518, 113.985], // Shenzhen Bay Park center
  [22.522, 114.000], // Shenzhen Bay Park N
  [22.524, 114.013], // Mangrove (Futian Mangrove: 22.524, 114.013)
  [22.520, 114.030], // Futian bayfront
  [22.515, 114.045], // Futian river mouth S (Mangrove station: 22.514, 114.038)
  // East (Futian -> Luohou) side, south -> north
  [22.525, 114.055], // Futian SE
  [22.535, 114.065], // Futian E
  [22.540, 114.085], // Futian NE (pushed east for Honor HQ)
  [22.552, 114.092], // Futian NE2
  [22.562, 114.092], // Luohou E
  [22.575, 114.100], // Luohou NE
  [22.595, 114.098], // Buji
  // Inland / frame edges, north -> west
  [22.612, 114.088], // Buji N
  [22.642, 114.085], // Longhua NE (extended for Foxconn/FII)
  [22.652, 114.055], // Bantian N (extended north for Huawei)
  [22.635, 114.020], // Longhua
  [22.638, 113.970], // Longhua W / Dalang
  [22.635, 113.920], // Xili N
  [22.625, 113.880], // Bao'an N
  [22.640, 113.850], // Bao'an NW
];

// Eastern districts (intentionally sparse + faded): Longgang / Pingshan to the NE.
export const SZ_EAST = [
  [22.612, 114.095], // Buji E
  [22.620, 114.140], // Longgang W
  [22.600, 114.180], // Longgang
  [22.580, 114.205], // Pingshan
  [22.560, 114.160], // Henggang
  [22.570, 114.100], // Buji S
];

// Hong Kong side (New Territories, across Shenzhen Bay) — faded sketch only.
export const SZ_HK = [
  [22.455, 113.925], // Yuen Long N
  [22.448, 113.960], // Lau Fau Shan
  [22.458, 113.990], // Mai Po
  [22.480, 114.005], // San Tin
  [22.500, 113.995], // Lok Ma Chau (opposite)
];

// Dachan Island (small, in the Pearl River mouth off Qianhai).
export const DACHAN_ISLAND = [
  [22.545, 113.820],
  [22.550, 113.815],
  [22.548, 113.808],
  [22.543, 113.812],
];

// Harbor / river islands drawn as ellipses (center + radius).
export const HARBOR_ISLANDS = [
  { name: "Dachan Island", lat: 22.546, lng: 113.815, rLat: 0.004, rLng: 0.004 },
  { name: "Nei Lingding Island", lat: 22.480, lng: 113.798, rLat: 0.005, rLng: 0.005 },
  { name: "Mazhou Island", lat: 22.476, lng: 113.892, rLat: 0.0018, rLng: 0.0022 },
];

// ---- Parks ----------------------------------------------------------------

// Lianhuashan Park (Futian central green) — the rotated rectangle on the ridge.
export const CENTRAL_PARK = [
  [22.5570, 114.0680], // SW
  [22.5605, 114.0765], // SE
  [22.5672, 114.0722], // NE
  [22.5638, 114.0638], // NW
];

// Features inside Lianhuashan: {center, rLat, rLng, kind}
export const CENTRAL_PARK_FEATURES = [
  { lat: 22.5620, lng: 114.0705, rLat: 0.0018, rLng: 0.0022, kind: "lawn" }, // Summit plaza lawn
  { lat: 22.5600, lng: 114.0695, rLat: 0.0014, rLng: 0.0016, kind: "water" }, // Koi pond
];

// Smaller named green spaces: closed polygons
export const PARKS = [
  // Talent Park (Houhai)
  [
    [22.5080, 113.9420],
    [22.5130, 113.9460],
    [22.5115, 113.9500],
    [22.5065, 113.9460],
  ],
  // Shenzhen Bay Park (waterfront strip, east side of the bay)
  [
    [22.5000, 113.9480],
    [22.5100, 113.9620],
    [22.5160, 113.9800],
    [22.5200, 114.0000],
    [22.5150, 114.0120],
    [22.5050, 113.9900],
    [22.4980, 113.9650],
  ],
  // Dasha River Ecological Corridor (Nanshan)
  [
    [22.5360, 113.9500],
    [22.5550, 113.9650],
    [22.5530, 113.9700],
    [22.5340, 113.9550],
  ],
  // Lizhi Park (Luohu)
  [
    [22.5515, 114.1080],
    [22.5545, 114.1110],
    [22.5525, 114.1140],
    [22.5495, 114.1110],
  ],
  // Zhongshan Park (Nanshan N)
  [
    [22.5600, 113.9080],
    [22.5630, 113.9120],
    [22.5610, 113.9150],
    [22.5580, 113.9110],
  ],
  // Bijia Mountain Park (Futian)
  [
    [22.5680, 114.0700],
    [22.5720, 114.0740],
    [22.5700, 114.0780],
    [22.5660, 114.0740],
  ],
  // Shenzhen Central Park (Futian green spine)
  [
    [22.5430, 114.0620],
    [22.5560, 114.0680],
    [22.5540, 114.0720],
    [22.5410, 114.0660],
  ],
  // Tanglang Mountain Country Park (Nanshan N)
  [
    [22.5850, 113.9450],
    [22.5980, 113.9600],
    [22.5940, 113.9680],
    [22.5820, 113.9540],
  ],
  // Mangrove Nature Reserve (Futian bayfront)
  [
    [22.5180, 114.0080],
    [22.5250, 114.0200],
    [22.5220, 114.0300],
    [22.5160, 114.0180],
  ],
  // Safari Park / OCT Bay area (Nanshan)
  [
    [22.5180, 113.9780],
    [22.5220, 113.9850],
    [22.5190, 113.9890],
    [22.5150, 113.9820],
  ],
];

// ---- Districts (for building height + density) ----------------------------
// Each district scatters buildings inside the SHENZHEN core clipped to the polygon.
// Heights in world units; ~1 unit ≈ 90m. Ping An Finance Center ≈ 6.6, KK100 ≈ 4.9.
export const DISTRICTS = [
  { name: "Nanshan Tech Park", bbox: [22.510, 22.560, 113.910, 113.990], count: 300, h: [0.6, 2.4], tall: 0.28 },
  { name: "Houhai / SZ Bay", bbox: [22.494, 22.530, 113.930, 113.990], count: 130, h: [0.8, 3.4], tall: 0.32 },
  { name: "Qianhai", bbox: [22.510, 22.545, 113.870, 113.920], count: 110, h: [0.7, 2.8], tall: 0.22 },
  { name: "Futian CBD", bbox: [22.524, 22.552, 114.020, 114.090], count: 240, h: [0.9, 3.8], tall: 0.38 },
  { name: "Luohou", bbox: [22.545, 22.580, 114.070, 114.110], count: 210, h: [0.5, 2.3], tall: 0.18 },
  { name: "Bao'an Center", bbox: [22.548, 22.610, 113.840, 113.900], count: 190, h: [0.5, 1.9], tall: 0.15 },
  { name: "Dachan Bay / Tencent Campus", bbox: [22.520, 22.556, 113.850, 113.886], count: 90, h: [0.6, 1.8], tall: 0.12 },
  { name: "Liuxiandong / Xili", bbox: [22.545, 22.600, 113.920, 113.990], count: 130, h: [0.6, 2.5], tall: 0.22 },
  { name: "Longhua / Bantian", bbox: [22.595, 22.655, 113.940, 114.090], count: 180, h: [0.4, 1.6], tall: 0.10 },
  // Central Futian: Chegongmiao, Meilin, Xiangmihu — fill between Nanshan and Futian CBD.
  { name: "Chegongmiao / Meilin", bbox: [22.524, 22.580, 113.975, 114.040], count: 0, h: [0.5, 1.8], tall: 0.15 },
  // Bagualing / Huaqiangbei corridor between Futian CBD and Luohou.
  { name: "Bagualing", bbox: [22.552, 22.580, 114.040, 114.085], count: 0, h: [0.5, 2.0], tall: 0.18 },
  // Outer boroughs are intentionally sparse + faded: the map is complete for
  // the Nanshan-Futian core and only sketches the edges where companies sit.
  { name: "Longgang", bbox: [22.558, 22.622, 114.092, 114.205], count: 560, h: [0.25, 0.62], tall: 0, faded: true },
  { name: "HongKong", bbox: [22.440, 22.505, 113.918, 114.010], count: 480, h: [0.22, 0.5], tall: 0, faded: true },
];

// ---- Subway lines ---------------------------------------------------------
// Coordinates verified against Tencent Maps GCJ-02 station data.
// {color, name, stops:[[lat,lng],...]}
export const SUBWAY_LINES = [
  {
    name: "1",
    color: 0x009bc0, // cyan (Luobao line, east-west spine)
    stops: [
      [22.5345, 114.1160], // Luohou
      [22.5420, 114.1140], // Guomao/Laojie
      [22.5440, 114.1090], // Grand Theater
      [22.5440, 114.0990], // Science Museum
      [22.5420, 114.0890], // Huaqiang Rd
      [22.5400, 114.0760], // Gangxia
      [22.5370, 114.0680], // Convention & Exhibition
      [22.5350, 114.0600], // Shopping Park
      [22.5340, 114.0480], // Xiangmi Lake
      [22.5330, 114.0360], // Chegongmiao
      [22.5300, 114.0200], // Zhuzilin
      [22.5280, 114.0060], // Qiaocheng East
      [22.5320, 113.9950], // Overseas Chinese Town
      [22.5350, 113.9850], // Window of the World
      [22.5400, 113.9760], // Baishizhou
      [22.5400, 113.9540], // Hi-Tech Park (confirmed GCJ-02)
      [22.5390, 113.9440], // Shenzhen University (confirmed)
      [22.5320, 113.9250], // Taoyuan (confirmed)
      [22.5320, 113.9150], // Daxin (confirmed)
      [22.5320, 113.9030], // Liyumen (confirmed)
      [22.5370, 113.8980], // Qianhai Bay (confirmed)
      [22.5480, 113.8950], // Xin'an (confirmed)
      [22.5550, 113.8870], // Bao'an Center (confirmed)
      [22.5610, 113.8810], // Baoti (confirmed)
      [22.5690, 113.8710], // Pingzhou (confirmed)
      [22.5750, 113.8630], // Xixiang (confirmed)
      [22.6010, 113.8470], // Guxu (confirmed)
      [22.6290, 113.8360], // Hourui (confirmed)
      [22.6470, 113.8230], // Airport East (confirmed)
    ],
  },
  {
    name: "2",
    color: 0xe36c09, // orange (Shekou line, Shekou -> Futian -> Luohou)
    stops: [
      [22.4790, 113.8980], // Chiwan (confirmed GCJ-02)
      [22.4770, 113.9120], // Shekou Port (confirmed)
      [22.4850, 113.9150], // Sea World (confirmed)
      [22.4880, 113.9200], // Shuiwan (confirmed)
      [22.4860, 113.9310], // Dongjiaotou (confirmed)
      [22.4930, 113.9390], // Wanxia (confirmed)
      [22.5000, 113.9380], // Haiyue (confirmed)
      [22.5090, 113.9380], // Dengliang (confirmed)
      [22.5190, 113.9420], // Houhai (confirmed)
      [22.5270, 113.9470], // Keyuan (confirmed)
      [22.5320, 113.9600], // Mangrove Bay
      [22.5350, 113.9750], // Qiaocheng North
      [22.5380, 113.9850], // Shenkang
      [22.5410, 113.9950], // Antuo Hill
      [22.5430, 114.0050], // Qiaoxiang
      [22.5450, 114.0150], // Xiangmi
      [22.5480, 114.0250], // Xiangmei North
      [22.5480, 114.0350], // Lianhua West
      [22.5420, 114.0450], // Futian
      [22.5400, 114.0550], // Civic Center
      [22.5420, 114.0650], // Gangxia North
      [22.5450, 114.0750], // Huaqiang North
      [22.5480, 114.0900], // Grand Theater/Hubei
      [22.5500, 114.1200], // Huangbeiling
    ],
  },
  {
    name: "11",
    color: 0x6e2a8e, // purple (Airport express, Futian -> Bao'an -> Airport)
    stops: [
      [22.5360, 114.0850], // Hongling South
      [22.5420, 114.0750], // Futian
      [22.5370, 114.0650], // Shopping Park
      [22.5330, 114.0500], // Chegongmiao
      [22.5300, 114.0350], // Zhuzilin
      [22.5270, 114.0200], // Mangrove Bay South
      [22.5240, 114.0050], // Houhai S
      [22.5240, 113.9240], // Nanshan (confirmed GCJ-02)
      [22.5370, 113.8980], // Qianhai Bay (confirmed)
      [22.5550, 113.8800], // Bao'an (confirmed)
      [22.5750, 113.8560], // Bihai Bay (confirmed)
      [22.6240, 113.8140], // Airport (confirmed)
      [22.6510, 113.7980], // Airport North (confirmed)
      [22.6730, 113.8060], // Fuyong (confirmed)
      [22.6880, 113.8110], // Qiaotou (confirmed)
      [22.7020, 113.8180], // Tangwei (confirmed)
      [22.7169, 113.8170], // Ma'anshan (confirmed)
      [22.7310, 113.8240], // Shajing (confirmed)
      [22.7530, 113.8270], // Houting (confirmed)
      [22.7840, 113.8200], // Bitou (confirmed)
    ],
  },
  {
    name: "4",
    color: 0xee352e, // red (Longhua line, Futian Checkpoint -> Longhua)
    stops: [
      [22.5240, 114.0520], // Futian Checkpoint
      [22.5280, 114.0580], // Fumin
      [22.5320, 114.0650], // Convention & Exhibition
      [22.5340, 114.0710], // Civic Center
      [22.5360, 114.0780], // Children's Palace
      [22.5400, 114.0850], // Lianhua North
      [22.5450, 114.0900], // Shangmeilin
      [22.5520, 114.0950], // Minle
      [22.5700, 114.0800], // Baishilong
      [22.6100, 114.0300], // Shenzhen North
      [22.6200, 114.0100], // Hongshan
      [22.6250, 113.9950], // Shangtang
      [22.6280, 113.9800], // Longsheng
      [22.6300, 113.9650], // Longhua
      [22.6320, 113.9500], // Qinghu
    ],
  },
  {
    name: "13",
    color: 0x00843d, // deep green (Shenzhen Bay -> Guangming, tech spine)
    stops: [
      [22.4960, 113.9480], // Shenzhen Bay Port (confirmed GCJ-02)
      [22.5090, 113.9380], // Talent Park
      [22.5190, 113.9420], // Houhai E
      [22.5270, 113.9470], // Hi-Tech Central
      [22.5400, 113.9540], // Hi-Tech Park (confirmed)
      [22.5390, 113.9680], // Hi-Tech North
      [22.5360, 113.9800], // Shigu
      [22.5450, 113.9880], // Liuxiandong
      [22.5520, 113.9960], // Baiwang
      [22.5550, 114.0040], // Yingrenshi
      [22.5580, 114.0120], // Luozu/Shiyan
      [22.5600, 114.0200], // Shangwu
      [22.5660, 114.0280], // Changzhen
      [22.5720, 114.0360], // Fenghuang City
      [22.5780, 114.0420], // Guangming Street
      [22.5840, 114.0480], // Guangming
      [22.5900, 114.0540], // Science Park
      [22.5960, 114.0600], // Loucun
      [22.6020, 114.0660], // Honghuashan
      [22.6080, 114.0720], // Lisonglang
    ],
  },
];

// ---- Landmarks ------------------------------------------------------------
export const LANDMARKS = {
  pingAn: { lat: 22.5332, lng: 114.0556 }, // Ping An Finance Center (599m)
  chunSun: { lat: 22.5150, lng: 113.9420 }, // China Resources "Spring Shoot" (392m)
  kingKey: { lat: 22.5455, lng: 114.1160 }, // KK100 (442m)
  diwang: { lat: 22.5520, lng: 114.1185 }, // Diwang Mansion (384m)
  tencentBH: { lat: 22.5228, lng: 113.9353 }, // Tencent Binhai
  tencentQD: { lat: 22.5370, lng: 113.8670 }, // Tencent Penguin Island (企鹅岛, Dachan Bay)
  djiSky: { lat: 22.5775, lng: 113.9429 }, // DJI Sky City
  civicCenter: { lat: 22.5380, lng: 114.0580 }, // Civic Center
  windowWorld: { lat: 22.5350, lng: 113.9850 }, // Window of the World
  seg: { lat: 22.5405, lng: 114.0855 }, // SEG Plaza (Huaqiangbei)
  huaqiangbei: { lat: 22.5420, lng: 114.0830 }, // Huaqiangbei
  szBaySports: { lat: 22.5190, lng: 113.9420 }, // Shenzhen Bay Sports Center
  shenzhenNorth: { lat: 22.6100, lng: 114.0297 }, // Shenzhen North Station
  expoCenter: { lat: 22.5290, lng: 114.0680 }, // Shenzhen Convention & Exhibition Center (会展中心)
  szse: { lat: 22.5345, lng: 114.0570 }, // Shenzhen Stock Exchange (深圳证券交易所, OMA elevated cube)
  szBayOne: { lat: 22.5140, lng: 113.9510 }, // Shenzhen Bay One (深圳湾1号, ultra-luxury residential tower)
  lianHua: { lat: 22.5615, lng: 114.0680 }, // Lianhua Hill summit (莲花山公园, Deng Xiaoping statue)
  qianHaiStone: { lat: 22.5270, lng: 113.8900 }, // Qianhai Stone (前海石, landmark monument)
  octHarbour: { lat: 22.5210, lng: 113.9800 }, // OCT Harbour (欢乐海岸, waterfront complex)
};

// Bridges: pairs of anchor points (Shenzhen side -> sea/Hong Kong side)
export const BRIDGES = [
  {
    name: "Shenzhen Bay Bridge",
    deck: [
      [22.4960, 113.9480],
      [22.4880, 113.9600],
      [22.4800, 113.9750],
      [22.4720, 113.9900],
    ],
    towers: [
      [22.4900, 113.9580],
      [22.4780, 113.9800],
    ],
    type: "suspension",
  },
];

// ---- Helpers --------------------------------------------------------------

// Ray-casting point-in-polygon, coords as [lat, lng].
export function pointInPoly(lat, lng, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function inEllipse(lat, lng, c) {
  const dy = (lat - c.lat) / c.rLat;
  const dx = (lng - c.lng) / c.rLng;
  return dx * dx + dy * dy <= 1;
}
