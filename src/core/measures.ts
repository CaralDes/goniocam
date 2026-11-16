/** Catalogue des mesures : mouvement → repères → calcul → norme. */
import type { ComputeResult, Frame, P2, Reading } from './types';
import { type Vec3, sub } from './vec';
import { ARM, FINGER_NAMES, HAND, POSE } from './landmarks';
import {
  armFor,
  elbowAngle3D,
  elbowFlexion,
  fingerFlexion,
  fingerSegments,
  type FingerJoint,
  type LongFinger,
  profileFacing,
  pronoSupination,
  shoulderAbduction,
  shoulderElevation,
  shoulderExternalRotation,
  thumbFlexion,
  trunkDown,
  wristDeviation,
  wristFlexion,
} from './angles';

export type Region = 'epaule' | 'coude' | 'avant-bras' | 'poignet' | 'doigts' | 'pouce';

export const REGION_LABELS: Record<Region, string> = {
  epaule: 'Épaule',
  coude: 'Coude',
  'avant-bras': 'Avant-bras',
  poignet: 'Poignet',
  doigts: 'Doigts longs',
  pouce: 'Pouce',
};

export interface MeasureDef {
  id: string;
  region: Region;
  /** Libellé complet (fiche PDF). */
  label: string;
  /** Libellé court (écran). */
  short: string;
  defaultNorm: number;
  experimental?: boolean;
  /** false pour les mesures hors du plan de l'image par nature (rotations). */
  inImagePlane: boolean;
  requires: { hand?: boolean; pose?: boolean };
  /** Pour le TAM (V2) : doigt et articulation, type de mesure. */
  finger?: 1 | 2 | 3 | 4 | 5;
  joint?: 'MCP' | 'IPP' | 'IPD' | 'IP';
  direction: 'flexion' | 'extension' | 'autre';
  compute(f: Frame): ComputeResult;
}

// ─────────────────────────────── Aides ───────────────────────────────

const ERR_HAND = { error: 'Main non détectée' };
const ERR_POSE = { error: 'Sujet non détecté (haut du corps et visage dans le champ)' };
const ERR_CALC = { error: 'Calcul impossible (repères alignés)' };

/** Repères de la main pour l'amplitude : monde 3D en mode 3D si disponible, sinon espace image. */
const handPts = (f: Frame): Vec3[] => (f.mode === '3d' && f.hand?.world ? f.hand.world : f.hand!.image);
const posePts = (f: Frame): Vec3[] => (f.mode === '3d' && f.pose?.world ? f.pose.world : f.pose!.image);

const extend = (o: P2, p: P2, k = 1): P2 => ({ x: o.x + (o.x - p.x) * k, y: o.y + (o.y - p.y) * k });

function signed(value: number | null, dir: 'flexion' | 'extension'): number | null {
  if (value === null) return null;
  return dir === 'flexion' ? value : -value;
}

// ─────────────────────────────── Doigts longs ───────────────────────────────

const FINGER_NORMS: Record<FingerJoint, number> = { MCP: 90, IPP: 100, IPD: 90 };

function fingerMeasure(finger: LongFinger, joint: FingerJoint, dir: 'flexion' | 'extension'): MeasureDef {
  const name = FINGER_NAMES[finger];
  return {
    id: `d${finger}_${joint.toLowerCase()}_${dir === 'flexion' ? 'flex' : 'ext'}`,
    region: 'doigts',
    label: `D${finger} (${name.toLowerCase()}) ${joint} — ${dir}`,
    short: `D${finger} ${joint}`,
    defaultNorm: dir === 'flexion' ? FINGER_NORMS[joint] : 0,
    inImagePlane: true,
    requires: { hand: true },
    finger,
    joint,
    direction: dir,
    compute(f) {
      if (!f.hand) return ERR_HAND;
      const pts = handPts(f);
      const v = signed(fingerFlexion(pts, finger, joint, f.side, f.mirrored, f.mode), dir);
      if (v === null) return ERR_CALC;
      const seg3d = f.hand.world ?? f.hand.image;
      const [a, b, ip, io, id] = fingerSegments(seg3d, finger, joint);
      const raw = f.hand.raw;
      return {
        value: v,
        segments: [a, b],
        detection: f.hand.score,
        arc: { o: raw[io], from: extend(raw[io], raw[ip], 0.6), to: raw[id] },
      };
    },
  };
}

// ─────────────────────────────── Pouce ───────────────────────────────

function thumbMeasure(joint: 'MCP' | 'IP', dir: 'flexion' | 'extension'): MeasureDef {
  const [p, o, d] = joint === 'MCP' ? [HAND.THUMB_CMC, HAND.THUMB_MCP, HAND.THUMB_IP] : [HAND.THUMB_MCP, HAND.THUMB_IP, HAND.THUMB_TIP];
  return {
    id: `d1_${joint.toLowerCase()}_${dir === 'flexion' ? 'flex' : 'ext'}`,
    region: 'pouce',
    label: `Pouce ${joint} — ${dir}`,
    short: `D1 ${joint}`,
    defaultNorm: dir === 'flexion' ? (joint === 'MCP' ? 50 : 80) : 0,
    inImagePlane: true,
    requires: { hand: true },
    finger: 1,
    joint,
    direction: dir,
    compute(f) {
      if (!f.hand) return ERR_HAND;
      const v = signed(thumbFlexion(handPts(f), joint, f.mode), dir);
      if (v === null) return ERR_CALC;
      const s = f.hand.world ?? f.hand.image;
      const raw = f.hand.raw;
      return {
        value: v,
        segments: [sub(s[o], s[p]), sub(s[d], s[o])],
        detection: f.hand.score,
        arc: { o: raw[o], from: extend(raw[o], raw[p], 0.8), to: raw[d] },
      };
    },
  };
}

// ─────────────────────────────── Poignet ───────────────────────────────

interface ForearmRef {
  /** Direction coude → poignet, espace image. */
  dir: Vec3;
  detection: number;
  /** Point de départ du rayon de référence pour le dessin. */
  from: P2;
  source: 'pose' | 'zero';
}

/** Référence de l'avant-bras : Pose (coude → poignet) ou zéro de référence enregistré. */
function forearmRef(f: Frame): ForearmRef | null {
  const h = f.hand!;
  const o = h.raw[HAND.WRIST];
  if (f.pose) {
    const arm = armFor(f.side, f.mirrored, ARM);
    const vis = Math.min(f.pose.visibility[arm.elbow] ?? 0, f.pose.visibility[arm.wrist] ?? 0);
    if (vis >= 0.5) {
      const dir = sub(f.pose.image[arm.wrist], f.pose.image[arm.elbow]);
      return { dir, detection: vis, from: extend(o, f.pose.raw[arm.elbow], 0.5), source: 'pose' };
    }
  }
  if (f.wristRef) {
    const r = f.wristRef;
    const len = 0.12;
    const n = Math.hypot(r.x, r.y) || 1;
    // Conversion espace image (x·aspect) → coordonnées normalisées de dessin.
    return { dir: r, detection: 1, from: { x: o.x - (r.x / n) * len / f.aspect, y: o.y - (r.y / n) * len }, source: 'zero' };
  }
  return null;
}

const ERR_FOREARM = { error: 'Avant-bras non repéré : élargir le cadre (coude et visage visibles) ou définir le zéro de référence' };

function wristMeasure(kind: 'flex' | 'ext' | 'radiale' | 'ulnaire'): MeasureDef {
  const labels = {
    flex: ['Poignet — flexion', 'Flexion', 80],
    ext: ['Poignet — extension', 'Extension', 70],
    radiale: ['Poignet — inclinaison radiale', 'Incl. radiale', 20],
    ulnaire: ['Poignet — inclinaison ulnaire', 'Incl. ulnaire', 30],
  } as const;
  const [label, short, norm] = labels[kind];
  return {
    id: `poignet_${kind}`,
    region: 'poignet',
    label,
    short,
    defaultNorm: norm,
    inImagePlane: true,
    requires: { hand: true, pose: true },
    direction: kind === 'flex' ? 'flexion' : kind === 'ext' ? 'extension' : 'autre',
    compute(f) {
      if (!f.hand) return ERR_HAND;
      const ref = forearmRef(f);
      if (!ref) return ERR_FOREARM;
      // Mesure mixte Pose + Hand : espace image commun. Le zéro de référence impose le 2D.
      const mode = ref.source === 'zero' ? '2d' : f.mode;
      const hand = f.hand.image;
      let v: number | null;
      if (kind === 'flex' || kind === 'ext') {
        v = wristFlexion(hand, ref.dir, f.side, f.mirrored, mode);
        if (v !== null && kind === 'ext') v = -v;
      } else {
        v = wristDeviation(hand, ref.dir, mode);
        if (v !== null && kind === 'ulnaire') v = -v;
      }
      if (v === null) return ERR_CALC;
      const raw = f.hand.raw;
      const meta = sub(hand[HAND.MIDDLE_MCP], hand[HAND.WRIST]);
      const r: Reading = {
        value: v,
        segments: ref.source === 'zero' ? [meta] : [ref.dir, meta],
        detection: Math.min(f.hand.score, ref.detection),
        arc: { o: raw[HAND.WRIST], from: ref.from, to: raw[HAND.MIDDLE_MCP] },
      };
      if (ref.source === 'zero') r.notes = ['Référence : zéro enregistré (caméra fixe)'];
      return r;
    },
  };
}

// ─────────────────────────────── Pronosupination ───────────────────────────────

function pronoSupMeasure(kind: 'pronation' | 'supination'): MeasureDef {
  return {
    id: kind,
    region: 'avant-bras',
    label: `Avant-bras — ${kind}`,
    short: kind === 'pronation' ? 'Pronation' : 'Supination',
    defaultNorm: kind === 'pronation' ? 80 : 90,
    experimental: true,
    inImagePlane: false,
    requires: { hand: true },
    direction: 'autre',
    compute(f) {
      if (!f.hand) return ERR_HAND;
      const v = pronoSupination(f.hand.image, f.side, f.mirrored);
      if (v === null) return ERR_CALC;
      const raw = f.hand.raw;
      const a = raw[HAND.INDEX_MCP];
      const b = raw[HAND.PINKY_MCP];
      const o = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const d = Math.hypot(a.x - o.x, a.y - o.y);
      return {
        value: kind === 'supination' ? v : -v,
        segments: [],
        detection: f.hand.score,
        arc: { o, from: { x: o.x, y: o.y - d }, to: a },
      };
    },
  };
}

// ─────────────────────────────── Coude et épaule ───────────────────────────────

/** Rayon de référence parallèle au tronc, partant de l'épaule (coordonnées de dessin). */
function trunkRay(raw: P2[], shoulder: number): P2 {
  const d = trunkDown(raw.map((p) => ({ x: p.x, y: p.y, z: 0 })));
  return { x: raw[shoulder].x + d.x * 0.8, y: raw[shoulder].y + d.y * 0.8 };
}

function poseDetection(f: Frame, idx: number[]): number {
  const vs = idx.map((i) => f.pose!.visibility[i] ?? 0);
  return vs.reduce((s, x) => s + x, 0) / vs.length;
}

function elbowMeasure(dir: 'flexion' | 'extension'): MeasureDef {
  return {
    id: dir === 'flexion' ? 'coude_flex' : 'coude_ext',
    region: 'coude',
    label: `Coude — ${dir}`,
    short: dir === 'flexion' ? 'Flexion' : 'Extension',
    defaultNorm: dir === 'flexion' ? 150 : 0,
    inImagePlane: true,
    requires: { pose: true },
    direction: dir,
    compute(f) {
      if (!f.pose) return ERR_POSE;
      const arm = armFor(f.side, f.mirrored, ARM);
      const pts = posePts(f);
      const facing = profileFacing(f.pose.image, POSE.NOSE, POSE.L_SHOULDER, POSE.R_SHOULDER);
      const v = signed(elbowFlexion(pts, f.pose.image, arm, facing, f.mode), dir);
      if (v === null) return ERR_CALC;
      const raw = f.pose.raw;
      const r: Reading = {
        value: v,
        segments: [sub(pts[arm.elbow], pts[arm.shoulder]), sub(pts[arm.wrist], pts[arm.elbow])],
        detection: poseDetection(f, [arm.shoulder, arm.elbow, arm.wrist]),
        arc: { o: raw[arm.elbow], from: extend(raw[arm.elbow], raw[arm.shoulder], 0.6), to: raw[arm.wrist] },
      };
      if (facing === 0) r.notes = ['Sens du regard indéterminé : signe de l\'angle non garanti'];
      return r;
    },
  };
}

const shoulderElev: MeasureDef = {
  id: 'epaule_elev',
  region: 'epaule',
  label: 'Épaule — élévation antérieure',
  short: 'Élévation ant.',
  defaultNorm: 180,
  inImagePlane: true,
  requires: { pose: true },
  direction: 'flexion',
  compute(f) {
    if (!f.pose) return ERR_POSE;
    const arm = armFor(f.side, f.mirrored, ARM);
    const pts = posePts(f);
    const facing = profileFacing(f.pose.image, POSE.NOSE, POSE.L_SHOULDER, POSE.R_SHOULDER);
    const v = shoulderElevation(pts, f.pose.image, arm, facing, f.mode);
    if (v === null) return ERR_CALC;
    const raw = f.pose.raw;
    const r: Reading = {
      value: v,
      segments: [trunkDown(pts), sub(pts[arm.elbow], pts[arm.shoulder])],
      detection: poseDetection(f, [arm.shoulder, arm.elbow, arm.hip]),
      arc: { o: raw[arm.shoulder], from: trunkRay(raw, arm.shoulder), to: raw[arm.elbow] },
    };
    if (facing === 0) r.notes = ['Sens du regard indéterminé : signe de l\'angle non garanti'];
    return r;
  },
};

const shoulderAbd: MeasureDef = {
  id: 'epaule_abd',
  region: 'epaule',
  label: 'Épaule — abduction',
  short: 'Abduction',
  defaultNorm: 180,
  inImagePlane: true,
  requires: { pose: true },
  direction: 'autre',
  compute(f) {
    if (!f.pose) return ERR_POSE;
    const arm = armFor(f.side, f.mirrored, ARM);
    const pts = posePts(f);
    const v = shoulderAbduction(pts, arm, f.mode);
    if (v === null) return ERR_CALC;
    const raw = f.pose.raw;
    return {
      value: v,
      segments: [trunkDown(pts), sub(pts[arm.elbow], pts[arm.shoulder])],
      detection: poseDetection(f, [arm.shoulder, arm.elbow, arm.hip]),
      arc: { o: raw[arm.shoulder], from: trunkRay(raw, arm.shoulder), to: raw[arm.elbow] },
    };
  },
};

const shoulderRE: MeasureDef = {
  id: 'epaule_re',
  region: 'epaule',
  label: 'Épaule — rotation externe coude au corps',
  short: 'Rotation ext.',
  defaultNorm: 90,
  experimental: true,
  inImagePlane: false,
  requires: { pose: true },
  direction: 'autre',
  compute(f) {
    if (!f.pose) return ERR_POSE;
    const arm = armFor(f.side, f.mirrored, ARM);
    // La rotation dépend de la profondeur : toujours en 3D (monde si disponible).
    const pts = f.pose.world ?? f.pose.image;
    const v = shoulderExternalRotation(pts, arm, f.side, f.mirrored);
    if (v === null) return ERR_CALC;
    const notes: string[] = [];
    const elbow = elbowAngle3D(pts, arm);
    if (elbow !== null && (elbow < 65 || elbow > 115)) notes.push(`Coude à ${Math.round(elbow)}° : le fléchir à 90°`);
    const raw = f.pose.raw;
    return {
      value: v,
      segments: [],
      detection: poseDetection(f, [arm.shoulder, arm.elbow, arm.wrist]),
      arc: { o: raw[arm.elbow], from: { x: raw[arm.elbow].x, y: raw[arm.elbow].y + 0.08 }, to: raw[arm.wrist] },
      notes,
    };
  },
};

// ─────────────────────────────── Catalogue ───────────────────────────────

const fingers: MeasureDef[] = [];
for (const finger of [2, 3, 4, 5] as const) {
  for (const joint of ['MCP', 'IPP', 'IPD'] as const) {
    for (const dir of ['extension', 'flexion'] as const) fingers.push(fingerMeasure(finger, joint, dir));
  }
}

export const MEASURES: MeasureDef[] = [
  shoulderElev,
  shoulderAbd,
  shoulderRE,
  elbowMeasure('flexion'),
  elbowMeasure('extension'),
  pronoSupMeasure('pronation'),
  pronoSupMeasure('supination'),
  wristMeasure('flex'),
  wristMeasure('ext'),
  wristMeasure('radiale'),
  wristMeasure('ulnaire'),
  ...fingers,
  thumbMeasure('MCP', 'extension'),
  thumbMeasure('MCP', 'flexion'),
  thumbMeasure('IP', 'extension'),
  thumbMeasure('IP', 'flexion'),
];

export const MEASURE_BY_ID: Record<string, MeasureDef> = Object.fromEntries(MEASURES.map((m) => [m.id, m]));

export const getMeasure = (id: string): MeasureDef => {
  const m = MEASURE_BY_ID[id];
  if (!m) throw new Error(`Mesure inconnue : ${id}`);
  return m;
};

