/** Préparation d'une image : sélection de la main, alignement de la profondeur, espace image commun. */
import type { CalcMode, Frame, HandObs, P2, PoseObs, Side } from './types';
import { type Vec3, mean } from './vec';
import { ARM } from './landmarks';
import { armFor } from './angles';

export interface RawLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface RawHand {
  landmarks: RawLandmark[];
  world: RawLandmark[] | null;
  /** Étiquette MediaPipe : 'Left' | 'Right' (côté du sujet pour une image non inversée). */
  label: string | null;
  score: number;
}

export interface RawPose {
  landmarks: RawLandmark[];
  world: RawLandmark[] | null;
}

export interface RawDetection {
  width: number;
  height: number;
  hands: RawHand[];
  pose: RawPose | null;
}

export interface PrepareOptions {
  side: Side;
  mirrored: boolean;
  mode: CalcMode;
  wristRef: Vec3 | null;
  /** Réglage avancé : inverse la convention de profondeur des repères normalisés. */
  invertDepth: boolean;
}

export interface Prepared {
  frame: Frame;
  warnings: string[];
}

/** Repères normalisés → espace image isotrope (x·aspect, y, z·aspect). */
export function toImageSpace(lms: RawLandmark[], aspect: number, invertDepth: boolean): Vec3[] {
  const k = invertDepth ? -1 : 1;
  return lms.map((p) => ({ x: p.x * aspect, y: p.y, z: p.z * aspect * k }));
}

/**
 * Aligne le signe de z des repères « monde » sur celui de l'espace image (convention documentée),
 * par corrélation des profondeurs relatives. Protège contre une convention différente entre modèles.
 */
export function alignDepth(world: Vec3[], image: Vec3[]): Vec3[] {
  const cw = mean(world);
  const ci = mean(image);
  let s = 0;
  for (let i = 0; i < world.length; i++) s += (world[i].z - cw.z) * (image[i].z - ci.z);
  return s < 0 ? world.map((p) => ({ x: p.x, y: p.y, z: -p.z })) : world;
}

const toVec = (lms: RawLandmark[]): Vec3[] => lms.map((p) => ({ x: p.x, y: p.y, z: p.z }));
const toP2 = (lms: RawLandmark[]): P2[] => lms.map((p) => ({ x: p.x, y: p.y }));

export function labelToSide(label: string | null, mirrored: boolean): Side | null {
  if (label !== 'Left' && label !== 'Right') return null;
  const s: Side = label === 'Left' ? 'G' : 'D';
  return mirrored ? (s === 'G' ? 'D' : 'G') : s;
}

/** Choisit la main correspondant au côté mesuré. */
export function selectHand(hands: RawHand[], side: Side, mirrored: boolean, poseWrist: P2 | null): RawHand | null {
  if (!hands.length) return null;
  if (hands.length === 1) return hands[0];
  if (poseWrist) {
    let best = hands[0];
    let bestD = Infinity;
    for (const h of hands) {
      const w = h.landmarks[0];
      const d = Math.hypot(w.x - poseWrist.x, w.y - poseWrist.y);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    return best;
  }
  const match = hands.find((h) => labelToSide(h.label, mirrored) === side);
  return match ?? [...hands].sort((a, b) => b.score - a.score)[0];
}

export function prepareFrame(det: RawDetection, o: PrepareOptions): Prepared {
  const aspect = det.width / Math.max(det.height, 1);
  const warnings: string[] = [];

  let pose: PoseObs | null = null;
  if (det.pose && det.pose.landmarks.length >= 33) {
    const image = toImageSpace(det.pose.landmarks, aspect, o.invertDepth);
    const world = det.pose.world ? alignDepth(toVec(det.pose.world), image) : null;
    pose = {
      image,
      world,
      raw: toP2(det.pose.landmarks),
      visibility: det.pose.landmarks.map((p) => p.visibility ?? 1),
    };
  }

  let poseWrist: P2 | null = null;
  if (pose) {
    const arm = armFor(o.side, o.mirrored, ARM);
    if ((pose.visibility[arm.wrist] ?? 0) > 0.5) poseWrist = pose.raw[arm.wrist];
  }

  let hand: HandObs | null = null;
  const h = selectHand(det.hands, o.side, o.mirrored, poseWrist);
  if (h && h.landmarks.length >= 21) {
    const image = toImageSpace(h.landmarks, aspect, o.invertDepth);
    const world = h.world ? alignDepth(toVec(h.world), image) : null;
    const label = labelToSide(h.label, o.mirrored);
    hand = { image, world, raw: toP2(h.landmarks), score: h.score, label };
    if (label && label !== o.side && h.score > 0.85) {
      warnings.push(`Main détectée : ${label === 'G' ? 'gauche' : 'droite'} — côté mesuré : ${o.side === 'G' ? 'gauche' : 'droit'}`);
    }
  }

  return {
    frame: { hand, pose, side: o.side, mirrored: o.mirrored, mode: o.mode, aspect, wristRef: o.wristRef },
    warnings,
  };
}
