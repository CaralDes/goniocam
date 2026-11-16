/** Détection d'une position stable et valeur retenue (médiane sur la fenêtre). */
import { median } from './vec';

export interface Sample {
  t: number;
  values: Record<string, number | null>;
  confidence: Record<string, number>;
}

export interface StabilityOptions {
  windowMs: number;
  /** Amplitude max (°) tolérée sur la fenêtre pour la mesure principale. */
  toleranceDeg: number;
  minConfidence: number;
  minSamples: number;
}

export interface StableResult {
  values: Record<string, number | null>;
  confidence: Record<string, number>;
  samples: Sample[];
}

export class StabilityTracker {
  private buf: Sample[] = [];
  constructor(public opts: StabilityOptions) {}

  push(s: Sample) {
    this.buf.push(s);
    const horizon = s.t - this.opts.windowMs * 3;
    while (this.buf.length && this.buf[0].t < horizon) this.buf.shift();
  }

  reset() {
    this.buf = [];
  }

  /** Plus long suffixe stable pour la mesure `primary` (toutes valeurs présentes, confiance suffisante). */
  private stableRun(primary: string): Sample[] {
    const run: Sample[] = [];
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = this.buf.length - 1; i >= 0; i--) {
      const s = this.buf[i];
      const v = s.values[primary];
      if (v === null || v === undefined || (s.confidence[primary] ?? 0) < this.opts.minConfidence) break;
      const nlo = Math.min(lo, v);
      const nhi = Math.max(hi, v);
      if (nhi - nlo > this.opts.toleranceDeg) break;
      lo = nlo;
      hi = nhi;
      run.unshift(s);
    }
    return run;
  }

  /** Progression (0–1) vers une position stable pendant `windowMs`. */
  progress(primary: string): number {
    const run = this.stableRun(primary);
    if (run.length < 2) return 0;
    return Math.min(1, (run[run.length - 1].t - run[0].t) / this.opts.windowMs);
  }

  isStable(primary: string): boolean {
    const run = this.stableRun(primary);
    return run.length >= this.opts.minSamples && this.progress(primary) >= 1;
  }

  /** Médiane de chaque mesure sur la fenêtre stable (ou sur la dernière fenêtre si `force`). */
  result(primary: string, force = false): StableResult | null {
    let window = this.stableRun(primary);
    if (window.length < this.opts.minSamples || this.progress(primary) < 1) {
      if (!force) return null;
      const last = this.buf.at(-1);
      if (!last) return null;
      window = this.buf.filter((s) => s.t >= last.t - this.opts.windowMs);
    }
    if (!window.length) return null;
    // On ne garde que la dernière fenêtre de `windowMs` (valeur = médiane sur 1 s de position stable).
    const tEnd = window[window.length - 1].t;
    window = window.filter((s) => s.t >= tEnd - this.opts.windowMs);
    const keys = Object.keys(window[0].values);
    const values: Record<string, number | null> = {};
    const confidence: Record<string, number> = {};
    for (const k of keys) {
      const vs = window.map((s) => s.values[k]).filter((v): v is number => v !== null && v !== undefined);
      values[k] = vs.length ? median(vs) : null;
      confidence[k] = median(window.map((s) => s.confidence[k] ?? 0));
    }
    return { values, confidence, samples: window };
  }
}
