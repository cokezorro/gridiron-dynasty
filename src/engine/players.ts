import {
  Attributes,
  Player,
  PlayerSeasonSummary,
  Position,
  ProTeam,
  VolatilityProfile,
} from './types';
import { SeededRNG, clamp, round1 } from './rng';
import { computeTrueOverall } from './scouting';
import { createDefaultIntel, seedInitialPointTrend } from './news';

const FIRST_NAMES = [
  'Marcus', 'Jalen', 'Trey', 'Devon', 'Caleb', 'Malik', 'Braxton', 'Kyler',
  'Darius', 'Trevor', 'Aiden', 'Cole', 'Lamar', 'Garrett', 'Tyreek', 'JaMarr',
  'Micah', 'Bryce', 'Nolan', 'Dante', 'Xavier', 'Kendall', 'Jordan', 'Tanner',
  'Rashad', 'Roman', 'Cade', 'Zeke', 'Gavin', 'Bo', 'Eli', 'Desmond',
  'Cam', 'DeAndre', 'Keenan', 'Miles', 'Chase', 'Cooper', 'Dalton', 'Drake',
  'Evan', 'Gabe', 'Hayden', 'Isaiah', 'Jaxon', 'Kobe', 'Liam', 'Mason',
  'Nico', 'Omar', 'Parker', 'Quentin', 'Rico', 'Sam', 'Terrance', 'Vance',
  'Wyatt', 'Zay', 'Ashton', 'Breece', 'Christian', 'Derrick', 'Emeka', 'Foster',
];

const LAST_NAMES = [
  'Vance', 'Holloway', 'Mercer', 'Callahan', 'Booker', 'Thornton', 'Prescott', 'Fields',
  'Whitaker', 'Hargrove', 'Sterling', 'McAllister', 'Cross', 'Kessler', 'Simmons', 'Benson',
  'Rutherford', 'Sutton', 'Galloway', 'Bridges', 'Kincaid', 'Montoya', 'Delgado', 'Sloane',
  'Hendricks', 'Barton', 'Redmond', 'Pryor', 'Tate', 'Locke', 'Maddox', 'Fletcher',
  'Bauer', 'Hollis', 'Graves', 'Vaughn', 'Tanner', 'Gaines', 'Morrow', 'Ramsey',
  'Caldwell', 'Davenport', 'Ellison', 'Fairchild', 'Goodwin', 'Haley', 'Irving', 'Jennings',
  'Keller', 'Langston', 'Malone', 'Norris', 'Okafor', 'Patton', 'Quinn', 'Rivers',
  'Sanders', 'Trujillo', 'Underwood', 'Vega', 'Walton', 'Yates', 'Zimmer', 'Alvarez',
];

export function emptySeasonSummary(season: number, age: number, proTeamId: string): PlayerSeasonSummary {
  return {
    season,
    age,
    proTeamId,
    gamesPlayed: 0,
    passYards: 0,
    passTDs: 0,
    interceptions: 0,
    rushAttempts: 0,
    rushYards: 0,
    rushTDs: 0,
    targets: 0,
    receptions: 0,
    recYards: 0,
    recTDs: 0,
    fumbles: 0,
    fantasyPoints: 0,
    positionRank: 0,
  };
}

function generateAttributesForPosition(
  pos: Position,
  tierMean: number,
  rng: SeededRNG
): Attributes {
  const g = (offset: number, spread = 1.25) =>
    round1(clamp(rng.gaussian(tierMean + offset, spread), 1.5, 9.9));

  switch (pos) {
    case 'QB':
      return {
        speed: g(-0.8, 1.8),
        power: g(-1.4, 1.3),
        agility: g(-0.7, 1.6),
        hands: g(-2.5, 1.0),
        routeRunning: g(-3.0, 1.0),
        vision: g(0.3, 1.1),
        armStrength: g(0.4, 1.2),
        accuracy: g(0.4, 1.15),
        iq: g(0.5, 1.1),
        durability: g(0.2, 1.3),
      };
    case 'RB':
      return {
        speed: g(0.4, 1.25),
        power: g(0.2, 1.4),
        agility: g(0.4, 1.25),
        hands: g(-0.6, 1.6),
        routeRunning: g(-1.0, 1.4),
        vision: g(0.3, 1.15),
        armStrength: g(-3.2, 0.9),
        accuracy: g(-3.2, 0.9),
        iq: g(-0.2, 1.2),
        durability: g(-0.3, 1.45),
      };
    case 'WR':
      return {
        speed: g(0.5, 1.3),
        power: g(-1.0, 1.4),
        agility: g(0.4, 1.2),
        hands: g(0.4, 1.2),
        routeRunning: g(0.3, 1.3),
        vision: g(-0.3, 1.1),
        armStrength: g(-3.0, 0.9),
        accuracy: g(-3.0, 0.9),
        iq: g(0.0, 1.2),
        durability: g(0.1, 1.3),
      };
    case 'TE':
      return {
        speed: g(-0.4, 1.35),
        power: g(0.5, 1.2),
        agility: g(-0.5, 1.25),
        hands: g(0.3, 1.2),
        routeRunning: g(0.1, 1.35),
        vision: g(-0.3, 1.1),
        armStrength: g(-3.2, 0.9),
        accuracy: g(-3.2, 0.9),
        iq: g(0.2, 1.15),
        durability: g(0.2, 1.3),
      };
  }
}

function pickVolatility(rng: SeededRNG): VolatilityProfile {
  const r = rng.next();
  if (r < 0.28) return 'STEADY';
  if (r < 0.72) return 'BALANCED';
  return 'BOOM_BUST';
}

function createUniqueName(rng: SeededRNG, usedNames: Set<string>): string {
  for (let attempt = 0; attempt < 25; attempt++) {
    const name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
  const fallback = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)} Jr.`;
  usedNames.add(fallback);
  return fallback;
}

let nextPlayerCounter = 1;

export function generateInitialPlayerPool(
  proTeams: Record<string, ProTeam>,
  season: number,
  rng: SeededRNG
): Record<string, Player> {
  const players: Record<string, Player> = {};
  const usedNames = new Set<string>();
  const teamIds = Object.keys(proTeams);

  // Per pro team: 2 QBs, 3 RBs, 4 WRs, 2 TEs = 11 fantasy-relevant players x 32 teams = 352 players
  const slotSpecs: { pos: Position; tierBase: number; starterBias: boolean }[] = [
    { pos: 'QB', tierBase: 7.1, starterBias: true },
    { pos: 'QB', tierBase: 5.0, starterBias: false },
    { pos: 'RB', tierBase: 7.2, starterBias: true },
    { pos: 'RB', tierBase: 5.9, starterBias: false },
    { pos: 'RB', tierBase: 4.8, starterBias: false },
    { pos: 'WR', tierBase: 7.4, starterBias: true },
    { pos: 'WR', tierBase: 6.4, starterBias: false },
    { pos: 'WR', tierBase: 5.5, starterBias: false },
    { pos: 'WR', tierBase: 4.7, starterBias: false },
    { pos: 'TE', tierBase: 6.8, starterBias: true },
    { pos: 'TE', tierBase: 5.0, starterBias: false },
  ];

  for (const teamId of teamIds) {
    for (const spec of slotSpecs) {
      const id = `p_${season}_${nextPlayerCounter++}_${rng.int(1000, 9999)}`;
      const isRookie = rng.next() < 0.14;
      const age = isRookie
        ? rng.int(21, 22)
        : spec.pos === 'QB'
        ? rng.int(23, 34)
        : spec.pos === 'RB'
        ? rng.int(22, 29)
        : rng.int(22, 31);
      const experience = Math.max(0, age - 21 - rng.int(0, 1));

      // Inject true superstars & sleepers into the distribution
      const starBump = spec.starterBias && rng.next() < 0.18 ? rng.range(0.8, 1.7) : 0;
      const tierMean = clamp(spec.tierBase + rng.gaussian(0, 0.75) + starBump, 3.8, 9.2);

      const trueAttributes = generateAttributesForPosition(spec.pos, tierMean, rng);
      const trueOverall = computeTrueOverall(spec.pos, trueAttributes);
      const potential = round1(
        clamp(
          trueOverall + (age <= 24 ? rng.range(0.3, 2.0) : rng.range(0, 0.6)),
          trueOverall,
          9.9
        )
      );

      // Seed realistic prior-season RB touches so the hidden 300-touch cliff is active in Season 1
      let priorSeasonTouches = 0;
      if (spec.pos === 'RB' && !isRookie && spec.starterBias) {
        priorSeasonTouches = rng.next() < 0.28 ? rng.int(305, 365) : rng.int(160, 285);
      }

      players[id] = {
        id,
        name: createUniqueName(rng, usedNames),
        position: spec.pos,
        proTeamId: teamId,
        age,
        experience: isRookie ? 0 : Math.max(1, experience),
        draftedYear: season - (isRookie ? 0 : Math.max(1, experience)),
        trueAttributes,
        trueOverall,
        potential,
        volatility: pickVolatility(rng),
        priorSeasonTouches,
        scoutingSeed: rng.int(1, 0x7fffffff),
        injuryWeeks: 0,
        fantasyTeamId: null,
        seasonStats: emptySeasonSummary(season, age, teamId),
        careerHistory: [],
        weeklyLogs: [],
        pointTrendHistory: seedInitialPointTrend(spec.pos, trueOverall, spec.starterBias, rng),
        weeklyIntel: createDefaultIntel(1),
        retired: false,
      };
    }
  }

  return players;
}

/**
 * Generates an incoming 48-player dynasty rookie class assigned across the 32 pro teams.
 */
export function generateRookieClass(
  proTeams: Record<string, ProTeam>,
  existingPlayers: Record<string, Player>,
  season: number,
  rng: SeededRNG
): Player[] {
  const usedNames = new Set(Object.values(existingPlayers).map((p) => p.name));
  const teamIds = Object.keys(proTeams);
  const distribution: { pos: Position; count: number }[] = [
    { pos: 'QB', count: 8 },
    { pos: 'RB', count: 14 },
    { pos: 'WR', count: 18 },
    { pos: 'TE', count: 8 },
  ];

  const rookies: Player[] = [];
  for (const { pos, count } of distribution) {
    for (let i = 0; i < count; i++) {
      const id = `r_${season}_${nextPlayerCounter++}_${rng.int(1000, 9999)}`;
      const proTeamId = rng.pick(teamIds);
      const age = rng.int(21, 23);
      // Top prospects have higher tier, later rounds are deeper flyers
      const prospectWave = i < Math.ceil(count * 0.25) ? 7.3 : i < Math.ceil(count * 0.6) ? 6.2 : 5.3;
      const tierMean = clamp(prospectWave + rng.gaussian(0, 0.8), 4.0, 9.0);
      const trueAttributes = generateAttributesForPosition(pos, tierMean, rng);
      const trueOverall = computeTrueOverall(pos, trueAttributes);
      const potential = round1(clamp(trueOverall + rng.range(0.5, 2.4), trueOverall, 9.9));

      rookies.push({
        id,
        name: createUniqueName(rng, usedNames),
        position: pos,
        proTeamId,
        age,
        experience: 0,
        draftedYear: season,
        trueAttributes,
        trueOverall,
        potential,
        volatility: pickVolatility(rng),
        priorSeasonTouches: 0,
        scoutingSeed: rng.int(1, 0x7fffffff),
        injuryWeeks: 0,
        fantasyTeamId: null,
        seasonStats: emptySeasonSummary(season, age, proTeamId),
        careerHistory: [],
        weeklyLogs: [],
        pointTrendHistory: seedInitialPointTrend(pos, trueOverall, i < Math.ceil(count * 0.4), rng),
        weeklyIntel: createDefaultIntel(1),
        retired: false,
      });
    }
  }

  return rookies;
}
