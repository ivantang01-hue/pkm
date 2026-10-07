# pkm — Personal Pokédex data layer

Shared TypeScript types and a PokéAPI ingest script for a static HTML/JS Gen-1 Pokédex. Local JSON under `data/` is what the UI ships with.

**Display languages:** Traditional Chinese (`zh-Hant` / CHT) and Japanese (`ja`). English `displayName` is optional (debug/slugs only). `wikiUrl` points at [52poke](https://wiki.52poke.com/).

Twins-Rosa owns the UI (`index.html`, `css/`, `js/`) and Drive upload. This folder owns the model, ingest, and `data/**`.

## Setup

```bash
npm install && npm run ingest
```

Requires Node 18+ (global `fetch`).

## Layout

- `src/types.ts` — shared TypeScript model
- `scripts/ingest.mjs` — fetches Gen-1 (national dex 1–151) from [PokéAPI](https://pokeapi.co/) and writes local JSON
- `data/index.json` — slim search index (`displayNameZh`, `displayNameJa`, `wikiUrl`)
- `data/types.json` — type chart for types in use
- `data/abilities.json` / `data/moves.json` — unique abilities and moves
- `data/pokemon/{id}.json` — full Pokémon records

## Scripts

| Script | Description |
|--------|-------------|
| `npm run ingest` | Fetch & write all Gen-1 JSON |
| `npm run build:types` | Emit `.d.ts` to `dist/` |
