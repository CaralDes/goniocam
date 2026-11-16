/** Réglages : établissement, paramètres de mesure, normes, moteur. */
import { useStore } from '../state/store';
import { settingsStore, updateSettings, resetSettings, type Settings } from '../state/settings';
import { engineStore, loadEngine } from '../state/engine';
import { sessionStore, go } from '../state/session';
import { MEASURES, REGION_LABELS } from '../core/measures';
import { VIEW_LABELS, type ViewTolerances } from '../core/quality';
import { APP_VERSION } from '../version';
import { blocked } from '../netguard';

function Num({ label, value, min, max, step, unit, onChange, hint }: {
  label: string; value: number; min: number; max: number; step: number; unit?: string; hint?: string; onChange: (v: number) => void;
}) {
  return (
    <label class="field range">
      <span>{label} <b>{value}{unit ?? ''}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div class="field">
      <span>{label}</span>
      <div class="seg">
        {options.map(([v, l]) => (
          <button class={value === v ? 'on' : ''} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>
        ))}
      </div>
    </div>
  );
}

async function readLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, 400 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function SettingsScreen() {
  const s = useStore(settingsStore);
  const session = useStore(sessionStore);
  const engine = useStore(engineStore);
  const set = (p: Partial<Settings>) => updateSettings(p);
  const setTol = (k: keyof ViewTolerances, v: number) => set({ tolVue: { ...s.tolVue, [k]: v } });
  const etab = s.etablissement;

  return (
    <main class="page settings">
      <header class="topbar">
        <button class="btn ghost small" onClick={() => go(session.previous === 'reglages' ? 'accueil' : session.previous)}>‹ Retour</button>
        <h1>Réglages</h1>
        <span />
      </header>

      <section class="card">
        <h2>Fiche PDF</h2>
        <label class="field"><span>Établissement</span>
          <input value={etab.nom} onInput={(e) => set({ etablissement: { ...etab, nom: (e.target as HTMLInputElement).value } })} />
        </label>
        <label class="field"><span>Service</span>
          <input value={etab.service} onInput={(e) => set({ etablissement: { ...etab, service: (e.target as HTMLInputElement).value } })} />
        </label>
        <label class="field"><span>Adresse (2 lignes max.)</span>
          <textarea rows={2} value={etab.adresse} onInput={(e) => set({ etablissement: { ...etab, adresse: (e.target as HTMLTextAreaElement).value } })} />
        </label>
        <div class="field">
          <span>Logo</span>
          <div class="row">
            {etab.logo && <img src={etab.logo} alt="Logo" class="logo-prev" />}
            <label class="btn small">Choisir une image
              <input type="file" accept="image/png,image/jpeg" class="visually-hidden" onChange={async (e) => {
                const f = (e.target as HTMLInputElement).files?.[0];
                if (f) set({ etablissement: { ...etab, logo: await readLogo(f) } });
              }} />
            </label>
            {etab.logo && <button class="btn small ghost" onClick={() => set({ etablissement: { ...etab, logo: null } })}>Retirer</button>}
          </div>
        </div>
        <label class="field"><span>Examinateur par défaut</span>
          <input value={s.examinateur} onInput={(e) => set({ examinateur: (e.target as HTMLInputElement).value })} />
        </label>
      </section>

      <section class="card">
        <h2>Mesure</h2>
        <Choice label="Calcul des angles" value={s.modeCalcul} options={[['3d', '3D (repères monde)'], ['2d', '2D (plan de l\'image)']]} onChange={(v) => set({ modeCalcul: v })} />
        <Choice label="Lissage" value={s.lissage} options={[['oneeuro', 'One Euro'], ['moyenne', 'Moyenne 10 images'], ['aucun', 'Aucun']]} onChange={(v) => set({ lissage: v })} />
        <Num label="Seuil de confiance pour capturer" value={s.seuilConfiance} min={0.3} max={0.95} step={0.05} onChange={(v) => set({ seuilConfiance: v })} hint="Sous ce seuil la capture est refusée." />
        <Num label="Tolérance de stabilité" value={s.toleranceStabilite} min={1} max={8} step={0.5} unit="°" onChange={(v) => set({ toleranceStabilite: v })} hint="Amplitude maximale tolérée pendant la fenêtre de stabilité." />
        <Num label="Durée de position stable" value={s.dureeStabilite} min={500} max={2500} step={100} unit=" ms" onChange={(v) => set({ dureeStabilite: v })} />
        <Num label="Écart toléré au plan de l'image" value={s.toleranceHorsPlan} min={10} max={40} step={1} unit="°" onChange={(v) => set({ toleranceHorsPlan: v })} hint="Au-delà, avertissement (et forte baisse de confiance en mode 2D)." />
        <label class="toggle"><input type="checkbox" checked={s.captureAuto} onChange={(e) => set({ captureAuto: (e.target as HTMLInputElement).checked })} /> Capture automatique par défaut</label>
        <label class="toggle"><input type="checkbox" checked={s.sonCapture} onChange={(e) => set({ sonCapture: (e.target as HTMLInputElement).checked })} /> Signal sonore à la capture</label>
        <Choice label="Caméra par défaut" value={s.camera} options={[['arriere', 'Arrière (soignant)'], ['avant', 'Selfie (patient seul)']]} onChange={(v) => set({ camera: v })} />
      </section>

      <section class="card">
        <h2>Contrôle de la vue</h2>
        <Num label={`${VIEW_LABELS['corps-face']} : rotation max.`} value={s.tolVue.corpsFace} min={10} max={45} step={1} unit="°" onChange={(v) => setTol('corpsFace', v)} />
        <Num label={`${VIEW_LABELS['corps-profil']} : rotation min.`} value={s.tolVue.corpsProfil} min={40} max={85} step={1} unit="°" onChange={(v) => setTol('corpsProfil', v)} />
        <Num label={`${VIEW_LABELS['main-face']} : inclinaison max.`} value={s.tolVue.mainFace} min={10} max={50} step={1} unit="°" onChange={(v) => setTol('mainFace', v)} />
        <Num label={`${VIEW_LABELS['main-profil']} : rotation min.`} value={s.tolVue.mainProfil} min={40} max={85} step={1} unit="°" onChange={(v) => setTol('mainProfil', v)} />
        <Num label={`${VIEW_LABELS['main-axiale']} : écart max.`} value={s.tolVue.mainAxiale} min={20} max={70} step={1} unit="°" onChange={(v) => setTol('mainAxiale', v)} />
      </section>

      <section class="card">
        <h2>Normes indicatives</h2>
        <p class="hint">Valeurs de repère affichées dans le récapitulatif et la fiche. Case vide = valeur par défaut.</p>
        <div class="norms">
          {MEASURES.map((m, i) => (
            <>
              {(i === 0 || MEASURES[i - 1].region !== m.region) && <h3>{REGION_LABELS[m.region]}</h3>}
              <label class="norm">
                <span>{m.label}</span>
                <input
                  inputMode="numeric"
                  placeholder={String(m.defaultNorm)}
                  value={s.normes[m.id] ?? ''}
                  onChange={(e) => {
                    const raw = (e.target as HTMLInputElement).value.trim();
                    const normes = { ...s.normes };
                    if (raw === '' || !Number.isFinite(Number(raw))) delete normes[m.id];
                    else normes[m.id] = Number(raw);
                    set({ normes });
                  }}
                />
                °
              </label>
            </>
          ))}
        </div>
      </section>

      <section class="card">
        <h2>Moteur de vision</h2>
        <Choice label="Modèle du corps" value={s.modelePose} options={[['full', 'Complet (précis)'], ['lite', 'Léger (rapide)']]} onChange={(v) => set({ modelePose: v })} />
        <Choice label="Calcul" value={s.delegate} options={[['GPU', 'GPU'], ['CPU', 'Processeur']]} onChange={(v) => set({ delegate: v })} />
        <button class="btn" disabled={engine.status === 'loading'} onClick={() => loadEngine(true)}>
          {engine.status === 'loading' ? 'Chargement…' : 'Appliquer (recharger le moteur)'}
        </button>
        <p class="hint">
          État : {engine.status === 'ready' ? `prêt — ${engine.engine?.info.delegate}, modèle ${engine.engine?.info.poseModel}` : engine.message}
        </p>
        <details>
          <summary>Avancé</summary>
          <label class="toggle">
            <input type="checkbox" checked={s.inverserProfondeur} onChange={(e) => set({ inverserProfondeur: (e.target as HTMLInputElement).checked })} />
            Inverser la convention de profondeur (si flexion et extension des doigts apparaissent inversées sur cet appareil)
          </label>
        </details>
      </section>

      <section class="card about">
        <h2>À propos</h2>
        <p>GonioCam {APP_VERSION}. Traitement 100 % local : aucune image, vidéo ni mesure ne quitte l'appareil ; aucune connexion réseau après le chargement. Seuls ces réglages sont conservés sur l'appareil ; le bilan en cours reste en mémoire jusqu'à sa fermeture.</p>
        <p>Connexions sortantes bloquées depuis l'ouverture : <b>{blocked.length}</b>{blocked.length ? ` (${[...new Set(blocked.map((u) => { try { return new URL(u).host; } catch { return u; } }))].join(', ')})` : ''}.</p>
        <p>Outil d'aide à la mesure en cours de validation : le goniomètre manuel reste la référence clinique.</p>
        <button class="btn ghost danger" onClick={() => confirm('Rétablir tous les réglages par défaut ?') && resetSettings()}>Rétablir les réglages par défaut</button>
      </section>
    </main>
  );
}
