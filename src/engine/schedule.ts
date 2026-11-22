import { FantasyMatchup, FantasyTeam, ProMatchup, ProTeam, StadiumType, WeatherSeverity } from './types';
import { SeededRNG } from './rng';

function rollGameWeatherReport(
  stadium: StadiumType,
  week: number,
  rng: SeededRNG
): { weatherNote: string; weatherSeverity: WeatherSeverity; tempF: number; windMph: number } {
  if (stadium === 'DOME') {
    return {
      weatherNote: 'Dome (72°F · Fast Track)',
      weatherSeverity: 'IDEAL',
      tempF: 72,
      windMph: 0,
    };
  }

  const r = rng.next();

  if (stadium === 'WARM_OUTDOOR') {
    if (r < 0.06) {
      const wind = rng.int(22, 27);
      const temp = week <= 8 ? rng.int(68, 76) : rng.int(58, 67);
      return {
        weatherNote: `Heavy Downpour & Gusts (${temp}°F · ${wind} mph)`,
        weatherSeverity: 'SEVERE',
        tempF: temp,
        windMph: wind,
      };
    }
    if (r < 0.18) {
      const wind = rng.int(13, 18);
      const temp = week <= 8 ? rng.int(70, 78) : rng.int(60, 68);
      return {
        weatherNote: `Slick Turf & Rain (${temp}°F · ${wind} mph)`,
        weatherSeverity: 'ADVERSE',
        tempF: temp,
        windMph: wind,
      };
    }
    const temp = week <= 6 ? rng.int(76, 84) : rng.int(64, 73);
    const wind = rng.int(4, 9);
    return {
      weatherNote: `Clear & Warm (${temp}°F · ${wind} mph)`,
      weatherSeverity: 'IDEAL',
      tempF: temp,
      windMph: wind,
    };
  }

  if (stadium === 'WINDY_OUTDOOR') {
    const severeCut = week >= 11 ? 0.28 : 0.14;
    const adverseCut = week >= 11 ? 0.66 : 0.44;
    if (r < severeCut) {
      const wind = rng.int(24, 31);
      const temp = week >= 12 ? rng.int(29, 38) : rng.int(44, 54);
      const label = week >= 12 ? 'Gale Winds & Sleet' : 'Gale-Force Crosswinds';
      return {
        weatherNote: `${label} (${temp}°F · ${wind} mph)`,
        weatherSeverity: 'SEVERE',
        tempF: temp,
        windMph: wind,
      };
    }
    if (r < adverseCut) {
      const wind = rng.int(16, 22);
      const temp = week >= 12 ? rng.int(34, 43) : rng.int(48, 58);
      return {
        weatherNote: `Gusty Crosswinds (${temp}°F · ${wind} mph)`,
        weatherSeverity: 'ADVERSE',
        tempF: temp,
        windMph: wind,
      };
    }
    const wind = rng.int(8, 12);
    const temp = week >= 12 ? rng.int(39, 47) : rng.int(55, 65);
    return {
      weatherNote: `Breezy & Clear (${temp}°F · ${wind} mph)`,
      weatherSeverity: 'IDEAL',
      tempF: temp,
      windMph: wind,
    };
  }

  // COLD_OUTDOOR
  const severeCut = week >= 12 ? 0.34 : week >= 8 ? 0.16 : 0.07;
  const adverseCut = week >= 12 ? 0.72 : week >= 8 ? 0.46 : 0.24;
  if (r < severeCut) {
    const wind = rng.int(21, 28);
    const temp = week >= 12 ? rng.int(15, 25) : week >= 8 ? rng.int(26, 33) : rng.int(41, 47);
    const label = week >= 9 ? 'Heavy Snow & Wind' : 'Cold Driving Rainstorm';
    return {
      weatherNote: `${label} (${temp}°F · ${wind} mph)`,
      weatherSeverity: 'SEVERE',
      tempF: temp,
      windMph: wind,
    };
  }
  if (r < adverseCut) {
    const wind = rng.int(14, 19);
    const temp = week >= 12 ? rng.int(23, 31) : week >= 8 ? rng.int(33, 41) : rng.int(45, 52);
    const label = week >= 11 ? 'Freezing Turf' : 'Cold Rain & Breeze';
    return {
      weatherNote: `${label} (${temp}°F · ${wind} mph)`,
      weatherSeverity: 'ADVERSE',
      tempF: temp,
      windMph: wind,
    };
  }
  const wind = rng.int(4, 10);
  const temp = week >= 12 ? rng.int(31, 39) : week >= 8 ? rng.int(43, 52) : rng.int(55, 66);
  return {
    weatherNote: `Crisp & Clear (${temp}°F · ${wind} mph)`,
    weatherSeverity: 'IDEAL',
    tempF: temp,
    windMph: wind,
  };
}

export function getMatchupWeatherSeverity(m: ProMatchup): WeatherSeverity {
  if (m.weatherSeverity) return m.weatherSeverity;
  const n = (m.weatherNote || '').toLowerCase();
  if (n.includes('blizzard') || n.includes('heavy') || n.includes('gale') || n.includes('downpour') || n.includes('rainstorm')) {
    return 'SEVERE';
  }
  if (n.includes('freezing') || n.includes('gust') || n.includes('rain') || n.includes('crosswind')) {
    return 'ADVERSE';
  }
  return 'IDEAL';
}

export function getPlayerWeekWeatherReport(
  proSchedule: ProMatchup[],
  proTeamId: string,
  week: number
): {
  matchup: ProMatchup;
  opponentId: string;
  isHome: boolean;
  matchupTag: string;
  weatherNote: string;
  severity: WeatherSeverity;
} | null {
  const m = proSchedule.find(
    (g) => g.week === week && (g.homeTeamId === proTeamId || g.awayTeamId === proTeamId)
  );
  if (!m) return null;
  const isHome = m.homeTeamId === proTeamId;
  const opponentId = isHome ? m.awayTeamId : m.homeTeamId;
  const severity = getMatchupWeatherSeverity(m);
  return {
    matchup: m,
    opponentId,
    isHome,
    matchupTag: `${isHome ? 'vs' : '@'} ${opponentId}`,
    weatherNote: m.weatherNote,
    severity,
  };
}

/**
 * Generates a balanced 17-week schedule for 32 pro teams (16 games/week).
 * Uses the round-robin circle algorithm on a shuffled team list so every team
 * plays exactly 1 game per week with alternating home/away venues.
 */
export function generateProSchedule(
  proTeams: Record<string, ProTeam>,
  rng: SeededRNG
): ProMatchup[] {
  const ids = rng.shuffle(Object.keys(proTeams));
  const n = ids.length; // 32
  const schedule: ProMatchup[] = [];
  const fixed = ids[0];
  const rotating = ids.slice(1);

  for (let week = 1; week <= 17; week++) {
    const roundList = [fixed, ...rotating];
    for (let i = 0; i < n / 2; i++) {
      const a = roundList[i];
      const b = roundList[n - 1 - i];
      const flip = (week + i) % 2 === 0;
      const homeTeamId = flip ? a : b;
      const awayTeamId = flip ? b : a;
      const stadium = proTeams[homeTeamId].stadium;
      const wx = rollGameWeatherReport(stadium, week, rng);

      schedule.push({
        week,
        homeTeamId,
        awayTeamId,
        played: false,
        homeScore: 0,
        awayScore: 0,
        weatherNote: wx.weatherNote,
        weatherSeverity: wx.weatherSeverity,
        tempF: wx.tempF,
        windMph: wx.windMph,
      });
    }
    // Rotate array right by 1
    rotating.unshift(rotating.pop()!);
  }

  return schedule;
}

/**
 * Generates a 14-week regular season schedule for 12 fantasy teams.
 * Weeks 1-11 are a full round-robin (every manager plays every other manager once);
 * Weeks 12-14 repeat the first 3 weeks with flipped home/away.
 */
export function generateFantasyRegularSchedule(
  fantasyTeams: Record<string, FantasyTeam>,
  rng: SeededRNG
): FantasyMatchup[] {
  const ids = rng.shuffle(Object.keys(fantasyTeams));
  const n = ids.length; // 12
  const schedule: FantasyMatchup[] = [];
  const fixed = ids[0];
  const rotating = ids.slice(1);

  for (let week = 1; week <= 14; week++) {
    const roundList = [fixed, ...rotating];
    for (let i = 0; i < n / 2; i++) {
      const a = roundList[i];
      const b = roundList[n - 1 - i];
      const flip = (week + i) % 2 === 0;
      schedule.push({
        week,
        homeTeamId: flip ? a : b,
        awayTeamId: flip ? b : a,
        played: false,
        homeScore: 0,
        awayScore: 0,
      });
    }
    rotating.unshift(rotating.pop()!);
  }

  return schedule;
}

export function sortStandings(teams: FantasyTeam[]): FantasyTeam[] {
  return [...teams].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.pointsFor - a.pointsFor;
  });
}

/**
 * Creates Week 15 Quarterfinal matchups for seeds #3 vs #6 and #4 vs #5
 * (#1 and #2 earn first-round byes).
 */
export function buildQuarterfinalMatchups(
  fantasyTeams: Record<string, FantasyTeam>
): FantasyMatchup[] {
  const ranked = sortStandings(Object.values(fantasyTeams));
  return [
    {
      week: 15,
      homeTeamId: ranked[2].id, // #3 seed
      awayTeamId: ranked[5].id, // #6 seed
      played: false,
      homeScore: 0,
      awayScore: 0,
      isPlayoff: true,
      playoffLabel: 'Quarterfinal #1 (3 vs 6)',
    },
    {
      week: 15,
      homeTeamId: ranked[3].id, // #4 seed
      awayTeamId: ranked[4].id, // #5 seed
      played: false,
      homeScore: 0,
      awayScore: 0,
      isPlayoff: true,
      playoffLabel: 'Quarterfinal #2 (4 vs 5)',
    },
  ];
}

export function buildSemifinalMatchups(
  fantasyTeams: Record<string, FantasyTeam>,
  week15Matchups: FantasyMatchup[]
): FantasyMatchup[] {
  const ranked = sortStandings(Object.values(fantasyTeams));
  const qf1 = week15Matchups[0];
  const qf2 = week15Matchups[1];
  const w1 = qf1.homeScore >= qf1.awayScore ? qf1.homeTeamId : qf1.awayTeamId;
  const w2 = qf2.homeScore >= qf2.awayScore ? qf2.homeTeamId : qf2.awayTeamId;

  return [
    {
      week: 16,
      homeTeamId: ranked[0].id, // #1 seed
      awayTeamId: w2,
      played: false,
      homeScore: 0,
      awayScore: 0,
      isPlayoff: true,
      playoffLabel: 'Semifinal #1',
    },
    {
      week: 16,
      homeTeamId: ranked[1].id, // #2 seed
      awayTeamId: w1,
      played: false,
      homeScore: 0,
      awayScore: 0,
      isPlayoff: true,
      playoffLabel: 'Semifinal #2',
    },
  ];
}

export function buildChampionshipMatchup(
  week16Matchups: FantasyMatchup[]
): FantasyMatchup[] {
  const sf1 = week16Matchups[0];
  const sf2 = week16Matchups[1];
  const champ1 = sf1.homeScore >= sf1.awayScore ? sf1.homeTeamId : sf1.awayTeamId;
  const champ2 = sf2.homeScore >= sf2.awayScore ? sf2.homeTeamId : sf2.awayTeamId;
  const third1 = sf1.homeScore >= sf1.awayScore ? sf1.awayTeamId : sf1.homeTeamId;
  const third2 = sf2.homeScore >= sf2.awayScore ? sf2.awayTeamId : sf2.homeTeamId;

  return [
    {
      week: 17,
      homeTeamId: champ1,
      awayTeamId: champ2,
      played: false,
      homeScore: 0,
      awayScore: 0,
      isPlayoff: true,
      playoffLabel: 'Dynasty Championship',
    },
    {
      week: 17,
      homeTeamId: third1,
      awayTeamId: third2,
      played: false,
      homeScore: 0,
      awayScore: 0,
      isPlayoff: true,
      playoffLabel: '3rd Place Game',
    },
  ];
}
