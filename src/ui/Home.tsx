import { useState } from 'preact/hooks';
import type { Side } from '../core/types';
import { PROTOCOLS, PROTOCOL_BY_ID, STEPS } from '../core/protocols';
import { useStore } from '../state/store';
import { settingsStore } from '../state/settings';
import { sessionStore, startBilan, go, setIndex } from '../state/session';
import { engineStore, loadEngine } from '../state/engine';
import { VIEW_LABELS } from '../core/quality';

const today = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Un code pseudonyme ne doit pas ressembler à un nom (deux mots alphabétiques). */
export function looksLikeName(code: string): boolean {
  return /^[A-Za-zÀ-ÿ'-]{2,}\s+[A-Za-zÀ-ÿ'-]{2,}/.test(code.trim());
}

export function Home() {
  const settings = useStore(settingsStore);
  const session = useStore(sessionStore);
  const engine = useStore(engineStore);
  const [code, setCode] = useState('');
  const [date, setDate] = useState(today());
  const [examiner, setExaminer] = useState(settings.examinateur);
  const [side, setSide] = useState<Side | null>(null);
  const [protocol, setProtocol] = useState('main');
  const [free, setFree] = useState<string[]>([]);

  const steps = protocol === 'libre' ? STEPS.filter((s) => free.includes(s.id)).map((s) => s.id) : PROTOCOL_BY_ID[protocol].steps;
  const nameWarning = looksLikeName(code);
  const canStart = code.trim().length > 0 && !!side && steps.length > 0;

  const start = () => {
    if (!canStart || !side) return;
    startBilan({ patientCode: code.trim().toUpperCase(), affectedSide: side, examiner: examiner.trim(), date, protocolId: protocol, steps });
  };

  return (
    <main class="page home">
      <header class="brand">
        <h1>GonioCam</h1>
        <p>Goniométrie par caméra — membre supérieur et main</p>
        <button class="btn ghost small" onClick={() => go('reglages')}>Réglages</button>
      </header>

      {session.bilan && (
        <section class="card resume">
          <p>
            Bilan en cours : <strong>{session.bilan.patientCode}</strong> ({Object.keys(session.bilan.captures).length} mesures)
          </p>
          <div class="row">
            <button class="btn" onClick={() => setIndex(session.index)}>Reprendre</button>
            <button class="btn ghost" onClick={() => go('recap')}>Récapitulatif</button>
          </div>
        </section>
      )}

      <section class="card">
        <label class="field">
          <span>Code patient</span>
          <input
            value={code}
            onInput={(e) => setCode((e.target as HTMLInputElement).value)}
            placeholder="ex. HDJ-2026-017"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck={false}
            maxLength={32}
          />
          <small class={nameWarning ? 'warn' : ''}>
            {nameWarning ? 'Ceci ressemble à un nom : saisissez un code, jamais le nom du patient.' : 'Code pseudonyme uniquement — ni nom, ni date de naissance.'}
          </small>
        </label>
        <div class="grid2">
          <label class="field">
            <span>Date</span>
            <input type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
          </label>
          <label class="field">
            <span>Examinateur</span>
            <input value={examiner} onInput={(e) => setExaminer((e.target as HTMLInputElement).value)} placeholder="facultatif" />
          </label>
        </div>
        <div class="field">
          <span>Côté atteint</span>
          <div class="seg big">
            {(['G', 'D'] as Side[]).map((s) => (
              <button class={side === s ? 'on' : ''} onClick={() => setSide(s)} aria-pressed={side === s}>
                {s === 'G' ? 'Gauche' : 'Droit'}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Protocole</h2>
        <div class="protocols">
          {PROTOCOLS.map((p) => (
            <button class={`proto ${protocol === p.id ? 'on' : ''}`} onClick={() => setProtocol(p.id)} aria-pressed={protocol === p.id}>
              <strong>{p.label}</strong>
              <small>{p.id === 'libre' ? 'au choix' : `${p.steps.length} étapes × 2 côtés`}</small>
            </button>
          ))}
        </div>
        {protocol === 'libre' && (
          <ul class="checklist">
            {STEPS.map((s) => (
              <li>
                <label>
                  <input
                    type="checkbox"
                    checked={free.includes(s.id)}
                    onChange={(e) => {
                      const on = (e.target as HTMLInputElement).checked;
                      setFree(on ? [...free, s.id] : free.filter((x) => x !== s.id));
                    }}
                  />
                  <span>{s.title}</span>
                  <small>{VIEW_LABELS[s.view]}</small>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button class="btn primary huge" disabled={!canStart} onClick={start}>
        Commencer le bilan
      </button>
      {!canStart && <p class="hint">Saisir le code patient, choisir le côté atteint et au moins une étape.</p>}

      <footer class={`engine ${engine.status}`}>
        {engine.status === 'loading' && <span>⏳ {engine.message}</span>}
        {engine.status === 'ready' && <span>● Moteur de vision prêt (hors ligne)</span>}
        {engine.status === 'error' && (
          <span>
            ⚠ {engine.message} <button class="btn small" onClick={() => loadEngine(true)}>Réessayer</button>
          </span>
        )}
        {engine.warnings.map((w) => (
          <span class="warn">{w}</span>
        ))}
      </footer>
    </main>
  );
}
