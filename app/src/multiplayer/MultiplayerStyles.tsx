// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The multiplayer menu and in-match card, written in the same herd tokens as the
 * solo panels so the two read as one product. Layout rules that matter on
 * phones: the dialog is a header, a scrolling body and a pinned action footer,
 * so the title and the primary action never scroll out of reach; every control
 * is at least --herd-target tall; nothing has a fixed width that can exceed a
 * 320px viewport.
 */
const CSS = `
.mp-entry { position: fixed; z-index: 30; left: 50%; bottom: max(var(--herd-s5), env(safe-area-inset-bottom)); transform: translateX(-50%); width: max-content; max-width: calc(100vw - 32px); min-width: 0; padding: 12px 24px; white-space: nowrap; }
.mp-dialog { box-sizing: border-box; width: min(480px, calc(100vw - 24px)); max-height: min(calc(100dvh - 24px), 720px); margin: auto; padding: 0; overflow: hidden; border: 1px solid var(--herd-line); border-radius: var(--herd-panel); background: var(--herd-paper); color: var(--herd-ink); box-shadow: 0 18px 70px var(--herd-shadow); font: inherit; }
.mp-dialog[open] { display: flex; flex-direction: column; }
.mp-dialog::backdrop { background: rgba(64,48,31,.34); backdrop-filter: blur(5px); }
.mp-dialog * { box-sizing: border-box; }
.mp-head { flex: none; padding: var(--herd-s5) var(--herd-s5) var(--herd-s3); border-bottom: 1px solid var(--herd-line); }
.mp-title { margin: 0; font-family: var(--herd-display-font); font-size: 26px; font-weight: 400; line-height: 1.1; letter-spacing: var(--herd-track); }
.mp-sub { margin: var(--herd-s1) 0 0; color: var(--herd-ink-soft); font-size: var(--herd-small); line-height: 1.4; }
.mp-body { flex: 1 1 auto; min-height: 0; display: grid; align-content: start; gap: var(--herd-s5); padding: var(--herd-s4) var(--herd-s5); overflow-y: auto; overscroll-behavior: contain; }
.mp-foot { flex: none; display: flex; flex-wrap: wrap; gap: var(--herd-s2); padding: var(--herd-s3) var(--herd-s5) max(var(--herd-s4), env(safe-area-inset-bottom)); border-top: 1px solid var(--herd-line); background: var(--herd-paper-glass); }
.mp-foot > .mp-btn { flex: 1 1 130px; }
.mp-section { display: grid; gap: var(--herd-s3); min-width: 0; }
.mp-section > h3, .mp-subtitle { margin: 0; color: var(--herd-ink-soft); font-family: var(--herd-font); font-size: var(--herd-small); font-weight: 600; letter-spacing: var(--herd-track-wide); text-transform: uppercase; }
.mp-copy { margin: 0; line-height: 1.45; }
.mp-note { margin: 0; padding: var(--herd-s2) var(--herd-s3); border-left: 3px solid var(--herd-gold); border-radius: 4px 12px 12px 4px; background: rgba(198,155,88,.16); font-size: var(--herd-small); line-height: 1.4; overflow-wrap: anywhere; }
.mp-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--herd-s3); }
.mp-field { display: grid; gap: var(--herd-s1); min-width: 0; }
.mp-field > span { color: var(--herd-ink-soft); font-size: var(--herd-small); letter-spacing: .05em; }
.mp-select, .mp-input { width: 100%; min-width: 0; min-height: var(--herd-target); padding: 8px 12px; border: 1px solid var(--herd-line); border-radius: var(--herd-control); background-color: rgba(255,252,245,.82); color: var(--herd-ink); font: inherit; font-size: 16px; }
.mp-select { padding-right: 34px; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5 6 6.5l5-5' fill='none' stroke='%2330281f' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; text-overflow: ellipsis; }
.mp-select:disabled { opacity: .55; }
.mp-input[readonly] { background-color: var(--herd-paper-quiet); text-overflow: ellipsis; }
.mp-select:focus-visible, .mp-input:focus-visible, .mp-btn:focus-visible, .mp-room:focus-visible { outline: 3px solid rgba(47,105,183,.55); outline-offset: 2px; }
.mp-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--herd-s2); }
.mp-row > .mp-field { flex: 1 1 180px; }
.mp-btn { min-height: var(--herd-target); padding: 10px 18px; border: 1px solid var(--herd-line-strong); border-radius: var(--herd-round); background: rgba(255,252,245,.7); color: var(--herd-ink); font: inherit; letter-spacing: .03em; line-height: 1.2; cursor: pointer; -webkit-tap-highlight-color: transparent; transition: background var(--herd-normal) var(--herd-ease), transform var(--herd-quick) var(--herd-ease), opacity var(--herd-normal) var(--herd-ease); }
.mp-btn:hover:not(:disabled) { background: var(--herd-paper-solid); }
.mp-btn:active:not(:disabled) { transform: translateY(1px) scale(.98); }
.mp-btn:disabled { opacity: .46; cursor: default; }
.mp-btn--primary { border-color: var(--herd-ink); background: var(--herd-ink); color: var(--herd-paper); }
.mp-btn--primary:hover:not(:disabled) { background: #46392b; }
.mp-btn--quiet { border-color: var(--herd-line); background: transparent; }
.mp-btn--danger { border-color: #9f5e45; color: #7d3a24; background: transparent; }
.mp-btn--small { min-height: 40px; padding: 6px 12px; font-size: var(--herd-small); }
.mp-chips { display: flex; flex-wrap: wrap; gap: var(--herd-s2); margin: 0; padding: 0; list-style: none; }
.mp-chip { padding: 4px 11px; border: 1px solid var(--herd-line); border-radius: var(--herd-round); background: var(--herd-paper-quiet); font-size: var(--herd-small); white-space: nowrap; }
.mp-players { display: grid; gap: var(--herd-s2); margin: 0; padding: 0; list-style: none; }
.mp-player { display: flex; flex-wrap: wrap; align-items: center; gap: var(--herd-s2) var(--herd-s3); padding: var(--herd-s2) var(--herd-s3); border: 1px solid var(--herd-line); border-radius: var(--herd-control); background: rgba(255,252,245,.55); }
.mp-player[data-empty=true] { border-style: dashed; background: transparent; color: var(--herd-ink-soft); }
.mp-player__slot { flex: none; width: 32px; height: 32px; display: grid; place-items: center; border: 1px solid var(--herd-line-strong); border-radius: 50%; background: var(--herd-paper); font-size: var(--herd-small); font-variant-numeric: tabular-nums lining-nums; }
.mp-player__who { flex: 1 1 110px; min-width: 0; display: grid; gap: 1px; }
.mp-player__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.mp-player__role { color: var(--herd-ink-soft); font-size: 12px; }
.mp-pill { flex: none; padding: 3px 10px; border-radius: var(--herd-round); background: rgba(98,87,72,.14); color: var(--herd-ink-soft); font-size: 12px; letter-spacing: .04em; }
.mp-pill[data-tone=ready] { background: rgba(129,148,95,.34); color: #2f4120; }
.mp-pill[data-tone=warn] { background: rgba(198,155,88,.34); color: #5e4217; }
.mp-rooms { display: grid; gap: var(--herd-s2); margin: 0; padding: 0; list-style: none; }
.mp-room { width: 100%; min-height: var(--herd-target); display: flex; align-items: center; justify-content: space-between; gap: var(--herd-s3); padding: var(--herd-s2) var(--herd-s4); border: 1px solid var(--herd-line); border-radius: var(--herd-control); background: rgba(255,252,245,.55); color: inherit; font: inherit; text-align: left; cursor: pointer; }
.mp-room:hover:not(:disabled) { background: var(--herd-paper-solid); border-color: var(--herd-line-strong); }
.mp-room:disabled { opacity: .5; cursor: default; }
.mp-room__main { min-width: 0; display: grid; gap: 1px; }
.mp-room__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.mp-room__meta { color: var(--herd-ink-soft); font-size: 12px; }
.mp-room__count { flex: none; font-variant-numeric: tabular-nums lining-nums; }
.mp-empty { margin: 0; padding: var(--herd-s4); border: 1px dashed var(--herd-line); border-radius: var(--herd-control); color: var(--herd-ink-soft); font-size: var(--herd-small); text-align: center; }
.mp-result { display: grid; gap: var(--herd-s2); padding: var(--herd-s4); border: 1px solid var(--herd-line-strong); border-radius: var(--herd-control); background: rgba(198,155,88,.16); }
.mp-result strong { font-family: var(--herd-display-font); font-size: 22px; font-weight: 400; letter-spacing: var(--herd-track); }
.mp-result p { margin: 0; color: var(--herd-ink-soft); font-size: var(--herd-small); }
.mp-scores { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; font-variant-numeric: tabular-nums lining-nums; }
.mp-scores li { display: flex; align-items: baseline; justify-content: space-between; gap: var(--herd-s3); min-width: 0; }
.mp-scores li > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mp-scores li[data-you=true] { font-weight: 600; }
.mp-scores li[data-muted=true] { color: var(--herd-ink-soft); }
.mp-hud { position: fixed; z-index: 12; left: max(var(--herd-s5), env(safe-area-inset-left)); top: calc(max(var(--herd-s5), env(safe-area-inset-top)) + 74px + var(--herd-s3)); width: max-content; min-width: 132px; max-width: min(230px, calc(50vw - 36px)); display: grid; gap: 6px; padding: 8px 12px; border: 1px solid var(--herd-line-strong); border-radius: var(--herd-control); background: var(--herd-paper-glass); font-size: 12px; line-height: 1.25; pointer-events: none; }
.mp-hud__bar { display: flex; align-items: center; gap: 6px; min-width: 0; }
.mp-hud__label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mp-hud__dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--herd-sage); }
.mp-hud[data-connected=false] .mp-hud__dot { background: var(--herd-gold); }
.mp-hud__ping { flex: none; color: var(--herd-ink-soft); font-variant-numeric: tabular-nums lining-nums; }
.mp-hud p { margin: 0; color: var(--herd-ink-soft); overflow-wrap: anywhere; }
.mp-hud .mp-scores { padding-top: 6px; border-top: 1px solid var(--herd-line); }
@media (max-width: 560px) {
  .mp-hud { top: calc(max(var(--herd-s5), env(safe-area-inset-top)) + 66px + var(--herd-s3)); }
}
@media (max-width: 340px) {
  .mp-fields { grid-template-columns: minmax(0, 1fr); }
  .mp-head, .mp-body, .mp-foot { padding-left: var(--herd-s4); padding-right: var(--herd-s4); }
}
@media (max-height: 500px) {
  .mp-dialog { max-height: calc(100dvh - 16px); }
  .mp-head { padding-top: var(--herd-s3); }
  .mp-title { font-size: 22px; }
  .mp-body { gap: var(--herd-s4); padding-top: var(--herd-s3); padding-bottom: var(--herd-s3); }
  .mp-foot { padding-top: var(--herd-s2); padding-bottom: var(--herd-s2); }
}
`;

export function MultiplayerStyles() {
  return <style>{CSS}</style>;
}
