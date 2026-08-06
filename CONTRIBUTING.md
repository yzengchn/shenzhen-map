# Contributing to the 深圳科技地图 (Shenzhen Tech Map)

The best way to grow the atlas is to add companies. Everything about a company lives in [`src/data.js`](src/data.js), so adding one is a small, self-contained pull request. There are two ways to open it.

## Project Origin

This project is a fork of the [NYC AI Atlas](https://github.com/Nutlope/nyc-ai-atlas) by [Nutlope](https://github.com/Nutlope). The original is a 3D interactive map of the New York City AI startup ecosystem; we reworked it into a Shenzhen tech map. Original author credit and thanks go to **Nutlope**.

## Option A: ask an AI coding agent

If you use an agent (Claude Code, Cursor, WorkBuddy, etc.), clone the repo and ask it something like:

> Add **DJI** (https://www.dji.com/, HQ at 大疆天空之城, Liuxiandong) to the atlas and open a pull request.

For best results, include:

- Company name and website.
- Shenzhen location for the map pin. A real office address or exact coordinates are best, but an approximate public area is fine if you do not want to share an exact address, for example "near Shenzhen Bay" or "Dachan Bay waterfront".
- Preferred official logo asset, ideally SVG or transparent PNG. If you do not have one, tell the agent it may fetch one from the company website.
- One factual line describing what the company does.
- Stage and office type, if known.

The agent has everything it needs: [`AGENTS.md`](AGENTS.md) documents the exact "Adding a startup" recipe, and the steps below are written to be followed deterministically. It will edit `src/data.js`, verify the build, and open the PR.

## Option B: do it yourself

### 1. Add the company to `STARTUPS` in `src/data.js`

```js
{
  id: "acme-ai",                       // kebab-case slug; also the logo filename
  name: "Acme AI",
  nameZh: "示例科技",
  lat: 22.5300,                        // right-click the office in AMap / Tencent Maps,
  lng: 113.9550,                      //   "What's here?", copy the GCJ-02 coordinates
  area: "nanshan-tech",               // all | nanshan-tech | houhai | qianhai | futian | liuxiandong | longgang | baoan
  stage: "早期",                        // "早期" | "后期" | "上市" (or null if unknown)
  sector: "AI应用",                     // reuse an existing sector string when you can
  office: "总部",                       // "总部" | "分支机构" (or null)
  website: "https://acme.ai/",
  source: "user"
}
```

Keep the array alphabetized by `name`. Coordinates must be in **GCJ-02** (consistent with AMap / Tencent Maps). If you copy coordinates from Google Maps or GPS, convert them to GCJ-02 first.

### 2. Add a one-line blurb to `COMPANY_INFO` in the same file

```js
"acme-ai": { blurb: "What the company does, in one factual line.", loc: "科苑路 · 南山" },
```

`loc` is a street plus district, never an exact suite. For approximate-only pins, keep this label approximate too, for example `"Near Shenzhen Bay"` or `"Dachan Bay waterfront"`.

### 3. Logo

Run `npm run logos` (needs network) to auto-fetch it from the company site, or drop an SVG at `public/logos/acme-ai.svg` yourself (filename = the `id`). Then confirm no text-fallback logo was generated:

```sh
rg -l "<text " public/logos
```

### 4. Update the startup count if it changed

The count appears in copy. If `STARTUPS.length` changed, update:

- `index.html`: the rail subtitle (`47家公司 · 7大产业片区`) and the search placeholder.
- `README.md`: the counts in the intro.

### 5. Verify and open the PR

```sh
npm install
npm run dev     # confirm the pin sits on the right block, label + logo render,
                #   search finds it, and the card shows the blurb
npm run build   # must pass
```

Then commit on a branch and open a pull request.

## Ground rules

- Only companies with a real, current Shenzhen office or a credible Shenzhen HQ/branch.
- Exact addresses are not required. You may submit an approximate public area for privacy, but not just a broad "Shenzhen" location or guessed coworking space.
- PRs should say whether the pin is exact or approximate. Approximate pins should not include an exact `address` field.
- Prefer an official logo asset. Generated initials are only a last resort.
- Blurbs are factual and about one line; no marketing superlatives.
- Never invent addresses, stages, or funding. If you don't know a field, use `null` (for `stage`/`office`) or leave enrichment fields out.
