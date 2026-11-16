/**
 * Moteur d'analyse d'une étape : pour chaque image, calcule les angles, les filtre,
 * évalue la qualité et suit la stabilité jusqu'à la capture.
 */
import type { ArcOverlay, CalcMode, Frame } from './types';
import { isReading } from './types';
import { getMeasure } from './measures';
import type { StepDef } from './protocols';
import { checkView, confidenceLevel, confidenceScore, maxOutOfPlane, type ConfidenceLevel, type ViewCheck, type ViewTolerances } from './quality';
import { makeFilter, type ScalarFilter, type SmoothingKind } from './filters';
import { StabilityTracker, type Sample } from './stability';
import { POSE } from './landmarks';

export interface AnalyzerOptions {
  smoothing: SmoothingKind;
  confidenceThreshold: number;
  stabilityToleranceDeg: number;
  stabilityWindowMs: number;
  outOfPlaneTolDeg: number;
  viewTol: ViewTolerances;
}

export interface MeasureLive {
  id: string;
  raw: number | null;
  value: number | null;
  confidence: number;
  outOfPlane: number;
  error?: string;
  notes: string[];
  arc?: ArcOverlay;
}

export interface AnalysisOutput {
  t: number;
  view: ViewCheck;
  measures: Record<string, MeasureLive>;
  primary: string;
  confidence: number;
  level: ConfidenceLevel;
  /** Raison du refus de capture, ou null si la capture est possible. */
  refusal: string | null;
  stableProgress: number;
  stable: boolean;
  warnings: string[];
  mode: CalcMode;
}

export interface CaptureResult {
  values: Record<string, number | null>;
  confidence: Record<string, number>;
  samples: Sample[];
  forced: boolean;
}

export class StepAnalyzer {
  private filters: Record<string, ScalarFilter> = {};
  private tracker: StabilityTracker;
  primary: string;
  last: AnalysisOutput | null = null;

  constructor(
    public step: StepDef,
    private opts: AnalyzerOptions,
  ) {
    this.primary = step.primary;
    for (const id of step.measures) this.filters[id] = makeFilter(opts.smoothing);
    this.tracker = new StabilityTracker({
      windowMs: opts.stabilityWindowMs,
      toleranceDeg: opts.stabilityToleranceDeg,
      minConfidence: opts.confidenceThreshold,
      minSamples: 5,
    });
  }

  setPrimary(id: string) {
    if (this.step.measures.includes(id)) this.primary = id;
  }

  reset() {
    for (const f of Object.values(this.filters)) f.reset();
    this.tracker.reset();
    this.last = null;
  }

  process(frame: Frame, t: number, extraWarnings: string[] = []): AnalysisOutput {
    const o = this.opts;
    const handForView = frame.hand ? (frame.hand.world ?? frame.hand.image) : null;
    const poseForView = frame.pose ? (frame.pose.world ?? frame.pose.image) : null;
    const view = checkView(this.step.view, o.viewTol, handForView, poseForView);
    const warnings = [...extraWarnings];

    // Vue de face : en image non inversée, l'épaule gauche du sujet est à droite de l'image.
    if (this.step.view === 'corps-face' && frame.pose && view.ok) {
      const l = frame.pose.raw[POSE.L_SHOULDER];
      const r = frame.pose.raw[POSE.R_SHOULDER];
      const looksMirrored = l.x < r.x;
      if (looksMirrored !== frame.mirrored) warnings.push('Image en miroir ou sujet de dos ? Vérifier le réglage « image inversée »');
    }

    const measures: Record<string, MeasureLive> = {};
    const values: Record<string, number | null> = {};
    const confidence: Record<string, number> = {};
    for (const id of this.step.measures) {
      const def = getMeasure(id);
      const r = def.compute(frame);
      if (!isReading(r)) {
        measures[id] = { id, raw: null, value: null, confidence: 0, outOfPlane: 0, error: r.error, notes: [] };
        values[id] = null;
        confidence[id] = 0;
        this.filters[id].reset();
        continue;
      }
      const filtered = this.filters[id].filter(r.value, t);
      const oop = def.inImagePlane ? maxOutOfPlane(r.segments) : 0;
      const conf = confidenceScore({
        detection: r.detection,
        viewFactor: view.factor,
        outOfPlane: oop,
        outOfPlaneTol: o.outOfPlaneTolDeg,
        mode: frame.mode,
        inImagePlane: def.inImagePlane,
      });
      const notes = [...(r.notes ?? [])];
      if (def.inImagePlane && oop > o.outOfPlaneTolDeg) {
        notes.push(`Segment à ${Math.round(oop)}° du plan de l'image${frame.mode === '2d' ? ' : mesure 2D faussée' : ''}`);
      }
      measures[id] = { id, raw: r.value, value: filtered, confidence: conf, outOfPlane: oop, notes, arc: r.arc };
      values[id] = filtered;
      confidence[id] = conf;
    }

    this.tracker.push({ t, values, confidence });

    const pm = measures[this.primary];
    const conf = pm?.confidence ?? 0;
    let refusal: string | null = null;
    if (!pm || pm.value === null) refusal = pm?.error ?? 'Aucune mesure';
    else if (!view.ok) refusal = view.message;
    else if (conf < o.confidenceThreshold) refusal = `Confiance insuffisante (${Math.round(conf * 100)} %)`;

    const out: AnalysisOutput = {
      t,
      view,
      measures,
      primary: this.primary,
      confidence: conf,
      level: confidenceLevel(conf, o.confidenceThreshold),
      refusal,
      stableProgress: refusal ? 0 : this.tracker.progress(this.primary),
      stable: !refusal && this.tracker.isStable(this.primary),
      warnings,
      mode: frame.mode,
    };
    this.last = out;
    return out;
  }

  /**
   * Valeurs à capturer : médiane sur 1 s de position stable.
   * `force` (appui sur le bouton) accepte la dernière seconde même si elle n'est pas parfaitement stable,
   * mais jamais une image refusée (vue ou confiance insuffisante).
   */
  capture(force: boolean): CaptureResult | { error: string } {
    if (!this.last) return { error: 'Aucune image analysée' };
    if (this.last.refusal) return { error: this.last.refusal };
    const r = this.tracker.result(this.primary, force);
    if (!r) return { error: 'Position pas encore stable' };
    return { ...r, forced: force && !this.tracker.isStable(this.primary) };
  }
}
