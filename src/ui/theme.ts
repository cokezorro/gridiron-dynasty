import { Position } from '../engine';

/**
 * "Night Game" palette — stadium-lights asphalt, chalk-line white,
 * hi-vis lime and flare orange. Colour is delivered as solid blocks and
 * thick structural slabs, never as thin outlines.
 */
export const COLORS = {
  bg: '#0C0E0A',
  surface: '#161A12',
  card: '#222819',
  cardHi: '#2D3522',
  border: '#3A4430', // only used for hairline dividers between table rows
  text: '#F5F2E4',
  muted: '#A3AA90',
  accent: '#D4FF2E', // hi-vis lime
  accentDark: '#8FB300',
  flare: '#FF5B1F', // flare orange
  success: '#37E07A',
  warning: '#FFB020',
  danger: '#FF3B3B',
  purple: '#B48CFF',
  ink: '#0C0E0A', // text on bright blocks
};

export const POS_COLORS: Record<Position, string> = {
  QB: '#FF4D4D',
  RB: '#37E07A',
  WR: '#42C8FF',
  TE: '#FFB020',
};

/** Thickness of the 3D ledge under every button and the distance it sinks on press. */
export const LEDGE = 5;
export const SINK = 4;

/** Darken a #RRGGBB colour by a 0–1 amount (used for button ledges). */
export function shade(hex: string, amt = 0.45): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#000000';
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amt));
  const g = Math.round(((n >> 8) & 255) * (1 - amt));
  const b = Math.round((n & 255) * (1 - amt));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

export const SCHEME_LABELS: Record<string, string> = {
  AIR_RAID: 'Air Raid',
  WEST_COAST: 'West Coast',
  GROUND_POUND: 'Ground & Pound',
  PLAY_ACTION: 'Play Action',
  BALANCED: 'Balanced',
};

export const STADIUM_LABELS: Record<string, string> = {
  DOME: 'Dome',
  COLD_OUTDOOR: 'Cold Outdoor',
  WARM_OUTDOOR: 'Warm Outdoor',
  WINDY_OUTDOOR: 'Windy Outdoor',
};
