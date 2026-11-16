# Analyse du cahier des charges

Relecture technique avant développement (étape 1 du prompt de lancement). Les décisions prises sans attendre de validation sont signalées **[décision]** : elles sont toutes réversibles.

## 1. Points irréalistes ou à risque

### Précision des mesures par caméra

- **±5° aux doigts : ambitieux.** Les publications sur MediaPipe Hands rapportent des écarts moyens de l'ordre de 5 à 10° aux IPP/IPD par rapport au goniomètre, plus en flexion forte (poing), parce que les phalanges distales se masquent. L'objectif de 5° est plausible pour le coude, l'élévation d'épaule et le poignet dans le plan principal ; pour les doigts il faut l'attendre en vue de profil stricte, doigt par doigt, et l'accepter comme résultat de la validation, pas comme exigence a priori.
- **Occlusion en vue de profil.** En vue radiale, l'index cache le médius, l'annulaire et l'auriculaire : le modèle *estime* leurs positions au lieu de les voir. **[décision]** L'étape « doigts » capture les quatre doigts à la fois (pour tenir les 3 minutes) mais l'écran affiche le doigt principal choisi et la fiche marque D4–D5 comme moins fiables en vue radiale. Recommandation : mesurer D4–D5 en vue ulnaire (même étape, retourner la main).
- **Profondeur (z) de MediaPipe.** Les « world landmarks » 3D ont une profondeur estimée, pas mesurée (caméra monoculaire). Elle est bruitée, surtout pour Pose. **[décision]** Les calculs utilisent la 3D pour les amplitudes quand le mouvement se fait dans le plan de l'image, et les signes (flexion/extension, pronation/supination) sont tirés autant que possible de la géométrie 2D, qui est fiable, ou de la convention z documentée des repères normalisés.
- **Rotation externe d'épaule et pronosupination** : confirmé, ce sont les mesures les plus fragiles. La rotation externe dépend presque entièrement de la profondeur de l'avant-bras ; la pronosupination impose une vue axiale (avant-bras pointé vers la caméra) où la main est vue de bout. Elles sont marquées **expérimental** partout (écran, PDF, CSV).
- **Poignet : la détection Pose exige le haut du corps dans le champ.** Le détecteur BlazePose s'appuie sur la tête et le tronc. En gros plan sur le poignet, il ne trouve pas le coude. **[décision]** Deux références d'avant-bras : (a) Pose (coude → poignet), plan large ; (b) « zéro de référence » : avant-bras posé sur la table, caméra fixe (support), on enregistre la position neutre puis on mesure l'écart du 3e métacarpien. La référence (b) est plus précise en pratique mais impose un téléphone immobile.
- **Pouce.** L'opposition n'est pas mesurable de façon fiable par angles segmentaires ; elle reste en V2 (Kapandji assisté). La MCP et l'IP du pouce se mesurent en vue paume face à la caméra.
- **Hyperextension.** Le signe (flexion positive, hyperextension négative) dépend de l'orientation de la main. Il est calculé à partir du côté mesuré (connu) et de la normale à la paume. À vérifier sur le banc d'essai (critère J2) : si les signes sont inversés sur un appareil donné, un réglage avancé permet d'inverser la convention de profondeur.

### Objectifs de temps

- « Bilan standard en moins de 2 minutes » (épaule + coude + poignet + doigts, bilatéral) : irréaliste avec une capture par mouvement et un changement de vue entre chaque (environ 30 captures). Réaliste : **main complète bilatérale < 3 min** (critère J3, 8 captures) et un protocole d'une seule région en moins de 2 minutes.

### Performance

- 20 images/s sur un smartphone milieu de gamme : atteignable avec HandLandmarker seul (GPU). Avec Pose + Hand simultanés (poignet), compter 12 à 20 images/s. **[décision]** Seuls les modèles nécessaires à l'étape en cours tournent ; un compteur d'images/s est affiché en permanence pour vérifier le critère J1 sur le terrain. Pose « lite » est proposée dans les réglages pour les appareils lents.

### Confidentialité et hors ligne

- Les modèles MediaPipe (`.task`) ne sont **pas** distribués dans le paquet npm : ils sont téléchargés une fois, au moment de l'installation du projet (`npm run models`, depuis le dépôt officiel Google), puis servis par l'app elle-même. Aucun appel réseau à l'exécution.
- Le premier chargement de la PWA pèse environ 35 Mo (runtime WebAssembly 14,7 Mo + modèles). Ensuite tout vient du cache.

## 2. Questions ouvertes (non bloquantes)

1. Le bilan « main » doit-il inclure systématiquement le poignet ? **[décision]** Non : protocoles séparés, combinables en « sélection libre ».
2. Conservation du bilan en MVP : le dossier patient chiffré est en V2. **[décision]** En MVP, le bilan vit en mémoire le temps de la consultation ; l'app prévient avant fermeture si un bilan n'a pas été exporté. Seuls les réglages (en-tête de l'établissement, normes, seuils) sont enregistrés localement.
3. Normes : valeurs du cahier des charges reprises telles quelles ; extensions à 0° par défaut (MCP en hyperextension physiologique variable). Toutes modifiables dans les réglages.
4. Le pourcentage de déficit est calculé par rapport au côté sain. Quand le côté sain vaut 0° (extensions), le pourcentage n'a pas de sens et n'est pas affiché.

## 3. Architecture des modules

```
src/
├── core/            Logique pure, sans DOM ni MediaPipe — testée par Vitest
│   ├── vec.ts         Vecteurs 3D : produit scalaire/vectoriel, projection, angles signés
│   ├── landmarks.ts   Index des repères Hand (21) et Pose (33)
│   ├── angles.ts      Angles articulaires (doigts, pouce, poignet, coude, épaule, pronosupination)
│   ├── quality.ts     Contrôle de la vue, écart au plan de l'image, score de confiance
│   ├── filters.ts     Filtre One Euro, moyenne glissante
│   ├── stability.ts   Détection de position stable 1 s, médiane
│   ├── measures.ts    Catalogue des mesures (lien mouvement → calcul → norme)
│   ├── protocols.ts   Étapes (vue + consignes + mesures) et protocoles
│   ├── analysis.ts    Moteur par image : repères → valeurs filtrées, confiance, alertes
│   └── results.ts     Bilatéralité, déficit en ° et en %
├── vision/engine.ts Chargement local des modèles MediaPipe, détection par image
├── export/          pdf.ts (pdf-lib, A4), csv.ts (récapitulatif + données brutes)
├── state/           settings.ts (réglages, localStorage), session.ts (bilan en cours)
└── ui/              Écrans Preact : accueil, mesure, récapitulatif, réglages ; overlay canvas
```

Flux par image : `caméra/fichier → engine (Hand/Pose) → analysis (angles, filtre, qualité) → stabilité → capture → session → récapitulatif → PDF/CSV`.

## 4. Plan de travail

| Jalon | Contenu | Vérification |
| --- | --- | --- |
| J1 | Noyau `core/` + tests, moteur MediaPipe local, écran de mesure en direct des doigts, compteur d'images/s, CSP | Tests unitaires 0/90/180°, aucune requête réseau après chargement (test navigateur automatisé) |
| J2 | Toutes les mesures du tableau, silhouettes guides, contrôle de la vue, refus de capture | Tests de calcul sur repères synthétiques à angles connus ; banc d'essai réel à faire au CH |
| J3 | Bilatéralité, récapitulatif, correction manuelle, import photo/vidéo, PDF A4, CSV brut, PWA hors ligne | Build, PDF généré et relu, service worker actif, fonctionnement hors ligne |
