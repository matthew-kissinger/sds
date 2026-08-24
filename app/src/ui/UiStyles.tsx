// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { uiTokenVariables } from './tokens';

const CSS = `
:root { ${uiTokenVariables()} }
* { box-sizing: border-box; }
html, body, #root { margin: 0; width: 100%; height: 100%; overflow: hidden; }
body { background: var(--herd-paper-solid); color: var(--herd-ink); font-family: var(--herd-font); }
button, select, input { font: inherit; color: inherit; }
canvas { display: block; touch-action: none; }
.herd-app { position: relative; width: 100%; height: 100%; isolation: isolate; }
.herd-button, .herd-icon-button, .herd-size, .herd-select {
  min-height: var(--herd-target); border: 1px solid var(--herd-line); color: var(--herd-ink);
  background: var(--herd-paper-glass); transition: transform var(--herd-quick) var(--herd-ease),
  background var(--herd-normal) var(--herd-ease), border-color var(--herd-normal) var(--herd-ease),
  opacity var(--herd-normal) var(--herd-ease); -webkit-tap-highlight-color: transparent;
}
.herd-button { min-width: 168px; padding: 13px 28px; border-radius: var(--herd-round); letter-spacing: var(--herd-track); cursor: pointer; }
.herd-button--primary { background: rgba(244,234,215,.94); border-color: var(--herd-line-strong); font-size: 20px; }
.herd-button--quiet { min-width: 0; padding: 10px 18px; background: var(--herd-paper-quiet); }
.herd-icon-button { width: var(--herd-target); min-width: var(--herd-target); padding: 0; border-radius: var(--herd-round); cursor: pointer; }
.herd-button:hover, .herd-icon-button:hover, .herd-size:hover, .herd-select:hover { background: var(--herd-paper); border-color: var(--herd-line-strong); }
.herd-button:active, .herd-icon-button:active, .herd-size:active { transform: translateY(1px) scale(.98); }
.herd-button:focus-visible, .herd-icon-button:focus-visible, .herd-size:focus-visible, .herd-select:focus-visible, .herd-toggle input:focus-visible + span {
  outline: 3px solid rgba(47,105,183,.55); outline-offset: 3px;
}
.herd-button:disabled, .herd-size:disabled { opacity: .46; cursor: default; transform: none; }
.herd-boot { position: fixed; inset: 0; z-index: var(--herd-z-boot); display: grid; place-items: center; padding: max(var(--herd-s5), env(safe-area-inset-top)) max(var(--herd-s5), env(safe-area-inset-right)) max(var(--herd-s5), env(safe-area-inset-bottom)) max(var(--herd-s5), env(safe-area-inset-left)); pointer-events: none; }
.herd-boot__wash { position: absolute; inset: 0; background: var(--herd-paper-solid); opacity: 1; transition: opacity var(--herd-slow) var(--herd-ease); }
.herd-boot[data-ready=true] .herd-boot__wash { opacity: 0; }
.herd-title-card { position: relative; display: flex; flex-direction: column; align-items: center; gap: var(--herd-s6); max-width: min(92vw, 660px); opacity: 0; transform: translateY(10px); pointer-events: none; text-align: center; text-shadow: 0 2px 18px rgba(244,234,215,.78); transition: opacity var(--herd-slow) var(--herd-ease), transform var(--herd-slow) var(--herd-ease); }
.herd-boot[data-ready=true] .herd-title-card { opacity: 1; transform: none; pointer-events: auto; }
.herd-boot[data-leaving=true] .herd-title-card { opacity: 0; transform: translateY(-8px); pointer-events: none; }
.herd-title-lockup { display: grid; justify-items: center; gap: var(--herd-s3); }
.herd-title { margin: 0; font-size: clamp(44px, 8.5vw, 88px); font-weight: 400; line-height: 1; letter-spacing: .035em; white-space: nowrap; }
.herd-kicker { margin: 0; padding: 5px 10px; border-radius: var(--herd-round); color: var(--herd-ink); background: rgba(244,234,215,.38); font-size: var(--herd-small); letter-spacing: var(--herd-track-wide); text-shadow: 0 1px 10px rgba(244,234,215,.92); text-transform: uppercase; }
.herd-size-row { display: flex; gap: var(--herd-s3); padding: var(--herd-s2); border-radius: var(--herd-round); background: rgba(244,234,215,.28); }
.herd-size { min-width: 68px; padding: 8px 15px; border-radius: var(--herd-round); cursor: pointer; font-variant-numeric: tabular-nums; }
.herd-size[aria-pressed=true] { background: rgba(116,90,58,.2); border-color: var(--herd-line-strong); }
.herd-title-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: var(--herd-s3); }
.herd-identity { min-height: 26px; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: var(--herd-s2); color: var(--herd-ink-soft); font-size: var(--herd-small); text-shadow: 0 1px 10px var(--herd-paper); }
.herd-identity strong { color: var(--herd-ink); font-weight: 600; }
.herd-text-button { min-width: var(--herd-target); min-height: var(--herd-target); border: 0; padding: 6px 8px; color: var(--herd-ink); background: transparent; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.herd-text-button:focus-visible, .herd-name-input:focus-visible { outline: 3px solid rgba(47,105,183,.55); outline-offset: 2px; }
.herd-bark-button:focus-visible, .herd-camera-button:focus-visible { outline: 3px solid rgba(47,105,183,.55); outline-offset: 3px; }
.herd-text-button:disabled { opacity: .5; cursor: default; }
.herd-identity-editor { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: var(--herd-s1); max-width: min(92vw, 430px); }
.herd-name-input { width: min(220px, 54vw); min-height: var(--herd-target); border: 1px solid var(--herd-line); border-radius: var(--herd-round); padding: 9px 14px; background: var(--herd-paper-glass); }
.herd-identity-message { flex-basis: 100%; color: var(--herd-ink-soft); font-size: var(--herd-small); }
.herd-visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.herd-hud { position: fixed; inset: 0; z-index: var(--herd-z-hud); pointer-events: none; }
.herd-progress { --herd-progress-angle: 0deg; position: absolute; top: max(var(--herd-s5), env(safe-area-inset-top)); left: max(var(--herd-s5), env(safe-area-inset-left)); width: 74px; height: 74px; display: grid; place-items: center; border-radius: 50%; background: conic-gradient(var(--herd-gold) var(--herd-progress-angle), rgba(244,234,215,.34) 0); filter: drop-shadow(0 3px 12px var(--herd-shadow)); }
.herd-progress::before { content: ''; position: absolute; inset: 5px; border-radius: 50%; background: var(--herd-paper-glass); border: 1px solid var(--herd-line); }
.herd-progress__content { position: relative; display: grid; justify-items: center; line-height: 1; }
.herd-progress__icon { width: 25px; height: 20px; color: var(--herd-ink-soft); }
.herd-progress__count { margin-top: 2px; min-width: 48px; font-size: 13px; font-variant-numeric: tabular-nums; letter-spacing: .04em; text-align: center; }
.herd-timer { position: absolute; top: max(100px, calc(env(safe-area-inset-top) + 98px)); left: max(var(--herd-s5), env(safe-area-inset-left)); min-width: 82px; font-size: 15px; font-variant-numeric: tabular-nums; letter-spacing: var(--herd-track); text-shadow: 0 1px 10px var(--herd-paper); }
.herd-pause-button { position: absolute; top: max(var(--herd-s5), env(safe-area-inset-top)); right: max(var(--herd-s5), env(safe-area-inset-right)); pointer-events: auto; }
.herd-modal { position: fixed; inset: 0; z-index: var(--herd-z-modal); display: grid; place-items: center; padding: max(var(--herd-s5), env(safe-area-inset-top)) max(var(--herd-s5), env(safe-area-inset-right)) max(var(--herd-s5), env(safe-area-inset-bottom)) max(var(--herd-s5), env(safe-area-inset-left)); background: rgba(64,48,31,.14); backdrop-filter: blur(5px); pointer-events: auto; }
.herd-panel { width: min(92vw, 430px); max-height: min(88vh, 720px); overflow: auto; padding: var(--herd-s7); border: 1px solid var(--herd-line); border-radius: var(--herd-panel); background: var(--herd-paper-glass); box-shadow: 0 18px 70px var(--herd-shadow); }
.herd-panel--completion { text-align: center; overflow: visible; }
.herd-panel__header { display: flex; align-items: center; justify-content: space-between; gap: var(--herd-s4); margin-bottom: var(--herd-s6); }
.herd-panel__title { margin: 0; font-size: 28px; font-weight: 400; letter-spacing: var(--herd-track); }
.herd-panel__kicker { margin: 0 0 var(--herd-s3); color: var(--herd-ink-soft); font-size: var(--herd-small); letter-spacing: var(--herd-track-wide); text-transform: uppercase; }
.herd-completion-time { margin: 0 0 var(--herd-s4); font-size: var(--herd-display); font-weight: 400; line-height: 1; font-variant-numeric: tabular-nums; }
.herd-best { min-height: 24px; margin: 0 0 var(--herd-s6); color: var(--herd-ink-soft); font-variant-numeric: tabular-nums; }
.herd-online-times { margin: calc(var(--herd-s4) * -1) 0 var(--herd-s5); color: var(--herd-ink-soft); font-size: var(--herd-small); }
.herd-online-times p { margin: 0 0 var(--herd-s3); }
.herd-online-times ol { width: 100%; display: grid; gap: var(--herd-s1); margin: 0; padding: var(--herd-s3) 0 0; border-top: 1px solid var(--herd-line); list-style: none; }
.herd-online-times li { display: flex; justify-content: space-between; gap: var(--herd-s4); font-variant-numeric: tabular-nums; text-align: left; }
.herd-board-panel { width: min(92vw, 520px); }
.herd-board-tabs { display: flex; justify-content: center; gap: var(--herd-s3); margin-bottom: var(--herd-s4); }
.herd-board-caption { margin: 0 0 var(--herd-s4); color: var(--herd-ink-soft); text-align: center; }
.herd-board-message { min-height: 120px; display: grid; place-items: center; margin: 0; color: var(--herd-ink-soft); text-align: center; }
.herd-board-list { display: grid; gap: var(--herd-s2); margin: 0; padding: var(--herd-s4) 0 0; border-top: 1px solid var(--herd-line); list-style: none; }
.herd-board-list li { min-height: 34px; display: flex; align-items: center; justify-content: space-between; gap: var(--herd-s4); font-variant-numeric: tabular-nums; }
.herd-board-rank { color: var(--herd-ink-soft); }
.herd-panel-actions { display: flex; flex-direction: column; align-items: stretch; gap: var(--herd-s3); margin-top: var(--herd-s5); }
.herd-settings-list { display: grid; gap: var(--herd-s5); }
.herd-setting { display: grid; gap: var(--herd-s2); }
.herd-setting__label { color: var(--herd-ink-soft); font-size: var(--herd-small); letter-spacing: .05em; }
.herd-select { width: 100%; padding: 10px 40px 10px 13px; border-radius: var(--herd-control); background-color: rgba(244,234,215,.76); }
.herd-toggle { min-height: var(--herd-target); display: flex; align-items: center; justify-content: space-between; gap: var(--herd-s4); cursor: pointer; }
.herd-toggle input { position: absolute; opacity: 0; pointer-events: none; }
.herd-toggle__track { width: 48px; height: 28px; padding: 3px; flex: 0 0 auto; border: 1px solid var(--herd-line); border-radius: var(--herd-round); background: rgba(98,87,72,.18); transition: background var(--herd-normal) var(--herd-ease); }
.herd-toggle__knob { display: block; width: 20px; height: 20px; border-radius: 50%; background: var(--herd-paper); box-shadow: 0 1px 5px var(--herd-shadow); transition: transform var(--herd-normal) var(--herd-ease); }
.herd-toggle input:checked + .herd-toggle__track { background: var(--herd-sage); }
.herd-toggle input:checked + .herd-toggle__track .herd-toggle__knob { transform: translateX(20px); }
.herd-bindings { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: var(--herd-s3); }
.herd-binding { display: grid; gap: var(--herd-s1); }
.herd-binding .herd-select { min-width: 0; }
.herd-audio-levels { display: grid; gap: var(--herd-s2); }
.herd-audio-level { min-height: var(--herd-target); display: grid; grid-template-columns: 92px 1fr; align-items: center; gap: var(--herd-s3); color: var(--herd-ink-soft); font-size: var(--herd-small); }
.herd-audio-level input { width: 100%; min-height: var(--herd-target); accent-color: var(--herd-sage); }
.herd-legal { display: grid; gap: var(--herd-s2); padding-top: var(--herd-s4); border-top: 1px solid var(--herd-line); color: var(--herd-ink-soft); font-size: var(--herd-small); line-height: 1.45; }
.herd-legal a { color: var(--herd-ink); text-underline-offset: 3px; }
.herd-legal a:focus-visible { outline: 3px solid rgba(47,105,183,.55); outline-offset: 3px; }
.herd-touch-zone { position: fixed; inset: 0 50% 0 0; z-index: var(--herd-z-controls); touch-action: none; }
.herd-touch-ring { position: fixed; width: calc(var(--herd-stick-radius) * 2); height: calc(var(--herd-stick-radius) * 2); margin: calc(var(--herd-stick-radius) * -1) 0 0 calc(var(--herd-stick-radius) * -1); border: 1px solid var(--herd-line); border-radius: 50%; background: rgba(244,234,215,.18); opacity: 0; pointer-events: none; transition: opacity var(--herd-quick) var(--herd-ease), border-color var(--herd-quick) var(--herd-ease); }
.herd-touch-ring[data-sprinting=true] { border-color: var(--herd-line-strong); }
.herd-touch-knob { position: absolute; left: 50%; top: 50%; width: var(--herd-target); height: var(--herd-target); margin: calc(var(--herd-target) / -2); border: 1px solid var(--herd-line); border-radius: 50%; background: var(--herd-paper-quiet); }
.herd-bark-button { position: fixed; right: max(var(--herd-s6), env(safe-area-inset-right)); bottom: max(var(--herd-s7), env(safe-area-inset-bottom)); z-index: var(--herd-z-controls); width: 92px; height: 92px; border-radius: 50%; border: 1px solid var(--herd-line-strong); background: var(--herd-paper-glass); letter-spacing: var(--herd-track); touch-action: none; }
.herd-camera-button { position: fixed; right: max(var(--herd-s7), calc(env(safe-area-inset-right) + var(--herd-s1))); bottom: max(142px, calc(env(safe-area-inset-bottom) + 142px)); z-index: var(--herd-z-controls); width: 72px; height: 72px; border-radius: 50%; border: 1px solid var(--herd-line); background: var(--herd-paper-glass); font-size: var(--herd-small); letter-spacing: .04em; touch-action: none; }
[data-reduced-motion=true] *, [data-reduced-motion=true] *::before, [data-reduced-motion=true] *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; scroll-behavior: auto !important; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; } }
@media (max-width: 560px) {
  .herd-title-card { gap: var(--herd-s5); }
  .herd-title { font-size: clamp(36px, 11vw, 46px); white-space: nowrap; }
  .herd-title-lockup { gap: var(--herd-s2); }
  .herd-panel { padding: var(--herd-s5); border-radius: 24px; }
  .herd-bindings { grid-template-columns: 1fr; }
  .herd-progress { width: 66px; height: 66px; }
  .herd-timer { top: max(91px, calc(env(safe-area-inset-top) + 89px)); }
}
`;

export function UiStyles() {
  return <style>{CSS}</style>;
}
