// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from 'react';
import { LOCALES, localeInfo, type LocaleCode } from '@app/i18n/resolve';
import { chooseLocale, declineOffer, useI18nStore, useLocale, useT } from '@app/i18n/store';
import { trackFunnel } from '@app/funnel/funnel';
import { useGameStore } from '@app/state/store';

/**
 * Every language written in its own script, because a reader who cannot read the
 * current language still has to be able to find their own.
 */
function LanguageSelect({ via, className }: { readonly via: 'title' | 'settings'; readonly className?: string }) {
  const t = useT();
  const locale = useLocale();
  return (
    <select
      className={`herd-language-select${className ? ` ${className}` : ''}`}
      aria-label={t('settings.language')}
      value={locale}
      onChange={(event) => {
        const to = event.target.value as LocaleCode;
        void chooseLocale(to).then((chosen) => {
          if (chosen) trackFunnel('language_chosen', { from: locale, to, via });
        });
      }}
    >
      {LOCALES.map(({ code, nativeName }) => (
        <option key={code} value={code} lang={code}>{nativeName}</option>
      ))}
    </select>
  );
}

/** On the title screen, with the other tools. The drawn globe is the sign for it in any script. */
export function TitleLanguagePicker() {
  const t = useT();
  const { nativeName } = localeInfo(useLocale());
  const failed = useI18nStore((state) => state.loadFailed);
  return (
    <>
      <span className="herd-language-picker">
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <g fill="none" stroke="currentColor" strokeWidth="1.2">
            <circle cx="8" cy="8" r="6.4" />
            <ellipse cx="8" cy="8" rx="2.9" ry="6.4" />
            <path d="M1.8 5.8h12.4M1.8 10.2h12.4" />
          </g>
        </svg>
        <span aria-hidden="true">{nativeName}</span>
        <LanguageSelect via="title" />
      </span>
      {failed ? <p className="herd-language-failed" role="status">{t('settings.languageFailed')}</p> : null}
    </>
  );
}

export function LanguageSetting() {
  const t = useT();
  const locale = useLocale();
  const failed = useI18nStore((state) => state.loadFailed);
  return (
    <div className="herd-setting">
      <span className="herd-setting__label">{t('settings.language')}</span>
      <LanguageSelect via="settings" className="herd-select" />
      {failed ? <span className="herd-setting__label" role="status">{t('settings.languageFailed')}</span> : null}
      {localeInfo(locale).reviewed ? null : (
        <span className="herd-setting__label">
          {t('settings.languageUnreviewed')}{' '}
          <a href="https://github.com/matthew-kissinger/sds/issues" target="_blank" rel="noreferrer">
            {t('settings.languageReport')}
          </a>
        </span>
      )}
    </div>
  );
}

/** The title remounts when a panel closes. The offer counts once per page load. */
let offerCounted = false;

/**
 * One small line under Play, in the offered language, for a player whose browser
 * is in a language the game has and who has made no choice. Ignoring it costs
 * nothing, and a player who turns it down does not see it again.
 *
 * It sits in the card's flow, so appearing moves Play. Once Play can be pressed, that
 * could put a different button under a finger on its way there, so an offer arriving
 * after then waits for the next time the title is drawn or the next load.
 */
export function LanguageOfferLine() {
  const offer = useI18nStore((state) => state.offer);
  const sceneReady = useGameStore((state) => state.sceneReady);
  const [admitted, setAdmitted] = useState(() => offer !== null);
  if (!admitted && offer !== null && !sceneReady) setAdmitted(true);
  const offered = admitted ? offer?.code : undefined;
  useEffect(() => {
    if (offered === undefined || offerCounted) return;
    offerCounted = true;
    trackFunnel('language_offered', { offered });
  }, [offered]);
  if (offer === null || !admitted) return null;
  return (
    <div className="herd-language-offer" lang={offer.code} role="group" aria-label={offer.prompt}>
      <span>{offer.prompt}</span>
      <button
        type="button"
        className="herd-text-button"
        onClick={() => {
          void chooseLocale(offer.code).then((chosen) => {
            if (chosen) trackFunnel('language_chosen', { from: 'en', to: offer.code, via: 'offer' });
          });
        }}
      >
        {offer.accept}
      </button>
      <button
        type="button"
        className="herd-text-button"
        onClick={() => {
          trackFunnel('language_declined', { offered: offer.code });
          declineOffer();
        }}
      >
        {offer.decline}
      </button>
    </div>
  );
}
