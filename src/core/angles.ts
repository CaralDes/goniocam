/**
 * Calcul des angles articulaires — module pur (aucune dépendance DOM ni MediaPipe).
 *
 * Conventions (méthode neutre zéro) :
 * - flexion positive, extension/hyperextension négative ;
 * - repère direct : x à droite de l'image, y vers le bas, z en s'éloignant de la caméra ;
 * - `pts` désigne un tableau de repères dans un même espace (monde 3D ou image).
 */
import type { CalcMode, Side } from './types';
import {
  type Vec3,
  v3,
  sub,
  neg,
  dot,
  cross,
  unit,
  flat,
  mean,
  projectOnPlane,
  angleBetween,
  signedAngleAround,
  RAD2DEG,
} from './vec';
import { FINGER_CHAIN, HAND, POSE, type ArmIndices } from './landmarks';

export type FingerJoint = 'MCP' | 'IPP' | 'IPD';
export type LongFinger = 2 | 3 | 4 | 5;

/** Vrai si la main mesurée a la chiralité d'une main droite dans l'image analysée. */
export const isRightChirality = (side: Side, mirrored: boolean) => (side === 'D') !== mirrored;

/**
 * Angle d'une articulation en charnière. `a` = segment proximal, `b` = segment distal,
 * `flexAxis` orienté pour que la flexion soit positive.
 * En 3D : angle signé dans le plan perpendiculaire à l'axe.
 * En 2D : angle signé dans le plan de l'image, orienté par la composante z de l'axe.
 */
export function hingeAngle(a: Vec3, b: Vec3, flexAxis: Vec3, mode: CalcMode): number | null {
  if (mode === '3d') return signedAngleAround(a, b, flexAxis);
  if (Math.abs(flexAxis.z) < 1e-9) return null;
  return signedAngleAround(flat(a), flat(b), v3(0, 0, Math.sign(flexAxis.z)));
}

/** Normale non orientée du plan de la paume (0, 5, 17). */
export function palmPlaneNormal(pts: Vec3[]): Vec3 | null {
  return unit(cross(sub(pts[HAND.INDEX_MCP], pts[HAND.WRIST]), sub(pts[HAND.PINKY_MCP], pts[HAND.WRIST])));
}

/**
 * Normale palmaire (pointe hors de la paume, côté face palmaire).
 * Main droite : avec d = direction distale et r = côté radial, la face palmaire est r × d.
 * Comme 5 − 0 ≈ d + k·r et 17 − 0 ≈ d − k·r, (5−0)×(17−0) = 2k·(r × d) : palmaire pour une
 * main droite dans un repère direct, dorsale pour une main gauche.
 */
export function palmarNormal(pts: Vec3[], side: Side, mirrored: boolean): Vec3 | null {
  const n = palmPlaneNormal(pts);
  if (!n) return null;
  return isRightChirality(side, mirrored) ? n : neg(n);
}

/** Axe de flexion des doigts longs, orienté (flexion positive) : métacarpien × normale palmaire. */
export function fingerFlexAxis(pts: Vec3[], palmar: Vec3): Vec3 | null {
  const meta = sub(pts[HAND.MIDDLE_MCP], pts[HAND.WRIST]);
  return unit(cross(meta, palmar));
}

/** Segments proximal/distal d'une articulation d'un doigt long. */
export function fingerSegments(pts: Vec3[], finger: LongFinger, joint: FingerJoint): [Vec3, Vec3, number, number, number] {
  const [mcp, pip, dip, tip] = FINGER_CHAIN[finger];
  switch (joint) {
    case 'MCP':
      return [sub(pts[mcp], pts[HAND.WRIST]), sub(pts[pip], pts[mcp]), HAND.WRIST, mcp, pip];
    case 'IPP':
      return [sub(pts[pip], pts[mcp]), sub(pts[dip], pts[pip]), mcp, pip, dip];
    case 'IPD':
      return [sub(pts[dip], pts[pip]), sub(pts[tip], pts[dip]), pip, dip, tip];
  }
}

/** Flexion (signée) d'une articulation d'un doigt long. */
export function fingerFlexion(
  pts: Vec3[],
  finger: LongFinger,
  joint: FingerJoint,
  side: Side,
  mirrored: boolean,
  mode: CalcMode,
): number | null {
  const palmar = palmarNormal(pts, side, mirrored);
  if (!palmar) return null;
  const axis = fingerFlexAxis(pts, palmar);
  if (!axis) return null;
  const [a, b] = fingerSegments(pts, finger, joint);
  return hingeAngle(a, b, axis, mode);
}

/**
 * Flexion du pouce (MCP ou IP). Sans hypothèse de chiralité : la flexion rapproche le
 * segment distal du centre de la paume, l'hyperextension l'en éloigne.
 */
export function thumbFlexion(pts: Vec3[], joint: 'MCP' | 'IP', mode: CalcMode): number | null {
  const [p, o, d] = joint === 'MCP' ? [HAND.THUMB_CMC, HAND.THUMB_MCP, HAND.THUMB_IP] : [HAND.THUMB_MCP, HAND.THUMB_IP, HAND.THUMB_TIP];
  const a = sub(pts[o], pts[p]);
  const b = sub(pts[d], pts[o]);
  const center = mean([0, 5, 9, 13, 17].map((i) => pts[i]));
  const towardPalm = projectOnPlane(sub(center, pts[o]), a);
  const axis = unit(cross(a, towardPalm));
  if (!axis) return null;
  return hingeAngle(a, b, axis, mode);
}

/**
 * Flexion (+) / extension (−) du poignet : avant-bras (coude → poignet) vs 3e métacarpien.
 * `hand` et `forearm` doivent être dans le même espace.
 */
export function wristFlexion(hand: Vec3[], forearm: Vec3, side: Side, mirrored: boolean, mode: CalcMode): number | null {
  const palmar = palmarNormal(hand, side, mirrored);
  if (!palmar) return null;
  const meta = sub(hand[HAND.MIDDLE_MCP], hand[HAND.WRIST]);
  const axis = unit(cross(meta, palmar));
  if (!axis) return null;
  return hingeAngle(forearm, meta, axis, mode);
}

/**
 * Inclinaison radiale (+) / ulnaire (−) du poignet, dans le plan de la paume.
 * Indépendant de la chiralité : le côté radial est donné par la direction 17 → 5.
 */
export function wristDeviation(hand: Vec3[], forearm: Vec3, mode: CalcMode): number | null {
  const meta = sub(hand[HAND.MIDDLE_MCP], hand[HAND.WRIST]);
  const radial = sub(hand[HAND.INDEX_MCP], hand[HAND.PINKY_MCP]);
  let fa = forearm;
  let mt = meta;
  let rd = radial;
  let mag: number | null;
  if (mode === '3d') {
    const n = palmPlaneNormal(hand);
    if (!n) return null;
    fa = projectOnPlane(forearm, n);
    mt = projectOnPlane(meta, n);
    rd = projectOnPlane(radial, n);
    mag = angleBetween(fa, mt);
  } else {
    fa = flat(forearm);
    mt = flat(meta);
    rd = flat(radial);
    mag = angleBetween(fa, mt);
  }
  if (mag === null) return null;
  const perp = projectOnPlane(mt, fa);
  const s = dot(perp, rd) >= 0 ? 1 : -1;
  return s * mag;
}

/**
 * Pronation (−) / supination (+), vue axiale (avant-bras pointé vers la caméra, coude au corps à 90°).
 * Position neutre : pouce en haut, ligne MCP index → MCP auriculaire verticale.
 * Calcul 2D (plan de l'image), indépendant de la profondeur.
 */
export function pronoSupination(hand: Vec3[], side: Side, mirrored: boolean): number | null {
  const v = sub(hand[HAND.PINKY_MCP], hand[HAND.INDEX_MCP]);
  if (Math.hypot(v.x, v.y) < 1e-9) return null;
  const x = isRightChirality(side, mirrored) ? v.x : -v.x;
  return Math.atan2(x, v.y) * RAD2DEG;
}

// ───────────────────────────── Membre supérieur (Pose) ─────────────────────────────

/** Indices du bras analysé, en tenant compte d'une éventuelle image miroir (étiquettes inversées). */
export function armFor(side: Side, mirrored: boolean, table: Record<Side, ArmIndices>): ArmIndices {
  const effective: Side = mirrored ? (side === 'D' ? 'G' : 'D') : side;
  return table[effective];
}

/**
 * Sens du regard en vue de profil : +1 si le sujet regarde vers la droite de l'image, −1 vers la gauche,
 * 0 si indéterminé (nez aligné sur les épaules).
 */
export function profileFacing(img: Vec3[], nose: number, lShoulder: number, rShoulder: number): -1 | 0 | 1 {
  const mid = mean([img[lShoulder], img[rShoulder]]);
  const dx = img[nose].x - mid.x;
  if (Math.abs(dx) < 0.02) return 0;
  return dx > 0 ? 1 : -1;
}

/**
 * Angle signé dans le plan sagittal (vue de profil, 2D) entre une référence `a` et un segment `b` :
 * positif quand `b` passe en avant de `a` (flexion), négatif en arrière (extension).
 */
export function sagittalAngle2D(a: Vec3, b: Vec3, facing: -1 | 1): number | null {
  const s = signedAngleAround(flat(a), flat(b), v3(0, 0, 1));
  return s === null ? null : -s * facing;
}

/**
 * Combine une amplitude (3D ou 2D) avec le signe donné par la géométrie 2D de profil.
 * `pts` sert à l'amplitude, `img` au signe.
 */
function sagittalSigned(
  aPts: Vec3,
  bPts: Vec3,
  aImg: Vec3,
  bImg: Vec3,
  facing: -1 | 0 | 1,
  mode: CalcMode,
): number | null {
  if (mode === '2d') {
    if (facing === 0) return angleBetween(flat(aImg), flat(bImg));
    return sagittalAngle2D(aImg, bImg, facing);
  }
  const mag = angleBetween(aPts, bPts);
  if (mag === null) return null;
  if (facing === 0) return mag;
  const s2 = sagittalAngle2D(aImg, bImg, facing);
  // Près de 0°, le signe 2D est instable : on garde l'amplitude positive.
  if (s2 === null || Math.abs(s2) < 8) return mag;
  return Math.sign(s2) * mag;
}

/** Axe du tronc orienté vers le bas : milieu des épaules → milieu des hanches. */
export function trunkDown(pts: Vec3[]): Vec3 {
  return sub(mean([pts[POSE.L_HIP], pts[POSE.R_HIP]]), mean([pts[POSE.L_SHOULDER], pts[POSE.R_SHOULDER]]));
}

/**
 * Élévation antérieure de l'épaule (flexion +, extension −) : axe du tronc (parallèle à la ligne
 * épaules → hanches) vs bras (épaule → coude).
 */
export function shoulderElevation(pts: Vec3[], img: Vec3[], arm: ArmIndices, facing: -1 | 0 | 1, mode: CalcMode) {
  return sagittalSigned(
    trunkDown(pts),
    sub(pts[arm.elbow], pts[arm.shoulder]),
    trunkDown(img),
    sub(img[arm.elbow], img[arm.shoulder]),
    facing,
    mode,
  );
}

/** Flexion du coude (+) ; une valeur négative correspond à un recurvatum. */
export function elbowFlexion(pts: Vec3[], img: Vec3[], arm: ArmIndices, facing: -1 | 0 | 1, mode: CalcMode) {
  return sagittalSigned(
    sub(pts[arm.elbow], pts[arm.shoulder]),
    sub(pts[arm.wrist], pts[arm.elbow]),
    sub(img[arm.elbow], img[arm.shoulder]),
    sub(img[arm.wrist], img[arm.elbow]),
    facing,
    mode,
  );
}

/** Abduction de l'épaule (vue de face) : axe du tronc / bras. */
export function shoulderAbduction(pts: Vec3[], arm: ArmIndices, mode: CalcMode): number | null {
  const a = trunkDown(pts);
  const b = sub(pts[arm.elbow], pts[arm.shoulder]);
  return mode === '3d' ? angleBetween(a, b) : angleBetween(flat(a), flat(b));
}

/**
 * Rotation externe coude au corps (vue de face, coude fléchi à 90°) — EXPÉRIMENTAL.
 * Angle de l'avant-bras dans le plan horizontal : 0° = avant-bras dirigé vers la caméra,
 * positif = vers le dehors. Dépend de la profondeur estimée : toujours calculé en 3D.
 */
export function shoulderExternalRotation(pts: Vec3[], arm: ArmIndices, side: Side, mirrored: boolean): number | null {
  const v = sub(pts[arm.wrist], pts[arm.elbow]);
  const forward = -v.z;
  const lateral = isRightChirality(side, mirrored) ? -v.x : v.x;
  if (Math.hypot(forward, lateral) < 1e-9) return null;
  return Math.atan2(lateral, forward) * RAD2DEG;
}

/** Angle de flexion du coude non signé, pour vérifier la position « coude à 90° ». */
export function elbowAngle3D(pts: Vec3[], arm: ArmIndices): number | null {
  return angleBetween(sub(pts[arm.elbow], pts[arm.shoulder]), sub(pts[arm.wrist], pts[arm.elbow]));
}
