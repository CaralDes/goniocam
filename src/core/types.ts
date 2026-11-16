import type { Vec3 } from './vec';

/** Côté anatomique : G = gauche, D = droit. */
export type Side = 'G' | 'D';
export type CalcMode = '3d' | '2d';

export interface P2 {
  x: number;
  y: number;
}

/**
 * Observation d'une main.
 * - `image` : repères normalisés corrigés du rapport d'aspect (x·w/h, y, z·w/h) —
 *   même échelle sur les trois axes, z documenté (plus petit = plus proche).
 * - `world` : repères 3D en mètres (null si indisponibles), profondeur alignée sur `image`.
 * - `raw` : repères normalisés [0,1] pour le dessin.
 */
export interface HandObs {
  image: Vec3[];
  world: Vec3[] | null;
  raw: P2[];
  score: number;
  label: Side | null;
}

export interface PoseObs {
  image: Vec3[];
  world: Vec3[] | null;
  raw: P2[];
  visibility: number[];
}

/** Une image analysée, prête pour les calculs. */
export interface Frame {
  hand: HandObs | null;
  pose: PoseObs | null;
  /** Côté du sujet mesuré. */
  side: Side;
  /** true si l'image source est inversée (selfie miroir enregistré). */
  mirrored: boolean;
  mode: CalcMode;
  /** Rapport largeur / hauteur de l'image source. */
  aspect: number;
  /** Direction 2D (espace image) du 3e métacarpien en position neutre, pour le « zéro de référence » du poignet. */
  wristRef: Vec3 | null;
}

/** Arc à dessiner : rayons depuis `o` vers `from` (référence) et `to` (segment mobile). Coordonnées normalisées [0,1]. */
export interface ArcOverlay {
  o: P2;
  from: P2;
  to: P2;
}

export interface Reading {
  value: number;
  /** Vecteurs des segments utilisés, en 3D, pour le contrôle d'écart au plan de l'image. */
  segments: Vec3[];
  /** Score de détection des repères utilisés (0–1). */
  detection: number;
  arc?: ArcOverlay;
  notes?: string[];
}

export type ComputeResult = Reading | { error: string };

export const isReading = (r: ComputeResult | null | undefined): r is Reading =>
  !!r && (r as Reading).value !== undefined;
