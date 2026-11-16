// Génère des détections synthétiques (JSON) pour le test de bout en bout dans le navigateur.
import { it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { v3 } from '../src/core/vec';
import { synthHand, rawHand, detection } from './synth';
import type { Side } from '../src/core/types';

const PROFILE = { d: v3(0, -1, 0), p: v3(1, 0, 0) };
const PALM = { d: v3(0, -1, 0), p: v3(0, 0, -1) };

it('fixtures e2e', () => {
  const out: Record<string, unknown> = {};
  for (const side of ['D', 'G'] as Side[]) {
    const label = side === 'D' ? 'Right' : 'Left';
    // Côté droit = atteint (raideur), côté gauche = sain.
    const stiff = side === 'D';
    const flex = stiff ? ([60, 70, 40] as [number, number, number]) : ([85, 100, 70] as [number, number, number]);
    const ext = stiff ? ([5, 25, 10] as [number, number, number]) : ([-10, 0, 0] as [number, number, number]); // flexions résiduelles (flessum) vs hyperextension MCP
    const all = (a: [number, number, number]) => ({ 2: a, 3: a, 4: a, 5: a });
    out[`doigts_ext|${side}`] = detection([rawHand(synthHand(side, PROFILE, { fingers: all(ext) }), label)], null);
    out[`doigts_flex|${side}`] = detection([rawHand(synthHand(side, PROFILE, { fingers: all(flex) }), label)], null);
    out[`pouce_ext|${side}`] = detection([rawHand(synthHand(side, PALM, { thumb: stiff ? [-5, 0] : [-10, -15] }), label)], null);
    out[`pouce_flex|${side}`] = detection([rawHand(synthHand(side, PALM, { thumb: stiff ? [35, 50] : [55, 80] }), label)], null);
  }
  mkdirSync('tests/out', { recursive: true });
  writeFileSync('tests/out/fixtures-e2e.json', JSON.stringify(out));
  expect(Object.keys(out)).toHaveLength(8);
});
