// SPDX-License-Identifier: AGPL-3.0-or-later
import { useLayoutEffect, useRef } from 'react';
import { useT } from '@app/i18n/store';

/** The renderer cannot resume this run; the page remains usable without it. */
export function GraphicsRecovery() {
  const t = useT();
  const reload = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => { reload.current?.focus(); }, []);
  return (
    <div className="herd-modal" role="alertdialog" aria-modal="true"
      aria-labelledby="graphics-lost-title" aria-describedby="graphics-lost-detail"
      onKeyDown={(event) => {
        if (event.key === 'Tab') { event.preventDefault(); reload.current?.focus(); }
      }}>
      <section className="herd-panel">
      <h1 id="graphics-lost-title" className="herd-panel__title">{t('graphics.title')}</h1>
      <p id="graphics-lost-detail">{t('graphics.detail')}</p>
      <button ref={reload} type="button" className="herd-button herd-button--primary"
        onClick={() => window.location.reload()}>{t('graphics.reload')}</button>
      </section>
    </div>
  );
}
