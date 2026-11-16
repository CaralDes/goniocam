/** Fiche de bilan A4 générée localement (pdf-lib, polices standard : aucune ressource externe). */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from 'pdf-lib';
import { computeRows, fmtDeg, fmtPct, sideLabel, otherSide, type Bilan, type ResultRow } from '../core/results';
import { REGION_LABELS, type Region } from '../core/measures';
import { PROTOCOL_BY_ID } from '../core/protocols';
import type { Etablissement } from '../state/settings';

export interface PdfOptions {
  etablissement: Etablissement;
  measureIds: string[];
  norms: Record<string, number>;
  version: string;
  calcMode: '3d' | '2d';
  /** Seuil de confiance en dessous duquel la mesure est signalée. */
  lowConfidence: number;
}

const A4: [number, number] = [595.28, 841.89];
const M = 40; // marge
const INK = rgb(0.1, 0.12, 0.16);
const GREY = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.8, 0.82, 0.86);
const BAND = rgb(0.93, 0.95, 0.97);
const ALERT = rgb(0.7, 0.15, 0.1);

/** Remplace les caractères hors WinAnsi (polices standard PDF). */
export function pdfSafe(s: string): string {
  return s
    .replace(/[−‐‑]/g, '-')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/→/g, '->')
    .replace(/[  ]/g, ' ')
    .replace(/[^\x20-\x7E -ÿŒœŠšŸŽžƒˆ˜–—‘’‚“”„†‡•…‰‹›€™]/g, '?');
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = pdfSafe(text).split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) <= width || !cur) cur = test;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

async function embedLogo(doc: PDFDocument, dataUrl: string | null): Promise<PDFImage | null> {
  if (!dataUrl) return null;
  try {
    const bytes = Uint8Array.from(atob(dataUrl.split(',')[1] ?? ''), (c) => c.charCodeAt(0));
    return dataUrl.startsWith('data:image/png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

export async function buildPdf(b: Bilan, o: PdfOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`Bilan goniométrique ${b.patientCode} ${b.date}`));
  doc.setCreator(`GonioCam ${o.version}`);
  doc.setProducer('GonioCam (pdf-lib)');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedLogo(doc, o.etablissement.logo);
  const rows = computeRows(b, o.measureIds, o.norms);
  const healthy = otherSide(b.affectedSide);

  const pages: PDFPage[] = [];
  const text = (p: PDFPage, s: string, x: number, y: number, size = 9, f = font, color = INK) =>
    p.drawText(pdfSafe(s), { x, y, size, font: f, color });

  // ─── En-tête (première page) ───
  let page = doc.addPage(A4);
  pages.push(page);
  let y = A4[1] - M;
  let xText = M;
  if (logo) {
    const s = Math.min(70 / logo.width, 45 / logo.height);
    page.drawImage(logo, { x: M, y: y - logo.height * s, width: logo.width * s, height: logo.height * s });
    xText = M + logo.width * s + 10;
  }
  text(page, o.etablissement.nom || 'Établissement', xText, y - 11, 12, bold);
  if (o.etablissement.service) text(page, o.etablissement.service, xText, y - 25, 9, font, GREY);
  o.etablissement.adresse.split('\n').slice(0, 2).forEach((l, i) => text(page, l, xText, y - 37 - i * 11, 8, font, GREY));

  const title = 'Bilan goniométrique';
  text(page, title, A4[0] - M - bold.widthOfTextAtSize(title, 16), y - 14, 16, bold);
  const sub = 'Membre supérieur et main';
  text(page, sub, A4[0] - M - font.widthOfTextAtSize(sub, 9), y - 28, 9, font, GREY);
  y -= 62;
  page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 1, color: INK });
  y -= 18;

  // ─── Identification ───
  const ident: [string, string][] = [
    ['Code patient', b.patientCode],
    ['Date du bilan', fmtDate(b.date)],
    ['Côté atteint', sideLabel(b.affectedSide)],
    ['Protocole', PROTOCOL_BY_ID[b.protocolId]?.label ?? b.protocolId],
    ['Examinateur', b.examiner || '—'],
  ];
  ident.forEach(([k, v], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = M + col * 175;
    const yy = y - row * 26;
    text(page, k, x, yy, 7.5, font, GREY);
    text(page, v, x, yy - 11, 10.5, bold);
  });
  y -= 62;

  // ─── Tableau ───
  const cols = [
    { key: 'label', title: 'Mouvement', w: 190, align: 'left' as const },
    { key: 'norm', title: 'Norme', w: 42, align: 'right' as const },
    { key: 'healthy', title: `Sain (${b.affectedSide === 'D' ? 'G' : 'D'})`, w: 52, align: 'right' as const },
    { key: 'affected', title: `Atteint (${b.affectedSide})`, w: 58, align: 'right' as const },
    { key: 'ddeg', title: 'Déficit °', w: 50, align: 'right' as const },
    { key: 'dpct', title: 'Déficit %', w: 50, align: 'right' as const },
    { key: 'notes', title: 'Remarques', w: 73, align: 'left' as const },
  ];
  const tableW = cols.reduce((s, c) => s + c.w, 0);

  const drawHeader = () => {
    page.drawRectangle({ x: M, y: y - 16, width: tableW, height: 18, color: INK });
    let x = M;
    for (const c of cols) {
      const tw = bold.widthOfTextAtSize(pdfSafe(c.title), 8);
      text(page, c.title, c.align === 'right' ? x + c.w - tw - 4 : x + 4, y - 10.5, 8, bold, rgb(1, 1, 1));
      x += c.w;
    }
    y -= 20;
  };

  const newPage = () => {
    page = doc.addPage(A4);
    pages.push(page);
    y = A4[1] - M;
    text(page, `Bilan goniométrique — ${b.patientCode} — ${fmtDate(b.date)} (suite)`, M, y - 10, 9, bold);
    y -= 26;
    drawHeader();
  };

  const remarks = (r: ResultRow): string => {
    const n: string[] = [];
    if (r.experimental) n.push('expérimental');
    for (const c of [r.healthy, r.affected]) {
      if (!c) continue;
      const tag = c.side === b.affectedSide ? 'A' : 'S';
      if (c.corrected) n.push(`corrigé (${tag})`);
      if (c.confidence < o.lowConfidence + 0.15) n.push(`confiance ${Math.round(c.confidence * 100)} % (${tag})`);
      if (c.forced) n.push(`capture manuelle (${tag})`);
    }
    return n.join(', ');
  };

  drawHeader();
  let region: Region | null = null;
  let zebra = false;
  for (const r of rows) {
    if (!r.healthy && !r.affected) continue;
    const notes = wrap(remarks(r), font, 6.5, cols[6].w - 6);
    const labelLines = wrap(r.label, font, 8.5, cols[0].w - 8);
    const h = Math.max(15, 5 + Math.max(labelLines.length * 10, notes.length * 8));
    const needRegion = r.region !== region;
    if (y - h - (needRegion ? 16 : 0) < M + 70) newPage();
    if (needRegion) {
      region = r.region;
      text(page, REGION_LABELS[r.region].toUpperCase(), M + 4, y - 11, 8, bold, GREY);
      y -= 15;
      zebra = false;
    }
    if (zebra) page.drawRectangle({ x: M, y: y - h + 3, width: tableW, height: h, color: BAND });
    zebra = !zebra;
    const vals: Record<string, string> = {
      norm: fmtDeg(r.norm),
      healthy: fmtDeg(r.healthy?.value),
      affected: fmtDeg(r.affected?.value),
      ddeg: fmtDeg(r.deficitDeg),
      dpct: fmtPct(r.deficitPct),
    };
    let x = M;
    for (const c of cols) {
      if (c.key === 'label') labelLines.forEach((l, i) => text(page, l, x + 4, y - 9 - i * 10, 8.5));
      else if (c.key === 'notes') notes.forEach((l, i) => text(page, l, x + 3, y - 8 - i * 8, 6.5, font, GREY));
      else {
        const s = vals[c.key];
        const f = c.key === 'affected' || c.key === 'ddeg' ? bold : font;
        const color = c.key === 'ddeg' && (r.deficitDeg ?? 0) >= 10 ? ALERT : INK;
        const tw = f.widthOfTextAtSize(pdfSafe(s), 9);
        text(page, s, x + c.w - tw - 4, y - 9.5, 9, f, color);
      }
      x += c.w;
    }
    y -= h;
    page.drawLine({ start: { x: M, y: y + 3 }, end: { x: M + tableW, y: y + 3 }, thickness: 0.4, color: LINE });
  }

  if (!rows.some((r) => r.healthy || r.affected)) {
    text(page, 'Aucune mesure enregistrée.', M + 4, y - 12, 9, font, GREY);
    y -= 20;
  }

  // ─── Légende et méthode (dernière page) ───
  const method = [
    `Méthode : mesure par caméra, estimation des repères anatomiques MediaPipe (Hand, Pose), calcul ${o.calcMode === '3d' ? 'sur les coordonnées 3D' : 'dans le plan de l\'image (2D)'}, méthode neutre zéro. Valeur retenue = médiane sur 1 s de position stable, corrigeable par l'examinateur.`,
    `Déficit = côté sain (${sideLabel(healthy)}) - côté atteint (${sideLabel(b.affectedSide)}), en degrés et en % du côté sain. Extensions : valeur négative = flessum, positive = hyperextension. Normes indicatives.`,
    `Outil d'aide à la mesure en cours de validation : le goniomètre manuel reste la référence clinique. Mesures « expérimental » (rotation externe, pronosupination) à interpréter avec prudence.`,
    `GonioCam version ${o.version} — traitement 100 % local, aucune image transmise ni conservée.`,
  ];
  const methodLines = method.map((m) => wrap(m, font, 7, A4[0] - 2 * M));
  const needed = methodLines.reduce((s, l) => s + l.length * 9 + 3, 0) + 14;
  if (y - needed < M + 20) newPage();
  y -= 10;
  page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.6, color: LINE });
  y -= 12;
  for (const lines of methodLines) {
    for (const l of lines) {
      text(page, l, M, y, 7, font, GREY);
      y -= 9;
    }
    y -= 3;
  }

  // ─── Pieds de page ───
  pages.forEach((p, i) => {
    const s = `${b.patientCode} — ${fmtDate(b.date)} — page ${i + 1}/${pages.length}`;
    p.drawText(pdfSafe(s), { x: A4[0] - M - font.widthOfTextAtSize(pdfSafe(s), 7), y: 22, size: 7, font, color: GREY });
    p.drawText(pdfSafe(`Édité le ${new Date().toLocaleDateString('fr-FR')} — GonioCam ${o.version}`), { x: M, y: 22, size: 7, font, color: GREY });
  });

  return doc.save();
}
