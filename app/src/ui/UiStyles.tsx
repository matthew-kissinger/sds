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
.herd-loading-card { position: relative; z-index: 1; grid-area: 1 / 1; width: min(88vw, 440px); display: grid; gap: var(--herd-s5); padding: clamp(24px, 5vw, 38px); border: 1px solid rgba(78,65,46,.2); border-radius: var(--herd-panel); background: rgba(244,234,215,.72); box-shadow: 0 18px 70px rgba(65,51,34,.12); color: var(--herd-ink); text-align: center; }
.herd-loading-card__lockup { display: grid; gap: var(--herd-s2); }
.herd-loading-card__lockup h1 { margin: 0; font-size: clamp(38px, 7vw, 56px); font-weight: 400; line-height: 1; letter-spacing: .035em; }
.herd-loading-card__lockup p { margin: 0; color: var(--herd-ink-soft); font-size: var(--herd-small); letter-spacing: var(--herd-track-wide); text-transform: uppercase; }
.herd-loading-track { height: 9px; overflow: hidden; border: 1px solid rgba(78,65,46,.24); border-radius: var(--herd-round); background: rgba(116,90,58,.12); }
.herd-loading-track span { display: block; width: 0; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #718b5b, #9aa968); transition: width 120ms linear; }
.herd-loading-status { display: flex; align-items: center; justify-content: space-between; gap: var(--herd-s4); min-height: 22px; margin: 0; color: var(--herd-ink-soft); font-size: var(--herd-small); font-variant-numeric: tabular-nums; letter-spacing: .04em; text-align: left; }
.herd-title-card { position: relative; grid-area: 1 / 1; display: flex; flex-direction: column; align-items: center; gap: var(--herd-s6); max-width: min(92vw, 660px); opacity: 0; transform: translateY(10px); pointer-events: none; text-align: center; text-shadow: 0 2px 18px rgba(244,234,215,.78); transition: opacity var(--herd-slow) var(--herd-ease), transform var(--herd-slow) var(--herd-ease); }
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
.herd-bark-button:focus-visible, .herd-camera-button:focus-visible, .herd-sprint-button:focus-visible { outline: 3px solid rgba(47,105,183,.55); outline-offset: 3px; }
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
.herd-progress[data-flock-size="200"] .herd-progress__count { font-size: 11px; letter-spacing: .01em; }
.herd-timer { position: absolute; top: max(100px, calc(env(safe-area-inset-top) + 98px)); left: max(var(--herd-s5), env(safe-area-inset-left)); min-width: 82px; font-size: 15px; font-variant-numeric: tabular-nums; letter-spacing: var(--herd-track); text-shadow: 0 1px 10px var(--herd-paper); }
.herd-stamina { position: absolute; top: max(var(--herd-s5), env(safe-area-inset-top)); left: 50%; width: clamp(112px, 16vw, 156px); display: grid; gap: 4px; transform: translateX(-50%); filter: drop-shadow(0 2px 8px rgba(65,51,34,.18)); }
.herd-stamina__label { color: rgba(44,56,40,.76); font-size: 10px; line-height: 1; letter-spacing: .14em; text-align: center; text-transform: uppercase; text-shadow: 0 1px 5px var(--herd-paper); }
.herd-stamina__track { height: 7px; overflow: hidden; border: 1px solid rgba(78,65,46,.42); border-radius: var(--herd-round); background: rgba(244,234,215,.58); }
.herd-stamina__fill { display: block; width: 100%; height: 100%; border-radius: inherit; background: #718b5b; transition: background var(--herd-normal) var(--herd-ease); }
.herd-stamina[data-sprinting=true] .herd-stamina__fill { background: #9a7a47; }
.herd-stamina[data-low=true] .herd-stamina__fill { background: #9f5e45; }
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
.herd-touch-knob { position: absolute; left: 50%; top: 50%; width: var(--herd-target); height: var(--herd-target); margin: calc(var(--herd-target) / -2); border: 1px solid var(--herd-line); border-radius: 50%; background: var(--herd-paper-quiet); }
.herd-bark-button { position: fixed; right: max(var(--herd-s6), env(safe-area-inset-right)); bottom: max(var(--herd-s7), env(safe-area-inset-bottom)); z-index: var(--herd-z-controls); width: 92px; height: 92px; border-radius: 50%; border: 1px solid var(--herd-line-strong); background: var(--herd-paper-glass); letter-spacing: var(--herd-track); touch-action: none; }
.herd-sprint-button { position: fixed; right: max(126px, calc(env(safe-area-inset-right) + 126px)); bottom: max(40px, calc(env(safe-area-inset-bottom) + 40px)); z-index: var(--herd-z-controls); width: 76px; height: 76px; border-radius: 50%; border: 1px solid var(--herd-line); background: var(--herd-paper-glass); font-size: var(--herd-small); letter-spacing: .04em; touch-action: none; -webkit-tap-highlight-color: transparent; }
.herd-sprint-button[data-active=true] { border-color: var(--herd-line-strong); background: rgba(218,199,158,.9); transform: scale(.97); }
.herd-camera-button { position: fixed; right: max(var(--herd-s7), calc(env(safe-area-inset-right) + var(--herd-s1))); bottom: max(142px, calc(env(safe-area-inset-bottom) + 142px)); z-index: var(--herd-z-controls); width: 72px; height: 72px; border-radius: 50%; border: 1px solid var(--herd-line); background: var(--herd-paper-glass); font-size: var(--herd-small); letter-spacing: .04em; touch-action: none; }
.herd-customize-dock { box-sizing: border-box; position: fixed; left: 0; top: 0; bottom: 0; width: min(440px, 92vw); max-width: 440px; z-index: var(--herd-z-modal); display: flex; flex-direction: column; padding: max(var(--herd-s5), env(safe-area-inset-top)) max(var(--herd-s4), env(safe-area-inset-left)) max(var(--herd-s5), env(safe-area-inset-bottom)); background: rgba(246,238,222,.94); backdrop-filter: blur(16px); border-right: 1px solid var(--herd-line-strong); box-shadow: 6px 0 28px rgba(0,0,0,.15); overflow-y: auto; overflow-x: hidden; pointer-events: auto; }
.herd-customize-dock * { box-sizing: border-box; }
.herd-customize-drag-zone { position: fixed; left: 440px; right: 0; top: 0; bottom: 0; z-index: calc(var(--herd-z-modal) - 1); touch-action: none; cursor: grab; user-select: none; }
.herd-customize-drag-zone--active { cursor: grabbing; }
.herd-customize-hud { position: fixed; top: max(var(--herd-s4), env(safe-area-inset-top)); right: max(var(--herd-s5), env(safe-area-inset-right)); z-index: var(--herd-z-modal); display: flex; align-items: center; gap: var(--herd-s2); pointer-events: auto; }
.herd-customize-pill { display: flex; align-items: center; gap: var(--herd-s2); padding: 7px 14px; border: 1px solid var(--herd-line-strong); border-radius: var(--herd-round); background: var(--herd-paper-glass); font-size: var(--herd-small); color: var(--herd-ink); box-shadow: 0 2px 10px var(--herd-shadow); font-weight: 500; }
.herd-orbit-controls { display: flex; gap: 4px; }
.herd-orbit-btn { width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--herd-line); background: var(--herd-paper-glass); display: grid; place-items: center; font-size: 14px; cursor: pointer; color: var(--herd-ink); transition: background var(--herd-quick) var(--herd-ease); }
.herd-orbit-btn:hover { background: var(--herd-paper); }
.herd-angle-controls { display: flex; gap: 4px; background: var(--herd-paper-glass); padding: 3px; border: 1px solid var(--herd-line-strong); border-radius: var(--herd-round); }
.herd-angle-btn { padding: 4px 10px; border-radius: var(--herd-round); border: 1px solid transparent; background: transparent; font-size: 12px; font-weight: 500; cursor: pointer; color: var(--herd-ink-soft); transition: all var(--herd-quick) var(--herd-ease); white-space: nowrap; }
.herd-angle-btn:hover { color: var(--herd-ink); background: rgba(255,255,255,.5); }
.herd-angle-btn--active { background: rgba(116,90,58,.18); border-color: var(--herd-line-strong); color: var(--herd-ink); font-weight: 600; }
@media (max-width: 760px) {
  .herd-customize-dock { left: 0; right: 0; top: auto; bottom: 0; width: 100%; max-width: 100%; max-height: 58vh; border-right: none; border-top: 1px solid var(--herd-line-strong); border-radius: 20px 20px 0 0; }
  .herd-customize-drag-zone { left: 0; right: 0; top: 0; bottom: 58vh; }
}
.herd-tabs { display: flex; gap: var(--herd-s2); margin-bottom: var(--herd-s5); border-bottom: 1px solid var(--herd-line); padding-bottom: var(--herd-s3); width: 100%; }
.herd-tab { min-height: 38px; padding: 6px 16px; border: 1px solid var(--herd-line); border-radius: var(--herd-round); background: var(--herd-paper-glass); color: var(--herd-ink-soft); font-size: var(--herd-small); cursor: pointer; transition: all var(--herd-quick) var(--herd-ease); }
.herd-tab:hover { background: var(--herd-paper); color: var(--herd-ink); }
.herd-tab--active { background: rgba(116,90,58,.2); border-color: var(--herd-line-strong); color: var(--herd-ink); font-weight: 600; }
.herd-tab-content { display: grid; gap: var(--herd-s4); width: 100%; }
.herd-customize-desc { margin: 0; color: var(--herd-ink-soft); font-size: var(--herd-small); line-height: 1.4; }
.herd-preset-list { display: grid; gap: var(--herd-s2); width: 100%; }
.herd-preset-card { display: flex; align-items: center; gap: var(--herd-s4); padding: var(--herd-s3) var(--herd-s4); border: 1px solid var(--herd-line); border-radius: var(--herd-control); background: rgba(244,234,215,.5); text-align: left; cursor: pointer; transition: all var(--herd-quick) var(--herd-ease); width: 100%; }
.herd-preset-card:hover { background: var(--herd-paper); border-color: var(--herd-line-strong); }
.herd-preset-card--selected { background: rgba(228,214,188,.9); border-color: var(--herd-line-strong); box-shadow: inset 0 0 0 1px var(--herd-line-strong); }
.herd-swatch-circle { width: 36px; height: 36px; border-radius: 50%; border: 2px solid var(--herd-paper); box-shadow: 0 1px 4px var(--herd-shadow); flex-shrink: 0; }
.herd-preset-details { display: grid; gap: 2px; }
.herd-preset-name { font-weight: 600; font-size: 15px; color: var(--herd-ink); }
.herd-preset-info { font-size: var(--herd-small); color: var(--herd-ink-soft); }
.herd-flock-scope { display: flex; align-items: center; justify-content: space-between; gap: 4px; padding: 4px; border-radius: var(--herd-round); background: rgba(218,199,158,.3); border: 1px solid var(--herd-line); width: 100%; }
.herd-scope-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--herd-ink-soft); margin-left: 6px; }
.herd-scope-btn { padding: 4px 10px; border-radius: var(--herd-round); border: 1px solid transparent; background: transparent; font-size: 12px; font-weight: 600; color: var(--herd-ink-soft); cursor: pointer; transition: all var(--herd-quick) var(--herd-ease); }
.herd-scope-btn:hover { color: var(--herd-ink); }
.herd-scope-btn--active { background: var(--herd-paper); border-color: var(--herd-line-strong); color: var(--herd-ink); box-shadow: 0 1px 3px var(--herd-shadow); }
.herd-sheep-editor { display: grid; gap: var(--herd-s3); width: 100%; }
.herd-sheep-hero-card { display: grid; gap: var(--herd-s3); padding: var(--herd-s3) var(--herd-s4); border-radius: var(--herd-control); background: rgba(244,234,215,.45); border: 1px solid var(--herd-line); width: 100%; }
.herd-sheep-hero-header { display: flex; align-items: center; justify-content: space-between; gap: var(--herd-s2); width: 100%; }
.herd-sheep-stepper { display: flex; align-items: center; gap: 6px; }
.herd-stepper-btn { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--herd-line); background: var(--herd-paper-glass); font-size: 15px; font-weight: 600; line-height: 1; cursor: pointer; color: var(--herd-ink); transition: background var(--herd-quick) var(--herd-ease); }
.herd-stepper-btn:hover { background: var(--herd-paper); border-color: var(--herd-line-strong); }
.herd-sheep-num { font-weight: 700; font-size: 15px; color: var(--herd-ink); font-variant-numeric: tabular-nums; }
.herd-breed-badge { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: var(--herd-round); background: rgba(244,234,215,.7); border: 1px solid var(--herd-line); font-size: 12px; color: var(--herd-ink); font-weight: 500; }
.herd-mini-swatch { width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(78,65,46,.3); display: inline-block; flex-shrink: 0; }
.herd-rename-row { display: flex; gap: 6px; align-items: center; width: 100%; }
.herd-rename-input { flex: 1; min-width: 0; min-height: 34px; border: 1px solid var(--herd-line); border-radius: var(--herd-round); padding: 4px 10px; background: var(--herd-paper-glass); font-size: 14px; color: var(--herd-ink); }
.herd-rename-input:focus-visible { outline: 2px solid rgba(47,105,183,.55); outline-offset: 1px; }
.herd-action-btn { min-height: 34px; padding: 4px 12px; border-radius: var(--herd-round); border: 1px solid var(--herd-line); background: var(--herd-paper-glass); font-size: 12px; font-weight: 600; cursor: pointer; color: var(--herd-ink); white-space: nowrap; flex-shrink: 0; transition: all var(--herd-quick) var(--herd-ease); }
.herd-action-btn:hover { background: var(--herd-paper); border-color: var(--herd-line-strong); }
.herd-action-btn--reset { color: var(--herd-ink-soft); font-weight: 500; }
.herd-breed-subtext { font-size: 11px; color: var(--herd-ink-soft); line-height: 1.35; display: flex; flex-wrap: wrap; gap: 3px; align-items: baseline; }
.herd-dot-sep { color: var(--herd-line-strong); margin: 0 1px; }
.herd-filter-bar { display: flex; gap: 6px; align-items: center; width: 100%; }
.herd-search-field { flex: 1; min-width: 0; min-height: 32px; border: 1px solid var(--herd-line); border-radius: var(--herd-round); padding: 4px 10px; background: var(--herd-paper-glass); font-size: 12px; color: var(--herd-ink); }
.herd-search-field:focus-visible { outline: 2px solid rgba(47,105,183,.55); outline-offset: 1px; }
.herd-breed-dropdown { width: 142px; min-width: 0; min-height: 32px; border: 1px solid var(--herd-line); border-radius: var(--herd-round); padding: 4px 6px; background: var(--herd-paper-glass); font-size: 12px; color: var(--herd-ink); cursor: pointer; flex-shrink: 0; text-overflow: ellipsis; }
.herd-batch-pages { display: flex; gap: 4px; overflow-x: auto; padding: 2px 0; scrollbar-width: none; width: 100%; }
.herd-page-btn { padding: 2px 7px; border-radius: var(--herd-round); border: 1px solid var(--herd-line); background: var(--herd-paper-glass); font-size: 10px; cursor: pointer; font-variant-numeric: tabular-nums; color: var(--herd-ink-soft); }
.herd-page-btn:hover { background: var(--herd-paper); color: var(--herd-ink); }
.herd-page-btn--active { background: var(--herd-paper); border-color: var(--herd-line-strong); color: var(--herd-ink); font-weight: 700; }
.herd-registry-status { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--herd-ink-soft); width: 100%; }
.herd-status-count { font-variant-numeric: tabular-nums; font-weight: 500; }
.herd-status-actions { display: flex; gap: 8px; align-items: center; }
.herd-link-btn { background: transparent; border: none; padding: 2px 4px; font-size: 11px; color: var(--herd-ink); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.herd-link-btn:hover { color: var(--herd-line-strong); }
.herd-link-btn--reset { color: var(--herd-ink-soft); }
.herd-empty-hint { font-size: var(--herd-small); color: var(--herd-ink-soft); text-align: center; padding: var(--herd-s3); width: 100%; margin: 0; }
.herd-sheep-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(42px, 1fr)); gap: 6px; max-height: 200px; overflow-y: auto; padding: 6px; border: 1px solid var(--herd-line); border-radius: var(--herd-control); background: rgba(244,234,215,.2); width: 100%; }
.herd-sheep-chip { display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-height: 30px; padding: 2px 4px; border-radius: var(--herd-round); border: 1px solid var(--herd-line); background: var(--herd-paper-glass); cursor: pointer; font-size: 11px; font-variant-numeric: tabular-nums; color: var(--herd-ink); transition: all var(--herd-quick) var(--herd-ease); }
.herd-sheep-chip:hover { background: var(--herd-paper); }
.herd-sheep-chip--active { background: rgba(116,90,58,.25); border-color: var(--herd-line-strong); font-weight: 700; box-shadow: inset 0 0 0 1px var(--herd-line-strong); }
.herd-sheep-chip--custom { box-shadow: inset 0 0 0 1px var(--herd-gold); font-weight: 600; }
.herd-nameplate-anchor {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: var(--herd-z-hud);
  will-change: transform, opacity;
  transform-origin: bottom center;
}
.herd-nameplate-badge {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 16px 7px;
  border-radius: 7px;
  background: linear-gradient(180deg, #fdfbf7 0%, #f4ece0 60%, #eae0ce 100%);
  border: 2px solid #282016;
  box-shadow: 
    inset 0 0 0 1px rgba(198,162,86,.85),
    inset 0 1px 2px rgba(255,255,255,.6),
    0 4px 14px rgba(18,14,10,.38),
    0 1px 3px rgba(18,14,10,.25);
  color: #221b14;
  font-family: 'Alice', Georgia, serif;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1;
  text-shadow: 0 1px 0 rgba(255,255,255,.5);
  white-space: nowrap;
  user-select: none;
}
.herd-nameplate-badge::after {
  content: '';
  position: absolute;
  bottom: -5px;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 8px;
  height: 8px;
  background: #eae0ce;
  border-right: 2px solid #282016;
  border-bottom: 2px solid #282016;
  box-shadow: 2px 2px 4px rgba(18,14,10,.25);
}
.herd-nameplate-rosette {
  color: #c6a256;
  font-size: 10px;
  line-height: 1;
  text-shadow: 0 0 2px rgba(198,162,86,.4);
  transform: translateY(-0.5px);
}
.herd-nameplate-title {
  display: inline-block;
}
.herd-nameplate-gleam {
  position: absolute;
  top: -20%;
  bottom: -20%;
  width: 32px;
  background: linear-gradient(105deg, transparent 0%, rgba(255,255,255,.65) 50%, transparent 100%);
  transform: skewX(-20deg);
  pointer-events: none;
  animation: herd-plaque-gleam 850ms cubic-bezier(.2,.8,.3,1) forwards;
}
@keyframes herd-plaque-gleam {
  0% { left: -50px; opacity: 0; }
  20% { opacity: 1; }
  100% { left: 160%; opacity: 0; }
}
[data-reduced-motion=true] *, [data-reduced-motion=true] *::before, [data-reduced-motion=true] *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; scroll-behavior: auto !important; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; } }
@media (max-width: 560px) {
  .herd-nameplate-badge { font-size: 14px; padding: 5px 14px 6px; }
  .herd-title-card { gap: var(--herd-s5); }
  .herd-title { font-size: clamp(36px, 11vw, 46px); white-space: nowrap; }
  .herd-title-lockup { gap: var(--herd-s2); }
  .herd-panel { padding: var(--herd-s5); border-radius: 24px; }
  .herd-bindings { grid-template-columns: 1fr; }
  .herd-progress { width: 66px; height: 66px; }
  .herd-progress[data-flock-size="200"] .herd-progress__count { font-size: 10px; }
  .herd-timer { top: max(91px, calc(env(safe-area-inset-top) + 89px)); }
}
`;

export function UiStyles() {
  return <style>{CSS}</style>;
}
