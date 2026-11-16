import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildPdf, pdfSafe } from '../src/export/pdf';
import { rawCsv, summaryCsv } from '../src/export/csv';
import { captureKey, type Bilan, type Capture } from '../src/core/results';
import { STEP_BY_ID, PROTOCOL_BY_ID } from '../src/core/protocols';
import { DEFAULT_SETTINGS } from '../src/state/settings';

function demoBilan(): Bilan {
  const steps = PROTOCOL_BY_ID.main.steps;
  const captures: Record<string, Capture> = {};
  let k = 0;
  for (const st of steps) {
    for (const id of STEP_BY_ID[st].measures) {
      for (const side of ['D', 'G'] as const) {
        k++;
        const base = id.includes('flex') ? 80 : -5;
        const value = side === 'D' ? base - (k % 5) * 6 : base;
        captures[captureKey(id, side)] = {
          measureId: id, side, value, autoValue: value + (k % 7 === 0 ? 4 : 0), corrected: k % 7 === 0,
          confidence: 0.6 + (k % 4) * 0.1, view: STEP_BY_ID[st].view, mode: '3d', source: 'camera', forced: k % 11 === 0,
          timestamp: '2026-11-16T10:00:00.000Z',
          samples: Array.from({ length: 30 }, (_, i) => ({ t: 1000 + i * 33, value: value + Math.sin(i) * 0.5, confidence: 0.85 })),
          notes: k % 9 === 0 ? ['Segment à 24° du plan de l\'image'] : [],
        };
      }
    }
  }
  return {
    patientCode: 'HDJ-2026-017', affectedSide: 'D', examiner: 'Dr A. Carrot', date: '2026-11-16',
    protocolId: 'main', steps, captures,
  };
}

describe('Exports', () => {
  it('PDF A4 valide, plusieurs pages si nécessaire', async () => {
    const b = demoBilan();
    const ids = b.steps.flatMap((s) => STEP_BY_ID[s].measures);
    const bytes = await buildPdf(b, {
      etablissement: { ...DEFAULT_SETTINGS.etablissement, adresse: '17 rue de l\'Hôpital\n38210 Tullins' },
      measureIds: ids, norms: {}, version: '0.3.0', calcMode: '3d', lowConfidence: 0.6,
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    mkdirSync('tests/out', { recursive: true });
    writeFileSync('tests/out/bilan-exemple.pdf', bytes);
  });

  it('pdfSafe remplace les caractères non encodables', () => {
    expect(pdfSafe('a − b ≤ c → d')).toBe('a - b <= c -> d');
    expect(pdfSafe('Épaule — 90° « ok »')).toBe('Épaule — 90° « ok »');
  });

  it('CSV récapitulatif et brut', () => {
    const b = demoBilan();
    const s = summaryCsv(b, '0.3.0');
    const lines = s.trimEnd().split('\r\n');
    expect(lines[0].startsWith('﻿code_patient;')).toBe(true);
    expect(lines.length).toBe(Object.keys(b.captures).length + 1);
    expect(lines[1]).toMatch(/HDJ-2026-017;2026-11-16;main;/);
    const r = rawCsv(b, '0.3.0').trim().split('\r\n');
    expect(r.length).toBe(Object.keys(b.captures).length * 30 + 1);
    expect(r[1].split(';')).toHaveLength(12);
    writeFileSync('tests/out/bilan-exemple.csv', s);
  });
});
