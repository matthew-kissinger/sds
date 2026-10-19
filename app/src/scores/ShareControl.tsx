// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { useState } from 'react';
import { absoluteShareUrl, sendShare } from './share';

/**
 * Share, or the words that replace it after a copy.
 *
 * The system sheet is used where the browser has one. Otherwise the sentence
 * and the absolute URL are copied together. Cancelling the sheet leaves the
 * button. A failed copy leaves it too. There is no toast and no retry prompt.
 */
export function ShareControl({
  title,
  text,
  path,
  compact = false,
}: {
  readonly title: string;
  readonly text: string;
  readonly path: string;
  readonly compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (copied) {
    return <span className={compact ? 'herd-run__share' : 'herd-share-copied'} data-copied="true">Link copied</span>;
  }
  return (
    <button
      type="button"
      className={compact ? 'herd-run__share' : 'herd-button'}
      onClick={() => {
        const url = absoluteShareUrl(path, window.location.origin);
        const nav = navigator as Navigator & {
          share?: (data: { title: string; text: string; url: string }) => Promise<void>;
        };
        void sendShare(
          { title, text, url },
          {
            share: typeof nav.share === 'function' ? (data) => nav.share!(data) : undefined,
            writeText: navigator.clipboard?.writeText
              ? (value) => navigator.clipboard.writeText(value)
              : undefined,
          },
        ).then((outcome) => {
          if (outcome === 'copied') setCopied(true);
        });
      }}
    >
      Share
    </button>
  );
}
