export type Position = 'QB' | 'RB' | 'WR' | 'TE';

export type Conference = 'Apex' | 'Frontier';
export type Division = 'East' | 'North' | 'South' | 'West';

export type StadiumType =
  | 'DOME'
  | 'COLD_OUTDOOR'
  | 'WARM_OUTDOOR'
  | 'WINDY_OUTDOOR';

export type OffensiveScheme =
  | 'AIR_RAID'
  | 'WEST_COAST'
  | 'GROUND_POUND'
  | 'PLAY_ACTION'
  | 'BALANCED';

export type VolatilityProfile = 'STEADY' | 'BALANCED' | 'BOOM_BUST';

export type AttributeKey =
  | 'speed'
  | 'power'
  | 'agility'
  | 'hands'
  | 'routeRunning'
  | 'vision'
  | 'armStrength'
  | 'accuracy'
  | 'iq'
  | 'durability';

export const ATTRIBUTE_KEYS: AttributeKey[] = [
  'speed',
  'power',
  'agility',
  'hands',
  'routeRunning',
  'vision',
  'armStrength',
  'accuracy',
  'iq',
  'durability',
];

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  speed: 'Speed',
  power: 'Power',
  agility: 'Agility',
  hands: 'Hands',
  routeRunning: 'Route Running',
  vision: 'Vision',
  armStrength: 'Arm Strength',
  accuracy: 'Accuracy',
  iq: 'Football IQ',
  durability: 'Durability',
};

export type Attributes = Record<AttributeKey, number>;

export interface ScoutedRange {
  low: number;
  high: number;
  midpoint: number;
  halfWidth: number;
}

export type ScoutedAttributes = Record<AttributeKey, ScoutedRange>;

export interface ProTeam {
  id: string;
  city: string;
  mascot: string;
  name: string;
  conference: Conference;
  division: Division;
  primaryColor: string;
  accentColor: string;
  stadium: StadiumType;
  scheme: OffensiveScheme;
  /** 1-10 offensive line rating (drives hidden trench modifier) */
  oLineRating: number;
  /** 1-10 pass defense rating */
  passDefRating: number;
  /** 1-10 run defense rating */
  runDefRating: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface PlayerWeeklyStat {
  season: number;
  week: number;
  proTeamId: string;
  opponentId: string;
  isHome: boolean;
  injured: boolean;
  passYards: number;
  passTDs: number;
  interceptions: number;
  rushAttempts: number;
  rushYards: number;
  rushTDs: number;
  targets: number;
  receptions: number;
  recYards: number;
  recTDs: number;
  fumbles: number;
  fantasyPoints: number;
}

export interface PlayerSeasonSummary {
  season: number;
  age: number;
  proTeamId: string;
  gamesPlayed: number;
  passYards: number;
  passTDs: number;
  interceptions: number;
  rushAttempts: number;
  rushYards: number;
  rushTDs: number;
  targets: number;
  receptions: number;
  recYards: number;
  recTDs: number;
  fumbles: number;
  fantasyPoints: number;
  positionRank: number;
}

export type PracticeStatus = 'FULL' | 'LIMITED' | 'DNP';

export type TrendDirection =
  | 'SURGING'
  | 'RISING'
  | 'STEADY'
  | 'COOLING'
  | 'SLUMPING';

export interface PlayerWeeklyIntel {
  week: number;
  /** 1-based overall fantasy rank among all active players */
  fantasyRank: number;
  /** True when fantasyRank <= 200; players outside Top 200 do not get advanced intel */
  isTop200: boolean;
  practiceStatus: PracticeStatus;
  /** Estimated offensive snap share percentage (0 - 100) */
  snapShare: number;
  /** Week-over-week snap share change in percentage points */
  snapDelta: number;
  trendDirection: TrendDirection;
  /** Autoregressive momentum factor [-0.35, +0.35] driving point trends + RNG */
  trendMomentum: number;
  /** Combined gameplay multiplier applied in the weekly simulator */
  performanceMultiplier: number;
  headline: string;
  blurbs: string[];
}

export interface WeeklyNewsItem {
  id: string;
  week: number;
  category: 'PRACTICE' | 'SNAP_SHARE' | 'META_HINT' | 'TREND' | 'WEATHER';
  impact: 'POSITIVE' | 'WARNING' | 'NEGATIVE' | 'INFO';
  headline: string;
  body: string;
  playerId?: string;
  proTeamId?: string;
}

export interface Player {
  id: string;
  name: string;
  position: Position;
  proTeamId: string;
  age: number;
  experience: number; // 0 = rookie
  draftedYear: number;
  /** True 1.0 - 10.0 attributes (hidden behind scouting fog of war) */
  trueAttributes: Attributes;
  /** True 1.0 - 10.0 position-weighted overall */
  trueOverall: number;
  /** Hidden development ceiling 1.0 - 10.0 */
  potential: number;
  /** Hidden weekly variance profile */
  volatility: VolatilityProfile;
  /** Hidden prior season touches (feeds RB 300-touch workload cliff modifier) */
  priorSeasonTouches: number;
  /** Deterministic seed so player's scouting bias stays stable within a season */
  scoutingSeed: number;
  /** Weeks remaining injured (0 = healthy) */
  injuryWeeks: number;
  /** Current fantasy team owner ID (null = Free Agent) */
  fantasyTeamId: string | null;
  /** Current season accumulated stats */
  seasonStats: PlayerSeasonSummary;
  /** Past seasons */
  careerHistory: PlayerSeasonSummary[];
  /** Weekly game logs for the current season */
  weeklyLogs: PlayerWeeklyStat[];
  /** Rolling weekly fantasy point history for trending chart */
  pointTrendHistory: number[];
  /** Weekly practice, snap share, and Top-200 info blob */
  weeklyIntel: PlayerWeeklyIntel;
  retired: boolean;
}

export type AIPersonality =
  | 'WIN_NOW'
  | 'YOUTH_MOVEMENT'
  | 'ZERO_RB'
  | 'HERO_RB'
  | 'BPA_SHARK'
  | 'UPSIDE_GAMBLER';

export interface LineupSlots {
  QB: string | null;
  RB1: string | null;
  RB2: string | null;
  WR1: string | null;
  WR2: string | null;
  TE: string | null;
  FLEX1: string | null;
  FLEX2: string | null;
}

export type LineupSlotKey = keyof LineupSlots;

export const STARTER_SLOTS: LineupSlotKey[] = [
  'QB',
  'RB1',
  'RB2',
  'WR1',
  'WR2',
  'TE',
  'FLEX1',
  'FLEX2',
];

export interface DraftPickAsset {
  id: string;
  season: number;
  round: number; // 1, 2, 3
  originalOwnerId: string;
  currentOwnerId: string;
}

export interface FantasyTeam {
  id: string;
  name: string;
  ownerName: string;
  isUser: boolean;
  personality: AIPersonality;
  rosterIds: string[];
  taxiIds: string[];
  lineup: LineupSlots;
  futurePicks: DraftPickAsset[];
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  championships: number;
  playoffAppearances: number;
}

export type WeatherSeverity = 'IDEAL' | 'ADVERSE' | 'SEVERE';

export interface ProMatchup {
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  played: boolean;
  homeScore: number;
  awayScore: number;
  weatherNote: string;
  weatherSeverity?: WeatherSeverity;
  tempF?: number;
  windMph?: number;
}

export interface FantasyMatchup {
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  played: boolean;
  homeScore: number;
  awayScore: number;
  isPlayoff?: boolean;
  playoffLabel?: string;
}

export interface DraftPickRecord {
  overallPick: number;
  round: number;
  pickInRound: number;
  fantasyTeamId: string;
  playerId: string;
  playerName: string;
  position: Position;
}

export type AutopickStrategy =
  | 'BALANCED'
  | 'WIN_NOW'
  | 'YOUTH_MOVEMENT'
  | 'ZERO_RB'
  | 'HERO_RB';

export const AUTOPICK_STRATEGY_LABELS: Record<AutopickStrategy, string> = {
  BALANCED: 'Balanced (BPA + Need)',
  WIN_NOW: 'Win Now (Best Scouted OVR)',
  YOUTH_MOVEMENT: 'Youth Movement (Age ≤ 24)',
  ZERO_RB: 'Zero-RB (WR/TE Heavy)',
  HERO_RB: 'Hero-RB (1 Anchor RB)',
};

export interface DraftState {
  type: 'STARTUP' | 'ROOKIE';
  season: number;
  totalRounds: number;
  order: string[]; // 12 fantasy team IDs
  currentPickIndex: number; // 0-based overall pick index
  picks: DraftPickRecord[];
  completed: boolean;
  poolIds: string[]; // Eligible player IDs
  autopickEnabled: boolean;
  autopickStrategy: AutopickStrategy;
  userQueue: string[];
}

export interface ManagerSkills {
  /** Reduces attribute scouting uncertainty band */
  scouting: number; // 0-10
  /** Unlocks subtle Film Room clues about hidden modifiers */
  analyst: number; // 0-10
  /** Boosts trade leverage & rookie scouting accuracy */
  frontOffice: number; // 0-10
}

export interface ManagerProfile {
  name: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
  skillPoints: number;
  skills: ManagerSkills;
  discoveredClues: string[];
  careerWins: number;
  careerLosses: number;
  championships: number;
  playoffBerths: number;
}

export interface SeasonHistoryEntry {
  season: number;
  championTeamId: string;
  championTeamName: string;
  userRank: number;
  userWins: number;
  userLosses: number;
  userPointsFor: number;
  userPlayoffResult: string;
  leagueMvpName: string;
  leagueMvpPos: Position;
  leagueMvpPoints: number;
  userBestPlayerName: string;
  userBestPlayerPoints: number;
  userDraftSteal: string;
  userDraftBust: string;
  xpEarned: number;
}

export interface HallOfFameEntry {
  playerId: string;
  name: string;
  position: Position;
  proTeamName: string;
  retiredSeason: number;
  seasonsPlayed: number;
  careerFantasyPoints: number;
  peakSeasonPoints: number;
}

export interface WeeklyDigest {
  season: number;
  week: number;
  userScore: number;
  opponentScore: number;
  opponentName: string;
  won: boolean;
  mvpName: string;
  mvpPoints: number;
  dudName: string;
  dudPoints: number;
  injuries: string[];
  xpGained: number;
  notes: string[];
}

export type LeaguePhase =
  | 'STARTUP_DRAFT'
  | 'REGULAR_SEASON'
  | 'PLAYOFFS'
  | 'OFFSEASON_SUMMARY'
  | 'ROOKIE_DRAFT';

export interface IncomingTradeOffer {
  id: string;
  fromTeamId: string;
  fromTeamName: string;
  fromOwnerName: string;
  fromPersonality: AIPersonality;
  weekOffered: number;
  expiresWeek: number;
  aiGivesPlayerId: string;
  userGivesPlayerId: string;
  pitch: string;
}

export interface DynastyState {
  id: string;
  seed: number;
  season: number;
  week: number; // 1..14 regular, 15..17 playoffs
  phase: LeaguePhase;
  proTeams: Record<string, ProTeam>;
  players: Record<string, Player>;
  fantasyTeams: Record<string, FantasyTeam>;
  userTeamId: string;
  proSchedule: ProMatchup[];
  fantasySchedule: FantasyMatchup[];
  draft: DraftState | null;
  manager: ManagerProfile;
  seasonHistory: SeasonHistoryEntry[];
  hallOfFame: HallOfFameEntry[];
  lastWeeklyDigest: WeeklyDigest | null;
  /** Startup/rookie draft records for current season to compute steals/busts */
  seasonDraftRecords: DraftPickRecord[];
  /** Major fantasy news of the week (practice reports, snap share alerts, hidden modifier tells) */
  weeklyNews: WeeklyNewsItem[];
  /** Sparing AI-initiated trade offers awaiting user accept/decline */
  incomingTradeOffers?: IncomingTradeOffer[];
}
