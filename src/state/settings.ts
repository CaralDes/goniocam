/** Réglages persistants (localStorage). Aucune donnée patient ici. */
import { DEFAULT_VIEW_TOL, type ViewTolerances } from '../core/quality';
import type { SmoothingKind } from '../core/filters';
import type { CalcMode } from '../core/types';
import type { Delegate, PoseModel } from '../vision/engine';
import { createStore } from './store';

export interface Etablissement {
  nom: string;
  service: string;
  adresse: string;
  /** Logo en data URL (PNG ou JPEG), optionnel. */
  logo: string | null;
}

export interface Settings {
  etablissement: Etablissement;
  examinateur: string;
  seuilConfiance: number;
  toleranceStabilite: number;
  dureeStabilite: number;
  captureAuto: boolean;
  lissage: SmoothingKind;
  modeCalcul: CalcMode;
  toleranceHorsPlan: number;
  modelePose: PoseModel;
  delegate: Delegate;
  camera: 'arriere' | 'avant';
  normes: Record<string, number>;
  tolVue: ViewTolerances;
  inverserProfondeur: boolean;
  sonCapture: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  etablissement: { nom: 'Centre Hospitalier de Tullins', service: 'Médecine Physique et de Réadaptation — HDJ', adresse: '', logo: null },
  examinateur: '',
  seuilConfiance: 0.6,
  toleranceStabilite: 3,
  dureeStabilite: 1000,
  captureAuto: true,
  lissage: 'oneeuro',
  modeCalcul: '3d',
  toleranceHorsPlan: 20,
  modelePose: 'full',
  delegate: 'GPU',
  camera: 'arriere',
  normes: {},
  tolVue: { ...DEFAULT_VIEW_TOL },
  inverserProfondeur: false,
  sonCapture: true,
};

const KEY = 'goniocam.settings.v1';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const s = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...s,
      etablissement: { ...DEFAULT_SETTINGS.etablissement, ...s.etablissement },
      tolVue: { ...DEFAULT_SETTINGS.tolVue, ...s.tolVue },
      normes: { ...s.normes },
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export const settingsStore = createStore<Settings>(typeof localStorage === 'undefined' ? structuredClone(DEFAULT_SETTINGS) : load());

settingsStore.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* stockage plein ou indisponible : réglages non conservés */
  }
});

export function updateSettings(patch: Partial<Settings>) {
  settingsStore.set({ ...settingsStore.get(), ...patch });
}

export function resetSettings() {
  settingsStore.set(structuredClone(DEFAULT_SETTINGS));
}
