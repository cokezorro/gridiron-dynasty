import {
  Player,
  PlayerWeeklyStat,
  Position,
  ProMatchup,
  ProTeam,
  WeatherSeverity,
} from './types';
import { SeededRNG, clamp, round2 } from './rng';
import { evaluateHiddenModifiers } from './modifiers';
import { getMatchupWeatherSeverity } from './schedule';

/**
 * Standard Full-PPR Fantasy Scoring:
 * Pass: 0.04/yd, +4 TD, -2 INT
 * Rush: 0.10/yd, +6 TD
 * Rec:  +1.0 PPR, 0.10/yd, +6 TD
 * Fumble lost: -2
 */
export function calculatePPRPoints(stat: Omit<PlayerWeeklyStat, 'fantasyPoints'>): number {
  const pts =
    stat.passYards * 0.04 +
    stat.passTDs * 4 -
    stat.interceptions * 2 +
    stat.rushYards * 0.1 +
    stat.rushTDs * 6 +
    stat.receptions * 1.0 +
    stat.recYards * 0.1 +
    stat.recTDs * 6 -
    stat.fumbles * 2;
  return round2(pts);
}

interface TeamDepthChart {
  qb: Player | null;
  rbs: Player[];
  wrs: Player[];
  tes: Player[];
  hasEliteWR1: boolean;
  wr1Id: string | null;
}

function getActiveDepthChart(teamId: string, players: Record<string, Player>): TeamDepthChart {
  const healthy = Object.values(players).filter(
    (p) => !p.retired && p.proTeamId === teamId && p.injuryWeeks === 0
  );
  const byPos = (pos: Position) =>
    healthy
      .filter((p) => p.position === pos)
      .sort((a, b) => b.trueOverall - a.trueOverall);

  const qbs = byPos('QB');
  const rbs = byPos('RB');
  const wrs = byPos('WR');
  const tes = byPos('TE');
  const wr1 = wrs[0] ?? null;

  return {
    qb: qbs[0] ?? null,
    rbs,
    wrs,
    tes,
    hasEliteWR1: wr1 !== null && wr1.trueOverall >= 8.4,
    wr1Id: wr1?.id ?? null,
  };
}

interface TeamSimOutput {
  pointsScored: number;
  stats: Map<string, PlayerWeeklyStat>;
  newInjuries: { playerId: string; name: string; weeks: number }[];
}

function simulateOffense(params: {
  offense: ProTeam;
  defense: ProTeam;
  stadiumTeam: ProTeam;
  weatherSeverity: WeatherSeverity;
  isHome: boolean;
  season: number;
  week: number;
  players: Record<string, Player>;
  rng: SeededRNG;
}): TeamSimOutput {
  const { offense, defense, stadiumTeam, weatherSeverity, isHome, season, week, players, rng } = params;
  const chart = getActiveDepthChart(offense.id, players);
  const stats = new Map<string, PlayerWeeklyStat>();
  const newInjuries: { playerId: string; name: string; weeks: number }[] = [];

  const passDefFactor = 1.0 + (6.0 - defense.passDefRating) * 0.032;
  const runDefFactor = 1.0 + (6.0 - defense.runDefRating) * 0.032;
  const homeBoost = isHome ? 1.03 : 0.98;

  // Scheme base play-calling split
  let basePassTargets = 31;
  let baseRushAttempts = 24;
  if (offense.scheme === 'AIR_RAID') {
    basePassTargets = 37;
    baseRushAttempts = 19;
  } else if (offense.scheme === 'WEST_COAST') {
    basePassTargets = 34;
    baseRushAttempts = 22;
  } else if (offense.scheme === 'GROUND_POUND') {
    basePassTargets = 25;
    baseRushAttempts = 30;
  } else if (offense.scheme === 'PLAY_ACTION') {
    basePassTargets = 29;
    baseRushAttempts = 26;
  }

  // Probabilistic Game-Day Weather hidden modifier:
  // Very bad weather (SEVERE) or rough weather (ADVERSE) USUALLY lowers offensive output and shifts
  // play-calling away from the pass attack toward the run—but NOT ALWAYS (~22% chance in SEVERE and
  // ~30% in ADVERSE that an offense defies the elements or defenders slip for big plays).
  let weatherPassTargetMult = 1.0;
  let weatherRushCallMult = 1.0;
  let weatherPassEffMult = 1.0;
  if (weatherSeverity === 'SEVERE') {
    const defiedWeather = rng.next() < 0.22;
    if (!defiedWeather) {
      weatherPassTargetMult = clamp(rng.gaussian(0.77, 0.06), 0.65, 0.88);
      weatherRushCallMult = clamp(rng.gaussian(1.06, 0.05), 0.95, 1.16);
      weatherPassEffMult = clamp(rng.gaussian(0.87, 0.05), 0.76, 0.95);
    } else {
      // "Snow-globe shootout" / defenders slipping on wet turf
      weatherPassTargetMult = clamp(rng.gaussian(1.03, 0.06), 0.94, 1.15);
      weatherRushCallMult = clamp(rng.gaussian(1.02, 0.05), 0.94, 1.12);
      weatherPassEffMult = clamp(rng.gaussian(1.06, 0.06), 0.96, 1.18);
    }
  } else if (weatherSeverity === 'ADVERSE') {
    const defiedWeather = rng.next() < 0.30;
    if (!defiedWeather) {
      weatherPassTargetMult = clamp(rng.gaussian(0.89, 0.05), 0.80, 0.97);
      weatherRushCallMult = clamp(rng.gaussian(1.04, 0.04), 0.96, 1.12);
      weatherPassEffMult = clamp(rng.gaussian(0.93, 0.04), 0.85, 0.99);
    } else {
      weatherPassTargetMult = clamp(rng.gaussian(1.02, 0.05), 0.94, 1.10);
      weatherPassEffMult = clamp(rng.gaussian(1.03, 0.04), 0.96, 1.12);
    }
  }

  // Team game-script tempo variance
  const tempoMult = clamp(rng.gaussian(1.0, 0.11), 0.72, 1.32);
  const totalPassTargets = Math.max(15, Math.round(basePassTargets * tempoMult * weatherPassTargetMult));
  const totalRushCalls = Math.max(14, Math.round(baseRushAttempts * tempoMult * weatherRushCallMult));

  // Build receiving candidate weights (WR1, WR2, WR3, TE1, TE2, RB1, RB2)
  const receivers: { player: Player; baseShare: number }[] = [];
  if (chart.wrs[0]) receivers.push({ player: chart.wrs[0], baseShare: 0.26 });
  if (chart.wrs[1]) receivers.push({ player: chart.wrs[1], baseShare: 0.19 });
  if (chart.wrs[2]) receivers.push({ player: chart.wrs[2], baseShare: 0.12 });
  if (chart.tes[0]) receivers.push({ player: chart.tes[0], baseShare: 0.17 });
  if (chart.tes[1]) receivers.push({ player: chart.tes[1], baseShare: 0.06 });
  if (chart.rbs[0]) receivers.push({ player: chart.rbs[0], baseShare: 0.12 });
  if (chart.rbs[1]) receivers.push({ player: chart.rbs[1], baseShare: 0.08 });

  // Evaluate hidden modifiers once per active player
  const modCache = new Map<string, ReturnType<typeof evaluateHiddenModifiers>>();
  const getMod = (p: Player) => {
    let m = modCache.get(p.id);
    if (!m) {
      m = evaluateHiddenModifiers({
        player: p,
        team: offense,
        stadiumTeam,
        week,
        teamHasEliteWR1: chart.hasEliteWR1,
        isTeamWR1: chart.wr1Id === p.id,
        weatherSeverity,
      });
      modCache.set(p.id, m);
    }
    return m;
  };

  const qb = chart.qb;
  const qbMod = qb ? getMod(qb) : null;
  const qbIntelMult = qb?.weeklyIntel?.performanceMultiplier ?? 1.0;
  const qbQuality = qb ? qb.trueOverall : 4.5;
  const qbAccuracy = qb ? qb.trueAttributes.accuracy : 5.0;
  const qbArm = qb ? qb.trueAttributes.armStrength : 5.0;
  const qbEff =
    (qbMod?.efficiencyMult ?? 1.0) *
    weatherPassEffMult *
    clamp(0.5 + qbIntelMult * 0.5, 0.78, 1.16) *
    passDefFactor *
    homeBoost;

  // Allocate targets dynamically using player routeRunning + hidden volumeMult + practice/snap/trend intel
  const weightedReceivers = receivers.map(({ player, baseShare }) => {
    const mod = getMod(player);
    const intelMult = player.weeklyIntel?.performanceMultiplier ?? 1.0;
    const skillPull = 0.72 + (player.trueAttributes.routeRunning / 10) * 0.42 + (player.trueOverall / 10) * 0.2;
    const weeklyNoise = clamp(rng.gaussian(1.0, mod.varianceStdDev * 0.6), 0.45, 1.7);
    return {
      player,
      mod,
      intelMult,
      weight: Math.max(0.02, baseShare * skillPull * mod.volumeMult * intelMult * weeklyNoise),
    };
  });
  const totalWeight = weightedReceivers.reduce((sum, r) => sum + r.weight, 0) || 1;

  let teamPassYards = 0;
  let teamPassTDs = 0;
  let teamRushTDs = 0;

  const ensureStat = (p: Player): Omit<PlayerWeeklyStat, 'fantasyPoints'> => {
    const existing = stats.get(p.id);
    if (existing) {
      const { fantasyPoints: _fp, ...rest } = existing;
      return rest;
    }
    return {
      season,
      week,
      proTeamId: offense.id,
      opponentId: defense.id,
      isHome,
      injured: false,
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
    };
  };

  // Simulate passing production per receiver (directly feeds QB totals -> true stacking correlation!)
  for (const r of weightedReceivers) {
    const targets = Math.max(0, Math.round((r.weight / totalWeight) * totalPassTargets));
    if (targets === 0) continue;

    const catchBase =
      r.player.position === 'RB'
        ? 0.68
        : r.player.position === 'TE'
        ? 0.62
        : 0.55;
    const catchProb = clamp(
      catchBase +
        (r.player.trueAttributes.hands - 6.0) * 0.024 +
        (qbAccuracy - 6.0) * 0.02 +
        (r.mod.efficiencyMult - 1.0) * 0.14 +
        (r.intelMult - 1.0) * 0.08,
      0.36,
      0.84
    );
    let receptions = 0;
    for (let t = 0; t < targets; t++) {
      if (rng.next() < catchProb) receptions++;
    }

    const baseYpr =
      r.player.position === 'WR'
        ? 10.6 + (r.player.trueAttributes.speed - 6.0) * 0.72 + (qbArm - 6.0) * 0.3
        : r.player.position === 'TE'
        ? 8.9 + (r.player.trueAttributes.speed - 6.0) * 0.45
        : 6.6 + (r.player.trueAttributes.agility - 6.0) * 0.4;

    const weeklySpark = clamp(rng.gaussian(1.0, r.mod.varianceStdDev * 0.7), 0.45, 1.85);
    const intelEff = clamp(0.6 + r.intelMult * 0.4, 0.75, 1.18);
    const recYards =
      receptions > 0
        ? Math.max(
            receptions,
            Math.round(receptions * baseYpr * r.mod.efficiencyMult * intelEff * qbEff * weeklySpark)
          )
        : 0;

    // Receiving TD probability scales with yards, red-zone traits, and hidden tdMult
    const tdRatePerRec = clamp(
      (0.044 + (r.player.trueOverall - 6.0) * 0.0065 + (qbQuality - 6.0) * 0.004) *
        r.mod.tdMult *
        intelEff *
        (qbMod?.tdMult ?? 1.0),
      0.012,
      0.19
    );
    let recTDs = 0;
    for (let c = 0; c < receptions; c++) {
      if (rng.next() < tdRatePerRec) recTDs++;
    }
    recTDs = Math.min(recTDs, 3);

    const fumble = receptions > 0 && rng.next() < 0.016 ? 1 : 0;

    teamPassYards += recYards;
    teamPassTDs += recTDs;

    const s = ensureStat(r.player);
    s.targets += targets;
    s.receptions += receptions;
    s.recYards += recYards;
    s.recTDs += recTDs;
    s.fumbles += fumble;
    stats.set(r.player.id, { ...s, fantasyPoints: calculatePPRPoints(s) });
  }

  // Simulate rushing production (RBs + mobile QB scrambles)
  const rushers: { player: Player; baseShare: number }[] = [];
  if (chart.rbs[0]) rushers.push({ player: chart.rbs[0], baseShare: 0.60 });
  if (chart.rbs[1]) rushers.push({ player: chart.rbs[1], baseShare: 0.27 });
  if (chart.rbs[2]) rushers.push({ player: chart.rbs[2], baseShare: 0.07 });
  if (qb && qb.trueAttributes.speed >= 6.5) {
    const mobileBoost = qb.trueAttributes.speed >= 8.2 ? 0.2 : 0.1;
    rushers.push({ player: qb, baseShare: mobileBoost });
  } else if (qb) {
    rushers.push({ player: qb, baseShare: 0.05 });
  }

  const weightedRushers = rushers.map(({ player, baseShare }) => {
    const mod = getMod(player);
    const intelMult = player.weeklyIntel?.performanceMultiplier ?? 1.0;
    const skillPull = player.position === 'QB' ? 1.0 : 0.78 + (player.trueOverall / 10) * 0.35;
    const weeklyNoise = clamp(rng.gaussian(1.0, mod.varianceStdDev * 0.5), 0.55, 1.55);
    return {
      player,
      mod,
      intelMult,
      weight: Math.max(0.02, baseShare * skillPull * mod.volumeMult * intelMult * weeklyNoise),
    };
  });
  const totalRushWeight = weightedRushers.reduce((sum, r) => sum + r.weight, 0) || 1;

  for (const r of weightedRushers) {
    const attempts = Math.max(1, Math.round((r.weight / totalRushWeight) * totalRushCalls));
    const a = r.player.trueAttributes;
    const baseYpc =
      r.player.position === 'QB'
        ? 4.1 + (a.speed - 6.0) * 0.4 + (a.agility - 6.0) * 0.2
        : 3.75 + (a.vision - 6.0) * 0.22 + (a.speed - 6.0) * 0.14 + (a.agility - 6.0) * 0.14;

    const weeklySpark = clamp(rng.gaussian(1.0, r.mod.varianceStdDev * 0.65), 0.5, 1.75);
    const intelEff = clamp(0.6 + r.intelMult * 0.4, 0.75, 1.18);
    const rushYards = Math.max(
      -3,
      Math.round(attempts * baseYpc * r.mod.efficiencyMult * intelEff * runDefFactor * homeBoost * weeklySpark)
    );

    const tdRatePerCarry = clamp(
      (0.022 + (a.power - 6.0) * 0.0042 + (r.player.trueOverall - 6.0) * 0.0032) *
        r.mod.tdMult *
        intelEff *
        runDefFactor,
      0.006,
      0.10
    );
    let rushTDs = 0;
    for (let c = 0; c < attempts; c++) {
      if (rng.next() < tdRatePerCarry) rushTDs++;
    }
    rushTDs = Math.min(rushTDs, 3);
    const fumble = attempts >= 5 && rng.next() < 0.018 ? 1 : 0;

    teamRushTDs += rushTDs;

    const s = ensureStat(r.player);
    s.rushAttempts += attempts;
    s.rushYards += rushYards;
    s.rushTDs += rushTDs;
    s.fumbles += fumble;
    stats.set(r.player.id, { ...s, fantasyPoints: calculatePPRPoints(s) });
  }

  // Finalize QB passing box score
  if (qb) {
    const s = ensureStat(qb);
    const intRate = clamp(
      0.024 - (qbAccuracy - 6.0) * 0.003 - (qb.trueAttributes.iq - 6.0) * 0.002 + (defense.passDefRating - 6.0) * 0.0025,
      0.006,
      0.055
    );
    let ints = 0;
    for (let i = 0; i < totalPassTargets; i++) {
      if (rng.next() < intRate) ints++;
    }
    ints = Math.min(ints, 4);
    s.passYards += teamPassYards;
    s.passTDs += teamPassTDs;
    s.interceptions += ints;
    stats.set(qb.id, { ...s, fantasyPoints: calculatePPRPoints(s) });
  }

  // Roll weekly injury risks for active participants (Partial/DNP practice increases tweak risk)
  for (const [playerId, stat] of stats.entries()) {
    const player = players[playerId];
    if (!player) continue;
    const mod = getMod(player);
    const pracStatus = player.weeklyIntel?.practiceStatus ?? 'FULL';
    const pracRiskMult = pracStatus === 'DNP' ? 1.45 : pracStatus === 'LIMITED' ? 1.22 : 0.95;
    const baseRisk = player.position === 'RB' ? 0.032 : player.position === 'QB' ? 0.014 : 0.022;
    const durFactor = clamp(1.28 - (player.trueAttributes.durability / 10) * 0.65, 0.55, 1.45);
    const injuryProb = baseRisk * durFactor * mod.injuryRiskMult * pracRiskMult;
    if (rng.next() < injuryProb) {
      const weeksOut = rng.next() < 0.6 ? rng.int(1, 2) : rng.next() < 0.85 ? rng.int(3, 5) : rng.int(6, 10);
      newInjuries.push({ playerId, name: player.name, weeks: weeksOut });
      stat.injured = true;
    }
  }

  // Convert team offensive production into realistic pro football score
  const fieldGoals = rng.int(0, 3);
  const pointsScored = (teamPassTDs + teamRushTDs) * 7 + fieldGoals * 3;

  return { pointsScored, stats, newInjuries };
}

export interface WeekProSimResult {
  weeklyStats: Map<string, PlayerWeeklyStat>;
  injuries: { playerId: string; name: string; weeks: number }[];
}

export function simulateProWeek(params: {
  matchups: ProMatchup[];
  proTeams: Record<string, ProTeam>;
  players: Record<string, Player>;
  season: number;
  week: number;
  rng: SeededRNG;
}): WeekProSimResult {
  const { matchups, proTeams, players, season, week, rng } = params;
  const weeklyStats = new Map<string, PlayerWeeklyStat>();
  const injuries: { playerId: string; name: string; weeks: number }[] = [];

  for (const m of matchups) {
    const home = proTeams[m.homeTeamId];
    const away = proTeams[m.awayTeamId];
    if (!home || !away) continue;
    const weatherSeverity = getMatchupWeatherSeverity(m);

    const homeRes = simulateOffense({
      offense: home,
      defense: away,
      stadiumTeam: home,
      weatherSeverity,
      isHome: true,
      season,
      week,
      players,
      rng,
    });
    const awayRes = simulateOffense({
      offense: away,
      defense: home,
      stadiumTeam: home,
      weatherSeverity,
      isHome: false,
      season,
      week,
      players,
      rng,
    });

    // Avoid ties in pro standings by giving a quick OT FG if knotted
    let hScore = homeRes.pointsScored;
    let aScore = awayRes.pointsScored;
    if (hScore === aScore) {
      if (rng.next() < 0.5) hScore += 3;
      else aScore += 3;
    }

    m.homeScore = hScore;
    m.awayScore = aScore;
    m.played = true;

    home.pointsFor += hScore;
    home.pointsAgainst += aScore;
    away.pointsFor += aScore;
    away.pointsAgainst += hScore;
    if (hScore > aScore) {
      home.wins += 1;
      away.losses += 1;
    } else {
      away.wins += 1;
      home.losses += 1;
    }

    for (const [pid, st] of homeRes.stats.entries()) weeklyStats.set(pid, st);
    for (const [pid, st] of awayRes.stats.entries()) weeklyStats.set(pid, st);
    injuries.push(...homeRes.newInjuries, ...awayRes.newInjuries);
  }

  return { weeklyStats, injuries };
}
