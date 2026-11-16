import { describe, expect, it } from 'vitest';
import { angleBetween, signedAngleAround, v3, projectOnPlane, outOfImagePlane, cross, median } from '../src/core/vec';
import {
  fingerFlexion,
  thumbFlexion,
  wristFlexion,
  wristDeviation,
  pronoSupination,
  shoulderElevation,
  shoulderAbduction,
  elbowFlexion,
  shoulderExternalRotation,
  profileFacing,
  armFor,
} from '../src/core/angles';
import { ARM, POSE } from '../src/core/landmarks';
import { toImageSpace } from '../src/core/prepare';
import { synthHand, rotate, project, synthBody, rawPose } from './synth';
import type { Side } from '../src/core/types';

const CLOSE = 0.6; // tolérance numérique (°)

describe('vec — cas connus 0, 90, 180°', () => {
  it('angleBetween', () => {
    expect(angleBetween(v3(1, 0), v3(1, 0))).toBeCloseTo(0, 6);
    expect(angleBetween(v3(1, 0), v3(0, 1))).toBeCloseTo(90, 6);
    expect(angleBetween(v3(1, 0), v3(-1, 0))).toBeCloseTo(180, 6);
    expect(angleBetween(v3(1, 0, 0), v3(1, 1, 0))).toBeCloseTo(45, 6);
    expect(angleBetween(v3(0, 0, 0), v3(1, 0))).toBeNull();
  });
  it('signedAngleAround : signe selon l\'axe', () => {
    const z = v3(0, 0, 1);
    expect(signedAngleAround(v3(1, 0), v3(0, 1), z)).toBeCloseTo(90, 6);
    expect(signedAngleAround(v3(0, 1), v3(1, 0), z)).toBeCloseTo(-90, 6);
    expect(signedAngleAround(v3(1, 0, 5), v3(0, 1, -3), z)).toBeCloseTo(90, 6); // projection
    expect(signedAngleAround(v3(1, 0), v3(-1, 0.0001), z)).toBeCloseTo(180, 1);
  });
  it('projection et écart au plan', () => {
    const p = projectOnPlane(v3(1, 2, 3), v3(0, 0, 2));
    expect(p).toEqual({ x: 1, y: 2, z: 0 });
    expect(outOfImagePlane(v3(1, 0, 0))).toBeCloseTo(0);
    expect(outOfImagePlane(v3(1, 0, 1))).toBeCloseTo(45);
    expect(outOfImagePlane(v3(0, 0, 1))).toBeCloseTo(90);
    expect(cross(v3(1, 0, 0), v3(0, 1, 0))).toEqual({ x: 0, y: 0, z: 1 });
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});

// Orientations de main dans le repère caméra
const PALM_TO_CAMERA = { d: v3(0, -1, 0), p: v3(0, 0, -1) }; // doigts en haut, paume vers la caméra
const PROFILE = { d: v3(0, -1, 0), p: v3(1, 0, 0) }; // doigts en haut, paume vers la droite de l'image
const PROFILE_OBLIQUE = { d: v3(0.3, -1, 0.1), p: v3(1, 0.3, 0) };

describe('Doigts longs — flexion signée', () => {
  const sides: Side[] = ['D', 'G'];
  for (const side of sides) {
    for (const [name, o] of [['profil', PROFILE], ['paume', PALM_TO_CAMERA], ['oblique', PROFILE_OBLIQUE]] as const) {
      it(`main ${side}, vue ${name} : MCP/IPP/IPD à 0, 30, 60, 90° et hyperextension`, () => {
        for (const [m, i, d] of [[0, 0, 0], [30, 45, 20], [60, 90, 70], [90, 100, 90], [-20, 0, 0]]) {
          const pts = synthHand(side, o, { fingers: { 2: [m, i, d], 3: [m, i, d], 5: [m, i, d] } });
          for (const f of [2, 3, 5] as const) {
            expect(fingerFlexion(pts, f, 'MCP', side, false, '3d')).toBeCloseTo(m, 0);
            expect(fingerFlexion(pts, f, 'IPP', side, false, '3d')).toBeCloseTo(i, 0);
            expect(fingerFlexion(pts, f, 'IPD', side, false, '3d')).toBeCloseTo(d, 0);
          }
        }
      });
    }
  }

  it('mode 2D en vue de profil stricte = mode 3D', () => {
    const pts = synthHand('D', PROFILE, { fingers: { 2: [40, 70, 30] } });
    const img = toImageSpace(project(pts), 16 / 9, false);
    expect(fingerFlexion(img, 2, 'IPP', 'D', false, '2d')).toBeCloseTo(70, 0);
    expect(fingerFlexion(img, 2, 'MCP', 'D', false, '2d')).toBeCloseTo(40, 0);
    expect(fingerFlexion(img, 2, 'IPD', 'D', false, '2d')).toBeCloseTo(30, 0);
  });

  it('espace image (projection) = espace 3D', () => {
    const pts = synthHand('G', PROFILE_OBLIQUE, { fingers: { 4: [55, 85, 40] } });
    const img = toImageSpace(project(pts), 16 / 9, false);
    expect(fingerFlexion(img, 4, 'IPP', 'G', false, '3d')).toBeCloseTo(85, 0);
  });

  it('mauvaise chiralité déclarée → signe inversé (détecte une erreur de côté)', () => {
    const pts = synthHand('D', PROFILE, { fingers: { 2: [0, 60, 0] } });
    expect(fingerFlexion(pts, 2, 'IPP', 'G', false, '3d')).toBeCloseTo(-60, 0);
    // Image miroir : un sujet droit apparaît gauche.
    expect(fingerFlexion(pts, 2, 'IPP', 'G', true, '3d')).toBeCloseTo(60, 0);
  });
});

describe('Pouce — MCP et IP', () => {
  for (const side of ['D', 'G'] as Side[]) {
    it(`main ${side} : flexion et hyperextension`, () => {
      for (const [m, i] of [[0, 0], [30, 60], [50, 80], [-10, -20]]) {
        const pts = synthHand(side, PALM_TO_CAMERA, { thumb: [m, i] });
        expect(thumbFlexion(pts, 'MCP', '3d')).toBeCloseTo(m, 0);
        expect(thumbFlexion(pts, 'IP', '3d')).toBeCloseTo(i, 0);
        const img = toImageSpace(project(pts), 16 / 9, false);
        expect(thumbFlexion(img, 'IP', '2d')).toBeCloseTo(i, 0);
      }
    });
  }
});

describe('Poignet', () => {
  it('flexion (+) / extension (−) en vue de profil, deux côtés', () => {
    for (const side of ['D', 'G'] as Side[]) {
      for (const phi of [0, 30, 60, 80, -45, -70]) {
        // Rotation de la main autour de l'axe de flexion (radio-ulnaire) : d → p pour la flexion.
        const d0 = v3(1, 0, 0);
        const p0 = v3(0, 1, 0);
        const axis = cross(d0, p0);
        const d = rotate(d0, axis, phi);
        const p = rotate(p0, axis, phi);
        const pts = synthHand(side, { d, p });
        expect(wristFlexion(pts, d0, side, false, '3d')).toBeCloseTo(phi, 0);
        const img = toImageSpace(project(pts), 16 / 9, false);
        expect(wristFlexion(img, v3(1, 0, 0), side, false, '2d')).toBeCloseTo(phi, 0);
      }
    }
  });

  it('inclinaison radiale (+) / ulnaire (−), paume vers la caméra', () => {
    for (const side of ['D', 'G'] as Side[]) {
      for (const psi of [0, 15, 25, -20, -35]) {
        const d0 = v3(0, -1, 0);
        const p = v3(0, 0, -1);
        // Côté radial de cette main : r = d × p (droite) ou son opposé (gauche).
        const rRight = cross(d0, p);
        const r = side === 'D' ? rRight : { x: -rRight.x, y: -rRight.y, z: -rRight.z };
        const axis = cross(d0, r); // rotation de d vers r
        const d = rotate(d0, axis, psi);
        const pts = synthHand(side, { d, p });
        expect(wristDeviation(pts, d0, '3d')).toBeCloseTo(psi, 0);
        expect(wristDeviation(pts, d0, '2d')).toBeCloseTo(psi, 0);
      }
    }
  });
});

describe('Pronosupination (vue axiale)', () => {
  it('neutre 0°, supination +, pronation −, deux côtés', () => {
    for (const side of ['D', 'G'] as Side[]) {
      for (const sup of [0, 45, 90, -60, -80]) {
        // Avant-bras pointé vers la caméra, pouce en haut, paume médiale.
        const d = v3(0, 0, -1);
        const medial = side === 'D' ? v3(1, 0, 0) : v3(-1, 0, 0);
        // Supination : la paume tourne vers le haut (−y). Rotation de la paume autour de d.
        const up = v3(0, -1, 0);
        const axis = cross(medial, up); // rotation medial → up
        const p = rotate(medial, axis, sup);
        const pts = synthHand(side, { d, p });
        expect(pronoSupination(pts, side, false)).toBeCloseTo(sup, 0);
      }
    }
  });
});

describe('Épaule et coude (Pose)', () => {
  const facingOf = (img: ReturnType<typeof toImageSpace>) => profileFacing(img, POSE.NOSE, POSE.L_SHOULDER, POSE.R_SHOULDER);

  for (const view of ['profil-droite', 'profil-gauche'] as const) {
    for (const side of ['D', 'G'] as Side[]) {
      it(`élévation antérieure, ${view}, côté ${side}`, () => {
        for (const a of [0, 45, 90, 150, 175, -40]) {
          const pts = synthBody({ view, side, shoulder: a, plane: 'sagittal' });
          const raw = rawPose(pts);
          const img = toImageSpace(raw.landmarks, 16 / 9, false);
          const arm = armFor(side, false, ARM);
          const facing = facingOf(img);
          expect(facing).toBe(view === 'profil-droite' ? 1 : -1);
          const world = raw.world!.map((p) => ({ x: p.x, y: p.y, z: p.z }));
          expect(shoulderElevation(world, img, arm, facing, '3d')).toBeCloseTo(a, 0);
          expect(shoulderElevation(img, img, arm, facing, '2d')).toBeCloseTo(a, 0);
        }
      });
      it(`flexion du coude, ${view}, côté ${side}`, () => {
        for (const e of [0, 30, 90, 140, -10]) {
          const pts = synthBody({ view, side, elbow: e });
          const raw = rawPose(pts);
          const img = toImageSpace(raw.landmarks, 16 / 9, false);
          const arm = armFor(side, false, ARM);
          const v = elbowFlexion(img, img, arm, facingOf(img), '2d');
          expect(v).toBeCloseTo(e, 0);
        }
      });
    }
  }

  it('abduction vue de face', () => {
    for (const side of ['D', 'G'] as Side[]) {
      for (const a of [0, 90, 170]) {
        const pts = synthBody({ view: 'face', side, shoulder: a, plane: 'frontal' });
        const arm = armFor(side, false, ARM);
        expect(shoulderAbduction(pts, arm, '3d')).toBeCloseTo(a, 0);
      }
    }
  });

  it('rotation externe coude au corps (expérimental)', () => {
    for (const side of ['D', 'G'] as Side[]) {
      for (const er of [0, 30, 60, 90, -20]) {
        const pts = synthBody({ view: 'face', side, externalRotation: er });
        const arm = armFor(side, false, ARM);
        expect(shoulderExternalRotation(pts, arm, side, false)).toBeCloseTo(er, 0);
      }
    }
  });

  it('image miroir : étiquettes gauche/droite échangées', () => {
    expect(armFor('D', true, ARM)).toBe(ARM.G);
    expect(armFor('D', false, ARM)).toBe(ARM.D);
  });
});

describe('Tolérance numérique', () => {
  it('constante', () => expect(CLOSE).toBeLessThan(1));
});
