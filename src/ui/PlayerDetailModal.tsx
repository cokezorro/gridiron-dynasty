import React from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  DynastyState,
  Player,
  formatScoutedRange,
  getPlayerWeekWeatherReport,
  getScoutedAttributes,
  getScoutedOverall,
  getScoutingHalfWidth,
} from '../engine';
import { COLORS, POS_COLORS, SCHEME_LABELS, STADIUM_LABELS } from './theme';
import { Btn } from './Btn';

interface Props {
  player: Player | null;
  state: DynastyState;
  onClose: () => void;
  primaryActionLabel?: string;
  onPrimaryAction?: (playerId: string) => void;
}

export const PlayerDetailModal: React.FC<Props> = ({
  player,
  state,
  onClose,
  primaryActionLabel,
  onPrimaryAction,
}) => {
  if (!player) return null;

  const team = state.proTeams[player.proTeamId];
  const ovrRange = getScoutedOverall(player, state.manager, state.season);
  const attrRanges = getScoutedAttributes(player, state.manager, state.season);
  const halfWidth = getScoutingHalfWidth(state.manager, player.experience === 0);
  const intel = player.weeklyIntel;
  const trendPts = player.pointTrendHistory?.length ? player.pointTrendHistory : [0];
  const maxTrendPt = Math.max(25, ...trendPts);
  const avgTrendPt = trendPts.reduce((a, b) => a + b, 0) / trendPts.length;

  const pracBg =
    player.injuryWeeks > 0 || intel?.practiceStatus === 'DNP'
      ? COLORS.danger
      : intel?.practiceStatus === 'LIMITED'
      ? COLORS.warning
      : COLORS.cardHi;
  const pracFg =
    player.injuryWeeks > 0 || intel?.practiceStatus === 'DNP' || intel?.practiceStatus === 'LIMITED'
      ? COLORS.ink
      : COLORS.text;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <View style={styles.titleRow}>
                <View style={[styles.posBadge, { backgroundColor: POS_COLORS[player.position] }]}>
                  <Text style={styles.posText}>{player.position}</Text>
                </View>
                <Text style={styles.name}>{player.name}</Text>
              </View>
              <Text style={styles.subtitle}>
                {team ? `${team.name} (${SCHEME_LABELS[team.scheme]} · ${STADIUM_LABELS[team.stadium]})` : player.proTeamId}
              </Text>
              <Text style={styles.meta}>
                Age {player.age} · {player.experience === 0 ? 'Rookie (Extra Fog)' : `Yr ${player.experience + 1}`}
                {player.injuryWeeks > 0 ? ` · INJ (${player.injuryWeeks}w)` : ' · Active'}
                {intel ? ` · Fantasy Rank #${intel.fantasyRank}` : ''}
              </Text>
            </View>
            <Btn onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Btn>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Scouted Overall Card */}
            <View style={styles.ovrCard}>
              <View>
                <Text style={styles.ovrLabel}>SCOUTED OVERALL (1–10)</Text>
                <Text style={styles.ovrSub}>
                  Manager Lv.{state.manager.level} · Uncertainty ±{halfWidth.toFixed(1)}
                </Text>
              </View>
              <Text style={styles.ovrValue}>{formatScoutedRange(ovrRange)}</Text>
            </View>

            {/* Weekly Info Blob: Official Practice Report + Beat Reporter Notebook */}
            <Text style={styles.sectionTitle}>
              Week {state.week} Official Practice Report & Beat Notes {intel ? `(#${intel.fantasyRank})` : ''}
            </Text>
            {(() => {
              const isMine = player.fantasyTeamId === state.userTeamId;
              const isTaxi = isMine && (state.fantasyTeams[state.userTeamId]?.taxiIds ?? []).includes(player.id);
              const isBad =
                player.injuryWeeks > 0 ||
                intel?.practiceStatus === 'DNP' ||
                intel?.practiceStatus === 'LIMITED' ||
                (intel?.snapDelta ?? 0) < 0 ||
                intel?.trendDirection === 'COOLING' ||
                intel?.trendDirection === 'SLUMPING';
              const mineColor = isBad ? COLORS.danger : COLORS.success;
              const wx = getPlayerWeekWeatherReport(state.proSchedule, player.proTeamId, state.week);
              const wxBg =
                wx?.severity === 'SEVERE'
                  ? COLORS.danger
                  : wx?.severity === 'ADVERSE'
                  ? COLORS.warning
                  : COLORS.cardHi;
              const wxFg =
                wx?.severity === 'SEVERE' || wx?.severity === 'ADVERSE'
                  ? COLORS.ink
                  : COLORS.text;
              return intel && intel.isTop200 ? (
                <View style={[styles.intelCard, isMine && { borderLeftColor: mineColor }]}>
                  <View style={styles.intelBadgeRow}>
                    {isMine && (
                      <View style={[styles.intelPill, { backgroundColor: mineColor }]}>
                        <Text style={[styles.intelPillText, { color: COLORS.ink }]}>
                          {isTaxi ? 'YOUR TAXI' : 'YOUR ROSTER'}
                        </Text>
                      </View>
                    )}
                    <View style={[styles.intelPill, { backgroundColor: pracBg }]}>
                      <Text style={[styles.intelPillText, { color: pracFg }]}>
                        {player.injuryWeeks > 0
                          ? `INJURY REPORT: OUT (${player.injuryWeeks}W) · DNP`
                          : intel.practiceStatus === 'FULL'
                          ? 'OFFICIAL PRACTICE: FULL (FP)'
                          : intel.practiceStatus === 'LIMITED'
                          ? 'OFFICIAL PRACTICE: PARTIAL (LP)'
                          : 'OFFICIAL PRACTICE: DNP'}
                      </Text>
                    </View>
                    <View style={[styles.intelPill, { backgroundColor: COLORS.cardHi }]}>
                      <Text style={[styles.intelPillText, { color: COLORS.text }]}>
                        Logged Snap Share: {intel.snapShare}%
                      </Text>
                    </View>
                    {wx && (
                      <View style={[styles.intelPill, { backgroundColor: wxBg }]}>
                        <Text style={[styles.intelPillText, { color: wxFg }]}>
                          WK {state.week} {wx.matchupTag} · {wx.weatherNote}
                        </Text>
                      </View>
                    )}
                  </View>
                  {intel.blurbs.map((b, i) => (
                    <Text key={i} style={styles.blurbText}>
                      • {b}
                    </Text>
                  ))}
                </View>
              ) : (
                <View style={[styles.intelCard, { borderLeftColor: isMine ? mineColor : COLORS.muted }]}>
                  <View style={[styles.intelBadgeRow, { marginBottom: 4 }]}>
                    {isMine && (
                      <View style={[styles.intelPill, { backgroundColor: mineColor }]}>
                        <Text style={[styles.intelPillText, { color: COLORS.ink }]}>
                          {isTaxi ? 'YOUR TAXI' : 'YOUR ROSTER'}
                        </Text>
                      </View>
                    )}
                    {wx && (
                      <View style={[styles.intelPill, { backgroundColor: wxBg }]}>
                        <Text style={[styles.intelPillText, { color: wxFg }]}>
                          WK {state.week} {wx.matchupTag} · {wx.weatherNote}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.statLine, { color: COLORS.muted, fontWeight: '700' }]}>
                    Ranked #{intel?.fantasyRank ?? '201+'} (Outside Top 200 Fantasy Players)
                  </Text>
                  <Text style={styles.blurbText}>
                    No advanced practice, snap-share, or beat-writer news is available because this player is not currently inside the Top 200 Fantasy Players.
                  </Text>
                </View>
              );
            })()}

            {/* Weekly Points Log Chart */}
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Weekly Fantasy Output Log</Text>
              <Text style={styles.trendMeta}>
                Avg {avgTrendPt.toFixed(1)} PPG
              </Text>
            </View>
            <View style={styles.chartCard}>
              <View style={styles.chartBarsRow}>
                {trendPts.map((pt, idx) => {
                  const heightPct = Math.max(8, Math.min(100, (pt / maxTrendPt) * 100));
                  const isRecent = idx === trendPts.length - 1;
                  return (
                    <View key={idx} style={styles.chartCol}>
                      <Text style={styles.chartVal}>{pt.toFixed(0)}</Text>
                      <View style={styles.chartBarTrack}>
                        <View
                          style={[
                            styles.chartBarFill,
                            {
                              height: `${heightPct}%`,
                              backgroundColor: isRecent ? COLORS.accent : '#334155',
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.chartLbl}>W{idx + 1}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* 10 Attribute Range Bars */}
            <Text style={styles.sectionTitle}>Scouting Report (1–10 Scale)</Text>
            <View style={styles.attrList}>
              {ATTRIBUTE_KEYS.map((key) => {
                const r = attrRanges[key];
                const leftPct = ((r.low - 1) / 9) * 100;
                const widthPct = Math.max(4, ((r.high - r.low) / 9) * 100);
                return (
                  <View key={key} style={styles.attrRow}>
                    <Text style={styles.attrLabel}>{ATTRIBUTE_LABELS[key]}</Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barRange,
                          {
                            left: `${leftPct}%`,
                            width: `${widthPct}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.attrRangeText}>{formatScoutedRange(r)}</Text>
                  </View>
                );
              })}
            </View>

            {/* Current Season Stats */}
            <Text style={styles.sectionTitle}>Season {state.season} Production (Full PPR)</Text>
            <View style={styles.statsCard}>
              <Text style={styles.statLine}>
                Games: {player.seasonStats.gamesPlayed} · Fantasy Pts:{' '}
                <Text style={{ color: COLORS.accent, fontWeight: '700' }}>
                  {player.seasonStats.fantasyPoints.toFixed(1)}
                </Text>
                {player.seasonStats.positionRank > 0
                  ? ` (${player.position}${player.seasonStats.positionRank})`
                  : ''}
              </Text>
              {player.position === 'QB' && (
                <Text style={styles.statLine}>
                  Pass: {player.seasonStats.passYards} yds, {player.seasonStats.passTDs} TD,{' '}
                  {player.seasonStats.interceptions} INT · Rush: {player.seasonStats.rushYards} yds,{' '}
                  {player.seasonStats.rushTDs} TD
                </Text>
              )}
              {player.position === 'RB' && (
                <Text style={styles.statLine}>
                  Rush: {player.seasonStats.rushAttempts} att, {player.seasonStats.rushYards} yds,{' '}
                  {player.seasonStats.rushTDs} TD · Rec: {player.seasonStats.receptions} rec,{' '}
                  {player.seasonStats.recYards} yds, {player.seasonStats.recTDs} TD
                </Text>
              )}
              {(player.position === 'WR' || player.position === 'TE') && (
                <Text style={styles.statLine}>
                  Rec: {player.seasonStats.receptions}/{player.seasonStats.targets} tgt,{' '}
                  {player.seasonStats.recYards} yds, {player.seasonStats.recTDs} TD
                </Text>
              )}
            </View>

            {/* Career History */}
            {player.careerHistory.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Career History</Text>
                {player.careerHistory.map((h) => (
                  <View key={h.season} style={styles.historyRow}>
                    <Text style={styles.historyCell}>
                      {h.season} (Age {h.age}, {h.proTeamId})
                    </Text>
                    <Text style={styles.historyCell}>
                      {h.gamesPlayed}g · {h.fantasyPoints.toFixed(1)} pts ({player.position}
                      {h.positionRank})
                    </Text>
                  </View>
                ))}
              </>
            )}
          </ScrollView>

          {primaryActionLabel && onPrimaryAction && (
            <Btn
              style={styles.actionBtn}
              onPress={() => {
                onPrimaryAction(player.id);
                onClose();
              }}
            >
              <Text style={styles.actionBtnText}>{primaryActionLabel}</Text>
            </Btn>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    maxHeight: '90%',
    padding: 16,
    borderTopWidth: 8,
    borderTopColor: COLORS.accent,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  posBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    transform: [{ skewX: '-12deg' }],
  },
  posText: {
    color: COLORS.ink,
    fontWeight: '800',
    fontSize: 12,
  },
  name: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '900',
    fontStyle: 'italic',
    textTransform: 'uppercase',
  },
  subtitle: {
    color: COLORS.accent,
    fontSize: 12,
    marginTop: 4,
  },
  meta: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.flare,
  },
  closeBtnText: {
    color: COLORS.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  body: {
    marginBottom: 12,
  },
  ovrCard: {
    backgroundColor: COLORS.card,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderLeftWidth: 8,
    borderLeftColor: COLORS.accent,
    marginBottom: 12,
  },
  ovrLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  ovrSub: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 2,
  },
  ovrValue: {
    color: COLORS.accent,
    fontSize: 22,
    fontWeight: '800',
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
    marginBottom: 8,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  trendMeta: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  intelCard: {
    backgroundColor: COLORS.card,
    padding: 12,
    borderLeftWidth: 8,
    borderLeftColor: COLORS.flare,
    gap: 6,
    marginBottom: 12,
  },
  intelBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  intelPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    transform: [{ skewX: '-12deg' }],
  },
  intelPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  blurbText: {
    color: COLORS.text,
    fontSize: 12,
    lineHeight: 17,
  },
  chartCard: {
    backgroundColor: COLORS.card,
    padding: 12,
    borderLeftWidth: 8,
    borderLeftColor: COLORS.success,
    marginBottom: 12,
  },
  chartBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 92,
    gap: 6,
  },
  chartCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  chartVal: {
    color: COLORS.muted,
    fontSize: 10,
    marginBottom: 3,
    fontVariant: ['tabular-nums'],
  },
  chartBarTrack: {
    width: '100%',
    maxWidth: 22,
    height: 56,
    backgroundColor: '#000000',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  chartBarFill: {
    width: '100%',
  },
  chartLbl: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 3,
  },
  attrList: {
    gap: 8,
    marginBottom: 14,
  },
  attrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  attrLabel: {
    width: 96,
    color: COLORS.muted,
    fontSize: 12,
  },
  barTrack: {
    flex: 1,
    height: 10,
    backgroundColor: '#000000',
    overflow: 'hidden',
    position: 'relative',
  },
  barRange: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: COLORS.accent,
  },
  attrRangeText: {
    width: 60,
    textAlign: 'right',
    color: COLORS.text,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  statsCard: {
    backgroundColor: COLORS.card,
    padding: 12,
    borderLeftWidth: 8,
    borderLeftColor: COLORS.muted,
    gap: 4,
    marginBottom: 12,
  },
  statLine: {
    color: COLORS.text,
    fontSize: 12,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  historyCell: {
    color: COLORS.muted,
    fontSize: 12,
  },
  actionBtn: {
    backgroundColor: COLORS.accent,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionBtnText: {
    color: COLORS.ink,
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
