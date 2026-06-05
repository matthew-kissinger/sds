// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 60 Phase 6 - in-game playtest note capture.
 *
 * A right-edge tab (plus the N key and gamepad SELECT) opens a quick note box
 * that saves the typed note with session context (scene, mode, round, counted,
 * fps, build) to localStorage. Export copies all notes as JSON. The whole
 * feature is opt-in (?notes=1 / ?stats=1) so regular players never see it.
 */
import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { pastoral, alpha } from '../ui/tokens';
import { addNote, readNotes, notesAsJson, captureContext, isPlaytestEnabled } from '../../playtest/noteLog.js';

const tabStyle: CSSProperties = {
    position: 'fixed', right: 0, top: '46%', zIndex: 1500,
    padding: '8px 10px', borderRadius: '10px 0 0 10px', border: 'none', cursor: 'pointer',
    background: alpha(pastoral.ink, 72), color: pastoral.cream, fontSize: 12, fontWeight: 700,
    writingMode: 'vertical-rl', letterSpacing: 1,
};
const scrim: CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};
const card: CSSProperties = {
    width: 'min(460px, 94%)', background: alpha(pastoral.cream, 96), color: pastoral.ink,
    border: `1px solid ${pastoral.glassWarmBorder}`, borderRadius: 16, padding: 16,
    boxShadow: '0 18px 40px rgba(43,38,32,0.3)',
};
const textareaStyle: CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
    border: `1px solid ${pastoral.glassWarmBorder}`, background: alpha(pastoral.cream, 70),
    color: pastoral.ink, fontSize: 14, resize: 'vertical', outline: 'none',
};
const primaryBtn: CSSProperties = {
    padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
    background: pastoral.accentMeadow, color: pastoral.cream, fontSize: 14, fontWeight: 600,
};
const ghostBtn: CSSProperties = {
    padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
    border: `1px solid ${pastoral.glassWarmBorder}`, background: 'transparent',
    color: pastoral.ink, fontSize: 14, fontWeight: 600,
};

export function PlaytestNote() {
    const [enabled] = useState(() => isPlaytestEnabled());
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    const [count, setCount] = useState(0);
    const [copied, setCopied] = useState(false);
    const taRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => { if (enabled) setCount(readNotes().length); }, [open, enabled]);

    // N key + gamepad SELECT (dispatched from main.js) open the note box.
    useEffect(() => {
        if (!enabled) return;
        const onKey = (e: KeyboardEvent) => {
            if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !e.altKey) {
                const a = document.activeElement as HTMLElement | null;
                const tag = a?.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA') return;
                setOpen(true);
            }
        };
        const onEvt = () => setOpen(true);
        window.addEventListener('keydown', onKey);
        window.addEventListener('sds-open-note', onEvt as EventListener);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('sds-open-note', onEvt as EventListener);
        };
    }, [enabled]);

    // While the box is open, swallow movement keys and focus the textarea.
    useEffect(() => {
        try { (window as unknown as { isTypingInInput?: boolean }).isTypingInInput = open; } catch { /* ignore */ }
        if (open) { const id = window.setTimeout(() => taRef.current?.focus(), 30); return () => window.clearTimeout(id); }
    }, [open]);

    const save = () => {
        const t = text.trim();
        if (t) addNote(t, captureContext());
        setText('');
        setOpen(false);
    };

    const exportNotes = async () => {
        const json = notesAsJson();
        try {
            await navigator.clipboard.writeText(json);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'sds-playtest-notes.json'; a.click();
            URL.revokeObjectURL(url);
        }
    };

    if (!enabled) return null;

    return (
        <>
            <button onClick={() => setOpen(true)} title="Playtest note (N)" aria-label="Add playtest note" style={tabStyle}>
                Note
            </button>
            {open && (
                <div style={scrim} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
                    <div style={card}>
                        <div style={{ fontWeight: 700, marginBottom: 8 }}>Playtest note</div>
                        <textarea
                            ref={taRef}
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
                                if (e.key === 'Escape') setOpen(false);
                            }}
                            placeholder="What happened? Scene, mode, round, and fps are captured automatically."
                            rows={4}
                            style={textareaStyle}
                        />
                        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                            <button onClick={save} style={primaryBtn}>Save</button>
                            <button onClick={() => setOpen(false)} style={ghostBtn}>Cancel</button>
                            <div style={{ flex: 1 }} />
                            <button onClick={exportNotes} style={ghostBtn}>{copied ? 'Copied' : `Export (${count})`}</button>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 11, color: pastoral.inkSoft }}>
                            Cmd or Ctrl plus Enter saves. {count} saved.
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
