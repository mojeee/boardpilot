// Building blocks shared by several flows.

import type { StepDef, FlowContext, StepOutcome } from '@shared/flow';
import type { BoardDef, PartDef, ScenePart, TargetRef, PortInfo } from '@shared/types';
import { BOARDS, boardPinFor, chipMatchesBoard, pinById, wireFor } from '@shared/board';
import { t } from '@shared/i18n';

export const fmtErr = (e: { humanMessage: string; hint: string }) => `${e.humanMessage} ${e.hint}`.trim();

/** Make sure a board is identified: use the current one, else find and identify it automatically. */
export function ensureBoardStep(): StepDef {
  return {
    id: 'board',
    type: 'auto',
    title: 'Find your board',
    async run(ctx) {
      const st = ctx.hw.state();
      if (st.chip && st.port) {
        return { status: 'ok', summary: t('Using {chip} on {port}.', { chip: st.chip.chip, port: st.port }) };
      }
      const ports = await ctx.hw.listPorts();
      if (!ports.ok) return { status: 'failed', summary: fmtErr(ports.error) };
      const port = pickPort(ports.value, ctx.board.id);
      if (!port) {
        return {
          status: 'failed',
          summary: 'No board found on USB. Plug it in with a data cable, or run “Debug a problem → Board not detected”.',
        };
      }
      const id = await ctx.hw.identify(port.path);
      if (!id.ok) return { status: 'failed', summary: fmtErr(id.error) };
      ctx.log('found', t('Board: {chip}, ID {mac}, flash {flash}.', { chip: id.value.chip, mac: id.value.mac, flash: id.value.flashSize }), {
        source: `measured: ${id.value.toolVersion ?? 'chip tool'}`,
      });
      checkChipBoard(ctx, id.value.chip);
      return { status: 'ok', summary: t('{chip} on {port}.', { chip: id.value.chip, port: port.path }) };
    },
    fallbacks: [{ id: 'retry', label: 'Try again', kind: 'retry' }],
  };
}

/** The port to use without asking: one whose USB ids match the selected board, else any dev board. */
export function pickPort(ports: PortInfo[], boardId?: string): PortInfo | undefined {
  return (
    (boardId ? ports.find((p) => p.boardIds?.includes(boardId)) : undefined) ??
    ports.find((p) => p.likelyBoard) ??
    (ports.length === 1 ? ports[0] : undefined)
  );
}

/** Warn (as a suggestion) when a port's USB ids point to other boards than the selected one. */
export function checkPortBoard(ctx: FlowContext, port: PortInfo) {
  const ids = port.boardIds ?? [];
  if (!ids.length || ids.includes(ctx.board.id)) return;
  const names = ids.map((id) => BOARDS[id]?.name ?? id).join(', ');
  ctx.log('warning', t('The USB ids on {port} match: {boards}. The project is set to the {board}. If yours is different, pick it with the board button at the top.', { port: port.path, boards: names, board: ctx.board.name }), {
    source: 'suggestion (USB ids; several boards can share one USB chip)',
  });
}

/**
 * Look before asking: when the project is still empty and the chip that answered does not fit the
 * selected board, switch the project to the board that fits (USB ids break ties, e.g. Pico vs Pico W).
 * A project that already has parts is never changed; checkChipBoard warns instead.
 */
const FAMILY_NAME: Record<BoardDef['family'], RegExp> = {
  esp32: /ESP32/,
  esp32s3: /ESP32-S3/,
  esp32c3: /ESP32-C3/,
  rp2040: /RP2040/,
  rp2350: /RP2350/,
  avr: /ATMEGA/,
  stm32: /STM32/,
  nrf52: /NRF52/,
  imxrt: /IMXRT|MIMXRT|TEENSY/,
};

export async function adoptDetectedBoard(ctx: FlowContext, chip: string): Promise<boolean> {
  if (ctx.scene().parts.length) return false;
  // chipMatchesBoard is lenient on purpose (it only warns); switching needs the chip to name the family.
  const fits = Object.values(BOARDS).filter((b) => chipMatchesBoard(chip, b) && FAMILY_NAME[b.family].test(chip.toUpperCase()));
  if (!fits.length || fits.some((b) => b.id === ctx.board.id)) return false;
  const ports = await ctx.hw.listPorts();
  const ids = ports.ok ? (ports.value.find((p) => p.path === ctx.data.port)?.boardIds ?? []) : [];
  const pick = fits.find((b) => ids.includes(b.id)) ?? (fits.length === 1 ? fits[0] : undefined);
  if (!pick) return false;
  ctx.updateScene((s) => ({ ...s, board: pick.id }));
  ctx.log('found', t('Your project now uses the {board}, the board that answered on USB.', { board: pick.name }), { source: 'measured: chip identity', target: 'part:board' });
  return true;
}

/** Warn when the chip that answered does not fit the selected board. */
export function checkChipBoard(ctx: FlowContext, chip: string) {
  if (chipMatchesBoard(chip, ctx.board)) return;
  ctx.log('warning', t('The board answered as {chip}, but the project is set to the {board}. Pick the right board with the board button at the top, so pin rules and flashing match.', { chip, board: ctx.board.name }), {
    source: 'measured: chip identity',
    target: 'part:board',
  });
}

/**
 * Confirm, back up, and install the diagnostic agent. Skipped when the agent already answers.
 * Boards without an agent build go straight to the wiring check (no dead end).
 */
export function installAgentSteps(): StepDef[] {
  return [
    {
      id: 'agent-unavailable',
      type: 'auto',
      title: 'Check the diagnostic agent',
      when: (ctx) => !ctx.board.toolchain.agent,
      async run(ctx) {
        ctx.log('info', t('The diagnostic agent is not available for the {board} yet, so the app checks your wiring drawing instead.', { board: ctx.board.name }), {
          source: `library: ${ctx.board.id}`,
        });
        return { status: 'warning', summary: t('No diagnostic agent for this board yet. Checking the wiring drawing instead.'), goto: 'static-result' };
      },
    },
    installAgentStep(),
  ];
}

export function installAgentStep(): StepDef {
  return {
    id: 'agent',
    type: 'confirm',
    title: 'Install the diagnostic agent',
    body:
      'To look at the pins, the app needs a small helper program on the board. This replaces your program for now.',
    confirm: {
      write: 'flash_agent',
      details: [
        'First, a full copy of the program on your board is saved on this computer (1 to 2 minutes). Boards that cannot be read back (Teensy) are not backed up.',
        'Then the diagnostic agent is written to the board.',
        'Afterwards, “Restore my firmware” puts your program back with one click.',
      ],
    },
    when: (ctx) => ctx.board.toolchain.agent && !ctx.hw.agentReady(),
    async run(ctx, answer) {
      if (answer?.kind !== 'confirm' || !answer.confirmed || !answer.token) {
        return { status: 'failed', summary: 'Not installed. Without the agent the app can only check your wiring drawing.' };
      }
      const r = await ctx.hw.installAgent(answer.token);
      if (!r.ok) return { status: 'failed', summary: fmtErr(r.error) };
      return { status: 'ok', summary: t('Agent {ver} is running.', { ver: r.value.ver }) };
    },
    fallbacks: [
      { id: 'retry', label: 'Show the confirmation again', kind: 'retry' },
      { id: 'wiring', label: 'Only check my wiring drawing', kind: 'goto', goto: 'static-result' },
    ],
  };
}

export interface I2cTarget {
  inst: ScenePart;
  def: PartDef;
  sdaPin: string;
  sclPin: string;
  sda: number;
  scl: number;
}

/** The I2C part the flow is about, with the board pins its SDA/SCL wires go to. */
export function i2cTarget(ctx: FlowContext): I2cTarget | null {
  const scene = ctx.scene();
  const preferred = ctx.data.partInstance as string | undefined;
  const candidates = scene.parts.filter((p) => ctx.parts[p.partId]?.bus === 'i2c');
  const inst = candidates.find((p) => p.id === preferred) ?? candidates[0];
  if (!inst) return null;
  const def = ctx.parts[inst.partId];
  const sdaRole = def.pins.find((p) => p.role === 'i2c_sda')?.name ?? 'SDA';
  const sclRole = def.pins.find((p) => p.role === 'i2c_scl')?.name ?? 'SCL';
  const { i2c } = ctx.board.rules;
  const sdaPin = boardPinFor(scene, inst.id, sdaRole) ?? i2c.sda;
  const sclPin = boardPinFor(scene, inst.id, sclRole) ?? i2c.scl;
  const sda = pinById(ctx.board, sdaPin)?.gpio ?? pinById(ctx.board, i2c.sda)?.gpio ?? 0;
  const scl = pinById(ctx.board, sclPin)?.gpio ?? pinById(ctx.board, i2c.scl)?.gpio ?? 0;
  return { inst, def, sdaPin, sclPin, sda, scl };
}

export function i2cTargets(ctx: FlowContext): TargetRef[] {
  const tg = i2cTarget(ctx);
  if (!tg) return [`pin:${ctx.board.rules.i2c.sda}`, `pin:${ctx.board.rules.i2c.scl}`];
  const scene = ctx.scene();
  const out: TargetRef[] = [`pin:${tg.sdaPin}`, `pin:${tg.sclPin}`];
  const sdaW = wireFor(scene, tg.inst.id, 'SDA');
  const sclW = wireFor(scene, tg.inst.id, 'SCL');
  if (sdaW) out.push(`wire:${sdaW.id}`);
  if (sclW) out.push(`wire:${sclW.id}`);
  return out;
}

export const ok = (summary: string): StepOutcome => ({ status: 'ok', summary });
export const warn = (summary: string, goto?: string): StepOutcome => ({ status: 'warning', summary, goto });
export const failed = (summary: string): StepOutcome => ({ status: 'failed', summary });
