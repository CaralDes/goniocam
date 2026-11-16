import { useEffect } from 'preact/hooks';
import { useStore } from '../state/store';
import { sessionStore, hasUnsavedWork } from '../state/session';
import { loadEngine } from '../state/engine';
import { Home } from './Home';
import { MeasureScreen } from './MeasureScreen';
import { Summary } from './Summary';
import { SettingsScreen } from './SettingsScreen';

export function App() {
  const session = useStore(sessionStore);

  useEffect(() => {
    // Les modèles sont chargés dès l'ouverture : plus aucune requête ensuite.
    loadEngine();
    const warn = (e: BeforeUnloadEvent) => {
      if (hasUnsavedWork()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  switch (session.route) {
    case 'mesure':
      return session.bilan ? <MeasureScreen /> : <Home />;
    case 'recap':
      return <Summary />;
    case 'reglages':
      return <SettingsScreen />;
    default:
      return <Home />;
  }
}
