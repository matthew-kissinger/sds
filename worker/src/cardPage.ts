// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { cardDescription, cardTitle, escapeXml, playLabel, type CardFacts } from './cardCopy';

function page(title: string, description: string, image: string, canonical: string, body: string): string {
  const safeTitle = escapeXml(title);
  const safeDescription = escapeXml(description);
  const safeImage = escapeXml(image);
  const safeCanonical = escapeXml(canonical);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<meta name="description" content="${safeDescription}">
<meta property="og:site_name" content="Sheepdog Sim">
<meta property="og:type" content="website">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDescription}">
<meta property="og:url" content="${safeCanonical}">
<meta property="og:image" content="${safeImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDescription}">
<meta name="twitter:image" content="${safeImage}">
<link rel="canonical" href="${safeCanonical}">
<style>
@font-face { font-family: Piazzolla; src: url(/fonts/piazzolla-ui.woff2) format("woff2"); font-weight: 400 700; font-display: swap; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #c9b48a; color: #2c241c; font-family: Piazzolla, Georgia, serif; }
main { width: min(640px, calc(100% - 32px)); display: grid; gap: 16px; }
img { width: 100%; height: auto; border-radius: 18px; background: #87995f; }
p { margin: 0; }
h1 { margin: 0; font-size: 40px; font-weight: 500; letter-spacing: -0.03em; }
a { display: inline-block; margin-top: 8px; padding: 12px 18px; border-radius: 999px; background: #f4ead7; color: #2c241c; text-decoration: none; }
</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>`;
}

export function cardHtml(facts: CardFacts, pageUrl: string, imageUrl: string): string {
  const title = cardTitle(facts);
  const description = cardDescription(facts);
  const body = `<img src="${escapeXml(imageUrl)}" alt="${escapeXml(description)}" width="1200" height="630">
<h1>${escapeXml(title)}</h1>
<p>${escapeXml(facts.name)} · ${facts.sheepCount} sheep</p>
<p>${escapeXml(description)}</p>
<p><a href="/play/${facts.sheepCount}">${escapeXml(playLabel(facts.sheepCount))}</a></p>`;
  return page(title, description, imageUrl, pageUrl, body);
}

export function missingCardHtml(origin: string): string {
  const image = `${origin}/og/sheepdog-sim.png`;
  const body = `<h1>Sheepdog Sim</h1>
<p>This run is not on the board.</p>
<p><a href="/">Play</a></p>`;
  return page('Sheepdog Sim', 'This run is not on the board.', image, `${origin}/`, body);
}

export const CARD_HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-cache',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'",
} as const;
