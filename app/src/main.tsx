// SPDX-License-Identifier: AGPL-3.0-or-later
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startLocale } from './i18n/store';
import { startFunnel } from './funnel/funnel';

performance.mark('herd:boot:client');
const mount = () => {
  createRoot(document.getElementById('root')!).render(<App />);
  // Rendering is scheduled, so this still runs first. Counts must not be able to stop the game.
  try {
    startFunnel();
  } catch {
    // Play on, uncounted.
  }
};
const language = startLocale();
if (language === null) mount();
else void language.then(mount);
