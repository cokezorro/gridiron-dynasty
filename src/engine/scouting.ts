import {
  ATTRIBUTE_KEYS,
  AttributeKey,
  Attributes,
  ManagerProfile,
  Player,
  Position,
  ScoutedAttributes,
  ScoutedRange,
} from './types';
import { SeededRNG, clamp, round1 } from './rng';

/**
 * Position-specific weights used to compute 1-10 overall ratings.
 */
export const POSITION_WEIGHTS: Record<Position, Partial<Record<AttributeKey, number>>> = {
  QB: {
    accuracy: 0.28,
    armStrength: 0.22,
    iq: 0.18,
    vision: 0.14,
    speed: 0.08,
    agility: 0.05,
    durability: 0.05,
  },
  RB: {
    vision: 0.22,
    speed: 0.20,
    agility: 0.18,
    power: 0.16,
    hands: 0.10,
    durability: 0.08,
    iq: 0.06,
  },
  WR: {
    routeRunning: 0.25,
    hands: 0.22,
    speed: 0.22,
    agility: 0.14,
    iq: 0.07,
    power: 0.05,
    durability: 0.05,
  },
  TE: {
    hands: 0.24,
    routeRunning: 0.22,
    power: 0.18,
    speed: 0.14,
    iq: 0.10,
    agility: 0.06,
    durability: 0.06,
  },
};

export const KEY_ATTRIBUTES_BY_POS: Record<Position, AttributeKey[]> = {
  QB: ['accuracy', 'armStrength', 'iq', 'vision', 'speed', 'durability'],
  RB: ['vision', 'speed', 'agility', 'power', 'hands', 'durability'],
  WR: ['routeRunning', 'hands', 'speed', 'agility', 'iq', 'durability'],
  TE: ['hands', 'routeRunning', 'power', 'speed', 'iq', 'durability'],
};

export function computeTrueOverall(position: Position, attrs: Attributes): number {
  const weights = POSITION_WEIGHTS[position];
  let total = 0;
  let weightSum = 0;
  for (const [k, w] of Object.entries(weights)) {
    const key = k as AttributeKey;
    total += attrs[key] * (w ?? 0);
    weightSum += w ?? 0;
  }
  return round1(clamp(weightSum > 0 ? total / weightSum : 5, 1.0, 10.0));
}

/**
 * Computes half-width of the visible 1-10 scouting uncertainty range.
 * Level 1 + 0 Scouting starts around +/- 2.1 (e.g., 5.2-9.4).
 * High manager level + Scouting skill shrinks it down to +/- 0.2.
 * Rookies carry extra fog of war until they log pro tape, mitigated by Front Office skill.
 */
export function getScoutingHalfWidth(
  manager: ManagerProfile,
  isRookie: boolean
): number {
  const levelReduction = (manager.level - 1) * 0.12;
  const skillReduction = manager.skills.scouting * 0.14;
  const baseHalfWidth = Math.max(0.2, 2.15 - levelReduction - skillReduction);
  const rookieFog = isRookie
    ? Math.max(0.1, 0.7 - manager.skills.frontOffice * 0.06)
    : 0;
  return round1(clamp(baseHalfWidth + rookieFog, 0.2, 2.8));
}

function buildScoutedRange(
  trueVal: number,
  halfWidth: number,
  seed: number,
  missChance: number
): ScoutedRange {
  const rng = new SeededRNG(seed);
  // Center is biased around trueVal within +/- 55% of halfWidth so trueVal usually falls inside [low, high].
  // At low manager levels, a small missChance lets occasional sleepers/busts fall just outside the window.
  const isMiss = rng.next() < missChance;
  const biasMultiplier = isMiss ? rng.range(0.75, 1.15) : rng.range(-0.55, 0.55);
  const sign = isMiss ? (rng.next() < 0.5 ? -1 : 1) : 1;
  const center = clamp(trueVal + sign * biasMultiplier * halfWidth, 1.0, 10.0);

  const low = round1(clamp(center - halfWidth, 1.0, 10.0));
  const high = round1(clamp(center + halfWidth, 1.0, 10.0));
  const midpoint = round1((low + high) / 2);

  return { low, high, midpoint, halfWidth };
}

export function getScoutedAttributes(
  player: Player,
  manager: ManagerProfile,
  season: number
): ScoutedAttributes {
  const halfWidth = getScoutingHalfWidth(manager, player.experience === 0);
  const missChance = Math.max(0, 0.08 - (manager.level - 1) * 0.012 - manager.skills.scouting * 0.01);
  const result = {} as ScoutedAttributes;

  ATTRIBUTE_KEYS.forEach((key, idx) => {
    const attrSeed = (player.scoutingSeed ^ ((idx + 1) * 2654435761) ^ (season * 1597334677)) >>> 0;
    result[key] = buildScoutedRange(player.trueAttributes[key], halfWidth, attrSeed, missChance);
  });

  return result;
}

export function getScoutedOverall(
  player: Player,
  manager: ManagerProfile,
  season: number
): ScoutedRange {
  const halfWidth = round1(getScoutingHalfWidth(manager, player.experience === 0) * 0.85);
  const missChance = Math.max(0, 0.06 - (manager.level - 1) * 0.01 - manager.skills.scouting * 0.008);
  const ovrSeed = (player.scoutingSeed ^ 0x9e3779b9 ^ (season * 2246822519)) >>> 0;
  return buildScoutedRange(player.trueOverall, halfWidth, ovrSeed, missChance);
}

/**
 * Formats a scouted range cleanly:
 * Wide bands (Lv 1-4): "5–9" or "5.2–8.8"
 * Tight bands (Lv 8+): "7.6–8.2"
 */
export function formatScoutedRange(range: ScoutedRange, compact = false): string {
  if (range.high - range.low < 0.25) {
    return range.midpoint.toFixed(1);
  }
  if (compact && range.halfWidth >= 1.1) {
    return `${Math.round(range.low)}–${Math.round(range.high)}`;
  }
  return `${range.low.toFixed(1)}–${range.high.toFixed(1)}`;
}
