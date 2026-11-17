/**
 * Intégration Android (Capacitor) — chargé uniquement dans le build `--mode android`.
 * Bouton retour : navigation dans l'app au lieu de la fermer (le bilan en mémoire serait perdu).
 */
import { App as CapApp } from '@capacitor/app';
import { sessionStore, go } from './state/session';

export function setupNative() {
  CapApp.addListener('backButton', () => {
    const s = sessionStore.get();
    switch (s.route) {
      case 'reglages':
        go(s.previous === 'reglages' ? 'accueil' : s.previous);
        break;
      case 'mesure':
        go('recap');
        break;
      case 'recap':
        go('accueil');
        break;
      default:
        // Accueil : l'app passe en arrière-plan sans être fermée, le bilan en cours est conservé.
        CapApp.minimizeApp();
    }
  });
}
