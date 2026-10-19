// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// The 1200 by 630 picture. The still is a baked frame. The glass and the
// type are drawn for this run. The panel stays inside the center 630-pixel
// square, which is the crop some text apps keep.

import { cardTitle, escapeXml, formatClock, formatOrdinal, type CardFacts } from './cardCopy';

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;
export const SAFE_LEFT = 285;
export const SAFE_RIGHT = 915;

const INK = '#2c241c';
const INK_SOFT = '#625748';
const PAD_X = 18;
const PAD_Y = 14;

export interface PanelBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const CARD_PLATES = [
  { file: '/cards/flank.jpg', side: 'right' },
  { file: '/cards/across.jpg', side: 'right' },
  { file: '/cards/wide.jpg', side: 'left' },
] as const;

export function plateForId(id: number): (typeof CARD_PLATES)[number] {
  const index = ((id % CARD_PLATES.length) + CARD_PLATES.length) % CARD_PLATES.length;
  return CARD_PLATES[index]!;
}

let wasmReady: Promise<void> | null = null;
let wasmOverride: BufferSource | WebAssembly.Module | null = null;

/**
 * Tests pass the wasm bytes here. The worker build imports the module
 * itself, because that wasm's `wbg` imports are supplied by the resvg
 * glue and a bare wasm import does not carry them.
 */
export function useRasterWasm(source: BufferSource | WebAssembly.Module): void {
  wasmOverride = source;
  wasmReady = null;
}

async function ensureRaster(): Promise<void> {
  if (!wasmReady) {
    wasmReady = (async () => {
      const { initWasm } = await import('@resvg/resvg-wasm');
      const source = wasmOverride ?? (await import('./cardWasm')).default;
      try {
        await initWasm(source);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('Already initialized')) throw error;
      }
    })().catch((error: unknown) => {
      wasmReady = null;
      throw error;
    });
  }
  return wasmReady;
}

function fontOptions(font: Uint8Array) {
  return {
    fontBuffers: [font],
    defaultFontFamily: 'Piazzolla',
    sansSerifFamily: 'Piazzolla',
    serifFamily: 'Piazzolla',
  };
}

async function textWidth(text: string, size: number, weight: number, font: Uint8Array): Promise<number> {
  const { Resvg } = await import('@resvg/resvg-wasm');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><text font-family="Piazzolla" font-size="${size}" font-weight="${weight}">${escapeXml(text)}</text></svg>`;
  const probe = new Resvg(svg, { font: fontOptions(font) });
  try {
    return Math.ceil(probe.getBBox()?.width ?? 0);
  } finally {
    probe.free();
  }
}

interface Measured {
  readonly content: number;
  readonly weekOrdinal: number;
  readonly allOrdinal: number;
}

async function measure(facts: CardFacts, font: Uint8Array): Promise<Measured> {
  const [brand, time, who, weekOrdinal, weekWords, allOrdinal, allWords] = await Promise.all([
    textWidth('Sheepdog Sim', 32, 500, font),
    textWidth(formatClock(facts.scoreSeconds), 104, 600, font),
    textWidth(`${facts.name} · ${facts.sheepCount} sheep`, 26, 500, font),
    textWidth(formatOrdinal(facts.weekRank), 52, 600, font),
    textWidth(facts.weekLabel, 28, 500, font),
    textWidth(formatOrdinal(facts.allTimeRank), 52, 600, font),
    textWidth('all-time', 28, 500, font),
  ]);
  return {
    content: Math.max(brand + 46, time, who, weekOrdinal + 16 + weekWords, allOrdinal + 16 + allWords),
    weekOrdinal,
    allOrdinal,
  };
}

function panelBox(width: number, side: 'left' | 'right'): PanelBox {
  const inner = SAFE_RIGHT - SAFE_LEFT - 36;
  const capped = Math.min(Math.max(width + PAD_X * 2 + 12, 280), inner);
  const y = 28;
  const height = 14 + 36 + 96 + 34 + 58 + 58 + 16;
  const x = side === 'right' ? SAFE_RIGHT - 18 - capped : SAFE_LEFT + 18;
  return { x, y, width: capped, height };
}

function icon(x: number, y: number): string {
  const scale = 36 / 32;
  return `<g transform="translate(${x} ${y}) scale(${scale})">
    <rect width="32" height="32" rx="7" fill="#7a9e5f"/>
    <ellipse cx="17" cy="18" rx="9.5" ry="7.5" fill="#f5ecd7"/>
    <circle cx="11.5" cy="13.5" r="3.4" fill="#f5ecd7"/>
    <circle cx="20" cy="12.5" r="3.8" fill="#f5ecd7"/>
    <ellipse cx="8.6" cy="17.5" rx="3.2" ry="2.6" fill="#3b3129"/>
    <circle cx="7.8" cy="16.8" r="0.55" fill="#f5ecd7"/>
  </g>`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 4096) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 4096, bytes.length)));
  }
  return btoa(binary);
}

function rankPair(
  ordinal: string,
  words: string,
  ordinalWidth: number,
  x: number,
  y: number,
  right: boolean,
): string {
  const gap = 16;
  const ordinalX = x;
  const wordsX = right ? x - ordinalWidth - gap : x + ordinalWidth + gap;
  const ordinalAnchor = right ? 'end' : 'start';
  const wordsAnchor = right ? 'end' : 'start';
  return `<text x="${ordinalX}" y="${y}" text-anchor="${ordinalAnchor}" font-family="Piazzolla" font-size="52" font-weight="600" fill="${INK}">${escapeXml(ordinal)}</text>
    <text x="${wordsX}" y="${y}" text-anchor="${wordsAnchor}" font-family="Piazzolla" font-size="28" font-weight="500" fill="${INK_SOFT}">${escapeXml(words)}</text>`;
}

function cardSvg(
  facts: CardFacts,
  plate: Uint8Array,
  box: PanelBox,
  side: 'left' | 'right',
  measured: Measured,
): string {
  const right = side === 'right';
  const anchor = right ? 'end' : 'start';
  const textX = right ? box.x + box.width - PAD_X : box.x + PAD_X;
  const brandX = right ? textX - 46 : textX + 46;
  const iconX = right ? box.x + box.width - PAD_X - 36 : box.x + PAD_X;
  const plateHref = `data:image/jpeg;base64,${bytesToBase64(plate)}`;
  const y0 = box.y;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
    <image href="${plateHref}" x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" preserveAspectRatio="xMidYMid slice"/>
    <rect x="${box.x}" y="${box.y + 8}" width="${box.width}" height="${box.height}" rx="18" fill="rgba(44,36,28,0.18)"/>
    <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="18" fill="rgba(244,234,215,0.8)" stroke="rgba(255,250,240,0.9)" stroke-width="1"/>
    ${icon(iconX, y0 + PAD_Y)}
    <text x="${brandX}" y="${y0 + 40}" text-anchor="${anchor}" font-family="Piazzolla" font-size="32" font-weight="500" fill="${INK}">Sheepdog Sim</text>
    <text x="${textX}" y="${y0 + 132}" text-anchor="${anchor}" font-family="Piazzolla" font-size="104" font-weight="600" fill="${INK}">${escapeXml(formatClock(facts.scoreSeconds))}</text>
    <text x="${textX}" y="${y0 + 168}" text-anchor="${anchor}" font-family="Piazzolla" font-size="26" font-weight="500" fill="${INK}">${escapeXml(`${facts.name} · ${facts.sheepCount} sheep`)}</text>
    ${rankPair(formatOrdinal(facts.weekRank), facts.weekLabel, measured.weekOrdinal, textX, y0 + 226, right)}
    ${rankPair(formatOrdinal(facts.allTimeRank), 'all-time', measured.allOrdinal, textX, y0 + 284, right)}
  </svg>`;
}

export async function renderCardPng(
  facts: CardFacts,
  plate: Uint8Array,
  font: Uint8Array,
  side: 'left' | 'right',
): Promise<{ png: Uint8Array; panel: PanelBox; title: string }> {
  await ensureRaster();
  const { Resvg } = await import('@resvg/resvg-wasm');
  const measured = await measure(facts, font);
  const box = panelBox(measured.content, side);
  const svg = cardSvg(facts, plate, box, side, measured);
  const resvg = new Resvg(svg, {
    font: fontOptions(font),
    fitTo: { mode: 'width', value: CARD_WIDTH },
    textRendering: 2,
    shapeRendering: 2,
  });
  try {
    const image = resvg.render();
    try {
      return { png: image.asPng(), panel: box, title: cardTitle(facts) };
    } finally {
      image.free();
    }
  } finally {
    resvg.free();
  }
}
