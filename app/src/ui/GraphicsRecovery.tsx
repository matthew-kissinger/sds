// SPDX-License-Identifier: AGPL-3.0-or-later
import { useLayoutEffect, useRef } from 'react';

/** The renderer cannot resume this run; the page remains usable without it. */
export function GraphicsRecovery() {
  const reload = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => { reload.current?.focus(); }, []);
  return (
    <div className="herd-modal" role="alertdialog" aria-modal="true"
      aria-labelledby="graphics-lost-title" aria-describedby="graphics-lost-detail"
      onKeyDown={(event) => {
        if (event.key === 'Tab') { event.preventDefault(); reload.current?.focus(); }
      }}>
      <section className="herd-panel">
      <h1 id="graphics-lost-title" className="herd-panel__title">Graphics stopped</h1>
      <p id="graphics-lost-detail">The current run cannot continue. Reload to return to the title screen.</p>
      <button ref={reload} type="button" className="herd-button herd-button--primary"
        onClick={() => window.location.reload()}>Reload game</button>
      </section>
    </div>
  );
}
