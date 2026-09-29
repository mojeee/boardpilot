// Drag handles that resize the right panel, the session log and the wizard/assistant split. The
// sizes are CSS variables on <html> (see tokens.css), remembered on this computer. Double-click
// resets a handle; arrow keys move it when it has focus.

import { useRef } from 'react';
import { t } from '@shared/i18n';

type Kind = 'right' | 'log' | 'assistant';

const SPEC: Record<Kind, { cssVar: string; min: number; max: number; def: number; unit: 'px' | '%' }> = {
  right: { cssVar: '--right-w', min: 300, max: 760, def: 400, unit: 'px' },
  log: { cssVar: '--log-h', min: 90, max: 560, def: 250, unit: 'px' },
  assistant: { cssVar: '--assistant-h', min: 15, max: 80, def: 40, unit: '%' },
};
const KEY = 'bp.layout';

function load(): Partial<Record<Kind, number>> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<Kind, number>>;
  } catch {
    return {};
  }
}

function apply(kind: Kind, value: number) {
  const s = SPEC[kind];
  const v = Math.round(Math.min(s.max, Math.max(s.min, value)));
  document.documentElement.style.setProperty(s.cssVar, `${v}${s.unit}`);
  return v;
}

function save(kind: Kind, value: number | undefined) {
  const all = load();
  if (value === undefined) delete all[kind];
  else all[kind] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable: sizes last for this session only */
  }
}

/** Apply the remembered sizes at start-up. */
export function initLayoutSizes() {
  const all = load();
  for (const k of Object.keys(SPEC) as Kind[]) if (typeof all[k] === 'number') apply(k, all[k]!);
}

function current(kind: Kind): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(SPEC[kind].cssVar);
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : SPEC[kind].def;
}

export function Splitter({ kind }: { kind: Kind }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<number | null>(null);
  const vertical = kind === 'right';

  const valueAt = (e: PointerEvent | React.PointerEvent) => {
    if (kind === 'right') return window.innerWidth - e.clientX;
    if (kind === 'log') return window.innerHeight - e.clientY;
    const box = ref.current?.closest('.right-split')?.getBoundingClientRect();
    return box ? ((box.bottom - e.clientY) / box.height) * 100 : SPEC.assistant.def;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = ref.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    document.body.classList.add(vertical ? 'resizing-x' : 'resizing-y');
    const move = (ev: PointerEvent) => (last.current = apply(kind, valueAt(ev)));
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      document.body.classList.remove('resizing-x', 'resizing-y');
      if (last.current !== null) save(kind, last.current);
      last.current = null;
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = SPEC[kind].unit === '%' ? 3 : 16;
    // Growing the panel: left arrow widens the right panel, up arrow makes the log or assistant taller.
    const grow = vertical ? e.key === 'ArrowLeft' : e.key === 'ArrowUp';
    const shrink = vertical ? e.key === 'ArrowRight' : e.key === 'ArrowDown';
    if (!grow && !shrink) return;
    e.preventDefault();
    save(kind, apply(kind, current(kind) + (grow ? step : -step)));
  };

  const reset = () => {
    apply(kind, SPEC[kind].def);
    save(kind, undefined);
    document.documentElement.style.removeProperty(SPEC[kind].cssVar);
  };

  return (
    <div
      ref={ref}
      className={`splitter splitter-${kind}`}
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-label={t('Drag to resize. Double-click to reset.')}
      title={t('Drag to resize. Double-click to reset.')}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={reset}
      onKeyDown={onKeyDown}
    />
  );
}
