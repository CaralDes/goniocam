/** Étapes de mesure (vue + consignes + mesures) et protocoles. */
import type { ViewKind } from './quality';
import { MEASURE_BY_ID } from './measures';

export interface StepDef {
  id: string;
  title: string;
  view: ViewKind;
  /** Consignes de positionnement, affichées avec la silhouette guide. */
  instructions: string[];
  measures: string[];
  /** Mesure affichée en grand et utilisée pour la stabilité. */
  primary: string;
  /** Le poignet accepte un « zéro de référence » quand l'avant-bras n'est pas détecté. */
  allowsZeroRef?: boolean;
}

const fingerIds = (dir: 'flex' | 'ext') =>
  [2, 3, 4, 5].flatMap((d) => ['mcp', 'ipp', 'ipd'].map((j) => `d${d}_${j}_${dir}`));

export const STEPS: StepDef[] = [
  {
    id: 'epaule_elev',
    title: 'Épaule — élévation antérieure',
    view: 'corps-profil',
    instructions: [
      'Patient debout ou assis, de profil, côté mesuré vers la caméra.',
      'Tête, tronc et bras entiers dans le cadre ; caméra à hauteur d\'épaule.',
      'Élévation maximale active, coude tendu, sans cambrer le dos.',
    ],
    measures: ['epaule_elev'],
    primary: 'epaule_elev',
  },
  {
    id: 'epaule_abd',
    title: 'Épaule — abduction',
    view: 'corps-face',
    instructions: [
      'Patient de face, bras le long du corps, paume vers l\'avant.',
      'Tête et bassin dans le cadre ; caméra à hauteur d\'épaule.',
      'Abduction maximale active dans le plan frontal, sans inclinaison du tronc.',
    ],
    measures: ['epaule_abd'],
    primary: 'epaule_abd',
  },
  {
    id: 'epaule_re',
    title: 'Épaule — rotation externe coude au corps',
    view: 'corps-face',
    instructions: [
      'Patient de face, coude collé au corps et fléchi à 90°, avant-bras dirigé vers la caméra.',
      'Rotation externe maximale active, le coude reste au contact du tronc.',
      'Mesure expérimentale : elle dépend de la profondeur estimée.',
    ],
    measures: ['epaule_re'],
    primary: 'epaule_re',
  },
  {
    id: 'coude_flex',
    title: 'Coude — flexion',
    view: 'corps-profil',
    instructions: [
      'Patient de profil, côté mesuré vers la caméra, épaule, coude et poignet visibles.',
      'Avant-bras en supination ; flexion maximale active.',
    ],
    measures: ['coude_flex'],
    primary: 'coude_flex',
  },
  {
    id: 'coude_ext',
    title: 'Coude — extension',
    view: 'corps-profil',
    instructions: [
      'Patient de profil, bras le long du corps, avant-bras en supination.',
      'Extension maximale active. Un flessum donne une valeur négative.',
    ],
    measures: ['coude_ext'],
    primary: 'coude_ext',
  },
  {
    id: 'pronation',
    title: 'Avant-bras — pronation',
    view: 'main-axiale',
    instructions: [
      'Patient assis face à la caméra, coude au corps fléchi à 90°, avant-bras pointé vers la caméra.',
      'Départ pouce vers le haut, doigts tendus. Pronation maximale (paume vers le sol).',
      'Mesure expérimentale.',
    ],
    measures: ['pronation'],
    primary: 'pronation',
  },
  {
    id: 'supination',
    title: 'Avant-bras — supination',
    view: 'main-axiale',
    instructions: [
      'Même position : coude au corps à 90°, avant-bras pointé vers la caméra.',
      'Départ pouce vers le haut. Supination maximale (paume vers le plafond).',
      'Mesure expérimentale.',
    ],
    measures: ['supination'],
    primary: 'supination',
  },
  {
    id: 'poignet_flex',
    title: 'Poignet — flexion',
    view: 'main-profil',
    instructions: [
      'Avant-bras posé sur la table, main dépassant du bord, vue de profil (bord radial vers la caméra).',
      'Plan large (coude visible) ou caméra fixe avec « zéro de référence » en position neutre.',
      'Flexion palmaire maximale active, doigts relâchés.',
    ],
    measures: ['poignet_flex'],
    primary: 'poignet_flex',
    allowsZeroRef: true,
  },
  {
    id: 'poignet_ext',
    title: 'Poignet — extension',
    view: 'main-profil',
    instructions: [
      'Même installation de profil, main dépassant du bord de la table.',
      'Extension (flexion dorsale) maximale active, doigts relâchés.',
    ],
    measures: ['poignet_ext'],
    primary: 'poignet_ext',
    allowsZeroRef: true,
  },
  {
    id: 'poignet_radiale',
    title: 'Poignet — inclinaison radiale',
    view: 'main-face',
    instructions: [
      'Avant-bras à plat, paume vers la caméra (ou vers la table, caméra au-dessus).',
      'Inclinaison radiale maximale active, sans flexion ni extension.',
    ],
    measures: ['poignet_radiale'],
    primary: 'poignet_radiale',
    allowsZeroRef: true,
  },
  {
    id: 'poignet_ulnaire',
    title: 'Poignet — inclinaison ulnaire',
    view: 'main-face',
    instructions: [
      'Même installation, paume face à la caméra.',
      'Inclinaison ulnaire maximale active.',
    ],
    measures: ['poignet_ulnaire'],
    primary: 'poignet_ulnaire',
    allowsZeroRef: true,
  },
  {
    id: 'doigts_ext',
    title: 'Doigts longs — extension',
    view: 'main-profil',
    instructions: [
      'Main de profil, bord radial vers la caméra (bord ulnaire pour mieux voir D4–D5).',
      'Poignet en position neutre, extension active maximale des doigts.',
      'Une flexion résiduelle (flessum) donne une valeur négative.',
    ],
    measures: fingerIds('ext'),
    primary: 'd2_ipp_ext',
  },
  {
    id: 'doigts_flex',
    title: 'Doigts longs — flexion',
    view: 'main-profil',
    instructions: [
      'Main de profil, même installation.',
      'Enroulement maximal actif des doigts (poing), pouce écarté pour ne pas masquer l\'index.',
    ],
    measures: fingerIds('flex'),
    primary: 'd2_ipp_flex',
  },
  {
    id: 'pouce_ext',
    title: 'Pouce — extension MCP et IP',
    view: 'main-face',
    instructions: [
      'Paume face à la caméra, pouce bien visible, doigts tendus.',
      'Extension active maximale du pouce (MCP et IP).',
    ],
    measures: ['d1_mcp_ext', 'd1_ip_ext'],
    primary: 'd1_ip_ext',
  },
  {
    id: 'pouce_flex',
    title: 'Pouce — flexion MCP et IP',
    view: 'main-face',
    instructions: [
      'Paume face à la caméra.',
      'Flexion active maximale de la MCP puis de l\'IP du pouce, sans opposition.',
    ],
    measures: ['d1_mcp_flex', 'd1_ip_flex'],
    primary: 'd1_ip_flex',
  },
];

export const STEP_BY_ID: Record<string, StepDef> = Object.fromEntries(STEPS.map((s) => [s.id, s]));

export interface ProtocolDef {
  id: string;
  label: string;
  steps: string[];
}

export const PROTOCOLS: ProtocolDef[] = [
  { id: 'epaule', label: 'Épaule', steps: ['epaule_elev', 'epaule_abd', 'epaule_re'] },
  { id: 'coude', label: 'Coude et avant-bras', steps: ['coude_flex', 'coude_ext', 'pronation', 'supination'] },
  { id: 'poignet', label: 'Poignet', steps: ['poignet_flex', 'poignet_ext', 'poignet_radiale', 'poignet_ulnaire'] },
  { id: 'main', label: 'Main complète', steps: ['doigts_ext', 'doigts_flex', 'pouce_ext', 'pouce_flex'] },
  { id: 'libre', label: 'Sélection libre', steps: [] },
];

export const PROTOCOL_BY_ID: Record<string, ProtocolDef> = Object.fromEntries(PROTOCOLS.map((p) => [p.id, p]));

/** Vérifie la cohérence du catalogue (utilisé par les tests). */
export function validateCatalog(): string[] {
  const errors: string[] = [];
  for (const s of STEPS) {
    for (const m of s.measures) if (!MEASURE_BY_ID[m]) errors.push(`${s.id} : mesure inconnue ${m}`);
    if (!s.measures.includes(s.primary)) errors.push(`${s.id} : mesure principale hors liste`);
  }
  for (const p of PROTOCOLS) for (const st of p.steps) if (!STEP_BY_ID[st]) errors.push(`${p.id} : étape inconnue ${st}`);
  return errors;
}
