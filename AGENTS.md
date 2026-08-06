# Agent Guide

This repo is a Vite + Three.js single-page app for the 深圳科技地图 (Shenzhen Tech Map). Use this file as the operational guide for future agent work.

## Project Origin

This project is a fork of the [NYC AI Atlas](https://github.com/Nutlope/nyc-ai-atlas) by [Nutlope](https://github.com/Nutlope). The original is a 3D interactive map of the New York City AI startup ecosystem. We kept the Three.js engine, the Levels.fyi-style interaction model, and the visual shell, but replaced all geography, company data, and landmarks with Shenzhen, and translated the UI to Chinese.

Original author credit: **Nutlope** — thank you for the upstream project.

## Core Facts

- App root: `/Users/zy/Homedev/DevGithub/shenzhen-map`
- Main branch: `main`
- Remote: `git@github.com:yzengchn/shenzhen-map.git`
- Runtime: Vite, Three.js, vanilla JavaScript modules, plain CSS.
- Dev command: `npm run dev`
- Build command: `npm run build`
- Current dataset: 47 startups in `STARTUPS` from `src/data.js`.
- Coordinate system: GCJ-02 (Mars coordinates), consistent with AMap / Tencent Maps. Baidu Maps uses BD-09 (double-offset) — convert before comparing.

## File Map

- `index.html`: static shell, SEO/social metadata, the glass HUD skeleton (left rail, search trigger, mini map), and dialogs.
- `src/main.js`: Three.js scene setup, camera flights, map meshes, buildings, landmarks, vehicles, labels, search, selection, UI state, and animation loop.
- `src/geo.js`: hand-authored Shenzhen geography — coastline (Bao'an → Nanshan/Shekou → Futian → Luohou), parks, building districts, metro lines (1/2/4/11/13), landmarks, and bridges. All coordinates `[lat, lng]` in GCJ-02.
- `src/data.js`: data sources, area chapters, startup records, company blurbs, and context points.
- `src/styles.css`: pixel-glass HUD styling: rail, labels, search modal, company card, and the touch bottom-sheet layout (no mobile gate; phones get a working map with a lighter GPU budget).
- `tokens.css`: shared CSS variables (Geist single-font setup, 4-step type scale, glass tokens).
- `public/fonts`: self-hosted Geist variable woff2 + OFL license.
- `public/logos`: startup SVG logos, keyed by startup `id`.
- `public/company-addresses.*`: generated address reports.
- `scripts/fetch-logos.mjs`: regenerates logo SVGs from Simple Icons, company websites, favicon discovery, and direct asset overrides.
- `scripts/generate-address-report.mjs`: regenerates address reports by reverse geocoding coordinates.
- `scripts/verify-coords.mjs`: validates that startup pins fall within Shenzhen land polygons.
- `scripts/minimap-paths.mjs`: regenerates mini-map geometry paths.

> Note: internal variable names in `src/geo.js` still echo the NYC origin (e.g. `MANHATTAN`, `BROOKLYN_QUEENS`, `CENTRAL_PARK`), but every coordinate now describes Shenzhen. Treat the variable names as historical, not geographic.

## Working Rules

- Prefer small, scoped edits. This app is visually dense, so unrelated refactors create risk.
- Keep data count copy synchronized. If `STARTUPS.length` changes, update `index.html` (rail subtitle + search placeholder), area descriptions if needed, README references, and generated reports if requested.
- Do not claim addresses are verified company offices unless you have explicitly verified them from authoritative current sources. Most report addresses are nearest addresses from reverse geocoded pins.
- Do not replace real company logos with generated initials unless no real source is available. After logo work, run `rg -l "<text " public/logos` to find generated fallback SVGs.
- Preserve the app's first-screen product experience. It should open directly into the interactive 3D atlas, not a marketing landing page.
- Keep UI labels compact and scannable. Avoid explanatory in-app text about how the UI works.
- `dist/`, `node_modules/`, `.pnpm-store/`, and `.vercel/` are ignored outputs/local state.

## Common Commands

```sh
pnpm install
npm run dev
npm run build
npm run preview
npm run logos
npm run addresses
```

Notes:

- `npm run dev` runs `vite --host 127.0.0.1` on port `5190` (the port is fixed and any stale process is killed first, so only one instance runs).
- `npm run build` should pass before pushing. Vite may warn that the Three.js bundle is over 500 kB; that warning is currently expected.
- `npm run logos` needs network access and writes `public/logos/*.svg`.
- `npm run addresses` needs network access, calls OpenStreetMap/Nominatim, and intentionally throttles requests.

## Visual QA

When changing scene, camera, layout, assets, or data:

1. Build with `npm run build`.
2. Start Vite with `npm run dev`.
3. Open the local URL in a browser.
4. Verify the canvas is nonblank and the scene is framed correctly.
5. Click these area buttons: 全局概览, 南山科技园, 后海, 前海, 福田, 留仙洞, 坂田, 宝安.
6. Search for `腾讯`, `华为`, `大疆`, and `中兴`.
7. Confirm there are no broken images for `.marker-label__logo`.
8. Check for console errors.

## Data Model

Startup records in `src/data.js` use this shape:

```js
{
  id: "tencent",
  name: "Tencent",
  nameZh: "腾讯",
  lat: 22.5228,                       // GCJ-02
  lng: 113.9353,
  area: "houhai",                     // all | nanshan-tech | houhai | qianhai | futian | liuxiandong | longgang | baoan
  stage: "上市",                       // "早期" | "后期" | "上市"
  sector: "互联网平台",
  office: "总部",                     // "总部" | "分支机构"
  website: "https://www.tencent.com/",
  source: "company"
}
```

The `id` is important because it maps to `public/logos/{id}.svg`, search/detail rendering, mini-map points, and selection state.

Area records include camera focus settings:

```js
focus: { lat, lng, distance, height, rotation }
```

Adjust these carefully and test the camera flight on desktop-sized viewports.

## Adding a Startup (deterministic recipe)

When asked to add a company, do exactly this and open a PR. Everything lives in `src/data.js`.

Before editing, make sure you have enough contributor-supplied information. Ask for any missing required fields instead of guessing:

- Company name (English and/or Chinese).
- Website.
- Shenzhen location for the map pin. Prefer a real office address or exact latitude/longitude, but accept an approximate public area if the contributor does not want to disclose an exact address (for example: "near Shenzhen Bay", "Hi-Tech Park around Keyuan Road", or "Dachan Bay waterfront").
- Preferred logo SVG/PNG, or permission to fetch a logo from the company website.
- One factual blurb about what the company does.
- Stage (`"早期"`, `"后期"`, `"上市"`) and office type (`"总部"` or `"分支机构"`), if known. Use `null` if the contributor does not know.

Do not add a company from only a city-level location, a guessed coworking space, or a remote-work claim. The pin may be approximate for privacy, but it must be anchored to a plausible Shenzhen neighborhood, cross street, landmark, or map area supplied by the contributor.

1. Derive `id`: kebab-case the name (e.g. "Acme AI" -> `acme-ai`). It is also the logo filename. Ensure it is unique in `STARTUPS`.
2. Validate the office location before adding it:
   - If the contributor gives coordinates, confirm they land in Shenzhen and are consistent with the supplied address or neighborhood.
   - If the contributor gives an address, geocode it with AMap, Tencent Maps, Google Maps, or another source and convert to GCJ-02 if needed, then use the returned `lat`/`lng`.
   - If the contributor gives only an approximate area, choose a representative coordinate in that area and make the approximate nature explicit in the PR. Do not add an `address` field for approximate-only submissions. For example, "near Shenzhen Bay" can use a coordinate near Shenzhen Bay Park, with `area: "houhai"` and a `COMPANY_INFO.loc` like `"Near Shenzhen Bay"` instead of a street address.
   - Prefer an address or office page supplied by the contributor. If verifying from public sources, use authoritative current sources such as the company website, careers page, contact page, press release, or a reputable company profile.
   - Do not claim the address is a verified company office unless you checked an authoritative current source. If it is contributor-supplied but not independently verified, set `source: "user"` and keep the address as supplied.
   - Do not guess coordinates.
3. Append to `STARTUPS`, keeping the array alphabetized by `name`:
   ```js
   { id: "acme-ai", name: "Acme AI", nameZh: "示例科技", lat: 22.5300, lng: 113.9550, area: "nanshan-tech", stage: "早期", sector: "AI应用", office: "总部", website: "https://acme.ai/", source: "user" },
   ```
   - `area` is one of: `all`, `nanshan-tech`, `houhai`, `qianhai`, `futian`, `liuxiandong`, `longgang`, `baoan`.
   - `stage` is `"早期" | "后期" | "上市"` or `null`.
   - `office` is `"总部" | "分支机构"` or `null`.
   - `sector`: reuse an existing sector string from the file when possible.
   - Never invent `stage`, `office`, or an exact `address`; use `null`/omit if unknown. Omit `address` when the contributor only provided an approximate area.
4. Add a matching one-line entry to `COMPANY_INFO`:
   ```js
   "acme-ai": { blurb: "One factual line about the company.", loc: "科苑路 · 南山" },
   ```
   For approximate-only pins, keep `loc` approximate too, e.g. `"Near Shenzhen Bay"` or `"Dachan Bay waterfront"`.
5. Logo:
   - First ask the contributor for a preferred official logo asset, ideally SVG or transparent PNG.
   - If they do not provide one, run `npm run logos` (network) or add `public/logos/acme-ai.svg` from an official/company-controlled source.
   - Do not use a generated initials fallback for a contributed startup unless no official logo can be found and the PR notes that limitation.
   - Run `rg -l "<text " public/logos`; the new id should not appear there.
6. If `STARTUPS.length` changed, update the count copy in `index.html` (rail subtitle + search placeholder) and `README.md`.
7. `npm run build` must pass. Then branch, commit, and open a PR with `gh`.

The PR description should include the location source, whether the pin is exact or approximate, the logo source, validation performed, and build result.

## Logo Pipeline

`scripts/fetch-logos.mjs` writes a logo for every startup id.

The source order is:

1. Simple Icons candidates.
2. Direct logo assets for edge cases.
3. Company website favicon/icon/logo discovery.
4. Clearbit logo fallback.
5. Generated initials fallback.

After running it:

```sh
rg -l "<text " public/logos
find public/logos -maxdepth 1 -name "*.svg" | wc -l
```

The first command should ideally print nothing. The second may include stale unreferenced logos if startup ids were removed; only `src/data.js` controls what the app renders.

## Address Pipeline

`scripts/generate-address-report.mjs` writes:

- `public/company-addresses.csv`
- `public/company-addresses.md`

It uses explicit `startup.address` when present, otherwise reverse geocodes the latitude/longitude. Reverse geocoding confirms the nearest mapped address to the pin, not current office occupancy.

## Git / Push Flow

Before pushing:

```sh
git status --short --branch
npm run build
git add README.md AGENTS.md <other changed files>
git commit -m "Add project documentation"
git push origin main
```

Never revert user changes to unrelated files. If the worktree is dirty before you start, inspect changes before editing overlapping files.
