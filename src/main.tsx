import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { notify } from './ui/notify.ts';

createRoot(document.getElementById('root')!).render(<App />);

// Offline support (production builds only: the dev server must never be cached)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch((err) => console.warn('Service worker não registrado:', err));
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // First install takes control silently; later ones mean a new version was deployed
      if (hadController) notify.info('Nova versão do Marni instalada. Recarregue a página para usar.');
    });
  });
}
