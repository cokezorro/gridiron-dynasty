import {
  DynastyState,
  Player,
  PlayerWeeklyIntel,
  Position,
  PracticeStatus,
  ProTeam,
  TrendDirection,
  WeeklyNewsItem,
} from './types';
import { SeededRNG, clamp, round1, round2 } from './rng';
import { evaluateHiddenModifiers } from './modifiers';
import { getMatchupWeatherSeverity } from './schedule';

export const TOP_FANTASY_INTEL_CUTOFF = 200;

export function createDefaultIntel(week = 1): PlayerWeeklyIntel {
  return {
    week,
    fantasyRank: 999,
    isTop200: false,
    practiceStatus: 'FULL',
    snapShare: 50,
    snapDelta: 0,
    trendDirection: 'STEADY',
    trendMomentum: 0,
    performanceMultiplier: 1.0,
    headline: 'Outside Top 200 — No Advanced Intel',
    blurbs: [
      'No advanced practice or snap-share news available because this player is ranked outside the Top 200 Fantasy Players.',
    ],
  };
}

/**
 * Generates an initial 4-point baseline trend (preseason / prior-season form)
 * so every player has a meaningful Trending Points Chart from Week 1 onward.
 */
export function seedInitialPointTrend(
  pos: Position,
  trueOverall: number,
  starterBias: boolean,
  rng: SeededRNG
): number[] {
  const posBase =
    pos === 'QB' ? 15.5 : pos === 'RB' ? 12.0 : pos === 'WR' ? 12.8 : 9.4;
  const roleFactor = starterBias ? 1.0 : 0.52;
  const skillFactor = 0.55 + (trueOverall / 10) * 0.75;
  const baseline = posBase * roleFactor * skillFactor;

  const history: number[] = [];
  let momentum = rng.gaussian(0, 0.14);
  for (let i = 0; i < 4; i++) {
    momentum = clamp(momentum * 0.65 + rng.gaussian(0, 0.14), -0.35, 0.35);
    const val = Math.max(0.8, round1(baseline * (1 + momentum)));
    history.push(val);
  }
  return history;
}

function classifyTrend(momentum: number): TrendDirection {
  if (momentum >= 0.16) return 'SURGING';
  if (momentum >= 0.06) return 'RISING';
  if (momentum <= -0.16) return 'SLUMPING';
  if (momentum <= -0.06) return 'COOLING';
  return 'STEADY';
}

/**
 * Ranks all active players 1..N by fantasy standing (blending current season PPG,
 * recent 3-week point trend, and depth-chart/overall projection).
 */
export function rankFantasyPlayers(
  players: Record<string, Player>,
  proTeams: Record<string, ProTeam>
): Player[] {
  const depthRank = new Map<string, number>();
  for (const teamId of Object.keys(proTeams)) {
    for (const pos of ['QB', 'RB', 'WR', 'TE'] as const) {
      const group = Object.values(players)
        .filter((p) => !p.retired && p.proTeamId === teamId && p.position === pos)
        .sort((a, b) => b.trueOverall - a.trueOverall);
      group.forEach((p, idx) => depthRank.set(p.id, idx + 1));
    }
  }

  const posMult: Record<Position, number> = {
    WR: 1.08,
    RB: 1.05,
    QB: 0.96,
    TE: 0.94,
  };

  const scorePlayer = (p: Player): number => {
    const dRank = depthRank.get(p.id) ?? 3;
    const starterScore =
      p.position === 'QB'
        ? dRank === 1
          ? 24
          : -14
        : p.position === 'TE'
        ? dRank === 1
          ? 18
          : -6
        : dRank === 1
        ? 24
        : dRank === 2
        ? 14
        : 2;

    const gp = p.seasonStats.gamesPlayed;
    const ppg = gp > 0 ? p.seasonStats.fantasyPoints / gp : 0;
    const recent3 =
      p.pointTrendHistory.length > 0
        ? p.pointTrendHistory.slice(-3).reduce((a, b) => a + b, 0) /
          Math.min(3, p.pointTrendHistory.length)
        : 0;

    const projWeight = gp === 0 ? 1.0 : gp < 4 ? 0.55 : 0.25;
    const prodWeight = 1.0 - projWeight;

    const projectedPpg = (p.trueOverall * 2.1 + starterScore * 0.35) * posMult[p.position];
    const actualSignal = ppg * 0.65 + recent3 * 0.35;

    return projectedPpg * projWeight + actualSignal * 1.45 * prodWeight;
  };

  return Object.values(players)
    .filter((p) => !p.retired)
    .sort((a, b) => scorePlayer(b) - scorePlayer(a));
}

/**
 * Generates nuanced, observational beat-reporter notebook entries that require
 * reading comprehension rather than spelling out gamey modifiers or arrows.
 */
function buildBeatReporterObservation(
  tags: string[],
  player: Player,
  team: ProTeam,
  stadiumTeam: ProTeam,
  rng: SeededRNG,
  weatherNote?: string
): { blurb: string; category: WeeklyNewsItem['category']; headline: string } | null {
  if (tags.includes('WEST_COAST_PPR_MACHINE') || tags.includes('WEST_COAST_PASS_RB')) {
    return {
      category: 'META_HINT',
      headline: `Notes from ${team.city}'s Thursday Passing Install`,
      blurb: rng.pick([
        `During the open 11-on-11 window Thursday, the ball came out on the back foot of the quarterback's drop on nearly every snap. ${player.name} worked the space between the hashmarks on option routes and flat releases, rarely pushing deeper than eight yards.`,
        `Wednesday's script leaned on bunch formations and quick-rhythm choice routes over the middle; ${player.name} stayed on the grass for the full first-team series and acted as the hot read whenever the scout team showed pressure.`,
      ]),
    };
  }
  if (tags.includes('AIR_RAID_SPEED_WR') || tags.includes('AIR_RAID_CANNON_QB')) {
    return {
      category: 'META_HINT',
      headline: `${team.mascot} Stretching the Field in Four-Wide Sets`,
      blurb: rng.pick([
        `${team.city} kept four receivers on the field for most of Thursday's team period. ${player.name} aligned outside the numbers and worked vertical stems and deep comebacks against two-high shells.`,
        `The offense spent an extended segment repping shot plays off play-fake on Wednesday, with ${player.name} working past the safeties twice during the media viewing window.`,
      ]),
    };
  }
  if (tags.includes('RB_WORKLOAD_CLIFF')) {
    return {
      category: 'PRACTICE',
      headline: `Mid-Week Rep Management in ${team.city}'s Backfield`,
      blurb: rng.pick([
        `${player.name} wore a non-contact jersey during Wednesday's blitz-pickup drill and ceded the second team series to the younger backs, which the position coach termed standard mid-week maintenance after last year's heavy carry load.`,
        `Between reps on the agility bags, ${player.name} worked on the side with a trainer while the reserve backs handled the up-tempo two-minute drill at the end of practice.`,
      ]),
    };
  }
  if (tags.includes('WR1_COVERAGE_GRAVITY')) {
    return {
      category: 'META_HINT',
      headline: `Red-Zone Observations from ${team.mascot} Camp`,
      blurb: rng.pick([
        `With the scout-team defense rolling a safety over the top of the primary boundary receiver during red-zone periods, ${player.name} worked against single coverage underneath and caught a pair of scores inside the ten.`,
        `Defensive looks in Thursday's situational drill bracketed the X-receiver on third down, leaving the middle of the field uncluttered for ${player.name} on crossing patterns.`,
      ]),
    };
  }
  if (tags.includes('ELITE_OLINE_LANES')) {
    return {
      category: 'META_HINT',
      headline: `Trench Notes from ${team.city}'s Padded Session`,
      blurb: `Up front, ${team.city}'s starting five moved the defensive front two yards off the ball during Wednesday's inside-run period; ${player.name} reached the linebackers untouched on three consecutive duo calls.`,
    };
  }
  if (tags.includes('POCKET_PRESSURE_PENALTY') || tags.includes('POROUS_OLINE_STUFF')) {
    return {
      category: 'META_HINT',
      headline: `Mixed Results in ${team.city}'s Protection Drills`,
      blurb: rng.pick([
        `The defensive front won several reps against ${team.city}'s interior protection during Thursday's third-down period, forcing the quarterback off his spot early and cutting off ${player.name}'s developing routes.`,
        `Interior penetration through the A-gap disrupted Wednesday's inside-run install on back-to-back snaps, forcing ${player.name} to bounce laterally before getting downhill.`,
      ]),
    };
  }
  if (tags.includes('ROOKIE_LATE_BREAKOUT')) {
    return {
      category: 'META_HINT',
      headline: `First-Year ${player.position} ${player.name} Settling In with Starters`,
      blurb: rng.pick([
        `For the first time this fall, ${player.name} stayed on the field when the first unit shifted into no-huddle at the end of practice, handling pre-snap motion adjustments without looking to the sideline.`,
        `Asked about the rookie on Tuesday, the offensive coordinator noted that he has stopped hesitating at the top of his stem against disguised coverages and is playing at full speed.`,
      ]),
    };
  }
  if (tags.includes('WINTER_PASS_PENALTY') || tags.includes('WINTER_DEEP_THREAT_CHILL')) {
    const wxText = weatherNote ? ` (${weatherNote} forecast)` : '';
    return {
      category: 'WEATHER',
      headline: `Friday Walkthrough & Weather Desk in ${stadiumTeam.city}`,
      blurb: `With ${stadiumTeam.city}${wxText} on the weekend slate, stiff gusts cut across the practice field on Friday afternoon; several deep out-routes hung up in the wind, and the offense shifted to condensed personnel for the final twenty minutes.`,
    };
  }
  if (tags.includes('WINTER_POWER_RB') || tags.includes('WINTER_TE_SAFETY_VALVE')) {
    const wxText = weatherNote ? ` (${weatherNote})` : '';
    return {
      category: 'WEATHER',
      headline: `Heavy Personnel Featured in ${team.city}'s Weather Script`,
      blurb: `With rough conditions forecast in ${stadiumTeam.city}${wxText}, Friday's walk-through leaned on two-tight-end groupings, tackle-to-tackle downhill runs, and quick flat checkdowns involving ${player.name}.`,
    };
  }
  if (tags.includes('DOME_PLAYOFF_TRACK')) {
    return {
      category: 'WEATHER',
      headline: `${team.mascot} Practicing on Indoor Turf Ahead of ${stadiumTeam.city} Trip`,
      blurb: `Heading under the roof in ${stadiumTeam.city} this weekend, the offense practiced indoors on Thursday and kept the full five-wide route tree in the call sheet for ${player.name}.`,
    };
  }
  if (
    tags.includes('GROUND_POUND_BRUISER') ||
    tags.includes('PLAY_ACTION_TE_SEAM') ||
    tags.includes('PLAY_ACTION_IQ_QB')
  ) {
    return {
      category: 'META_HINT',
      headline: `Situational Install Notes from ${team.city}`,
      blurb: `Thursday's red-zone period featured repeated heavy-personnel play-action boots and downhill gap runs, with ${player.name} remaining on the grass through every goal-line grouping.`,
    };
  }
  return null;
}

/**
 * Updates weekly practice reports, snap shares, momentum trends, Top-200 info blobs,
 * and Major Fantasy News of the Week for the upcoming `state.week`.
 *
 * Official injury & practice participation reports (FULL / PARTIAL / DNP / OUT) remain
 * 100% visible, while beat-reporter observations are written as nuanced sideline prose
 * without obvious green/red "up/down" labels.
 */
export function refreshWeeklyIntelAndNews(state: DynastyState, rng: SeededRNG): void {
  const week = state.week;
  const ranked = rankFantasyPlayers(state.players, state.proTeams);

  const weekMatchups = state.proSchedule.filter((m) => m.week === week);
  const stadiumByTeam = new Map<string, ProTeam>();
  const matchupByTeam = new Map<string, (typeof weekMatchups)[number]>();
  for (const m of weekMatchups) {
    matchupByTeam.set(m.homeTeamId, m);
    matchupByTeam.set(m.awayTeamId, m);
    const home = state.proTeams[m.homeTeamId];
    if (home) {
      stadiumByTeam.set(m.homeTeamId, home);
      stadiumByTeam.set(m.awayTeamId, home);
    }
  }

  const depthRankByPlayer = new Map<string, number>();
  const teamHasEliteWR1 = new Map<string, boolean>();
  const teamWR1Id = new Map<string, string>();

  for (const teamId of Object.keys(state.proTeams)) {
    for (const pos of ['QB', 'RB', 'WR', 'TE'] as const) {
      const group = Object.values(state.players)
        .filter((p) => !p.retired && p.proTeamId === teamId && p.position === pos)
        .sort((a, b) => b.trueOverall - a.trueOverall);
      group.forEach((p, idx) => depthRankByPlayer.set(p.id, idx + 1));
      if (pos === 'WR' && group[0]) {
        teamWR1Id.set(teamId, group[0].id);
        teamHasEliteWR1.set(teamId, group[0].trueOverall >= 8.4);
      }
    }
  }

  const candidateNews: { priority: number; item: WeeklyNewsItem }[] = [];

  ranked.forEach((player, idx) => {
    const fantasyRank = idx + 1;
    const isTop200 = fantasyRank <= TOP_FANTASY_INTEL_CUTOFF;
    const team = state.proTeams[player.proTeamId];
    const stadiumTeam = stadiumByTeam.get(player.proTeamId) ?? team;
    const depthRank = depthRankByPlayer.get(player.id) ?? 3;

    // 1. Update point trend momentum (autoregressive trend + recent performance delta + RNG)
    const prevMomentum = player.weeklyIntel?.trendMomentum ?? 0;
    const history = player.pointTrendHistory ?? [];
    let recentSignal = 0;
    if (history.length >= 2) {
      const last = history[history.length - 1];
      const avg = history.reduce((a, b) => a + b, 0) / history.length;
      if (avg > 0) {
        recentSignal = clamp((last - avg) / Math.max(8, avg), -0.45, 0.45);
      }
    }
    const trendMomentum = round2(
      clamp(prevMomentum * 0.58 + recentSignal * 0.28 + rng.gaussian(0, 0.11), -0.32, 0.32)
    );
    const trendDirection = classifyTrend(trendMomentum);

    // 2. Roll Practice Status (FULL / LIMITED / DNP)
    let practiceStatus: PracticeStatus = 'FULL';
    if (player.injuryWeeks > 0) {
      practiceStatus = 'DNP';
    } else {
      const workloadWear =
        player.position === 'RB' && player.priorSeasonTouches >= 300 && player.age >= 26
          ? 0.18
          : 0;
      const durPenalty = Math.max(0, (7.0 - player.trueAttributes.durability) * 0.025);
      const ageWear = player.age >= 29 ? 0.05 : 0;
      const limitedProb = clamp(0.12 + workloadWear + durPenalty + ageWear, 0.06, 0.38);
      const dnpRestProb = clamp(0.025 + workloadWear * 0.35 + (player.age >= 30 ? 0.025 : 0), 0.01, 0.09);

      const roll = rng.next();
      if (roll < dnpRestProb) {
        practiceStatus = 'DNP';
      } else if (roll < dnpRestProb + limitedProb) {
        practiceStatus = 'LIMITED';
      } else {
        practiceStatus = 'FULL';
      }
    }

    // 3. Compute Snap Share % & Week-over-Week Delta
    let baseSnap = 50;
    if (player.position === 'QB') {
      baseSnap = depthRank === 1 ? 97 : 6;
    } else if (player.position === 'RB') {
      baseSnap = depthRank === 1 ? 68 : depthRank === 2 ? 34 : 14;
    } else if (player.position === 'WR') {
      baseSnap = depthRank === 1 ? 88 : depthRank === 2 ? 76 : depthRank === 3 ? 54 : 24;
    } else {
      baseSnap = depthRank === 1 ? 82 : 34;
    }

    const practiceSnapMod =
      practiceStatus === 'FULL' ? 3 : practiceStatus === 'LIMITED' ? -11 : player.injuryWeeks > 0 ? -baseSnap : -24;
    const momentumSnapMod = Math.round(trendMomentum * 26);
    const prevSnap = player.weeklyIntel?.snapShare ?? baseSnap;
    const rawSnap =
      player.injuryWeeks > 0
        ? 0
        : Math.round(clamp(baseSnap + practiceSnapMod + momentumSnapMod + rng.int(-4, 4), 5, 99));
    const snapDelta = player.injuryWeeks > 0 ? -prevSnap : clamp(rawSnap - prevSnap, -28, 28);

    // 4. Compute combined gameplay performanceMultiplier (directly used in simulator.ts)
    const practicePerfMult =
      practiceStatus === 'FULL'
        ? 1.05
        : practiceStatus === 'LIMITED'
        ? 0.87
        : player.injuryWeeks > 0
        ? 0
        : 0.68;
    const snapPerfMult = clamp(1.0 + (snapDelta / 100) * 0.45, 0.88, 1.14);
    const trendPerfMult = clamp(1.0 + trendMomentum * 0.42, 0.85, 1.18);
    const performanceMultiplier = round2(
      clamp(practicePerfMult * snapPerfMult * trendPerfMult, 0.55, 1.32)
    );

    // 5. Build Info Blob (Top 200 vs Outside Top 200)
    if (!isTop200) {
      player.weeklyIntel = {
        week,
        fantasyRank,
        isTop200: false,
        practiceStatus,
        snapShare: rawSnap,
        snapDelta,
        trendDirection,
        trendMomentum,
        performanceMultiplier,
        headline: `Ranked #${fantasyRank} (Outside Top 200)`,
        blurbs: [
          `No advanced practice, snap-share, or beat-writer intel available because ${player.name} is currently ranked #${fantasyRank} (outside the Top 200 Fantasy Players).`,
        ],
      };
      return;
    }

    // Top 200 player:
    // Line 1: Official Injury & Practice Report (100% visible, factual Wed/Thu/Fri participation)
    // Line 2+: Nuanced beat-reporter notebook observations (no obvious up/down labels or % multipliers)
    const blurbs: string[] = [];
    let headline = `${practiceStatus === 'FULL' ? 'Full Practice (FP)' : practiceStatus === 'LIMITED' ? 'Partial Practice (LP)' : 'Did Not Practice (DNP)'} · ${rawSnap}% Snaps`;

    if (player.injuryWeeks > 0) {
      headline = `OUT (${player.injuryWeeks}w) · DNP`;
      blurbs.push(
        `Official Practice Report: OUT (${player.injuryWeeks}w remaining) — Wed: DNP · Thu: DNP · Fri: DNP. Working inside with the rehab staff.`
      );
    } else if (practiceStatus === 'FULL') {
      blurbs.push(
        rng.pick([
          `Official Practice Report: FULL (FP) — Wed: Full · Thu: Full · Fri: Full. Participated in all individual and 11-on-11 team periods without restriction.`,
          `Official Practice Report: FULL (FP) — Listed as a full participant across all three open sessions this week.`,
        ])
      );
    } else if (practiceStatus === 'LIMITED') {
      headline = `Partial Practice (LP) · ${rawSnap}% Snaps`;
      blurbs.push(
        rng.pick([
          `Official Practice Report: PARTIAL (LP) — Wed: Limited · Thu: Limited · Fri: Limited. Went through individual positional drills before stepping out during full-speed team periods.`,
          `Official Practice Report: PARTIAL (LP) — Held to partial reps in padded sessions; trainers wrapped his lower leg after individual period on Thursday.`,
        ])
      );
    } else {
      headline = `Did Not Practice (DNP) · Game-Time Call`;
      blurbs.push(
        `Official Practice Report: DNP — Did not participate during the mid-week media viewing windows due to tightness; head coach called him a game-time decision on Friday.`
      );
    }

    // Beat reporter's rotational & snap observation (requires reading rather than "+12% SURGING")
    if (snapDelta >= 6 || trendDirection === 'SURGING') {
      blurbs.push(
        rng.pick([
          `Beat Notebook: Stayed on the field with the first-team huddle when the coordinator shifted into two-minute and third-and-medium packages Thursday—situations where the staff had rotated personnel earlier in the month.`,
          `Beat Notebook: Took the opening reps in every 11-on-11 period open to reporters this week and lingered after the horn with the quarterback for red-zone timing work.`,
          `Beat Notebook: Featured early in Wednesday's scripted install, logging touches on four of the first seven snaps of team period while the second unit watched from the sideline.`,
        ])
      );
    } else if (snapDelta <= -6 || trendDirection === 'SLUMPING') {
      blurbs.push(
        rng.pick([
          `Beat Notebook: Rotated series-for-series during Thursday's padded period, coming off the grass whenever the offense broke the huddle in three-receiver sub-packages.`,
          `Beat Notebook: Worked primarily with the early-down base group on Wednesday while reserve options took a longer look during the red-zone and two-minute segments.`,
          `Beat Notebook: Split first-team reps nearly down the middle during open media viewing; the position coach noted afterward that the staff wants 'fresh legs across the room on Sunday.'`,
        ])
      );
    } else {
      blurbs.push(
        rng.pick([
          `Beat Notebook: Took his customary turn in the rotation throughout Wednesday and Thursday's sessions, checking out only for standard mid-drive breather series.`,
          `Beat Notebook: Operated in his usual alignment with ${team.city}'s #${depthRank} ${player.position} grouping, with the staff sticking closely to last week's personnel distribution.`,
          `Beat Notebook: Nothing out of the ordinary during open media availability; ran with his regular unit and split situational drill work along established lines.`,
        ])
      );
    }

    // Subtle beat-reporter observation when hidden contextual factors apply
    const gameMatchup = matchupByTeam.get(player.proTeamId);
    const weatherSeverity = gameMatchup ? getMatchupWeatherSeverity(gameMatchup) : undefined;
    const mod = evaluateHiddenModifiers({
      player,
      team,
      stadiumTeam,
      week,
      teamHasEliteWR1: teamHasEliteWR1.get(team.id) ?? false,
      isTeamWR1: teamWR1Id.get(team.id) === player.id,
      weatherSeverity,
    });
    const beatObs = buildBeatReporterObservation(
      mod.activeTags,
      player,
      team,
      stadiumTeam,
      rng,
      gameMatchup?.weatherNote
    );
    if (beatObs) {
      blurbs.push(`Sideline Note: ${beatObs.blurb}`);
    }

    player.weeklyIntel = {
      week,
      fantasyRank,
      isTop200: true,
      practiceStatus,
      snapShare: rawSnap,
      snapDelta,
      trendDirection,
      trendMomentum,
      performanceMultiplier,
      headline,
      blurbs,
    };

    // Nominate stories for the Weekly Beat Wire (prioritize user roster & top 90 players)
    const isUserOwned = player.fantasyTeamId === state.userTeamId;
    const basePriority = (isUserOwned ? 45 : 0) + Math.max(0, 110 - fantasyRank);

    if (player.injuryWeeks === 0 && practiceStatus === 'DNP' && fantasyRank <= 90) {
      candidateNews.push({
        priority: basePriority + 55,
        item: {
          id: `news_${week}_dnp_${player.id}`,
          week,
          category: 'PRACTICE',
          impact: 'NEGATIVE',
          headline: `Practice Report: ${player.position} ${player.name} (${team.id}) Listed as DNP`,
          body: `${player.name} (#${fantasyRank}) did not participate during the open media window on Wednesday or Thursday, working inside with trainers instead. The coaching staff listed him as a game-time decision, and reserves took the first-team reps in his absence.`,
          playerId: player.id,
          proTeamId: team.id,
        },
      });
    } else if (player.injuryWeeks === 0 && practiceStatus === 'LIMITED' && fantasyRank <= 75) {
      candidateNews.push({
        priority: basePriority + 38,
        item: {
          id: `news_${week}_lp_${player.id}`,
          week,
          category: 'PRACTICE',
          impact: 'WARNING',
          headline: `Practice Report: ${player.position} ${player.name} (${team.id}) Limited on Thursday`,
          body: `${player.name} (#${fantasyRank}) was listed as a partial participant (LP) on the official injury report after leaving 11-on-11 drills early. Beat writers noted the backup rotated in for most of the third-down and red-zone periods.`,
          playerId: player.id,
          proTeamId: team.id,
        },
      });
    } else if (beatObs && fantasyRank <= 110) {
      candidateNews.push({
        priority: basePriority + 42,
        item: {
          id: `news_${week}_meta_${player.id}`,
          week,
          category: beatObs.category,
          impact:
            mod.efficiencyMult * mod.volumeMult * mod.tdMult >= 1.05 ? 'POSITIVE' : 'WARNING',
          headline: `${beatObs.headline} (${team.id})`,
          body: `${beatObs.blurb} [Official Report: ${practiceStatus === 'FULL' ? 'FULL (FP)' : practiceStatus === 'LIMITED' ? 'PARTIAL (LP)' : 'DNP'} · ${rawSnap}% Snaps]`,
          playerId: player.id,
          proTeamId: team.id,
        },
      });
    } else if (( Math.abs(snapDelta) >= 7 || trendDirection === 'SURGING' || trendDirection === 'SLUMPING') && fantasyRank <= 120) {
      const rotationNote =
        snapDelta >= 6 || trendDirection === 'SURGING'
          ? `${player.name} (#${fantasyRank}) stayed on the grass with the starters through two-minute and third-down periods all week after logging a ${rawSnap}% snap share.`
          : `${player.name} (#${fantasyRank}) split first-team series with the backups during Thursday's padded session as the staff rotated personnel across sub-packages (${rawSnap}% snap share).`;
      candidateNews.push({
        priority: basePriority + 34,
        item: {
          id: `news_${week}_rot_${player.id}`,
          week,
          category: 'SNAP_SHARE',
          impact: snapDelta >= 0 ? 'POSITIVE' : 'WARNING',
          headline: `Personnel & Rotation Notes from ${team.city} (${team.id})`,
          body: `${rotationNote} [Official Report: ${practiceStatus === 'FULL' ? 'FULL (FP)' : practiceStatus === 'LIMITED' ? 'PARTIAL (LP)' : 'DNP'}]`,
          playerId: player.id,
          proTeamId: team.id,
        },
      });
    }
  });

  candidateNews.sort((a, b) => b.priority - a.priority);
  const selectedNews: WeeklyNewsItem[] = [];
  const usedTeams = new Set<string>();

  for (const c of candidateNews) {
    if (selectedNews.length >= 10) break;
    if (c.item.proTeamId && usedTeams.has(c.item.proTeamId) && selectedNews.length < 7) {
      continue;
    }
    if (c.item.proTeamId) usedTeams.add(c.item.proTeamId);
    selectedNews.push(c.item);
  }

  if (state.phase === 'REGULAR_SEASON' && (week === 9 || week === 10 || week === 11)) {
    const deadlineStory: WeeklyNewsItem =
      week === 9
        ? {
            id: `news_${week}_trade_deadline`,
            week,
            category: 'META_HINT',
            impact: 'WARNING',
            headline: 'League Office: Trade Deadline One Week Away (Week 10)',
            body: 'Front offices across the 12-team dynasty are fielding calls ahead of next week’s Week 10 Trade Deadline. Contenders are eyeing veteran depth while rebuilding clubs shop aging producers.',
          }
        : week === 10
        ? {
            id: `news_${week}_trade_deadline`,
            week,
            category: 'META_HINT',
            impact: 'NEGATIVE',
            headline: 'TRADE DEADLINE WEEK — Final Window Before Week 11 Lock',
            body: 'This is the final week to complete trades before the league trade window locks ahead of Week 11. Any deals must be finalized on the Trade Machine before simming Week 10.',
          }
        : {
            id: `news_${week}_trade_deadline`,
            week,
            category: 'META_HINT',
            impact: 'INFO',
            headline: 'League Office: Trade Window Officially Closed Until Offseason',
            body: 'The Week 10 Trade Deadline has passed. Rosters can still be adjusted through the Waiver Wire and Rookie Taxi Squad, and trading will reopen once the season concludes.',
          };
    selectedNews.unshift(deadlineStory);
  }

  state.weeklyNews = selectedNews;
}
