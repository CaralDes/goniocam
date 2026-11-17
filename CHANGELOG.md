# Journal des changements

## 0.4.0 — Distribution : site en ligne et application Android (17/11/2026)

- Publication automatique sur GitHub Pages (workflow Actions : modèles officiels, tests, build, déploiement). Chemin de base configurable (`BASE`).
- Application Android autonome (Capacitor 8) : modèles et runtime embarqués, permission caméra, exports PDF/CSV par la feuille de partage, bouton retour géré, sauvegarde cloud désactivée, icônes et écran de démarrage.
- Workflow de construction de l'APK (debug, ou release signée via les secrets du dépôt), release GitHub sur tag `v*`.

## 0.3.0 — J3 : MVP consultation (16/11/2026)

- Bilan bilatéral : toutes les étapes côté atteint puis côté sain, navigation libre entre étapes.
- Récapitulatif : tableau par région, déficit en ° et en % du côté sain, correction et suppression des valeurs.
- Export PDF A4 local (en-tête et logo de l'établissement, code patient, tableau bilatéral, mention de la méthode et de la version).
- Export CSV des mesures et CSV brut image par image (format français, lisible par Excel et `read.csv2`).
- Import de photo ou de vidéo, option « image inversée ».
- PWA hors ligne : runtime WebAssembly et modèles précachés par le service worker.
- Confidentialité : MediaPipe épinglé en 0.10.35 (les versions 1.2.x envoient des métriques à Google), garde réseau applicative, CSP stricte injectée au build.
- Vérifications automatisées : navigateur headless (aucune requête après chargement, hors ligne, CSP) et parcours de bout en bout avec détections synthétiques.

Critères J3 : bilan « main complète » bilatéral = 8 captures (environ 12 s de capture pure en test automatisé ; le temps réel dépend du positionnement) ; PDF A4 conforme au modèle du cahier des charges.

## 0.2.0 — J2 : membre supérieur complet

- Toutes les mesures du tableau du cahier des charges : épaule (élévation antérieure, abduction, rotation externe expérimentale), coude (flexion, extension), avant-bras (pronation, supination expérimentales), poignet (flexion, extension, inclinaisons), doigts longs (MCP, IPP, IPD), pouce (MCP, IP).
- Silhouettes guides et consignes par étape.
- Contrôle de la vue (profil, face, paume, axiale) et refus de capture si vue ou confiance insuffisante.
- Poignet : référence avant-bras par Pose, ou « zéro de référence » en caméra fixe.
- Réglages : normes, seuils, tolérances de vue, lissage, mode 2D/3D, modèle Pose, GPU/CPU.

Critère J2 « erreur ≤ 5° sur banc d'essai » : vérifié sur repères synthétiques (erreur < 0,5°) ; **le banc d'essai physique reste à faire** (gabarit 0/30/60/90°).

## 0.1.0 — J1 : prototype doigts

- Module de calcul pur (`src/core/`) : vecteurs, angles signés, projection sur un plan, filtre One Euro, stabilité 1 s et médiane, score de confiance ; tests Vitest (cas 0, 90, 180°).
- Chargement local de MediaPipe Hand et Pose, mesure en direct MCP/IPP/IPD en vue de profil, compteur d'images/s.

Critère J1 « aucune requête réseau après chargement » : vérifié automatiquement. Critère « ≥ 20 images/s sur smartphone milieu de gamme » : à mesurer sur l'appareil cible (compteur affiché en permanence) ; 15 à 31 images/s mesurés en headless sans GPU.
