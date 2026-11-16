/** Chargement du moteur de vision au démarrage (une seule instance). */
import { VisionEngine } from '../vision/engine';
import { createStore } from './store';
import { settingsStore } from './settings';

export interface EngineState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  message: string;
  engine: VisionEngine | null;
  warnings: string[];
}

export const engineStore = createStore<EngineState>({ status: 'idle', message: '', engine: null, warnings: [] });

let loading: Promise<void> | null = null;

export function loadEngine(force = false): Promise<void> {
  if (loading && !force) return loading;
  const prev = engineStore.get().engine;
  if (force && prev) prev.close();
  const s = settingsStore.get();
  engineStore.set({ status: 'loading', message: 'Chargement…', engine: null, warnings: [] });
  loading = VisionEngine.create({ poseModel: s.modelePose, delegate: s.delegate }, (message) =>
    engineStore.set({ ...engineStore.get(), message }),
  )
    .then((engine) => {
      engineStore.set({ status: 'ready', message: 'Prêt', engine, warnings: engine.info.warnings });
    })
    .catch((e: unknown) => {
      console.error(e);
      engineStore.set({
        status: 'error',
        message: `Impossible de charger les modèles (${e instanceof Error ? e.message : String(e)}). Vérifiez que « npm run models » a été lancé avant le build.`,
        engine: null,
        warnings: [],
      });
      loading = null;
    });
  return loading;
}
