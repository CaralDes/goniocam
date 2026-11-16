/** Filtres temporels des valeurs d'angle. */

export interface ScalarFilter {
  /** `t` en millisecondes. */
  filter(value: number, t: number): number;
  reset(): void;
}

/**
 * Filtre One Euro (Casiez et al., CHI 2012) : lissage fort à l'arrêt, faible latence en mouvement.
 * Paramètres en Hz ; `beta` règle la réactivité à la vitesse.
 */
export class OneEuroFilter implements ScalarFilter {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev = 0;

  constructor(
    private minCutoff = 1.0,
    private beta = 0.02,
    private dCutoff = 1.0,
  ) {}

  private static alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value: number, t: number): number {
    if (this.xPrev === null) {
      this.xPrev = value;
      this.tPrev = t;
      this.dxPrev = 0;
      return value;
    }
    const dt = Math.max((t - this.tPrev) / 1000, 1e-3);
    this.tPrev = t;
    const dx = (value - this.xPrev) / dt;
    const aD = OneEuroFilter.alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = OneEuroFilter.alpha(cutoff, dt);
    const xHat = a * value + (1 - a) * this.xPrev;
    this.xPrev = xHat;
    this.dxPrev = dxHat;
    return xHat;
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
  }
}

/** Moyenne glissante sur les `size` dernières valeurs. */
export class MovingAverageFilter implements ScalarFilter {
  private buf: number[] = [];
  constructor(private size = 10) {}
  filter(value: number): number {
    this.buf.push(value);
    if (this.buf.length > this.size) this.buf.shift();
    return this.buf.reduce((s, x) => s + x, 0) / this.buf.length;
  }
  reset() {
    this.buf = [];
  }
}

export type SmoothingKind = 'oneeuro' | 'moyenne' | 'aucun';

export function makeFilter(kind: SmoothingKind): ScalarFilter {
  if (kind === 'moyenne') return new MovingAverageFilter(10);
  if (kind === 'aucun') return { filter: (v) => v, reset() {} };
  return new OneEuroFilter();
}
