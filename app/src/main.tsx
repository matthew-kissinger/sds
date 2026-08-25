// SPDX-License-Identifier: AGPL-3.0-or-later
import { createRoot } from 'react-dom/client';
import { App } from './App';

performance.mark('herd:boot:client');
createRoot(document.getElementById('root')!).render(<App />);
