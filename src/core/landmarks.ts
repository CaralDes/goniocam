/** Index des repères MediaPipe. */

export const HAND = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  MIDDLE_MCP: 9,
  RING_MCP: 13,
  PINKY_MCP: 17,
} as const;

/** Doigts longs 2 à 5 → index [MCP, IPP, IPD, pulpe]. */
export const FINGER_CHAIN: Record<2 | 3 | 4 | 5, [number, number, number, number]> = {
  2: [5, 6, 7, 8],
  3: [9, 10, 11, 12],
  4: [13, 14, 15, 16],
  5: [17, 18, 19, 20],
};

export const FINGER_NAMES: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Pouce',
  2: 'Index',
  3: 'Médius',
  4: 'Annulaire',
  5: 'Auriculaire',
};

/** Connexions pour le dessin du squelette de la main. */
export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

/** Repères Pose utiles au membre supérieur. Gauche/droite = côtés anatomiques du sujet. */
export const POSE = {
  NOSE: 0,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_HIP: 23,
  R_HIP: 24,
} as const;

export interface ArmIndices {
  shoulder: number;
  elbow: number;
  wrist: number;
  hip: number;
}

export const ARM: Record<'G' | 'D', ArmIndices> = {
  G: { shoulder: POSE.L_SHOULDER, elbow: POSE.L_ELBOW, wrist: POSE.L_WRIST, hip: POSE.L_HIP },
  D: { shoulder: POSE.R_SHOULDER, elbow: POSE.R_ELBOW, wrist: POSE.R_WRIST, hip: POSE.R_HIP },
};

export const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
];
