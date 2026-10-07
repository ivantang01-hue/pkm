export type PokemonType =
  | 'normal' | 'fire' | 'water' | 'electric' | 'grass' | 'ice'
  | 'fighting' | 'poison' | 'ground' | 'flying' | 'psychic' | 'bug'
  | 'rock' | 'ghost' | 'dragon' | 'dark' | 'steel' | 'fairy';

export interface BaseStats {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
}

export interface AbilityRef {
  id: number;
  name: string;
  /** Optional EN for debug/slugs — UI uses Zh/Ja */
  displayName?: string;
  displayNameZh: string;
  displayNameJa?: string;
  isHidden: boolean;
  slot: number;
  shortEffect: string;
  shortEffectZh?: string;
  shortEffectJa?: string;
}

export interface MoveRef {
  id: number;
  name: string;
  /** Optional EN for debug/slugs — UI uses Zh/Ja */
  displayName?: string;
  displayNameZh: string;
  displayNameJa?: string;
  type: PokemonType;
  damageClass: 'physical' | 'special' | 'status';
  power: number | null;
  accuracy: number | null;
  pp: number;
  learnMethod: 'level-up' | 'machine' | 'egg' | 'tutor' | 'other';
  levelLearnedAt: number | null;
}

export interface Pokemon {
  id: number;
  name: string;
  /** Optional EN for debug/slugs — UI uses Zh/Ja */
  displayName?: string;
  displayNameZh: string;
  displayNameJa?: string;
  species: string;
  generation: number;
  types: PokemonType[];
  baseStats: BaseStats;
  abilities: AbilityRef[];
  moves: MoveRef[];
  height: number;
  weight: number;
  spriteUrl: string;
  shinySpriteUrl?: string;
  wikiUrl: string;
}

export interface PokemonIndexEntry {
  id: number;
  name: string;
  /** Optional EN for debug/slugs */
  displayName?: string;
  displayNameZh: string;
  displayNameJa?: string;
  types: PokemonType[];
  spriteUrl: string;
  baseStatTotal: number;
  wikiUrl: string;
}

export interface TypeInfo {
  name: PokemonType;
  /** Optional EN for debug/slugs */
  displayName?: string;
  displayNameZh: string;
  displayNameJa?: string;
  damageRelations: {
    doubleDamageTo: PokemonType[];
    halfDamageTo: PokemonType[];
    noDamageTo: PokemonType[];
    doubleDamageFrom: PokemonType[];
    halfDamageFrom: PokemonType[];
    noDamageFrom: PokemonType[];
  };
}

export interface Ability {
  id: number;
  name: string;
  /** Optional EN for debug/slugs */
  displayName?: string;
  displayNameZh: string;
  displayNameJa?: string;
  shortEffect: string;
  shortEffectZh?: string;
  shortEffectJa?: string;
  effect: string;
  effectZh?: string;
  effectJa?: string;
  pokemonIds: number[];
}

export interface Move {
  id: number;
  name: string;
  /** Optional EN for debug/slugs */
  displayName?: string;
  displayNameZh: string;
  displayNameJa?: string;
  type: PokemonType;
  damageClass: 'physical' | 'special' | 'status';
  power: number | null;
  accuracy: number | null;
  pp: number;
  priority: number;
  shortEffect: string;
  shortEffectZh?: string;
  shortEffectJa?: string;
  pokemonIds: number[];
}
