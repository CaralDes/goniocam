/** Récapitulatif bilatéral, correction des valeurs et exports. */
import { useState } from 'preact/hooks';
import { computeRows, fmtDeg, fmtPct, otherSide, sideLabel, type Capture, type ResultRow } from '../core/results';
import { REGION_LABELS, getMeasure, type Region } from '../core/measures';
import { PROTOCOL_BY_ID, STEPS } from '../core/protocols';
import { useStore } from '../state/store';
import { settingsStore } from '../state/settings';
import { sessionStore, bilanMeasureIds, editCapture, deleteCapture, setIndex, endBilan, markExported, go } from '../state/session';
import { buildPdf } from '../export/pdf';
import { rawCsv, summaryCsv } from '../export/csv';
import { APP_VERSION } from '../version';
import { download, shareFile } from './download';

/** Libellé compact pour l'écran (la région est déjà en en-tête de groupe). */
const rowLabel = (id: string, label: string) => {
  const m = getMeasure(id);
  if (m.region === 'doigts' || m.region === 'pouce') return `${m.short} ${m.direction === 'flexion' ? 'flex.' : 'ext.'}`;
  const s = label.replace(/^(Épaule|Coude|Poignet|Avant-bras) — /, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function Cell({ c, onEdit, onDelete }: { c: Capture | null; onEdit: (v: number) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  if (!c) return <td class="num empty">—</td>;
  if (editing)
    return (
      <td class="num">
        <input
          class="cell-input"
          inputMode="decimal"
          autoFocus
          defaultValue={String(Math.round(c.value))}
          onBlur={(e) => {
            const raw = (e.target as HTMLInputElement).value.trim();
            if (raw === '') onDelete();
            else {
              const v = Number(raw.replace(',', '.'));
              if (Number.isFinite(v)) onEdit(v);
            }
            setEditing(false);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </td>
    );
  return (
    <td class={`num ${c.corrected ? 'corrected' : ''} ${c.confidence < settingsStore.get().seuilConfiance ? 'low' : ''}`}>
      <button class="cellbtn" onClick={() => setEditing(true)} title="Corriger">
        {fmtDeg(c.value)}
        {c.corrected && <sup>c</sup>}
      </button>
    </td>
  );
}

export function Summary() {
  const session = useStore(sessionStore);
  const settings = useStore(settingsStore);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const b = session.bilan;
  if (!b) {
    return (
      <main class="page">
        <p>Aucun bilan en cours.</p>
        <button class="btn" onClick={() => go('accueil')}>Accueil</button>
      </main>
    );
  }
  const ids = bilanMeasureIds(b);
  const rows = computeRows(b, ids, settings.normes);
  const healthy = otherSide(b.affectedSide);
  const fileBase = `bilan_${b.patientCode}_${b.date}`.replace(/[^\w.-]+/g, '_');
  const nCaptured = Object.keys(b.captures).length;

  const groups: [Region, ResultRow[]][] = [];
  for (const r of rows) {
    const g = groups.at(-1);
    if (g && g[0] === r.region) g[1].push(r);
    else groups.push([r.region, [r]]);
  }

  const exportPdf = async (share: boolean) => {
    setBusy(true);
    try {
      const bytes = await buildPdf(b, {
        etablissement: settings.etablissement,
        measureIds: ids,
        norms: settings.normes,
        version: APP_VERSION,
        calcMode: settings.modeCalcul,
        lowConfidence: settings.seuilConfiance,
      });
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      if (share) await shareFile(blob, `${fileBase}.pdf`);
      else download(blob, `${fileBase}.pdf`);
      markExported();
      setMsg('Fiche PDF générée sur l\'appareil.');
    } catch (e) {
      setMsg(`Échec de l'export PDF : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = (raw: boolean) => {
    const text = raw ? rawCsv(b, APP_VERSION) : summaryCsv(b, APP_VERSION);
    download(new Blob([text], { type: 'text/csv;charset=utf-8' }), `${fileBase}${raw ? '_brut' : ''}.csv`);
    markExported();
  };

  const stepFor = (measureId: string) => STEPS.find((s) => s.measures.includes(measureId) && b.steps.includes(s.id));
  const goMeasure = (measureId: string, side: 'G' | 'D') => {
    const st = stepFor(measureId);
    const i = session.queue.findIndex((q) => q.stepId === st?.id && q.side === side);
    if (i >= 0) setIndex(i);
  };

  return (
    <main class="page summary">
      <header class="topbar">
        <button class="btn ghost small" onClick={() => setIndex(session.index)}>‹ Mesures</button>
        <h1>Récapitulatif</h1>
        <button class="btn ghost small" onClick={() => go('reglages')}>Réglages</button>
      </header>

      <section class="card ident">
        <div><small>Code patient</small><b>{b.patientCode}</b></div>
        <div><small>Date</small><b>{b.date.split('-').reverse().join('/')}</b></div>
        <div><small>Côté atteint</small><b>{sideLabel(b.affectedSide)}</b></div>
        <div><small>Protocole</small><b>{PROTOCOL_BY_ID[b.protocolId]?.label}</b></div>
      </section>

      <p class="hint">Touchez une valeur pour la corriger (case vide = supprimer). Touchez « — » pour mesurer. <sup>c</sup> = corrigée à la main.</p>

      <div class="tablewrap">
        <table class="results">
          <thead>
            <tr>
              <th>Mouvement</th>
              <th class="num">Sain ({healthy})</th>
              <th class="num">Atteint ({b.affectedSide})</th>
              <th class="num">Déficit</th>
              <th class="num">%</th>
              <th class="num">Norme</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(([region, rs]) => (
              <>
                <tr class="group">
                  <td colSpan={6}>{REGION_LABELS[region]}</td>
                </tr>
                {rs.map((r) => (
                  <tr>
                    <td>
                      {rowLabel(r.measureId, r.label)}
                      {r.experimental && <span class="tag exp">exp.</span>}
                    </td>
                    {[r.healthy, r.affected].map((c, i) => {
                      const side = i === 0 ? healthy : b.affectedSide;
                      return c ? (
                        <Cell c={c} onEdit={(v) => editCapture(r.measureId, side, v)} onDelete={() => deleteCapture(r.measureId, side)} />
                      ) : (
                        <td class="num empty">
                          <button class="cellbtn" onClick={() => goMeasure(r.measureId, side)}>—</button>
                        </td>
                      );
                    })}
                    <td class={`num strong ${(r.deficitDeg ?? 0) >= 10 ? 'alert' : ''}`}>{fmtDeg(r.deficitDeg)}</td>
                    <td class="num">{fmtPct(r.deficitPct)}</td>
                    <td class="num muted">{fmtDeg(r.norm)}</td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <section class="exports">
        <button class="btn primary huge" disabled={busy || !nCaptured} onClick={() => exportPdf(false)}>
          {busy ? 'Génération…' : 'Exporter la fiche PDF'}
        </button>
        <div class="row wrap">
          {'share' in navigator && (
            <button class="btn" disabled={busy || !nCaptured} onClick={() => exportPdf(true)}>Partager le PDF</button>
          )}
          <button class="btn" disabled={!nCaptured} onClick={() => exportCsv(false)}>CSV des mesures</button>
          <button class="btn" disabled={!nCaptured} onClick={() => exportCsv(true)}>CSV brut (validation)</button>
        </div>
        {msg && <p class="hint">{msg}</p>}
        <button
          class="btn ghost danger"
          onClick={() => {
            if (session.exported || !nCaptured || confirm('Le bilan n\'a pas été exporté. Le fermer quand même ? Les mesures seront perdues.')) endBilan();
          }}
        >
          Terminer et fermer le bilan
        </button>
      </section>
    </main>
  );
}
