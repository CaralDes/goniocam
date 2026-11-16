import { describe, expect, it } from 'vitest';
import { v3 } from '../src/core/vec';
import { prepareFrame, alignDepth, selectHand, labelToSide, type PrepareOptions } from '../src/core/prepare';
import { getMeasure, MEASURES } from '../src/core/measures';
import { STEP_BY_ID, STEPS, PROTOCOLS, validateCatalog } from '../src/core/protocols';
import { checkView, DEFAULT_VIEW_TOL, confidenceScore, confidenceLevel, shoulderYaw } from '../src/core/quality';
import { OneEuroFilter, MovingAverageFilter } from '../src/core/filters';
import { StabilityTracker } from '../src/core/stability';
import { StepAnalyzer, type AnalyzerOptions } from '../src/core/analysis';
import { computeRows, deficit, fmtDeg, fmtPct, captureKey, type Bilan, type Capture } from '../src/core/results';
import { isReading } from '../src/core/types';
import { synthHand, rawHand, detection, mirrorX, synthBody, rawPose } from './synth';

const PROFILE = { d: v3(0, -1, 0), p: v3(1, 0, 0) };
const PALM = { d: v3(0, -1, 0), p: v3(0, 0, -1) };
const opts = (o: Partial<PrepareOptions> = {}): PrepareOptions => ({
  side: 'D',
  mirrored: false,
  mode: '3d',
  wristRef: null,
  invertDepth: false,
  ...o,
});

describe('Préparation des images', () => {
  it('alignDepth corrige une convention de profondeur inversée', () => {
    const img = [v3(0, 0, 0), v3(1, 0, 1), v3(0, 1, 2)];
    const world = [v3(0, 0, 0), v3(1, 0, -1), v3(0, 1, -2)];
    expect(alignDepth(world, img)[2].z).toBe(2);
    expect(alignDepth(img, img)[2].z).toBe(2);
  });

  it('étiquette de main : miroir inverse le côté', () => {
    expect(labelToSide('Right', false)).toBe('D');
    expect(labelToSide('Right', true)).toBe('G');
    expect(labelToSide(null, false)).toBeNull();
  });

  it('sélection de la main du côté mesuré parmi deux', () => {
    const r = rawHand(synthHand('D', PALM), 'Right');
    const l = rawHand(synthHand('G', PALM), 'Left');
    expect(selectHand([l, r], 'D', false, null)).toBe(r);
    expect(selectHand([l, r], 'G', false, null)).toBe(l);
  });

  it('chaîne complète : repères bruts → mesure, image normale et image miroir', () => {
    const pts = synthHand('D', PROFILE, { fingers: { 2: [35, 75, 25] } });
    const hand = rawHand(pts, 'Right');
    const m = getMeasure('d2_ipp_flex');
    for (const mode of ['3d', '2d'] as const) {
      const { frame } = prepareFrame(detection([hand], null), opts({ mode }));
      const r = m.compute(frame);
      expect(isReading(r) && r.value).toBeCloseTo(75, 0);
    }
    // Même main filmée puis enregistrée en miroir (selfie) : le réglage « image inversée » rétablit le signe.
    const mirrored = { ...hand, landmarks: mirrorX(hand.landmarks), world: hand.world!.map((p) => ({ ...p, x: -p.x })), label: 'Left' };
    const { frame: fm, warnings } = prepareFrame(detection([mirrored], null), opts({ mirrored: true }));
    expect(warnings).toEqual([]);
    const rm = m.compute(fm);
    expect(isReading(rm) && rm.value).toBeCloseTo(75, 0);
    // Sans le réglage, l'app signale la discordance de côté.
    const { warnings: w2 } = prepareFrame(detection([mirrored], null), opts({ mirrored: false }));
    expect(w2.length).toBe(1);
  });

  it('extension = −flexion (flessum négatif, hyperextension positive)', () => {
    const pts = synthHand('G', PROFILE, { fingers: { 3: [-15, 20, 0] } });
    const { frame } = prepareFrame(detection([rawHand(pts, 'Left')], null), opts({ side: 'G' }));
    const mcp = getMeasure('d3_mcp_ext').compute(frame);
    const ipp = getMeasure('d3_ipp_ext').compute(frame);
    expect(isReading(mcp) && mcp.value).toBeCloseTo(15, 0);
    expect(isReading(ipp) && ipp.value).toBeCloseTo(-20, 0);
  });

  it('coude de profil via Pose', () => {
    const body = synthBody({ view: 'profil-droite', side: 'D', elbow: 110 });
    const { frame } = prepareFrame(detection([], rawPose(body)), opts());
    const r = getMeasure('coude_flex').compute(frame);
    expect(isReading(r) && r.value).toBeCloseTo(110, 0);
  });

  it('poignet : erreur explicite sans avant-bras, mesure avec zéro de référence', () => {
    const pts = synthHand('D', { d: v3(1, 0, 0), p: v3(0, 1, 0) });
    const det = detection([rawHand(pts, 'Right')], null);
    const r0 = getMeasure('poignet_flex').compute(prepareFrame(det, opts()).frame);
    expect(isReading(r0)).toBe(false);
    const r1 = getMeasure('poignet_flex').compute(prepareFrame(det, opts({ wristRef: v3(1, 0, 0) })).frame);
    expect(isReading(r1) && r1.value).toBeCloseTo(0, 0);
  });
});

describe('Contrôle de la vue', () => {
  it('main de profil / paume face', () => {
    const prof = synthHand('D', PROFILE);
    const palm = synthHand('D', PALM);
    expect(checkView('main-profil', DEFAULT_VIEW_TOL, prof, null).ok).toBe(true);
    expect(checkView('main-profil', DEFAULT_VIEW_TOL, palm, null).ok).toBe(false);
    expect(checkView('main-face', DEFAULT_VIEW_TOL, palm, null).ok).toBe(true);
    expect(checkView('main-face', DEFAULT_VIEW_TOL, prof, null).ok).toBe(false);
    expect(checkView('main-face', DEFAULT_VIEW_TOL, null, null).factor).toBe(0);
  });
  it('vue axiale', () => {
    const axial = synthHand('D', { d: v3(0, 0, -1), p: v3(1, 0, 0) });
    expect(checkView('main-axiale', DEFAULT_VIEW_TOL, axial, null).ok).toBe(true);
    expect(checkView('main-axiale', DEFAULT_VIEW_TOL, synthHand('D', PALM), null).ok).toBe(false);
  });
  it('sujet de face / de profil', () => {
    const face = synthBody({ view: 'face', side: 'D' });
    const prof = synthBody({ view: 'profil-gauche', side: 'D' });
    expect(shoulderYaw(face)).toBeCloseTo(0, 3);
    expect(shoulderYaw(prof)).toBeCloseTo(90, 3);
    expect(checkView('corps-face', DEFAULT_VIEW_TOL, null, face).ok).toBe(true);
    expect(checkView('corps-profil', DEFAULT_VIEW_TOL, null, face).ok).toBe(false);
    expect(checkView('corps-profil', DEFAULT_VIEW_TOL, null, prof).ok).toBe(true);
  });
  it('confiance : pénalité hors plan plus forte en 2D', () => {
    const base = { detection: 1, viewFactor: 1, outOfPlane: 40, outOfPlaneTol: 20, inImagePlane: true };
    expect(confidenceScore({ ...base, mode: '2d' })).toBeLessThan(confidenceScore({ ...base, mode: '3d' }));
    expect(confidenceScore({ ...base, outOfPlane: 10, mode: '2d' })).toBe(1);
    expect(confidenceLevel(0.9, 0.6)).toBe('vert');
    expect(confidenceLevel(0.7, 0.6)).toBe('orange');
    expect(confidenceLevel(0.5, 0.6)).toBe('rouge');
  });
});

describe('Filtres et stabilité', () => {
  it('One Euro converge vers une valeur constante et lisse le bruit', () => {
    const f = new OneEuroFilter();
    let out = 0;
    for (let i = 0; i < 120; i++) out = f.filter(60 + (i % 2 ? 2 : -2), i * 33);
    expect(Math.abs(out - 60)).toBeLessThan(1.5);
  });
  it('moyenne glissante sur 10 images', () => {
    const f = new MovingAverageFilter(10);
    for (let i = 1; i <= 20; i++) f.filter(i);
    expect(f.filter(21)).toBeCloseTo(16.5);
  });
  it('stabilité 1 s puis médiane', () => {
    const t = new StabilityTracker({ windowMs: 1000, toleranceDeg: 3, minConfidence: 0.6, minSamples: 5 });
    for (let i = 0; i <= 10; i++) t.push({ t: i * 50, values: { a: 30 + i * 5 }, confidence: { a: 0.9 } }); // mouvement
    expect(t.isStable('a')).toBe(false);
    for (let i = 0; i <= 35; i++) t.push({ t: 600 + i * 33, values: { a: 80 + (i % 3) - 1 }, confidence: { a: 0.9 } });
    expect(t.isStable('a')).toBe(true);
    const r = t.result('a')!;
    expect(r.values.a).toBeCloseTo(80, 0);
    expect(r.samples.length).toBeGreaterThanOrEqual(25);
  });
  it('confiance basse : pas de stabilité', () => {
    const t = new StabilityTracker({ windowMs: 1000, toleranceDeg: 3, minConfidence: 0.6, minSamples: 5 });
    for (let i = 0; i <= 40; i++) t.push({ t: i * 33, values: { a: 50 }, confidence: { a: 0.4 } });
    expect(t.isStable('a')).toBe(false);
    expect(t.result('a')).toBeNull();
  });
});

describe('Analyse d\'une étape', () => {
  const aopts: AnalyzerOptions = {
    smoothing: 'oneeuro',
    confidenceThreshold: 0.6,
    stabilityToleranceDeg: 3,
    stabilityWindowMs: 1000,
    outOfPlaneTolDeg: 20,
    viewTol: DEFAULT_VIEW_TOL,
  };

  it('doigts en flexion : stabilité, capture des 12 articulations', () => {
    const an = new StepAnalyzer(STEP_BY_ID.doigts_flex, aopts);
    const fingers = { 2: [70, 90, 60], 3: [75, 95, 60], 4: [80, 95, 55], 5: [85, 90, 50] } as const;
    const det = detection([rawHand(synthHand('D', PROFILE, { fingers: fingers as never }), 'Right')], null);
    let out;
    for (let i = 0; i < 45; i++) out = an.process(prepareFrame(det, opts()).frame, i * 33);
    expect(out!.view.ok).toBe(true);
    expect(out!.refusal).toBeNull();
    expect(out!.stable).toBe(true);
    const c = an.capture(false);
    expect('values' in c).toBe(true);
    if ('values' in c) {
      expect(c.values.d2_ipp_flex).toBeCloseTo(90, 0);
      expect(c.values.d5_mcp_flex).toBeCloseTo(85, 0);
      expect(Object.keys(c.values)).toHaveLength(12);
    }
  });

  it('refus de capture si la vue est incorrecte', () => {
    const an = new StepAnalyzer(STEP_BY_ID.doigts_flex, aopts);
    const det = detection([rawHand(synthHand('D', PALM), 'Right')], null);
    let out;
    for (let i = 0; i < 45; i++) out = an.process(prepareFrame(det, opts()).frame, i * 33);
    expect(out!.view.ok).toBe(false);
    expect(out!.refusal).toMatch(/profil/);
    expect('error' in an.capture(true)).toBe(true);
  });

  it('refus si rien n\'est détecté', () => {
    const an = new StepAnalyzer(STEP_BY_ID.coude_flex, aopts);
    const out = an.process(prepareFrame(detection([], null), opts()).frame, 0);
    expect(out.refusal).toBeTruthy();
  });
});

describe('Bilan et déficits', () => {
  it('déficit sain − atteint, en ° et %', () => {
    expect(deficit(90, 60)).toEqual({ deg: 30, pct: (30 / 90) * 100 });
    expect(deficit(0, -20).pct).toBeNull();
    expect(deficit(null, 20).deg).toBeNull();
  });
  it('lignes du récapitulatif', () => {
    const cap = (id: string, side: 'G' | 'D', value: number): Capture => ({
      measureId: id, side, value, autoValue: value, corrected: false, confidence: 0.9, view: 'corps-profil',
      mode: '3d', source: 'camera', forced: false, timestamp: '', samples: [], notes: [],
    });
    const b: Bilan = {
      patientCode: 'P001', affectedSide: 'D', examiner: '', date: '2026-11-16', protocolId: 'coude', steps: [],
      captures: {
        [captureKey('coude_flex', 'D')]: cap('coude_flex', 'D', 120),
        [captureKey('coude_flex', 'G')]: cap('coude_flex', 'G', 145),
      },
    };
    const rows = computeRows(b, ['coude_ext', 'coude_flex'], {});
    expect(rows[0].measureId).toBe('coude_flex');
    expect(rows[0].deficitDeg).toBe(25);
    expect(rows[0].norm).toBe(150);
    expect(rows[1].deficitDeg).toBeNull();
    expect(fmtDeg(-0.2)).toBe('0°');
    expect(fmtPct(17.24)).toBe('17 %');
  });
});

describe('Catalogue', () => {
  it('cohérent', () => {
    expect(validateCatalog()).toEqual([]);
    expect(new Set(MEASURES.map((m) => m.id)).size).toBe(MEASURES.length);
    expect(STEPS.length).toBeGreaterThan(10);
    expect(PROTOCOLS.find((p) => p.id === 'main')!.steps).toHaveLength(4);
  });
  it('mesures expérimentales marquées', () => {
    for (const id of ['epaule_re', 'pronation', 'supination']) expect(getMeasure(id).experimental).toBe(true);
  });
});
