// Board picker: every board in /boards, grouped by family, with a small drawing generated from the
// board file. "Find my board" matches the USB ids of plugged-in boards (look before asking).

import { useMemo, useState } from 'react';
import { create } from 'zustand';
import type { BoardDef } from '@shared/types';
import { FAMILY_LABEL, ROLE_HEX, boardList, pinBaseRole, pinPositionMm, rectToMm } from '@shared/board';
import { t } from '@shared/i18n';
import { changeBoard } from '../state/sceneActions';
import { log, useScene } from '../state/store';
import { Icon } from './Icon';

interface PickerStore {
  open: boolean;
  show(): void;
  hide(): void;
}
export const useBoardPicker = create<PickerStore>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
export const openBoardPicker = () => useBoardPicker.getState().show();

const TOOL_NAME: Record<BoardDef['toolchain']['flasher'], string> = {
  esptool: 'esptool',
  picotool: 'picotool',
  avrdude: 'avrdude',
  stm32: 'STM32CubeProgrammer / stlink',
  nrfjprog: 'nrfjprog',
  teensy: 'Teensy Loader',
};

/** Top view of a board drawn from its definition file. */
export function BoardThumb({ board, width = 150 }: { board: BoardDef; width?: number }) {
  const { length, width: w } = board.pcbMm;
  const pad = 2;
  return (
    <svg className="board-thumb" viewBox={`${-length / 2 - pad} ${-w / 2 - pad} ${length + pad * 2} ${w + pad * 2}`} width={width} height={(width * (w + pad * 2)) / (length + pad * 2)} aria-hidden>
      <rect x={-length / 2} y={-w / 2} width={length} height={w} rx={1.5} fill={board.pcbColor ?? '#1F3A5F'} stroke="rgba(255,255,255,0.15)" strokeWidth={0.3} />
      {board.components.map((c, i) => {
        const r = rectToMm(board, c.rect);
        const fill =
          c.color ??
          (c.type === 'usb' || c.type === 'crystal' || c.type === 'module' ? '#C9CED4' : c.type === 'antenna' ? '#D9B45A' : c.type === 'led' ? '#ff6b5e' : '#15181c');
        return <rect key={i} x={r.cx - r.w / 2} y={r.cz - r.h / 2} width={r.w} height={r.h} rx={0.4} fill={fill} opacity={0.9} />;
      })}
      {board.pins.map((p) => {
        const [x, , z] = pinPositionMm(board, p);
        return <circle key={p.id} cx={x} cy={z} r={0.75} fill={ROLE_HEX[pinBaseRole(p)]} />;
      })}
    </svg>
  );
}

export function BoardPickerDialog() {
  const open = useBoardPicker((s) => s.open);
  if (!open) return null;
  return <BoardPickerBody />;
}

function BoardPickerBody() {
  const current = useScene((s) => s.scene.board);
  const [q, setQ] = useState('');
  const [detected, setDetected] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => useBoardPicker.getState().hide();

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = boardList().filter(
      (b) => !needle || [b.name, b.vendor, b.chip, b.module, b.family, FAMILY_LABEL[b.family]].some((s) => s.toLowerCase().includes(needle)),
    );
    const out: { family: BoardDef['family']; boards: BoardDef[] }[] = [];
    for (const b of list) {
      const g = out.find((x) => x.family === b.family);
      if (g) g.boards.push(b);
      else out.push({ family: b.family, boards: [b] });
    }
    return out;
  }, [q]);

  const detect = async () => {
    setBusy(true);
    const r = await window.bp.hw.listPorts();
    setBusy(false);
    if (!r.ok) {
      log('failed', `${t(r.error.humanMessage)} ${t(r.error.hint)}`);
      return;
    }
    const ids = [...new Set(r.value.flatMap((p) => p.boardIds ?? []))];
    setDetected(ids);
    log(
      ids.length ? 'found' : 'info',
      ids.length
        ? t('USB ids match: {boards}.', { boards: ids.map((id) => boardList().find((b) => b.id === id)?.name ?? id).join(', ') })
        : t('No plugged-in board matched a known USB id. Pick your board from the list.'),
      { source: 'measured: USB port list' },
    );
  };

  const pick = (b: BoardDef) => {
    changeBoard(b.id);
    close();
  };

  return (
    <div className="modal-back" onClick={close}>
      <div className="modal board-picker" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('Choose your board')}>
        <div className="row between">
          <h2>{t('Choose your board')}</h2>
          <button className="close" onClick={close} aria-label={t('Close')}>
            ×
          </button>
        </div>
        <p>{t('Pin rules, the 3D model, flashing and the simulator all follow the board you pick.')}</p>
        <div className="row gap">
          <input className="text-in" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search boards, e.g. Pico, STM32, Uno')} />
          <button className="btn small" disabled={busy} onClick={detect}>
            {busy ? <span className="spinner" /> : <Icon name="search" size={14} />} {t('Find my board')}
          </button>
        </div>
        {detected && detected.length > 1 && <p className="small dim">{t('Several boards use the same USB chip. Pick the one printed on your board.')}</p>}
        <div className="board-groups">
          <div className="board-grid">
            {groups.flatMap((g) =>
              g.boards.map((b) => (
                <button key={b.id} className={`board-card ${b.id === current ? 'on' : ''} ${detected?.includes(b.id) ? 'detected' : ''}`} onClick={() => pick(b)}>
                  <BoardThumb board={b} />
                  <div className="board-card-main">
                    <span className="label">{FAMILY_LABEL[g.family]}</span>
                    <b>{b.name}</b>
                    <span className="small dim">{b.vendor}</span>
                    <span className="small">{t(b.summary)}</span>
                    <span className="board-chips">
                      <span className="chip">{t('{v} V logic', { v: String(b.logicVolt) })}</span>
                      <span className="chip">{t('{n} pins', { n: String(b.pins.length) })}</span>
                      {b.toolchain.agent ? <span className="chip ok-chip">{t('Live pin view')}</span> : <span className="chip">{t('Wiring checks and flashing')}</span>}
                      {detected?.includes(b.id) && <span className="chip ai-chip">{t('Plugged in')}</span>}
                      {b.id === current && <span className="chip sim-chip">{t('In use')}</span>}
                    </span>
                    <span className="small dim mono">{TOOL_NAME[b.toolchain.flasher]}</span>
                  </div>
                </button>
              )),
            )}
          </div>
          {!groups.length && <div className="empty">{t('No board matches. Try another name.')}</div>}
        </div>
      </div>
    </div>
  );
}
