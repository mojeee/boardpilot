// Tools the assistant may call. Read-only tools run through the HardwareHub; write tools only
// ask the UI to show a confirmation dialog. The model never gets a confirmation token.
// Tool definitions are provider-neutral (ToolSpec); providers/*.ts convert them for Claude, GPT and Gemini.

import type { AiChoice, LogEntry, PartDef, Scene, TargetRef, WriteRequest } from '@shared/types';
import { ACTION_IDS, APP_ACTIONS, type AppActionId } from '@shared/actions';
import { BOARDS, PARTS } from '@shared/board';
import { checkSpec, normalizeSpec, panelOf, rotatedSize, ICONS, type DisplaySpec, type SpecProblem } from '@shared/displaySpec';
import { buildProposal, checkScene, partDetails, proposalForModel, searchParts, type ProjectProposal, type ProposalInput } from '@shared/projectBuilder';
import type { HardwareHub } from '../hardware/hub';
import type { JsonSchema, ToolSpec } from './providers/types';

// Written as strict JSON Schema; providers/schema.ts adapts it (Gemini subset, OpenAI strict check).
const obj = (properties: Record<string, unknown>, required: string[]): JsonSchema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

const gpio = { type: 'integer', description: 'GPIO number of a board pin as listed in the context (the "gpio" field), e.g. 21 for D21 on an ESP32' };

export const TOOLS: ToolSpec[] = [
  {
    name: 'read_pins',
    description: 'Read the current mode and digital level of every exposed GPIO through the diagnostic agent. Voltage (mv) is present only for pins the ADC measured.',
    parameters: obj({}, []),
  },
  {
    name: 'pullup_check',
    description: 'Check whether pins have an external pull-up: internal pulls are disabled and the level read. HIGH with nothing driving it means an external pull-up.',
    parameters: obj({ pins: { type: 'array', items: gpio } }, ['pins']),
  },
  {
    name: 'i2c_scan',
    description: 'Scan the I2C bus with the given SDA/SCL GPIOs. To test for crossed wires, scan once as wired and once with sda and scl exchanged.',
    parameters: obj({ sda: gpio, scl: gpio }, ['sda', 'scl']),
  },
  {
    name: 'i2c_read',
    description: 'Read registers from an I2C device, e.g. the ID register 0xD0 of a BME280 (expects 0x60; 0x58 means BMP280).',
    parameters: obj(
      {
        sda: gpio,
        scl: gpio,
        addr: { type: 'string', description: 'hex address like "0x76"' },
        reg: { type: 'string', description: 'hex register like "0xD0"' },
        len: { type: 'integer', minimum: 1, maximum: 32 },
      },
      ['sda', 'scl', 'addr', 'reg', 'len'],
    ),
  },
  {
    name: 'adc_read',
    description: 'Measure the voltage on an ADC-capable pin (ADC1: GPIO 32-39; ADC2 pins fail while Wi-Fi is on).',
    parameters: obj({ pin: gpio }, ['pin']),
  },
  {
    name: 'get_log',
    description: 'Get the most recent session log entries (checks, findings, user actions).',
    parameters: obj({ limit: { type: 'integer', minimum: 1, maximum: 200 } }, []),
  },
  {
    name: 'highlight',
    description: 'Focus the 3D board view on pins, wires or parts. Targets look like "pin:D21", "wire:w1", "part:bme1".',
    parameters: obj({ targets: { type: 'array', items: { type: 'string' } } }, ['targets']),
  },
  {
    name: 'ask_user',
    description: 'Ask the user a question with a few short answer options (shown as buttons). End your turn after calling this.',
    parameters: obj({ question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } } }, ['question', 'options']),
  },
  {
    name: 'app_action',
    description:
      'Run one of the app\'s own actions for the user, the same as clicking it, when they ask you to do something or cannot find it. The app shows each step and a "Show me where it is" link. ' +
      'Actions that write to the board only open the usual confirmation dialog. Actions: ' +
      APP_ACTIONS.map((a) => `${a.id} (${a.hint}${a.arg ? ` Arg: ${a.arg}.` : ''})`).join('; '),
    parameters: obj(
      {
        action: { type: 'string', enum: ACTION_IDS },
        arg: { type: 'string', description: 'the action\'s argument, or "" when it takes none' },
      },
      ['action', 'arg'],
    ),
  },
  {
    name: 'write_code',
    description:
      'Put a code suggestion in the Code panel for what the user asked (e.g. "read the temperature every 2 s"). The app writes it with the drawing and the current code, checks it against the wiring, and the user accepts it with Tab or dismisses it.',
    parameters: obj({ request: { type: 'string', description: 'what the code should do, in the user\'s words' } }, ['request']),
  },
  {
    name: 'request_flash',
    description: 'Ask the user to confirm installing the diagnostic agent (after a flash backup). Only opens a confirmation dialog; nothing is written unless the user confirms.',
    parameters: obj({ reason: { type: 'string' } }, ['reason']),
  },
  {
    name: 'request_gpio_write',
    description: 'Ask the user to confirm driving an output pin HIGH or LOW. Only opens a confirmation dialog.',
    parameters: obj({ pin: gpio, level: { type: 'integer', enum: [0, 1] }, reason: { type: 'string' } }, ['pin', 'level', 'reason']),
  },
  {
    name: 'search_parts',
    description:
      'Search the BoardPilot parts library (the only parts the app can draw, wire and check). Returns matching parts with the facts that tell them apart: what they measure, bus, supply voltage, I2C addresses, on-board pull-ups, how they fit this board\'s logic voltage, known traps and typical current. Use several short queries ("temperature humidity", "oled display", "relay").',
    parameters: obj(
      {
        query: { type: 'string', description: 'a few words: what it measures or does, a chip name, a part type' },
        category: { type: ['string', 'null'], enum: ['sensor', 'display', 'output', 'input', null], description: 'only this category, or null' },
        limit: { type: 'integer', minimum: 1, maximum: 12 },
      },
      ['query', 'category', 'limit'],
    ),
  },
  {
    name: 'get_part',
    description: 'Full library entry of one part by id: every pin with its role and notes, chip-ID check, sourced gotchas, current and datasheet sources.',
    parameters: obj({ partId: { type: 'string' } }, ['partId']),
  },
  {
    name: 'offer_choices',
    description:
      'Show the user 2-4 options as cards, each with a short label and one or two sentences on what makes it different (price class, accuracy, voltage, wiring effort, what it can or cannot do). Use it when the choice is the user\'s: which sensor, which display, battery or USB power. Set partId when an option is a library part, else null. End your turn after calling this; the pick arrives as the next message.',
    parameters: obj(
      {
        question: { type: 'string' },
        choices: {
          type: 'array',
          items: obj({ label: { type: 'string' }, detail: { type: 'string' }, partId: { type: ['string', 'null'] } }, ['label', 'detail', 'partId']),
        },
      },
      ['question', 'choices'],
    ),
  },
  {
    name: 'propose_project',
    description:
      'Build a complete project proposal from library parts: the app places the parts, uses the wires you name (board pin id or label, part pin name), picks safe pins for every pin you leave out, then runs the wiring checker. Returns the wiring, errors, warnings, unwired pins and extras to buy. Nothing changes in the user\'s project until they press Apply on the card. If the result has errors or unwired pins, fix them and call this again. Leave wires empty to let the app pick every pin (recommended unless the user asked for specific pins).',
    parameters: obj(
      {
        title: { type: 'string', description: 'short project name, e.g. "Weather station"' },
        summary: { type: 'string', description: 'one or two sentences: what the project does' },
        board: { type: ['string', 'null'], description: 'board id from the board list when the user wants another board than the current one; null keeps the current board' },
        keepExisting: { type: 'boolean', description: 'true to add to the parts already in the project, false to start a new project' },
        parts: {
          type: 'array',
          items: obj(
            {
              id: { type: 'string', description: 'short instance id like "bme1", "led1"' },
              partId: { type: 'string', description: 'library id returned by search_parts' },
              label: { type: 'string', description: 'name shown in 3D, e.g. "Status LED"' },
              why: { type: 'string', description: 'one sentence: why this part' },
            },
            ['id', 'partId', 'label', 'why'],
          ),
        },
        wires: {
          type: 'array',
          description: 'board pin to part pin; a board pin may also feed a passive pin, e.g. VBUS or 5V to a MOSFET module VIN',
          items: obj({ boardPin: { type: 'string' }, part: { type: 'string', description: 'instance id from parts' }, pin: { type: 'string', description: 'part pin name, e.g. SDA' } }, ['boardPin', 'part', 'pin']),
        },
        links: {
          type: 'array',
          description: 'part pin to part pin, e.g. a pump\'s + and - to a MOSFET module\'s V+ and V-, or a lock to a relay\'s COM and NO',
          items: obj({ fromPart: { type: 'string' }, fromPin: { type: 'string' }, toPart: { type: 'string' }, toPin: { type: 'string' } }, ['fromPart', 'fromPin', 'toPart', 'toPin']),
        },
      },
      ['title', 'summary', 'board', 'keepExisting', 'parts', 'wires', 'links'],
    ),
  },
  {
    name: 'get_display',
    description:
      'Facts about a display module in the project, before you design what it shows: resolution, colour type, controller, whether BoardPilot can write its code, and the current Display Studio design if any.',
    parameters: obj({ part: { type: 'string', description: 'scene part id of the display, e.g. "tft1"' } }, ['part']),
  },
  {
    name: 'design_display',
    description:
      'Design what a display module shows (Display Studio): screens made of elements, the changes between screens, and the values shown (simulated in the app). The app checks it against the panel (size, unknown values, missing screens), shows it animated in the chat with an Apply button and writes matching Arduino code on request. Fix every error it reports and call again before you answer. ' +
      'Coordinates are pixels from the top-left of the rotated screen. Text uses a 5x7 font in 6x8 cells: a line is 6*size*chars-size wide and 8*size-size tall; "{name}" inserts a value; "°" works. ' +
      'Elements (type and fields): text {x,y,text,size 1-8,color,align left|center|right}; rect {x,y,w,h,color,fill}; line {x,y,x2,y2,color}; circle {x,y,r,color,fill}; bar {x,y,w,h,value,min,max,color,vertical}; graph {x,y,w,h,value,min,max,color} (history, one sample every 250 ms); gauge {x,y,r,value,min,max,color,startDeg,endDeg,ticks} (a dial with scale marks and a needle; degrees clockwise from 12 o\'clock, e.g. -120 to 120); ' +
      `icon {x,y,name,scale,color} (8x8, names: ${ICONS.join(', ')}); pattern {x,y,w,h,kind,size,speed,colors} (kinds: colorbars, checker, gradient (no colors on a colour panel = rainbow), grid, stripes, scroll, rings, bounce (ball of radius size), fill (cycles colors every size*100 ms); speed in pixels per second, 0 = still). ` +
      'Every element may have visibleIf (e.g. "temp > 30", "temp > 30 && hum < 40", "alarm || !ok") and blinkMs. Colours: "#RRGGBB" or names; on one-colour panels light colours are on, dark are off. ' +
      'Values: {name, source: {sim: wave|ramp (min,max,periodS) | steps (values, everyS) | random (min,max,everyS)}, unit, digits, from: the part and quantity on the real board, e.g. "bme1.temperature", or ""}. Transitions: {from, to, afterMs, when}.',
    parameters: obj(
      {
        title: { type: 'string' },
        part: { type: 'string', description: 'scene part id of the display' },
        rotation: { type: 'integer', minimum: 0, maximum: 3 },
        vars: { type: 'array', items: { type: 'object' } },
        screens: { type: 'array', items: { type: 'object', description: '{id, background, elements: [...]}' } },
        start: { type: 'string', description: 'id of the first screen' },
        transitions: { type: 'array', items: { type: 'object' } },
      },
      ['title', 'part', 'rotation', 'vars', 'screens', 'start', 'transitions'],
    ),
  },
  {
    name: 'check_project',
    description: 'Run the wiring checker on the user\'s current project (as drawn now) and list its wiring, errors, warnings, unwired pins and extras to buy.',
    parameters: obj({}, []),
  },
];

/** The board argument of propose_project: null, "", '""' or "current" keep the current board. */
export function boardArg(v: unknown): string {
  const b = typeof v === 'string' ? v.trim().replace(/^["']+|["']+$/g, '').trim() : '';
  return /^(current|same|keep|none|null)$/i.test(b) ? '' : b;
}


export const MEASUREMENT_TOOLS = new Set(['read_pins', 'pullup_check', 'i2c_scan', 'i2c_read', 'adc_read']);

export interface ToolTurnState {
  highlight: TargetRef[];
  ask?: { question: string; options: string[] };
  pendingWrite?: WriteRequest;
  /** app actions to run after the reply, in order */
  actions?: { action: AppActionId; arg: string }[];
  /** a code suggestion to write in the Code panel */
  codeRequest?: string;
  choices?: { question: string; choices: AiChoice[] };
  proposal?: ProjectProposal;
  display?: { spec: DisplaySpec; problems: SpecProblem[] };
  calls: { name: string; input: unknown; ok: boolean; error?: string }[];
}

/** What the builder tools need besides the hardware: the project as drawn and the parts library. */
export interface BuilderContext {
  scene: Scene;
  parts?: Record<string, PartDef>;
}

const num = (v: unknown, name: string): number => {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`${name} must be an integer`);
  return v;
};
const str = (v: unknown, name: string): string => {
  if (typeof v !== 'string') throw new Error(`${name} must be a string`);
  return v;
};

export async function runTool(
  name: string,
  rawInput: unknown,
  hub: HardwareHub,
  log: LogEntry[],
  turn: ToolTurnState,
  builder?: BuilderContext,
): Promise<{ content: string; isError: boolean }> {
  const input = (typeof rawInput === 'object' && rawInput !== null ? rawInput : {}) as Record<string, unknown>;
  const done = (value: unknown) => ({ content: JSON.stringify(value), isError: false });
  try {
    switch (name) {
      case 'read_pins': {
        const r = await hub.agent({ cmd: 'pins' });
        return r.ok ? done(r.value) : { content: JSON.stringify(r.error), isError: true };
      }
      case 'pullup_check': {
        const pins = Array.isArray(input.pins) ? input.pins.map((p) => num(p, 'pin')) : [];
        const r = await hub.agent({ cmd: 'pullup_check', pins });
        return r.ok ? done(r.value) : { content: JSON.stringify(r.error), isError: true };
      }
      case 'i2c_scan': {
        const r = await hub.agent({ cmd: 'i2c_scan', sda: num(input.sda, 'sda'), scl: num(input.scl, 'scl'), hz: 100000 });
        return r.ok ? done({ found: r.value.found }) : { content: JSON.stringify(r.error), isError: true };
      }
      case 'i2c_read': {
        const r = await hub.agent({
          cmd: 'i2c_read',
          sda: num(input.sda, 'sda'),
          scl: num(input.scl, 'scl'),
          addr: str(input.addr, 'addr'),
          reg: str(input.reg, 'reg'),
          len: num(input.len, 'len'),
        });
        return r.ok ? done({ data: r.value.data }) : { content: JSON.stringify(r.error), isError: true };
      }
      case 'adc_read': {
        const r = await hub.agent({ cmd: 'adc', pin: num(input.pin, 'pin') });
        return r.ok ? done(r.value) : { content: JSON.stringify(r.error), isError: true };
      }
      case 'get_log': {
        const limit = typeof input.limit === 'number' ? input.limit : 50;
        return done(log.slice(-limit).map((e) => ({ type: e.type, text: e.text, source: e.source, target: e.target })));
      }
      case 'highlight': {
        const targets = (Array.isArray(input.targets) ? input.targets : []).filter(
          (t): t is TargetRef => typeof t === 'string' && /^(pin|wire|part):.+/.test(t),
        );
        turn.highlight.push(...targets);
        return done({ highlighted: targets });
      }
      case 'ask_user': {
        if (turn.choices || turn.ask) return { content: 'One question per turn: the user already sees a question. Finish your reply now.', isError: true };
        turn.ask = {
          question: str(input.question, 'question'),
          options: (Array.isArray(input.options) ? input.options : []).filter((o): o is string => typeof o === 'string').slice(0, 5),
        };
        return done({ shown: true, note: 'The question is shown to the user. Finish your reply now; their answer arrives as the next message.' });
      }
      case 'app_action': {
        const action = str(input.action, 'action');
        if (!(ACTION_IDS as string[]).includes(action)) throw new Error(`unknown action ${action}`);
        const arg = typeof input.arg === 'string' ? input.arg : '';
        (turn.actions ??= []).push({ action: action as AppActionId, arg });
        if (turn.actions.length > 4) throw new Error('at most 4 actions per answer');
        const def = APP_ACTIONS.find((a) => a.id === action);
        return done({
          queued: true,
          note: def?.writes
            ? 'The app opens its confirmation dialog for this; nothing is written unless the user confirms. Tell the user what will happen.'
            : 'The app runs this right after your reply and shows each step to the user.',
        });
      }
      case 'write_code': {
        turn.codeRequest = str(input.request, 'request');
        return done({ queued: true, note: 'A code suggestion will appear in the Code panel for the user to accept or dismiss.' });
      }
      case 'request_flash': {
        turn.pendingWrite = { kind: 'flash_agent', reason: str(input.reason, 'reason') };
        return done({ dialogShown: true, note: 'A confirmation dialog is shown. Nothing has been written. Tell the user what will happen if they confirm.' });
      }
      case 'request_gpio_write': {
        const level = num(input.level, 'level');
        turn.pendingWrite = { kind: 'gpio_write', pin: num(input.pin, 'pin'), level: level === 1 ? 1 : 0, reason: str(input.reason, 'reason') };
        return done({ dialogShown: true, note: 'A confirmation dialog is shown. Nothing has been written yet.' });
      }
      case 'search_parts': {
        const parts = builder?.parts ?? PARTS;
        const board = BOARDS[builder?.scene.board ?? ''] ?? Object.values(BOARDS)[0];
        const cat = input.category;
        const category = cat === 'sensor' || cat === 'display' || cat === 'output' || cat === 'input' ? cat : null;
        const limit = typeof input.limit === 'number' ? input.limit : 6;
        const found = searchParts(str(input.query, 'query'), parts, board, { category, limit });
        return done(found.length ? { board: board.id, parts: found } : { board: board.id, parts: [], note: 'No match. Try other words, e.g. what it measures or the chip name.' });
      }
      case 'get_part': {
        const parts = builder?.parts ?? PARTS;
        const id = str(input.partId, 'partId');
        const def = parts[id];
        const board = BOARDS[builder?.scene.board ?? ''] ?? Object.values(BOARDS)[0];
        if (!def) return { content: `No part "${id}" in the library. Use search_parts to find ids.`, isError: true };
        return done(partDetails(def, board));
      }
      case 'offer_choices': {
        const raw = Array.isArray(input.choices) ? input.choices : [];
        const parts = builder?.parts ?? PARTS;
        const choices: AiChoice[] = raw
          .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
          .map((c) => ({
            label: typeof c.label === 'string' ? c.label.slice(0, 80) : '',
            detail: typeof c.detail === 'string' ? c.detail.slice(0, 400) : '',
            ...(typeof c.partId === 'string' && parts[c.partId] ? { partId: c.partId } : {}),
          }))
          .filter((c) => c.label)
          .slice(0, 4);
        if (choices.length < 2) return { content: 'Give at least two choices, each with a label.', isError: true };
        if (turn.choices || turn.ask) return { content: 'One question per turn: the user already sees a question. Finish your reply now.', isError: true };
        turn.choices = { question: str(input.question, 'question'), choices };
        return done({ shown: true, note: 'The cards are shown. Finish your reply now with a short message; the user\'s pick arrives as the next message.' });
      }
      case 'propose_project': {
        if (!builder) return { content: 'Projects can only be built from the app.', isError: true };
        const parts = builder.parts ?? PARTS;
        const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v.filter((x) => typeof x === 'object' && x !== null) as T[]) : []);
        const s = (v: unknown) => (typeof v === 'string' ? v : '');
        const req: ProposalInput = {
          title: s(input.title),
          summary: s(input.summary),
          board: boardArg(input.board),
          keepExisting: input.keepExisting === true,
          parts: list<Record<string, unknown>>(input.parts).map((p) => ({ id: s(p.id), partId: s(p.partId), label: s(p.label), why: s(p.why) })),
          wires: list<Record<string, unknown>>(input.wires).map((w) => ({ boardPin: s(w.boardPin), part: s(w.part), pin: s(w.pin) })),
          links: list<Record<string, unknown>>(input.links).map((w) => ({ fromPart: s(w.fromPart), fromPin: s(w.fromPin), toPart: s(w.toPart), toPin: s(w.toPin) })),
        };
        const r = buildProposal(req, builder.scene, parts);
        if (!r.ok) return { content: JSON.stringify({ built: false, errors: r.errors }), isError: true };
        turn.proposal = r.proposal;
        const facts = proposalForModel(r.proposal);
        const ok = !facts.errors.length && !facts.unwired.length;
        return done({
          built: true,
          ...facts,
          next: ok
            ? 'The proposal card is shown with an Apply button. Explain it briefly; mention warnings and extras to buy.'
            : 'Fix the errors or unwired pins (other parts, other pins, or keepExisting) and call propose_project again before you answer.',
        });
      }
      case 'get_display':
      case 'design_display': {
        if (!builder) return { content: 'Displays can only be designed in the app.', isError: true };
        const parts = builder.parts ?? PARTS;
        const partId = str(input.part, 'part');
        // The display may be in the drawing or in a proposal made earlier in this answer.
        const scene = turn.proposal?.scene.parts.some((p) => p.id === partId) ? turn.proposal.scene : builder.scene;
        const inst = scene.parts.find((p) => p.id === partId);
        const def = inst ? parts[inst.partId] : undefined;
        const panel = def ? panelOf(def) : null;
        if (!inst || !def || !panel) {
          const displays = scene.parts.filter((p) => parts[p.partId] && panelOf(parts[p.partId])).map((p) => `${p.id} (${parts[p.partId].name})`);
          return {
            content: `"${partId}" is not a pixel display in the project. Displays in the project: ${displays.join(', ') || 'none'}. Add one with propose_project first (search_parts "display").`,
            isError: true,
          };
        }
        const codeFor = ['SSD1306', 'SH1106', 'ST7789', 'ST7735', 'ILI9341', 'GC9A01'];
        const facts = {
          part: partId,
          name: def.name,
          widthPx: panel.widthPx,
          heightPx: panel.heightPx,
          colour: panel.color === 'rgb565' ? '16-bit colour (RGB565)' : panel.color === 'mono' ? 'one colour (on/off pixels)' : 'e-paper, black and white, slow refresh',
          round: panel.round,
          controller: panel.controller,
          codeGenerator: codeFor.includes(panel.controller) ? 'yes (Adafruit GFX driver)' : 'no: the preview works, code must be written by hand',
        };
        if (name === 'get_display') {
          const current = builder.scene.displays?.find((d) => d.part === partId);
          return done({ ...facts, currentDesign: current ?? null });
        }
        const spec = normalizeSpec({ ...input, part: partId });
        const problems = checkSpec(spec, panel);
        turn.display = { spec, problems };
        const [w, h] = rotatedSize(panel, spec.rotation);
        const errors = problems.filter((p) => p.severity === 'error').map((p) => p.message);
        return done({
          shown: true,
          screen: `${w}x${h} after rotation ${spec.rotation}`,
          screens: spec.screens.map((s) => `${s.id}: ${s.elements.length} elements`),
          errors,
          warnings: problems.filter((p) => p.severity === 'warning').map((p) => p.message),
          next: errors.length
            ? 'Fix the errors and call design_display again before you answer.'
            : 'The animated preview is shown with an Apply button; the user can then press "Write the code". Explain the screens and timing briefly; say values are simulated until the TODO lines read the real sensors.',
        });
      }
      case 'check_project': {
        if (!builder) return { content: 'No project available.', isError: true };
        return done(checkScene(builder.scene, builder.parts ?? PARTS));
      }
      default:
        return { content: `Unknown tool ${name}`, isError: true };
    }
  } catch (e) {
    return { content: `Invalid input: ${e instanceof Error ? e.message : String(e)}`, isError: true };
  }
}
