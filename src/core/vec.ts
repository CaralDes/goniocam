/**
 * Géométrie vectorielle 3D minimale, sans dépendance.
 * Repère : x vers la droite de l'image, y vers le bas, z en s'éloignant de la caméra
 * (convention MediaPipe : plus z est petit, plus le point est proche). Repère direct.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const RAD2DEG = 180 / Math.PI;
export const DEG2RAD = Math.PI / 180;

export const v3 = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const neg = (a: Vec3): Vec3 => scale(a, -1);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const norm = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const flat = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: 0 });

/** Vecteur unitaire, ou null si la norme est quasi nulle. */
export function unit(a: Vec3): Vec3 | null {
  const n = norm(a);
  return n < 1e-9 ? null : scale(a, 1 / n);
}

export function mean(points: Vec3[]): Vec3 {
  const s = points.reduce((acc, p) => add(acc, p), v3(0, 0, 0));
  return scale(s, 1 / Math.max(points.length, 1));
}

/** Projection de a sur le plan de normale n (n quelconque, non nul). */
export function projectOnPlane(a: Vec3, n: Vec3): Vec3 {
  const u = unit(n);
  if (!u) return a;
  return sub(a, scale(u, dot(a, u)));
}

/** Angle non signé entre deux vecteurs, en degrés [0, 180]. */
export function angleBetween(a: Vec3, b: Vec3): number | null {
  const na = norm(a);
  const nb = norm(b);
  if (na < 1e-9 || nb < 1e-9) return null;
  const c = Math.min(1, Math.max(-1, dot(a, b) / (na * nb)));
  return Math.acos(c) * RAD2DEG;
}

/**
 * Angle signé de a vers b autour de l'axe `axis`, après projection des deux
 * vecteurs sur le plan perpendiculaire à l'axe. Résultat en degrés ]-180, 180].
 * Positif quand la rotation a → b est directe autour de `axis`.
 */
export function signedAngleAround(a: Vec3, b: Vec3, axis: Vec3): number | null {
  const u = unit(axis);
  if (!u) return null;
  const pa = projectOnPlane(a, u);
  const pb = projectOnPlane(b, u);
  if (norm(pa) < 1e-9 || norm(pb) < 1e-9) return null;
  return Math.atan2(dot(cross(pa, pb), u), dot(pa, pb)) * RAD2DEG;
}

/** Angle (degrés) entre un segment et le plan de l'image (plan x-y). 0 = dans le plan. */
export function outOfImagePlane(a: Vec3): number | null {
  const n = norm(a);
  if (n < 1e-9) return null;
  return Math.atan2(Math.abs(a.z), Math.hypot(a.x, a.y)) * RAD2DEG;
}

export const median = (values: number[]): number => {
  if (!values.length) return NaN;
  const s = [...values].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
