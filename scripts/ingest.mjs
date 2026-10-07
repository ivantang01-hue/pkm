#!/usr/bin/env node
/**
 * Gen-1 PokéAPI → local JSON under data/
 * Display languages: zh-Hant (CHT) + ja (JP). wikiUrl → 52poke.
 * Polite: concurrency 5, brief delay between batches, 3x retries, in-memory cache.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA = join(ROOT, 'data');
const POKEMON_DIR = join(DATA, 'pokemon');
const BASE = 'https://pokeapi.co/api/v2/';
const GEN1_MAX = 151;
const CONCURRENCY = 5;
const BATCH_DELAY_MS = 200;
const MAX_RETRIES = 3;

/** @type {Map<string, unknown>} */
const cache = new Map();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function titleCaseSlug(slug) {
  return slug
    .split('-')
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join(' ');
}

function parseGeneration(genName) {
  const map = {
    'generation-i': 1,
    'generation-ii': 2,
    'generation-iii': 3,
    'generation-iv': 4,
    'generation-v': 5,
    'generation-vi': 6,
    'generation-vii': 7,
    'generation-viii': 8,
    'generation-ix': 9,
  };
  return map[genName] ?? 1;
}

function nameByLang(names, lang) {
  return names?.find((n) => n.language?.name?.toLowerCase() === lang.toLowerCase())?.name;
}

/** EN optional (debug/slugs) */
function englishName(names, fallback) {
  return nameByLang(names, 'en') ?? fallback;
}

/** Traditional Chinese — zh-Hant only (not zh-Hans) */
function chineseHantName(names, fallback) {
  return nameByLang(names, 'zh-Hant') ?? fallback;
}

/** Japanese — ja, then ja-Hrkt as last resort */
function japaneseName(names, fallback) {
  return nameByLang(names, 'ja') ?? nameByLang(names, 'ja-Hrkt') ?? fallback;
}

function effectByLang(entries, lang, short = true) {
  const key = short ? 'short_effect' : 'effect';
  return entries?.find((e) => e.language?.name?.toLowerCase() === lang.toLowerCase())?.[key] ?? '';
}

function wikiUrl(displayNameZh) {
  return `https://wiki.52poke.com/wiki/${encodeURIComponent(displayNameZh)}`;
}

async function fetchJson(pathOrUrl) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : BASE + pathOrUrl.replace(/^\//, '');
  if (cache.has(url)) return cache.get(url);

  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'pkm-ingest/1.0' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const data = await res.json();
      cache.set(url, data);
      return data;
    } catch (err) {
      lastErr = err;
      console.warn(`  retry ${attempt}/${MAX_RETRIES} ${url}: ${err.message}`);
      await sleep(300 * attempt);
    }
  }
  throw lastErr;
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

function mapStats(stats) {
  /** @type {Record<string, number>} */
  const by = {};
  for (const s of stats) by[s.stat.name] = s.base_stat;
  return {
    hp: by['hp'] ?? 0,
    attack: by['attack'] ?? 0,
    defense: by['defense'] ?? 0,
    specialAttack: by['special-attack'] ?? 0,
    specialDefense: by['special-defense'] ?? 0,
    speed: by['speed'] ?? 0,
  };
}

function mapLearnMethod(name) {
  if (name === 'level-up' || name === 'machine' || name === 'egg' || name === 'tutor') {
    return name;
  }
  return 'other';
}

function pickVersionDetails(versionGroupDetails) {
  const preferred = versionGroupDetails.filter(
    (v) => v.version_group?.name === 'red-blue' || v.version_group?.name === 'yellow',
  );
  return preferred.length > 0 ? preferred : versionGroupDetails;
}

function chooseBestLearn(existing, candidate) {
  const rank = (m) => {
    if (m.learnMethod === 'level-up') return 0;
    if (m.learnMethod === 'machine') return 1;
    if (m.learnMethod === 'tutor') return 2;
    if (m.learnMethod === 'egg') return 3;
    return 4;
  };
  const re = rank(existing);
  const rc = rank(candidate);
  if (rc < re) return candidate;
  if (rc > re) return existing;
  const le = existing.levelLearnedAt ?? Number.MAX_SAFE_INTEGER;
  const lc = candidate.levelLearnedAt ?? Number.MAX_SAFE_INTEGER;
  return lc < le ? candidate : existing;
}

async function resolveAbility(abilityResource, isHidden, slot) {
  const detail = await fetchJson(abilityResource.url);
  const id = detail.id;
  const name = detail.name;
  const fallback = titleCaseSlug(name);
  const displayName = englishName(detail.names, fallback);
  const displayNameZh = chineseHantName(detail.names, displayName);
  const displayNameJa = japaneseName(detail.names, undefined);
  const shortEffect = effectByLang(detail.effect_entries, 'en', true);
  const effect = effectByLang(detail.effect_entries, 'en', false);
  // PokéAPI rarely has zh/ja effect_entries; leave optional empty if missing
  const shortEffectZh = effectByLang(detail.effect_entries, 'zh-Hant', true) || undefined;
  const shortEffectJa =
    effectByLang(detail.effect_entries, 'ja', true) ||
    effectByLang(detail.effect_entries, 'ja-Hrkt', true) ||
    undefined;
  const effectZh = effectByLang(detail.effect_entries, 'zh-Hant', false) || undefined;
  const effectJa =
    effectByLang(detail.effect_entries, 'ja', false) ||
    effectByLang(detail.effect_entries, 'ja-Hrkt', false) ||
    undefined;

  return {
    ref: {
      id,
      name,
      displayName,
      displayNameZh,
      ...(displayNameJa ? { displayNameJa } : {}),
      isHidden,
      slot,
      shortEffect,
      ...(shortEffectZh ? { shortEffectZh } : {}),
      ...(shortEffectJa ? { shortEffectJa } : {}),
    },
    full: {
      id,
      name,
      displayName,
      displayNameZh,
      ...(displayNameJa ? { displayNameJa } : {}),
      shortEffect,
      ...(shortEffectZh ? { shortEffectZh } : {}),
      ...(shortEffectJa ? { shortEffectJa } : {}),
      effect,
      ...(effectZh ? { effectZh } : {}),
      ...(effectJa ? { effectJa } : {}),
    },
  };
}

async function resolveMove(moveResource, versionGroupDetails) {
  const detail = await fetchJson(moveResource.url);
  const id = detail.id;
  const name = detail.name;
  const fallback = titleCaseSlug(name);
  const displayName = englishName(detail.names, fallback);
  const displayNameZh = chineseHantName(detail.names, displayName);
  const displayNameJa = japaneseName(detail.names, undefined);
  const type = detail.type?.name;
  const damageClass = detail.damage_class?.name ?? 'status';
  const power = detail.power ?? null;
  const accuracy = detail.accuracy ?? null;
  const pp = detail.pp ?? 0;
  const priority = detail.priority ?? 0;
  const shortEffect = effectByLang(detail.effect_entries, 'en', true);
  const shortEffectZh = effectByLang(detail.effect_entries, 'zh-Hant', true) || undefined;
  const shortEffectJa =
    effectByLang(detail.effect_entries, 'ja', true) ||
    effectByLang(detail.effect_entries, 'ja-Hrkt', true) ||
    undefined;

  const details = pickVersionDetails(versionGroupDetails);
  let best = details[0];
  const levelUps = details.filter((d) => d.move_learn_method?.name === 'level-up');
  if (levelUps.length > 0) {
    best = levelUps.reduce((a, b) =>
      (a.level_learned_at ?? 999) <= (b.level_learned_at ?? 999) ? a : b,
    );
  } else {
    for (const d of details) {
      if (d.move_learn_method?.name === 'level-up') {
        best = d;
        break;
      }
    }
  }

  const learnMethod = mapLearnMethod(best?.move_learn_method?.name ?? 'other');
  const levelLearnedAt =
    learnMethod === 'level-up' ? (best?.level_learned_at ?? null) : null;

  return {
    ref: {
      id,
      name,
      displayName,
      displayNameZh,
      ...(displayNameJa ? { displayNameJa } : {}),
      type,
      damageClass,
      power,
      accuracy,
      pp,
      learnMethod,
      levelLearnedAt,
    },
    full: {
      id,
      name,
      displayName,
      displayNameZh,
      ...(displayNameJa ? { displayNameJa } : {}),
      type,
      damageClass,
      power,
      accuracy,
      pp,
      priority,
      shortEffect,
      ...(shortEffectZh ? { shortEffectZh } : {}),
      ...(shortEffectJa ? { shortEffectJa } : {}),
    },
  };
}

async function buildPokemon(id) {
  const pokemon = await fetchJson(`pokemon/${id}`);
  const species = await fetchJson(pokemon.species.url);

  const displayName = englishName(species.names, titleCaseSlug(pokemon.name));
  const displayNameZh = chineseHantName(species.names, displayName);
  const displayNameJa = japaneseName(species.names, undefined);
  const generation = parseGeneration(species.generation?.name) || 1;

  const types = [...pokemon.types]
    .sort((a, b) => a.slot - b.slot)
    .map((t) => t.type.name);

  const baseStats = mapStats(pokemon.stats);

  const abilities = [];
  for (const a of [...pokemon.abilities].sort((x, y) => x.slot - y.slot)) {
    abilities.push(await resolveAbility(a.ability, Boolean(a.is_hidden), a.slot));
  }

  /** @type {Map<number, { ref: object, full: object }>} */
  const moveMap = new Map();
  for (const m of pokemon.moves) {
    const resolved = await resolveMove(m.move, m.version_group_details);
    const existing = moveMap.get(resolved.ref.id);
    if (!existing) {
      moveMap.set(resolved.ref.id, resolved);
    } else {
      const bestRef = chooseBestLearn(existing.ref, resolved.ref);
      moveMap.set(resolved.ref.id, { ref: bestRef, full: existing.full });
    }
  }
  const moves = [...moveMap.values()];

  const official = pokemon.sprites?.other?.['official-artwork'];
  const spriteUrl = official?.front_default || pokemon.sprites?.front_default || '';
  const shinySpriteUrl =
    official?.front_shiny || pokemon.sprites?.front_shiny || undefined;

  const record = {
    id: pokemon.id,
    name: pokemon.name,
    displayName,
    displayNameZh,
    ...(displayNameJa ? { displayNameJa } : {}),
    species: species.name,
    generation,
    types,
    baseStats,
    abilities: abilities.map((a) => a.ref),
    moves: moves.map((m) => m.ref).sort((a, b) => a.id - b.id),
    height: pokemon.height,
    weight: pokemon.weight,
    spriteUrl,
    ...(shinySpriteUrl ? { shinySpriteUrl } : {}),
    wikiUrl: wikiUrl(displayNameZh),
  };

  return {
    record,
    abilityFulls: abilities.map((a) => a.full),
    moveFulls: moves.map((m) => m.full),
  };
}

async function buildTypeInfo(typeName) {
  const detail = await fetchJson(`type/${typeName}`);
  const fallback = titleCaseSlug(typeName);
  const displayName = englishName(detail.names, fallback);
  const displayNameZh = chineseHantName(detail.names, displayName);
  const displayNameJa = japaneseName(detail.names, undefined);
  const dr = detail.damage_relations;
  const names = (arr) => arr.map((x) => x.name);
  return {
    name: typeName,
    displayName,
    displayNameZh,
    ...(displayNameJa ? { displayNameJa } : {}),
    damageRelations: {
      doubleDamageTo: names(dr.double_damage_to),
      halfDamageTo: names(dr.half_damage_to),
      noDamageTo: names(dr.no_damage_to),
      doubleDamageFrom: names(dr.double_damage_from),
      halfDamageFrom: names(dr.half_damage_from),
      noDamageFrom: names(dr.no_damage_from),
    },
  };
}

async function writeJson(path, data) {
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

async function main() {
  console.log(`Ingesting Gen-1 Pokémon 1–${GEN1_MAX} (zh-Hant + ja, 52poke wiki)…`);
  await mkdir(POKEMON_DIR, { recursive: true });

  const ids = Array.from({ length: GEN1_MAX }, (_, i) => i + 1);

  /** @type {Map<number, object & { pokemonIds: number[] }>} */
  const abilitiesById = new Map();
  /** @type {Map<number, object & { pokemonIds: number[] }>} */
  const movesById = new Map();
  /** @type {Set<string>} */
  const typeNames = new Set();
  /** @type {object[]} */
  const index = [];

  for (let start = 0; start < ids.length; start += CONCURRENCY) {
    const batch = ids.slice(start, start + CONCURRENCY);
    console.log(`  batch ${batch[0]}–${batch[batch.length - 1]}…`);

    const results = await mapPool(batch, CONCURRENCY, async (id) => {
      try {
        return await buildPokemon(id);
      } catch (err) {
        console.error(`Failed pokemon ${id}:`, err.message);
        throw err;
      }
    });

    for (const { record, abilityFulls, moveFulls } of results) {
      await writeJson(join(POKEMON_DIR, `${record.id}.json`), record);

      const bst =
        record.baseStats.hp +
        record.baseStats.attack +
        record.baseStats.defense +
        record.baseStats.specialAttack +
        record.baseStats.specialDefense +
        record.baseStats.speed;

      index.push({
        id: record.id,
        name: record.name,
        displayName: record.displayName,
        displayNameZh: record.displayNameZh,
        ...(record.displayNameJa ? { displayNameJa: record.displayNameJa } : {}),
        types: record.types,
        spriteUrl: record.spriteUrl,
        baseStatTotal: bst,
        wikiUrl: record.wikiUrl,
      });

      for (const t of record.types) typeNames.add(t);

      for (const a of abilityFulls) {
        const existing = abilitiesById.get(a.id);
        if (existing) {
          if (!existing.pokemonIds.includes(record.id)) existing.pokemonIds.push(record.id);
        } else {
          abilitiesById.set(a.id, { ...a, pokemonIds: [record.id] });
        }
      }

      for (const m of moveFulls) {
        const existing = movesById.get(m.id);
        if (existing) {
          if (!existing.pokemonIds.includes(record.id)) existing.pokemonIds.push(record.id);
        } else {
          movesById.set(m.id, { ...m, pokemonIds: [record.id] });
        }
      }
    }

    if (start + CONCURRENCY < ids.length) await sleep(BATCH_DELAY_MS);
  }

  index.sort((a, b) => a.id - b.id);
  await writeJson(join(DATA, 'index.json'), index);
  console.log(`Wrote index.json (${index.length} entries)`);

  const typeList = [...typeNames].sort();
  const types = [];
  for (let i = 0; i < typeList.length; i += CONCURRENCY) {
    const batch = typeList.slice(i, i + CONCURRENCY);
    const built = await mapPool(batch, CONCURRENCY, (n) => buildTypeInfo(n));
    types.push(...built);
    if (i + CONCURRENCY < typeList.length) await sleep(BATCH_DELAY_MS);
  }
  types.sort((a, b) => a.name.localeCompare(b.name));
  await writeJson(join(DATA, 'types.json'), types);
  console.log(`Wrote types.json (${types.length} types)`);

  const abilities = [...abilitiesById.values()]
    .map((a) => ({ ...a, pokemonIds: [...a.pokemonIds].sort((x, y) => x - y) }))
    .sort((a, b) => a.id - b.id);
  await writeJson(join(DATA, 'abilities.json'), abilities);
  console.log(`Wrote abilities.json (${abilities.length} abilities)`);

  const moves = [...movesById.values()]
    .map((m) => ({ ...m, pokemonIds: [...m.pokemonIds].sort((x, y) => x - y) }))
    .sort((a, b) => a.id - b.id);
  await writeJson(join(DATA, 'moves.json'), moves);
  console.log(`Wrote moves.json (${moves.length} moves)`);

  console.log(`Done. Cache: ${cache.size}. Pokemon: ${index.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
