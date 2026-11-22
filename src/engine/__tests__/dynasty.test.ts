import { describe, expect, it } from 'vitest';
import {
  acceptIncomingTradeOffer,
  advanceToRookieDraft,
  autoPickUserTurn,
  createNewDynasty,
  declineIncomingTradeOffer,
  evaluateHiddenModifiers,
  evaluateTradeProposal,
  executeTrade,
  getScoutedAttributes,
  getScoutedOverall,
  getScoutingHalfWidth,
  getRecommendedAutoPick,
  getPlayerWeekWeatherReport,
  makeUserDraftPick,
  movePlayerTaxi,
  setDraftAutopick,
  signFreeAgent,
  simRemainingDraft,
  simulateProWeek,
  simulateToEndOfSeason,
  simulateWeek,
  spendSkillPoint,
  stepAutoDraftPick,
  toggleDraftQueuePlayer,
  isTradeWindowOpen,
  STARTUP_ROUNDS,
  ROOKIE_DRAFT_ROUNDS,
  TRADE_DEADLINE_WEEK,
  SeededRNG,
} from '../index';

describe('Gridiron Dynasty Core Engine', () => {
  it('generates exactly 32 pro franchises with 16 Apex and 16 Frontier teams', () => {
    const state = createNewDynasty({ seed: 42 });
    const proTeams = Object.values(state.proTeams);
    expect(proTeams).toHaveLength(32);
    expect(proTeams.filter((t) => t.conference === 'Apex')).toHaveLength(16);
    expect(proTeams.filter((t) => t.conference === 'Frontier')).toHaveLength(16);
    const uniqueNames = new Set(proTeams.map((t) => t.name));
    expect(uniqueNames.size).toBe(32);
  });

  it('shrinks scouting fog-of-war uncertainty ranges as manager levels up and upgrades Scouting', () => {
    let state = createNewDynasty({ seed: 101 });
    const vet = Object.values(state.players).find((p) => p.experience >= 2)!;
    const rookie = Object.values(state.players).find((p) => p.experience === 0)!;

    const lv1VetWidth = getScoutingHalfWidth(state.manager, false);
    const lv1RookieWidth = getScoutingHalfWidth(state.manager, true);
    expect(lv1RookieWidth).toBeGreaterThan(lv1VetWidth);

    const lv1Range = getScoutedOverall(vet, state.manager, state.season);
    const lv1Attrs = getScoutedAttributes(vet, state.manager, state.season);
    expect(lv1Attrs.speed.high).toBeGreaterThanOrEqual(lv1Attrs.speed.low);

    // Upgrade scouting & increase level
    state = spendSkillPoint(state, 'scouting');
    state.manager.level = 10;
    state.manager.skills.scouting = 8;

    const lv10VetWidth = getScoutingHalfWidth(state.manager, false);
    const lv10Range = getScoutedOverall(vet, state.manager, state.season);

    expect(lv10VetWidth).toBeLessThan(lv1VetWidth);
    expect(lv10Range.high - lv10Range.low).toBeLessThan(lv1Range.high - lv1Range.low);
  });

  it('evaluates all 6 hidden meta modifiers accurately', () => {
    const state = createNewDynasty({ seed: 77 });
    const airRaidTeam = Object.values(state.proTeams).find((t) => t.scheme === 'AIR_RAID')!;
    const coldTeam = Object.values(state.proTeams).find((t) => t.stadium === 'COLD_OUTDOOR')!;
    const domeTeam = Object.values(state.proTeams).find((t) => t.stadium === 'DOME')!;
    const eliteOLTeam = { ...airRaidTeam, oLineRating: 9.0 };

    const sampleWR = Object.values(state.players).find((p) => p.position === 'WR')!;
    const fastWR = {
      ...sampleWR,
      experience: 0,
      trueAttributes: { ...sampleWR.trueAttributes, speed: 9.2, iq: 8.5, power: 5.5 },
    };

    const airRaidRes = evaluateHiddenModifiers({
      player: fastWR,
      team: airRaidTeam,
      stadiumTeam: domeTeam,
      week: 14,
      teamHasEliteWR1: true,
      isTeamWR1: false,
    });
    expect(airRaidRes.activeTags).toContain('AIR_RAID_SPEED_WR');
    expect(airRaidRes.activeTags).toContain('DOME_PLAYOFF_TRACK');
    expect(airRaidRes.activeTags).toContain('WR1_COVERAGE_GRAVITY');
    expect(airRaidRes.activeTags).toContain('ROOKIE_LATE_BREAKOUT');

    const sampleRB = Object.values(state.players).find((p) => p.position === 'RB')!;
    const workhorseRB = {
      ...sampleRB,
      age: 27,
      priorSeasonTouches: 340,
      trueAttributes: { ...sampleRB.trueAttributes, power: 8.5 },
    };
    const rbRes = evaluateHiddenModifiers({
      player: workhorseRB,
      team: eliteOLTeam,
      stadiumTeam: coldTeam,
      week: 15,
      teamHasEliteWR1: false,
      isTeamWR1: false,
    });
    expect(rbRes.activeTags).toContain('RB_WORKLOAD_CLIFF');
    expect(rbRes.activeTags).toContain('ELITE_OLINE_LANES');
    expect(rbRes.activeTags).toContain('WINTER_POWER_RB');
    expect(rbRes.injuryRiskMult).toBeGreaterThan(1.3);
  });

  it('completes a full 3-season Dynasty loop including startup draft, playoffs, history, XP, and rookie drafts', () => {
    let state = createNewDynasty({ managerName: 'Alex', teamName: 'Metro Kings', seed: 2026 });
    expect(state.phase).toBe('STARTUP_DRAFT');

    // User makes 1 manual draft pick and 1 auto pick, then sims rest of startup draft
    const firstAvailable = state.draft!.poolIds[0];
    state = makeUserDraftPick(state, firstAvailable);
    state = autoPickUserTurn(state);
    state = simRemainingDraft(state);

    expect(state.phase).toBe('REGULAR_SEASON');
    expect(state.draft!.picks).toHaveLength(STARTUP_ROUNDS * 12);
    expect(state.fantasyTeams[state.userTeamId].rosterIds).toHaveLength(STARTUP_ROUNDS);

    // Spend starting skill point on Analyst to unlock Film Note #1
    state = spendSkillPoint(state, 'analyst');
    expect(state.manager.discoveredClues.length).toBeGreaterThanOrEqual(1);

    // Sim Week 1 and verify digest & stats
    state = simulateWeek(state);
    expect(state.week).toBe(2);
    expect(state.lastWeeklyDigest).not.toBeNull();
    expect(state.lastWeeklyDigest!.xpGained).toBeGreaterThan(0);

    // Test Free Agent signing & taxi squad
    const fa = Object.values(state.players).find((p) => !p.fantasyTeamId && !p.retired)!;
    const dropId = state.fantasyTeams[state.userTeamId].rosterIds[15];
    state = signFreeAgent(state, fa.id, dropId);
    expect(state.fantasyTeams[state.userTeamId].rosterIds).toContain(fa.id);

    const youngPlayer = state.fantasyTeams[state.userTeamId].rosterIds
      .map((id) => state.players[id])
      .find((p) => p.experience <= 1);
    if (youngPlayer) {
      state = movePlayerTaxi(state, youngPlayer.id, true);
      expect(state.fantasyTeams[state.userTeamId].taxiIds).toContain(youngPlayer.id);
    }

    // Finish Season 1 -> Offseason -> Season 2 Rookie Draft -> Finish Season 2 -> Season 3
    for (let s = 1; s <= 3; s++) {
      state = simulateToEndOfSeason(state);
      expect(state.phase).toBe('OFFSEASON_SUMMARY');
      expect(state.seasonHistory).toHaveLength(s);
      expect(state.manager.level).toBeGreaterThanOrEqual(2);

      if (s < 3) {
        state = advanceToRookieDraft(state);
        expect(state.phase).toBe('ROOKIE_DRAFT');
        expect(state.season).toBe(2026 + s);
        state = simRemainingDraft(state);
        expect(state.draft!.picks).toHaveLength(ROOKIE_DRAFT_ROUNDS * 12);
        expect(state.phase).toBe('REGULAR_SEASON');
      }
    }

    // Verify trade evaluation works
    const aiTeam = Object.values(state.fantasyTeams).find((t) => !t.isUser)!;
    const myBest = state.fantasyTeams[state.userTeamId].rosterIds[0];
    const aiWorst = aiTeam.rosterIds[aiTeam.rosterIds.length - 1];
    const evalRes = evaluateTradeProposal(state, aiTeam.id, [myBest], [aiWorst]);
    expect(typeof evalRes.accepted).toBe('boolean');
    if (evalRes.accepted) {
      const traded = executeTrade(state, aiTeam.id, [myBest], [aiWorst]);
      expect(traded.state.fantasyTeams[state.userTeamId].rosterIds).toContain(aiWorst);
    }
  });

  it('supports Autopick toggle, strategy selection, draft queue priority, and live stepAutoDraftPick', () => {
    let state = createNewDynasty({ seed: 9001 });
    expect(state.draft!.autopickEnabled).toBe(false);
    expect(state.draft!.autopickStrategy).toBe('BALANCED');

    // Queue a specific player and verify Autopick prioritizes the queue
    const targetId = state.draft!.poolIds[5];
    state = toggleDraftQueuePlayer(state, targetId);
    expect(state.draft!.userQueue).toContain(targetId);
    expect(getRecommendedAutoPick(state)?.id).toBe(targetId);

    // Execute user autopick -> drafts queued player and prunes queue
    state = autoPickUserTurn(state);
    expect(state.fantasyTeams[state.userTeamId].rosterIds).toContain(targetId);
    expect(state.draft!.userQueue).not.toContain(targetId);

    // Enable live Autopick with ZERO_RB strategy and step through picks
    state = setDraftAutopick(state, true, 'ZERO_RB');
    expect(state.draft!.autopickEnabled).toBe(true);
    expect(state.draft!.autopickStrategy).toBe('ZERO_RB');

    const beforeIdx = state.draft!.currentPickIndex;
    state = stepAutoDraftPick(state);
    expect(state.draft!.currentPickIndex).toBe(beforeIdx + 1);
  });

  it('generates Major Fantasy News, Top-200 practice/snap info blobs, outside-Top-200 notices, and trending point histories each week', () => {
    let state = createNewDynasty({ seed: 202699 });
    state = simRemainingDraft(state);

    const active = Object.values(state.players).filter((p) => !p.retired);
    const top200 = active.filter((p) => p.weeklyIntel.isTop200);
    const outside200 = active.filter((p) => !p.weeklyIntel.isTop200);

    expect(top200).toHaveLength(200);
    expect(outside200.length).toBeGreaterThan(100);
    expect(state.weeklyNews.length).toBeGreaterThan(0);

    // Verify Top 200 players have multi-line practice/snap/meta blurbs
    for (const p of top200) {
      expect(p.weeklyIntel.fantasyRank).toBeLessThanOrEqual(200);
      expect(p.weeklyIntel.blurbs.length).toBeGreaterThanOrEqual(2);
      expect(p.pointTrendHistory.length).toBe(4);
    }

    // Verify every player outside Top 200 explicitly states they have no advanced news because they are not Top 200
    for (const p of outside200) {
      expect(p.weeklyIntel.fantasyRank).toBeGreaterThan(200);
      expect(p.weeklyIntel.blurbs[0]).toContain('outside the Top 200');
      expect(p.pointTrendHistory.length).toBe(4);
    }

    // Advance 1 week and verify weekly intel, news, and pointTrendHistory update
    state = simulateWeek(state);
    const samplePlayer = Object.values(state.players).find((p) => !p.retired)!;
    expect(samplePlayer.pointTrendHistory.length).toBe(5);
    expect(samplePlayer.weeklyIntel.week).toBe(2);
    expect(state.weeklyNews[0].week).toBe(2);
  });

  it('enforces the Week 10 Trade Deadline during the regular season and playoffs, then reopens in the offseason', () => {
    let state = createNewDynasty({ seed: 777123 });
    state = simRemainingDraft(state);

    // Advance to Week 10 (Trade Deadline Week)
    while (state.phase === 'REGULAR_SEASON' && state.week < TRADE_DEADLINE_WEEK) {
      state = simulateWeek(state);
    }
    expect(state.week).toBe(TRADE_DEADLINE_WEEK);
    expect(isTradeWindowOpen(state)).toBe(true);
    expect(state.weeklyNews.some((n) => n.id.includes('trade_deadline'))).toBe(true);

    // Advance to Week 11 (Past Trade Deadline)
    state = simulateWeek(state);
    expect(state.week).toBe(TRADE_DEADLINE_WEEK + 1);
    expect(isTradeWindowOpen(state)).toBe(false);

    const aiTeam = Object.values(state.fantasyTeams).find((t) => !t.isUser)!;
    const myPlayer = state.fantasyTeams[state.userTeamId].rosterIds[0];
    const aiPlayer = aiTeam.rosterIds[0];
    const blocked = evaluateTradeProposal(state, aiTeam.id, [myPlayer], [aiPlayer]);
    expect(blocked.accepted).toBe(false);
    expect(blocked.reason.toLowerCase()).toContain('deadline');

    // Sim to Offseason -> Trade window reopens
    state = simulateToEndOfSeason(state);
    expect(state.phase).toBe('OFFSEASON_SUMMARY');
    expect(isTradeWindowOpen(state)).toBe(true);
  });

  it('generates AI trade offers sparingly (capped at 1 active), supports accept/decline, and clears past deadline', () => {
    let totalOffersGenerated = 0;
    let testedAccept = false;
    let testedDecline = false;

    for (const seed of [101, 202, 303, 404]) {
      let state = createNewDynasty({ seed });
      state = simRemainingDraft(state);

      for (let w = 1; w <= 11; w++) {
        state = simulateWeek(state);
        const offers = state.incomingTradeOffers ?? [];
        // Never spams more than 1 active offer at a time
        expect(offers.length).toBeLessThanOrEqual(1);
        if (state.week > TRADE_DEADLINE_WEEK) {
          expect(offers.length).toBe(0);
        }
        if (offers.length === 1) {
          totalOffersGenerated++;
          const offer = offers[0];
          if (!testedAccept) {
            const res = acceptIncomingTradeOffer(state, offer.id);
            expect(res.accepted).toBe(true);
            state = res.state;
            expect(state.fantasyTeams[state.userTeamId].rosterIds).toContain(offer.aiGivesPlayerId);
            expect(state.incomingTradeOffers ?? []).toHaveLength(0);
            testedAccept = true;
          } else if (!testedDecline) {
            state = declineIncomingTradeOffer(state, offer.id);
            expect(state.incomingTradeOffers ?? []).toHaveLength(0);
            testedDecline = true;
          }
        }
      }
    }

    // Across 4 seasons (36 open weeks), sparing rate (~22-40%) should yield a handful of offers, not every week
    expect(totalOffersGenerated).toBeGreaterThanOrEqual(2);
    expect(totalOffersGenerated).toBeLessThan(28);
    expect(testedAccept).toBe(true);
    expect(testedDecline).toBe(true);
  });

  it('assigns game-day weather reports to every pro matchup and applies probabilistic bad-weather modifiers (usually less pass attack, but not always)', () => {
    const state = createNewDynasty({ seed: 9191 });
    expect(state.proSchedule.length).toBeGreaterThan(0);

    for (const m of state.proSchedule) {
      expect(m.weatherNote.length).toBeGreaterThan(3);
      expect(['IDEAL', 'ADVERSE', 'SEVERE']).toContain(m.weatherSeverity);
      expect(typeof m.tempF).toBe('number');
      expect(typeof m.windMph).toBe('number');
    }

    const samplePlayer = Object.values(state.players).find((p) => !p.retired)!;
    const wx = getPlayerWeekWeatherReport(state.proSchedule, samplePlayer.proTeamId, 1);
    expect(wx).not.toBeNull();
    expect(wx!.opponentId.length).toBeGreaterThanOrEqual(2);
    expect(['IDEAL', 'ADVERSE', 'SEVERE']).toContain(wx!.severity);

    // Compare 25 simulated games in IDEAL weather vs 25 simulated games in SEVERE weather
    const wk1Matchup = state.proSchedule.find((m) => m.week === 1)!;
    let idealTotalPassYds = 0;
    let severeTotalPassYds = 0;
    let severeDefiedCount = 0;

    for (let trial = 1; trial <= 25; trial++) {
      const idealMatchup = {
        ...wk1Matchup,
        weatherNote: 'Dome Controlled (70°F)',
        weatherSeverity: 'IDEAL' as const,
      };
      const severeMatchup = {
        ...wk1Matchup,
        weatherNote: 'Blizzard Conditions (19°F · 28 mph winds)',
        weatherSeverity: 'SEVERE' as const,
      };

      const cloneTeams = () =>
        Object.fromEntries(Object.entries(state.proTeams).map(([k, v]) => [k, { ...v }]));

      const idealRes = simulateProWeek({
        matchups: [idealMatchup],
        proTeams: cloneTeams(),
        players: state.players,
        season: 1,
        week: 1,
        rng: new SeededRNG(5000 + trial),
      });
      const severeRes = simulateProWeek({
        matchups: [severeMatchup],
        proTeams: cloneTeams(),
        players: state.players,
        season: 1,
        week: 1,
        rng: new SeededRNG(5000 + trial),
      });

      const idealPass = Array.from(idealRes.weeklyStats.values()).reduce(
        (acc, s) => acc + s.passYards,
        0
      );
      const severePass = Array.from(severeRes.weeklyStats.values()).reduce(
        (acc, s) => acc + s.passYards,
        0
      );
      idealTotalPassYds += idealPass;
      severeTotalPassYds += severePass;
      if (severePass >= idealPass * 0.96) {
        severeDefiedCount++;
      }
    }

    // Usually severe weather suppresses total passing output on average
    expect(severeTotalPassYds).toBeLessThan(idealTotalPassYds);
    // Still allows occasional games that defy the weather (not deterministic 100% suppression)
    expect(severeDefiedCount).toBeGreaterThanOrEqual(1);
  });
});
