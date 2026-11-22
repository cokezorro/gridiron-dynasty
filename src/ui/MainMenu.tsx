import React, { useState } from 'react';
import {
  Linking,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { DynastyState } from '../engine';
import { EXTERNAL_LINKS } from '../config/links';
import { COLORS } from './theme';
import { Btn } from './Btn';

interface Props {
  savedState: DynastyState | null;
  onContinueDynasty: () => void;
  onStartNewDynasty: (teamName: string) => void;
}

export const MainMenu: React.FC<Props> = ({
  savedState,
  onContinueDynasty,
  onStartNewDynasty,
}) => {
  const [teamName, setTeamName] = useState(
    savedState ? savedState.fantasyTeams[savedState.userTeamId]?.name ?? 'Apex Dynasty' : 'Apex Dynasty'
  );
  const [showNewForm, setShowNewForm] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [guideTab, setGuideTab] = useState<'WHAT' | 'HOW' | 'META'>('WHAT');
  const [notice, setNotice] = useState<{ title: string; body: string; url?: string } | null>(null);

  const savedTeam = savedState ? savedState.fantasyTeams[savedState.userTeamId] : null;
  const savedPhaseLabel = savedState
    ? savedState.phase === 'STARTUP_DRAFT'
      ? 'Startup Draft'
      : savedState.phase === 'ROOKIE_DRAFT'
      ? `${savedState.season} Rookie Draft`
      : savedState.phase === 'OFFSEASON_SUMMARY'
      ? `${savedState.season} Offseason`
      : savedState.phase === 'PLAYOFFS'
      ? `${savedState.season} Playoffs · Wk ${savedState.week}`
      : `${savedState.season} · Week ${savedState.week}`
    : '';

  const handleOpenQBFactory = () => {
    const link = EXTERNAL_LINKS.qbFactory;
    if (link.isPlaceholder) {
      setNotice({
        title: `${link.title} (Placeholder Link)`,
        body: `This card is wired to ${link.url}.\n\nUpdate EXTERNAL_LINKS.qbFactory in src/config/links.ts with your Google Play, App Store, or web URL whenever you're ready to link players directly to The QB Factory!`,
      });
    } else {
      Linking.openURL(link.url).catch(() => {
        setNotice({
          title: link.title,
          body: `Could not open ${link.url}.`,
        });
      });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero Header */}
        <View style={styles.hero}>
          <View style={styles.eyebrowPill}>
            <Text style={styles.eyebrowText}>32 TEAMS · 1–10 SCOUTING FOG · HIDDEN META</Text>
          </View>
          <Text style={styles.logoTop}>GRIDIRON</Text>
          <View style={styles.logoSlab}>
            <Text style={styles.logoBottom}>DYNASTY</Text>
          </View>
          <Text style={styles.logoSub}>
            Draft, scout, and build a multi-season fantasy football empire.
          </Text>
        </View>

        {/* Primary Playable Mode: Dynasty */}
        <View style={styles.primaryCard}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Dynasty Mode</Text>
            <View style={[styles.badge, { backgroundColor: COLORS.success }]}>
              <Text style={[styles.badgeText, { color: COLORS.ink }]}>LIVE</Text>
            </View>
          </View>
          <Text style={styles.cardDesc}>
            12-team 1-QB Full PPR dynasty with startup snake draft, annual 3-round rookie drafts,
            level-based scouting accuracy, hidden modifiers, and career history.
          </Text>

          {savedState && savedTeam && !showNewForm ? (
            <View style={{ gap: 8, marginTop: 10 }}>
              <View style={styles.saveStrip}>
                <Text style={styles.saveTeamName}>{savedTeam.name}</Text>
                <Text style={styles.saveMeta}>
                  {savedPhaseLabel} · {savedTeam.wins}-{savedTeam.losses} · Lv.{savedState.manager.level}
                </Text>
              </View>
              <Btn style={styles.primaryBtn} onPress={onContinueDynasty}>
                <Text style={styles.primaryBtnText}>Continue Dynasty →</Text>
              </Btn>
              <Btn style={styles.secondaryBtn} onPress={() => setShowNewForm(true)}>
                <Text style={styles.secondaryBtnText}>Start Fresh Dynasty</Text>
              </Btn>
            </View>
          ) : (
            <View style={{ gap: 8, marginTop: 10 }}>
              <TextInput
                style={styles.input}
                value={teamName}
                onChangeText={setTeamName}
                placeholder="Enter your franchise name..."
                placeholderTextColor={COLORS.muted}
              />
              <Btn
                style={styles.primaryBtn}
                onPress={() => onStartNewDynasty(teamName.trim() || 'Apex Dynasty')}
              >
                <Text style={styles.primaryBtnText}>Launch New Dynasty →</Text>
              </Btn>
              {savedState && (
                <Btn style={styles.secondaryBtn} onPress={() => setShowNewForm(false)}>
                  <Text style={styles.secondaryBtnText}>Cancel</Text>
                </Btn>
              )}
            </View>
          )}
        </View>

        {/* First-Timer's Guide Option */}
        <Btn
          style={styles.guideMenuCard}
          onPress={() => {
            setGuideTab('WHAT');
            setShowGuide(true);
          }}
        >
          <View style={styles.cardHeaderRow}>
            <Text style={styles.modeTitle}>What Is This Game & How to Play</Text>
            <View style={[styles.badge, { backgroundColor: COLORS.warning }]}>
              <Text style={[styles.badgeText, { color: COLORS.ink }]}>FIRST TIMERS</Text>
            </View>
          </View>
          <Text style={styles.modeDesc}>
            New to Gridiron Dynasty? Learn how Dynasty Fantasy Football works, how to read 1–10 scouting fog & beat-reporter notes, and how to uncover the hidden meta.
          </Text>
          <Text style={styles.guideCtaText}>Open First-Timer&apos;s Guide →</Text>
        </Btn>

        {/* Additional Modes (Placeholders) */}
        <Text style={styles.sectionLabel}>GAME MODES</Text>

        <View style={styles.modeGrid}>
          <Btn
            style={styles.placeholderCard}
            onPress={() =>
              setNotice({
                title: 'Single Season (Redraft) — Coming Soon',
                body: 'Play a fast, standalone 17-week redraft season with a fresh snake draft every run and zero multi-year roster carryover.',
              })
            }
          >
            <View style={styles.cardHeaderRow}>
              <Text style={styles.modeTitle}>Single Season</Text>
              <View style={styles.soonBadge}>
                <Text style={styles.soonBadgeText}>SOON</Text>
              </View>
            </View>
            <Text style={styles.modeDesc}>
              Classic 1-year redraft league. Draft a fresh squad, chase the title, and compare season scores.
            </Text>
          </Btn>

          <Btn
            style={styles.placeholderCard}
            onPress={() =>
              setNotice({
                title: 'Mock Draft Simulator — Coming Soon',
                body: 'Practice Startup and Rookie drafts from any draft slot (1–12), test Autopick strategies, and get instant post-draft grades.',
              })
            }
          >
            <View style={styles.cardHeaderRow}>
              <Text style={styles.modeTitle}>Mock Draft</Text>
              <View style={styles.soonBadge}>
                <Text style={styles.soonBadgeText}>SOON</Text>
              </View>
            </View>
            <Text style={styles.modeDesc}>
              Rapid-fire draft room practice against 11 AI personas with custom draft positions and grades.
            </Text>
          </Btn>

          <Btn
            style={styles.placeholderCard}
            onPress={() =>
              setNotice({
                title: 'Normal / Custom Rules — Coming Soon',
                body: 'Customize league size (8, 10, 12, 14 teams), Half-PPR / Full PPR / Superflex scoring, and scouting difficulty presets.',
              })
            }
          >
            <View style={styles.cardHeaderRow}>
              <Text style={styles.modeTitle}>Custom League & Rules</Text>
              <View style={styles.soonBadge}>
                <Text style={styles.soonBadgeText}>SOON</Text>
              </View>
            </View>
            <Text style={styles.modeDesc}>
              Configure scoring formats (PPR, Half-PPR, Superflex), league size, and scouting fog difficulty.
            </Text>
          </Btn>
        </View>

        {/* Creator Cross-Promo: The QB Factory */}
        <Text style={styles.sectionLabel}>MORE BY THIS CREATOR</Text>
        <Btn style={styles.promoCard} onPress={handleOpenQBFactory}>
          <View style={{ flex: 1 }}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.promoTitle}>{EXTERNAL_LINKS.qbFactory.title}</Text>
              <View style={styles.promoBadge}>
                <Text style={styles.promoBadgeText}>OTHER GAME</Text>
              </View>
            </View>
            <Text style={styles.modeDesc}>{EXTERNAL_LINKS.qbFactory.tagline}</Text>
            <Text style={styles.promoLinkText}>Open The QB Factory (Placeholder Link) ↗</Text>
          </View>
        </Btn>
      </ScrollView>

      {/* First-Timer's Guide Modal */}
      <Modal visible={showGuide} transparent animationType="fade" onRequestClose={() => setShowGuide(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 460, maxHeight: '88%' }]}>
            <View style={styles.cardHeaderRow}>
              <View>
                <Text style={styles.guideEyebrow}>FIRST-TIMER&apos;S HANDBOOK</Text>
                <Text style={styles.modalTitle}>What Is Gridiron Dynasty?</Text>
              </View>
              <Btn style={styles.closeSmallBtn} onPress={() => setShowGuide(false)}>
                <Text style={styles.closeSmallBtnText}>✕</Text>
              </Btn>
            </View>

            <View style={styles.guideTabRow}>
              <Btn
                style={[styles.guideTabBtn, guideTab === 'WHAT' && styles.guideTabBtnActive]}
                onPress={() => setGuideTab('WHAT')}
              >
                <Text style={[styles.guideTabText, guideTab === 'WHAT' && styles.guideTabTextActive]}>
                  WHAT IS IT?
                </Text>
              </Btn>
              <Btn
                style={[styles.guideTabBtn, guideTab === 'HOW' && styles.guideTabBtnActive]}
                onPress={() => setGuideTab('HOW')}
              >
                <Text style={[styles.guideTabText, guideTab === 'HOW' && styles.guideTabTextActive]}>
                  HOW TO PLAY
                </Text>
              </Btn>
              <Btn
                style={[styles.guideTabBtn, guideTab === 'META' && styles.guideTabBtnActive]}
                onPress={() => setGuideTab('META')}
              >
                <Text style={[styles.guideTabText, guideTab === 'META' && styles.guideTabTextActive]}>
                  FOG & META
                </Text>
              </Btn>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {guideTab === 'WHAT' && (
                <View style={{ gap: 10 }}>
                  <View style={styles.guideBlock}>
                    <Text style={styles.guideBlockTag}>THE PITCH</Text>
                    <Text style={styles.guideBlockTitle}>A Fantasy Football RPG & Front-Office Sim</Text>
                    <Text style={styles.guideBlockBody}>
                      Gridiron Dynasty puts you in the GM chair of a 12-team fantasy football franchise set inside a living 32-team pro football universe (real pro cities with original mascots, offensive schemes, and stadium weather).
                    </Text>
                  </View>
                  <View style={styles.guideBlock}>
                    <Text style={styles.guideBlockTag}>DYNASTY FORMAT</Text>
                    <Text style={styles.guideBlockTitle}>Keep Your Roster Year After Year</Text>
                    <Text style={styles.guideBlockBody}>
                      Unlike redraft fantasy where teams reset every year, you carry your roster across seasons. Veterans age and eventually retire into the Hall of Fame while you replenish your squad every offseason in the 3-Round Rookie Draft.
                    </Text>
                  </View>
                  <View style={styles.guideBlock}>
                    <Text style={styles.guideBlockTag}>RPG PROGRESSION</Text>
                    <Text style={styles.guideBlockTitle}>You Level Up as a Fantasy Manager</Text>
                    <Text style={styles.guideBlockBody}>
                      Winning weekly matchups and finishing seasons earns Manager XP and Skill Points. Spend points in Scouting Accuracy, Film Room Analyst, and Front Office GM to shrink attribute uncertainty and outsmart AI managers.
                    </Text>
                  </View>
                </View>
              )}

              {guideTab === 'HOW' && (
                <View style={{ gap: 10 }}>
                  <View style={styles.guideBlock}>
                    <Text style={styles.guideBlockTag}>STEP 1 · STARTUP DRAFT</Text>
                    <Text style={styles.guideBlockTitle}>Draft 16 Players (8 Starters + 8 Bench)</Text>
                    <Text style={styles.guideBlockBody}>
                      Your starting lineup is 1 QB, 2 RB, 2 WR, 1 TE, and 2 FLEX (RB/WR/TE) under Full PPR scoring (1 point per catch). Use the Draft Log & Team Builds tabs to spot position runs, or queue targets (+Q) and toggle Live Autopick.
                    </Text>
                  </View>
                  <View style={styles.guideBlock}>
                    <Text style={styles.guideBlockTag}>STEP 2 · WEEKLY NEWS & LINEUPS</Text>
                    <Text style={styles.guideBlockTitle}>Check Practice Reports & Green/Red Accents</Text>
                    <Text style={styles.guideBlockBody}>
                      Before simming a week, check News & Top-200 Intel. Official practice tags (FULL, PARTIAL, DNP, OUT) are always visible. Players on YOUR roster are highlighted in Green (healthy/steady) or Red (injured, DNP/LP, or losing snaps).
                    </Text>
                  </View>
                  <View style={styles.guideBlock}>
                    <Text style={styles.guideBlockTag}>STEP 3 · TRADES, WAIVERS & TAXI</Text>
                    <Text style={styles.guideBlockTitle}>Beat the Week 10 Trade Deadline</Text>
                    <Text style={styles.guideBlockBody}>
                      Stash up to 3 Year 1–2 players on your Rookie Taxi Squad, claim free agents on Waivers, and propose deals (or answer sparing AI trade offers). Check the Wall Calendar — trading locks after Week 10 until the Offseason!
                    </Text>
                  </View>
                  <View style={styles.guideBlock}>
                    <Text style={styles.guideBlockTag}>STEP 4 · PLAYOFFS & ROOKIE DRAFT</Text>
                    <Text style={styles.guideBlockTitle}>Chase the Ring in Weeks 15–17</Text>
                    <Text style={styles.guideBlockBody}>
                      The Top 6 teams make the Playoffs (Seeds #1 & #2 earn a Round 1 Bye). After Week 17, review season awards and enter the 3-Round Rookie Draft to build a multi-year dynasty.
                    </Text>
                  </View>
                </View>
              )}

              {guideTab === 'META' && (
                <View style={{ gap: 10 }}>
                  <View style={styles.guideBlock}>
                    <Text style={styles.guideBlockTag}>1–10 SCOUTING FOG</Text>
                    <Text style={styles.guideBlockTitle}>Why Player Ratings Show a Range</Text>
                    <Text style={styles.guideBlockBody}>
                      Every player is rated 1–10 across 10 attributes (Speed, Route Running, Hands, Playmaking, Durability, etc.), but at Level 1 your scouting has ±2.2 fog (e.g., 6.3–9.5 OVR), and Rookies carry extra fog. Upgrade Scouting Accuracy & Front Office GM to reveal their true ratings!
                    </Text>
                  </View>
                  <View style={styles.guideBlock}>
                    <Text style={styles.guideBlockTag}>BEAT REPORTER NUANCE</Text>
                    <Text style={styles.guideBlockTitle}>Read Between the Lines (Top 200 Only)</Text>
                    <Text style={styles.guideBlockBody}>
                      Only the Top 200 Fantasy Players receive weekly beat-writer coverage and snap-share tracking (#201+ players have no advanced intel). Beat reporters don&apos;t hand out obvious &quot;+10% boost&quot; labels — read their notes on first-team reps, two-minute drill usage, and protection breakdowns.
                    </Text>
                  </View>
                  <View style={styles.guideBlock}>
                    <Text style={styles.guideBlockTag}>6 HIDDEN MODIFIERS</Text>
                    <Text style={styles.guideBlockTitle}>Crack the Simulation Meta</Text>
                    <Text style={styles.guideBlockBody}>
                      Pro team schemes (Air Raid, West Coast, Play Action, Ground & Pound), stadium weather (Weeks 12+ winter wind/cold vs. Domes), and O-Line / coverage matchups silently multiply player output. Upgrade Film Room Analyst in Career & Skills to unlock explicit clues!
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>

            <Btn style={styles.primaryBtn} onPress={() => setShowGuide(false)}>
              <Text style={styles.primaryBtnText}>Ready to Hit the Field</Text>
            </Btn>
          </View>
        </View>
      </Modal>

      {/* Placeholder Info Modal */}
      <Modal visible={Boolean(notice)} transparent animationType="fade" onRequestClose={() => setNotice(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{notice?.title}</Text>
            <Text style={styles.modalBody}>{notice?.body}</Text>
            <Btn style={styles.primaryBtn} onPress={() => setNotice(null)}>
              <Text style={styles.primaryBtnText}>Got It</Text>
            </Btn>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 18, paddingBottom: 36, gap: 16 },
  hero: { alignItems: 'flex-start', paddingTop: 18, paddingBottom: 8, gap: 2 },
  eyebrowPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: COLORS.flare,
    transform: [{ skewX: '-12deg' }],
    marginBottom: 8,
  },
  eyebrowText: { color: COLORS.ink, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  logoTop: {
    color: COLORS.text,
    fontSize: 54,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: -1,
    lineHeight: 56,
  },
  logoSlab: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 12,
    paddingRight: 24,
    transform: [{ skewX: '-12deg' }],
    borderBottomWidth: 6,
    borderBottomColor: COLORS.accentDark,
  },
  logoBottom: {
    color: COLORS.ink,
    fontSize: 54,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: -1,
    lineHeight: 60,
  },
  logoSub: { color: COLORS.muted, fontSize: 13, maxWidth: 320, marginTop: 12, letterSpacing: 0.3 },
  primaryCard: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderLeftWidth: 10,
    borderLeftColor: COLORS.accent,
    borderBottomWidth: 5,
    borderBottomColor: '#0F130B',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardTitle: { color: COLORS.text, fontSize: 22, fontWeight: '900', fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardDesc: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    transform: [{ skewX: '-12deg' }],
  },
  badgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  saveStrip: {
    backgroundColor: '#000000',
    padding: 10,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.flare,
  },
  saveTeamName: { color: COLORS.text, fontSize: 15, fontWeight: '900', textTransform: 'uppercase' },
  saveMeta: { color: COLORS.accent, fontSize: 12, marginTop: 2, fontWeight: '700' },
  input: {
    backgroundColor: '#000000',
    borderBottomWidth: 4,
    borderBottomColor: COLORS.accent,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  primaryBtn: {
    backgroundColor: COLORS.accent,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: COLORS.ink, fontWeight: '900', fontSize: 15, letterSpacing: 1.2, textTransform: 'uppercase' },
  secondaryBtn: {
    backgroundColor: COLORS.cardHi,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { color: COLORS.text, fontWeight: '900', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  sectionLabel: {
    color: COLORS.ink,
    backgroundColor: COLORS.text,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.6,
    marginTop: 8,
    transform: [{ skewX: '-12deg' }],
  },
  modeGrid: { gap: 12 },
  placeholderCard: {
    backgroundColor: COLORS.card,
    padding: 14,
  },
  modeTitle: { color: COLORS.text, fontSize: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  modeDesc: { color: COLORS.muted, fontSize: 12, lineHeight: 17 },
  soonBadge: {
    backgroundColor: COLORS.muted,
    paddingHorizontal: 8,
    paddingVertical: 3,
    transform: [{ skewX: '-12deg' }],
  },
  soonBadgeText: { color: COLORS.ink, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  promoCard: {
    backgroundColor: COLORS.flare,
    padding: 16,
  },
  promoTitle: { color: COLORS.ink, fontSize: 20, fontWeight: '900', fontStyle: 'italic', textTransform: 'uppercase' },
  promoBadge: {
    backgroundColor: COLORS.ink,
    paddingHorizontal: 8,
    paddingVertical: 3,
    transform: [{ skewX: '-12deg' }],
  },
  promoBadgeText: { color: COLORS.flare, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  promoLinkText: { color: COLORS.ink, fontSize: 12, fontWeight: '900', marginTop: 8, textTransform: 'uppercase' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.card,
    padding: 18,
    borderTopWidth: 8,
    borderTopColor: COLORS.accent,
    gap: 12,
  },
  modalTitle: { color: COLORS.text, fontSize: 17, fontWeight: '900', textTransform: 'uppercase' },
  modalBody: { color: COLORS.muted, fontSize: 13, lineHeight: 19 },
  guideMenuCard: {
    backgroundColor: COLORS.card,
    padding: 15,
    borderLeftWidth: 8,
    borderLeftColor: COLORS.warning,
  },
  guideCtaText: {
    color: COLORS.warning,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 8,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  guideEyebrow: {
    color: COLORS.warning,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  closeSmallBtn: {
    backgroundColor: COLORS.cardHi,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  closeSmallBtnText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '900',
  },
  guideTabRow: {
    flexDirection: 'row',
    gap: 6,
  },
  guideTabBtn: {
    flex: 1,
    backgroundColor: COLORS.cardHi,
    paddingVertical: 8,
    alignItems: 'center',
  },
  guideTabBtnActive: {
    backgroundColor: COLORS.accent,
  },
  guideTabText: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  guideTabTextActive: {
    color: COLORS.ink,
  },
  guideBlock: {
    backgroundColor: '#000000',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.accent,
    padding: 12,
    gap: 4,
  },
  guideBlockTag: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  guideBlockTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '900',
  },
  guideBlockBody: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
  },
});
