// Template projects (templates/<id>.json): ready-made projects that build on any board. This module
// turns a template into a scene (parts + wires from the board's own pin rules), the Arduino code
// for that board, and a simulated run that tells the story of what the program does, step by step.
//
// Code placeholders (see docs/templates.md):
//   {NAME}          the pin wired to template pin NAME, written the way the board's core wants it
//   {READ_MV:NAME}  an expression reading millivolts on that pin
//   {I2C_BEGIN}     the I2C start lines for the board (alone on its line)
//   {BOARD}         the board name

import type { BoardDef, PartDef, Scene, TargetRef } from './types';
import { assignPins } from './assign';
import { isEspFamily, pinById } from './board';
import { t } from './i18n';

export type SimInput =
  | { wave: { min: number; max: number; periodS: number } }
  | { pulses: { everyS: number; highS: number; offsetS?: number } }
  | { level: { start: number; perSecond: number; min: number; max: number } };

export type SimAction =
  | { step: string }
  | { state: string }
  | { event: string }
  | { read: string; as: string; unit?: string; digits?: number; invert?: boolean }
  | { write: string; level: 0 | 1 }
  | { toggle: string }
  | { show: string; text: string }
  | { bump: string; by: number }
  | { wait: number }
  | { set: string; value: number | string }
  /** starts a timer; the condition "<name>_done" is true once `ms` have passed */
  | { timer: string; ms: number }
  | { if: string; then: SimAction[]; else?: SimAction[] };

export interface TemplateDef {
  id: string;
  name: string;
  summary: string;
  difficulty: 'first steps' | 'easy' | 'medium';
  minutes: number;
  learn: string[];
  needs?: ('wifi' | 'adc')[];
  parts: { id: string; partId: string; label?: string }[];
  /** Symbolic pin names used in the code and the simulator → a part pin. */
  pins: Record<string, { part: string; pin: string }>;
  libraries?: string[];
  notes?: string[];
  code: { includes?: string[]; globals?: string[]; setup: string[]; loop: string[] };
  sim: { loopMs: number; inputs: Record<string, SimInput>; vars?: Record<string, number | string>; loop: SimAction[] };
  sources: { title: string; section?: string }[];
}

const FILES = import.meta.glob<{ default: unknown }>('../templates/*.json', { eager: true });
export const TEMPLATES: TemplateDef[] = Object.values(FILES)
  .map((m) => m.default as TemplateDef)
  .sort((a, b) => ['first steps', 'easy', 'medium'].indexOf(a.difficulty) - ['first steps', 'easy', 'medium'].indexOf(b.difficulty) || a.minutes - b.minutes);

/** Can this template run on this board? Returns the reason when it cannot. */
export function templateFits(tpl: TemplateDef, board: BoardDef): string | null {
  if (tpl.needs?.includes('wifi') && !isEspFamily(board) && board.id !== 'rpi-pico-w') return t('Needs Wi-Fi (ESP32 or Pico W).');
  if (tpl.needs?.includes('adc') && !board.rules.adcPins.length) return t('Needs an analog input.');
  return null;
}

/** The template's parts in front of the board, wired with the board's own pin rules. */
export function templateScene(tpl: TemplateDef, board: BoardDef, parts: Record<string, PartDef>): Scene {
  // One row in front of the board, spaced by each part's real size, pins facing the board.
  const GAP = 18;
  const sizes = tpl.parts.map((p) => parts[p.partId]?.model.size ?? [20, 20, 5]);
  const total = sizes.reduce((a, s) => a + s[0], 0) + GAP * (sizes.length - 1);
  let x = -total / 2;
  const scene: Scene = {
    board: board.id,
    parts: tpl.parts.map((p, i) => {
      const [w, d] = sizes[i];
      const cx = x + w / 2;
      x += w + GAP;
      return { id: p.id, partId: p.partId, label: p.label, confirmed: true, position: [Math.round(cx), 0, Math.round(board.pcbMm.width / 2 + 22 + d / 2)] as [number, number, number] };
    }),
    wires: [],
  };
  return assignPins(scene, board, parts).scene;
}

/** Board pin wired to a template pin name (TRIG → the pin of sonar1.TRIG). */
export function templatePin(tpl: TemplateDef, scene: Scene, board: BoardDef, name: string) {
  const ref = tpl.pins[name];
  if (!ref) return undefined;
  const w = scene.wires.find((x) => (x.to.part === ref.part && x.to.pin === ref.pin) || (x.from.part === ref.part && x.from.pin === ref.pin));
  if (!w) return undefined;
  return pinById(board, w.from.part === 'board' ? w.from.pin : w.to.pin);
}

/** STM32duino pin name: the chip pin (PA5), from chipPin or from an id that already is one. */
export function stm32Name(p: { id: string; chipPin?: string; gpio: number | null }): string {
  return p.chipPin ?? (/^P[A-K]\d+$/.test(p.id) ? p.id : String(p.gpio));
}

/** How a pin is written in code on this board: the GPIO number, or the STM32 pin name. */
function pinExpr(board: BoardDef, gpio: number | null, label: string): string {
  if (gpio === null) return label;
  const p = board.pins.find((x) => x.gpio === gpio && x.kind === 'gpio');
  if (board.family === 'stm32' && p) return stm32Name(p);
  if (board.family === 'nrf52' && p) return p.id.replace(/^D/, '');
  return String(gpio);
}

function i2cBegin(board: BoardDef, scene: Scene): string[] {
  const sda = pinById(board, board.rules.i2c.sda);
  const scl = pinById(board, board.rules.i2c.scl);
  if (isEspFamily(board)) return [`  Wire.begin(${pinExpr(board, sda?.gpio ?? null, 'SDA')}, ${pinExpr(board, scl?.gpio ?? null, 'SCL')});  // SDA, SCL`];
  if (board.family === 'rp2040' || board.family === 'rp2350' || board.family === 'stm32')
    return [`  Wire.setSDA(${pinExpr(board, sda?.gpio ?? null, 'SDA')});`, `  Wire.setSCL(${pinExpr(board, scl?.gpio ?? null, 'SCL')});`, '  Wire.begin();'];
  void scene;
  return [`  Wire.begin();  // fixed I2C pins on this board: SDA = ${sda?.label ?? '?'}, SCL = ${scl?.label ?? '?'}`];
}

function readMv(board: BoardDef, pin: string): string {
  if (isEspFamily(board)) return `analogReadMilliVolts(${pin})`;
  const bits = board.family === 'avr' ? 1023 : 4095;
  return `((long)analogRead(${pin}) * ${board.rules.adcMaxMv}L / ${bits})`;
}

/** The Arduino sketch for this template on this board. */
export function templateCode(tpl: TemplateDef, board: BoardDef, scene: Scene): string {
  const pin = (name: string) => {
    const p = templatePin(tpl, scene, board, name);
    return p ? pinExpr(board, p.gpio, p.label) : `/* ${name}: not wired */ -1`;
  };
  const fill = (line: string) =>
    line
      .replace(/\{READ_MV:(\w+)\}/g, (_, n: string) => readMv(board, pin(n)))
      .replace(/\{BOARD\}/g, board.name)
      .replace(/\{([A-Z][A-Z0-9_]*)\}/g, (m, n: string) => (tpl.pins[n] ? pin(n) : m));
  const needsAnalogRes = !isEspFamily(board) && board.family !== 'avr' && tpl.code.loop.concat(tpl.code.setup).some((l) => l.includes('{READ_MV:'));
  const setup = tpl.code.setup.flatMap((l) => (l.trim() === '{I2C_BEGIN}' ? i2cBegin(board, scene) : [fill(l)]));
  if (needsAnalogRes) setup.unshift('  analogReadResolution(12);');
  const wiring = Object.keys(tpl.pins).map((n) => {
    const p = templatePin(tpl, scene, board, n);
    const ref = tpl.pins[n];
    return `//   ${n.padEnd(8)} ${ref.part}.${ref.pin} → ${p ? p.label : '?'}`;
  });
  const out = [
    `// ${tpl.name} — BoardPilot template for ${board.name}`,
    `// ${tpl.summary}`,
    '//',
    '// Wiring (as in the 3D view):',
    ...wiring,
    ...(tpl.libraries?.length ? ['//', `// Libraries (Arduino Library Manager): ${tpl.libraries.join(', ')}, BoardPilotProbe`] : ['//', '// Library (Arduino Library Manager): BoardPilotProbe']),
    ...(tpl.notes ?? []).map((n) => `// ${n}`),
    '',
    ...(tpl.code.includes ?? []).map(fill),
    '#include <BoardPilotProbe.h>',
    '',
    'BoardPilotProbe probe(Serial);  // tells BoardPilot what the program is doing',
    ...(tpl.code.globals ?? []).map(fill),
    '',
    'void setup() {',
    ...setup,
    '}',
    '',
    'void loop() {',
    ...tpl.code.loop.map(fill),
    '}',
    '',
  ];
  return out.join('\n');
}

/** Line (1-based) of each probe.step("…") in the code, for highlighting the running step. */
export function stepLines(code: string): Map<string, number> {
  const out = new Map<string, number>();
  code.split('\n').forEach((l, i) => {
    const m = /probe\.step\("([^"]+)"\)/.exec(l);
    if (m && !out.has(m[1])) out.set(m[1], i + 1);
  });
  return out;
}

/* ---------------- simulated run ---------------- */

export interface StoryItem {
  /** simulated milliseconds since the start */
  t: number;
  kind: 'step' | 'state' | 'event' | 'value' | 'pin' | 'show';
  /** plain-language text, already translated */
  text: string;
  targets: TargetRef[];
  /** kind "pin": GPIO and level; kind "value": name and value; kind "show": part and text */
  gpio?: number;
  level?: 0 | 1;
  name?: string;
  value?: number;
  part?: string;
  /** the step this item belongs to (for code highlighting) */
  step?: string;
  /** a value that did not change enough to be worth a story line (still updates the 3D labels) */
  quiet?: boolean;
}

/** Runs the template's behaviour model in simulated time. Everything it produces is simulated. */
export class TemplateRun {
  t = 0;
  private vars: Record<string, number | string> = {};
  private levels: Record<string, 0 | 1> = {};
  private bumps: Record<string, number> = {};
  private timers: Record<string, { at: number; ms: number }> = {};
  private told: Record<string, { text: string; t: number }> = {};
  private lastStep = '';
  private lastState = '';
  private queue: SimAction[] = [];

  constructor(
    private tpl: TemplateDef,
    private board: BoardDef,
    private scene: Scene,
  ) {
    this.vars = { ...(tpl.sim.vars ?? {}) };
  }

  /** Pin label of a template pin name, e.g. PUMP → "D25". Also usable in texts as {PUMP}. */
  private label(name: string) {
    return templatePin(this.tpl, this.scene, this.board, name)?.label ?? name;
  }

  private targetsFor(name: string): TargetRef[] {
    const p = templatePin(this.tpl, this.scene, this.board, name);
    const ref = this.tpl.pins[name];
    const partRef = ref ?? (this.tpl.parts.some((x) => x.id === name) ? { part: name } : undefined);
    return [...(p ? [`pin:${p.id}` as TargetRef] : []), ...(partRef ? [`part:${partRef.part}` as TargetRef] : [])];
  }

  /** Current value of a simulated input at time t (seconds). */
  input(name: string): number {
    const def = this.tpl.sim.inputs[name];
    const s = this.t / 1000;
    if (!def) return 0;
    if ('wave' in def) {
      const { min, max, periodS } = def.wave;
      return min + ((max - min) * (1 - Math.cos((2 * Math.PI * s) / periodS))) / 2;
    }
    if ('pulses' in def) {
      const { everyS, highS, offsetS = 2 } = def.pulses;
      const x = (s - offsetS) % everyS;
      return s >= offsetS && x >= 0 && x < highS ? 1 : 0;
    }
    const { start, perSecond, min, max } = def.level;
    return Math.min(max, Math.max(min, start + perSecond * s + (this.bumps[name] ?? 0)));
  }

  private fmt(text: string): string {
    const vals: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(this.vars)) vals[k] = typeof v === 'number' ? Math.round(v * 10) / 10 : v;
    for (const n of Object.keys(this.tpl.pins)) vals[n] = this.label(n);
    return t(text, vals);
  }

  private test(cond: string): boolean {
    const m = /^\s*(\w+)\s*(<=|>=|==|!=|<|>)\s*(-?[\d.]+|\w+)\s*$/.exec(cond);
    // Numbers are numbers; names are variables (unknown ones read 0); "<timer>_done" is a timer.
    const get = (x: string): number => {
      if (/^-?[\d.]+$/.test(x)) return Number(x);
      const timer = /^(\w+)_done$/.exec(x);
      if (timer && this.timers[timer[1]]) return this.t - this.timers[timer[1]].at >= this.timers[timer[1]].ms ? 1 : 0;
      return Number(this.vars[x] ?? 0) || 0;
    };
    if (!m) {
      const neg = cond.trim().startsWith('!');
      return !!get(cond.trim().replace(/^!/, '')) !== neg;
    }
    const a = get(m[1]);
    const b = get(m[3]);
    return { '<': a < b, '<=': a <= b, '>': a > b, '>=': a >= b, '==': a === b, '!=': a !== b }[m[2] as '<'];
  }

  /** Runs actions until time has to pass (a wait or the end of loop()); returns what happened. */
  next(): StoryItem[] {
    const out: StoryItem[] = [];
    if (!this.queue.length) this.queue = [...this.tpl.sim.loop, { wait: this.tpl.sim.loopMs }];
    while (this.queue.length) {
      const a = this.queue.shift() as SimAction;
      const push = (item: Omit<StoryItem, 't' | 'step'>) => out.push({ t: this.t, step: this.lastStep, ...item });
      if ('wait' in a) {
        this.t += a.wait;
        if (out.length) break;
        continue;
      }
      if ('step' in a) {
        if (a.step !== this.lastStep) {
          this.lastStep = a.step;
          push({ kind: 'step', text: t(a.step), targets: [] });
        }
      } else if ('state' in a) {
        if (a.state !== this.lastState) {
          this.lastState = a.state;
          push({ kind: 'state', text: a.state, targets: [] });
        }
      } else if ('event' in a) {
        const targets = Object.keys(this.tpl.pins).filter((n) => a.event.includes(`{${n}}`)).flatMap((n) => this.targetsFor(n));
        push({ kind: 'event', text: this.fmt(a.event), targets });
      } else if ('read' in a) {
        let v = this.input(a.read);
        if (a.invert) v = v ? 0 : 1;
        this.vars[a.as] = v;
        this.t += 5;
        const shown = a.digits !== undefined ? v.toFixed(a.digits) : String(Math.round(v * 10) / 10);
        const text = `${t(a.as)}: ${shown}${a.unit ? ` ${a.unit}` : ''}`;
        // A story line only when the shown value changes, and at most once a second for readings.
        const last = this.told[a.as];
        const digital = 'pulses' in (this.tpl.sim.inputs[a.read] ?? {});
        const quiet = !!last && (last.text === text || (!digital && this.t - last.t < 1000));
        if (!quiet) this.told[a.as] = { text, t: this.t };
        push({ kind: 'value', text, targets: this.targetsFor(a.read), name: a.as, value: v, quiet });
      } else if ('write' in a || 'toggle' in a) {
        const name = 'write' in a ? a.write : a.toggle;
        const level: 0 | 1 = 'write' in a ? a.level : this.levels[name] ? 0 : 1;
        this.vars[`${name}_on`] = level;
        if (this.levels[name] === level) continue;
        this.levels[name] = level;
        const p = templatePin(this.tpl, this.scene, this.board, name);
        push({
          kind: 'pin',
          text: t('{pin} → {level}', { pin: `${name} (${p?.label ?? '?'})`, level: level ? 'HIGH' : 'LOW' }),
          targets: this.targetsFor(name),
          gpio: p?.gpio ?? undefined,
          level,
        });
      } else if ('show' in a) {
        const part = this.tpl.parts.find((x) => x.id === a.show);
        push({ kind: 'show', text: t('{part} shows “{text}”', { part: part?.label ?? a.show, text: this.fmt(a.text) }), targets: [`part:${a.show}`], part: a.show });
        out[out.length - 1].name = this.fmt(a.text);
      } else if ('bump' in a) {
        this.bumps[a.bump] = (this.bumps[a.bump] ?? 0) + a.by;
      } else if ('timer' in a) {
        this.timers[a.timer] = { at: this.t, ms: a.ms };
      } else if ('set' in a) {
        this.vars[a.set] = a.value;
      } else if ('if' in a) {
        this.queue.unshift(...(this.test(a.if) ? a.then : a.else ?? []));
      }
    }
    return out;
  }

  /** Levels of every template output pin, as GPIO → level (for the 3D pins). */
  pinLevels(): Record<number, 0 | 1> {
    const out: Record<number, 0 | 1> = {};
    for (const [name, level] of Object.entries(this.levels)) {
      const g = templatePin(this.tpl, this.scene, this.board, name)?.gpio;
      if (g !== null && g !== undefined) out[g] = level;
    }
    for (const [name] of Object.entries(this.tpl.sim.inputs)) {
      const p = templatePin(this.tpl, this.scene, this.board, name);
      const def = this.tpl.sim.inputs[name];
      if (p?.gpio !== null && p?.gpio !== undefined && 'pulses' in def) out[p.gpio] = this.input(name) ? 1 : 0;
    }
    return out;
  }
}
