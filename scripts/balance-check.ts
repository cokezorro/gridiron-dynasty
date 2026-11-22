import {
  advanceToRookieDraft,
  createNewDynasty,
  simRemainingDraft,
  simulateToEndOfSeason,
} from '../src/engine';

let state = createNewDynasty({ seed: 202601 });
state = simRemainingDraft(state);
state = simulateToEndOfSeason(state);

const byPos = (pos: 'QB' | 'RB' | 'WR' | 'TE') =>
  Object.values(state.players)
    .filter((p) => !p.retired && p.position === pos)
    .sort((a, b) => b.seasonStats.fantasyPoints - a.seasonStats.fantasyPoints);

console.log('=== SEASON 1 CALIBRATION (17-week Full PPR) ===');
for (const pos of ['QB', 'RB', 'WR', 'TE'] as const) {
  const list = byPos(pos);
  const top1 = list[0];
  const top12 = list[11];
  console.log(
    `${pos}: #1 ${top1.name} (${top1.seasonStats.fantasyPoints.toFixed(1)} pts, ${top1.seasonStats.gamesPlayed}g) | #12 ${top12.name} (${top12.seasonStats.fantasyPoints.toFixed(1)} pts)`
  );
}

const weeklyScores = state.fantasySchedule
  .filter((m) => m.played && !m.isPlayoff)
  .flatMap((m) => [m.homeScore, m.awayScore]);
const avgTeamScore = weeklyScores.reduce((a, b) => a + b, 0) / weeklyScores.length;
console.log(`Avg Fantasy Team Weekly Score (Full PPR, 8 starters): ${avgTeamScore.toFixed(1)}`);

// Simulate 4 more seasons to check stability & Hall of Fame
for (let i = 0; i < 4; i++) {
  state = advanceToRookieDraft(state);
  state = simRemainingDraft(state);
  state = simulateToEndOfSeason(state);
}

console.log(
  `After 5 seasons: Manager Lv.${state.manager.level}, History Entries=${state.seasonHistory.length}, Hall of Fame=${state.hallOfFame.length}`
);
