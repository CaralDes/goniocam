/** Contrôle qualité : vue caméra, écart au plan de l'image, score de confiance. */
import { type Vec3, sub, cross, norm, outOfImagePlane, clamp, RAD2DEG } from './vec';
import { HAND, POSE } from './landmarks';

export type ViewKind = 'corps-profil' | 'corps-face' | 'main-profil' | 'main-face' | 'main-axiale';

export const VIEW_LABELS: Record<ViewKind, string> = {
  'corps-profil': 'Sujet de profil',
  'corps-face': 'Sujet de face',
  'main-profil': 'Main de profil',
  'main-face': 'Paume face à la caméra',
  'main-axiale': 'Avant-bras pointé vers la caméra',
};

export interface ViewTolerances {
  /** Lacet max des épaules (°) pour une vue de face. */
  corpsFace: number;
  /** Lacet min des épaules (°) pour une vue de profil. */
  corpsProfil: number;
  /** Angle max normale de la paume / axe optique (°) pour la vue paume. */
  mainFace: number;
  /** Angle min normale de la paume / axe optique (°) pour la vue de profil. */
  mainProfil: number;
  /** Angle max 3e métacarpien / axe optique (°) pour la vue axiale. */
  mainAxiale: number;
}

export const DEFAULT_VIEW_TOL: ViewTolerances = {
  corpsFace: 30,
  corpsProfil: 55,
  mainFace: 35,
  mainProfil: 55,
  mainAxiale: 50,
};

export interface ViewCheck {
  ok: boolean;
  /** Valeur mesurée (°) de l'orientation. */
  metric: number;
  /** Facteur de confiance 0–1 lié à la vue. */
  factor: number;
  message: string;
}

/** Angle (°) entre l'axe optique (z) et un vecteur, sans tenir compte du sens. 0 = aligné sur l'axe. */
export const angleToCameraAxis = (v: Vec3): number => {
  const n = norm(v);
  if (n < 1e-9) return 90;
  return Math.acos(clamp(Math.abs(v.z) / n, 0, 1)) * RAD2DEG;
};

/** Lacet des épaules : 0° = sujet de face, 90° = de profil. Indépendant du signe de z. */
export function shoulderYaw(pts: Vec3[]): number {
  const s = sub(pts[POSE.R_SHOULDER], pts[POSE.L_SHOULDER]);
  return Math.atan2(Math.abs(s.z), Math.abs(s.x)) * RAD2DEG;
}

/** 0° = paume (ou dos) face à la caméra, 90° = main de profil. */
export function palmToCameraAngle(pts: Vec3[]): number {
  const n = cross(sub(pts[HAND.INDEX_MCP], pts[HAND.WRIST]), sub(pts[HAND.PINKY_MCP], pts[HAND.WRIST]));
  return angleToCameraAxis(n);
}

/** Angle du 3e métacarpien avec l'axe optique : 0° = main pointée vers la caméra. */
export function metacarpalToCameraAngle(pts: Vec3[]): number {
  return angleToCameraAxis(sub(pts[HAND.MIDDLE_MCP], pts[HAND.WRIST]));
}

/** Facteur décroissant linéairement de 1 (dans la tolérance) à 0 (25° au-delà). */
const ramp = (excess: number, span = 25) => clamp(1 - excess / span, 0, 1);

export function checkView(
  kind: ViewKind,
  tol: ViewTolerances,
  hand: Vec3[] | null,
  pose: Vec3[] | null,
): ViewCheck {
  switch (kind) {
    case 'corps-face':
    case 'corps-profil': {
      if (!pose) return { ok: false, metric: NaN, factor: 0, message: 'Sujet non détecté (haut du corps et visage dans le champ)' };
      const yaw = shoulderYaw(pose);
      if (kind === 'corps-face') {
        const ok = yaw <= tol.corpsFace;
        return { ok, metric: yaw, factor: ramp(yaw - tol.corpsFace), message: ok ? 'Vue de face correcte' : `Sujet tourné de ${Math.round(yaw)}° : le placer bien de face` };
      }
      const ok = yaw >= tol.corpsProfil;
      return { ok, metric: yaw, factor: ramp(tol.corpsProfil - yaw), message: ok ? 'Vue de profil correcte' : `Sujet à ${Math.round(yaw)}° du profil : le tourner davantage` };
    }
    case 'main-face':
    case 'main-profil': {
      if (!hand) return { ok: false, metric: NaN, factor: 0, message: 'Main non détectée' };
      const a = palmToCameraAngle(hand);
      if (kind === 'main-face') {
        const ok = a <= tol.mainFace;
        return { ok, metric: a, factor: ramp(a - tol.mainFace), message: ok ? 'Paume face à la caméra' : `Paume inclinée de ${Math.round(a)}° : la tourner vers la caméra` };
      }
      const ok = a >= tol.mainProfil;
      return { ok, metric: a, factor: ramp(tol.mainProfil - a), message: ok ? 'Main de profil correcte' : `Main à ${Math.round(90 - a)}° du profil : la tourner de côté` };
    }
    case 'main-axiale': {
      if (!hand) return { ok: false, metric: NaN, factor: 0, message: 'Main non détectée' };
      const a = metacarpalToCameraAngle(hand);
      const ok = a <= tol.mainAxiale;
      return { ok, metric: a, factor: ramp(a - tol.mainAxiale), message: ok ? 'Avant-bras dans l\'axe de la caméra' : `Main inclinée de ${Math.round(a)}° : pointer l'avant-bras vers la caméra` };
    }
  }
}

/** Plus grand écart (°) au plan de l'image parmi des segments. */
export function maxOutOfPlane(segments: Vec3[]): number {
  let m = 0;
  for (const s of segments) {
    const a = outOfImagePlane(s);
    if (a !== null && a > m) m = a;
  }
  return m;
}

export interface ConfidenceInput {
  detection: number;
  viewFactor: number;
  outOfPlane: number;
  outOfPlaneTol: number;
  mode: '3d' | '2d';
  /** La mesure est-elle faite dans le plan de l'image (true) ou hors plan par nature (pronosupination, rotation) ? */
  inImagePlane: boolean;
}

/**
 * Score de confiance 0–1 = détection × vue × plan.
 * En 2D, un segment hors du plan de l'image fausse l'angle : forte pénalité au-delà de la tolérance.
 * En 3D, la profondeur estimée est moins fiable que x/y : pénalité modérée.
 */
export function confidenceScore(c: ConfidenceInput): number {
  let plane = 1;
  if (c.inImagePlane && c.outOfPlane > c.outOfPlaneTol) {
    const excess = c.outOfPlane - c.outOfPlaneTol;
    plane = c.mode === '2d' ? clamp(1 - excess / 25, 0.1, 1) : clamp(1 - excess / 60, 0.5, 1);
  }
  return clamp(c.detection, 0, 1) * clamp(c.viewFactor, 0, 1) * plane;
}

export type ConfidenceLevel = 'vert' | 'orange' | 'rouge';

export function confidenceLevel(score: number, threshold: number): ConfidenceLevel {
  if (score >= Math.max(threshold, 0.8)) return 'vert';
  if (score >= threshold) return 'orange';
  return 'rouge';
}
