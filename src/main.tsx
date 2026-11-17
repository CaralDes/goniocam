import './netguard';
import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/App';
import './styles.css';

render(<App />, document.getElementById('app')!);

if (import.meta.env.PROD && import.meta.env.MODE !== 'android') registerSW({ immediate: true });
if (import.meta.env.MODE === 'android') import('./native').then((m) => m.setupNative());
