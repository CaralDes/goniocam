/**
 * Moteur de vision : MediaPipe Tasks Vision, modèles et runtime WebAssembly servis par l'app.
 * Aucun appel à un CDN : tous les chemins sont relatifs à la base de l'application.
 */
import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { RawDetection, RawHand } from '../core/prepare';

export type PoseModel = 'full' | 'lite';
export type Delegate = 'GPU' | 'CPU';

export interface EngineOptions {
  poseModel: PoseModel;
  delegate: Delegate;
}

export interface EngineInfo {
  delegate: Delegate;
  poseModel: PoseModel;
  warnings: string[];
}

type Source = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

const base = import.meta.env.BASE_URL;

/**
 * Version épinglée : @mediapipe/tasks-vision 0.10.35. Les versions 1.2.x envoient des métriques
 * d'usage à Google (odml.pa.googleapis.com) : incompatible avec l'exigence « aucune requête réseau ».
 * Dans 0.10.x, l'étiquette de latéralité suppose une image en miroir (selfie) : on la convertit ici
 * en côté réel du sujet pour une image non inversée.
 */
const HAND_LABELS_ASSUME_MIRRORED = true;
const swapLabel = (l: string | null) => (l === 'Left' ? 'Right' : l === 'Right' ? 'Left' : l);

export class VisionEngine {
  private lastTs = 0;
  private constructor(
    private hand: HandLandmarker,
    private pose: PoseLandmarker,
    public info: EngineInfo,
  ) {}

  static async create(o: EngineOptions, onProgress?: (msg: string) => void): Promise<VisionEngine> {
    const warnings: string[] = [];
    onProgress?.('Chargement du moteur de vision…');
    const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`);

    const make = async (delegate: Delegate, poseModel: PoseModel) => {
      onProgress?.('Chargement du modèle de la main…');
      const hand = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${base}models/hand_landmarker.task`, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      onProgress?.('Chargement du modèle du corps…');
      try {
        const pose = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: `${base}models/pose_landmarker_${poseModel}.task`, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        return { hand, pose };
      } catch (e) {
        hand.close();
        throw e;
      }
    };

    // Ordre d'essai : réglages demandés, puis repli (modèle léger, puis processeur).
    const attempts: [Delegate, PoseModel][] = [[o.delegate, o.poseModel]];
    if (o.poseModel === 'full') attempts.push([o.delegate, 'lite']);
    if (o.delegate === 'GPU') attempts.push(['CPU', o.poseModel], ['CPU', 'lite']);
    let models: { hand: HandLandmarker; pose: PoseLandmarker } | null = null;
    let delegate = o.delegate;
    let poseModel = o.poseModel;
    let lastError: unknown = null;
    for (const [d, m] of attempts) {
      try {
        models = await make(d, m);
        delegate = d;
        poseModel = m;
        break;
      } catch (e) {
        lastError = e;
      }
    }
    if (!models) throw lastError instanceof Error ? lastError : new Error(String(lastError));
    if (poseModel !== o.poseModel) warnings.push('Modèle du corps « complet » indisponible : modèle « léger » utilisé.');
    if (delegate !== o.delegate) warnings.push('Accélération GPU indisponible : calcul sur le processeur.');
    return new VisionEngine(models.hand, models.pose, { delegate, poseModel, warnings });
  }

  /** Détection sur une image (vidéo en direct, vidéo importée ou photo). */
  detect(src: Source, need: { hand: boolean; pose: boolean }): RawDetection {
    // Build de test de bout en bout uniquement (`vite build --mode e2e`) : détections injectées.
    // Ce bloc est supprimé des builds normaux.
    if (import.meta.env.MODE === 'e2e') {
      const fake = (window as unknown as { __fakeDetection?: RawDetection }).__fakeDetection;
      if (fake) return fake;
    }
    const { width, height } = sourceSize(src);
    // Les horodatages doivent croître strictement pour le mode VIDEO.
    const now = performance.now();
    this.lastTs = now > this.lastTs ? now : this.lastTs + 1;
    const ts = this.lastTs;

    const hands: RawHand[] = [];
    if (need.hand) {
      const r = this.hand.detectForVideo(src, ts);
      r.landmarks.forEach((lm, i) => {
        const cat = r.handedness[i]?.[0];
        hands.push({
          landmarks: lm,
          world: r.worldLandmarks[i] ?? null,
          label: HAND_LABELS_ASSUME_MIRRORED ? swapLabel(cat?.categoryName ?? null) : (cat?.categoryName ?? null),
          score: cat?.score ?? 0.5,
        });
      });
    }
    let pose: RawDetection['pose'] = null;
    if (need.pose) {
      const r = this.pose.detectForVideo(src, ts);
      if (r.landmarks[0]) pose = { landmarks: r.landmarks[0], world: r.worldLandmarks[0] ?? null };
    }
    return { width, height, hands, pose };
  }

  close() {
    this.hand.close();
    this.pose.close();
  }
}

export function sourceSize(src: Source): { width: number; height: number } {
  if (src instanceof HTMLVideoElement) return { width: src.videoWidth, height: src.videoHeight };
  if (src instanceof HTMLImageElement) return { width: src.naturalWidth, height: src.naturalHeight };
  return { width: src.width, height: src.height };
}
