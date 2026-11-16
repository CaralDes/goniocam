/** Bilan en cours et navigation. En mémoire uniquement (MVP) : rien n'est écrit sur le disque. */
import type { Side } from '../core/types';
import { captureKey, otherSide, type Bilan, type Capture } from '../core/results';
import { STEP_BY_ID } from '../core/protocols';
import { createStore } from './store';

export type Route = 'accueil' | 'mesure' | 'recap' | 'reglages';

export interface QueueItem {
  stepId: string;
  side: Side;
}

export interface SessionState {
  route: Route;
  /** Écran à rouvrir en quittant les réglages. */
  previous: Route;
  bilan: Bilan | null;
  queue: QueueItem[];
  index: number;
  exported: boolean;
}

export const sessionStore = createStore<SessionState>({
  route: 'accueil',
  previous: 'accueil',
  bilan: null,
  queue: [],
  index: 0,
  exported: false,
});

const patch = (p: Partial<SessionState>) => sessionStore.set({ ...sessionStore.get(), ...p });

export function go(route: Route) {
  const s = sessionStore.get();
  patch({ route, previous: route === 'reglages' ? s.route : s.previous });
}

/** Ordre de mesure : toutes les étapes côté atteint, puis côté sain. */
export function buildQueue(steps: string[], affected: Side): QueueItem[] {
  return [affected, otherSide(affected)].flatMap((side) => steps.map((stepId) => ({ stepId, side })));
}

export function startBilan(b: Omit<Bilan, 'captures'>) {
  patch({
    bilan: { ...b, captures: {} },
    queue: buildQueue(b.steps, b.affectedSide),
    index: 0,
    route: 'mesure',
    exported: false,
  });
}

export function setIndex(index: number) {
  const s = sessionStore.get();
  patch({ index: Math.max(0, Math.min(index, s.queue.length - 1)), route: 'mesure' });
}

export function saveCaptures(captures: Capture[]) {
  const s = sessionStore.get();
  if (!s.bilan) return;
  const next = { ...s.bilan.captures };
  for (const c of captures) next[captureKey(c.measureId, c.side)] = c;
  patch({ bilan: { ...s.bilan, captures: next }, exported: false });
}

export function editCapture(measureId: string, side: Side, value: number) {
  const s = sessionStore.get();
  if (!s.bilan) return;
  const k = captureKey(measureId, side);
  const c = s.bilan.captures[k];
  if (!c) return;
  const corrected = c.autoValue === null || Math.round(c.autoValue) !== Math.round(value);
  patch({ bilan: { ...s.bilan, captures: { ...s.bilan.captures, [k]: { ...c, value, corrected } } }, exported: false });
}

export function deleteCapture(measureId: string, side: Side) {
  const s = sessionStore.get();
  if (!s.bilan) return;
  const next = { ...s.bilan.captures };
  delete next[captureKey(measureId, side)];
  patch({ bilan: { ...s.bilan, captures: next }, exported: false });
}

/** Passe à la prochaine étape sans capture ; va au récapitulatif à la fin. */
export function nextStep() {
  const s = sessionStore.get();
  if (s.index + 1 >= s.queue.length) patch({ route: 'recap' });
  else patch({ index: s.index + 1 });
}

export function markExported() {
  patch({ exported: true });
}

export function endBilan() {
  patch({ bilan: null, queue: [], index: 0, route: 'accueil', exported: false });
}

/** Mesures couvertes par le bilan (toutes les mesures de toutes les étapes). */
export function bilanMeasureIds(b: Bilan): string[] {
  return b.steps.flatMap((id) => STEP_BY_ID[id]?.measures ?? []);
}

export const hasUnsavedWork = () => {
  const s = sessionStore.get();
  return !!s.bilan && Object.keys(s.bilan.captures).length > 0 && !s.exported;
};
