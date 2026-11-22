import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  AIPersonality,
  AUTOPICK_STRATEGY_LABELS,
  AutopickStrategy,
  DraftPickRecord,
  DynastyState,
  LineupSlotKey,
  Player,
  Position,
  STARTER_SLOTS,
  TRADE_DEADLINE_WEEK,
  acceptIncomingTradeOffer,
  advanceToRookieDraft,
  autoOptimizeUserLineup,
  autoPickUserTurn,
  createNewDynasty,
  declineIncomingTradeOffer,
  evaluateTradeProposal,
  executeTrade,
  formatScoutedRange,
  getDraftPickTeamId,
  getMatchupWeatherSeverity,
  getPlayerWeekWeatherReport,
  getRecommendedAutoPick,
  getScoutedOverall,
  getScoutingHalfWidth,
  isPositionEligibleForSlot,
  isTradeWindowOpen,
  makeUserDraftPick,
  movePlayerTaxi,
  setDraftAutopick,
  setLineupSlot,
  signFreeAgent,
  simRemainingDraft,
  simulateToEndOfSeason,
  simulateWeek,
  sortStandings,
  spendSkillPoint,
  stepAutoDraftPick,
  toggleDraftQueuePlayer,
} from './src/engine';
import { clearDynastyState, loadDynastyState, saveDynastyState } from './src/storage';
import { COLORS, POS_COLORS, SCHEME_LABELS, STADIUM_LABELS } from './src/ui/theme';
import { Btn } from './src/ui/Btn';
import { PlayerDetailModal } from './src/ui/PlayerDetailModal';
import { MainMenu } from './src/ui/MainMenu';

type AppScreen = 'MENU' | 'DYNASTY';
type MainTab = 'HUB' | 'NEWS' | 'ROSTER' | 'PLAYERS' | 'LEAGUE' | 'CAREER';
type DraftViewTab = 'BOARD' | 'LOG' | 'TEAMS';

interface WallCalendarCell {
  id: string;
  dateLabel: string;
  week?: number;
  phaseTag: 'PRE' | 'REG' | 'PLAYOFFS' | 'OFFSEASON';
  eventTag?: string;
  eventTone?: 'accent' | 'success' | 'warning' | 'danger' | 'neutral';
  detail: string;
}

interface WallCalendarMonth {
  monthTitle: string;
  cells: WallCalendarCell[];
}

function buildWallCalendarMonths(season: number): WallCalendarMonth[] {
  return [
    {
      monthTitle: `SEPTEMBER ${season}`,
      cells: [
        { id: 'pre_draft', dateLabel: 'SEP 6', phaseTag: 'PRE', eventTag: 'DRAFT DAY', eventTone: 'accent', detail: 'Dynasty Draft & initial roster construction before Week 1 kickoff.' },
        { id: 'wk_1', dateLabel: 'SEP 13', week: 1, phaseTag: 'REG', eventTag: 'SEASON OPENER', eventTone: 'success', detail: 'Regular season kicks off. Weekly beat-reporter news & Top-200 practice reports begin.' },
        { id: 'wk_2', dateLabel: 'SEP 20', week: 2, phaseTag: 'REG', detail: 'Early-season waiver wire & lineup adjustments.' },
        { id: 'wk_3', dateLabel: 'SEP 27', week: 3, phaseTag: 'REG', detail: 'First 3-week sample size for snap shares and point trends.' },
      ],
    },
    {
      monthTitle: `OCTOBER ${season}`,
      cells: [
        { id: 'wk_4', dateLabel: 'OCT 4', week: 4, phaseTag: 'REG', detail: 'Quarter-pole standings check across the 12-team league.' },
        { id: 'wk_5', dateLabel: 'OCT 11', week: 5, phaseTag: 'REG', eventTag: 'EARLY TRENDS', eventTone: 'neutral', detail: 'Buy-low and sell-high window heats up before midseason.' },
        { id: 'wk_6', dateLabel: 'OCT 18', week: 6, phaseTag: 'REG', detail: 'Regular season matchup week.' },
        { id: 'wk_7', dateLabel: 'OCT 25', week: 7, phaseTag: 'REG', eventTag: 'MIDSEASON', eventTone: 'warning', detail: 'Halfway mark of the 14-week regular season. Contenders and rebuilders separate.' },
      ],
    },
    {
      monthTitle: `NOVEMBER ${season}`,
      cells: [
        { id: 'wk_8', dateLabel: 'NOV 1', week: 8, phaseTag: 'REG', detail: 'Second half of the regular season begins.' },
        { id: 'wk_9', dateLabel: 'NOV 8', week: 9, phaseTag: 'REG', eventTag: 'DEADLINE EVE', eventTone: 'warning', detail: 'One week left before the Week 10 Trade Deadline.' },
        { id: 'wk_10', dateLabel: 'NOV 15', week: 10, phaseTag: 'REG', eventTag: 'TRADE DEADLINE', eventTone: 'danger', detail: 'FINAL WEEK TO MAKE TRADES! Trading locks once Week 10 concludes.' },
        { id: 'wk_11', dateLabel: 'NOV 22', week: 11, phaseTag: 'REG', eventTag: 'TRADES LOCKED', eventTone: 'danger', detail: 'Trade window is closed until the offseason. Waivers & lineup management only.' },
        { id: 'wk_12', dateLabel: 'NOV 29', week: 12, phaseTag: 'REG', eventTag: 'WINTER WEATHER', eventTone: 'warning', detail: 'Late-season cold & windy outdoor stadium weather window opens.' },
      ],
    },
    {
      monthTitle: `DECEMBER ${season}`,
      cells: [
        { id: 'wk_13', dateLabel: 'DEC 6', week: 13, phaseTag: 'REG', eventTag: 'PLAYOFF PUSH', eventTone: 'neutral', detail: 'Penultimate regular-season week for bubble teams fighting for Top 6.' },
        { id: 'wk_14', dateLabel: 'DEC 13', week: 14, phaseTag: 'REG', eventTag: 'SEASON FINALE', eventTone: 'warning', detail: 'Final regular-season week! Top 6 playoff seeds and Top 2 byes are locked.' },
        { id: 'wk_15', dateLabel: 'DEC 20', week: 15, phaseTag: 'PLAYOFFS', eventTag: 'PLAYOFFS RD 1', eventTone: 'accent', detail: 'Quarterfinals: #3 vs #6 and #4 vs #5. Seeds #1 & #2 enjoy a first-round bye.' },
        { id: 'wk_16', dateLabel: 'DEC 27', week: 16, phaseTag: 'PLAYOFFS', eventTag: 'SEMIFINALS', eventTone: 'accent', detail: 'Final Four matchups to punch a ticket to the Dynasty Championship.' },
      ],
    },
    {
      monthTitle: `JANUARY ${season + 1}`,
      cells: [
        { id: 'wk_17', dateLabel: 'JAN 3', week: 17, phaseTag: 'PLAYOFFS', eventTag: 'CHAMPIONSHIP', eventTone: 'success', detail: 'Dynasty Championship Week! Crown the league champion and League MVP.' },
        { id: 'off_open', dateLabel: 'JAN 10', phaseTag: 'OFFSEASON', eventTag: 'TRADES REOPEN', eventTone: 'success', detail: 'Offseason begins: season awards logged, manager XP awarded, and trading reopens.' },
        { id: 'off_rookie', dateLabel: 'JAN 17', phaseTag: 'OFFSEASON', eventTag: 'ROOKIE DRAFT', eventTone: 'accent', detail: 'Player aging, veteran retirements, Hall of Fame inductions, and the 3-Round Rookie Draft.' },
      ],
    },
  ];
}

const AI_STRATEGY_SHORT: Record<AIPersonality, string> = {
  WIN_NOW: 'WIN NOW',
  YOUTH_MOVEMENT: 'YOUTH',
  ZERO_RB: 'ZERO-RB',
  HERO_RB: 'HERO-RB',
  BPA_SHARK: 'BPA SHARK',
  UPSIDE_GAMBLER: 'UPSIDE',
};

function fmtDraftPick(r: DraftPickRecord): string {
  return `${r.round}.${String(r.pickInRound).padStart(2, '0')}`;
}

function countDraftPositions(picks: DraftPickRecord[]): Record<Position, number> {
  const c: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const r of picks) c[r.position] = (c[r.position] ?? 0) + 1;
  return c;
}

function detectPositionRun(picks: DraftPickRecord[]): string | null {
  if (picks.length < 3) return null;
  const lastPos = picks[picks.length - 1].position;
  let streak = 1;
  for (let i = picks.length - 2; i >= 0; i--) {
    if (picks[i].position === lastPos) streak++;
    else break;
  }
  if (streak >= 3) return `${streak} STRAIGHT ${lastPos}s OFF THE BOARD`;
  if (picks.length >= 5) {
    const tail5 = picks.slice(-5);
    const counts = countDraftPositions(tail5);
    for (const pos of ['QB', 'RB', 'WR', 'TE'] as const) {
      if (counts[pos] >= 4) return `${counts[pos]} ${pos}s IN LAST 5 PICKS`;
    }
  }
  return null;
}

function getUserPlayerNewsTone(
  p: Player,
  newsImpact?: 'POSITIVE' | 'WARNING' | 'NEGATIVE' | 'INFO'
): 'GREEN' | 'RED' {
  if (newsImpact === 'NEGATIVE' || newsImpact === 'WARNING') return 'RED';
  if (newsImpact === 'POSITIVE') return 'GREEN';
  const intel = p.weeklyIntel;
  if (
    p.injuryWeeks > 0 ||
    intel?.practiceStatus === 'DNP' ||
    intel?.practiceStatus === 'LIMITED' ||
    (intel?.snapDelta ?? 0) < 0 ||
    intel?.trendDirection === 'COOLING' ||
    intel?.trendDirection === 'SLUMPING'
  ) {
    return 'RED';
  }
  return 'GREEN';
}

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('MENU');
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<DynastyState | null>(null);
  const [tab, setTab] = useState<MainTab>('HUB');
  const [draftView, setDraftView] = useState<DraftViewTab>('BOARD');
  const [draftLogMode, setDraftLogMode] = useState<'SINCE_USER' | 'ALL'>('SINCE_USER');
  const [draftLogTeamId, setDraftLogTeamId] = useState<string>('ALL');
  const [posFilter, setPosFilter] = useState<'ALL' | Position>('ALL');
  const [intelTier, setIntelTier] = useState<'TOP200' | 'OUTSIDE200'>('TOP200');
  const [leagueSubTab, setLeagueSubTab] = useState<'OVERVIEW' | 'CALENDAR' | 'PRO32'>('OVERVIEW');
  const [selectedCalId, setSelectedCalId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [inspectPlayer, setInspectPlayer] = useState<Player | null>(null);
  const [inspectAction, setInspectAction] = useState<{
    label: string;
    handler: (id: string) => void;
  } | null>(null);

  // Roster slot picker state
  const [selectedSlot, setSelectedSlot] = useState<LineupSlotKey | null>(null);
  // Trade machine state
  const [tradeTargetId, setTradeTargetId] = useState<string>('');
  const [tradeGiveId, setTradeGiveId] = useState<string>('');
  const [tradeReceiveId, setTradeReceiveId] = useState<string>('');
  const [tradeMsg, setTradeMsg] = useState<string>('');
  // Free agent drop modal
  const [pendingSignId, setPendingSignId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const saved = await loadDynastyState();
      if (saved) {
        setState(saved);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (state) {
      saveDynastyState(state);
    }
  }, [state]);

  // Live Autopick stepper: when Autopick is toggled ON during a draft, advance 1 pick every 320ms
  const isLiveAutopick = Boolean(
    screen === 'DYNASTY' &&
      state &&
      (state.phase === 'STARTUP_DRAFT' || state.phase === 'ROOKIE_DRAFT') &&
      state.draft &&
      !state.draft.completed &&
      state.draft.autopickEnabled
  );

  useEffect(() => {
    if (!isLiveAutopick) return;
    const timer = setInterval(() => {
      setState((prev) => {
        if (!prev || !prev.draft || prev.draft.completed || !prev.draft.autopickEnabled) return prev;
        return stepAutoDraftPick(prev);
      });
    }, 320);
    return () => clearInterval(timer);
  }, [isLiveAutopick]);

  const userTeam = state ? state.fantasyTeams[state.userTeamId] : null;

  const standings = useMemo(() => {
    if (!state) return [];
    return sortStandings(Object.values(state.fantasyTeams));
  }, [state]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.title}>Loading Gridiron Dynasty...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (screen === 'MENU' || !state || !userTeam) {
    return (
      <MainMenu
        savedState={state}
        onContinueDynasty={() => setScreen('DYNASTY')}
        onStartNewDynasty={(teamName) => {
          const fresh = createNewDynasty({ managerName: 'Coach', teamName });
          setState(fresh);
          setTab('HUB');
          setScreen('DYNASTY');
        }}
      />
    );
  }

  const updateState = (next: DynastyState) => {
    setState(next);
  };

  const returnToMenu = () => {
    if (state.draft?.autopickEnabled) {
      setState(setDraftAutopick(state, false));
    }
    setScreen('MENU');
  };

  const openInspect = (player: Player, label?: string, handler?: (id: string) => void) => {
    setInspectPlayer(player);
    setInspectAction(label && handler ? { label, handler } : null);
  };

  const halfWidth = getScoutingHalfWidth(state.manager, false);

  // ==================== DRAFT ROOM VIEW ====================
  if (state.phase === 'STARTUP_DRAFT' || state.phase === 'ROOKIE_DRAFT') {
    const draft = state.draft!;
    const onClockId = getDraftPickTeamId(draft);
    const isUserTurn = onClockId === state.userTeamId;
    const round = Math.floor(draft.currentPickIndex / 12) + 1;
    const pickInRound = (draft.currentPickIndex % 12) + 1;
    const recommended = getRecommendedAutoPick(state);
    const userQueue = draft.userQueue ?? [];
    const activeStrategy: AutopickStrategy = draft.autopickStrategy ?? 'BALANCED';

    // Picks made since user's most recent selection
    let lastUserPickIdx = -1;
    for (let i = draft.picks.length - 1; i >= 0; i--) {
      if (draft.picks[i].fantasyTeamId === state.userTeamId) {
        lastUserPickIdx = i;
        break;
      }
    }
    const lastUserPick = lastUserPickIdx >= 0 ? draft.picks[lastUserPickIdx] : null;
    const sinceLastPick =
      lastUserPickIdx >= 0 ? draft.picks.slice(lastUserPickIdx + 1) : draft.picks;
    const sinceCounts = countDraftPositions(sinceLastPick);
    const runAlert = detectPositionRun(draft.picks);

    const baseLogPicks =
      draftLogMode === 'SINCE_USER'
        ? sinceLastPick
        : [...draft.picks].reverse();
    const filteredLogPicks =
      draftLogTeamId === 'ALL'
        ? baseLogPicks
        : baseLogPicks.filter((r) => r.fantasyTeamId === draftLogTeamId);

    const pool = draft.poolIds
      .map((id) => state.players[id])
      .filter((p): p is Player => Boolean(p))
      .filter((p) => (posFilter === 'ALL' ? true : p.position === posFilter))
      .filter((p) =>
        search.trim() === ''
          ? true
          : p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.proTeamId.toLowerCase().includes(search.toLowerCase())
      )
      .sort(
        (a, b) =>
          getScoutedOverall(b, state.manager, state.season).midpoint -
          getScoutedOverall(a, state.manager, state.season).midpoint
      );

    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.topBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>
              {draft.type === 'STARTUP' ? 'Dynasty Startup Draft' : `${state.season} Rookie Draft`}
            </Text>
            <Text style={styles.subText}>
              Rd {round}/{draft.totalRounds} · Pick {pickInRound} · Scouting Fog ±{halfWidth.toFixed(1)}
            </Text>
          </View>
          <View style={styles.rowGap}>
            <Btn style={styles.menuBtn} onPress={returnToMenu}>
              <Text style={styles.menuBtnText}>Menu</Text>
            </Btn>
            <View style={styles.pill}>
              <Text style={styles.pillText}>Lv.{state.manager.level}</Text>
            </View>
          </View>
        </View>

        <View style={styles.bannerCard}>
          <Text style={styles.bannerTitle}>
            {isUserTurn
              ? `YOUR PICK — ${userTeam.name} (Roster: ${userTeam.rosterIds.length}/${draft.type === 'STARTUP' ? 16 : 19})`
              : `On the Clock: ${state.fantasyTeams[onClockId]?.name}`}
          </Text>
          {recommended && (
            <Text style={styles.mutedText}>
              Autopick Target: {recommended.position} {recommended.name}
              {userQueue.includes(recommended.id) ? ' (Queued)' : ` (${AUTOPICK_STRATEGY_LABELS[activeStrategy]})`}
            </Text>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 2 }}>
            {(['BALANCED', 'WIN_NOW', 'YOUTH_MOVEMENT', 'ZERO_RB', 'HERO_RB'] as const).map((strat) => (
              <Btn
                key={strat}
                style={[styles.chip, activeStrategy === strat && styles.chipActive, { marginRight: 6 }]}
                onPress={() => updateState(setDraftAutopick(state, Boolean(draft.autopickEnabled), strat))}
              >
                <Text style={[styles.chipText, activeStrategy === strat && styles.chipTextActive]}>
                  {strat.replace('_', ' ')}
                </Text>
              </Btn>
            ))}
          </ScrollView>
          <View style={styles.rowGap}>
            <Btn
              style={[
                styles.btn,
                draft.autopickEnabled ? { backgroundColor: COLORS.success } : styles.btnSecondary,
              ]}
              onPress={() => updateState(setDraftAutopick(state, !draft.autopickEnabled))}
            >
              <Text style={draft.autopickEnabled ? styles.btnPrimaryText : styles.btnText}>
                {draft.autopickEnabled ? 'Autopick: ON (Pause)' : 'Autopick: OFF'}
              </Text>
            </Btn>
            <Btn
              style={[styles.btn, styles.btnSecondary]}
              onPress={() => updateState(autoPickUserTurn(state))}
            >
              <Text style={styles.btnText}>Pick 1</Text>
            </Btn>
            <Btn
              style={[styles.btn, styles.btnPrimary, { flex: 1 }]}
              onPress={() => updateState(simRemainingDraft(state))}
            >
              <Text style={styles.btnPrimaryText}>Sim All</Text>
            </Btn>
          </View>
        </View>

        {/* Draft Room Mode Switcher */}
        <View style={styles.draftModeRow}>
          <Btn
            style={[styles.draftModeBtn, draftView === 'BOARD' && styles.draftModeBtnActive]}
            onPress={() => setDraftView('BOARD')}
          >
            <Text style={[styles.draftModeText, draftView === 'BOARD' && styles.draftModeTextActive]}>
              BOARD
            </Text>
          </Btn>
          <Btn
            style={[styles.draftModeBtn, draftView === 'LOG' && styles.draftModeBtnActive]}
            onPress={() => setDraftView('LOG')}
          >
            <Text style={[styles.draftModeText, draftView === 'LOG' && styles.draftModeTextActive]}>
              LOG ({draft.picks.length}{sinceLastPick.length > 0 ? ` · +${sinceLastPick.length}` : ''})
            </Text>
          </Btn>
          <Btn
            style={[styles.draftModeBtn, draftView === 'TEAMS' && styles.draftModeBtnActive]}
            onPress={() => setDraftView('TEAMS')}
          >
            <Text style={[styles.draftModeText, draftView === 'TEAMS' && styles.draftModeTextActive]}>
              TEAM BUILDS
            </Text>
          </Btn>
        </View>

        {draftView === 'BOARD' && (
          <>
            {draft.picks.length > 0 && (
              <View style={styles.sinceStrip}>
                <View style={styles.sinceHeader}>
                  <Text style={styles.sinceTitle}>
                    {lastUserPick
                      ? `SINCE YOUR ${fmtDraftPick(lastUserPick)} PICK (${sinceLastPick.length})`
                      : `OPENING PICKS (${sinceLastPick.length})`}
                  </Text>
                  <Btn
                    style={styles.sinceLinkBtn}
                    onPress={() => {
                      setDraftLogMode('SINCE_USER');
                      setDraftLogTeamId('ALL');
                      setDraftView('LOG');
                    }}
                  >
                    <Text style={styles.sinceLinkText}>VIEW ALL →</Text>
                  </Btn>
                </View>
                <View style={styles.sinceCountsRow}>
                  {(['QB', 'RB', 'WR', 'TE'] as const).map((pos) => (
                    <View key={pos} style={styles.sinceCountChip}>
                      <View style={[styles.sinceCountDot, { backgroundColor: POS_COLORS[pos] }]} />
                      <Text style={styles.sinceCountText}>
                        {pos} {sinceCounts[pos]}
                      </Text>
                    </View>
                  ))}
                  {runAlert && (
                    <View style={styles.runAlertTag}>
                      <Text style={styles.runAlertTagText}>⚡ {runAlert}</Text>
                    </View>
                  )}
                </View>
                {sinceLastPick.slice(-3).reverse().map((r) => {
                  const ft = state.fantasyTeams[r.fantasyTeamId];
                  const strat = ft?.isUser ? 'YOU' : AI_STRATEGY_SHORT[ft?.personality ?? 'BPA_SHARK'];
                  return (
                    <View key={r.overallPick} style={styles.sinceMiniRow}>
                      <Text style={styles.sinceMiniPick}>{fmtDraftPick(r)}</Text>
                      <View style={[styles.sinceMiniPos, { backgroundColor: POS_COLORS[r.position] }]}>
                        <Text style={styles.sinceMiniPosText}>{r.position}</Text>
                      </View>
                      <Text style={styles.sinceMiniPlayer} numberOfLines={1}>
                        {r.playerName}
                      </Text>
                      <Text style={styles.sinceMiniTeam} numberOfLines={1}>
                        {ft?.name} · {strat}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            <View style={styles.filterRow}>
              {(['ALL', 'QB', 'RB', 'WR', 'TE'] as const).map((pos) => (
                <Btn
                  key={pos}
                  style={[styles.chip, posFilter === pos && styles.chipActive]}
                  onPress={() => setPosFilter(pos)}
                >
                  <Text style={[styles.chipText, posFilter === pos && styles.chipTextActive]}>{pos}</Text>
                </Btn>
              ))}
            </View>

            <TextInput
              style={styles.searchInput}
              placeholder="Search player or pro team..."
              placeholderTextColor={COLORS.muted}
              value={search}
              onChangeText={setSearch}
            />

            <FlatList
              data={pool.slice(0, 80)}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}
              renderItem={({ item }) => {
                const ovr = getScoutedOverall(item, state.manager, state.season);
                const pt = state.proTeams[item.proTeamId];
                const isQueued = userQueue.includes(item.id);
                return (
                  <Btn
                    style={styles.playerRow}
                    onPress={() =>
                      openInspect(
                        item,
                        isUserTurn ? `Draft ${item.name}` : undefined,
                        isUserTurn ? (pid) => updateState(makeUserDraftPick(state, pid)) : undefined
                      )
                    }
                  >
                    <View style={[styles.posBadge, { backgroundColor: POS_COLORS[item.position] }]}>
                      <Text style={styles.posBadgeText}>{item.position}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.playerName}>
                        {item.name} {item.experience === 0 ? '★' : ''}
                      </Text>
                      <Text style={styles.playerMeta}>
                        {pt?.city} {pt?.mascot} · Age {item.age} · {SCHEME_LABELS[pt?.scheme ?? 'BALANCED']}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', marginRight: 6 }}>
                      <Text style={styles.rangeValue}>{formatScoutedRange(ovr)}</Text>
                      <Text style={styles.rangeHint}>OVR</Text>
                    </View>
                    <Btn
                      style={[
                        styles.draftMiniBtn,
                        { backgroundColor: isQueued ? COLORS.warning : COLORS.cardHi },
                      ]}
                      onPress={() => updateState(toggleDraftQueuePlayer(state, item.id))}
                    >
                      <Text style={[styles.draftMiniBtnText, { color: isQueued ? COLORS.ink : COLORS.text }]}>
                        {isQueued ? '✓Q' : '+Q'}
                      </Text>
                    </Btn>
                    {isUserTurn && !draft.autopickEnabled && (
                      <Btn
                        style={styles.draftMiniBtn}
                        onPress={() => updateState(makeUserDraftPick(state, item.id))}
                      >
                        <Text style={styles.draftMiniBtnText}>DRAFT</Text>
                      </Btn>
                    )}
                  </Btn>
                );
              }}
            />
          </>
        )}

        {draftView === 'LOG' && (
          <>
            <View style={styles.filterRow}>
              <Btn
                style={[styles.chip, draftLogMode === 'SINCE_USER' && styles.chipActive]}
                onPress={() => setDraftLogMode('SINCE_USER')}
              >
                <Text style={[styles.chipText, draftLogMode === 'SINCE_USER' && styles.chipTextActive]}>
                  SINCE MY PICK ({sinceLastPick.length})
                </Text>
              </Btn>
              <Btn
                style={[styles.chip, draftLogMode === 'ALL' && styles.chipActive]}
                onPress={() => setDraftLogMode('ALL')}
              >
                <Text style={[styles.chipText, draftLogMode === 'ALL' && styles.chipTextActive]}>
                  ALL PICKS ({draft.picks.length})
                </Text>
              </Btn>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ maxHeight: 38, marginBottom: 8 }}
              contentContainerStyle={{ paddingHorizontal: 14, gap: 6 }}
            >
              <Btn
                style={[styles.chip, draftLogTeamId === 'ALL' && styles.chipActive]}
                onPress={() => setDraftLogTeamId('ALL')}
              >
                <Text style={[styles.chipText, draftLogTeamId === 'ALL' && styles.chipTextActive]}>
                  ALL TEAMS
                </Text>
              </Btn>
              {draft.order.map((tid) => {
                const ft = state.fantasyTeams[tid];
                if (!ft) return null;
                return (
                  <Btn
                    key={tid}
                    style={[styles.chip, draftLogTeamId === tid && styles.chipActive]}
                    onPress={() => setDraftLogTeamId(tid)}
                  >
                    <Text style={[styles.chipText, draftLogTeamId === tid && styles.chipTextActive]}>
                      {ft.isUser ? 'YOU' : ft.name}
                    </Text>
                  </Btn>
                );
              })}
            </ScrollView>

            {runAlert && (
              <View style={styles.runAlertBanner}>
                <Text style={styles.runAlertBannerText}>⚡ POSITION RUN: {runAlert}</Text>
              </View>
            )}

            {draftLogMode === 'SINCE_USER' && lastUserPick && (
              <View style={styles.userAnchorRow}>
                <Text style={styles.userAnchorText}>
                  YOUR LAST PICK · {fmtDraftPick(lastUserPick)} (#{lastUserPick.overallPick}) — {lastUserPick.position} {lastUserPick.playerName}
                </Text>
              </View>
            )}

            <FlatList
              data={filteredLogPicks}
              keyExtractor={(item) => String(item.overallPick)}
              contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}
              ListEmptyComponent={
                <View style={styles.emptyLogBox}>
                  <Text style={styles.mutedText}>
                    {draft.picks.length === 0
                      ? 'No picks made yet. Draft a player or toggle Autopick to begin.'
                      : 'No picks match this filter yet.'}
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const ft = state.fantasyTeams[item.fantasyTeamId];
                const p = state.players[item.playerId];
                const pt = p ? state.proTeams[p.proTeamId] : null;
                const isMine = item.fantasyTeamId === state.userTeamId;
                const stratLabel = isMine ? 'YOU' : AI_STRATEGY_SHORT[ft?.personality ?? 'BPA_SHARK'];
                return (
                  <Btn
                    style={[styles.logRow, isMine && styles.logRowUser]}
                    onPress={() => p && openInspect(p)}
                  >
                    <View style={styles.logPickCol}>
                      <Text style={[styles.logPickCode, isMine && { color: COLORS.accent }]}>
                        {fmtDraftPick(item)}
                      </Text>
                      <Text style={styles.logPickNum}>#{item.overallPick}</Text>
                    </View>
                    <View style={[styles.posBadge, { backgroundColor: POS_COLORS[item.position] }]}>
                      <Text style={styles.posBadgeText}>{item.position}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.playerName}>
                        {item.playerName} {p && p.experience === 0 ? '★' : ''}
                      </Text>
                      <Text style={styles.playerMeta}>
                        {ft?.name} · {pt ? `${pt.city} ${pt.mascot}` : ''}{p ? ` · Age ${p.age}` : ''}
                      </Text>
                    </View>
                    <View style={[styles.stratTag, isMine && styles.stratTagUser]}>
                      <Text style={[styles.stratTagText, isMine && styles.stratTagTextUser]}>
                        {stratLabel}
                      </Text>
                    </View>
                  </Btn>
                );
              }}
            />
          </>
        )}

        {draftView === 'TEAMS' && (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24, gap: 10 }}>
            {draft.order.map((tid, idx) => {
              const ft = state.fantasyTeams[tid];
              if (!ft) return null;
              const teamPicks = draft.picks.filter((r) => r.fantasyTeamId === tid);
              const counts = countDraftPositions(teamPicks);
              const isMine = ft.isUser;
              const stratLabel = isMine ? 'YOU' : AI_STRATEGY_SHORT[ft.personality];
              return (
                <View key={tid} style={[styles.teamBuildCard, isMine && styles.teamBuildCardUser]}>
                  <View style={styles.teamBuildHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.teamBuildName}>
                        #{idx + 1} {ft.name}
                      </Text>
                      <Text style={styles.playerMeta}>
                        {teamPicks.length} drafted
                      </Text>
                    </View>
                    <View style={[styles.stratTag, isMine && styles.stratTagUser]}>
                      <Text style={[styles.stratTagText, isMine && styles.stratTagTextUser]}>
                        {stratLabel}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.sinceCountsRow}>
                    {(['QB', 'RB', 'WR', 'TE'] as const).map((pos) => (
                      <View key={pos} style={styles.sinceCountChip}>
                        <View style={[styles.sinceCountDot, { backgroundColor: POS_COLORS[pos] }]} />
                        <Text style={styles.sinceCountText}>
                          {pos} {counts[pos]}
                        </Text>
                      </View>
                    ))}
                  </View>
                  {teamPicks.length > 0 ? (
                    <View style={{ gap: 4, marginTop: 4 }}>
                      {teamPicks.map((r) => {
                        const p = state.players[r.playerId];
                        return (
                          <Btn
                            key={r.overallPick}
                            style={styles.teamPickRow}
                            onPress={() => p && openInspect(p)}
                          >
                            <Text style={styles.sinceMiniPick}>{fmtDraftPick(r)}</Text>
                            <View style={[styles.sinceMiniPos, { backgroundColor: POS_COLORS[r.position] }]}>
                              <Text style={styles.sinceMiniPosText}>{r.position}</Text>
                            </View>
                            <Text style={styles.sinceMiniPlayer} numberOfLines={1}>
                              {r.playerName}
                            </Text>
                            {p && (
                              <Text style={styles.sinceMiniTeam}>Age {p.age}</Text>
                            )}
                          </Btn>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.mutedText}>No picks yet.</Text>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}

        <PlayerDetailModal
          player={inspectPlayer}
          state={state}
          onClose={() => setInspectPlayer(null)}
          primaryActionLabel={inspectAction?.label}
          onPrimaryAction={inspectAction?.handler}
        />
      </SafeAreaView>
    );
  }

  // ==================== MAIN SEASON & OFFSEASON TABS ====================
  const currentMatchup = state.fantasySchedule.find(
    (m) =>
      m.week === state.week &&
      (m.homeTeamId === state.userTeamId || m.awayTeamId === state.userTeamId)
  );
  const opponentId = currentMatchup
    ? currentMatchup.homeTeamId === state.userTeamId
      ? currentMatchup.awayTeamId
      : currentMatchup.homeTeamId
    : null;
  const opponentTeam = opponentId ? state.fantasyTeams[opponentId] : null;

  const starterIdSet = new Set(Object.values(userTeam.lineup).filter(Boolean) as string[]);
  const benchIds = userTeam.rosterIds.filter((id) => !starterIdSet.has(id));

  const freeAgents = Object.values(state.players)
    .filter((p) => !p.retired && p.fantasyTeamId === null)
    .filter((p) => (posFilter === 'ALL' ? true : p.position === posFilter))
    .filter((p) =>
      search.trim() === ''
        ? true
        : p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.proTeamId.toLowerCase().includes(search.toLowerCase())
    )
    .sort(
      (a, b) =>
        getScoutedOverall(b, state.manager, state.season).midpoint -
        getScoutedOverall(a, state.manager, state.season).midpoint
    );

  const aiTeams = Object.values(state.fantasyTeams).filter((t) => !t.isUser);
  const activeTradeTeam = state.fantasyTeams[tradeTargetId] ?? aiTeams[0];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{userTeam.name}</Text>
          <Text style={styles.subText}>
            {state.season} ·{' '}
            {state.phase === 'OFFSEASON_SUMMARY'
              ? 'Offseason'
              : state.phase === 'PLAYOFFS'
              ? `Playoffs Wk ${state.week}`
              : `Week ${state.week}`}
            {' · '}
            {userTeam.wins}-{userTeam.losses} (12-Team PPR)
          </Text>
        </View>
        <View style={styles.rowGap}>
          <Btn style={styles.menuBtn} onPress={returnToMenu}>
            <Text style={styles.menuBtnText}>Menu</Text>
          </Btn>
          <View style={styles.pill}>
            <Text style={styles.pillText}>
              Lv.{state.manager.level}
              {state.manager.skillPoints > 0 ? ` (+${state.manager.skillPoints} SP)` : ''}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* ================= TAB 1: HUB ================= */}
        {tab === 'HUB' && (
          <View style={styles.sectionPad}>
            {state.phase === 'OFFSEASON_SUMMARY' ? (
              <View style={styles.card}>
                <Text style={styles.cardHeading}>Season {state.season} Complete!</Text>
                {state.seasonHistory[0] && (
                  <>
                    <Text style={styles.bodyText}>
                      Champion: <Text style={styles.bold}>{state.seasonHistory[0].championTeamName}</Text>
                    </Text>
                    <Text style={styles.bodyText}>
                      Your Finish: #{state.seasonHistory[0].userRank} ({state.seasonHistory[0].userWins}-
                      {state.seasonHistory[0].userLosses}) — {state.seasonHistory[0].userPlayoffResult}
                    </Text>
                    <Text style={styles.bodyText}>
                      League MVP: {state.seasonHistory[0].leagueMvpName} ({state.seasonHistory[0].leagueMvpPoints} pts)
                    </Text>
                    <Text style={styles.bodyText}>
                      Draft Steal: {state.seasonHistory[0].userDraftSteal}
                    </Text>
                    <Text style={styles.bodyText}>
                      Draft Bust: {state.seasonHistory[0].userDraftBust}
                    </Text>
                  </>
                )}
                <Btn
                  style={[styles.btn, styles.btnPrimary, { marginTop: 12 }]}
                  onPress={() => updateState(advanceToRookieDraft(state))}
                >
                  <Text style={styles.btnPrimaryText}>
                    Advance to {state.season + 1} Rookie Draft →
                  </Text>
                </Btn>
              </View>
            ) : (
              <View style={styles.card}>
                <View style={[styles.rowBetween, { marginBottom: 6 }]}>
                  <Text style={styles.cardHeading}>
                    {state.phase === 'PLAYOFFS'
                      ? currentMatchup?.playoffLabel ?? `Playoffs Week ${state.week}`
                      : `Week ${state.week} Matchup`}
                  </Text>
                  <Btn
                    style={{
                      backgroundColor: !isTradeWindowOpen(state)
                        ? COLORS.danger
                        : state.week >= TRADE_DEADLINE_WEEK - 1
                        ? COLORS.warning
                        : COLORS.cardHi,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                    }}
                    onPress={() => setTab('ROSTER')}
                  >
                    <Text
                      style={{
                        color: !isTradeWindowOpen(state) || state.week >= TRADE_DEADLINE_WEEK - 1 ? COLORS.ink : COLORS.text,
                        fontSize: 10,
                        fontWeight: '900',
                        letterSpacing: 0.7,
                      }}
                    >
                      {!isTradeWindowOpen(state)
                        ? '🔒 TRADES LOCKED'
                        : state.week === TRADE_DEADLINE_WEEK
                        ? '🔥 DEADLINE WEEK →'
                        : `DEADLINE: WK ${TRADE_DEADLINE_WEEK}`}
                    </Text>
                  </Btn>
                </View>
                <View style={styles.matchupBox}>
                  <View style={{ alignItems: 'center', flex: 1 }}>
                    <Text style={styles.bold}>{userTeam.name}</Text>
                    <Text style={styles.mutedText}>
                      {userTeam.wins}-{userTeam.losses}
                    </Text>
                  </View>
                  <Text style={styles.vsText}>VS</Text>
                  <View style={{ alignItems: 'center', flex: 1 }}>
                    <Text style={styles.bold}>{opponentTeam?.name ?? 'Playoff Bye'}</Text>
                    <Text style={styles.mutedText}>
                      {opponentTeam ? `${opponentTeam.wins}-${opponentTeam.losses}` : 'Resting'}
                    </Text>
                  </View>
                </View>

                <View style={[styles.rowGap, { marginTop: 14 }]}>
                  <Btn
                    style={[styles.btn, styles.btnPrimary, { flex: 1 }]}
                    onPress={() => updateState(simulateWeek(state))}
                  >
                    <Text style={styles.btnPrimaryText}>Sim Week {state.week}</Text>
                  </Btn>
                  <Btn
                    style={[styles.btn, styles.btnSecondary]}
                    onPress={() => updateState(simulateToEndOfSeason(state))}
                  >
                    <Text style={styles.btnText}>Sim Season</Text>
                  </Btn>
                </View>
              </View>
            )}

            {(state.incomingTradeOffers ?? []).map((offer) => {
              const recvP = state.players[offer.aiGivesPlayerId];
              const sendP = state.players[offer.userGivesPlayerId];
              if (!recvP || !sendP) return null;
              return (
                <View key={offer.id} style={[styles.card, { borderLeftColor: COLORS.warning }]}>
                  <View style={[styles.rowBetween, { marginBottom: 4 }]}>
                    <Text style={[styles.tidbitTag, { color: COLORS.warning }]}>
                      INCOMING TRADE OFFER · EXPIRES WK {offer.expiresWeek}
                    </Text>
                    <View style={styles.stratTag}>
                      <Text style={styles.stratTagText}>{AI_STRATEGY_SHORT[offer.fromPersonality]}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardHeading}>{offer.fromTeamName}</Text>
                  <Text style={[styles.mutedText, { marginBottom: 8 }]}>{offer.pitch}</Text>
                  <Btn style={styles.playerRow} onPress={() => openInspect(recvP)}>
                    <View style={[styles.posBadge, { backgroundColor: POS_COLORS[recvP.position] }]}>
                      <Text style={styles.posBadgeText}>{recvP.position}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.tidbitTag, { color: COLORS.success }]}>YOU RECEIVE</Text>
                      <Text style={styles.playerName}>{recvP.name} ({recvP.proTeamId}) · Age {recvP.age}</Text>
                    </View>
                    <Text style={styles.rangeValue}>
                      {formatScoutedRange(getScoutedOverall(recvP, state.manager, state.season))}
                    </Text>
                  </Btn>
                  <Btn style={styles.playerRow} onPress={() => openInspect(sendP)}>
                    <View style={[styles.posBadge, { backgroundColor: POS_COLORS[sendP.position] }]}>
                      <Text style={styles.posBadgeText}>{sendP.position}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.tidbitTag, { color: COLORS.danger }]}>YOU SEND</Text>
                      <Text style={styles.playerName}>{sendP.name} ({sendP.proTeamId}) · Age {sendP.age}</Text>
                    </View>
                    <Text style={styles.rangeValue}>
                      {formatScoutedRange(getScoutedOverall(sendP, state.manager, state.season))}
                    </Text>
                  </Btn>
                  <View style={[styles.rowGap, { marginTop: 4 }]}>
                    <Btn
                      style={[styles.btn, { flex: 1, backgroundColor: COLORS.success }]}
                      onPress={() => {
                        const res = acceptIncomingTradeOffer(state, offer.id);
                        updateState(res.state);
                        setTradeMsg(res.message);
                      }}
                    >
                      <Text style={styles.btnPrimaryText}>Accept Trade</Text>
                    </Btn>
                    <Btn
                      style={[styles.btn, styles.btnSecondary]}
                      onPress={() => updateState(declineIncomingTradeOffer(state, offer.id))}
                    >
                      <Text style={styles.btnText}>Decline</Text>
                    </Btn>
                  </View>
                </View>
              );
            })}

            {state.lastWeeklyDigest && (
              <View style={styles.card}>
                <Text style={styles.cardHeading}>
                  Week {state.lastWeeklyDigest.week} Recap ·{' '}
                  <Text
                    style={{
                      color: state.lastWeeklyDigest.won ? COLORS.success : COLORS.danger,
                    }}
                  >
                    {state.lastWeeklyDigest.won ? 'WIN' : 'LOSS'}
                  </Text>
                </Text>
                <Text style={styles.scoreLine}>
                  {state.lastWeeklyDigest.userScore.toFixed(1)} –{' '}
                  {state.lastWeeklyDigest.opponentScore.toFixed(1)} vs{' '}
                  {state.lastWeeklyDigest.opponentName}
                </Text>
                <Text style={styles.bodyText}>
                  Star: {state.lastWeeklyDigest.mvpName} ({state.lastWeeklyDigest.mvpPoints.toFixed(1)} pts)
                </Text>
                <Text style={styles.bodyText}>
                  Coldest Starter: {state.lastWeeklyDigest.dudName} ({state.lastWeeklyDigest.dudPoints.toFixed(1)} pts)
                </Text>
                <Text style={styles.bodyText}>
                  Manager XP Earned: +{state.lastWeeklyDigest.xpGained} XP
                </Text>
                {state.lastWeeklyDigest.injuries.length > 0 && (
                  <Text style={[styles.bodyText, { color: COLORS.danger }]}>
                    Injuries: {state.lastWeeklyDigest.injuries.join(', ')}
                  </Text>
                )}
                {state.lastWeeklyDigest.notes.map((n, idx) => (
                  <Text key={idx} style={[styles.mutedText, { marginTop: 4 }]}>
                    • {n}
                  </Text>
                ))}
              </View>
            )}

            {/* Quick Standings Snapshot */}
            <View style={styles.card}>
              <Text style={styles.cardHeading}>Dynasty Standings (Top 6 Make Playoffs)</Text>
              {standings.map((t, idx) => (
                <View key={t.id} style={styles.standingRow}>
                  <Text style={[styles.standingRank, idx < 6 && { color: COLORS.success }]}>
                    {idx + 1}
                  </Text>
                  <Text style={[styles.standingName, t.isUser && { color: COLORS.accent, fontWeight: '800' }]}>
                    {t.name}
                  </Text>
                  <Text style={styles.standingRec}>
                    {t.wins}-{t.losses}
                  </Text>
                  <Text style={styles.standingPts}>{t.pointsFor.toFixed(0)} PF</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ================= TAB 2: NEWS & TOP-200 INTEL ================= */}
        {tab === 'NEWS' && (
          <View style={styles.sectionPad}>
            {/* Fantasy Game-Day Weather Slate */}
            {(() => {
              const wkGames = state.proSchedule.filter((m) => m.week === state.week);
              const myProTeams = new Set(
                [...userTeam.rosterIds, ...userTeam.taxiIds]
                  .map((id) => state.players[id]?.proTeamId)
                  .filter(Boolean)
              );
              const sevOrder = { SEVERE: 0, ADVERSE: 1, IDEAL: 2 };
              const sortedGames = [...wkGames].sort((a, b) => {
                const sa = getMatchupWeatherSeverity(a);
                const sb = getMatchupWeatherSeverity(b);
                if (sevOrder[sa] !== sevOrder[sb]) return sevOrder[sa] - sevOrder[sb];
                const ma = myProTeams.has(a.homeTeamId) || myProTeams.has(a.awayTeamId) ? 0 : 1;
                const mb = myProTeams.has(b.homeTeamId) || myProTeams.has(b.awayTeamId) ? 0 : 1;
                return ma - mb;
              });
              return (
                <View style={styles.card}>
                  <Text style={styles.cardHeading}>
                    Week {state.week} Fantasy Game-Day Weather Reports
                  </Text>
                  <Text style={[styles.mutedText, { marginBottom: 8 }]}>
                    Severe and adverse weather games usually suppress passing volume and total output (leaning toward the run), though offenses can occasionally defy the elements. Games involving your rostered players are flagged.
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 2 }}>
                    {sortedGames.map((g) => {
                      const sev = getMatchupWeatherSeverity(g);
                      const hasMine = myProTeams.has(g.homeTeamId) || myProTeams.has(g.awayTeamId);
                      const borderCol =
                        sev === 'SEVERE'
                          ? COLORS.danger
                          : sev === 'ADVERSE'
                          ? COLORS.warning
                          : hasMine
                          ? COLORS.success
                          : COLORS.cardHi;
                      return (
                        <View
                          key={`${g.week}_${g.homeTeamId}_${g.awayTeamId}`}
                          style={[
                            styles.tidbitRow,
                            { width: 205, marginRight: 8, borderLeftColor: borderCol },
                          ]}
                        >
                          <View style={styles.rowBetween}>
                            <Text style={styles.playerName}>
                              {g.awayTeamId} @ {g.homeTeamId}
                            </Text>
                            {hasMine && (
                              <View style={{ backgroundColor: borderCol, paddingHorizontal: 5, paddingVertical: 1 }}>
                                <Text style={{ color: COLORS.ink, fontSize: 9, fontWeight: '900' }}>
                                  YOUR PLAYERS
                                </Text>
                              </View>
                            )}
                          </View>
                          <Text
                            style={[
                              styles.tidbitTag,
                              {
                                color:
                                  sev === 'SEVERE'
                                    ? COLORS.danger
                                    : sev === 'ADVERSE'
                                    ? COLORS.warning
                                    : COLORS.muted,
                              },
                            ]}
                          >
                            {g.weatherNote}
                          </Text>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              );
            })()}

            <View style={styles.card}>
              <Text style={styles.cardHeading}>
                Beat Reporter Wire & Practice Reports — Week {state.week}
              </Text>
              <Text style={[styles.mutedText, { marginBottom: 10 }]}>
                Official league practice participation (FP / LP / DNP) is listed alongside local beat-writer observations from open sessions.
              </Text>
              {(state.weeklyNews ?? []).map((item) => {
                const isPracticeAlert = item.category === 'PRACTICE';
                const tagLabel =
                  item.category === 'PRACTICE'
                    ? 'OFFICIAL PRACTICE REPORT'
                    : item.category === 'WEATHER'
                    ? 'STADIUM & WEATHER DESK'
                    : item.category === 'SNAP_SHARE'
                    ? 'PERSONNEL & ROTATION NOTE'
                    : 'BEAT NOTEBOOK';
                const tagColor = isPracticeAlert ? COLORS.warning : COLORS.muted;
                const linkedPlayer = item.playerId ? state.players[item.playerId] : null;
                const isMine = Boolean(linkedPlayer && linkedPlayer.fantasyTeamId === state.userTeamId);
                const isTaxi = isMine && linkedPlayer ? userTeam.taxiIds.includes(linkedPlayer.id) : false;
                const mineColor =
                  isMine && linkedPlayer
                    ? getUserPlayerNewsTone(linkedPlayer, item.impact) === 'RED'
                      ? COLORS.danger
                      : COLORS.success
                    : null;
                return (
                  <Btn
                    key={item.id}
                    style={[
                      styles.playerRow,
                      { flexDirection: 'column', alignItems: 'flex-start', gap: 4 },
                      mineColor ? { borderLeftWidth: 6, borderLeftColor: mineColor } : null,
                    ]}
                    onPress={() => {
                      if (linkedPlayer) openInspect(linkedPlayer);
                    }}
                  >
                    <View style={[styles.rowBetween, { width: '100%' }]}>
                      <Text style={[styles.rangeHint, { color: tagColor, fontWeight: '800' }]}>
                        {tagLabel} · WK {item.week}
                      </Text>
                      {mineColor && (
                        <View style={{ backgroundColor: mineColor, paddingHorizontal: 7, paddingVertical: 2 }}>
                          <Text style={{ color: COLORS.ink, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 }}>
                            {isTaxi ? 'YOUR TAXI' : 'YOUR ROSTER'}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.playerName}>{item.headline}</Text>
                    <Text style={styles.mutedText}>{item.body}</Text>
                  </Btn>
                );
              })}
            </View>

            <Text style={styles.sectionHeader}>
              Weekly Player Info Blobs & Point Logs
            </Text>
            <View style={styles.rowGap}>
              <Btn
                style={[styles.chip, intelTier === 'TOP200' && styles.chipActive]}
                onPress={() => setIntelTier('TOP200')}
              >
                <Text style={[styles.chipText, intelTier === 'TOP200' && styles.chipTextActive]}>
                  Top 200 (Beat & Practice Intel)
                </Text>
              </Btn>
              <Btn
                style={[styles.chip, intelTier === 'OUTSIDE200' && styles.chipActive]}
                onPress={() => setIntelTier('OUTSIDE200')}
              >
                <Text style={[styles.chipText, intelTier === 'OUTSIDE200' && styles.chipTextActive]}>
                  Outside Top 200 (#201+)
                </Text>
              </Btn>
            </View>

            <TextInput
              style={[styles.searchInput, { marginHorizontal: 0, marginTop: 6 }]}
              placeholder="Filter player intel by name or team..."
              placeholderTextColor={COLORS.muted}
              value={search}
              onChangeText={setSearch}
            />

            {Object.values(state.players)
              .filter((p) => !p.retired && p.weeklyIntel)
              .filter((p) =>
                intelTier === 'TOP200' ? p.weeklyIntel.isTop200 : !p.weeklyIntel.isTop200
              )
              .filter((p) =>
                search.trim() === ''
                  ? true
                  : p.name.toLowerCase().includes(search.toLowerCase()) ||
                    p.proTeamId.toLowerCase().includes(search.toLowerCase())
              )
              .sort((a, b) => a.weeklyIntel.fantasyRank - b.weeklyIntel.fantasyRank)
              .slice(0, 60)
              .map((p) => {
                const intel = p.weeklyIntel;
                const pColor =
                  p.injuryWeeks > 0 || intel.practiceStatus === 'DNP'
                    ? COLORS.danger
                    : intel.practiceStatus === 'LIMITED'
                    ? COLORS.warning
                    : COLORS.text;
                const isMine = p.fantasyTeamId === state.userTeamId;
                const isTaxi = isMine && userTeam.taxiIds.includes(p.id);
                const mineColor = isMine
                  ? getUserPlayerNewsTone(p) === 'RED'
                    ? COLORS.danger
                    : COLORS.success
                  : null;
                const wx = getPlayerWeekWeatherReport(state.proSchedule, p.proTeamId, state.week);
                const wxColor =
                  wx?.severity === 'SEVERE'
                    ? COLORS.danger
                    : wx?.severity === 'ADVERSE'
                    ? COLORS.warning
                    : COLORS.muted;
                const recentPts = (p.pointTrendHistory ?? []).slice(-4).map((v) => v.toFixed(0)).join(' · ');
                return (
                  <Btn
                    key={p.id}
                    style={[
                      styles.playerRow,
                      { flexDirection: 'column', alignItems: 'stretch', gap: 6 },
                      mineColor ? { borderLeftWidth: 6, borderLeftColor: mineColor } : null,
                    ]}
                    onPress={() => openInspect(p)}
                  >
                    <View style={styles.rowBetween}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <Text style={[styles.standingRank, { width: 34, color: COLORS.accent }]}>
                          #{intel.fantasyRank}
                        </Text>
                        <View style={[styles.posBadge, { backgroundColor: POS_COLORS[p.position] }]}>
                          <Text style={styles.posBadgeText}>{p.position}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={styles.playerName}>
                              {p.name} ({p.proTeamId})
                            </Text>
                            {mineColor && (
                              <View style={{ backgroundColor: mineColor, paddingHorizontal: 6, paddingVertical: 1 }}>
                                <Text style={{ color: COLORS.ink, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 }}>
                                  {isTaxi ? 'YOUR TAXI' : 'YOUR ROSTER'}
                                </Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.playerMeta}>
                            Last 4 Wks: {recentPts} pts
                          </Text>
                          {wx && (
                            <Text style={[styles.playerMeta, { color: wxColor, fontWeight: '800' }]}>
                              Wk {state.week} {wx.matchupTag} · {wx.weatherNote}
                            </Text>
                          )}
                        </View>
                      </View>
                      {intel.isTop200 && (
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ color: pColor, fontSize: 11, fontWeight: '900' }}>
                            {p.injuryWeeks > 0
                              ? `OUT (${p.injuryWeeks}W) · DNP`
                              : intel.practiceStatus === 'FULL'
                              ? 'PRACTICE: FULL (FP)'
                              : intel.practiceStatus === 'LIMITED'
                              ? 'PRACTICE: PARTIAL (LP)'
                              : 'PRACTICE: DNP'}
                          </Text>
                          <Text style={styles.playerMeta}>
                            Snap Share: {intel.snapShare}%
                          </Text>
                        </View>
                      )}
                    </View>
                    {intel.blurbs.map((b, bIdx) => (
                      <Text key={bIdx} style={styles.mutedText}>
                        • {b}
                      </Text>
                    ))}
                  </Btn>
                );
              })}
          </View>
        )}

        {/* ================= TAB 3: ROSTER & TRADE ================= */}
        {tab === 'ROSTER' && (
          <View style={styles.sectionPad}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionHeader}>Starting Lineup (1-QB PPR)</Text>
              <Btn
                style={[styles.btn, styles.btnSecondary]}
                onPress={() => updateState(autoOptimizeUserLineup(state))}
              >
                <Text style={styles.btnText}>Auto-Set</Text>
              </Btn>
            </View>

            {STARTER_SLOTS.map((slot) => {
              const pid = userTeam.lineup[slot];
              const p = pid ? state.players[pid] : null;
              const isSelected = selectedSlot === slot;
              const intel = p?.weeklyIntel;
              const pracBadge =
                intel?.isTop200
                  ? intel.practiceStatus === 'FULL'
                    ? `FP · ${intel.snapShare}% Snaps`
                    : intel.practiceStatus === 'LIMITED'
                    ? `LP (Partial) · ${intel.snapShare}% Snaps`
                    : `DNP · ${intel.snapShare}% Snaps`
                  : `Rank #${intel?.fantasyRank ?? '201+'} (Outside Top 200)`;
              const wx = p ? getPlayerWeekWeatherReport(state.proSchedule, p.proTeamId, state.week) : null;
              const wxColor =
                wx?.severity === 'SEVERE'
                  ? COLORS.danger
                  : wx?.severity === 'ADVERSE'
                  ? COLORS.warning
                  : COLORS.muted;
              return (
                <Btn
                  key={slot}
                  style={[styles.playerRow, isSelected && { borderColor: COLORS.accent, borderWidth: 1.5 }]}
                  onPress={() => {
                    if (isSelected) setSelectedSlot(null);
                    else setSelectedSlot(slot);
                  }}
                >
                  <View style={styles.slotTag}>
                    <Text style={styles.slotTagText}>{slot}</Text>
                  </View>
                  {p ? (
                    <>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.playerName}>
                          {p.name} {p.injuryWeeks > 0 ? `(INJ ${p.injuryWeeks}w)` : ''}
                        </Text>
                        <Text style={styles.playerMeta}>
                          {p.proTeamId} · {p.seasonStats.fantasyPoints.toFixed(1)} pts · {pracBadge}
                        </Text>
                        {wx && (
                          <Text style={[styles.playerMeta, { color: wxColor, fontWeight: '800' }]}>
                            Wk {state.week} {wx.matchupTag} · {wx.weatherNote}
                          </Text>
                        )}
                      </View>
                      <Btn onPress={() => openInspect(p)}>
                        <Text style={styles.rangeValue}>
                          {formatScoutedRange(getScoutedOverall(p, state.manager, state.season))}
                        </Text>
                      </Btn>
                    </>
                  ) : (
                    <Text style={styles.mutedText}>Empty — tap bench player to assign</Text>
                  )}
                </Btn>
              );
            })}

            {selectedSlot && (
              <Text style={[styles.mutedText, { marginVertical: 6, color: COLORS.accent }]}>
                Tap an eligible bench player below to put them into {selectedSlot}.
              </Text>
            )}

            <Text style={[styles.sectionHeader, { marginTop: 14 }]}>
              Bench ({benchIds.length})
            </Text>
            {benchIds.map((id) => {
              const p = state.players[id];
              if (!p) return null;
              const eligible = selectedSlot ? isPositionEligibleForSlot(p.position, selectedSlot) : false;
              const intel = p.weeklyIntel;
              const pracBadge =
                intel?.isTop200
                  ? `${intel.practiceStatus === 'FULL' ? 'FP' : intel.practiceStatus === 'LIMITED' ? 'LP' : 'DNP'} · ${intel.snapShare}% Snaps`
                  : `#${intel?.fantasyRank ?? '201+'} (No Top-200 Intel)`;
              const wx = getPlayerWeekWeatherReport(state.proSchedule, p.proTeamId, state.week);
              const wxColor =
                wx?.severity === 'SEVERE'
                  ? COLORS.danger
                  : wx?.severity === 'ADVERSE'
                  ? COLORS.warning
                  : COLORS.muted;
              return (
                <Btn
                  key={id}
                  style={[styles.playerRow, eligible && { borderColor: COLORS.success, borderWidth: 1 }]}
                  onPress={() => {
                    if (selectedSlot && eligible) {
                      updateState(setLineupSlot(state, selectedSlot, p.id));
                      setSelectedSlot(null);
                    } else {
                      openInspect(
                        p,
                        p.experience <= 1 && userTeam.taxiIds.length < 3
                          ? 'Move to Rookie Taxi Squad'
                          : undefined,
                        p.experience <= 1 && userTeam.taxiIds.length < 3
                          ? (pid) => updateState(movePlayerTaxi(state, pid, true))
                          : undefined
                      );
                    }
                  }}
                >
                  <View style={[styles.posBadge, { backgroundColor: POS_COLORS[p.position] }]}>
                    <Text style={styles.posBadgeText}>{p.position}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.playerName}>
                      {p.name} {p.injuryWeeks > 0 ? `(INJ ${p.injuryWeeks}w)` : ''}
                    </Text>
                    <Text style={styles.playerMeta}>
                      {p.proTeamId} · {p.seasonStats.fantasyPoints.toFixed(1)} pts · {pracBadge}
                    </Text>
                    {wx && (
                      <Text style={[styles.playerMeta, { color: wxColor, fontWeight: '800' }]}>
                        Wk {state.week} {wx.matchupTag} · {wx.weatherNote}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.rangeValue}>
                    {formatScoutedRange(getScoutedOverall(p, state.manager, state.season))}
                  </Text>
                </Btn>
              );
            })}

            <Text style={[styles.sectionHeader, { marginTop: 14 }]}>
              Rookie Taxi Squad ({userTeam.taxiIds.length}/3)
            </Text>
            {userTeam.taxiIds.length === 0 ? (
              <Text style={styles.mutedText}>
                Stash rookies & 2nd-year players here from your bench to develop them.
              </Text>
            ) : (
              userTeam.taxiIds.map((id) => {
                const p = state.players[id];
                if (!p) return null;
                return (
                  <Btn
                    key={id}
                    style={styles.playerRow}
                    onPress={() =>
                      openInspect(p, 'Promote to Active Roster', (pid) =>
                        updateState(movePlayerTaxi(state, pid, false))
                      )
                    }
                  >
                    <View style={[styles.posBadge, { backgroundColor: POS_COLORS[p.position] }]}>
                      <Text style={styles.posBadgeText}>{p.position}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.playerName}>{p.name}</Text>
                      <Text style={styles.playerMeta}>
                        {p.proTeamId} · Age {p.age} · Taxi
                      </Text>
                    </View>
                    <Text style={styles.rangeValue}>
                      {formatScoutedRange(getScoutedOverall(p, state.manager, state.season))}
                    </Text>
                  </Btn>
                );
              })
            )}

            {/* Quick 1-for-1 Trade Machine */}
            <View style={[styles.card, { marginTop: 16 }]}>
              <Text style={styles.cardHeading}>Dynasty Trade Machine</Text>
              <Text style={styles.mutedText}>
                Partner: {activeTradeTeam.name} ({activeTradeTeam.personality.replace('_', ' ')})
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
                {aiTeams.map((t) => (
                  <Btn
                    key={t.id}
                    style={[
                      styles.chip,
                      activeTradeTeam.id === t.id && styles.chipActive,
                      { marginRight: 6 },
                    ]}
                    onPress={() => {
                      setTradeTargetId(t.id);
                      setTradeReceiveId('');
                      setTradeMsg('');
                    }}
                  >
                    <Text style={[styles.chipText, activeTradeTeam.id === t.id && styles.chipTextActive]}>
                      {t.name}
                    </Text>
                  </Btn>
                ))}
              </ScrollView>

              <Text style={styles.bodyText}>You Send:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 6 }}>
                {userTeam.rosterIds.map((id) => {
                  const p = state.players[id];
                  if (!p) return null;
                  return (
                    <Btn
                      key={id}
                      style={[styles.chip, tradeGiveId === id && styles.chipActive, { marginRight: 6 }]}
                      onPress={() => setTradeGiveId(id)}
                    >
                      <Text style={[styles.chipText, tradeGiveId === id && styles.chipTextActive]}>
                        {p.position} {p.name}
                      </Text>
                    </Btn>
                  );
                })}
              </ScrollView>

              <Text style={styles.bodyText}>You Receive:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 6 }}>
                {activeTradeTeam.rosterIds.map((id) => {
                  const p = state.players[id];
                  if (!p) return null;
                  return (
                    <Btn
                      key={id}
                      style={[styles.chip, tradeReceiveId === id && styles.chipActive, { marginRight: 6 }]}
                      onPress={() => setTradeReceiveId(id)}
                    >
                      <Text style={[styles.chipText, tradeReceiveId === id && styles.chipTextActive]}>
                        {p.position} {p.name}
                      </Text>
                    </Btn>
                  );
                })}
              </ScrollView>

              <View
                style={[
                  styles.tidbitRow,
                  {
                    marginTop: 8,
                    borderLeftColor: !isTradeWindowOpen(state)
                      ? COLORS.danger
                      : state.phase === 'REGULAR_SEASON' && state.week >= TRADE_DEADLINE_WEEK - 1
                      ? COLORS.warning
                      : COLORS.success,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tidbitTag,
                    {
                      color: !isTradeWindowOpen(state)
                        ? COLORS.danger
                        : state.phase === 'REGULAR_SEASON' && state.week >= TRADE_DEADLINE_WEEK - 1
                        ? COLORS.warning
                        : COLORS.success,
                    },
                  ]}
                >
                  {!isTradeWindowOpen(state)
                    ? `🔒 TRADE DEADLINE PASSED (WK ${TRADE_DEADLINE_WEEK})`
                    : state.phase === 'OFFSEASON_SUMMARY'
                    ? 'TRADES OPEN · OFFSEASON WINDOW'
                    : state.week === TRADE_DEADLINE_WEEK
                    ? '🔥 TRADE DEADLINE WEEK — FINAL CHANCE!'
                    : `TRADES OPEN · DEADLINE AFTER WK ${TRADE_DEADLINE_WEEK} (${TRADE_DEADLINE_WEEK - state.week} WKS LEFT)`}
                </Text>
              </View>

              <Btn
                style={[
                  styles.btn,
                  isTradeWindowOpen(state) ? styles.btnPrimary : styles.btnSecondary,
                  { marginTop: 8, opacity: isTradeWindowOpen(state) ? 1 : 0.5 },
                ]}
                onPress={() => {
                  if (!isTradeWindowOpen(state)) {
                    setTradeMsg(`Trade deadline passed (Week ${TRADE_DEADLINE_WEEK}). Trading reopens in the offseason.`);
                    return;
                  }
                  if (!tradeGiveId || !tradeReceiveId) {
                    setTradeMsg('Select one player to send and one to receive.');
                    return;
                  }
                  const evalRes = evaluateTradeProposal(
                    state,
                    activeTradeTeam.id,
                    [tradeGiveId],
                    [tradeReceiveId]
                  );
                  if (evalRes.accepted) {
                    const res = executeTrade(state, activeTradeTeam.id, [tradeGiveId], [tradeReceiveId]);
                    updateState(res.state);
                    setTradeGiveId('');
                    setTradeReceiveId('');
                    setTradeMsg(`TRADE ACCEPTED! ${res.evaluation.reason}`);
                  } else {
                    setTradeMsg(`Declined: ${evalRes.reason}`);
                  }
                }}
              >
                <Text style={isTradeWindowOpen(state) ? styles.btnPrimaryText : styles.btnText}>
                  {isTradeWindowOpen(state) ? 'Propose Trade' : 'Trades Locked (Past Deadline)'}
                </Text>
              </Btn>
              {tradeMsg !== '' && <Text style={[styles.bodyText, { marginTop: 8, color: COLORS.accent }]}>{tradeMsg}</Text>}
            </View>
          </View>
        )}

        {/* ================= TAB 3: FREE AGENTS ================= */}
        {tab === 'PLAYERS' && (
          <View style={styles.sectionPad}>
            <Text style={styles.sectionHeader}>Waiver Wire / Free Agents</Text>
            <View style={styles.filterRow}>
              {(['ALL', 'QB', 'RB', 'WR', 'TE'] as const).map((pos) => (
                <Btn
                  key={pos}
                  style={[styles.chip, posFilter === pos && styles.chipActive]}
                  onPress={() => setPosFilter(pos)}
                >
                  <Text style={[styles.chipText, posFilter === pos && styles.chipTextActive]}>{pos}</Text>
                </Btn>
              ))}
            </View>
            <TextInput
              style={[styles.searchInput, { marginHorizontal: 0 }]}
              placeholder="Search free agents..."
              placeholderTextColor={COLORS.muted}
              value={search}
              onChangeText={setSearch}
            />
            {pendingSignId && (
              <View style={[styles.card, { borderLeftColor: COLORS.warning }]}>
                <Text style={styles.cardHeading}>
                  Roster full (16/16) — pick a player to drop for {state.players[pendingSignId]?.name}:
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {userTeam.rosterIds.map((rid) => {
                    const rp = state.players[rid];
                    if (!rp) return null;
                    return (
                      <Btn
                        key={rid}
                        style={[styles.chip, { marginRight: 6 }]}
                        onPress={() => {
                          updateState(signFreeAgent(state, pendingSignId, rid));
                          setPendingSignId(null);
                        }}
                      >
                        <Text style={styles.chipText}>Drop {rp.name}</Text>
                      </Btn>
                    );
                  })}
                </ScrollView>
              </View>
            )}
            {freeAgents.slice(0, 45).map((p) => (
              <Btn
                key={p.id}
                style={styles.playerRow}
                onPress={() =>
                  openInspect(p, `Sign ${p.name}`, (pid) => {
                    if (userTeam.rosterIds.length >= 16) {
                      setPendingSignId(pid);
                    } else {
                      updateState(signFreeAgent(state, pid, null));
                    }
                  })
                }
              >
                <View style={[styles.posBadge, { backgroundColor: POS_COLORS[p.position] }]}>
                  <Text style={styles.posBadgeText}>{p.position}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.playerName}>{p.name}</Text>
                  <Text style={styles.playerMeta}>
                    {p.proTeamId} · Age {p.age} · {p.seasonStats.fantasyPoints.toFixed(1)} pts
                  </Text>
                </View>
                <Text style={styles.rangeValue}>
                  {formatScoutedRange(getScoutedOverall(p, state.manager, state.season))}
                </Text>
              </Btn>
            ))}
          </View>
        )}

        {/* ================= TAB 4: LEAGUE OVERVIEW & 32 PRO TEAMS ================= */}
        {tab === 'LEAGUE' && (() => {
          const activePlayers = Object.values(state.players).filter((p) => !p.retired);
          const injuredCount = activePlayers.filter((p) => p.injuryWeeks > 0).length;
          const dnpCount = activePlayers.filter(
            (p) => p.weeklyIntel?.isTop200 && p.weeklyIntel.practiceStatus === 'DNP'
          ).length;
          const topScorer = [...activePlayers].sort(
            (a, b) => b.seasonStats.fantasyPoints - a.seasonStats.fantasyPoints
          )[0];
          const topRookie = [...activePlayers]
            .filter((p) => p.experience === 0)
            .sort((a, b) => b.seasonStats.fantasyPoints - a.seasonStats.fantasyPoints)[0];
          const posLeaders = (['QB', 'RB', 'WR', 'TE'] as const).map((pos) => ({
            pos,
            player: [...activePlayers]
              .filter((p) => p.position === pos)
              .sort((a, b) => b.seasonStats.fantasyPoints - a.seasonStats.fantasyPoints)[0],
          }));

          const teamAges = standings.map((t) => {
            const ids = [...t.rosterIds, ...t.taxiIds];
            const avgAge = ids.length
              ? ids.reduce((s, id) => s + (state.players[id]?.age ?? 25), 0) / ids.length
              : 25;
            return { team: t, avgAge };
          });
          const youngest = [...teamAges].sort((a, b) => a.avgAge - b.avgAge)[0];
          const oldest = [...teamAges].sort((a, b) => b.avgAge - a.avgAge)[0];
          const topScoringTeam = [...standings].sort((a, b) => b.pointsFor - a.pointsFor)[0];
          const proTeamsSorted = Object.values(state.proTeams).sort(
            (a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor
          );
          const hottestPro = [...proTeamsSorted].sort((a, b) => b.pointsFor - a.pointsFor)[0];
          const weeksCompleted = Math.max(0, state.week - 1);
          const avgTeamPpg =
            weeksCompleted > 0
              ? standings.reduce((s, t) => s + t.pointsFor, 0) / (standings.length * weeksCompleted)
              : 0;
          const seed6 = standings[5];
          const seed7 = standings[6];
          const bubbleGap = seed6 && seed7 ? seed6.wins - seed7.wins : 0;
          const bubblePfGap = seed6 && seed7 ? Math.abs(seed6.pointsFor - seed7.pointsFor) : 0;
          const defendingChamp = state.seasonHistory[0];

          const tidbits: { tag: string; text: string }[] = [
            {
              tag: 'DYNASTY CROWN',
              text: defendingChamp
                ? `Defending Champion: ${defendingChamp.championTeamName} (Season ${defendingChamp.season}). ${state.seasonHistory.length} season${state.seasonHistory.length === 1 ? '' : 's'} logged in league history.`
                : `Inaugural ${state.season} Dynasty Season — 12 franchises battling for the first league crown.`,
            },
            {
              tag: 'SCORING PACE',
              text:
                weeksCompleted > 0
                  ? `Teams are averaging ${avgTeamPpg.toFixed(1)} PPG through Week ${weeksCompleted}. ${topScoringTeam?.name} leads the league with ${topScoringTeam?.pointsFor.toFixed(1)} PF.`
                  : `Week 1 kickoff ahead — 12-Team 1-QB Full PPR format with 16 active roster spots and 3 rookie taxi slots.`,
            },
            {
              tag: 'PRO OFFENSE WATCH',
              text: hottestPro
                ? `${hottestPro.name} (${SCHEME_LABELS[hottestPro.scheme]} · ${STADIUM_LABELS[hottestPro.stadium]}) pace the 32-team pro league at ${hottestPro.wins}-${hottestPro.losses}${weeksCompleted > 0 ? ` (${(hottestPro.pointsFor / weeksCompleted).toFixed(1)} PPG)` : ''}.`
                : '32 pro franchises active across 8 divisions.',
            },
            {
              tag: 'YOUTH VS. VETS',
              text:
                youngest && oldest
                  ? `Youngest Roster: ${youngest.team.name} (avg age ${youngest.avgAge.toFixed(1)}). Most Veteran: ${oldest.team.name} (avg age ${oldest.avgAge.toFixed(1)}).`
                  : 'Rosters balanced across age tiers.',
            },
            {
              tag: 'ROOKIE RACE',
              text: topRookie
                ? `Top Rookie Scorer: ${topRookie.position} ${topRookie.name} (${topRookie.proTeamId}) with ${topRookie.seasonStats.fantasyPoints.toFixed(1)} PPR pts${topRookie.fantasyTeamId ? ` — rostered by ${state.fantasyTeams[topRookie.fantasyTeamId]?.name}` : ' (Free Agent)'}.`
                : 'Rookie class taking the field.',
            },
            {
              tag: 'PLAYOFF BUBBLE',
              text:
                state.phase === 'PLAYOFFS'
                  ? `Playoffs are underway! Top 6 seeds compete for the ${state.season} championship.`
                  : seed6 && seed7
                  ? `#6 ${seed6.name} (${seed6.wins}-${seed6.losses}) holds the final playoff spot over #7 ${seed7.name} (${seed7.wins}-${seed7.losses}) by ${bubbleGap === 0 ? `${bubblePfGap.toFixed(1)} PF tiebreaker` : `${bubbleGap} game${bubbleGap === 1 ? '' : 's'}`}.`
                  : 'Top 6 teams advance to the Week 15–17 playoffs.',
            },
            {
              tag: 'TRADE DEADLINE',
              text: !isTradeWindowOpen(state)
                ? `Trade deadline passed after Week ${TRADE_DEADLINE_WEEK}. Trading is locked until the offseason.`
                : state.phase === 'OFFSEASON_SUMMARY'
                ? 'Offseason trade window is OPEN! Reshape your dynasty roster before the Rookie Draft.'
                : state.week === TRADE_DEADLINE_WEEK
                ? `TRADE DEADLINE WEEK! Final week to complete deals before trades lock in Week ${TRADE_DEADLINE_WEEK + 1}.`
                : `Trade window is OPEN — ${TRADE_DEADLINE_WEEK - state.week} week${TRADE_DEADLINE_WEEK - state.week === 1 ? '' : 's'} remaining until the Week ${TRADE_DEADLINE_WEEK} Trade Deadline.`,
            },
            {
              tag: 'CALENDAR & WEATHER',
              text:
                state.week >= 12
                  ? 'Late-season winter weather window is ACTIVE (Weeks 12+) — outdoor windy & cold stadiums are in play.'
                  : `${Math.max(0, 12 - state.week)} week${12 - state.week === 1 ? '' : 's'} until the Week 12 outdoor winter weather window opens; ${Math.max(0, 15 - state.week)} week${15 - state.week === 1 ? '' : 's'} until playoffs.`,
            },
          ];

          const calMonths = buildWallCalendarMonths(state.season);
          const allCalCells = calMonths.flatMap((m) => m.cells);
          const currentCalId =
            state.phase === 'OFFSEASON_SUMMARY'
              ? 'off_open'
              : `wk_${Math.min(17, Math.max(1, state.week))}`;
          const activeCalCell =
            allCalCells.find((c) => c.id === (selectedCalId ?? currentCalId)) ?? allCalCells[0];

          const getEventColor = (tone?: WallCalendarCell['eventTone']) => {
            if (tone === 'danger') return COLORS.danger;
            if (tone === 'warning') return COLORS.warning;
            if (tone === 'success') return COLORS.success;
            if (tone === 'accent') return COLORS.accent;
            return COLORS.cardHi;
          };

          return (
            <View style={styles.sectionPad}>
              <View style={styles.rowGap}>
                <Btn
                  style={[styles.chip, leagueSubTab === 'OVERVIEW' && styles.chipActive, { flex: 1, alignItems: 'center' }]}
                  onPress={() => setLeagueSubTab('OVERVIEW')}
                >
                  <Text style={[styles.chipText, leagueSubTab === 'OVERVIEW' && styles.chipTextActive]}>
                    Overview
                  </Text>
                </Btn>
                <Btn
                  style={[styles.chip, leagueSubTab === 'CALENDAR' && styles.chipActive, { flex: 1, alignItems: 'center' }]}
                  onPress={() => setLeagueSubTab('CALENDAR')}
                >
                  <Text style={[styles.chipText, leagueSubTab === 'CALENDAR' && styles.chipTextActive]}>
                    Calendar
                  </Text>
                </Btn>
                <Btn
                  style={[styles.chip, leagueSubTab === 'PRO32' && styles.chipActive, { flex: 1, alignItems: 'center' }]}
                  onPress={() => setLeagueSubTab('PRO32')}
                >
                  <Text style={[styles.chipText, leagueSubTab === 'PRO32' && styles.chipTextActive]}>
                    32 Teams
                  </Text>
                </Btn>
              </View>

              {leagueSubTab === 'OVERVIEW' ? (
                <>
                  {/* Dynasty Pulse Summary */}
                  <View style={styles.card}>
                    <Text style={styles.cardHeading}>
                      Dynasty League Pulse · Season {state.season}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      <View style={styles.pulseTile}>
                        <Text style={styles.pulseLabel}>STAGE</Text>
                        <Text style={styles.pulseVal}>
                          {state.phase === 'PLAYOFFS'
                            ? `PLAYOFFS WK ${state.week}`
                            : state.phase === 'OFFSEASON_SUMMARY'
                            ? 'OFFSEASON'
                            : `WK ${state.week} / 14`}
                        </Text>
                      </View>
                      <View style={styles.pulseTile}>
                        <Text style={styles.pulseLabel}>TOP SCORING TEAM</Text>
                        <Text style={styles.pulseVal} numberOfLines={1}>
                          {topScoringTeam ? `${topScoringTeam.name}` : '—'}
                        </Text>
                        <Text style={styles.playerMeta}>
                          {topScoringTeam ? `${topScoringTeam.pointsFor.toFixed(1)} PF` : ''}
                        </Text>
                      </View>
                      <View style={styles.pulseTile}>
                        <Text style={styles.pulseLabel}>MVP FRONT-RUNNER</Text>
                        <Text style={styles.pulseVal} numberOfLines={1}>
                          {topScorer ? `${topScorer.position} ${topScorer.name}` : '—'}
                        </Text>
                        <Text style={styles.playerMeta}>
                          {topScorer ? `${topScorer.seasonStats.fantasyPoints.toFixed(1)} PPR pts` : ''}
                        </Text>
                      </View>
                      <View style={styles.pulseTile}>
                        <Text style={styles.pulseLabel}>LEAGUE HEALTH</Text>
                        <Text style={[styles.pulseVal, { color: injuredCount > 0 ? COLORS.danger : COLORS.success }]}>
                          {injuredCount} INJ · {dnpCount} DNP
                        </Text>
                        <Text style={styles.playerMeta}>Active {activePlayers.length} players</Text>
                      </View>
                    </View>
                  </View>

                  {/* Around the League Tidbits */}
                  <View style={styles.card}>
                    <Text style={styles.cardHeading}>Around the League — Info Tidbits</Text>
                    <View style={{ gap: 8 }}>
                      {tidbits.map((tb) => (
                        <View key={tb.tag} style={styles.tidbitRow}>
                          <Text style={styles.tidbitTag}>{tb.tag}</Text>
                          <Text style={styles.bodyText}>{tb.text}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {/* Positional Scoring Leaders */}
                  <View style={styles.card}>
                    <Text style={styles.cardHeading}>Fantasy Scoring Leaders by Position</Text>
                    <View style={{ gap: 6 }}>
                      {posLeaders.map(({ pos, player }) => {
                        if (!player) return null;
                        const owner = player.fantasyTeamId ? state.fantasyTeams[player.fantasyTeamId] : null;
                        const isMine = player.fantasyTeamId === state.userTeamId;
                        return (
                          <Btn
                            key={pos}
                            style={[
                              styles.playerRow,
                              { marginBottom: 0 },
                              isMine ? { borderLeftWidth: 5, borderLeftColor: COLORS.success } : null,
                            ]}
                            onPress={() => openInspect(player)}
                          >
                            <View style={[styles.posBadge, { backgroundColor: POS_COLORS[pos] }]}>
                              <Text style={styles.posBadgeText}>{pos}1</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.playerName}>
                                {player.name} ({player.proTeamId})
                              </Text>
                              <Text style={styles.playerMeta}>
                                {owner ? (isMine ? 'YOUR ROSTER' : owner.name) : 'Free Agent'} · Age {player.age}
                              </Text>
                            </View>
                            <Text style={styles.rangeValue}>
                              {player.seasonStats.fantasyPoints.toFixed(1)} pts
                            </Text>
                          </Btn>
                        );
                      })}
                    </View>
                  </View>

                  {/* 12-Team Fantasy Power Board */}
                  <View style={styles.card}>
                    <Text style={styles.cardHeading}>12-Team Fantasy Power Board</Text>
                    {standings.map((t, idx) => {
                      const ageEntry = teamAges.find((a) => a.team.id === t.id);
                      const strat = t.isUser ? 'YOU' : AI_STRATEGY_SHORT[t.personality];
                      return (
                        <View key={t.id} style={styles.standingRow}>
                          <Text style={[styles.standingRank, idx < 6 && { color: COLORS.success }]}>
                            {idx + 1}
                          </Text>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.standingName, t.isUser && { color: COLORS.accent, fontWeight: '900' }]}>
                              {t.name}
                            </Text>
                            <Text style={styles.playerMeta}>
                              {strat} · Avg Age {ageEntry ? ageEntry.avgAge.toFixed(1) : '—'} · PA {t.pointsAgainst.toFixed(0)}
                            </Text>
                          </View>
                          <Text style={styles.standingRec}>
                            {t.wins}-{t.losses}
                          </Text>
                          <Text style={styles.standingPts}>{t.pointsFor.toFixed(0)} PF</Text>
                        </View>
                      );
                    })}
                  </View>
                </>
              ) : leagueSubTab === 'CALENDAR' ? (
                <>
                  {/* Selected Date / Event Briefing */}
                  {activeCalCell && (() => {
                    const m = activeCalCell.week
                      ? state.fantasySchedule.find(
                          (x) =>
                            x.week === activeCalCell.week &&
                            (x.homeTeamId === state.userTeamId || x.awayTeamId === state.userTeamId)
                        )
                      : null;
                    const oppId = m
                      ? m.homeTeamId === state.userTeamId
                        ? m.awayTeamId
                        : m.homeTeamId
                      : null;
                    const oppName = oppId ? state.fantasyTeams[oppId]?.name : null;
                    return (
                      <View
                        style={[
                          styles.card,
                          { borderLeftColor: getEventColor(activeCalCell.eventTone ?? 'accent') },
                        ]}
                      >
                        <Text style={styles.cardHeading}>
                          {activeCalCell.dateLabel}
                          {activeCalCell.week ? ` · WEEK ${activeCalCell.week}` : ''}
                          {activeCalCell.eventTag ? ` · ${activeCalCell.eventTag}` : ''}
                        </Text>
                        <Text style={styles.bodyText}>{activeCalCell.detail}</Text>
                        {m && oppName && (
                          <Text style={[styles.playerMeta, { marginTop: 6, color: COLORS.accent }]}>
                            {m.played
                              ? (() => {
                                  const myPts = m.homeTeamId === state.userTeamId ? m.homeScore : m.awayScore;
                                  const opPts = m.homeTeamId === state.userTeamId ? m.awayScore : m.homeScore;
                                  return `Result: ${myPts >= opPts ? 'WIN' : 'LOSS'} ${myPts.toFixed(1)}–${opPts.toFixed(1)} vs ${oppName}`;
                                })()
                              : `Scheduled Matchup: vs ${oppName}`}
                          </Text>
                        )}
                      </View>
                    );
                  })()}

                  {/* Wall Calendar Month Sheets */}
                  {calMonths.map((month) => (
                    <View key={month.monthTitle} style={styles.calSheet}>
                      <View style={styles.calMonthHeader}>
                        <Text style={styles.calMonthTitle}>{month.monthTitle}</Text>
                        <Text style={styles.calMonthSub}>SEASON WALL CALENDAR</Text>
                      </View>
                      <View style={styles.calGrid}>
                        {month.cells.map((cell) => {
                          const isCurrent = cell.id === currentCalId;
                          const isSelected = activeCalCell?.id === cell.id;
                          const m = cell.week
                            ? state.fantasySchedule.find(
                                (x) =>
                                  x.week === cell.week &&
                                  (x.homeTeamId === state.userTeamId || x.awayTeamId === state.userTeamId)
                              )
                            : null;
                          const oppId = m
                            ? m.homeTeamId === state.userTeamId
                              ? m.awayTeamId
                              : m.homeTeamId
                            : null;
                          const oppName = oppId ? state.fantasyTeams[oppId]?.name : null;
                          let resultLine = oppName ? `vs ${oppName}` : cell.phaseTag === 'OFFSEASON' ? 'Offseason' : 'League Date';
                          let resultColor = COLORS.muted;
                          if (m && m.played) {
                            const myPts = m.homeTeamId === state.userTeamId ? m.homeScore : m.awayScore;
                            const opPts = m.homeTeamId === state.userTeamId ? m.awayScore : m.homeScore;
                            const won = myPts >= opPts;
                            resultLine = `${won ? 'W' : 'L'} ${myPts.toFixed(0)}–${opPts.toFixed(0)}`;
                            resultColor = won ? COLORS.success : COLORS.danger;
                          }
                          return (
                            <Btn
                              key={cell.id}
                              style={[
                                styles.calCell,
                                isCurrent && styles.calCellCurrent,
                                isSelected && { borderTopWidth: 3, borderTopColor: COLORS.accent },
                              ]}
                              onPress={() => setSelectedCalId(cell.id)}
                            >
                              <View style={styles.calCellTop}>
                                <Text style={styles.calDateText}>{cell.dateLabel}</Text>
                                <Text style={[styles.calWkText, isCurrent && { color: COLORS.accent }]}>
                                  {isCurrent ? 'NOW' : cell.week ? `WK ${cell.week}` : cell.phaseTag}
                                </Text>
                              </View>
                              {cell.eventTag && (
                                <View style={[styles.calEventTag, { backgroundColor: getEventColor(cell.eventTone) }]}>
                                  <Text
                                    style={[
                                      styles.calEventTagText,
                                      cell.eventTone === 'neutral' && { color: COLORS.text },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {cell.eventTag}
                                  </Text>
                                </View>
                              )}
                              <Text style={[styles.calMatchText, { color: resultColor }]} numberOfLines={1}>
                                {resultLine}
                              </Text>
                            </Btn>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </>
              ) : (
                <>
                  <Text style={styles.sectionHeader}>32 Pro Franchises (Schemes & Stadiums)</Text>
                  {proTeamsSorted.map((pt) => (
                    <View key={pt.id} style={styles.playerRow}>
                      <View style={[styles.teamDot, { backgroundColor: pt.primaryColor }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.playerName}>{pt.name}</Text>
                        <Text style={styles.playerMeta}>
                          {pt.conference} {pt.division} · {SCHEME_LABELS[pt.scheme]} · {STADIUM_LABELS[pt.stadium]}
                        </Text>
                      </View>
                      <Text style={styles.standingRec}>
                        {pt.wins}-{pt.losses}
                      </Text>
                    </View>
                  ))}
                </>
              )}
            </View>
          );
        })()}

        {/* ================= TAB 5: CAREER & SKILLS ================= */}
        {tab === 'CAREER' && (
          <View style={styles.sectionPad}>
            <View style={styles.card}>
              <Text style={styles.cardHeading}>
                Manager Profile · Level {state.manager.level}
              </Text>
              <Text style={styles.bodyText}>
                XP: {state.manager.xp} / {state.manager.xpToNextLevel} · Skill Points:{' '}
                <Text style={{ color: COLORS.warning, fontWeight: '800' }}>
                  {state.manager.skillPoints}
                </Text>
              </Text>
              <Text style={styles.bodyText}>
                Current Scouting Error Band: ±{halfWidth.toFixed(1)} (1–10 scale)
              </Text>
              <Text style={styles.bodyText}>
                Career Record: {state.manager.careerWins}-{state.manager.careerLosses} · Titles:{' '}
                {state.manager.championships}
              </Text>

              <View style={{ gap: 8, marginTop: 12 }}>
                {(
                  [
                    {
                      key: 'scouting',
                      title: 'Scouting Accuracy',
                      desc: 'Shrinks 1–10 attribute fog-of-war uncertainty ranges',
                    },
                    {
                      key: 'analyst',
                      title: 'Film Room Analyst',
                      desc: 'Unlocks subtle meta clues about hidden modifiers',
                    },
                    {
                      key: 'frontOffice',
                      title: 'Front Office GM',
                      desc: 'Tightens rookie scouting fog & improves AI trade leverage',
                    },
                  ] as const
                ).map((sk) => (
                  <View key={sk.key} style={styles.skillRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bold}>
                        {sk.title} (Lv.{state.manager.skills[sk.key]}/10)
                      </Text>
                      <Text style={styles.mutedText}>{sk.desc}</Text>
                    </View>
                    <Btn
                      style={[
                        styles.draftMiniBtn,
                        state.manager.skillPoints === 0 && { opacity: 0.4 },
                      ]}
                      disabled={state.manager.skillPoints === 0}
                      onPress={() => updateState(spendSkillPoint(state, sk.key))}
                    >
                      <Text style={styles.draftMiniBtnText}>+1</Text>
                    </Btn>
                  </View>
                ))}
              </View>
            </View>

            {/* Unlocked Film Room Clues */}
            <View style={styles.card}>
              <Text style={styles.cardHeading}>Film Room — Discovered Meta Clues</Text>
              {state.manager.discoveredClues.length === 0 ? (
                <Text style={styles.mutedText}>
                  Invest skill points in Film Room Analyst to uncover hidden simulation modifiers!
                </Text>
              ) : (
                state.manager.discoveredClues.map((clue, idx) => (
                  <Text key={idx} style={[styles.bodyText, { marginBottom: 6 }]}>
                    • {clue}
                  </Text>
                ))
              )}
            </View>

            {/* Season History */}
            <View style={styles.card}>
              <Text style={styles.cardHeading}>
                User Season History ({state.seasonHistory.length} Seasons)
              </Text>
              {state.seasonHistory.length === 0 ? (
                <Text style={styles.mutedText}>Complete Season 1 to log your dynasty history.</Text>
              ) : (
                state.seasonHistory.map((h) => (
                  <View key={h.season} style={styles.historyBlock}>
                    <Text style={styles.bold}>
                      {h.season} · #{h.userRank} ({h.userWins}-{h.userLosses}) — {h.userPlayoffResult}
                    </Text>
                    <Text style={styles.mutedText}>
                      Champion: {h.championTeamName} · MVP: {h.leagueMvpName} ({h.leagueMvpPoints} pts)
                    </Text>
                    <Text style={styles.mutedText}>Steal: {h.userDraftSteal}</Text>
                    <Text style={styles.mutedText}>Bust: {h.userDraftBust}</Text>
                  </View>
                ))
              )}
            </View>

            {/* Hall of Fame */}
            {state.hallOfFame.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardHeading}>Dynasty Hall of Fame</Text>
                {state.hallOfFame.map((h) => (
                  <View key={h.playerId} style={styles.standingRow}>
                    <Text style={styles.bold}>
                      {h.position} {h.name}
                    </Text>
                    <Text style={styles.mutedText}>
                      {h.careerFantasyPoints.toFixed(0)} career pts (Ret. {h.retiredSeason})
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <Btn
              style={[styles.btn, { backgroundColor: COLORS.danger, marginTop: 8 }]}
              onPress={async () => {
                await clearDynastyState();
                setState(createNewDynasty({ managerName: 'Coach', teamName: 'Apex Dynasty' }));
                setTab('HUB');
              }}
            >
              <Text style={styles.btnText}>Start New Dynasty</Text>
            </Btn>
          </View>
        )}
      </ScrollView>

      {/* Bottom Tab Navigation */}
      <View style={styles.tabBar}>
        {(
          [
            { id: 'HUB', label: 'Matchup' },
            { id: 'NEWS', label: 'News' },
            { id: 'ROSTER', label: 'Roster' },
            { id: 'PLAYERS', label: 'Waivers' },
            { id: 'LEAGUE', label: 'League' },
            { id: 'CAREER', label: 'Career' },
          ] as const
        ).map((t) => (
          <Btn
            key={t.id}
            style={[styles.tabItem, tab === t.id && styles.tabItemActive]}
            onPress={() => setTab(t.id)}
          >
            <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
          </Btn>
        ))}
      </View>

      <PlayerDetailModal
        player={inspectPlayer}
        state={state}
        onClose={() => setInspectPlayer(null)}
        primaryActionLabel={inspectAction?.label}
        onPrimaryAction={inspectAction?.handler}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 6,
    borderBottomColor: COLORS.accent,
    backgroundColor: COLORS.surface,
  },
  title: { color: COLORS.text, fontSize: 20, fontWeight: '900', letterSpacing: 1.5, textTransform: 'uppercase' },
  subText: { color: COLORS.muted, fontSize: 12, marginTop: 2, letterSpacing: 0.6, textTransform: 'uppercase' },
  pill: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 10,
    paddingVertical: 5,
    transform: [{ skewX: '-12deg' }],
  },
  pillText: { color: COLORS.ink, fontSize: 12, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  content: { flex: 1 },
  sectionPad: { padding: 14, gap: 12, maxWidth: 1024, width: '100%', alignSelf: 'center' },
  sectionHeader: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 4,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  bannerCard: {
    margin: 14,
    padding: 12,
    backgroundColor: COLORS.flare,
    borderLeftWidth: 8,
    borderLeftColor: COLORS.ink,
    borderBottomWidth: 4,
    borderBottomColor: '#8F2D08',
    gap: 10,
  },
  bannerTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  card: {
    backgroundColor: COLORS.card,
    padding: 14,
    borderLeftWidth: 8,
    borderLeftColor: COLORS.accent,
    borderBottomWidth: 4,
    borderBottomColor: '#0F130B',
  },
  cardHeading: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 8,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  bodyText: { color: COLORS.text, fontSize: 13, marginBottom: 4 },
  mutedText: { color: COLORS.muted, fontSize: 12 },
  bold: { color: COLORS.text, fontWeight: '800', fontSize: 13 },
  rowGap: { flexDirection: 'row', gap: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.cardHi,
  },
  btnPrimary: { backgroundColor: COLORS.accent },
  btnSecondary: { backgroundColor: COLORS.cardHi },
  btnText: { color: COLORS.text, fontWeight: '900', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  btnPrimaryText: { color: COLORS.ink, fontWeight: '900', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: COLORS.cardHi,
  },
  chipActive: { backgroundColor: COLORS.accent },
  chipText: { color: COLORS.muted, fontSize: 12, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  chipTextActive: { color: COLORS.ink },
  searchInput: {
    marginHorizontal: 14,
    marginBottom: 10,
    backgroundColor: '#000000',
    borderBottomWidth: 4,
    borderBottomColor: COLORS.accent,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.card,
    padding: 10,
    marginBottom: 8,
  },
  posBadge: {
    width: 36,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ skewX: '-12deg' }],
  },
  posBadgeText: { color: COLORS.ink, fontWeight: '900', fontSize: 12 },
  slotTag: {
    width: 48,
    paddingVertical: 4,
    backgroundColor: '#000000',
    alignItems: 'center',
  },
  slotTagText: { color: COLORS.accent, fontWeight: '900', fontSize: 11, letterSpacing: 0.8 },
  playerName: { color: COLORS.text, fontSize: 14, fontWeight: '800' },
  playerMeta: { color: COLORS.muted, fontSize: 11, marginTop: 2, letterSpacing: 0.4 },
  rangeValue: { color: COLORS.accent, fontWeight: '900', fontSize: 14 },
  rangeHint: { color: COLORS.muted, fontSize: 10 },
  draftMiniBtn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  draftMiniBtnText: { color: COLORS.ink, fontWeight: '900', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  matchupBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
    padding: 14,
  },
  vsText: { color: COLORS.flare, fontWeight: '900', fontSize: 16, paddingHorizontal: 12, fontStyle: 'italic' },
  scoreLine: { color: COLORS.accent, fontSize: 22, fontWeight: '900', marginBottom: 6, letterSpacing: 0.5 },
  standingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    gap: 8,
  },
  standingRank: { width: 22, color: COLORS.accent, fontWeight: '900', fontSize: 12 },
  standingName: { flex: 1, color: COLORS.text, fontSize: 13, fontWeight: '600' },
  standingRec: { color: COLORS.text, fontWeight: '800', fontSize: 12, width: 42, textAlign: 'right' },
  standingPts: { color: COLORS.muted, fontSize: 12, width: 62, textAlign: 'right' },
  teamDot: { width: 12, height: 12 },
  skillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  historyBlock: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#000000',
    paddingTop: 8,
    paddingHorizontal: 4,
    gap: 4,
  },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 8, backgroundColor: COLORS.surface },
  tabItemActive: { backgroundColor: COLORS.accent },
  tabText: { color: COLORS.muted, fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  tabTextActive: { color: COLORS.ink },
  menuBtn: {
    backgroundColor: COLORS.cardHi,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  menuBtnText: { color: COLORS.text, fontSize: 12, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  draftModeRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  draftModeBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.cardHi,
  },
  draftModeBtnActive: {
    backgroundColor: COLORS.accent,
  },
  draftModeText: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  draftModeTextActive: {
    color: COLORS.ink,
  },
  sinceStrip: {
    marginHorizontal: 14,
    marginBottom: 10,
    backgroundColor: COLORS.card,
    borderLeftWidth: 5,
    borderLeftColor: COLORS.accent,
    padding: 10,
    gap: 6,
  },
  sinceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sinceTitle: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    flex: 1,
  },
  sinceLinkBtn: {
    backgroundColor: COLORS.cardHi,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sinceLinkText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  sinceCountsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  sinceCountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#000000',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sinceCountDot: {
    width: 8,
    height: 8,
  },
  sinceCountText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  runAlertTag: {
    backgroundColor: COLORS.flare,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  runAlertTagText: {
    color: COLORS.ink,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  sinceMiniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#000000',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  sinceMiniPick: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '900',
    width: 34,
  },
  sinceMiniPos: {
    width: 28,
    paddingVertical: 2,
    alignItems: 'center',
  },
  sinceMiniPosText: {
    color: COLORS.ink,
    fontSize: 10,
    fontWeight: '900',
  },
  sinceMiniPlayer: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '800',
    flex: 1,
  },
  sinceMiniTeam: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '700',
    maxWidth: 140,
  },
  runAlertBanner: {
    marginHorizontal: 14,
    marginBottom: 8,
    backgroundColor: COLORS.flare,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  runAlertBannerText: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  userAnchorRow: {
    marginHorizontal: 14,
    marginBottom: 8,
    backgroundColor: '#000000',
    borderLeftWidth: 5,
    borderLeftColor: COLORS.accent,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  userAnchorText: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  emptyLogBox: {
    backgroundColor: COLORS.card,
    padding: 16,
    alignItems: 'center',
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.card,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.cardHi,
    padding: 10,
    marginBottom: 8,
  },
  logRowUser: {
    borderLeftColor: COLORS.accent,
    backgroundColor: COLORS.cardHi,
  },
  logPickCol: {
    width: 38,
    alignItems: 'center',
  },
  logPickCode: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '900',
  },
  logPickNum: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  stratTag: {
    backgroundColor: '#000000',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  stratTagUser: {
    backgroundColor: COLORS.accent,
  },
  stratTagText: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  stratTagTextUser: {
    color: COLORS.ink,
  },
  teamBuildCard: {
    backgroundColor: COLORS.card,
    borderLeftWidth: 5,
    borderLeftColor: COLORS.cardHi,
    padding: 12,
    gap: 8,
  },
  teamBuildCardUser: {
    borderLeftColor: COLORS.accent,
  },
  teamBuildHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  teamBuildName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  teamPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#000000',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  pulseTile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: '#000000',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.accent,
    padding: 10,
    gap: 2,
  },
  pulseLabel: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  pulseVal: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  tidbitRow: {
    backgroundColor: '#000000',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.cardHi,
    padding: 10,
    gap: 3,
  },
  tidbitTag: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  calSheet: {
    backgroundColor: COLORS.card,
    marginBottom: 12,
    borderTopWidth: 5,
    borderTopColor: COLORS.accent,
  },
  calMonthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#000000',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  calMonthTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  calMonthSub: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
    gap: 8,
  },
  calCell: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: '#000000',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.cardHi,
    padding: 8,
    gap: 5,
  },
  calCellCurrent: {
    borderLeftColor: COLORS.accent,
    backgroundColor: COLORS.cardHi,
  },
  calCellTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calDateText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  calWkText: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  calEventTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  calEventTagText: {
    color: COLORS.ink,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  calMatchText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
