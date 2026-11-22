import { Player, ProTeam, WeatherSeverity } from './types';

export interface HiddenModifierMultipliers {
  volumeMult: number;
  efficiencyMult: number;
  tdMult: number;
  injuryRiskMult: number;
  varianceStdDev: number;
  /** Internal tags (only used for test assertions & high-level post-game analytics, never leaked raw on cards) */
  activeTags: string[];
}

/**
 * Computes the 6 hidden meta modifiers that shape fantasy production so players
 * can discover real strategies through box scores, season history, and Film Room clues:
 *
 * 1. Scheme-Attribute Synergy (Air Raid Speed/Arm, West Coast Route/Hands PPR, Ground & Pound Power, Play Action TE/IQ)
 * 2. Game-Day Weather Report & Late-Season Dome Split (Bad/Severe weather & Weeks 12-17 Cold/Wind usually hurt deep passing and boost power RBs & TEs; Domes shine)
 * 3. RB 300-Touch Workload Cliff (Age 26+ RBs coming off 300+ touches suffer efficiency drop & injury spike)
 * 4. WR1 Coverage Gravity (Elite WR1 >= 8.4 draws double-teams, boosting teammate WR2 & TE1 red-zone TDs)
 * 5. Offensive Line Trench Factor (O-Line >= 8 boosts RBs; O-Line <= 4 hurts immobile QBs)
 * 6. Volatility Archetype + Rookie Second-Half IQ Breakout (Weeks 9+ rookie surge for high-IQ rookies)
 */
export function evaluateHiddenModifiers(params: {
  player: Player;
  team: ProTeam;
  stadiumTeam: ProTeam;
  week: number;
  teamHasEliteWR1: boolean;
  isTeamWR1: boolean;
  weatherSeverity?: WeatherSeverity;
}): HiddenModifierMultipliers {
  const { player, team, stadiumTeam, week, teamHasEliteWR1, isTeamWR1, weatherSeverity } = params;
  const a = player.trueAttributes;

  let volumeMult = 1.0;
  let efficiencyMult = 1.0;
  let tdMult = 1.0;
  let injuryRiskMult = 1.0;
  const activeTags: string[] = [];

  // 1. Scheme-Attribute Synergy
  switch (team.scheme) {
    case 'AIR_RAID':
      if (player.position === 'WR' && a.speed >= 8.0) {
        efficiencyMult *= 1.16;
        tdMult *= 1.14;
        activeTags.push('AIR_RAID_SPEED_WR');
      } else if (player.position === 'QB' && a.armStrength >= 8.0) {
        volumeMult *= 1.08;
        efficiencyMult *= 1.10;
        activeTags.push('AIR_RAID_CANNON_QB');
      } else if (player.position === 'RB') {
        volumeMult *= 0.90;
      }
      break;
    case 'WEST_COAST':
      if ((player.position === 'WR' || player.position === 'TE') && a.routeRunning >= 7.8 && a.hands >= 7.8) {
        volumeMult *= 1.18;
        activeTags.push('WEST_COAST_PPR_MACHINE');
      } else if (player.position === 'RB' && a.hands >= 7.0) {
        volumeMult *= 1.12;
        efficiencyMult *= 1.08;
        activeTags.push('WEST_COAST_PASS_RB');
      }
      break;
    case 'GROUND_POUND':
      if (player.position === 'RB' && a.power >= 7.8) {
        volumeMult *= 1.15;
        tdMult *= 1.22;
        activeTags.push('GROUND_POUND_BRUISER');
      } else if (player.position === 'WR') {
        volumeMult *= 0.90;
      }
      break;
    case 'PLAY_ACTION':
      if (player.position === 'TE' && a.routeRunning >= 7.4) {
        efficiencyMult *= 1.15;
        tdMult *= 1.20;
        activeTags.push('PLAY_ACTION_TE_SEAM');
      } else if (player.position === 'QB' && a.iq >= 7.8) {
        efficiencyMult *= 1.12;
        tdMult *= 1.12;
        activeTags.push('PLAY_ACTION_IQ_QB');
      }
      break;
    case 'BALANCED':
      break;
  }

  // 2. Game-Day Weather Report & Late-Season Dome Split
  const hasBadGameWeather =
    weatherSeverity === 'SEVERE' ||
    weatherSeverity === 'ADVERSE' ||
    (!weatherSeverity &&
      week >= 12 &&
      (stadiumTeam.stadium === 'COLD_OUTDOOR' || stadiumTeam.stadium === 'WINDY_OUTDOOR'));
  const isSevere = weatherSeverity === 'SEVERE' || (!weatherSeverity && week >= 12);

  if (hasBadGameWeather) {
    if (player.position === 'QB') {
      const armMitigation = a.armStrength >= 8.2 ? 0.04 : 0;
      efficiencyMult *= (isSevere ? 0.88 : 0.93) + armMitigation;
      activeTags.push('WINTER_PASS_PENALTY');
    } else if (player.position === 'WR' && a.speed >= 8.0 && a.power < 7.0) {
      efficiencyMult *= isSevere ? 0.86 : 0.92;
      activeTags.push('WINTER_DEEP_THREAT_CHILL');
    } else if (player.position === 'RB' && a.power >= 7.2) {
      volumeMult *= isSevere ? 1.12 : 1.07;
      efficiencyMult *= isSevere ? 1.07 : 1.04;
      activeTags.push('WINTER_POWER_RB');
    } else if (player.position === 'TE' && a.hands >= 7.2) {
      volumeMult *= isSevere ? 1.10 : 1.06;
      activeTags.push('WINTER_TE_SAFETY_VALVE');
    }
  } else if (week >= 12 && stadiumTeam.stadium === 'DOME') {
    if (player.position === 'QB' || player.position === 'WR') {
      efficiencyMult *= 1.07;
      activeTags.push('DOME_PLAYOFF_TRACK');
    }
  }

  // 3. RB 300-Touch Workload Cliff
  if (player.position === 'RB' && player.priorSeasonTouches >= 300 && player.age >= 26) {
    efficiencyMult *= 0.89;
    injuryRiskMult *= 1.45;
    activeTags.push('RB_WORKLOAD_CLIFF');
  }

  // 4. WR1 Coverage Gravity (boosts WR2 & TE1 when paired with an elite alpha WR1)
  if (teamHasEliteWR1 && !isTeamWR1 && (player.position === 'WR' || player.position === 'TE')) {
    efficiencyMult *= 1.08;
    tdMult *= 1.18;
    activeTags.push('WR1_COVERAGE_GRAVITY');
  }

  // 5. Offensive Line Trench Multiplier
  if (player.position === 'RB' && team.oLineRating >= 8.0) {
    efficiencyMult *= 1.14;
    activeTags.push('ELITE_OLINE_LANES');
  } else if (player.position === 'RB' && team.oLineRating <= 4.2) {
    efficiencyMult *= 0.89;
    activeTags.push('POROUS_OLINE_STUFF');
  }
  if (player.position === 'QB' && team.oLineRating <= 4.2 && a.agility < 7.8) {
    efficiencyMult *= 0.90;
    injuryRiskMult *= 1.25;
    activeTags.push('POCKET_PRESSURE_PENALTY');
  }

  // 6. Volatility Profile + Rookie Second-Half Breakout
  if (player.experience === 0 && week >= 9 && a.iq >= 7.4) {
    volumeMult *= 1.09;
    efficiencyMult *= 1.12;
    activeTags.push('ROOKIE_LATE_BREAKOUT');
  }

  const varianceStdDev =
    player.volatility === 'STEADY'
      ? 0.17
      : player.volatility === 'BOOM_BUST'
      ? 0.42
      : 0.27;

  return {
    volumeMult,
    efficiencyMult,
    tdMult,
    injuryRiskMult,
    varianceStdDev,
    activeTags,
  };
}

/**
 * Cryptic Film Room clues unlocked progressively as the user levels up their Analyst skill.
 * They hint at hidden modifiers without revealing exact formulas.
 */
export const FILM_ROOM_CLUES: readonly { analystLevel: number; id: string; text: string }[] = [
  {
    analystLevel: 1,
    id: 'clue_west_coast_ppr',
    text: 'Film Note #1: Crisp route-runners and sure-handed pass-catchers seem to soak up extra targets in West Coast offenses.',
  },
  {
    analystLevel: 2,
    id: 'clue_winter_weather',
    text: 'Film Note #2: Deep passing numbers dip noticeably in cold and windy stadiums after Week 11—indoor offenses and power runners thrive in December.',
  },
  {
    analystLevel: 3,
    id: 'clue_rb_workload',
    text: 'Film Note #3: Veteran running backs coming off massive 300+ touch seasons look a step slower—and land on the injury report more often—the following year.',
  },
  {
    analystLevel: 4,
    id: 'clue_wr1_gravity',
    text: 'Film Note #4: Defenses bracket superstar wideouts in the red zone, leaving secondary receivers and tight ends on the same offense wide open for scores.',
  },
  {
    analystLevel: 5,
    id: 'clue_oline_trenches',
    text: 'Film Note #5: Trench play hides in plain sight—elite offensive lines turn average backs into league-winners, while shaky lines punish pocket-bound QBs.',
  },
  {
    analystLevel: 6,
    id: 'clue_rookie_surge',
    text: 'Film Note #6: High-IQ rookies often start quiet in September, then surge down the stretch once the playbook clicks after Week 8.',
  },
];
