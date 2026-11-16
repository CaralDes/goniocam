/**
 * Exports CSV au format français (séparateur « ; », décimale « , », UTF-8 avec BOM) :
 * lisible directement par Excel, et par R avec read.csv2().
 */
import type { Bilan } from '../core/results';
import { getMeasure } from '../core/measures';
import { VIEW_LABELS } from '../core/quality';

const BOM = '﻿';

const num = (v: number | null | undefined, digits = 1): string =>
  v === null || v === undefined || Number.isNaN(v) ? '' : v.toFixed(digits).replace('.', ',');

const cell = (v: string | number | boolean | null | undefined): string => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'boolean' ? (v ? 'oui' : 'non') : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const line = (cells: (string | number | boolean | null | undefined)[]) => cells.map(cell).join(';');

/** Une ligne par capture : valeur retenue, valeur automatique, qualité, contexte. */
export function summaryCsv(b: Bilan, version: string): string {
  const header = [
    'code_patient', 'date_bilan', 'protocole', 'mesure_id', 'mouvement', 'cote', 'role',
    'valeur_deg', 'valeur_auto_deg', 'corrigee', 'confiance', 'vue', 'methode', 'source',
    'capture_forcee', 'experimental', 'remarques', 'horodatage', 'version_app',
  ];
  const rows = Object.values(b.captures).map((c) => {
    const m = getMeasure(c.measureId);
    return line([
      b.patientCode, b.date, b.protocolId, c.measureId, m.label, c.side,
      c.side === b.affectedSide ? 'atteint' : 'sain',
      num(c.value), num(c.autoValue), c.corrected, num(c.confidence, 2), VIEW_LABELS[c.view],
      c.mode, c.source, c.forced, !!m.experimental, c.notes.join(' | '), c.timestamp, version,
    ]);
  });
  return BOM + [line(header), ...rows].join('\r\n') + '\r\n';
}

/** Données brutes : une ligne par image de la fenêtre de capture (angle, confiance, horodatage, vue, version). */
export function rawCsv(b: Bilan, version: string): string {
  const header = [
    'code_patient', 'mesure_id', 'cote', 'role', 'capture_horodatage', 't_ms', 'angle_deg',
    'confiance', 'vue', 'methode', 'source', 'version_app',
  ];
  const rows: string[] = [];
  for (const c of Object.values(b.captures)) {
    const t0 = c.samples[0]?.t ?? 0;
    for (const s of c.samples) {
      rows.push(line([
        b.patientCode, c.measureId, c.side, c.side === b.affectedSide ? 'atteint' : 'sain', c.timestamp,
        Math.round(s.t - t0), num(s.value, 2), num(s.confidence, 3), VIEW_LABELS[c.view], c.mode, c.source, version,
      ]));
    }
  }
  return BOM + [line(header), ...rows].join('\r\n') + '\r\n';
}
