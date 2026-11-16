/** Dessin de l'image source, du squelette et de l'arc de mesure sur un canvas. */
import type { ArcOverlay, P2 } from '../core/types';
import { HAND_CONNECTIONS, POSE_CONNECTIONS } from '../core/landmarks';
import type { ConfidenceLevel } from '../core/quality';

export const LEVEL_COLORS: Record<ConfidenceLevel, string> = {
  vert: '#22c55e',
  orange: '#f59e0b',
  rouge: '#ef4444',
};

export interface OverlayData {
  hand: P2[] | null;
  pose: P2[] | null;
  arc?: ArcOverlay;
  level: ConfidenceLevel;
  /** Miroir d'affichage (caméra selfie) : n'affecte que le dessin. */
  displayMirror: boolean;
}

type Src = HTMLVideoElement | HTMLImageElement;

export function drawOverlay(canvas: HTMLCanvasElement, src: Src, d: OverlayData) {
  const sw = src instanceof HTMLVideoElement ? src.videoWidth : src.naturalWidth;
  const sh = src instanceof HTMLVideoElement ? src.videoHeight : src.naturalHeight;
  if (!sw || !sh) return;
  // Résolution du canvas plafonnée pour l'affichage.
  const k = Math.min(1, 1280 / Math.max(sw, sh));
  const W = Math.round(sw * k);
  const H = Math.round(sh * k);
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.save();
  if (d.displayMirror) {
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(src, 0, 0, W, H);
  ctx.restore();

  const px = (p: P2) => ({ x: (d.displayMirror ? 1 - p.x : p.x) * W, y: p.y * H });
  const lw = Math.max(2, W / 400);

  const skeleton = (pts: P2[], links: [number, number][], color: string, r: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (const [a, b] of links) {
      if (!pts[a] || !pts[b]) continue;
      const A = px(pts[a]);
      const B = px(pts[b]);
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
    }
    ctx.stroke();
    ctx.fillStyle = color;
    for (const i of new Set(links.flat())) {
      if (!pts[i]) continue;
      const P = px(pts[i]);
      ctx.beginPath();
      ctx.arc(P.x, P.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  if (d.pose) skeleton(d.pose, POSE_CONNECTIONS, 'rgba(255,255,255,0.8)', lw * 1.6);
  if (d.hand) skeleton(d.hand, HAND_CONNECTIONS, 'rgba(255,255,255,0.8)', lw * 1.3);

  if (d.arc) {
    const color = LEVEL_COLORS[d.level];
    const O = px(d.arc.o);
    const F = px(d.arc.from);
    const T = px(d.arc.to);
    const lenF = Math.hypot(F.x - O.x, F.y - O.y);
    const lenT = Math.hypot(T.x - O.x, T.y - O.y);
    const R = Math.max(14, Math.min(lenF, lenT) * 0.55);

    ctx.lineWidth = lw * 1.6;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.setLineDash([lw * 3, lw * 2]);
    ctx.beginPath();
    ctx.moveTo(O.x, O.y);
    ctx.lineTo(F.x, F.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = color;
    ctx.lineWidth = lw * 2.2;
    ctx.beginPath();
    ctx.moveTo(O.x, O.y);
    ctx.lineTo(T.x, T.y);
    ctx.stroke();

    const a0 = Math.atan2(F.y - O.y, F.x - O.x);
    const a1 = Math.atan2(T.y - O.y, T.x - O.x);
    let delta = a1 - a0;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    ctx.fillStyle = color + '55';
    ctx.beginPath();
    ctx.moveTo(O.x, O.y);
    ctx.arc(O.x, O.y, R, a0, a0 + delta, delta < 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw * 1.4;
    ctx.beginPath();
    ctx.arc(O.x, O.y, R, a0, a0 + delta, delta < 0);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(O.x, O.y, lw * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
}
