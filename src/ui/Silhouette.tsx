/** Silhouettes guides : position attendue du sujet par rapport à la caméra. */
import type { ViewKind } from '../core/quality';

const S = { fill: 'none', stroke: 'currentColor', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const;

function Camera({ x, y, rot = 0 }: { x: number; y: number; rot?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`} class="sil-cam">
      <rect x="-16" y="-11" width="24" height="22" rx="4" fill="currentColor" />
      <path d="M8 -6 L18 -12 L18 12 L8 6 Z" fill="currentColor" />
    </g>
  );
}

function BodyProfile() {
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label="Sujet de profil">
      <circle cx="100" cy="38" r="16" {...S} />
      <path d="M112 34 l8 4 l-8 3" {...S} stroke-width="3" />
      <path d="M100 54 L100 120 M100 120 L92 182 M100 120 L108 182" {...S} />
      <path d="M100 66 L100 112" {...S} stroke-width="9" opacity="0.25" />
      <path d="M100 66 L140 40" {...S} class="sil-move" />
      <path d="M100 66 L100 108" {...S} stroke-dasharray="4 6" opacity="0.6" />
      <path d="M118 96 A 32 32 0 0 0 128 50" {...S} stroke-width="2.5" class="sil-move" marker-end="url(#arrow)" />
      <Camera x={30} y={70} />
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
        </marker>
      </defs>
    </svg>
  );
}

function BodyFace() {
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label="Sujet de face">
      <circle cx="100" cy="36" r="16" {...S} />
      <path d="M72 62 L128 62 M100 54 L100 120 M84 120 L116 120 M86 120 L80 184 M114 120 L120 184" {...S} />
      <path d="M72 62 L66 116" {...S} />
      <path d="M128 62 L172 40" {...S} class="sil-move" />
      <path d="M128 62 L134 116" {...S} stroke-dasharray="4 6" opacity="0.6" />
      <Camera x={100} y={192} rot={-90} />
    </svg>
  );
}

function HandProfile() {
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label="Main de profil">
      <path d="M20 120 L90 116" {...S} stroke-width="16" opacity="0.25" />
      <path d="M20 112 L92 108 L132 102 L160 96 L180 94" {...S} />
      <path d="M20 132 L92 130 L128 126" {...S} />
      <path d="M128 126 L150 140 L162 160" {...S} class="sil-move" />
      <path d="M92 108 Q96 120 92 130" {...S} stroke-width="2.5" />
      <path d="M150 90 A 40 40 0 0 1 166 140" {...S} stroke-width="2.5" class="sil-move" stroke-dasharray="3 5" />
      <Camera x={100} y={184} rot={-90} />
    </svg>
  );
}

function HandFace() {
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label="Paume face à la caméra">
      <path d="M70 170 L70 110 Q70 92 84 90 L120 90 Q134 92 134 110 L134 170" {...S} />
      <path d="M80 90 L76 40 M96 88 L96 28 M110 88 L114 34 M124 92 L130 52" {...S} />
      <path d="M70 122 L44 100 L34 78" {...S} class="sil-move" />
      <circle cx="102" cy="128" r="8" {...S} stroke-width="2.5" />
      <text x="100" y="196" text-anchor="middle" font-size="14" fill="currentColor">caméra en face</text>
    </svg>
  );
}

function HandAxial() {
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label="Avant-bras pointé vers la caméra">
      <circle cx="100" cy="104" r="30" {...S} />
      <ellipse cx="100" cy="104" rx="12" ry="30" {...S} stroke-width="2.5" />
      <path d="M100 74 L100 46" {...S} />
      <path d="M100 46 Q104 38 110 40" {...S} stroke-width="3" />
      <path d="M58 104 A 42 42 0 0 1 100 62" {...S} stroke-width="2.5" class="sil-move" marker-end="url(#arrowA)" />
      <path d="M142 104 A 42 42 0 0 0 100 62" {...S} stroke-width="2.5" class="sil-move" marker-end="url(#arrowA)" />
      <text x="100" y="170" text-anchor="middle" font-size="14" fill="currentColor">pouce en haut au départ</text>
      <text x="100" y="190" text-anchor="middle" font-size="14" fill="currentColor">avant-bras vers la caméra</text>
      <defs>
        <marker id="arrowA" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
        </marker>
      </defs>
    </svg>
  );
}

export function Silhouette({ view }: { view: ViewKind }) {
  switch (view) {
    case 'corps-profil':
      return <BodyProfile />;
    case 'corps-face':
      return <BodyFace />;
    case 'main-profil':
      return <HandProfile />;
    case 'main-face':
      return <HandFace />;
    case 'main-axiale':
      return <HandAxial />;
  }
}
