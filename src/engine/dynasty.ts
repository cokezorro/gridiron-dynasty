import {
  AIPersonality,
  ATTRIBUTE_KEYS,
  AutopickStrategy,
  DraftPickAsset,
  DraftPickRecord,
  DraftState,
  DynastyState,
  FantasyMatchup,
  FantasyTeam,
  HallOfFameEntry,
  IncomingTradeOffer,
  LineupSlotKey,
  LineupSlots,
  ManagerProfile,
  Player,
  Position,
  STARTER_SLOTS,
  SeasonHistoryEntry,
  WeeklyDigest,
} from './types';
import { SeededRNG, clamp, round1, round2 } from './rng';
import { generateProTeams } from './teams';
import { emptySeasonSummary, generateInitialPlayerPool, generateRookieClass } from './players';
import { computeTrueOverall, getScoutedOverall } from './scouting';
import {
  buildChampionshipMatchup,
  buildQuarterfinalMatchups,
  buildSemifinalMatchups,
  generateFantasyRegularSchedule,
  generateProSchedule,
  sortStandings,
} from './schedule';
import { simulateProWeek } from './simulator';
import { FILM_ROOM_CLUES } from './modifiers';
import { refreshWeeklyIntelAndNews } from './news';

export const STARTUP_ROUNDS = 16; // 8 starters + 8 bench
export const ROOKIE_DRAFT_ROUNDS = 3;
export const MAX_ACTIVE_ROSTER = 16;
export const MAX_TAXI_SQUAD = 3;
export const TRADE_DEADLINE_WEEK = 10;

export function isTradeWindowOpen(state: DynastyState): boolean {
  if (state.phase === 'OFFSEASON_SUMMARY') return true;
  if (state.phase === 'REGULAR_SEASON') return state.week <= TRADE_DEADLINE_WEEK;
  return false;
}

const AI_MANAGERS: { teamName: string; ownerName: string; personality: AIPersonality }[] = [
  { teamName: 'Sunday Blitzers', ownerName: 'Devon K.', personality: 'WIN_NOW' },
  { teamName: 'Forever Rebuild', ownerName: 'Maya R.', personality: 'YOUTH_MOVEMENT' },
  { teamName: 'Zero-RB Syndicate', ownerName: 'Trevor L.', personality: 'ZERO_RB' },
  { teamName: 'Bellcow Mafia', ownerName: 'Carlos M.', personality: 'HERO_RB' },
  { teamName: 'Value Sharks', ownerName: 'Hannah T.', personality: 'BPA_SHARK' },
  { teamName: 'Ceiling Chasers', ownerName: 'Jayden W.', personality: 'UPSIDE_GAMBLER' },
  { teamName: 'Fourth & Inches', ownerName: 'Brianna C.', personality: 'WIN_NOW' },
  { teamName: 'Rookie Fever', ownerName: 'Owen P.', personality: 'YOUTH_MOVEMENT' },
  { teamName: 'PPR Merchants', ownerName: 'Nadia S.', personality: 'ZERO_RB' },
  { teamName: 'Gridiron Alchemists', ownerName: 'Eli D.', personality: 'BPA_SHARK' },
  { teamName: 'Hail Mary Club', ownerName: 'Samir B.', personality: 'UPSIDE_GAMBLER' },
];

export function emptyLineup(): LineupSlots {
  return {
    QB: null,
    RB1: null,
    RB2: null,
    WR1: null,
    WR2: null,
    TE: null,
    FLEX1: null,
    FLEX2: null,
  };
}

export function isPositionEligibleForSlot(pos: Position, slot: LineupSlotKey): boolean {
  if (slot === 'QB') return pos === 'QB';
  if (slot === 'RB1' || slot === 'RB2') return pos === 'RB';
  if (slot === 'WR1' || slot === 'WR2') return pos === 'WR';
  if (slot === 'TE') return pos === 'TE';
  return pos === 'RB' || pos === 'WR' || pos === 'TE';
}

function createFuturePicks(teamId: string, startSeason: number): DraftPickAsset[] {
  const picks: DraftPickAsset[] = [];
  for (let s = startSeason; s <= startSeason + 2; s++) {
    for (let r = 1; r <= ROOKIE_DRAFT_ROUNDS; r++) {
      picks.push({
        id: `pick_${s}_r${r}_${teamId}`,
        season: s,
        round: r,
        originalOwnerId: teamId,
        currentOwnerId: teamId,
      });
    }
  }
  return picks;
}

/**
 * Evaluates a player's dynasty value for AI drafting, trades, and lineup rankings.
 * Incorporates 1-QB Full PPR positional weights + dynasty age curve + AI personality.
 */
export function evaluatePlayerDynastyValue(
  player: Player,
  personality: AIPersonality = 'BPA_SHARK',
  rosterContext?: { qbCount: number; rbCount: number; wrCount: number; teCount: number }
): number {
  const ovr = player.trueOverall;
  const pot = player.potential;

  // Base 1-QB Full PPR positional scaling (WRs hold elite dynasty longevity, 1-QB lowers QB scarcity)
  const posMult: Record<Position, number> = {
    WR: 1.12,
    RB: 1.04,
    TE: 0.96,
    QB: 0.92,
  };

  // Dynasty age curve multiplier
  let ageMult = 1.0;
  if (player.position === 'RB') {
    if (player.age <= 23) ageMult = 1.12;
    else if (player.age <= 25) ageMult = 1.05;
    else if (player.age >= 28) ageMult = 0.78;
    else if (player.age >= 27) ageMult = 0.88;
  } else if (player.position === 'WR' || player.position === 'TE') {
    if (player.age <= 24) ageMult = 1.14;
    else if (player.age <= 27) ageMult = 1.04;
    else if (player.age >= 31) ageMult = 0.76;
    else if (player.age >= 29) ageMult = 0.88;
  } else {
    if (player.age <= 26) ageMult = 1.08;
    else if (player.age >= 35) ageMult = 0.8;
  }

  let baseVal = (ovr * 0.72 + pot * 0.28) * 10 * posMult[player.position] * ageMult;

  // Personality preferences
  if (personality === 'WIN_NOW') {
    baseVal = (ovr * 0.9 + pot * 0.1) * 10 * posMult[player.position] * (player.age >= 28 ? 0.96 : 1.02);
  } else if (personality === 'YOUTH_MOVEMENT') {
    if (player.age <= 23) baseVal *= 1.18;
    if (player.age >= 28) baseVal *= 0.75;
  } else if (personality === 'ZERO_RB') {
    if (player.position === 'WR' || player.position === 'TE') baseVal *= 1.14;
    if (player.position === 'RB') baseVal *= 0.84;
  } else if (personality === 'HERO_RB') {
    if (player.position === 'RB' && (rosterContext?.rbCount ?? 0) === 0) baseVal *= 1.2;
  } else if (personality === 'UPSIDE_GAMBLER') {
    baseVal = (ovr * 0.55 + pot * 0.45) * 10 * posMult[player.position] * ageMult;
  }

  // Roster need balancing during drafts
  if (rosterContext) {
    if (player.position === 'QB') {
      if (rosterContext.qbCount === 0) baseVal *= 1.06;
      else if (rosterContext.qbCount === 1) baseVal *= 0.72;
      else baseVal *= 0.35;
    } else if (player.position === 'TE') {
      if (rosterContext.teCount === 0) baseVal *= 1.05;
      else if (rosterContext.teCount === 1) baseVal *= 0.78;
      else baseVal *= 0.48;
    } else if (player.position === 'RB') {
      if (rosterContext.rbCount < 2) baseVal *= 1.12;
      else if (rosterContext.rbCount >= 6) baseVal *= 0.65;
    } else if (player.position === 'WR') {
      if (rosterContext.wrCount < 3) baseVal *= 1.1;
      else if (rosterContext.wrCount >= 7) baseVal *= 0.72;
    }
  }

  return round1(baseVal);
}

export function getDraftPickTeamId(draft: DraftState, pickIndex = draft.currentPickIndex): string {
  const numTeams = draft.order.length;
  const round = Math.floor(pickIndex / numTeams); // 0-based
  const indexInRound = pickIndex % numTeams;
  if (draft.type === 'STARTUP' && round % 2 === 1) {
    return draft.order[numTeams - 1 - indexInRound];
  }
  return draft.order[indexInRound];
}

export function createNewDynasty(params?: {
  managerName?: string;
  teamName?: string;
  seed?: number;
}): DynastyState {
  const seed = params?.seed ?? Math.floor(Date.now() % 100000000);
  const rng = new SeededRNG(seed);
  const season = 2026;

  const proTeams = generateProTeams(rng);
  const players = generateInitialPlayerPool(proTeams, season, rng);

  const userTeamId = 'ft_user';
  const fantasyTeams: Record<string, FantasyTeam> = {};

  fantasyTeams[userTeamId] = {
    id: userTeamId,
    name: params?.teamName?.trim() || 'Apex Dynasty',
    ownerName: params?.managerName?.trim() || 'Coach',
    isUser: true,
    personality: 'BPA_SHARK',
    rosterIds: [],
    taxiIds: [],
    lineup: emptyLineup(),
    futurePicks: createFuturePicks(userTeamId, season + 1),
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    championships: 0,
    playoffAppearances: 0,
  };

  AI_MANAGERS.forEach((ai, idx) => {
    const id = `ft_ai_${idx + 1}`;
    fantasyTeams[id] = {
      id,
      name: ai.teamName,
      ownerName: ai.ownerName,
      isUser: false,
      personality: ai.personality,
      rosterIds: [],
      taxiIds: [],
      lineup: emptyLineup(),
      futurePicks: createFuturePicks(id, season + 1),
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      championships: 0,
      playoffAppearances: 0,
    };
  });

  const draftOrder = rng.shuffle(Object.keys(fantasyTeams));
  const poolIds = Object.values(players)
    .filter((p) => !p.retired)
    .sort((a, b) => b.trueOverall - a.trueOverall)
    .map((p) => p.id);

  const draft: DraftState = {
    type: 'STARTUP',
    season,
    totalRounds: STARTUP_ROUNDS,
    order: draftOrder,
    currentPickIndex: 0,
    picks: [],
    completed: false,
    poolIds,
    autopickEnabled: false,
    autopickStrategy: 'BALANCED',
    userQueue: [],
  };

  const manager: ManagerProfile = {
    name: params?.managerName?.trim() || 'Coach',
    level: 1,
    xp: 0,
    xpToNextLevel: 120,
    skillPoints: 1, // Start with 1 skill point so user can test upgrading immediately!
    skills: {
      scouting: 0,
      analyst: 0,
      frontOffice: 0,
    },
    discoveredClues: [],
    careerWins: 0,
    careerLosses: 0,
    championships: 0,
    playoffBerths: 0,
  };

  const state: DynastyState = {
    id: `dyn_${seed}`,
    seed: rng.getSeed(),
    season,
    week: 1,
    phase: 'STARTUP_DRAFT',
    proTeams,
    players,
    fantasyTeams,
    userTeamId,
    proSchedule: generateProSchedule(proTeams, rng),
    fantasySchedule: generateFantasyRegularSchedule(fantasyTeams, rng),
    draft,
    manager,
    seasonHistory: [],
    hallOfFame: [],
    lastWeeklyDigest: null,
    seasonDraftRecords: [],
    weeklyNews: [],
  };

  refreshWeeklyIntelAndNews(state, rng);
  state.seed = rng.getSeed();
  // Advance AI picks until user is on the clock
  return advanceAIDraftPicks(state);
}

function cloneState(state: DynastyState): DynastyState {
  return JSON.parse(JSON.stringify(state)) as DynastyState;
}

function getRosterCounts(team: FantasyTeam, players: Record<string, Player>) {
  let qbCount = 0;
  let rbCount = 0;
  let wrCount = 0;
  let teCount = 0;
  for (const id of [...team.rosterIds, ...team.taxiIds]) {
    const p = players[id];
    if (!p) continue;
    if (p.position === 'QB') qbCount++;
    else if (p.position === 'RB') rbCount++;
    else if (p.position === 'WR') wrCount++;
    else if (p.position === 'TE') teCount++;
  }
  return { qbCount, rbCount, wrCount, teCount };
}

function chooseAIDraftPlayer(state: DynastyState, team: FantasyTeam, rng: SeededRNG): string {
  const draft = state.draft!;
  const counts = getRosterCounts(team, state.players);
  const candidates = draft.poolIds
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p && !p.fantasyTeamId && !p.retired));

  // AI has its own scouting noise so drafts feel organic and unpredictable
  const scored = candidates.map((p) => {
    const base = evaluatePlayerDynastyValue(p, team.personality, counts);
    const noise = rng.gaussian(0, 5.5);
    return { id: p.id, score: base + noise };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].id;
}

function applySingleDraftPick(state: DynastyState, playerId: string): void {
  const draft = state.draft;
  if (!draft || draft.completed) return;

  const teamId = getDraftPickTeamId(draft);
  const team = state.fantasyTeams[teamId];
  const player = state.players[playerId];
  if (!team || !player || player.fantasyTeamId) return;

  const numTeams = draft.order.length;
  const round = Math.floor(draft.currentPickIndex / numTeams) + 1;
  const pickInRound = (draft.currentPickIndex % numTeams) + 1;

  player.fantasyTeamId = teamId;
  // During rookie draft, place rookies on Taxi Squad if active roster is full & taxi has room
  if (
    draft.type === 'ROOKIE' &&
    team.rosterIds.length >= MAX_ACTIVE_ROSTER &&
    team.taxiIds.length < MAX_TAXI_SQUAD
  ) {
    team.taxiIds.push(playerId);
  } else {
    team.rosterIds.push(playerId);
  }

  draft.poolIds = draft.poolIds.filter((id) => id !== playerId);
  if (draft.userQueue) {
    draft.userQueue = draft.userQueue.filter((id) => id !== playerId);
  }

  const record: DraftPickRecord = {
    overallPick: draft.currentPickIndex + 1,
    round,
    pickInRound,
    fantasyTeamId: teamId,
    playerId,
    playerName: player.name,
    position: player.position,
  };
  draft.picks.push(record);
  state.seasonDraftRecords.push(record);

  draft.currentPickIndex += 1;

  const totalPicks = draft.totalRounds * numTeams;
  if (draft.currentPickIndex >= totalPicks || draft.poolIds.length === 0) {
    draft.completed = true;
    draft.autopickEnabled = false;
    // Trim AI teams that went over MAX_ACTIVE_ROSTER during rookie drafts
    for (const ft of Object.values(state.fantasyTeams)) {
      if (!ft.isUser) {
        while (ft.rosterIds.length > MAX_ACTIVE_ROSTER) {
          // Drop lowest-value player
          const sorted = [...ft.rosterIds].sort(
            (a, b) =>
              evaluatePlayerDynastyValue(state.players[a], ft.personality) -
              evaluatePlayerDynastyValue(state.players[b], ft.personality)
          );
          const dropId = sorted[0];
          ft.rosterIds = ft.rosterIds.filter((id) => id !== dropId);
          if (state.players[dropId]) state.players[dropId].fantasyTeamId = null;
        }
      }
      autoOptimizeLineupInPlace(state, ft.id);
    }
    state.phase = 'REGULAR_SEASON';
    state.week = 1;
    const rng = new SeededRNG(state.seed);
    refreshWeeklyIntelAndNews(state, rng);
    state.seed = rng.getSeed();
  }
}

export function advanceAIDraftPicks(inputState: DynastyState): DynastyState {
  const state = cloneState(inputState);
  if (!state.draft || state.draft.completed) return state;
  const rng = new SeededRNG(state.seed);

  while (state.draft && !state.draft.completed) {
    const onClockId = getDraftPickTeamId(state.draft);
    const team = state.fantasyTeams[onClockId];
    if (team.isUser) break;
    const pickId = chooseAIDraftPlayer(state, team, rng);
    applySingleDraftPick(state, pickId);
  }

  state.seed = rng.getSeed();
  return state;
}

export function makeUserDraftPick(inputState: DynastyState, playerId: string): DynastyState {
  const state = cloneState(inputState);
  if (!state.draft || state.draft.completed) return state;
  const onClockId = getDraftPickTeamId(state.draft);
  if (onClockId !== state.userTeamId) return state;
  if (!state.draft.poolIds.includes(playerId)) return state;

  applySingleDraftPick(state, playerId);
  return advanceAIDraftPicks(state);
}

/**
 * Evaluates a candidate player for the user's Autopick using ONLY the user's
 * scouted 1-10 ratings (never peeking at hidden true ratings), factoring in
 * roster needs and the chosen AutopickStrategy.
 */
function scoreAutopickCandidate(
  state: DynastyState,
  player: Player,
  counts: { qbCount: number; rbCount: number; wrCount: number; teCount: number },
  strategy: AutopickStrategy
): number {
  const scouted = getScoutedOverall(player, state.manager, state.season);
  let score = scouted.midpoint * 10;

  // Base 1-QB Full PPR starter need adjustments
  if (player.position === 'QB') {
    if (counts.qbCount === 0) score += 7;
    else if (counts.qbCount === 1) score -= 12;
    else score -= 30;
  } else if (player.position === 'TE') {
    if (counts.teCount === 0) score += 5;
    else if (counts.teCount === 1) score -= 8;
    else score -= 22;
  } else if (player.position === 'RB') {
    if (counts.rbCount < 2) score += 8;
    else if (counts.rbCount >= 6) score -= 14;
  } else if (player.position === 'WR') {
    if (counts.wrCount < 3) score += 8;
    else if (counts.wrCount >= 7) score -= 12;
  }

  // Strategy modifiers
  switch (strategy) {
    case 'WIN_NOW':
      // Prioritize highest immediate scouted rating; don't penalize veterans heavily
      score += scouted.low * 1.5;
      if (player.age >= 32) score -= 4;
      break;
    case 'YOUTH_MOVEMENT':
      if (player.age <= 23) score += 11;
      else if (player.age <= 25) score += 5;
      else if (player.age >= 28) score -= 12;
      if (player.experience === 0) score += 4;
      break;
    case 'ZERO_RB':
      if (player.position === 'WR' || player.position === 'TE') score += 9;
      if (player.position === 'RB') score -= counts.rbCount === 0 ? 7 : 12;
      break;
    case 'HERO_RB':
      if (player.position === 'RB' && counts.rbCount === 0) score += 13;
      else if (player.position === 'RB' && counts.rbCount >= 1) score -= 6;
      else if (player.position === 'WR') score += 5;
      break;
    case 'BALANCED':
    default:
      if (player.age <= 24) score += 3;
      if (player.age >= 29) score -= 6;
      break;
  }

  return score;
}

/**
 * Returns the player ID that Autopick would draft next for the user:
 * 1. First available player in draft.userQueue
 * 2. Otherwise highest-scoring candidate under draft.autopickStrategy
 */
export function getRecommendedAutoPick(state: DynastyState): Player | null {
  const draft = state.draft;
  if (!draft || draft.completed) return null;

  // Respect user draft queue first
  for (const qId of draft.userQueue ?? []) {
    const qp = state.players[qId];
    if (qp && !qp.fantasyTeamId && !qp.retired && draft.poolIds.includes(qId)) {
      return qp;
    }
  }

  const team = state.fantasyTeams[state.userTeamId];
  const counts = getRosterCounts(team, state.players);
  const strategy = draft.autopickStrategy ?? 'BALANCED';

  const candidates = draft.poolIds
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p && !p.fantasyTeamId && !p.retired));

  if (candidates.length === 0) return null;

  candidates.sort(
    (a, b) =>
      scoreAutopickCandidate(state, b, counts, strategy) -
      scoreAutopickCandidate(state, a, counts, strategy)
  );
  return candidates[0];
}

export function setDraftAutopick(
  inputState: DynastyState,
  enabled: boolean,
  strategy?: AutopickStrategy
): DynastyState {
  const state = cloneState(inputState);
  if (!state.draft || state.draft.completed) return state;
  state.draft.autopickEnabled = enabled;
  if (strategy) {
    state.draft.autopickStrategy = strategy;
  }
  return state;
}

export function toggleDraftQueuePlayer(
  inputState: DynastyState,
  playerId: string
): DynastyState {
  const state = cloneState(inputState);
  if (!state.draft || state.draft.completed) return state;
  if (!state.draft.poolIds.includes(playerId)) return state;
  const queue = state.draft.userQueue ?? [];
  if (queue.includes(playerId)) {
    state.draft.userQueue = queue.filter((id) => id !== playerId);
  } else {
    state.draft.userQueue = [...queue, playerId];
  }
  return state;
}

export function autoPickUserTurn(inputState: DynastyState): DynastyState {
  const state = cloneState(inputState);
  if (!state.draft || state.draft.completed) return state;
  const onClockId = getDraftPickTeamId(state.draft);
  if (onClockId !== state.userTeamId) return advanceAIDraftPicks(state);

  const recommended = getRecommendedAutoPick(state);
  if (recommended) {
    applySingleDraftPick(state, recommended.id);
  }
  return advanceAIDraftPicks(state);
}

/**
 * Executes exactly one draft pick (either the user's Autopick or the next AI pick),
 * allowing UIs to run a live animated Autopick loop that the user can pause anytime.
 */
export function stepAutoDraftPick(inputState: DynastyState): DynastyState {
  const state = cloneState(inputState);
  if (!state.draft || state.draft.completed) return state;

  const rng = new SeededRNG(state.seed);
  const onClockId = getDraftPickTeamId(state.draft);
  const team = state.fantasyTeams[onClockId];

  if (team.isUser) {
    const rec = getRecommendedAutoPick(state);
    if (rec) applySingleDraftPick(state, rec.id);
  } else {
    const pickId = chooseAIDraftPlayer(state, team, rng);
    applySingleDraftPick(state, pickId);
  }

  state.seed = rng.getSeed();
  return state;
}

export function simRemainingDraft(inputState: DynastyState): DynastyState {
  let state = cloneState(inputState);
  while (state.draft && !state.draft.completed) {
    const onClockId = getDraftPickTeamId(state.draft);
    if (onClockId === state.userTeamId) {
      state = autoPickUserTurn(state);
    } else {
      state = advanceAIDraftPicks(state);
    }
  }
  return state;
}

function autoOptimizeLineupInPlace(state: DynastyState, teamId: string): void {
  const team = state.fantasyTeams[teamId];
  if (!team) return;

  const activePlayers = team.rosterIds
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p && !p.retired));

  const rankValue = (p: Player) => {
    const base = team.isUser
      ? getScoutedOverall(p, state.manager, state.season).midpoint
      : p.trueOverall;
    const recentAvg =
      p.seasonStats.gamesPlayed > 0
        ? p.seasonStats.fantasyPoints / p.seasonStats.gamesPlayed
        : base * 1.9;
    const intelMult = p.weeklyIntel?.isTop200 ? p.weeklyIntel.performanceMultiplier : 1.0;
    const healthPenalty = p.injuryWeeks > 0 ? -100 : 0;
    return (base * 1.4 + recentAvg * 0.45) * intelMult + healthPenalty;
  };

  const used = new Set<string>();
  const lineup = emptyLineup();

  const pickBest = (positions: Position[]): string | null => {
    const eligible = activePlayers
      .filter((p) => !used.has(p.id) && positions.includes(p.position))
      .sort((a, b) => rankValue(b) - rankValue(a));
    if (!eligible[0]) return null;
    used.add(eligible[0].id);
    return eligible[0].id;
  };

  lineup.QB = pickBest(['QB']);
  lineup.RB1 = pickBest(['RB']);
  lineup.RB2 = pickBest(['RB']);
  lineup.WR1 = pickBest(['WR']);
  lineup.WR2 = pickBest(['WR']);
  lineup.TE = pickBest(['TE']);
  lineup.FLEX1 = pickBest(['RB', 'WR', 'TE']);
  lineup.FLEX2 = pickBest(['RB', 'WR', 'TE']);

  team.lineup = lineup;
}

export function autoOptimizeUserLineup(inputState: DynastyState): DynastyState {
  const state = cloneState(inputState);
  autoOptimizeLineupInPlace(state, state.userTeamId);
  return state;
}

export function setLineupSlot(
  inputState: DynastyState,
  slot: LineupSlotKey,
  playerId: string
): DynastyState {
  const state = cloneState(inputState);
  const team = state.fantasyTeams[state.userTeamId];
  const player = state.players[playerId];
  if (!team || !player || !team.rosterIds.includes(playerId)) return state;
  if (!isPositionEligibleForSlot(player.position, slot)) return state;

  // If player is already in another starter slot, swap them
  const existingSlot = STARTER_SLOTS.find((s) => team.lineup[s] === playerId);
  const previousPlayerId = team.lineup[slot];

  team.lineup[slot] = playerId;
  if (existingSlot && existingSlot !== slot) {
    if (
      previousPlayerId &&
      isPositionEligibleForSlot(state.players[previousPlayerId].position, existingSlot)
    ) {
      team.lineup[existingSlot] = previousPlayerId;
    } else {
      team.lineup[existingSlot] = null;
    }
  }

  return state;
}

export function movePlayerTaxi(
  inputState: DynastyState,
  playerId: string,
  toTaxi: boolean
): DynastyState {
  const state = cloneState(inputState);
  const team = state.fantasyTeams[state.userTeamId];
  const player = state.players[playerId];
  if (!team || !player) return state;

  if (toTaxi) {
    if (player.experience > 1) return state; // Only rookies & 2nd-year players eligible for taxi
    if (team.taxiIds.length >= MAX_TAXI_SQUAD) return state;
    if (!team.rosterIds.includes(playerId)) return state;
    team.rosterIds = team.rosterIds.filter((id) => id !== playerId);
    team.taxiIds.push(playerId);
    for (const slot of STARTER_SLOTS) {
      if (team.lineup[slot] === playerId) team.lineup[slot] = null;
    }
  } else {
    if (!team.taxiIds.includes(playerId)) return state;
    if (team.rosterIds.length >= MAX_ACTIVE_ROSTER) return state;
    team.taxiIds = team.taxiIds.filter((id) => id !== playerId);
    team.rosterIds.push(playerId);
  }
  return state;
}

export function signFreeAgent(
  inputState: DynastyState,
  addPlayerId: string,
  dropPlayerId: string | null
): DynastyState {
  const state = cloneState(inputState);
  const team = state.fantasyTeams[state.userTeamId];
  const addPlayer = state.players[addPlayerId];
  if (!team || !addPlayer || addPlayer.fantasyTeamId !== null || addPlayer.retired) return state;

  if (team.rosterIds.length >= MAX_ACTIVE_ROSTER) {
    if (!dropPlayerId || !team.rosterIds.includes(dropPlayerId)) return state;
    team.rosterIds = team.rosterIds.filter((id) => id !== dropPlayerId);
    state.players[dropPlayerId].fantasyTeamId = null;
    for (const slot of STARTER_SLOTS) {
      if (team.lineup[slot] === dropPlayerId) team.lineup[slot] = null;
    }
  }

  team.rosterIds.push(addPlayerId);
  addPlayer.fantasyTeamId = team.id;
  return state;
}

export interface TradeEvaluation {
  accepted: boolean;
  giveValue: number;
  receiveValue: number;
  reason: string;
}

export function evaluateTradeProposal(
  state: DynastyState,
  targetTeamId: string,
  givePlayerIds: string[],
  receivePlayerIds: string[]
): TradeEvaluation {
  if (!isTradeWindowOpen(state)) {
    return {
      accepted: false,
      giveValue: 0,
      receiveValue: 0,
      reason: `Trade deadline passed (Week ${TRADE_DEADLINE_WEEK}). Trading reopens in the offseason.`,
    };
  }
  const target = state.fantasyTeams[targetTeamId];
  if (!target || target.isUser || givePlayerIds.length === 0 || receivePlayerIds.length === 0) {
    return { accepted: false, giveValue: 0, receiveValue: 0, reason: 'Select at least one player on each side.' };
  }

  const counts = getRosterCounts(target, state.players);
  const giveVal = givePlayerIds.reduce((sum, id) => {
    const p = state.players[id];
    return sum + (p ? evaluatePlayerDynastyValue(p, target.personality, counts) : 0);
  }, 0);
  const receiveVal = receivePlayerIds.reduce((sum, id) => {
    const p = state.players[id];
    return sum + (p ? evaluatePlayerDynastyValue(p, target.personality, counts) : 0);
  }, 0);

  // Front Office skill reduces the AI's trade markup threshold from 1.08 down to 0.94
  const requiredRatio = Math.max(0.94, 1.08 - state.manager.skills.frontOffice * 0.016);
  const accepted = giveVal >= receiveVal * requiredRatio;

  let reason = accepted
    ? `${target.ownerName} (${target.personality.replace('_', ' ')}) likes the fit and accepts!`
    : `${target.ownerName} wants more value back (${target.personality.replace('_', ' ')} philosophy).`;

  if (!accepted && givePlayerIds.length > receivePlayerIds.length + 1) {
    reason = `${target.ownerName} prefers quality over roster clutter.`;
  }

  return {
    accepted,
    giveValue: round1(giveVal),
    receiveValue: round1(receiveVal),
    reason,
  };
}

export function executeTrade(
  inputState: DynastyState,
  targetTeamId: string,
  givePlayerIds: string[],
  receivePlayerIds: string[]
): { state: DynastyState; evaluation: TradeEvaluation } {
  const evaluation = evaluateTradeProposal(inputState, targetTeamId, givePlayerIds, receivePlayerIds);
  if (!evaluation.accepted) {
    return { state: inputState, evaluation };
  }

  const state = cloneState(inputState);
  const userTeam = state.fantasyTeams[state.userTeamId];
  const aiTeam = state.fantasyTeams[targetTeamId];

  // Validate roster space when adding net players
  const newUserCount = userTeam.rosterIds.length - givePlayerIds.length + receivePlayerIds.length;
  if (receivePlayerIds.length > givePlayerIds.length && newUserCount > MAX_ACTIVE_ROSTER + 2) {
    return {
      state: inputState,
      evaluation: { ...evaluation, accepted: false, reason: 'Not enough roster space for incoming players.' },
    };
  }

  for (const id of givePlayerIds) {
    userTeam.rosterIds = userTeam.rosterIds.filter((r) => r !== id);
    aiTeam.rosterIds.push(id);
    state.players[id].fantasyTeamId = aiTeam.id;
    for (const slot of STARTER_SLOTS) {
      if (userTeam.lineup[slot] === id) userTeam.lineup[slot] = null;
    }
  }
  for (const id of receivePlayerIds) {
    aiTeam.rosterIds = aiTeam.rosterIds.filter((r) => r !== id);
    userTeam.rosterIds.push(id);
    state.players[id].fantasyTeamId = userTeam.id;
    for (const slot of STARTER_SLOTS) {
      if (aiTeam.lineup[slot] === id) aiTeam.lineup[slot] = null;
    }
  }

  autoOptimizeLineupInPlace(state, aiTeam.id);
  return { state, evaluation };
}

function buildAITradePitch(
  ai: FantasyTeam,
  aiGives: Player,
  userGives: Player,
  week: number
): string {
  if (week >= TRADE_DEADLINE_WEEK - 1) {
    return `${ai.ownerName} is making a Trade Deadline push and wants ${userGives.position} ${userGives.name} for the stretch run.`;
  }
  switch (ai.personality) {
    case 'WIN_NOW':
      return `${ai.ownerName} (Win Now) wants proven production from ${userGives.name} and is willing to move ${aiGives.name}.`;
    case 'YOUTH_MOVEMENT':
      return `${ai.ownerName} (Youth Movement) is targeting younger upside in ${userGives.name} (Age ${userGives.age}).`;
    case 'ZERO_RB':
      return `${ai.ownerName} (Zero-RB) is shopping backfield depth to upgrade their passing-game core.`;
    case 'HERO_RB':
      return `${ai.ownerName} (Hero-RB) is looking to rebalance their roster around a core starter.`;
    case 'UPSIDE_GAMBLER':
      return `${ai.ownerName} (Upside Gambler) likes ${userGives.name}'s ceiling and floated a 1-for-1 swap.`;
    default:
      return `${ai.ownerName} sees a mutual positional fit and sent over a 1-for-1 offer.`;
  }
}

function maybeGenerateSparingAITradeOffer(state: DynastyState, rng: SeededRNG): void {
  const existing = state.incomingTradeOffers ?? [];
  // Clear all offers if trade window is closed
  if (!isTradeWindowOpen(state)) {
    state.incomingTradeOffers = [];
    return;
  }

  const userTeam = state.fantasyTeams[state.userTeamId];
  // Prune expired or invalidated offers
  const valid = existing.filter((o) => {
    if (o.expiresWeek < state.week) return false;
    const ai = state.fantasyTeams[o.fromTeamId];
    if (!ai || !userTeam) return false;
    return ai.rosterIds.includes(o.aiGivesPlayerId) && userTeam.rosterIds.includes(o.userGivesPlayerId);
  });
  state.incomingTradeOffers = valid;

  // Sparing cap: never spam more than 1 active incoming offer at a time
  if (valid.length >= 1) return;
  if (state.phase !== 'REGULAR_SEASON' || state.week < 2 || state.week > TRADE_DEADLINE_WEEK) return;

  // Sparing frequency: ~22% per week normally (~1-3 per season), ~40% during deadline crunch (Wks 9-10)
  const offerChance = state.week >= TRADE_DEADLINE_WEEK - 1 ? 0.40 : 0.22;
  if (rng.next() > offerChance) return;

  const aiTeams = rng.shuffle(Object.values(state.fantasyTeams).filter((t) => !t.isUser));
  const userCandidates = userTeam.rosterIds
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p && !p.retired && p.injuryWeeks <= 2));
  if (userCandidates.length === 0) return;

  for (const ai of aiTeams) {
    const counts = getRosterCounts(ai, state.players);
    const aiCandidates = ai.rosterIds
      .map((id) => state.players[id])
      .filter((p): p is Player => Boolean(p && !p.retired && p.injuryWeeks <= 2));
    if (aiCandidates.length === 0) continue;

    // Pick a target on the user's team that fits this AI's persona
    const scoredTargets = userCandidates
      .map((p) => {
        let fit = evaluatePlayerDynastyValue(p, ai.personality, counts);
        if (ai.personality === 'YOUTH_MOVEMENT' && p.age <= 24) fit += 8;
        if (ai.personality === 'WIN_NOW' && p.age >= 25 && p.age <= 30) fit += 6;
        return { player: p, fit, val: evaluatePlayerDynastyValue(p, ai.personality, counts) };
      })
      .sort((a, b) => b.fit - a.fit);

    const targetPool = scoredTargets.slice(0, Math.min(6, scoredTargets.length));
    const chosenTarget = rng.pick(targetPool);
    if (!chosenTarget) continue;

    // Find a fair-value player on the AI's roster (0.90x to 1.12x value, preferring different position)
    const fairMatches = aiCandidates
      .map((p) => ({
        player: p,
        val: evaluatePlayerDynastyValue(p, ai.personality, counts),
        diffPos: p.position !== chosenTarget.player.position,
      }))
      .filter((x) => {
        const ratio = x.val / Math.max(1, chosenTarget.val);
        return ratio >= 0.9 && ratio <= 1.12;
      })
      .sort((a, b) => (b.diffPos ? 1 : 0) - (a.diffPos ? 1 : 0) || Math.abs(a.val - chosenTarget.val) - Math.abs(b.val - chosenTarget.val));

    const match = fairMatches[0];
    if (!match) continue;

    const offer: IncomingTradeOffer = {
      id: `offer_${state.season}_${state.week}_${ai.id}`,
      fromTeamId: ai.id,
      fromTeamName: ai.name,
      fromOwnerName: ai.ownerName,
      fromPersonality: ai.personality,
      weekOffered: state.week,
      expiresWeek: Math.min(TRADE_DEADLINE_WEEK, state.week + 1),
      aiGivesPlayerId: match.player.id,
      userGivesPlayerId: chosenTarget.player.id,
      pitch: buildAITradePitch(ai, match.player, chosenTarget.player, state.week),
    };
    state.incomingTradeOffers = [offer];
    return;
  }
}

export function acceptIncomingTradeOffer(
  inputState: DynastyState,
  offerId: string
): { state: DynastyState; accepted: boolean; message: string } {
  const offer = (inputState.incomingTradeOffers ?? []).find((o) => o.id === offerId);
  if (!offer) {
    return { state: inputState, accepted: false, message: 'Trade offer is no longer available.' };
  }
  if (!isTradeWindowOpen(inputState)) {
    const state = cloneState(inputState);
    state.incomingTradeOffers = [];
    return {
      state,
      accepted: false,
      message: `Trade deadline passed (Week ${TRADE_DEADLINE_WEEK}). Offer expired.`,
    };
  }

  const state = cloneState(inputState);
  const userTeam = state.fantasyTeams[state.userTeamId];
  const aiTeam = state.fantasyTeams[offer.fromTeamId];
  if (
    !userTeam ||
    !aiTeam ||
    !userTeam.rosterIds.includes(offer.userGivesPlayerId) ||
    !aiTeam.rosterIds.includes(offer.aiGivesPlayerId)
  ) {
    state.incomingTradeOffers = (state.incomingTradeOffers ?? []).filter((o) => o.id !== offerId);
    return { state, accepted: false, message: 'One of the players in this offer is no longer on the roster.' };
  }

  userTeam.rosterIds = userTeam.rosterIds.filter((id) => id !== offer.userGivesPlayerId);
  aiTeam.rosterIds = aiTeam.rosterIds.filter((id) => id !== offer.aiGivesPlayerId);
  userTeam.rosterIds.push(offer.aiGivesPlayerId);
  aiTeam.rosterIds.push(offer.userGivesPlayerId);

  state.players[offer.userGivesPlayerId].fantasyTeamId = aiTeam.id;
  state.players[offer.aiGivesPlayerId].fantasyTeamId = userTeam.id;

  for (const slot of STARTER_SLOTS) {
    if (userTeam.lineup[slot] === offer.userGivesPlayerId) userTeam.lineup[slot] = null;
    if (aiTeam.lineup[slot] === offer.aiGivesPlayerId) aiTeam.lineup[slot] = null;
  }
  autoOptimizeLineupInPlace(state, aiTeam.id);
  state.incomingTradeOffers = (state.incomingTradeOffers ?? []).filter((o) => o.id !== offerId);

  const got = state.players[offer.aiGivesPlayerId];
  const sent = state.players[offer.userGivesPlayerId];
  return {
    state,
    accepted: true,
    message: `TRADE COMPLETED! Acquired ${got.position} ${got.name} from ${aiTeam.name} for ${sent.position} ${sent.name}.`,
  };
}

export function declineIncomingTradeOffer(
  inputState: DynastyState,
  offerId: string
): DynastyState {
  const state = cloneState(inputState);
  state.incomingTradeOffers = (state.incomingTradeOffers ?? []).filter((o) => o.id !== offerId);
  return state;
}

function awardManagerXP(manager: ManagerProfile, amount: number): void {
  manager.xp += amount;
  while (manager.xp >= manager.xpToNextLevel) {
    manager.xp -= manager.xpToNextLevel;
    manager.level += 1;
    manager.skillPoints += 1;
    manager.xpToNextLevel = Math.round(manager.xpToNextLevel * 1.28);
  }
}

export function spendSkillPoint(
  inputState: DynastyState,
  branch: 'scouting' | 'analyst' | 'frontOffice'
): DynastyState {
  const state = cloneState(inputState);
  if (state.manager.skillPoints <= 0) return state;
  if (state.manager.skills[branch] >= 10) return state;

  state.manager.skillPoints -= 1;
  state.manager.skills[branch] += 1;

  // Unlock Film Room clues when upgrading Analyst
  if (branch === 'analyst') {
    for (const clue of FILM_ROOM_CLUES) {
      if (
        state.manager.skills.analyst >= clue.analystLevel &&
        !state.manager.discoveredClues.includes(clue.text)
      ) {
        state.manager.discoveredClues.push(clue.text);
      }
    }
  }

  return state;
}

function computePositionRanks(players: Record<string, Player>): void {
  const positions: Position[] = ['QB', 'RB', 'WR', 'TE'];
  for (const pos of positions) {
    const list = Object.values(players)
      .filter((p) => !p.retired && p.position === pos)
      .sort((a, b) => b.seasonStats.fantasyPoints - a.seasonStats.fantasyPoints);
    list.forEach((p, idx) => {
      p.seasonStats.positionRank = idx + 1;
    });
  }
}

function scoreFantasyTeamWeek(
  team: FantasyTeam,
  weeklyStats: Map<string, { fantasyPoints: number }>
): number {
  let total = 0;
  for (const slot of STARTER_SLOTS) {
    const pid = team.lineup[slot];
    if (!pid) continue;
    const st = weeklyStats.get(pid);
    if (st) total += st.fantasyPoints;
  }
  return round2(total);
}

function finalizeSeasonArchive(state: DynastyState): void {
  const standings = sortStandings(Object.values(state.fantasyTeams));
  const champMatch = state.fantasySchedule.find(
    (m) => m.week === 17 && m.playoffLabel === 'Dynasty Championship'
  );
  const championTeamId = champMatch
    ? champMatch.homeScore >= champMatch.awayScore
      ? champMatch.homeTeamId
      : champMatch.awayTeamId
    : standings[0].id;
  const championTeam = state.fantasyTeams[championTeamId];
  championTeam.championships += 1;

  // Mark playoff appearances for top 6
  standings.slice(0, 6).forEach((t) => {
    state.fantasyTeams[t.id].playoffAppearances += 1;
  });

  const userTeam = state.fantasyTeams[state.userTeamId];
  const userRank = standings.findIndex((t) => t.id === state.userTeamId) + 1;

  // Determine user's playoff outcome
  let userPlayoffResult = 'Missed Playoffs';
  if (championTeamId === state.userTeamId) {
    userPlayoffResult = 'Dynasty Champion 🏆';
    state.manager.championships += 1;
    state.manager.playoffBerths += 1;
  } else if (userRank <= 6) {
    state.manager.playoffBerths += 1;
    const playedChamp =
      champMatch &&
      (champMatch.homeTeamId === state.userTeamId || champMatch.awayTeamId === state.userTeamId);
    if (playedChamp) {
      userPlayoffResult = 'Championship Runner-Up';
    } else {
      const playedSemi = state.fantasySchedule.some(
        (m) =>
          m.week === 16 &&
          (m.homeTeamId === state.userTeamId || m.awayTeamId === state.userTeamId)
      );
      userPlayoffResult = playedSemi ? 'Semifinalist' : 'Quarterfinalist';
    }
  }

  // League MVP & User MVP
  const allActive = Object.values(state.players).filter((p) => !p.retired);
  const leagueMvp = [...allActive].sort(
    (a, b) => b.seasonStats.fantasyPoints - a.seasonStats.fantasyPoints
  )[0];

  const userRoster = userTeam.rosterIds
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p));
  const userBest = [...userRoster].sort(
    (a, b) => b.seasonStats.fantasyPoints - a.seasonStats.fantasyPoints
  )[0];

  // Retroactive Draft Steal & Bust from this season's draft picks
  const userDraftPicks = state.seasonDraftRecords.filter(
    (r) => r.fantasyTeamId === state.userTeamId
  );
  let stealLabel = 'N/A';
  let bustLabel = 'N/A';
  if (userDraftPicks.length > 0) {
    const graded = userDraftPicks
      .map((rec) => {
        const p = state.players[rec.playerId];
        const pts = p?.seasonStats.fantasyPoints ?? 0;
        const expected = Math.max(60, 265 - rec.overallPick * 1.15);
        return { rec, pts, delta: pts - expected };
      })
      .sort((a, b) => b.delta - a.delta);
    const best = graded[0];
    const worst = graded[graded.length - 1];
    stealLabel = `${best.rec.playerName} (Rd ${best.rec.round}, ${best.pts.toFixed(0)} pts)`;
    bustLabel = `${worst.rec.playerName} (Rd ${worst.rec.round}, ${worst.pts.toFixed(0)} pts)`;
  }

  // End-of-season XP bonus
  const seasonXp =
    60 +
    (userRank <= 6 ? 70 : 0) +
    (championTeamId === state.userTeamId ? 150 : 0) +
    userTeam.wins * 5;
  awardManagerXP(state.manager, seasonXp);

  const historyEntry: SeasonHistoryEntry = {
    season: state.season,
    championTeamId,
    championTeamName: championTeam.name,
    userRank,
    userWins: userTeam.wins,
    userLosses: userTeam.losses,
    userPointsFor: round1(userTeam.pointsFor),
    userPlayoffResult,
    leagueMvpName: leagueMvp?.name ?? 'N/A',
    leagueMvpPos: leagueMvp?.position ?? 'QB',
    leagueMvpPoints: round1(leagueMvp?.seasonStats.fantasyPoints ?? 0),
    userBestPlayerName: userBest?.name ?? 'N/A',
    userBestPlayerPoints: round1(userBest?.seasonStats.fantasyPoints ?? 0),
    userDraftSteal: stealLabel,
    userDraftBust: bustLabel,
    xpEarned: seasonXp,
  };

  state.seasonHistory.unshift(historyEntry);
}

export function simulateWeek(inputState: DynastyState): DynastyState {
  const state = cloneState(inputState);
  if (state.phase !== 'REGULAR_SEASON' && state.phase !== 'PLAYOFFS') return state;

  const rng = new SeededRNG(state.seed);
  const currentWeek = state.week;

  // 1. Heal prior injuries by 1 week before kickoff
  for (const p of Object.values(state.players)) {
    if (p.injuryWeeks > 0) {
      p.injuryWeeks = Math.max(0, p.injuryWeeks - 1);
    }
  }

  // 2. Auto-optimize AI lineups (and fill empty user slots if any starter is injured/empty)
  for (const ft of Object.values(state.fantasyTeams)) {
    if (!ft.isUser) {
      autoOptimizeLineupInPlace(state, ft.id);
    }
  }

  // 3. Simulate all 16 Pro Football games for this week
  const weekProMatchups = state.proSchedule.filter((m) => m.week === currentWeek);
  const simRes = simulateProWeek({
    matchups: weekProMatchups,
    proTeams: state.proTeams,
    players: state.players,
    season: state.season,
    week: currentWeek,
    rng,
  });

  // 4. Commit weekly stats & injuries to players
  for (const [playerId, st] of simRes.weeklyStats.entries()) {
    const p = state.players[playerId];
    if (!p) continue;
    p.weeklyLogs.push(st);
    p.seasonStats.gamesPlayed += 1;
    p.seasonStats.passYards += st.passYards;
    p.seasonStats.passTDs += st.passTDs;
    p.seasonStats.interceptions += st.interceptions;
    p.seasonStats.rushAttempts += st.rushAttempts;
    p.seasonStats.rushYards += st.rushYards;
    p.seasonStats.rushTDs += st.rushTDs;
    p.seasonStats.targets += st.targets;
    p.seasonStats.receptions += st.receptions;
    p.seasonStats.recYards += st.recYards;
    p.seasonStats.recTDs += st.recTDs;
    p.seasonStats.fumbles += st.fumbles;
    p.seasonStats.fantasyPoints = round2(p.seasonStats.fantasyPoints + st.fantasyPoints);
  }
  // Append weekly fantasy point data to pointTrendHistory (keep last 10 points for trending chart)
  for (const p of Object.values(state.players)) {
    if (p.retired) continue;
    const st = simRes.weeklyStats.get(p.id);
    const pts = st ? round1(st.fantasyPoints) : 0;
    if (!Array.isArray(p.pointTrendHistory)) p.pointTrendHistory = [];
    p.pointTrendHistory.push(pts);
    if (p.pointTrendHistory.length > 10) {
      p.pointTrendHistory = p.pointTrendHistory.slice(-10);
    }
  }
  for (const inj of simRes.injuries) {
    const p = state.players[inj.playerId];
    if (p) p.injuryWeeks = inj.weeks;
  }
  computePositionRanks(state.players);

  // 5. Score fantasy matchups for this week
  const weekFantasyMatchups = state.fantasySchedule.filter((m) => m.week === currentWeek);
  let userMatch: FantasyMatchup | null = null;
  for (const m of weekFantasyMatchups) {
    const home = state.fantasyTeams[m.homeTeamId];
    const away = state.fantasyTeams[m.awayTeamId];
    m.homeScore = scoreFantasyTeamWeek(home, simRes.weeklyStats);
    m.awayScore = scoreFantasyTeamWeek(away, simRes.weeklyStats);
    m.played = true;

    if (!m.isPlayoff) {
      home.pointsFor = round2(home.pointsFor + m.homeScore);
      home.pointsAgainst = round2(home.pointsAgainst + m.awayScore);
      away.pointsFor = round2(away.pointsFor + m.awayScore);
      away.pointsAgainst = round2(away.pointsAgainst + m.homeScore);

      if (m.homeScore >= m.awayScore) {
        home.wins += 1;
        away.losses += 1;
      } else {
        away.wins += 1;
        home.losses += 1;
      }
    }

    if (m.homeTeamId === state.userTeamId || m.awayTeamId === state.userTeamId) {
      userMatch = m;
    }
  }

  // 6. Build Weekly Digest & Manager XP
  const userTeam = state.fantasyTeams[state.userTeamId];
  const userStarters = STARTER_SLOTS.map((slot) => userTeam.lineup[slot])
    .filter((id): id is string => Boolean(id))
    .map((id) => ({
      player: state.players[id],
      pts: simRes.weeklyStats.get(id)?.fantasyPoints ?? 0,
    }))
    .sort((a, b) => b.pts - a.pts);

  const userScore = userMatch
    ? userMatch.homeTeamId === state.userTeamId
      ? userMatch.homeScore
      : userMatch.awayScore
    : scoreFantasyTeamWeek(userTeam, simRes.weeklyStats);
  const opponentScore = userMatch
    ? userMatch.homeTeamId === state.userTeamId
      ? userMatch.awayScore
      : userMatch.homeScore
    : 0;
  const opponentId = userMatch
    ? userMatch.homeTeamId === state.userTeamId
      ? userMatch.awayTeamId
      : userMatch.homeTeamId
    : null;
  const opponentName = opponentId ? state.fantasyTeams[opponentId].name : 'Playoff Bye / Consolation';
  const won = userMatch ? userScore >= opponentScore : true;

  if (userMatch && !userMatch.isPlayoff) {
    if (won) state.manager.careerWins += 1;
    else state.manager.careerLosses += 1;
  }

  const xpGained = 20 + (won ? 25 : 5) + (userScore >= 135 ? 15 : 0);
  awardManagerXP(state.manager, xpGained);

  const userInjuries = simRes.injuries
    .filter((inj) => userTeam.rosterIds.includes(inj.playerId))
    .map((inj) => `${inj.name} (${inj.weeks}w)`);

  const notes: string[] = [];
  if (currentWeek === 12) {
    notes.push('Winter weather hits northern outdoor stadiums for the fantasy stretch run.');
  }
  if (userScore >= 145) {
    notes.push('Explosive week! Bonus Manager XP awarded for clearing 145+ PPR points.');
  }

  const digest: WeeklyDigest = {
    season: state.season,
    week: currentWeek,
    userScore,
    opponentScore,
    opponentName,
    won,
    mvpName: userStarters[0]?.player.name ?? 'N/A',
    mvpPoints: userStarters[0]?.pts ?? 0,
    dudName: userStarters[userStarters.length - 1]?.player.name ?? 'N/A',
    dudPoints: userStarters[userStarters.length - 1]?.pts ?? 0,
    injuries: userInjuries,
    xpGained,
    notes,
  };
  state.lastWeeklyDigest = digest;

  // 7. Advance week / phase transitions
  if (currentWeek < 14) {
    state.week = currentWeek + 1;
  } else if (currentWeek === 14) {
    state.phase = 'PLAYOFFS';
    state.week = 15;
    state.fantasySchedule.push(...buildQuarterfinalMatchups(state.fantasyTeams));
  } else if (currentWeek === 15) {
    state.week = 16;
    const wk15 = state.fantasySchedule.filter((m) => m.week === 15);
    state.fantasySchedule.push(...buildSemifinalMatchups(state.fantasyTeams, wk15));
  } else if (currentWeek === 16) {
    state.week = 17;
    const wk16 = state.fantasySchedule.filter((m) => m.week === 16);
    state.fantasySchedule.push(...buildChampionshipMatchup(wk16));
  } else {
    finalizeSeasonArchive(state);
    state.phase = 'OFFSEASON_SUMMARY';
  }

  // 8. Generate fresh Top-200 practice/snap info blobs and Major Fantasy News for the new week
  if (state.phase === 'REGULAR_SEASON' || state.phase === 'PLAYOFFS') {
    refreshWeeklyIntelAndNews(state, rng);
  }
  maybeGenerateSparingAITradeOffer(state, rng);

  state.seed = rng.getSeed();
  return state;
}

/**
 * Simulates straight through to the end of the regular season or playoffs for rapid dynasty progression.
 */
export function simulateToEndOfSeason(inputState: DynastyState): DynastyState {
  let state = cloneState(inputState);
  let safety = 0;
  while (
    (state.phase === 'REGULAR_SEASON' || state.phase === 'PLAYOFFS') &&
    safety < 20
  ) {
    // Auto-optimize user lineup if any starter is injured during fast-sim
    autoOptimizeLineupInPlace(state, state.userTeamId);
    state = simulateWeek(state);
    safety++;
  }
  return state;
}

/**
 * Transitions from OFFSEASON_SUMMARY -> Season N+1 ROOKIE_DRAFT:
 * - Archives player stats, tracks priorSeasonTouches (RB 300-touch cliff!)
 * - Ages players, applies development & regression curves
 * - Handles retirements + Hall of Fame inductions
 * - Generates 48 incoming rookies & reverse-standings 3-round Rookie Draft
 */
export function advanceToRookieDraft(inputState: DynastyState): DynastyState {
  const state = cloneState(inputState);
  if (state.phase !== 'OFFSEASON_SUMMARY') return state;

  const rng = new SeededRNG(state.seed);
  const completedSeason = state.season;
  const nextSeason = completedSeason + 1;

  // Determine reverse-standings rookie draft order BEFORE resetting wins/losses
  const standings = sortStandings(Object.values(state.fantasyTeams));
  const rookieOrder = [...standings].reverse().map((t) => t.id);

  // 1. Player aging, development, regression, and retirements
  for (const p of Object.values(state.players)) {
    if (p.retired) continue;

    // Archive completed season
    if (p.seasonStats.gamesPlayed > 0) {
      p.careerHistory.push({ ...p.seasonStats });
    }

    // Track total touches for next year's hidden RB 300-touch workload cliff!
    p.priorSeasonTouches = p.seasonStats.rushAttempts + p.seasonStats.receptions;

    p.age += 1;
    p.experience += 1;
    p.injuryWeeks = 0;
    p.weeklyLogs = [];
    p.scoutingSeed = rng.int(1, 0x7fffffff);

    // Development / regression delta
    let delta = 0;
    if (p.age <= 24) {
      const headroom = Math.max(0, p.potential - p.trueOverall);
      const iqBonus = (p.trueAttributes.iq - 5.5) * 0.04;
      delta = clamp(headroom * rng.range(0.18, 0.45) + iqBonus + rng.gaussian(0, 0.25), -0.3, 0.95);
    } else if (
      (p.position === 'RB' && p.age >= 27) ||
      ((p.position === 'WR' || p.position === 'TE') && p.age >= 30) ||
      (p.position === 'QB' && p.age >= 35)
    ) {
      const cliffSeverity = p.position === 'RB' ? 0.42 : p.position === 'QB' ? 0.25 : 0.32;
      delta = -Math.abs(rng.gaussian(cliffSeverity, 0.22));
    } else {
      delta = rng.gaussian(0, 0.18);
    }

    for (const key of ATTRIBUTE_KEYS) {
      // Speed & agility age slightly faster; IQ improves slightly with age
      const keyBias = key === 'iq' ? 0.08 : key === 'speed' && p.age >= 29 ? -0.15 : 0;
      p.trueAttributes[key] = round1(clamp(p.trueAttributes[key] + delta + keyBias, 1.5, 9.9));
    }
    p.trueOverall = computeTrueOverall(p.position, p.trueAttributes);

    // Retirement check
    const retireAge = p.position === 'QB' ? 38 : p.position === 'RB' ? 31 : 34;
    const retireProb =
      p.age >= retireAge
        ? 0.55 + (p.age - retireAge) * 0.2
        : p.age >= retireAge - 2 && p.trueOverall < 5.4
        ? 0.45
        : 0;

    if (rng.next() < retireProb) {
      p.retired = true;
      if (p.fantasyTeamId) {
        const ft = state.fantasyTeams[p.fantasyTeamId];
        if (ft) {
          ft.rosterIds = ft.rosterIds.filter((id) => id !== p.id);
          ft.taxiIds = ft.taxiIds.filter((id) => id !== p.id);
          for (const slot of STARTER_SLOTS) {
            if (ft.lineup[slot] === p.id) ft.lineup[slot] = null;
          }
        }
        p.fantasyTeamId = null;
      }

      // Check Hall of Fame eligibility
      const totalPts = p.careerHistory.reduce((s, c) => s + c.fantasyPoints, 0);
      const peakPts = p.careerHistory.reduce((m, c) => Math.max(m, c.fantasyPoints), 0);
      const hofThreshold = p.position === 'QB' ? 1400 : p.position === 'TE' ? 800 : 1050;
      if (totalPts >= hofThreshold || peakPts >= 320) {
        const hofEntry: HallOfFameEntry = {
          playerId: p.id,
          name: p.name,
          position: p.position,
          proTeamName: state.proTeams[p.proTeamId]?.name ?? p.proTeamId,
          retiredSeason: completedSeason,
          seasonsPlayed: p.careerHistory.length,
          careerFantasyPoints: round1(totalPts),
          peakSeasonPoints: round1(peakPts),
        };
        state.hallOfFame.unshift(hofEntry);
      }
    } else {
      p.seasonStats = emptySeasonSummary(nextSeason, p.age, p.proTeamId);
      if (Array.isArray(p.pointTrendHistory) && p.pointTrendHistory.length > 4) {
        p.pointTrendHistory = p.pointTrendHistory.slice(-4);
      }
    }
  }

  // 2. Reset & subtly evolve 32 pro teams
  for (const pt of Object.values(state.proTeams)) {
    pt.wins = 0;
    pt.losses = 0;
    pt.pointsFor = 0;
    pt.pointsAgainst = 0;
    pt.oLineRating = round1(clamp(pt.oLineRating + rng.gaussian(0, 0.7), 2.5, 9.6));
    pt.passDefRating = round1(clamp(pt.passDefRating + rng.gaussian(0, 0.7), 2.8, 9.5));
    pt.runDefRating = round1(clamp(pt.runDefRating + rng.gaussian(0, 0.7), 2.8, 9.5));
  }

  // 3. Reset fantasy team season records & promote 3rd-year taxi players
  for (const ft of Object.values(state.fantasyTeams)) {
    ft.wins = 0;
    ft.losses = 0;
    ft.pointsFor = 0;
    ft.pointsAgainst = 0;
    const stillTaxi: string[] = [];
    for (const tid of ft.taxiIds) {
      const p = state.players[tid];
      if (!p || p.retired) continue;
      if (p.experience >= 2) {
        ft.rosterIds.push(tid);
      } else {
        stillTaxi.push(tid);
      }
    }
    ft.taxiIds = stillTaxi;
    // Add a new future year's draft picks
    for (let r = 1; r <= ROOKIE_DRAFT_ROUNDS; r++) {
      ft.futurePicks.push({
        id: `pick_${nextSeason + 2}_r${r}_${ft.id}`,
        season: nextSeason + 2,
        round: r,
        originalOwnerId: ft.id,
        currentOwnerId: ft.id,
      });
    }
  }

  // 4. Generate fresh incoming rookie class
  const rookies = generateRookieClass(state.proTeams, state.players, nextSeason, rng);
  for (const r of rookies) {
    state.players[r.id] = r;
  }

  state.season = nextSeason;
  state.week = 1;
  state.phase = 'ROOKIE_DRAFT';
  state.seasonDraftRecords = [];
  state.lastWeeklyDigest = null;
  state.proSchedule = generateProSchedule(state.proTeams, rng);
  state.fantasySchedule = generateFantasyRegularSchedule(state.fantasyTeams, rng);

  state.draft = {
    type: 'ROOKIE',
    season: nextSeason,
    totalRounds: ROOKIE_DRAFT_ROUNDS,
    order: rookieOrder,
    currentPickIndex: 0,
    picks: [],
    completed: false,
    poolIds: rookies.sort((a, b) => b.trueOverall - a.trueOverall).map((r) => r.id),
    autopickEnabled: false,
    autopickStrategy: 'BALANCED',
    userQueue: [],
  };

  refreshWeeklyIntelAndNews(state, rng);
  state.seed = rng.getSeed();
  return advanceAIDraftPicks(state);
}
