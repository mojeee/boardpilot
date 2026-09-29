// State machine designer (issue #12): checks, round trip through a project file, diagram layout
// without overlaps, and generated C that compiles with -Wall -Werror and passes its own test.

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SM_LIMITS,
  cIdent,
  cPrefix,
  checkMachine,
  emptyMachine,
  generateCode,
  hasErrors,
  layoutMachine,
  parseStateMachine,
  rectsOverlap,
  smExamples,
  type StateMachine,
} from '@shared/statemachine';
import type { Scene } from '@shared/types';
import { setLanguage } from '@shared/i18n';

const examples = smExamples().map((e) => e.build());
const byName = (name: string) => examples.find((m) => m.name === name) as StateMachine;
const kinds = (m: StateMachine) => checkMachine(m).map((f) => `${f.severity}:${f.id.split(':')[0]}`);

/** A machine with guards, an "otherwise" branch, a self loop and an action on every kind of edge. */
const tricky: StateMachine = {
  name: 'Door lock 2!',
  initial: 's1',
  states: [
    { id: 's1', name: 'locked', note: 'Bolt out */ not a comment end' },
    { id: 's2', name: 'unlocked' },
    { id: 's3', name: 'alarm', note: 'Siren on' },
  ],
  events: [
    { id: 'e1', name: 'code ok' },
    { id: 'e2', name: 'code bad' },
    { id: 'e3', name: 'door opened' },
    { id: 'e4', name: 'timeout' },
  ],
  transitions: [
    { id: 't1', from: 's1', event: 'e1', to: 's2', action: 'retract bolt' },
    { id: 't2', from: 's1', event: 'e2', to: 's3', guard: 'third wrong try', action: 'siren on' },
    { id: 't3', from: 's1', event: 'e2', to: 's1', action: 'count the try' },
    { id: 't4', from: 's1', event: 'e3', to: 's3', guard: 'forced "open" ??/' },
    { id: 't5', from: 's2', event: 'e4', to: 's1', action: 'extend bolt' },
    { id: 't6', from: 's3', event: 'e1', to: 's1', action: 'siren off' },
  ],
};

describe('state machine checks', () => {
  it('finds nothing wrong in the starter examples except ignored events', () => {
    expect(examples.length).toBeGreaterThanOrEqual(4);
    for (const m of examples) {
      const f = checkMachine(m);
      expect(f.filter((x) => x.severity !== 'info').map((x) => x.message), m.name).toEqual([]);
    }
    expect(hasErrors(checkMachine(emptyMachine()))).toBe(false);
  });

  it('reports a missing start, empty machines and bad names', () => {
    expect(kinds({ name: 'x', initial: '', states: [], events: [], transitions: [] })).toEqual(['error:no-states']);
    const m = byName('thermostat');
    expect(kinds({ ...m, initial: 'nope' })).toContain('error:no-initial');
    expect(kinds({ ...m, states: m.states.map((s, i) => (i === 1 ? { ...s, name: 'idle' } : s)) })).toContain('error:state-dup');
    expect(kinds({ ...m, states: m.states.map((s, i) => (i === 1 ? { ...s, name: '***' } : s)) })).toContain('error:state-name');
    expect(kinds({ ...m, events: m.events.map((e, i) => (i === 0 ? { ...e, name: 'count' } : e)) })).toContain('error:event-reserved');
    expect(kinds({ ...m, transitions: [...m.transitions, { id: 'tx', from: 's1', event: 'gone', to: 's2' }] })).toContain('error:dangling');
  });

  it('reports duplicate transitions: two without a condition, or the same condition twice', () => {
    const m = byName('thermostat');
    const dup = { ...m, transitions: [...m.transitions, { ...m.transitions[0], id: 'tx', to: 's3' }] };
    expect(kinds(dup)).toContain('error:dup');
    const g1 = { ...m.transitions[0], guard: 'Really  cold' };
    const g2 = { ...m.transitions[0], id: 'tx', guard: 'really cold', to: 's3' };
    expect(kinds({ ...m, transitions: [g1, g2, ...m.transitions.slice(1)] })).toContain('error:dup-guard');
    // a condition plus an "otherwise" is fine
    expect(hasErrors(checkMachine(tricky))).toBe(false);
  });

  it('reports unreachable states, states with no way out and events nobody handles', () => {
    const m = byName('thermostat');
    const cut: StateMachine = {
      ...m,
      states: [...m.states, { id: 's9', name: 'SERVICE' }],
      events: [...m.events, { id: 'e9', name: 'NEVER' }],
      transitions: m.transitions.filter((tr) => tr.from !== 's3'),
    };
    const k = kinds(cut);
    expect(k).toContain('warning:unreachable');
    expect(k).toContain('warning:no-exit');
    expect(k).toContain('warning:unused-event');
    const unreachable = checkMachine(cut).filter((f) => f.id.startsWith('unreachable')).flatMap((f) => f.targets);
    expect(unreachable).toEqual(['s9']);
    const noExit = checkMachine(cut).filter((f) => f.id.startsWith('no-exit')).flatMap((f) => f.targets);
    expect(noExit.sort()).toEqual(['s3', 's9']);
    // per state: which events are simply ignored
    expect(checkMachine(m).some((f) => f.severity === 'info' && f.targets[0] === 's1' && f.message.includes('RESET'))).toBe(true);
  });
});

describe('state machine save and load', () => {
  it('round-trips through a project file identically', () => {
    for (const m of [...examples, tricky, emptyMachine()]) {
      const scene: Scene = { board: 'esp32-devkitc-30', parts: [], wires: [], stateMachine: m };
      const file = JSON.stringify({ format: 'boardpilot-project@1', scene, customParts: [] }, null, 2);
      const back = JSON.parse(file) as { scene: Scene };
      const parsed = parseStateMachine(back.scene.stateMachine);
      expect(parsed).toEqual(m);
      expect(JSON.stringify(parsed)).toBe(JSON.stringify(m));
    }
  });

  it('refuses a file with the wrong shape', () => {
    expect(parseStateMachine(null)).toBeNull();
    expect(parseStateMachine({ name: 'x' })).toBeNull();
    expect(parseStateMachine({ ...tricky, states: [{ id: 1, name: 'A' }] })).toBeNull();
    expect(parseStateMachine({ ...tricky, transitions: [{ ...tricky.transitions[0], guard: 5 }] })).toBeNull();
    const many = Array.from({ length: SM_LIMITS.states + 1 }, (_, i) => ({ id: `s${i}`, name: `S${i}` }));
    expect(parseStateMachine({ ...tricky, states: many })).toBeNull();
  });
});

describe('state machine C names', () => {
  it('turns names into C identifiers', () => {
    expect(cIdent('Too cold!')).toBe('Too_cold');
    expect(cIdent('2nd try')).toBe('N2nd_try');
    expect(cIdent('Umidità')).toBe('Umidita');
    expect(cIdent('***')).toBe('');
    expect(cPrefix('Door lock 2!')).toBe('door_lock_2');
    expect(cPrefix('')).toBe('sm');
  });
});

/** Nothing drawn on top of anything else; with `arrows`, no arrow runs through a box either. */
function expectClean(m: StateMachine, arrows = true) {
  const d = layoutMachine(m);
  expect(d.boxes).toHaveLength(m.states.length);
  // one arrow per pair of states, and every transition is on one arrow
  expect(d.edges.flatMap((e) => e.transitions).sort()).toEqual(m.transitions.map((tr) => tr.id).sort());
  const inside = (r: { x: number; y: number; w: number; h: number }) => r.x >= 0 && r.y >= 0 && r.x + r.w <= d.width && r.y + r.h <= d.height;
  for (const b of d.boxes) expect(inside(b), b.title).toBe(true);
  for (const [i, a] of d.boxes.entries()) for (const b of d.boxes.slice(i + 1)) expect(rectsOverlap(a, b), `${a.title}/${b.title}`).toBe(false);
  const labels = d.edges.map((e) => e.label);
  for (const l of labels) {
    expect(inside(l), l.lines.join()).toBe(true);
    for (const b of d.boxes) expect(rectsOverlap(l, b), `${l.lines.join()} on ${b.title}`).toBe(false);
  }
  for (const [i, a] of labels.entries()) for (const b of labels.slice(i + 1)) expect(rectsOverlap(a, b), `${a.lines.join()} / ${b.lines.join()}`).toBe(false);
  if (arrows)
    for (const e of d.edges)
      for (const b of d.boxes.filter((x) => x.id !== e.from && x.id !== e.to))
        for (const [x, y] of e.samples) expect(x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h, `${e.id} through ${b.title}`).toBe(false);
  // the start marker points at the starting state
  const start = d.boxes.find((b) => b.id === m.initial);
  expect(start?.tone).toBe('start');
  expect(d.start && Math.abs(d.start.x2 - (start as { x: number }).x) < 5).toBe(true);
}

describe('state machine diagram', () => {
  for (const m of [...examples, tricky, emptyMachine()]) it(`draws ${m.name} with nothing on top of anything else`, () => expectClean(m));

  it('draws the Italian examples (longer texts) cleanly too', () => {
    setLanguage('it');
    try {
      for (const ex of smExamples()) expectClean(ex.build());
    } finally {
      setLanguage('en');
    }
  });

  it('keeps boxes and labels apart in a crowded machine', () => {
    const n = 9;
    const states = Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `STATE_${i}`, note: i % 2 ? 'Something long happens here' : undefined })).map((s) => (s.note ? s : { id: s.id, name: s.name }));
    const events = [{ id: 'e0', name: 'NEXT' }, { id: 'e1', name: 'BACK' }, { id: 'e2', name: 'JUMP' }, { id: 'e3', name: 'STAY' }];
    const transitions: StateMachine['transitions'] = [];
    for (let i = 0; i < n; i++) {
      transitions.push({ id: `n${i}`, from: `s${i}`, event: 'e0', to: `s${(i + 1) % n}`, action: 'do the next thing' });
      if (i % 2 === 0) transitions.push({ id: `b${i}`, from: `s${i}`, event: 'e1', to: `s${(i + n - 1) % n}` });
      if (i % 3 === 0) transitions.push({ id: `j${i}`, from: `s${i}`, event: 'e2', to: `s${(i + 4) % n}`, guard: 'only on Mondays' });
      if (i % 4 === 1) transitions.push({ id: `l${i}`, from: `s${i}`, event: 'e3', to: `s${i}` });
    }
    expectClean({ name: 'crowded', initial: 's0', states, events, transitions }, false);
  });

  it('marks unreachable states and states with no way out', () => {
    const m = byName('thermostat');
    const d = layoutMachine({ ...m, states: [...m.states, { id: 's9', name: 'SERVICE' }] });
    expect(d.boxes.find((b) => b.id === 's9')?.tone).toBe('unreachable');
    const d2 = layoutMachine({ ...m, transitions: m.transitions.filter((tr) => tr.from !== 's3') });
    expect(d2.boxes.find((b) => b.id === 's3')?.tone).toBe('dead');
  });
});

describe('generated C', () => {
  it('generates nothing while there is an error', () => {
    expect(generateCode({ ...tricky, initial: '' })).toBeNull();
  });

  it('has an enum, a switch, a table, hook stubs, a test and a sketch', () => {
    const files = generateCode(byName('traffic_light')) as NonNullable<ReturnType<typeof generateCode>>;
    expect(files.map((f) => f.name)).toEqual(['traffic_light.h', 'traffic_light.c', 'traffic_light_hooks.c', 'test_traffic_light.c', 'traffic_light.ino']);
    const [h, c, hooks, test, ino] = files.map((f) => f.content);
    expect(h).toMatch(/typedef enum \{\n {4}TRAFFIC_LIGHT_STATE_RED,/);
    expect(h).toContain('TRAFFIC_LIGHT_GUARD_GREEN_BUTTON');
    expect(c).toContain('switch (state)');
    expect(c).toContain('const traffic_light_transition_t traffic_light_transitions[] = {');
    // one table row per transition
    expect(c.match(/^ {4}\{ TRAFFIC_LIGHT_STATE_/gm)).toHaveLength(4);
    expect(hooks).toContain('void traffic_light_on_enter(traffic_light_state_t state)');
    expect(test).toContain('"RED + TIMER_DONE -> GREEN"');
    expect(ino).toContain('void setup()');
    // a user's "*/" never ends a comment early
    const t2 = generateCode(tricky) as NonNullable<ReturnType<typeof generateCode>>;
    expect(t2[0].content).not.toContain('Bolt out */');
    expect(t2[0].content).toContain('Bolt out * / not a comment end');
    expect(t2[3].content).not.toContain('??/');
  });

  // Needs a C compiler (gcc on Linux CI, clang as cc on macOS); skipped where there is none.
  const cc = ['cc', 'gcc', 'clang'].find((x) => spawnSync(x, ['--version']).status === 0);
  const cxx = ['c++', 'g++', 'clang++'].find((x) => spawnSync(x, ['--version']).status === 0);
  const FLAGS = ['-std=c99', '-Wall', '-Wextra', '-Werror', '-pedantic'];

  for (const m of [...examples, tricky, emptyMachine(), { ...emptyMachine(), name: 'lonely', transitions: [], events: [] }]) {
    it.skipIf(!cc)(`compiles ${m.name} with -Wall -Werror and its test passes`, () => {
      const files = generateCode(m);
      expect(files).not.toBeNull();
      const dir = mkdtempSync(join(tmpdir(), 'bp-sm-'));
      try {
        for (const f of files ?? []) writeFileSync(join(dir, f.name), f.content);
        const p = cPrefix(m.name);
        const run = (cmd: string, args: string[]) => {
          const r = spawnSync(cmd, args, { cwd: dir, encoding: 'utf8' });
          return { status: r.status, out: `${r.stdout}${r.stderr}` };
        };
        // the logic and the hook stubs (as the user would build them)
        const lib = run(cc as string, [...FLAGS, '-c', `${p}.c`, `${p}_hooks.c`]);
        expect(lib.out).toBe('');
        expect(lib.status).toBe(0);
        // the host test
        const build = run(cc as string, [...FLAGS, `${p}.c`, `test_${p}.c`, '-o', `test_${p}`]);
        expect(build.out).toBe('');
        expect(build.status).toBe(0);
        const test = run(join(dir, `test_${p}`), []);
        expect(test.out).toMatch(/^\d+ checks, 0 failed\n$/);
        expect(test.status).toBe(0);
        const checks = Number(/^(\d+)/.exec(test.out)?.[1]);
        expect(checks).toBeGreaterThanOrEqual(1 + m.transitions.length * 3);
        // the Arduino sketch, against a tiny stand-in for Arduino.h
        if (cxx) {
          const stub = 'struct SerialStub { void begin(long) {} void print(const char *) {} void println(const char *) {} };\nstatic SerialStub Serial;\n';
          writeFileSync(join(dir, 'sketch.cpp'), `${stub}#include "${p}.ino"\nint main() { setup(); loop(); return 0; }\n`);
          const sk = run(cxx, ['-Wall', '-Wextra', '-Werror', '-x', 'c++', 'sketch.cpp', '-o', 'sketch']);
          expect(sk.out).toBe('');
          expect(sk.status).toBe(0);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  it.skipIf(!cc)('the generated test catches a wrong transition', () => {
    const m = byName('thermostat');
    const files = generateCode(m) as NonNullable<ReturnType<typeof generateCode>>;
    const dir = mkdtempSync(join(tmpdir(), 'bp-sm-'));
    try {
      for (const f of files) writeFileSync(join(dir, f.name), f.content);
      // break the logic: HEATING + TARGET_REACHED now goes to ERROR
      const broken = files[1].content.replace('return thermostat_go(state, THERMOSTAT_STATE_IDLE, THERMOSTAT_ACTION_HEATING_TARGET_REACHED);', 'return thermostat_go(state, THERMOSTAT_STATE_ERROR, THERMOSTAT_ACTION_HEATING_TARGET_REACHED);');
      expect(broken).not.toBe(files[1].content);
      writeFileSync(join(dir, 'thermostat.c'), broken);
      expect(spawnSync(cc as string, ['-std=c99', 'thermostat.c', 'test_thermostat.c', '-o', 'test_thermostat'], { cwd: dir }).status).toBe(0);
      const r = spawnSync(join(dir, 'test_thermostat'), [], { encoding: 'utf8' });
      expect(r.status).toBe(1);
      expect(r.stdout).toContain('FAIL');
      expect(r.stdout).toContain('HEATING + TARGET_REACHED -> IDLE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
