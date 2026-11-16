/** Bilan : captures, bilatéralité et déficits. Module pur. */
import type { CalcMode, Side } from './types';
import type { ViewKind } from './quality';
import { getMeasure, MEASURES, type Region } from './measures';

export type Source = 'camera' | 'video' | 'photo';

export interface RawSample {
  t: number;
  value: number | null;
  confidence: number;
}

export interface Capture {
  measureId: string;
  side: Side;
  /** Valeur retenue (éventuellement corrigée à la main). */
  value: number;
  /** Valeur calculée par l'app. */
  autoValue: number | null;
  corrected: boolean;
  confidence: number;
  view: ViewKind;
  mode: CalcMode;
  source: Source;
  /** Capture déclenchée à la main avant stabilité complète. */
  forced: boolean;
  timestamp: string;
  samples: RawSample[];
  notes: string[];
}

export interface Bilan {
  patientCode: string;
  affectedSide: Side;
  examiner: string;
  date: string;
  protocolId: string;
  steps: string[];
  captures: Record<string, Capture>;
}

export const captureKey = (measureId: string, side: Side) => `${measureId}|${side}`;
export const otherSide = (s: Side): Side => (s === 'G' ? 'D' : 'G');
export const sideLabel = (s: Side) => (s === 'G' ? 'gauche' : 'droit');

export interface ResultRow {
  measureId: string;
  region: Region;
  label: string;
  experimental: boolean;
  norm: number;
  healthy: Capture | null;
  affected: Capture | null;
  /** Côté sain − côté atteint, en degrés. */
  deficitDeg: number | null;
  /** Déficit rapporté au côté sain, en %. Non défini si le côté sain est ≤ 5° ou pour une extension. */
  deficitPct: number | null;
}

/** Déficit sain − atteint, en ° et en % du côté sain. */
export function deficit(healthy: number | null, affected: number | null): { deg: number | null; pct: number | null } {
  if (healthy === null || affected === null) return { deg: null, pct: null };
  const deg = healthy - affected;
  const pct = healthy > 5 ? (deg / healthy) * 100 : null;
  return { deg, pct };
}

export function computeRows(b: Bilan, measureIds: string[], norms: Record<string, number>): ResultRow[] {
  const healthySide = otherSide(b.affectedSide);
  const order = new Map(MEASURES.map((m, i) => [m.id, i]));
  return [...new Set(measureIds)]
    .sort((x, y) => (order.get(x) ?? 0) - (order.get(y) ?? 0))
    .map((id) => {
      const m = getMeasure(id);
      const healthy = b.captures[captureKey(id, healthySide)] ?? null;
      const affected = b.captures[captureKey(id, b.affectedSide)] ?? null;
      const d = deficit(healthy?.value ?? null, affected?.value ?? null);
      // Pour les extensions (référence 0°), un pourcentage n'a pas de sens clinique.
      if (m.direction === 'extension') d.pct = null;
      return {
        measureId: id,
        region: m.region,
        label: m.label,
        experimental: !!m.experimental,
        norm: norms[id] ?? m.defaultNorm,
        healthy,
        affected,
        deficitDeg: d.deg,
        deficitPct: d.pct,
      };
    });
}

/** Arrondi d'affichage à l'entier, sans « -0 ». */
export const fmtDeg = (v: number | null | undefined): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const r = Math.round(v);
  return `${r === 0 ? 0 : r}°`;
};

export const fmtPct = (v: number | null | undefined): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const r = Math.round(v);
  return `${r === 0 ? 0 : r} %`;
};
