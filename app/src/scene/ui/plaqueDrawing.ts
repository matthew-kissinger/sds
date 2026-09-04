// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Heritage Name Plaque drawing routines.
 * Renders an artisan wooden exhibition plaque focused purely on the animal's name,
 * with warm eggshell parchment, sharp serif typography, downward anchor pin,
 * and animated specular gleam sweep.
 */

export const PLAQUE_CANVAS_WIDTH = 1024;
export const PLAQUE_CANVAS_HEIGHT = 320;
export const PLAQUE_ASPECT = PLAQUE_CANVAS_WIDTH / PLAQUE_CANVAS_HEIGHT;

export interface PlaqueRenderOptions {
  readonly name: string;
  readonly isDog?: boolean;
  /** Specular light sweep progress across the plaque (0.0 to 1.2). */
  readonly gleamProgress?: number;
}

export interface PlaqueDimensions {
  readonly width: number;
  readonly height: number;
  readonly aspect: number;
}

/**
 * Draws the Heritage Name Plaque onto the given 2D canvas context at 2x Retina resolution.
 * Returns the effective drawn dimensions for 3D billboard quad aspect scaling.
 */
export function drawHeritagePlaque(
  ctx: CanvasRenderingContext2D,
  options: PlaqueRenderOptions,
): PlaqueDimensions {
  ctx.clearRect(0, 0, PLAQUE_CANVAS_WIDTH, PLAQUE_CANVAS_HEIGHT);

  const { name, isDog, gleamProgress } = options;

  // Measure text width for comfortable, balanced framing at 2x scale
  ctx.font = '700 72px Alice, Georgia, "Times New Roman", serif';
  const nameMetrics = ctx.measureText(name);
  const nameWidth = nameMetrics.width;

  // Flanking space: extra room if Pip has decorative rosette diamonds
  const decorationWidth = isDog ? 96 : 0;
  const paddingX = 48;
  const plaqueWidth = Math.min(
    Math.max(nameWidth + decorationWidth + paddingX * 2, 220),
    PLAQUE_CANVAS_WIDTH - 48,
  );
  const plaqueHeight = 128;

  const x0 = (PLAQUE_CANVAS_WIDTH - plaqueWidth) / 2;
  const y0 = (PLAQUE_CANVAS_HEIGHT - plaqueHeight) / 2 - 12;
  const cornerRadius = 32;

  // 1. Soft atmospheric drop shadow beneath the plaque
  ctx.save();
  ctx.shadowColor = 'rgba(12, 16, 10, 0.45)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = '#221c16';
  ctx.beginPath();
  ctx.roundRect(x0, y0, plaqueWidth, plaqueHeight, cornerRadius);
  ctx.fill();
  ctx.restore();

  // 2. Outer beveled dark walnut frame
  const woodGrad = ctx.createLinearGradient(x0, y0, x0, y0 + plaqueHeight);
  if (isDog) {
    woodGrad.addColorStop(0, '#4a3828');
    woodGrad.addColorStop(1, '#261a10');
  } else {
    woodGrad.addColorStop(0, '#42362b');
    woodGrad.addColorStop(1, '#221c16');
  }
  ctx.fillStyle = woodGrad;
  ctx.beginPath();
  ctx.roundRect(x0, y0, plaqueWidth, plaqueHeight, cornerRadius);
  ctx.fill();

  // 3. Antique burnished gold frame hairline
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = isDog ? '#c89d3e' : '#947c50';
  ctx.stroke();

  // 4. Downward anchor pin / chevron (pointing toward the animal)
  const cx = PLAQUE_CANVAS_WIDTH / 2;
  const pinBaseY = y0 + plaqueHeight;
  const pinTipY = pinBaseY + 22;
  ctx.beginPath();
  ctx.moveTo(cx - 14, pinBaseY - 2);
  ctx.lineTo(cx + 14, pinBaseY - 2);
  ctx.lineTo(cx, pinTipY);
  ctx.closePath();
  ctx.fillStyle = isDog ? '#261a10' : '#221c16';
  ctx.fill();

  // Pin brass dot rivet
  ctx.beginPath();
  ctx.arc(cx, pinTipY - 6, 4, 0, Math.PI * 2);
  ctx.fillStyle = isDog ? '#d8ad44' : '#a88d57';
  ctx.fill();

  // 5. Inner eggshell parchment plate
  const inset = 8;
  const px = x0 + inset;
  const py = y0 + inset;
  const pw = plaqueWidth - inset * 2;
  const ph = plaqueHeight - inset * 2;
  const innerRadius = Math.max(cornerRadius - inset, 8);

  const parchGrad = ctx.createLinearGradient(px, py, px, py + ph);
  parchGrad.addColorStop(0, '#fcfaf5');
  parchGrad.addColorStop(1, '#eee5d2');
  ctx.fillStyle = parchGrad;
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, innerRadius);
  ctx.fill();

  // Debossed inner boundary line
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ded0b6';
  ctx.stroke();

  // 6. Specular gleam / light sweep across parchment
  if (typeof gleamProgress === 'number' && gleamProgress >= 0 && gleamProgress <= 1.2) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, innerRadius);
    ctx.clip();

    const gleamX = px - ph + gleamProgress * (pw + ph * 2);
    const gleamGrad = ctx.createLinearGradient(gleamX - 80, py, gleamX + 80, py + ph);
    gleamGrad.addColorStop(0, 'rgba(255, 255, 255, 0.0)');
    gleamGrad.addColorStop(0.5, isDog ? 'rgba(255, 235, 170, 0.55)' : 'rgba(255, 252, 238, 0.50)');
    gleamGrad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = gleamGrad;
    ctx.fillRect(px, py, pw, ph);
    ctx.restore();
  }

  // 7. Hero Name Typography
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 72px Alice, Georgia, "Times New Roman", serif';

  const centerY = py + ph / 2 + 2;

  if (isDog) {
    // Shepherd's medal: antique gold diamond rosettes flanking the name
    ctx.fillStyle = '#1c140c';
    ctx.fillText(name, cx, centerY);

    const halfName = nameWidth / 2;
    ctx.fillStyle = '#b88934';
    ctx.font = '600 32px Alice, Georgia, serif';
    ctx.fillText('◆', cx - halfName - 32, centerY);
    ctx.fillText('◆', cx + halfName + 32, centerY);
  } else {
    // Pure dark walnut ink
    ctx.fillStyle = '#171914';
    ctx.fillText(name, cx, centerY);
  }

  return {
    width: plaqueWidth,
    height: plaqueHeight + 22,
    aspect: PLAQUE_ASPECT,
  };
}
