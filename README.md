# GonioCam — goniométrie par caméra (membre supérieur et main)

Application web progressive (PWA) qui mesure les amplitudes articulaires de l'épaule, du coude, de l'avant-bras, du poignet et des doigts à partir de la caméra d'un smartphone, d'une tablette ou d'un PC. **Tout le traitement est local** : aucune image, vidéo ni mesure ne quitte l'appareil, aucune requête réseau après le chargement.

> Outil d'aide à la mesure en cours de validation. Le goniomètre manuel reste la référence clinique. Statut réglementaire (MDR 2017/745) à valider avec la DRCI : voir le cahier des charges.

Version **0.4.0** : MVP consultation (jalons J1, J2, J3), publiable en ligne et en application Android. Analyse du cahier des charges, points discutables et architecture : [`docs/ANALYSE.md`](docs/ANALYSE.md).

## Installation

Prérequis : Node.js 20 ou plus récent.

```bash
npm install
npm run models     # UNE FOIS : télécharge les modèles officiels MediaPipe dans public/models/ (connexion requise)
```

`npm run models` récupère `hand_landmarker.task`, `pose_landmarker_full.task` et `pose_landmarker_lite.task` depuis le dépôt officiel Google (`storage.googleapis.com/mediapipe-models`) et écrit leurs empreintes SHA-256 dans `public/models/SHA256SUMS.json`. Ces fichiers sont ensuite servis par l'application elle-même ; ils ne sont pas versionnés dans Git (environ 22 Mo). Si le modèle Pose « full » manque, l'app bascule sur « lite » et le signale.

## Lancer en local

```bash
npm run dev              # http://localhost:5173 — caméra utilisable sur ce poste
HTTPS=1 npm run dev      # https://<ip-du-poste>:5173 — pour tester sur un téléphone du même réseau
```

Les navigateurs n'autorisent la caméra qu'en HTTPS ou sur `localhost`. Avec `HTTPS=1`, un certificat auto-signé est généré : accepter l'avertissement sur le téléphone.

## Construire et déployer

```bash
npm run build            # vérification TypeScript + build dans dist/
npm run preview          # sert dist/ sur http://localhost:4173
```

`dist/` est un site statique (≈ 35 Mo avec le runtime WebAssembly et les modèles, mis en cache par le service worker pour l'usage hors ligne). À déposer sur un serveur interne du CH ou un hébergeur européen, **en HTTPS**. En-têtes recommandés côté serveur (exemple nginx), en complément de la CSP déjà présente dans `index.html` :

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob: mediastream:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'" always;
add_header Permissions-Policy "camera=(self), microphone=(), geolocation=()" always;
add_header Referrer-Policy "no-referrer" always;
add_header X-Content-Type-Options "nosniff" always;
types { application/wasm wasm; }
location = /sw.js { add_header Cache-Control "no-cache"; }
```

## Publication en ligne (GitHub Pages)

Le workflow `.github/workflows/pages.yml` publie le site à chaque push sur `main` : téléchargement des modèles officiels, tests, build sous `/<nom-du-dépôt>/`, déploiement.

1. Dans le dépôt GitHub : *Settings › Pages › Build and deployment › Source* : **GitHub Actions**.
2. Pousser sur `main` (ou lancer le workflow à la main dans l'onglet *Actions*).
3. Le site est servi à `https://<compte>.github.io/<dépôt>/`, en HTTPS. Sur Android ou iPhone, menu du navigateur › *Installer l'application* / *Sur l'écran d'accueil* : elle fonctionne ensuite hors ligne.

GitHub Pages gratuit impose un dépôt **public** (le code est visible, aucune donnée patient n'y transite). L'hébergeur (GitHub, États-Unis) ne reçoit que les requêtes de chargement des fichiers statiques, avec l'adresse IP du visiteur ; aucune image ni mesure. Pour un hébergement européen ou interne, déposer le même dossier `dist/` sur le serveur du CH ou sur vadentia.fr.

## Application Android autonome (APK)

L'application Android embarque le site, le runtime WebAssembly et les modèles (Capacitor) : aucune connexion n'est nécessaire, même au premier lancement.

- **Construire** : onglet *Actions › Application Android (APK) › Run workflow*. L'APK est téléchargeable dans les *artifacts* du run. Un tag `v*` (ex. `git tag v0.4.0 && git push --tags`) crée en plus une *release* GitHub avec l'APK.
- **Installer** : ouvrir l'APK sur le téléphone, autoriser l'installation depuis cette source (Android le demande), puis autoriser la caméra au premier lancement.
- **Signature** : sans configuration, l'APK est signé avec une clé de debug différente à chaque build (il faut désinstaller avant de mettre à jour). Pour des mises à jour transparentes, créer une clé une fois :

  ```bash
  keytool -genkeypair -v -keystore goniocam.keystore -alias goniocam -keyalg RSA -keysize 4096 -validity 10000
  base64 -w0 goniocam.keystore   # à copier dans le secret ANDROID_KEYSTORE_BASE64
  ```

  puis ajouter dans *Settings › Secrets and variables › Actions* : `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`goniocam`), `ANDROID_KEY_PASSWORD`. Conserver la clé hors du dépôt : la perdre empêche toute mise à jour.
- **En local** (Android Studio ou SDK installé) : `npm run android:apk`, ou `npm run android:sync` puis ouvrir `android/` dans Android Studio.

Spécificités Android : les exports PDF/CSV passent par la feuille de partage (Fichiers, Drive, messagerie…) ; le bouton retour navigue dans l'app et la met en arrière-plan depuis l'accueil, sans perdre le bilan en cours ; sauvegarde cloud Android désactivée.

## Tests et vérifications

```bash
npm test                 # 55 tests Vitest : calculs d'angles, qualité, stabilité, chaîne complète, exports
```

Vérifications navigateur (Chrome headless, `playwright-core`, variable `CHROME_PATH` si Chrome n'est pas dans `/usr/bin/google-chrome`) :

```bash
npm run build && npm run preview &
npm run check:browser    # CSP, aucune requête après chargement, hors ligne, parcours jusqu'à la mesure

npm run test:e2e:build && npx vite preview --outDir dist-e2e --port 4174 &
npm run test:e2e         # bilan « main complète » bilatéral avec détections synthétiques, correction, PDF, CSV
```

Le build `--mode e2e` contient un point d'injection de détections synthétiques ; il est éliminé des builds normaux.

## Utilisation

1. **Accueil** : code patient (pseudonyme, jamais le nom), côté atteint, protocole (épaule, coude et avant-bras, poignet, main complète, ou sélection libre).
2. **Mesure** : pour chaque étape, une silhouette guide indique la vue caméra et la position. Le squelette, l'arc et la valeur s'affichent en direct avec un indicateur de confiance (vert, orange, rouge) et le nombre d'images/s. La capture se déclenche automatiquement après 1 s de position stable (valeur = médiane sur cette seconde) ou par le bouton ; elle est **refusée** si la vue ou la confiance est insuffisante. Chaque valeur reste corrigeable avant validation.
3. Toutes les étapes côté atteint, puis côté sain.
4. **Récapitulatif** : tableau bilatéral, déficit en ° et en % (côté sain − côté atteint), correction des valeurs, export **PDF A4**, **CSV des mesures** et **CSV brut** (angle, confiance, horodatage, vue, version, image par image) pour l'analyse statistique.

Sources possibles : caméra arrière (soignant), caméra selfie (patient seul), ou **fichier** photo/vidéo déjà enregistré (option « image inversée » pour un selfie enregistré en miroir).

## Conventions de mesure

- Méthode neutre zéro : flexion positive ; pour les extensions, valeur négative = flessum, positive = hyperextension. Pas de pourcentage de déficit sur les extensions.
- Angles calculés sur les repères 3D (« world landmarks ») par défaut, ou dans le plan de l'image (réglage 2D) avec avertissement si un segment s'écarte de plus de 20° du plan de l'image.
- Épaule : axe du tronc parallèle à la ligne milieu des épaules → milieu des hanches.
- Poignet : avant-bras repéré par Pose (coude → poignet, plan large) ou par un **zéro de référence** (avant-bras posé, caméra fixe) quand le coude est hors champ.
- Pronosupination : vue axiale, angle de la ligne MCP index → MCP auriculaire par rapport à la verticale (pouce en haut = 0°).
- Rotation externe et pronosupination sont marquées **expérimental** partout.

Détail des formules : `src/core/angles.ts` (module pur, commenté). Les tests construisent des mains et des corps synthétiques à angles connus, pour les deux côtés et plusieurs orientations.

## Confidentialité

- MediaPipe `@mediapipe/tasks-vision` est **épinglé en 0.10.35** : les versions 1.2.x envoient des métriques d'usage à Google (`odml.pa.googleapis.com`), ce qui contredit l'exigence « aucune requête réseau ».
- Triple barrière : CSP `connect-src 'self'`, garde réseau dans l'app (toute connexion vers une autre origine est refusée et comptée dans *Réglages › À propos*), modèles et runtime servis localement.
- Aucune image stockée ; le bilan reste en mémoire jusqu'à sa fermeture (l'app prévient si un bilan n'a pas été exporté). Seuls les réglages (en-tête de la fiche, normes, seuils) sont enregistrés dans le navigateur.

## Structure

```
src/core/      calculs purs et testés (vec, angles, quality, filters, stability, measures, protocols, analysis, results, prepare)
src/vision/    chargement local de MediaPipe et détection
src/export/    PDF (pdf-lib) et CSV
src/state/     réglages, bilan en cours, moteur
src/ui/        écrans Preact (accueil, mesure, récapitulatif, réglages), overlay canvas, silhouettes
tests/         Vitest + générateur de repères synthétiques
scripts/       modèles, runtime WebAssembly, vérifications navigateur
docs/          analyse du cahier des charges
```

## Licences tierces

MediaPipe Tasks Vision et modèles MediaPipe : Apache-2.0. pdf-lib : MIT. Preact : MIT. Workbox : MIT.
