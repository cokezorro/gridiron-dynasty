import { Conference, Division, OffensiveScheme, ProTeam, StadiumType } from './types';
import { SeededRNG, clamp, round1 } from './rng';

interface TeamTemplate {
  id: string;
  city: string;
  mascot: string;
  conference: Conference;
  division: Division;
  primaryColor: string;
  accentColor: string;
  stadium: StadiumType;
  scheme: OffensiveScheme;
}

/**
 * 32 major-league football cities with 100% original mascots, authentic stadium
 * weather profiles, and varied offensive schemes.
 */
export const PRO_TEAM_TEMPLATES: readonly TeamTemplate[] = [
  // Apex East
  { id: 'NYE', city: 'New York', mascot: 'Empire', conference: 'Apex', division: 'East', primaryColor: '#1E3A8A', accentColor: '#EF4444', stadium: 'COLD_OUTDOOR', scheme: 'WEST_COAST' },
  { id: 'PHI', city: 'Philadelphia', mascot: 'Liberty', conference: 'Apex', division: 'East', primaryColor: '#065F46', accentColor: '#A7F3D0', stadium: 'COLD_OUTDOOR', scheme: 'GROUND_POUND' },
  { id: 'DAL', city: 'Dallas', mascot: 'Outlaws', conference: 'Apex', division: 'East', primaryColor: '#0F172A', accentColor: '#38BDF8', stadium: 'DOME', scheme: 'AIR_RAID' },
  { id: 'WAS', city: 'Washington', mascot: 'Sentinels', conference: 'Apex', division: 'East', primaryColor: '#7F1D1D', accentColor: '#F59E0B', stadium: 'COLD_OUTDOOR', scheme: 'BALANCED' },

  // Apex North
  { id: 'GB', city: 'Green Bay', mascot: 'Timberjacks', conference: 'Apex', division: 'North', primaryColor: '#14532D', accentColor: '#FACC15', stadium: 'COLD_OUTDOOR', scheme: 'PLAY_ACTION' },
  { id: 'CHI', city: 'Chicago', mascot: 'Lakehawks', conference: 'Apex', division: 'North', primaryColor: '#172554', accentColor: '#F97316', stadium: 'WINDY_OUTDOOR', scheme: 'GROUND_POUND' },
  { id: 'DET', city: 'Detroit', mascot: 'Ironworks', conference: 'Apex', division: 'North', primaryColor: '#0284C7', accentColor: '#E2E8F0', stadium: 'DOME', scheme: 'AIR_RAID' },
  { id: 'MIN', city: 'Minnesota', mascot: 'Valkyries', conference: 'Apex', division: 'North', primaryColor: '#4C1D95', accentColor: '#FBBF24', stadium: 'DOME', scheme: 'WEST_COAST' },

  // Apex South
  { id: 'ATL', city: 'Atlanta', mascot: 'Firebirds', conference: 'Apex', division: 'South', primaryColor: '#991B1B', accentColor: '#111827', stadium: 'DOME', scheme: 'PLAY_ACTION' },
  { id: 'NO', city: 'New Orleans', mascot: 'Brass', conference: 'Apex', division: 'South', primaryColor: '#1C1917', accentColor: '#D97706', stadium: 'DOME', scheme: 'WEST_COAST' },
  { id: 'TB', city: 'Tampa Bay', mascot: 'Corsairs', conference: 'Apex', division: 'South', primaryColor: '#B91C1C', accentColor: '#94A3B8', stadium: 'WARM_OUTDOOR', scheme: 'AIR_RAID' },
  { id: 'CAR', city: 'Carolina', mascot: 'Ridgebacks', conference: 'Apex', division: 'South', primaryColor: '#0369A1', accentColor: '#0F172A', stadium: 'WARM_OUTDOOR', scheme: 'BALANCED' },

  // Apex West
  { id: 'SF', city: 'San Francisco', mascot: 'Goldrush', conference: 'Apex', division: 'West', primaryColor: '#991B1B', accentColor: '#CA8A04', stadium: 'WARM_OUTDOOR', scheme: 'PLAY_ACTION' },
  { id: 'SEA', city: 'Seattle', mascot: 'Cascades', conference: 'Apex', division: 'West', primaryColor: '#0F172A', accentColor: '#22C55E', stadium: 'WINDY_OUTDOOR', scheme: 'BALANCED' },
  { id: 'LAQ', city: 'Los Angeles', mascot: 'Quake', conference: 'Apex', division: 'West', primaryColor: '#1D4ED8', accentColor: '#FACC15', stadium: 'DOME', scheme: 'AIR_RAID' },
  { id: 'ARI', city: 'Arizona', mascot: 'Scorpions', conference: 'Apex', division: 'West', primaryColor: '#9F1239', accentColor: '#F8FAFC', stadium: 'DOME', scheme: 'WEST_COAST' },

  // Frontier East
  { id: 'BUF', city: 'Buffalo', mascot: 'Blizzard', conference: 'Frontier', division: 'East', primaryColor: '#1D4ED8', accentColor: '#DC2626', stadium: 'WINDY_OUTDOOR', scheme: 'AIR_RAID' },
  { id: 'MIA', city: 'Miami', mascot: 'Riptide', conference: 'Frontier', division: 'East', primaryColor: '#0D9488', accentColor: '#FB923C', stadium: 'WARM_OUTDOOR', scheme: 'WEST_COAST' },
  { id: 'NE', city: 'New England', mascot: 'Minutemen', conference: 'Frontier', division: 'East', primaryColor: '#1E293B', accentColor: '#EF4444', stadium: 'COLD_OUTDOOR', scheme: 'BALANCED' },
  { id: 'NYH', city: 'New York', mascot: 'Harbor', conference: 'Frontier', division: 'East', primaryColor: '#047857', accentColor: '#F8FAFC', stadium: 'WINDY_OUTDOOR', scheme: 'GROUND_POUND' },

  // Frontier North
  { id: 'BAL', city: 'Baltimore', mascot: 'Nightwings', conference: 'Frontier', division: 'North', primaryColor: '#3B0764', accentColor: '#F59E0B', stadium: 'COLD_OUTDOOR', scheme: 'GROUND_POUND' },
  { id: 'CIN', city: 'Cincinnati', mascot: 'Riverkings', conference: 'Frontier', division: 'North', primaryColor: '#EA580C', accentColor: '#18181B', stadium: 'COLD_OUTDOOR', scheme: 'AIR_RAID' },
  { id: 'CLE', city: 'Cleveland', mascot: 'Forgers', conference: 'Frontier', division: 'North', primaryColor: '#7C2D12', accentColor: '#FB923C', stadium: 'WINDY_OUTDOOR', scheme: 'GROUND_POUND' },
  { id: 'PIT', city: 'Pittsburgh', mascot: 'Foundry', conference: 'Frontier', division: 'North', primaryColor: '#18181B', accentColor: '#FACC15', stadium: 'COLD_OUTDOOR', scheme: 'BALANCED' },

  // Frontier South
  { id: 'HOU', city: 'Houston', mascot: 'Orbit', conference: 'Frontier', division: 'South', primaryColor: '#1E3A8A', accentColor: '#E11D48', stadium: 'DOME', scheme: 'PLAY_ACTION' },
  { id: 'IND', city: 'Indianapolis', mascot: 'Racers', conference: 'Frontier', division: 'South', primaryColor: '#1D4ED8', accentColor: '#F8FAFC', stadium: 'DOME', scheme: 'BALANCED' },
  { id: 'JAX', city: 'Jacksonville', mascot: 'Barracudas', conference: 'Frontier', division: 'South', primaryColor: '#115E59', accentColor: '#D97706', stadium: 'WARM_OUTDOOR', scheme: 'WEST_COAST' },
  { id: 'TEN', city: 'Tennessee', mascot: 'Drifters', conference: 'Frontier', division: 'South', primaryColor: '#1E3A8A', accentColor: '#38BDF8', stadium: 'WARM_OUTDOOR', scheme: 'GROUND_POUND' },

  // Frontier West
  { id: 'KC', city: 'Kansas City', mascot: 'Monarchs', conference: 'Frontier', division: 'West', primaryColor: '#B91C1C', accentColor: '#FACC15', stadium: 'COLD_OUTDOOR', scheme: 'AIR_RAID' },
  { id: 'DEN', city: 'Denver', mascot: 'Altitude', conference: 'Frontier', division: 'West', primaryColor: '#C2410C', accentColor: '#1E3A8A', stadium: 'COLD_OUTDOOR', scheme: 'PLAY_ACTION' },
  { id: 'LV', city: 'Las Vegas', mascot: 'Highrollers', conference: 'Frontier', division: 'West', primaryColor: '#18181B', accentColor: '#CBD5E1', stadium: 'DOME', scheme: 'WEST_COAST' },
  { id: 'LAS', city: 'Los Angeles', mascot: 'Sol', conference: 'Frontier', division: 'West', primaryColor: '#0284C7', accentColor: '#FACC15', stadium: 'DOME', scheme: 'PLAY_ACTION' },
];

export function generateProTeams(rng: SeededRNG): Record<string, ProTeam> {
  const teams: Record<string, ProTeam> = {};
  for (const t of PRO_TEAM_TEMPLATES) {
    teams[t.id] = {
      ...t,
      name: `${t.city} ${t.mascot}`,
      oLineRating: round1(clamp(rng.gaussian(6.0, 1.8), 2.5, 9.6)),
      passDefRating: round1(clamp(rng.gaussian(6.0, 1.6), 2.8, 9.5)),
      runDefRating: round1(clamp(rng.gaussian(6.0, 1.6), 2.8, 9.5)),
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    };
  }
  return teams;
}
