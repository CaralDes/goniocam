/** Écran de mesure : caméra ou fichier → détection → angles en surimpression → capture. */
import { useEffect, useRef, useState } from 'preact/hooks';
import { STEP_BY_ID } from '../core/protocols';
import { getMeasure } from '../core/measures';
import { StepAnalyzer, type AnalysisOutput, type CaptureResult } from '../core/analysis';
import { prepareFrame } from '../core/prepare';
import { VIEW_LABELS } from '../core/quality';
import { captureKey, fmtDeg, sideLabel, type Capture, type Source } from '../core/results';
import { sub, type Vec3 } from '../core/vec';
import { HAND } from '../core/landmarks';
import { useStore } from '../state/store';
import { settingsStore } from '../state/settings';
import { sessionStore, saveCaptures, nextStep, setIndex, go } from '../state/session';
import { engineStore } from '../state/engine';
import { drawOverlay, LEVEL_COLORS } from './overlay';
import { Silhouette } from './Silhouette';
import { beep } from './feedback';

type SourceKind = 'arriere' | 'avant' | 'fichier';

interface FileSource {
  kind: 'video' | 'photo';
  url: string;
  name: string;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

function cameraErrorMessage(e: unknown): string {
  const name = e instanceof DOMException ? e.name : '';
  if (!window.isSecureContext) return 'La caméra exige une connexion sécurisée (https ou localhost).';
  if (name === 'NotAllowedError') return 'Accès à la caméra refusé : autorisez-le dans les réglages du navigateur.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Aucune caméra correspondante sur cet appareil.';
  if (name === 'NotReadableError') return 'Caméra déjà utilisée par une autre application.';
  return `Caméra indisponible (${name || String(e)}).`;
}

export function MeasureScreen() {
  const session = useStore(sessionStore);
  const settings = useStore(settingsStore);
  const engine = useStore(engineStore);
  const bilan = session.bilan!;
  const item = session.queue[session.index];
  const step = STEP_BY_ID[item.stepId];
  const isAffected = item.side === bilan.affectedSide;

  const [source, setSource] = useState<SourceKind>(settings.camera);
  const [file, setFile] = useState<FileSource | null>(null);
  const [fileMirrored, setFileMirrored] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [live, setLive] = useState<AnalysisOutput | null>(null);
  const [fps, setFps] = useState(0);
  const [review, setReview] = useState<Capture[] | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(true);
  const [auto, setAuto] = useState(settings.captureAuto);
  const [wristRef, setWristRef] = useState<Vec3 | null>(null);
  const [primary, setPrimary] = useState(step.primary);
  const [videoState, setVideoState] = useState({ t: 0, d: 0, paused: true });

  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyzerRef = useRef<StepAnalyzer | null>(null);
  const lastHandRef = useRef<Vec3[] | null>(null);

  const isPhoto = source === 'fichier' && file?.kind === 'photo';
  const sourceKind: Source = source === 'fichier' ? (file?.kind === 'photo' ? 'photo' : 'video') : 'camera';
  const mirrored = source === 'fichier' ? fileMirrored : false;
  const displayMirror = source === 'avant';

  // État lu par la boucle d'animation (évite de la recréer à chaque rendu).
  const loop = useRef({ auto, review: false, wristRef, mirrored, displayMirror, isPhoto, lock: false });
  loop.current = { ...loop.current, auto, review: !!review, wristRef, mirrored, displayMirror, isPhoto };

  // ─── Nouvel analyseur à chaque étape / côté / réglage ───
  useEffect(() => {
    analyzerRef.current = new StepAnalyzer(step, {
      smoothing: settings.lissage,
      confidenceThreshold: settings.seuilConfiance,
      stabilityToleranceDeg: settings.toleranceStabilite,
      stabilityWindowMs: settings.dureeStabilite,
      outOfPlaneTolDeg: settings.toleranceHorsPlan,
      viewTol: settings.tolVue,
    });
    analyzerRef.current.setPrimary(primary);
    setLive(null);
  }, [item.stepId, item.side, settings]);

  useEffect(() => {
    setReview(null);
    setPrimary(step.primary);
    setWristRef(null);
    setGuideOpen(true);
    loop.current.lock = false;
  }, [item.stepId, item.side]);

  useEffect(() => {
    analyzerRef.current?.setPrimary(primary);
  }, [primary]);

  // Le guide se replie dès que la vue attendue est obtenue (libère l'écran du téléphone).
  const autoCollapsed = useRef(false);
  useEffect(() => {
    autoCollapsed.current = false;
  }, [item.stepId, item.side]);
  useEffect(() => {
    if (live?.view.ok && !autoCollapsed.current) {
      autoCollapsed.current = true;
      setGuideOpen(false);
    }
  }, [live?.view.ok]);

  // ─── Caméra ───
  useEffect(() => {
    const video = videoRef.current;
    if (!video || source === 'fichier') return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    setCamError(null);
    navigator.mediaDevices
      ?.getUserMedia({
        audio: false,
        video: { facingMode: source === 'avant' ? 'user' : 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        video.srcObject = s;
        video.play().catch(() => undefined);
      })
      .catch((e) => setCamError(cameraErrorMessage(e)));
    if (!navigator.mediaDevices) setCamError(cameraErrorMessage(null));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };
  }, [source]);

  // ─── Vidéo importée ───
  useEffect(() => {
    const video = videoRef.current;
    if (!video || source !== 'fichier' || file?.kind !== 'video') return;
    video.srcObject = null;
    video.src = file.url;
    video.loop = true;
    video.play().catch(() => undefined);
    const upd = () => setVideoState({ t: video.currentTime, d: video.duration || 0, paused: video.paused });
    video.addEventListener('timeupdate', upd);
    video.addEventListener('play', upd);
    video.addEventListener('pause', upd);
    return () => {
      video.removeEventListener('timeupdate', upd);
      video.removeEventListener('play', upd);
      video.removeEventListener('pause', upd);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [source, file]);

  useEffect(() => () => {
    if (file) URL.revokeObjectURL(file.url);
  }, [file]);

  // ─── Capture ───
  const doCapture = (force: boolean) => {
    const an = analyzerRef.current;
    if (!an || loop.current.review || loop.current.lock) return;
    const res = an.capture(force);
    if ('error' in res) {
      if (force) showFlash(`Capture refusée : ${res.error}`);
      return;
    }
    loop.current.lock = true;
    const caps = buildCaptures(res);
    if (!caps.length) {
      loop.current.lock = false;
      showFlash('Aucune valeur exploitable');
      return;
    }
    if (settings.sonCapture) beep();
    navigator.vibrate?.(60);
    setReview(caps);
  };

  const buildCaptures = (res: CaptureResult): Capture[] => {
    const last = analyzerRef.current?.last;
    const ts = new Date().toISOString();
    return step.measures
      .filter((id) => res.values[id] !== null && res.values[id] !== undefined)
      .map((id) => {
        const v = round1(res.values[id]!);
        const notes = [...(last?.measures[id]?.notes ?? [])];
        if (res.confidence[id] < settings.seuilConfiance) notes.push('Confiance faible sur cette articulation');
        if (wristRef && step.allowsZeroRef) notes.push('Zéro de référence (caméra fixe)');
        if (res.forced) notes.push('Capture manuelle avant stabilité complète');
        return {
          measureId: id,
          side: item.side,
          value: v,
          autoValue: v,
          corrected: false,
          confidence: Math.round(res.confidence[id] * 100) / 100,
          view: step.view,
          mode: settings.modeCalcul,
          source: sourceKind,
          forced: res.forced,
          timestamp: ts,
          samples: res.samples.map((s) => ({ t: Math.round(s.t), value: s.values[id], confidence: Math.round((s.confidence[id] ?? 0) * 1000) / 1000 })),
          notes: [...new Set(notes)],
        };
      });
  };
  const captureRef = useRef(doCapture);
  captureRef.current = doCapture;

  const flashTimer = useRef<number | undefined>(undefined);
  const showFlash = (m: string) => {
    setFlash(m);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 3500);
  };

  // ─── Boucle d'analyse ───
  useEffect(() => {
    const eng = engine.engine;
    if (!eng) return;
    let raf = 0;
    let last = 0;
    let frames = 0;
    let fpsT0 = performance.now();
    let ui = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const st = loop.current;
      if (st.review) return;
      const an = analyzerRef.current;
      const canvas = canvasRef.current;
      const src = st.isPhoto ? imgRef.current : videoRef.current;
      if (!an || !canvas || !src) return;
      if (src instanceof HTMLVideoElement && (src.readyState < 2 || !src.videoWidth)) return;
      if (src instanceof HTMLImageElement && (!src.complete || !src.naturalWidth)) return;
      const now = performance.now();
      if (now - last < 28) return;
      last = now;

      const req = an.step.measures.map((id) => getMeasure(id).requires);
      const need = { hand: req.some((r) => r.hand), pose: req.some((r) => r.pose) && !(st.wristRef && an.step.allowsZeroRef) };
      let out: AnalysisOutput;
      let raw;
      try {
        const det = eng.detect(src, need);
        const prep = prepareFrame(det, {
          side: item.side,
          mirrored: st.mirrored,
          mode: settingsStore.get().modeCalcul,
          wristRef: an.step.allowsZeroRef ? st.wristRef : null,
          invertDepth: settingsStore.get().inverserProfondeur,
        });
        lastHandRef.current = prep.frame.hand?.image ?? null;
        out = an.process(prep.frame, now, prep.warnings);
        raw = prep.frame;
      } catch (e) {
        console.error(e);
        return;
      }
      const pm = out.measures[out.primary];
      drawOverlay(canvas, src, {
        hand: raw.hand?.raw ?? null,
        pose: raw.pose?.raw ?? null,
        arc: pm?.arc,
        level: out.level,
        displayMirror: st.displayMirror,
      });
      frames++;
      if (now - fpsT0 >= 1000) {
        setFps(Math.round((frames * 1000) / (now - fpsT0)));
        frames = 0;
        fpsT0 = now;
      }
      if (++ui % 2 === 0) setLive(out);
      if (st.auto && out.stable) captureRef.current(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine.engine, item.side, item.stepId]);

  // ─── Actions ───
  const validate = () => {
    if (!review) return;
    saveCaptures(review.filter((c) => Number.isFinite(c.value)));
    setReview(null);
    loop.current.lock = false;
    analyzerRef.current?.reset();
    nextStep();
  };
  const retake = () => {
    setReview(null);
    loop.current.lock = false;
    analyzerRef.current?.reset();
  };
  const editValue = (id: string, raw: string) => {
    if (!review) return;
    const v = raw.trim() === '' ? NaN : Number(raw.replace(',', '.'));
    setReview(review.map((c) => (c.measureId === id ? { ...c, value: v, corrected: !Number.isFinite(v) || Math.round(v) !== Math.round(c.autoValue ?? NaN) } : c)));
  };
  const setZero = () => {
    const h = lastHandRef.current;
    if (!h) return showFlash('Main non détectée : impossible de définir le zéro');
    const m = sub(h[HAND.MIDDLE_MCP], h[HAND.WRIST]);
    setWristRef({ x: m.x, y: m.y, z: 0 });
    analyzerRef.current?.reset();
    showFlash('Zéro de référence enregistré : ne plus bouger la caméra ni l\'avant-bras');
  };
  const onFile = (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const kind = f.type.startsWith('video') ? 'video' : 'photo';
    setFile({ kind, url: URL.createObjectURL(f), name: f.name });
    setSource('fichier');
    analyzerRef.current?.reset();
  };

  // ─── Rendu ───
  const pm = live?.measures[primary];
  const level = live?.level ?? 'rouge';
  const done = (sid: string, side: string) =>
    STEP_BY_ID[sid].measures.some((m) => bilan.captures[captureKey(m, side as 'G' | 'D')]);
  const existing = step.measures.map((m) => bilan.captures[captureKey(m, item.side)]).filter(Boolean);
  const primaryDef = getMeasure(primary);
  const multi = step.measures.length > 2;
  const engineMsg = engine.status === 'loading' ? engine.message : engine.status === 'error' ? engine.message : null;

  return (
    <main class="page measure">
      <header class="topbar">
        <button class="btn ghost small" onClick={() => go('recap')} aria-label="Récapitulatif">
          ☰ Récap
        </button>
        <select
          class="stepselect"
          value={session.index}
          onChange={(e) => setIndex(Number((e.target as HTMLSelectElement).value))}
          aria-label="Étape"
        >
          {session.queue.map((q, i) => (
            <option value={i}>
              {done(q.stepId, q.side) ? '✓ ' : ''}
              {i + 1}. {STEP_BY_ID[q.stepId].title} — {q.side === bilan.affectedSide ? 'atteint' : 'sain'} ({q.side})
            </option>
          ))}
        </select>
        <span class={`sidechip ${isAffected ? 'affected' : 'healthy'}`}>
          {isAffected ? 'Atteint' : 'Sain'} · {sideLabel(item.side)}
        </span>
      </header>

      <section class={`guide ${guideOpen ? 'open' : ''}`}>
        <button class="guide-toggle" onClick={() => setGuideOpen(!guideOpen)} aria-expanded={guideOpen}>
          <strong>{step.title}</strong>
          <span>{VIEW_LABELS[step.view]} {guideOpen ? '▲' : '▼'}</span>
        </button>
        {guideOpen && (
          <div class="guide-body">
            <div class="sil">
              <Silhouette view={step.view} />
            </div>
            <ul>
              {step.instructions.map((t) => (
                <li>{t}</li>
              ))}
              <li>
                Côté mesuré : <strong>{sideLabel(item.side)}</strong>
                {primaryDef.experimental && <span class="tag exp">expérimental</span>}
              </li>
            </ul>
          </div>
        )}
      </section>

      <section class="stage">
        <video ref={videoRef} playsInline muted class="hidden-src" />
        {isPhoto && file && <img ref={imgRef} src={file.url} alt="" class="hidden-src" />}
        <canvas ref={canvasRef} class="view" />
        {(camError || engineMsg) && <div class="stage-msg">{camError ?? engineMsg}</div>}
        <div class="hud-top">
          <span class="pill" style={{ background: LEVEL_COLORS[level] }}>
            Confiance {live ? Math.round(live.confidence * 100) : 0} %
          </span>
          <span class={`pill ${live?.view.ok ? 'ok' : 'ko'}`}>{live ? (live.view.ok ? '✓ ' : '✗ ') + live.view.message : 'En attente…'}</span>
          <span class="pill fps">{fps} img/s</span>
        </div>
        <div class="hud-value" style={{ borderColor: LEVEL_COLORS[level] }}>
          <small>{primaryDef.short}{primaryDef.experimental ? ' (exp.)' : ''}</small>
          <b>{pm?.value !== null && pm?.value !== undefined ? fmtDeg(pm.value) : '—'}</b>
        </div>
      </section>

      {source === 'fichier' && file?.kind === 'video' && (
        <div class="videoctl">
          <button
            class="btn small"
            onClick={() => {
              const v = videoRef.current;
              if (v) v.paused ? v.play() : v.pause();
            }}
          >
            {videoState.paused ? '▶' : '❚❚'}
          </button>
          <input
            type="range"
            min={0}
            max={videoState.d || 0}
            step={0.01}
            value={videoState.t}
            onInput={(e) => {
              const v = videoRef.current;
              if (v) v.currentTime = Number((e.target as HTMLInputElement).value);
            }}
            aria-label="Position dans la vidéo"
          />
          <span>{videoState.t.toFixed(1)} s</span>
        </div>
      )}

      <div class="messages" aria-live="polite">
        {flash && <p class="flash">{flash}</p>}
        {live?.refusal && !flash && <p class="refusal">{live.refusal}</p>}
        {live?.warnings.map((w) => (
          <p class="warn">{w}</p>
        ))}
        {pm?.notes.map((n) => (
          <p class="note">{n}</p>
        ))}
      </div>

      {multi && (
        <div class="chips">
          {step.measures.map((id) => {
            const m = live?.measures[id];
            const d = getMeasure(id);
            return (
              <button class={`chip ${id === primary ? 'on' : ''} ${m && m.confidence < settings.seuilConfiance ? 'low' : ''}`} onClick={() => setPrimary(id)}>
                <small>{d.short}</small>
                <b>{m?.value !== null && m?.value !== undefined ? fmtDeg(m.value) : '—'}</b>
              </button>
            );
          })}
        </div>
      )}

      {step.allowsZeroRef && (
        <div class="zeroref">
          {wristRef ? (
            <>
              <span>✓ Zéro de référence actif (caméra fixe)</span>
              <button class="btn small ghost" onClick={() => setWristRef(null)}>Effacer</button>
            </>
          ) : (
            <>
              <span>Coude hors champ ? Poignet en position neutre, puis :</span>
              <button class="btn small" onClick={setZero}>Définir le zéro</button>
            </>
          )}
        </div>
      )}

      <section class="controls">
        <div class="seg sources" role="group" aria-label="Source">
          <button class={source === 'arriere' ? 'on' : ''} onClick={() => setSource('arriere')}>Arrière</button>
          <button class={source === 'avant' ? 'on' : ''} onClick={() => setSource('avant')}>Selfie</button>
          <label class={`filebtn ${source === 'fichier' ? 'on' : ''}`}>
            Fichier
            <input type="file" accept="image/*,video/*" onChange={onFile} />
          </label>
        </div>
        {source === 'fichier' && (
          <label class="toggle">
            <input type="checkbox" checked={fileMirrored} onChange={(e) => setFileMirrored((e.target as HTMLInputElement).checked)} />
            Image inversée (selfie enregistré en miroir)
          </label>
        )}
        <div class="capture-row">
          <label class="toggle" title="Capture automatique après 1 s de position stable">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto((e.target as HTMLInputElement).checked)} />
            Auto
          </label>
          <button
            class={`capture ${live?.refusal ? 'refused' : ''}`}
            style={{ '--p': String(live?.stableProgress ?? 0) } as Record<string, string>}
            onClick={() => doCapture(true)}
            aria-label="Capturer la mesure"
          >
            <span>Capturer</span>
          </button>
          <button class="btn ghost small" onClick={() => nextStep()}>
            Passer ›
          </button>
        </div>
        {existing.length > 0 && <p class="hint">Déjà mesuré sur ce côté : {existing.map((c) => `${getMeasure(c!.measureId).short} ${fmtDeg(c!.value)}`).slice(0, 4).join(' · ')}{existing.length > 4 ? '…' : ''} — une nouvelle capture remplacera ces valeurs.</p>}
      </section>

      {review && (
        <div class="sheet" role="dialog" aria-label="Valider la capture">
          <h2>
            {step.title} — {isAffected ? 'atteint' : 'sain'} ({item.side})
          </h2>
          <p class="hint">Valeurs = médiane sur 1 s. Corrigez si besoin ; videz une case pour l'exclure.</p>
          <div class="review-list">
            {review.map((c) => {
              const d = getMeasure(c.measureId);
              return (
                <label class={`review-item ${c.confidence < settings.seuilConfiance ? 'low' : ''}`}>
                  <span class="rl">
                    {d.label}
                    {d.experimental && <span class="tag exp">exp.</span>}
                    {c.corrected && <span class="tag">corrigé</span>}
                    <small>
                      confiance {Math.round(c.confidence * 100)} %{c.notes.length ? ' · ' + c.notes.join(' · ') : ''}
                    </small>
                  </span>
                  <span class="rv">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={Number.isFinite(c.value) ? String(Math.round(c.value)) : ''}
                      onChange={(e) => editValue(c.measureId, (e.target as HTMLInputElement).value)}
                    />
                    °
                  </span>
                </label>
              );
            })}
          </div>
          <div class="row">
            <button class="btn ghost" onClick={retake}>Reprendre</button>
            <button class="btn primary" onClick={validate}>Valider et continuer</button>
          </div>
        </div>
      )}
    </main>
  );
}
