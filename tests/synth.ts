/**
 * Générateur de repères synthétiques à angles connus (main et corps), construit à partir
 * de la seule anatomie (main droite : face palmaire = radial × distal), indépendamment du code testé.
 */
import { type Vec3, add, scale, cross, unit, v3, mean, sub } from '../src/core/vec';
import type { RawDetection, RawHand, RawLandmark, RawPose } from '../src/core/prepare';
import type { Side } from '../src/core/types';

const D2R = Math.PI / 180;

export interface HandPose {
  /** Flexions MCP, IPP, IPD (°) par doigt long 2..5. */
  fingers?: Partial<Record<2 | 3 | 4 | 5, [number, number, number]>>;
  /** Flexions MCP, IP du pouce (°). */
  thumb?: [number, number];
}

export interface HandOrientation {
  /** Direction distale (poignet → doigts) dans le repère caméra. */
  d: Vec3;
  /** Normale palmaire dans le repère caméra (orthogonale à d). */
  p: Vec3;
}

const MCP_OFFSETS: Record<2 | 3 | 4 | 5, number> = { 2: 0.022, 3: 0, 4: -0.018, 5: -0.034 };
const PHAL: [number, number, number] = [0.045, 0.028, 0.02];

/** Repères 3D d'une main (mètres, repère caméra : x droite, y bas, z loin). */
export function synthHand(side: Side, orient: HandOrientation, pose: HandPose = {}, origin = v3(0, 0, 0.5)): Vec3[] {
  const d = unit(orient.d)!;
  const p = unit(orient.p)!;
  // Main droite : p = r × d  ⇔  r = d × p. Main gauche : image miroir.
  const rRight = unit(cross(d, p))!;
  const r = side === 'D' ? rRight : scale(rRight, -1);
  const L = (D: number, R: number, P: number) => add(origin, add(add(scale(d, D), scale(r, R)), scale(p, P)));

  const pts: Vec3[] = new Array(21);
  pts[0] = L(0, 0, 0);

  // Pouce dans le plan de la paume, dirigé en distal-radial ; la flexion le porte vers l'ulnaire (q0).
  const [tm, ti] = pose.thumb ?? [0, 0];
  const t0 = unit(add(scale(d, 0.6), scale(r, 0.8)))!;
  const q0 = unit(add(scale(d, 0.8), scale(r, -0.6)))!;
  const dirAt = (phi: number) => add(scale(t0, Math.cos(phi * D2R)), scale(q0, Math.sin(phi * D2R)));
  pts[1] = L(0.02, 0.02, 0);
  pts[2] = add(pts[1], scale(t0, 0.04));
  pts[3] = add(pts[2], scale(dirAt(tm), 0.032));
  pts[4] = add(pts[3], scale(dirAt(tm + ti), 0.025));

  for (const f of [2, 3, 4, 5] as const) {
    const base = 5 + (f - 2) * 4;
    const [a1, a2, a3] = pose.fingers?.[f] ?? [0, 0, 0];
    let pos = L(0.09, MCP_OFFSETS[f], 0);
    pts[base] = pos;
    let phi = 0;
    [a1, a2, a3].forEach((a, i) => {
      phi += a;
      const dir = add(scale(d, Math.cos(phi * D2R)), scale(p, Math.sin(phi * D2R)));
      pos = add(pos, scale(dir, PHAL[i]));
      pts[base + 1 + i] = pos;
    });
  }
  return pts;
}

/** Rotation de Rodrigues de v autour de l'axe unitaire k. */
export function rotate(v: Vec3, k: Vec3, deg: number): Vec3 {
  const u = unit(k)!;
  const c = Math.cos(deg * D2R);
  const s = Math.sin(deg * D2R);
  const kv = cross(u, v);
  const kd = u.x * v.x + u.y * v.y + u.z * v.z;
  return add(add(scale(v, c), scale(kv, s)), scale(u, kd * (1 - c)));
}

/** Projection orthographique → repères normalisés (aspect w/h), avec z normalisé cohérent. */
export function project(pts: Vec3[], aspect = 16 / 9, s = 2): RawLandmark[] {
  return pts.map((P) => ({
    x: 0.5 + (P.x * s) / aspect,
    y: 0.5 + P.y * s,
    z: ((P.z - 0.5) * s) / aspect,
    visibility: 0.99,
  }));
}

export function mirrorX(lms: RawLandmark[]): RawLandmark[] {
  return lms.map((p) => ({ ...p, x: 1 - p.x }));
}

export function rawHand(pts: Vec3[], label: 'Left' | 'Right' | null, aspect = 16 / 9): RawHand {
  const c = mean(pts);
  return {
    landmarks: project(pts, aspect),
    world: pts.map((p) => ({ ...sub(p, c), visibility: 1 })),
    label,
    score: 0.98,
  };
}

// ─────────────────────────────── Corps ───────────────────────────────

export interface BodySpec {
  /** 'face' : sujet face caméra ; 'profil-droite' : regarde vers la droite de l'image ; 'profil-gauche'. */
  view: 'face' | 'profil-droite' | 'profil-gauche';
  side: Side;
  /** Élévation (flexion +) dans le plan sagittal, ou abduction en vue de face (°). */
  shoulder?: number;
  /** Plan du mouvement d'épaule. */
  plane?: 'sagittal' | 'frontal';
  /** Flexion du coude (°), dans le plan sagittal. */
  elbow?: number;
  /** Rotation externe (°) avec coude au corps fléchi à 90°. */
  externalRotation?: number;
}

/**
 * Corps synthétique (33 repères) en repère caméra. Repère du sujet : U = haut, F = avant, Rt = droite du sujet.
 */
export function synthBody(spec: BodySpec): Vec3[] {
  const up = v3(0, -1, 0);
  let F: Vec3;
  if (spec.view === 'face') F = v3(0, 0, -1);
  else if (spec.view === 'profil-droite') F = v3(1, 0, 0);
  else F = v3(-1, 0, 0);
  // Repère direct du sujet : droite = haut × avant ? Vérification : sujet face caméra (F = −z),
  // sa droite est à gauche de l'image (−x). up × F = (0,−1,0)×(0,0,−1) = (1,0,0) → c'est sa gauche.
  const left = cross(up, F);
  const right = scale(left, -1);
  const O = v3(0, 0, 2.5);
  const P = (U: number, Fw: number, Rt: number) => add(O, add(add(scale(up, U), scale(F, Fw)), scale(right, Rt)));
  const pts: Vec3[] = Array.from({ length: 33 }, () => P(0, 0, 0));
  pts[0] = P(0.65, 0.1, 0); // nez
  pts[11] = P(0.5, 0, -0.2); // épaule G
  pts[12] = P(0.5, 0, 0.2); // épaule D
  pts[23] = P(0, 0, -0.12);
  pts[24] = P(0, 0, 0.12);
  const lat = spec.side === 'D' ? 1 : -1;
  for (const s of ['G', 'D'] as const) {
    const sh = s === 'G' ? 11 : 12;
    const isMeasured = s === spec.side;
    let armDir = scale(up, -1); // bras le long du corps
    let foreDir = scale(up, -1);
    if (isMeasured) {
      const a = (spec.shoulder ?? 0) * D2R;
      const plane = spec.plane ?? 'sagittal';
      const swing = plane === 'sagittal' ? F : scale(right, lat);
      armDir = add(scale(up, -Math.cos(a)), scale(swing, Math.sin(a)));
      if (spec.externalRotation !== undefined) {
        const er = spec.externalRotation * D2R;
        foreDir = add(scale(F, Math.cos(er)), scale(right, lat * Math.sin(er)));
      } else {
        const e = (spec.elbow ?? 0) * D2R;
        // Flexion du coude : l'avant-bras tourne vers l'avant dans le plan sagittal du bras.
        const fwdOfArm = unit(sub(F, scale(armDir, F.x * armDir.x + F.y * armDir.y + F.z * armDir.z))) ?? F;
        foreDir = add(scale(armDir, Math.cos(e)), scale(fwdOfArm, Math.sin(e)));
      }
    }
    const el = add(pts[sh], scale(armDir, 0.3));
    const wr = add(el, scale(foreDir, 0.27));
    pts[s === 'G' ? 13 : 14] = el;
    pts[s === 'G' ? 15 : 16] = wr;
  }
  return pts;
}

export function rawPose(pts: Vec3[], aspect = 16 / 9): RawPose {
  const hips = mean([pts[23], pts[24]]);
  return {
    landmarks: pts.map((P) => ({ x: 0.5 + (P.x * 0.3) / aspect, y: 0.5 + P.y * 0.3, z: ((P.z - hips.z) * 0.3) / aspect, visibility: 0.99 })),
    world: pts.map((p) => ({ ...sub(p, hips), visibility: 0.99 })),
  };
}

export function detection(hands: RawHand[], pose: RawPose | null, width = 1280, height = 720): RawDetection {
  return { width, height, hands, pose };
}
