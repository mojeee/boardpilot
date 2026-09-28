// Building blocks shared by several flows.

import type { StepDef, FlowContext, StepOutcome } from '@shared/flow';
import type { PartDef, ScenePart, TargetRef, PortInfo } from '@shared/types';
import { boardPinFor, pinById, wireFor } from '@shared/board';

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
        return { status: 'ok', summary: `Using ${st.chip.chip} on ${st.port}.` };
      }
      const ports = await ctx.hw.listPorts();
      if (!ports.ok) return { status: 'failed', summary: fmtErr(ports.error) };
      const port = pickPort(ports.value);
      if (!port) {
        return {
          status: 'failed',
          summary: 'No board found on USB. Plug it in with a data cable, or run “Debug a problem → Board not detected”.',
        };
      }
      const id = await ctx.hw.identify(port.path);
      if (!id.ok) return { status: 'failed', summary: fmtErr(id.error) };
      ctx.log('found', `Board: ${id.value.chip}, MAC ${id.value.mac}, flash ${id.value.flashSize}.`, { source: 'measured: esptool' });
      return { status: 'ok', summary: `${id.value.chip} on ${port.path}.` };
    },
    fallbacks: [{ id: 'retry', label: 'Try again', kind: 'retry' }],
  };
}

export function pickPort(ports: PortInfo[]): PortInfo | undefined {
  return ports.find((p) => p.likelyEsp32) ?? (ports.length === 1 ? ports[0] : undefined);
}

/** Confirm, back up, and install the diagnostic agent. Skipped when the agent already answers. */
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
        'First, a full copy of the program on your board is saved on this Mac (1 to 2 minutes).',
        'Then the diagnostic agent is written to the board.',
        'Afterwards, “Restore my firmware” puts your program back with one click.',
      ],
    },
    when: (ctx) => !ctx.hw.agentReady(),
    async run(ctx, answer) {
      if (answer?.kind !== 'confirm' || !answer.confirmed || !answer.token) {
        return { status: 'failed', summary: 'Not installed. Without the agent the app can only check your wiring drawing.' };
      }
      const r = await ctx.hw.installAgent(answer.token);
      if (!r.ok) return { status: 'failed', summary: fmtErr(r.error) };
      return { status: 'ok', summary: `Agent ${r.value.ver} is running.` };
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
  const sdaPin = boardPinFor(scene, inst.id, sdaRole) ?? 'D21';
  const sclPin = boardPinFor(scene, inst.id, sclRole) ?? 'D22';
  const sda = pinById(ctx.board, sdaPin)?.gpio ?? 21;
  const scl = pinById(ctx.board, sclPin)?.gpio ?? 22;
  return { inst, def, sdaPin, sclPin, sda, scl };
}

export function i2cTargets(ctx: FlowContext): TargetRef[] {
  const t = i2cTarget(ctx);
  if (!t) return ['pin:D21', 'pin:D22'];
  const scene = ctx.scene();
  const out: TargetRef[] = [`pin:${t.sdaPin}`, `pin:${t.sclPin}`];
  const sdaW = wireFor(scene, t.inst.id, 'SDA');
  const sclW = wireFor(scene, t.inst.id, 'SCL');
  if (sdaW) out.push(`wire:${sdaW.id}`);
  if (sclW) out.push(`wire:${sclW.id}`);
  return out;
}

export const ok = (summary: string): StepOutcome => ({ status: 'ok', summary });
export const warn = (summary: string, goto?: string): StepOutcome => ({ status: 'warning', summary, goto });
export const failed = (summary: string): StepOutcome => ({ status: 'failed', summary });
