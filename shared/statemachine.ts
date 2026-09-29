// State machine designer (issue #12): a pure model of a finite state machine, plain-language
// checks, a diagram layout, and generated C (header, logic, hook stubs, a host unit test) plus an
// Arduino sketch. No React, no DOM, no Node: the renderer draws the layout as SVG, the tests compile
// the generated C with the system compiler.
//
// Semantics of the generated code (UML-style external transitions):
//   - The machine is always in exactly one state. handle_event(state, event) returns the new state.
//   - For a state and an event, transitions with a condition (guard) are tried in the order they
//     were drawn; a transition without a condition is tried last and acts as "otherwise".
//   - Taking a transition runs: on_exit(old state), the transition's action, on_enter(new state).
//     A transition back into the same state also runs exit and entry.
//   - An event with no transition from the current state is ignored: the state stays the same.
//
// This is a design tool. Nothing here talks to a board; the generated tests run on the computer.

import { t } from './i18n';

export interface SmState {
  id: string;
  /** Becomes a C name: letters, digits and _ (other characters turn into _). */
  name: string;
  /** What the device does in this state (shown in the diagram, a comment in the code). */
  note?: string;
}

export interface SmEvent {
  id: string;
  name: string;
  /** Where the event comes from (a button, a timer…), a comment in the code. */
  note?: string;
}

export interface SmTransition {
  id: string;
  from: string;
  event: string;
  to: string;
  /** A condition in words; the generated code asks the user's guard() hook. */
  guard?: string;
  /** What happens on the way, in words; the generated code calls the user's action() hook. */
  action?: string;
}

/** Saved in the project (Scene.stateMachine) exactly as it is. */
export interface StateMachine {
  name: string;
  initial: string;
  states: SmState[];
  events: SmEvent[];
  transitions: SmTransition[];
}

export const SM_LIMITS = { states: 24, events: 32, transitions: 96 };

/* ---------- load / save ---------- */

const isStr = (x: unknown): x is string => typeof x === 'string';
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function optText<T extends object>(o: T, src: Record<string, unknown>, key: string): T | null {
  const v = src[key];
  if (v === undefined) return o;
  if (!isStr(v)) return null;
  return { ...o, [key]: v };
}

/**
 * Reads a machine from a project file. Returns null when the shape is wrong (a hand-edited or
 * foreign file); a valid machine comes back identical, so save → open is a lossless round trip.
 */
export function parseStateMachine(x: unknown): StateMachine | null {
  if (!isObj(x) || !isStr(x.name) || !isStr(x.initial)) return null;
  if (!Array.isArray(x.states) || !Array.isArray(x.events) || !Array.isArray(x.transitions)) return null;
  const states: SmState[] = [];
  for (const s of x.states) {
    if (!isObj(s) || !isStr(s.id) || !isStr(s.name)) return null;
    const v = optText<SmState>({ id: s.id, name: s.name }, s, 'note');
    if (!v) return null;
    states.push(v);
  }
  const events: SmEvent[] = [];
  for (const e of x.events) {
    if (!isObj(e) || !isStr(e.id) || !isStr(e.name)) return null;
    const v = optText<SmEvent>({ id: e.id, name: e.name }, e, 'note');
    if (!v) return null;
    events.push(v);
  }
  const transitions: SmTransition[] = [];
  for (const tr of x.transitions) {
    if (!isObj(tr) || !isStr(tr.id) || !isStr(tr.from) || !isStr(tr.event) || !isStr(tr.to)) return null;
    let v = optText<SmTransition>({ id: tr.id, from: tr.from, event: tr.event, to: tr.to }, tr, 'guard');
    if (v) v = optText(v, tr, 'action');
    if (!v) return null;
    transitions.push(v);
  }
  if (states.length > SM_LIMITS.states || events.length > SM_LIMITS.events || transitions.length > SM_LIMITS.transitions) return null;
  return { name: x.name, initial: x.initial, states, events, transitions };
}

/** A fresh id like "s4" that the machine does not use yet. */
export function nextId(prefix: 's' | 'e' | 't', m: StateMachine): string {
  const used = new Set([...m.states, ...m.events, ...m.transitions].map((x) => x.id));
  for (let i = 1; ; i++) if (!used.has(`${prefix}${i}`)) return `${prefix}${i}`;
}

/* ---------- C names ---------- */

/** "Too cold!" → "Too_cold"; a leading digit gets an N in front; '' when nothing usable is left. */
export function cIdent(name: string): string {
  const s = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!s) return '';
  return /^[0-9]/.test(s) ? `N${s}` : s;
}

/** The prefix of every generated name and file: "Traffic light" → "traffic_light". */
export function cPrefix(name: string): string {
  return cIdent(name).toLowerCase().slice(0, 32).replace(/_+$/, '') || 'sm';
}

const RESERVED = new Set(['COUNT', 'NONE']);

/* ---------- checks ---------- */

export type SmSeverity = 'error' | 'warning' | 'info';

export interface SmFinding {
  id: string;
  severity: SmSeverity;
  message: string;
  hint: string;
  /** State, event or transition ids to highlight. */
  targets: string[];
}

const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
const normGuard = (g: string | undefined) => (g ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const hasGuard = (tr: SmTransition) => normGuard(tr.guard) !== '';

/** States reachable from the initial state, following every transition (conditions ignored). */
export function reachable(m: StateMachine): Set<string> {
  const seen = new Set<string>();
  if (!m.states.some((s) => s.id === m.initial)) return seen;
  const queue = [m.initial];
  seen.add(m.initial);
  while (queue.length) {
    const cur = queue.shift() as string;
    for (const tr of m.transitions) if (tr.from === cur && !seen.has(tr.to) && m.states.some((s) => s.id === tr.to)) seen.add(tr.to), queue.push(tr.to);
  }
  return seen;
}

/** Every problem the designer can see, in plain words. Errors stop code generation. */
export function checkMachine(m: StateMachine): SmFinding[] {
  const out: SmFinding[] = [];
  const add = (severity: SmSeverity, key: string, message: string, hint: string, targets: string[] = []) =>
    out.push({ id: `${key}:${out.length}`, severity, message, hint, targets });
  const states = byId(m.states);
  const events = byId(m.events);
  const sName = (id: string) => states.get(id)?.name || '?';
  const eName = (id: string) => events.get(id)?.name || '?';

  if (!m.states.length) add('error', 'no-states', t('The machine has no states yet.'), t('Add a state, for example IDLE.'));
  else if (!states.has(m.initial)) add('error', 'no-initial', t('No starting state is chosen.'), t('Mark one state as the start: the device is in it right after power-on.'));

  const names = (list: (SmState | SmEvent)[], kind: 'state' | 'event') => {
    const seen = new Map<string, string>();
    for (const x of list) {
      const c = cIdent(x.name).toUpperCase();
      if (!c) {
        add('error', `${kind}-name`, kind === 'state' ? t('A state has no usable name.') : t('An event has no usable name.'), t('Use letters, digits and _, for example WAITING or BUTTON_PRESSED.'), [x.id]);
      } else if (RESERVED.has(c)) {
        add('error', `${kind}-reserved`, t('The name {name} is used by the generated code.', { name: c }), t('Pick another name.'), [x.id]);
      } else if (seen.has(c)) {
        add('error', `${kind}-dup`, kind === 'state' ? t('Two states are both called {name} in C.', { name: c }) : t('Two events are both called {name} in C.', { name: c }), t('Rename one of them: the C code needs different names.'), [seen.get(c) as string, x.id]);
      } else seen.set(c, x.id);
    }
  };
  names(m.states, 'state');
  names(m.events, 'event');

  const valid = m.transitions.filter((tr) => states.has(tr.from) && states.has(tr.to) && events.has(tr.event));
  for (const tr of m.transitions)
    if (!valid.includes(tr)) add('error', 'dangling', t('A transition points to a state or event that no longer exists.'), t('Pick the missing state or event again, or delete the transition.'), [tr.id]);

  // Same state + same event: at most one without a condition, and no condition twice.
  const groups = new Map<string, SmTransition[]>();
  for (const tr of valid) groups.set(`${tr.from}\u0000${tr.event}`, [...(groups.get(`${tr.from}\u0000${tr.event}`) ?? []), tr]);
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const vars = { state: sName(list[0].from), event: eName(list[0].event) };
    const plain = list.filter((tr) => !hasGuard(tr));
    if (plain.length > 1)
      add('error', 'dup', t('{state} has more than one transition for {event} without a condition.', vars), t('Only one of them could ever run. Give the others a condition, or delete them.'), plain.map((tr) => tr.id));
    const byGuard = new Map<string, SmTransition[]>();
    for (const tr of list.filter(hasGuard)) byGuard.set(normGuard(tr.guard), [...(byGuard.get(normGuard(tr.guard)) ?? []), tr]);
    for (const same of byGuard.values())
      if (same.length > 1)
        add('error', 'dup-guard', t('{state} has two transitions for {event} with the same condition.', vars), t('The second one could never run. Change its condition, or delete it.'), same.map((tr) => tr.id));
  }

  if (states.has(m.initial)) {
    const reach = reachable(m);
    for (const s of m.states)
      if (!reach.has(s.id))
        add('warning', 'unreachable', t('{state} can never be reached from {start}.', { state: s.name || '?', start: sName(m.initial) }), t('Add a transition into it, or delete it.'), [s.id]);
  }
  if (m.states.length > 1)
    for (const s of m.states)
      if (!valid.some((tr) => tr.from === s.id && tr.to !== s.id))
        add('warning', 'no-exit', t('{state} has no way out.', { state: s.name || '?' }), t('Fine for a final state, like a fault that needs a restart. Otherwise add a transition that leaves it.'), [s.id]);

  const usedEvents = new Set(valid.map((tr) => tr.event));
  for (const e of m.events)
    if (!usedEvents.has(e.id)) add('warning', 'unused-event', t('No state reacts to {event}.', { event: e.name || '?' }), t('Add a transition for it, or delete the event.'), [e.id]);

  for (const s of m.states) {
    const handled = new Set(valid.filter((tr) => tr.from === s.id).map((tr) => tr.event));
    const ignored = m.events.filter((e) => usedEvents.has(e.id) && !handled.has(e.id));
    if (ignored.length && handled.size)
      add('info', 'ignored', t('In {state}, these events are ignored: {events}.', { state: s.name || '?', events: ignored.map((e) => e.name).join(', ') }), t('Often that is what you want: the code stays in the same state and does nothing.'), [s.id]);
  }
  return out;
}

export const hasErrors = (f: SmFinding[]) => f.some((x) => x.severity === 'error');

/* ---------- code generation ---------- */

export interface SmFile {
  name: string;
  kind: 'header' | 'source' | 'hooks' | 'test' | 'sketch';
  content: string;
}

interface Row {
  tr: SmTransition;
  from: string;
  event: string;
  to: string;
  guard: string | null;
  action: string | null;
}

interface Plan {
  m: StateMachine;
  p: string;
  P: string;
  state: Map<string, string>;
  event: Map<string, string>;
  rows: Row[];
  guards: Row[];
  actions: Row[];
  initial: string;
}

/** Text for a C block comment: one line, and it can never close the comment early. */
const cmt = (s: string | undefined) =>
  (s ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\*\//g, '* /')
    .replace(/\/\*/g, '/ *')
    .replace(/\?\?/g, '? ?')
    .trim();

function plan(m: StateMachine): Plan {
  const p = cPrefix(m.name);
  const P = p.toUpperCase();
  const state = new Map(m.states.map((s) => [s.id, `${P}_STATE_${cIdent(s.name).toUpperCase()}`]));
  const event = new Map(m.events.map((e) => [e.id, `${P}_EVENT_${cIdent(e.name).toUpperCase()}`]));
  const used = new Set<string>([...state.values(), ...event.values()]);
  const unique = (base: string) => {
    let n = base;
    for (let i = 2; used.has(n); i++) n = `${base}_${i}`;
    used.add(n);
    return n;
  };
  const sOrder = new Map(m.states.map((s, i) => [s.id, i]));
  const eOrder = new Map(m.events.map((e, i) => [e.id, i]));
  const valid = m.transitions.filter((tr) => state.has(tr.from) && state.has(tr.to) && event.has(tr.event));
  // state order, then event order; inside one state + event: conditions first (as drawn), then "otherwise"
  const sorted = valid
    .map((tr, i) => ({ tr, i }))
    .sort((a, b) =>
      (sOrder.get(a.tr.from) as number) - (sOrder.get(b.tr.from) as number) ||
      (eOrder.get(a.tr.event) as number) - (eOrder.get(b.tr.event) as number) ||
      Number(!hasGuard(a.tr)) - Number(!hasGuard(b.tr)) ||
      a.i - b.i,
    )
    .map((x) => x.tr);
  const base = (tr: SmTransition) => {
    const s = m.states.find((x) => x.id === tr.from) as SmState;
    const e = m.events.find((x) => x.id === tr.event) as SmEvent;
    return `${cIdent(s.name).toUpperCase()}_${cIdent(e.name).toUpperCase()}`;
  };
  const rows: Row[] = sorted.map((tr) => ({
    tr,
    from: state.get(tr.from) as string,
    event: event.get(tr.event) as string,
    to: state.get(tr.to) as string,
    guard: hasGuard(tr) ? unique(`${P}_GUARD_${base(tr)}`) : null,
    action: (tr.action ?? '').trim() ? unique(`${P}_ACTION_${base(tr)}`) : null,
  }));
  return {
    m,
    p,
    P,
    state,
    event,
    rows,
    guards: rows.filter((r) => r.guard),
    actions: rows.filter((r) => r.action),
    initial: state.get(m.initial) as string,
  };
}

const sName = (pl: Plan, id: string) => cIdent(pl.m.states.find((s) => s.id === id)?.name ?? '').toUpperCase();
const eName = (pl: Plan, id: string) => cIdent(pl.m.events.find((e) => e.id === id)?.name ?? '').toUpperCase();
const rowText = (pl: Plan, r: Row) => `${sName(pl, r.tr.from)} + ${eName(pl, r.tr.event)} -> ${sName(pl, r.tr.to)}`;

function enumBlock(type: string, items: { name: string; note?: string }[], count: string): string[] {
  return [
    'typedef enum {',
    ...items.map((x) => `    ${x.name},${x.note ? ` /* ${cmt(x.note)} */` : ''}`),
    `    ${count}`,
    `} ${type};`,
  ];
}

/** Enums and the transition struct (the part of the header an Arduino sketch also needs). */
function typesBlock(pl: Plan): string[] {
  const { p, P, m } = pl;
  return [
    ...enumBlock(`${p}_state_t`, m.states.map((s) => ({ name: pl.state.get(s.id) as string, note: s.id === m.initial ? `start${s.note ? `: ${s.note}` : ''}` : s.note })), `${P}_STATE_COUNT`),
    '',
    `#define ${P}_INITIAL_STATE ${pl.initial}`,
    '',
    ...enumBlock(`${p}_event_t`, m.events.map((e) => ({ name: pl.event.get(e.id) as string, note: e.note })), `${P}_EVENT_COUNT`),
    '',
    '/* Conditions (guards): each one is a question that your guard hook answers with true or false. */',
    ...enumBlock(`${p}_guard_t`, [{ name: `${P}_GUARD_NONE` }, ...pl.guards.map((r) => ({ name: r.guard as string, note: r.tr.guard }))], `${P}_GUARD_COUNT`),
    '',
    '/* Actions: what happens on the way from one state to the next; your action hook does it. */',
    ...enumBlock(`${p}_action_t`, [{ name: `${P}_ACTION_NONE` }, ...pl.actions.map((r) => ({ name: r.action as string, note: r.tr.action }))], `${P}_ACTION_COUNT`),
    '',
    'typedef struct {',
    `    ${p}_state_t from;`,
    `    ${p}_event_t event;`,
    `    ${p}_guard_t guard;`,
    `    ${p}_action_t action;`,
    `    ${p}_state_t to;`,
    `} ${p}_transition_t;`,
  ];
}

function protosBlock(pl: Plan): string[] {
  const { p } = pl;
  return [
    '/* The transitions as a table (the same as the switch in handle_event): for logs, tests or a table-driven loop. */',
    `extern const ${p}_transition_t ${p}_transitions[];`,
    `extern const unsigned ${p}_transition_count;`,
    '',
    '/* Runs the entry hook of the starting state and returns it. Call once at start-up. */',
    `${p}_state_t ${p}_start(void);`,
    '/* Feeds one event. Returns the new state, or the same state when the event is ignored there. */',
    `${p}_state_t ${p}_handle_event(${p}_state_t state, ${p}_event_t event);`,
    `const char *${p}_state_name(${p}_state_t state);`,
    `const char *${p}_event_name(${p}_event_t event);`,
    '',
    '/* Hooks: you write these (start from the stubs in the hooks file). */',
    `void ${p}_on_enter(${p}_state_t state);`,
    `void ${p}_on_exit(${p}_state_t state);`,
    `bool ${p}_guard(${p}_guard_t guard);`,
    `void ${p}_action(${p}_action_t action);`,
  ];
}

function logicBlock(pl: Plan): string[] {
  const { p, P, m, rows } = pl;
  const out: string[] = [];
  const tableRows = rows.map((r) => `    { ${r.from}, ${r.event}, ${r.guard ?? `${P}_GUARD_NONE`}, ${r.action ?? `${P}_ACTION_NONE`}, ${r.to} },`);
  if (rows.length) {
    out.push(`const ${p}_transition_t ${p}_transitions[] = {`, '    /* from, event, condition, action, to */', ...tableRows, '};');
    out.push(`const unsigned ${p}_transition_count = sizeof ${p}_transitions / sizeof ${p}_transitions[0];`);
  } else {
    out.push('/* No transitions yet: one placeholder row, and the count says 0. */');
    out.push(`const ${p}_transition_t ${p}_transitions[1] = { { ${pl.initial}, (${p}_event_t)0, ${P}_GUARD_NONE, ${P}_ACTION_NONE, ${pl.initial} } };`);
    out.push(`const unsigned ${p}_transition_count = 0;`);
  }
  out.push('');
  if (rows.length) {
    out.push(
      '/* Leave the old state, do the action, enter the new state. */',
      `static ${p}_state_t ${p}_go(${p}_state_t from, ${p}_state_t to, ${p}_action_t action)`,
      '{',
      `    ${p}_on_exit(from);`,
      `    if (action != ${P}_ACTION_NONE)`,
      `        ${p}_action(action);`,
      `    ${p}_on_enter(to);`,
      '    return to;',
      '}',
      '',
    );
  }
  out.push(`${p}_state_t ${p}_start(void)`, '{', `    ${p}_on_enter(${P}_INITIAL_STATE);`, `    return ${P}_INITIAL_STATE;`, '}', '');
  out.push(`${p}_state_t ${p}_handle_event(${p}_state_t state, ${p}_event_t event)`, '{');
  if (!rows.length) out.push('    (void)event;');
  out.push('    switch (state) {');
  for (const s of m.states) {
    const mine = rows.filter((r) => r.tr.from === s.id);
    if (!mine.length) continue;
    out.push(`    case ${pl.state.get(s.id)}:`, '        switch (event) {');
    for (const e of m.events) {
      const group = mine.filter((r) => r.tr.event === e.id);
      if (!group.length) continue;
      out.push(`        case ${pl.event.get(e.id)}:`);
      for (const r of group) {
        const go = `return ${p}_go(state, ${r.to}, ${r.action ?? `${P}_ACTION_NONE`});`;
        if (r.guard) out.push(`            if (${p}_guard(${r.guard})) /* ${cmt(r.tr.guard)} */`, `                ${go}`);
        else out.push(`            ${go}`);
      }
      if (group[group.length - 1].guard) out.push('            break;');
    }
    out.push('        default:', '            break;', '        }', '        break;');
  }
  out.push('    default:', '        break;', '    }', '    return state; /* no transition for this event here: ignore it */', '}', '');
  const nameFn = (type: 'state' | 'event', list: (SmState | SmEvent)[], map: Map<string, string>) => [
    `const char *${p}_${type}_name(${p}_${type}_t ${type})`,
    '{',
    `    switch (${type}) {`,
    ...list.flatMap((x) => [`    case ${map.get(x.id)}:`, `        return "${cIdent(x.name).toUpperCase()}";`]),
    '    default:',
    '        return "?";',
    '    }',
    '}',
  ];
  out.push(...nameFn('state', m.states, pl.state), '', ...nameFn('event', m.events, pl.event));
  return out;
}

function hooksBlock(pl: Plan, arduino: boolean): string[] {
  const { p, m } = pl;
  const stateSwitch = (fn: 'on_enter' | 'on_exit', what: string) => [
    `void ${p}_${fn}(${p}_state_t state)`,
    '{',
    ...(arduino && fn === 'on_enter' ? ['    Serial.print("state: ");', `    Serial.println(${p}_state_name(state));`] : []),
    '    switch (state) {',
    ...m.states.flatMap((s) => [`    case ${pl.state.get(s.id)}:${fn === 'on_enter' && s.note ? ` /* ${cmt(s.note)} */` : ''}`, `        /* ${what} */`, '        break;']),
    '    default:',
    '        break;',
    '    }',
    '}',
  ];
  return [
    ...stateSwitch('on_enter', 'what to do when the device enters this state'),
    '',
    ...stateSwitch('on_exit', 'what to undo when it leaves (stop a timer, switch something off)'),
    '',
    `bool ${p}_guard(${p}_guard_t guard)`,
    '{',
    '    switch (guard) {',
    ...pl.guards.flatMap((r) => [`    case ${r.guard}: /* ${rowText(pl, r)}: ${cmt(r.tr.guard)} */`, '        return true; /* replace with the real check */']),
    '    default:',
    '        return true;',
    '    }',
    '}',
    '',
    `void ${p}_action(${p}_action_t action)`,
    '{',
    '    switch (action) {',
    ...pl.actions.flatMap((r) => [`    case ${r.action}: /* ${rowText(pl, r)}: ${cmt(r.tr.action)} */`, '        break;']),
    '    default:',
    '        break;',
    '    }',
    '}',
  ];
}

function headerComment(pl: Plan, file: string, lines: string[]): string[] {
  return [`/* ${file}: state machine "${cmt(pl.m.name) || pl.p}", generated by BoardPilot.`, ...lines.map((l) => ` * ${l}`), ' */'];
}

function testBlock(pl: Plan): string[] {
  const { p, P, m, rows } = pl;
  const out: string[] = [
    ...headerComment(pl, `test_${p}.c`, [
      'A host unit test: it runs on your computer, not on the board. It replaces the hooks with',
      'recorders and walks every transition of the diagram, then checks that ignored events keep the state.',
      `Build and run: cc -std=c99 -Wall -Werror ${p}.c test_${p}.c -o test_${p} && ./test_${p}`,
    ]),
    '#include <stdio.h>',
    '#include <string.h>',
    `#include "${p}.h"`,
    '',
    'static int checks = 0;',
    'static int failures = 0;',
    '#define CHECK(cond, what) do { checks++; if (!(cond)) { failures++; printf("FAIL (line %d): %s\\n", __LINE__, what); } } while (0)',
    '',
    `static bool guard_answer[${P}_GUARD_COUNT];`,
    `static int entered[${P}_STATE_COUNT];`,
    `static int exited[${P}_STATE_COUNT];`,
    `static ${p}_action_t last_action;`,
    'static int hook_calls;',
    '',
    `void ${p}_on_enter(${p}_state_t state) { entered[state]++; hook_calls++; }`,
    `void ${p}_on_exit(${p}_state_t state) { exited[state]++; hook_calls++; }`,
    `bool ${p}_guard(${p}_guard_t guard) { return guard_answer[guard]; }`,
    `void ${p}_action(${p}_action_t action) { last_action = action; hook_calls++; }`,
    '',
    '/* Every condition answers false, no hook has run yet. */',
    'static void reset(void)',
    '{',
    '    memset(guard_answer, 0, sizeof guard_answer);',
    '    memset(entered, 0, sizeof entered);',
    '    memset(exited, 0, sizeof exited);',
    `    last_action = ${P}_ACTION_NONE;`,
    '    hook_calls = 0;',
    '}',
    '',
    'int main(void)',
    '{',
    `    ${p}_state_t s;`,
    '',
    '    /* Start-up: the starting state, with its entry hook. */',
    '    reset();',
    `    s = ${p}_start();`,
    `    CHECK(s == ${P}_INITIAL_STATE && entered[${P}_INITIAL_STATE] == 1, "start enters ${sName(pl, m.initial)}");`,
  ];
  if (rows.length) out.push('', '    /* 1. Every transition in the diagram. */');
  for (const r of rows) {
    const what = rowText(pl, r) + (r.guard ? ` when '${cmt(r.tr.guard).replace(/["'\\]/g, '')}'` : '');
    out.push('    reset();');
    if (r.guard) out.push(`    guard_answer[${r.guard}] = true;`);
    out.push(
      `    s = ${p}_handle_event(${r.from}, ${r.event});`,
      `    CHECK(s == ${r.to}, "${what}");`,
      `    CHECK(exited[${r.from}] == 1 && entered[${r.to}] == 1, "${rowText(pl, r)}: exit and entry hooks run once");`,
      `    CHECK(last_action == ${r.action ?? `${P}_ACTION_NONE`}, "${rowText(pl, r)}: ${r.action ? 'runs its action' : 'runs no action'}");`,
    );
    if (r.guard) {
      // With this condition false, the next alternative (or nothing) must be taken.
      const group = rows.filter((x) => x.tr.from === r.tr.from && x.tr.event === r.tr.event);
      const next = group.slice(group.indexOf(r) + 1).find((x) => !x.guard);
      out.push('    reset();', `    s = ${p}_handle_event(${r.from}, ${r.event});`);
      if (next) out.push(`    CHECK(s == ${next.to}, "${rowText(pl, r)}: condition false, the otherwise transition runs");`);
      else out.push(`    CHECK(s == ${r.from} && hook_calls == 0, "${rowText(pl, r)}: condition false, nothing happens");`);
    }
  }
  const ignored: string[] = [];
  for (const s of m.states)
    for (const e of m.events)
      if (!rows.some((r) => r.tr.from === s.id && r.tr.event === e.id))
        ignored.push(
          '    reset();',
          `    s = ${p}_handle_event(${pl.state.get(s.id)}, ${pl.event.get(e.id)});`,
          `    CHECK(s == ${pl.state.get(s.id)} && hook_calls == 0, "${sName(pl, s.id)} ignores ${eName(pl, e.id)}");`,
        );
  if (ignored.length) out.push('', '    /* 2. Events a state does not handle leave it where it is, with no hooks. */', ...ignored);
  if (rows.length)
    out.push(
      '',
      '    /* 3. The table and the switch agree. */',
      '    {',
      '        unsigned i;',
      `        for (i = 0; i < ${p}_transition_count; i++) {`,
      `            const ${p}_transition_t *tr = &${p}_transitions[i];`,
      '            reset();',
      '            guard_answer[tr->guard] = true;',
      `            CHECK(${p}_handle_event(tr->from, tr->event) == tr->to, ${p}_state_name(tr->from));`,
      '        }',
      '    }',
    );
  out.push('', '    printf("%d checks, %d failed\\n", checks, failures);', '    return failures ? 1 : 0;', '}');
  return out;
}

function sketchBlock(pl: Plan): string[] {
  const { p, m } = pl;
  const eventHints = m.events.map((e) => ` *   ${pl.event.get(e.id)}${e.note ? `: ${cmt(e.note)}` : ''}`);
  return [
    ...headerComment(pl, `${p}.ino`, [
      'Everything in one sketch: the state machine, hook stubs that print each new state to the',
      'Serial Monitor, and a loop that feeds events. Fill in next_event() and the hooks.',
    ]),
    '',
    ...typesBlock(pl),
    '',
    `bool next_event(${p}_event_t *event);`,
    ...protosBlock(pl)
      .filter((l) => !l.startsWith('extern') && !l.includes('as a table'))
      .map((l) => (l.startsWith('/* Hooks:') ? '/* Hooks: you write these (the stubs are further down). */' : l)),
    '',
    ...logicBlock(pl),
    '',
    ...hooksBlock(pl, true),
    '',
    `static ${p}_state_t state;`,
    '',
    'void setup()',
    '{',
    '    Serial.begin(115200);',
    `    state = ${p}_start();`,
    '}',
    '',
    'void loop()',
    '{',
    `    ${p}_event_t event;`,
    '    if (next_event(&event)) {',
    '        Serial.print("event: ");',
    `        Serial.println(${p}_event_name(event));`,
    `        state = ${p}_handle_event(state, event);`,
    '    }',
    '}',
    '',
    '/* Turn inputs and timers into events: set *event and return true when something happened.',
    ' * Use millis() for timers, never delay(), so the loop keeps running. The events:',
    ...eventHints,
    ' */',
    `bool next_event(${p}_event_t *event)`,
    '{',
    '    (void)event;',
    '    return false;',
    '}',
  ];
}

/** The generated files, or null while the checks still report an error. */
export function generateCode(m: StateMachine): SmFile[] | null {
  if (hasErrors(checkMachine(m))) return null;
  const pl = plan(m);
  const { p, P } = pl;
  const header = [
    ...headerComment(pl, `${p}.h`, [`Generate it again from the designer instead of editing it; your code goes in ${p}_hooks.c.`]),
    `#ifndef ${P}_H`,
    `#define ${P}_H`,
    '',
    '#include <stdbool.h>',
    '',
    '#ifdef __cplusplus',
    'extern "C" {',
    '#endif',
    '',
    ...typesBlock(pl),
    '',
    ...protosBlock(pl),
    '',
    '#ifdef __cplusplus',
    '}',
    '#endif',
    '',
    `#endif /* ${P}_H */`,
  ];
  const source = [...headerComment(pl, `${p}.c`, ['The logic: a switch on the state, then on the event.']), `#include "${p}.h"`, '', ...logicBlock(pl)];
  const hooks = [
    ...headerComment(pl, `${p}_hooks.c`, ['Your code: what each state does, the conditions and the actions. Start from these stubs.']),
    `#include "${p}.h"`,
    '',
    ...hooksBlock(pl, false),
  ];
  const nl = (lines: string[]) => lines.join('\n') + '\n';
  return [
    { name: `${p}.h`, kind: 'header', content: nl(header) },
    { name: `${p}.c`, kind: 'source', content: nl(source) },
    { name: `${p}_hooks.c`, kind: 'hooks', content: nl(hooks) },
    { name: `test_${p}.c`, kind: 'test', content: nl(testBlock(pl)) },
    { name: `${p}.ino`, kind: 'sketch', content: nl(sketchBlock(pl)) },
  ];
}

/* ---------- diagram layout ---------- */

export type SmTone = 'start' | 'normal' | 'dead' | 'unreachable';

export interface SmBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub: string;
  tone: SmTone;
}

export interface SmRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SmEdge {
  /** "from>to" */
  id: string;
  from: string;
  to: string;
  transitions: string[];
  /** SVG path data; the arrow head goes at the end. */
  d: string;
  label: SmRect & { lines: string[] };
  /** Sample points along the drawn curve (for tests and hit checks). */
  samples: [number, number][];
}

export interface SmDiagram {
  width: number;
  height: number;
  boxes: SmBox[];
  edges: SmEdge[];
  /** The "start here" dot and its arrow into the initial state. */
  start: { cx: number; cy: number; x2: number; y2: number } | null;
}

type Pt = [number, number];
const COL_GAP = 60;
const ROW_GAP = 78;
const PER_ROW = 3;
const LINE_H = 14;
const MARGIN = 14;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
export const rectsOverlap = (a: SmRect, b: SmRect, pad = 0) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
const inRect = (p: Pt, r: SmRect, pad = 0) => p[0] > r.x - pad && p[0] < r.x + r.w + pad && p[1] > r.y - pad && p[1] < r.y + r.h + pad;

/** One label line per transition: EVENT [condition] / action. */
export function transitionLabel(m: StateMachine, tr: SmTransition): string {
  const e = m.events.find((x) => x.id === tr.event);
  let s = e?.name || '?';
  if ((tr.guard ?? '').trim()) s += ` [${tr.guard?.trim()}]`;
  if ((tr.action ?? '').trim()) s += ` / ${tr.action?.trim()}`;
  return s;
}

/** Words wrapped into lines of at most `width` characters (a longer word is cut). */
export function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const word = clip(w, width);
    if (cur && cur.length + 1 + word.length > width) lines.push(cur), (cur = word);
    else cur = cur ? `${cur} ${word}` : word;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** The label of one arrow: each transition wrapped to three short lines at most. */
function edgeLines(m: StateMachine, trs: SmTransition[]): string[] {
  return trs.flatMap((tr) => {
    const l = wrapText(transitionLabel(m, tr), 24);
    return l.length > 3 ? [...l.slice(0, 2), clip(`${l[2]} ${l.slice(3).join(' ')}`, 24)] : l;
  });
}

const labelSize = (lines: string[]) => ({ w: Math.max(...lines.map((l) => l.length)) * 6.2 + 12, h: lines.length * LINE_H + 6 });

/** Quadratic Bézier helpers. */
const qAt = (a: Pt, c: Pt, b: Pt, t: number): Pt => {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
};
const qSub = (a: Pt, c: Pt, b: Pt, t0: number, t1: number): [Pt, Pt, Pt] => {
  const k = (w0: number, w1: number, w2: number): Pt => [w0 * a[0] + w1 * c[0] + w2 * b[0], w0 * a[1] + w1 * c[1] + w2 * b[1]];
  const mid = k((1 - t0) * (1 - t1), (1 - t0) * t1 + t0 * (1 - t1), t0 * t1);
  return [qAt(a, c, b, t0), mid, qAt(a, c, b, t1)];
};
const cAt = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt => {
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [w[0] * p0[0] + w[1] * p1[0] + w[2] * p2[0] + w[3] * p3[0], w[0] * p0[1] + w[1] * p1[1] + w[2] * p2[1] + w[3] * p3[1]];
};

/**
 * Lays the machine out in layers from the starting state (breadth first, at most three states per
 * row, unreachable states last), draws one curved arrow per pair of states (several transitions
 * share one arrow and stack their labels), bends arrows around boxes, and places every label where
 * it does not cover a box or another label.
 */
export function layoutMachine(m: StateMachine): SmDiagram {
  if (!m.states.length) return { width: 320, height: 80, boxes: [], edges: [], start: null };
  const reach = reachable(m);
  const hasExit = new Set(m.transitions.filter((tr) => tr.to !== tr.from).map((tr) => tr.from));
  const statesById = byId(m.states);

  // layers: breadth-first depth from the start
  const depth = new Map<string, number>();
  if (statesById.has(m.initial)) {
    depth.set(m.initial, 0);
    const q = [m.initial];
    while (q.length) {
      const cur = q.shift() as string;
      for (const tr of m.transitions)
        if (tr.from === cur && statesById.has(tr.to) && !depth.has(tr.to)) depth.set(tr.to, (depth.get(cur) as number) + 1), q.push(tr.to);
    }
  }
  const maxDepth = Math.max(-1, ...depth.values());
  const layers: string[][] = [];
  for (const s of m.states) {
    const d = depth.get(s.id) ?? maxDepth + 1;
    (layers[d] ??= []).push(s.id);
  }
  // keep BFS discovery order inside a layer
  const order = [...depth.keys()];
  for (const l of layers) if (l) l.sort((a, b) => (order.indexOf(a) + 1 || 1e9) - (order.indexOf(b) + 1 || 1e9));
  const rows: string[][] = [];
  for (const l of layers) if (l) for (let i = 0; i < l.length; i += PER_ROW) rows.push(l.slice(i, i + PER_ROW));

  const hasSub = m.states.some((s) => (s.note ?? '').trim());
  const bw = Math.min(170, Math.max(100, ...m.states.map((s) => Math.max(clip(s.name || '?', 20).length * 7.8, clip((s.note ?? '').trim(), 24).length * 6.2) + 24)));
  const bh = hasSub ? 46 : 34;
  /** One try with the given gaps; `near` is false when a label had to move away from its arrow. */
  const place = (colGap: number, rowGap: number): { d: SmDiagram; near: boolean; placed: boolean } => {
    let near = true;
    let placed = true;
    const contentW = Math.max(...rows.map((r) => r.length * bw + (r.length - 1) * colGap));
    const boxes: SmBox[] = [];
    rows.forEach((r, ri) => {
      const rw = r.length * bw + (r.length - 1) * colGap;
      r.forEach((id, ci) => {
        const s = statesById.get(id) as SmState;
        boxes.push({
          id,
          x: (contentW - rw) / 2 + ci * (bw + colGap),
          y: ri * (bh + rowGap),
          w: bw,
          h: bh,
          title: clip(s.name || '?', 20),
          sub: clip((s.note ?? '').trim(), 24),
          tone: id === m.initial ? 'start' : !reach.has(id) ? 'unreachable' : m.states.length > 1 && !hasExit.has(id) ? 'dead' : 'normal',
        });
      });
    });
    const box = new Map(boxes.map((b) => [b.id, b]));
    const obstacles: SmRect[] = [...boxes];
    const startBox = box.get(m.initial);
    const start = startBox ? { cx: startBox.x - 30, cy: startBox.y + startBox.h / 2, x2: startBox.x - 3, y2: startBox.y + startBox.h / 2 } : null;
    if (start) obstacles.push({ x: start.cx - 6, y: start.cy - 6, w: 30, h: 12 });

    // one edge per ordered pair of states, in drawing order
    const pairs = new Map<string, SmTransition[]>();
    for (const tr of m.transitions) if (box.has(tr.from) && box.has(tr.to)) pairs.set(`${tr.from}>${tr.to}`, [...(pairs.get(`${tr.from}>${tr.to}`) ?? []), tr]);
    type Draft = { key: string; trs: SmTransition[]; d: (P: (p: Pt) => string) => string; samples: Pt[]; cands: SmRect[]; mid: Pt; sz: { w: number; h: number }; lab?: SmRect };
    const drafts: Draft[] = [];
    const sample = (fn: (t: number) => Pt) => Array.from({ length: 41 }, (_, i) => fn(i / 40));

    // 1. the curves: arrows between two states bend around other boxes; opposite arrows bow apart
    for (const [key, trs] of pairs) {
      const [fromId, toId] = key.split('>');
      if (fromId === toId) continue;
      const A = box.get(fromId) as SmBox;
      const B = box.get(toId) as SmBox;
      const a: Pt = [A.x + A.w / 2, A.y + A.h / 2];
      const b: Pt = [B.x + B.w / 2, B.y + B.h / 2];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const n: Pt = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
      const reverse = pairs.has(`${toId}>${fromId}`);
      const bends = reverse ? [26, 50, 80, 115, 150, 190] : [0, 34, -34, 68, -68, 105, -105, 145, -145, 190, -190];
      const others = boxes.filter((x) => x.id !== fromId && x.id !== toId);
      const ctrl = (bend: number): Pt => [(a[0] + b[0]) / 2 + n[0] * bend * 2, (a[1] + b[1]) / 2 + n[1] * bend * 2];
      const clear = (bend: number) => {
        const c = ctrl(bend);
        for (let i = 1; i < 60; i++) if (others.some((o) => inRect(qAt(a, c, b, i / 60), o, 8))) return false;
        return true;
      };
      const c = ctrl(bends.find(clear) ?? bends[bends.length - 1]);
      // clip the curve to the box borders (small gap before the arrow head)
      let t0 = 0;
      let t1 = 1;
      for (let i = 0; i <= 200; i++) if (inRect(qAt(a, c, b, i / 200), A, 2)) t0 = i / 200;
      for (let i = 200; i >= 0; i--) if (inRect(qAt(a, c, b, i / 200), B, 4)) t1 = i / 200;
      const [p0, pc, p2] = qSub(a, c, b, t0, t1);
      const sz = labelSize(edgeLines(m, trs));
      // label on the arrow first, then beside it (outside first, for a pair of opposite arrows)
      const side = Math.abs(n[0]) * (sz.w / 2) + Math.abs(n[1]) * (sz.h / 2) + 6;
      const offs = reverse ? [side, 0, -side] : [0, side, -side];
      const cands: SmRect[] = [];
      for (const off of offs)
        for (const tt of [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74]) {
          const pt = qAt(p0, pc, p2, tt);
          cands.push({ x: pt[0] + n[0] * off - sz.w / 2, y: pt[1] + n[1] * off - sz.h / 2, w: sz.w, h: sz.h });
        }
      drafts.push({ key, trs, d: (P) => `M${P(p0)} Q${P(pc)} ${P(p2)}`, samples: sample((t) => qAt(p0, pc, p2, t)), cands, mid: qAt(p0, pc, p2, 0.5), sz });
    }
    // self loops: on the side of the box with room (right, left, above, below)
    for (const [key, trs] of pairs) {
      const [id, id2] = key.split('>');
      if (id !== id2) continue;
      const B = box.get(id) as SmBox;
      const sz = labelSize(edgeLines(m, trs));
      const L = 30;
      const options: { pts: [Pt, Pt, Pt, Pt]; lab: SmRect; loop: SmRect }[] = [
        {
          pts: [[B.x + B.w, B.y + B.h * 0.3], [B.x + B.w + L, B.y - 4], [B.x + B.w + L, B.y + B.h + 4], [B.x + B.w + 2, B.y + B.h * 0.7]],
          lab: { x: B.x + B.w + L - 4, y: B.y + B.h / 2 - sz.h / 2, w: sz.w, h: sz.h },
          loop: { x: B.x + B.w, y: B.y, w: L, h: B.h },
        },
        {
          pts: [[B.x, B.y + B.h * 0.3], [B.x - L, B.y - 4], [B.x - L, B.y + B.h + 4], [B.x - 2, B.y + B.h * 0.7]],
          lab: { x: B.x - L + 4 - sz.w, y: B.y + B.h / 2 - sz.h / 2, w: sz.w, h: sz.h },
          loop: { x: B.x - L, y: B.y, w: L, h: B.h },
        },
        {
          pts: [[B.x + B.w * 0.35, B.y], [B.x + B.w * 0.3, B.y - L - 4], [B.x + B.w * 0.7, B.y - L - 4], [B.x + B.w * 0.65, B.y - 2]],
          lab: { x: B.x + B.w / 2 - sz.w / 2, y: B.y - L - 2 - sz.h, w: sz.w, h: sz.h },
          loop: { x: B.x + B.w * 0.3, y: B.y - L, w: B.w * 0.4, h: L },
        },
        {
          pts: [[B.x + B.w * 0.35, B.y + B.h], [B.x + B.w * 0.3, B.y + B.h + L + 4], [B.x + B.w * 0.7, B.y + B.h + L + 4], [B.x + B.w * 0.65, B.y + B.h + 2]],
          lab: { x: B.x + B.w / 2 - sz.w / 2, y: B.y + B.h + L + 2, w: sz.w, h: sz.h },
          loop: { x: B.x + B.w * 0.3, y: B.y + B.h, w: B.w * 0.4, h: L },
        },
      ];
      const curves = drafts.flatMap((x) => x.samples);
      const others = obstacles.filter((o) => o !== B);
      const fits = (o: (typeof options)[number]) =>
        !others.some((x) => rectsOverlap(o.loop, x, 4) || rectsOverlap(o.lab, x, 4)) && !curves.some((p) => inRect(p, o.loop, 2) || inRect(p, o.lab, 2));
      const pick = options.find(fits) ?? options.find((o) => !others.some((x) => rectsOverlap(o.loop, x, 4))) ?? options[0];
      const pts = pick.pts;
      drafts.push({ key, trs, d: (P) => `M${P(pts[0])} C${P(pts[1])} ${P(pts[2])} ${P(pts[3])}`, samples: sample((t) => cAt(...pts, t)), cands: [pick.lab], mid: [pick.lab.x + sz.w / 2, pick.lab.y + sz.h / 2], sz });
    }

    // 2. the labels: never on a box or another label, and if at all possible not on another arrow
    const labels: SmRect[] = [];
    const free = (r: SmRect, self: Draft, strict: boolean) =>
      !obstacles.some((o) => rectsOverlap(r, o, 4)) &&
      !labels.some((o) => rectsOverlap(r, o, 3)) &&
      (!strict || !drafts.some((x) => x !== self && x.samples.some((p) => inRect(p, r, 3))));
    for (const e of drafts) {
      let lab = e.cands.find((r) => free(r, e, true));
      if (!lab) {
        near = false;
        lab = e.cands.find((r) => free(r, e, false));
      }
      if (!lab) {
        placed = false;
        const at = (ox: number, oy: number): SmRect => ({ x: e.mid[0] + ox - e.sz.w / 2, y: e.mid[1] + oy - e.sz.h / 2, w: e.sz.w, h: e.sz.h });
        for (let rad = 8; !lab && rad < 600; rad += 8)
          for (let k = 0; k < 16 && !lab; k++) {
            const r = at(Math.cos((k * Math.PI) / 8) * rad, Math.sin((k * Math.PI) / 8) * rad);
            if (free(r, e, false)) lab = r;
          }
        lab ??= at(0, 0);
      }
      e.lab = lab;
      labels.push(lab);
    }

    // bounds of everything, then shift so the drawing starts at the margin
    const xs: number[] = [];
    const ys: number[] = [];
    const addR = (r: SmRect) => (xs.push(r.x, r.x + r.w), ys.push(r.y, r.y + r.h));
    boxes.forEach(addR);
    labels.forEach(addR);
    if (start) xs.push(start.cx - 6), ys.push(start.cy - 6, start.cy + 6);
    for (const e of drafts) for (const p of e.samples) xs.push(p[0]), ys.push(p[1]);
    const dx = MARGIN - Math.min(...xs);
    const dy = MARGIN - Math.min(...ys);
    const sh = (p: Pt): Pt => [p[0] + dx, p[1] + dy];
    const f = (v: number) => Math.round(v * 10) / 10;
    const P = (p: Pt) => `${f(p[0] + dx)} ${f(p[1] + dy)}`;
    const shR = (r: SmRect) => ({ x: f(r.x + dx), y: f(r.y + dy), w: f(r.w), h: f(r.h) });

    const edges: SmEdge[] = drafts.map((e) => ({
      id: e.key,
      from: e.trs[0].from,
      to: e.trs[0].to,
      transitions: e.trs.map((tr) => tr.id),
      d: e.d(P),
      label: { ...shR(e.lab as SmRect), lines: edgeLines(m, e.trs) },
      samples: e.samples.map(sh),
    }));
    const d: SmDiagram = {
      width: Math.ceil(Math.max(...xs) + dx + MARGIN),
      height: Math.ceil(Math.max(...ys) + dy + MARGIN),
      boxes: boxes.map((b) => ({ ...b, ...shR(b) })),
      edges,
      start: start ? { cx: f(start.cx + dx), cy: f(start.cy + dy), x2: f(start.x2 + dx), y2: f(start.y2 + dy) } : null,
    };
    return { d, near, placed };
  };
  // wider gaps until every label sits on or beside its own arrow, clear of the other arrows
  const tries = [place(COL_GAP, ROW_GAP)];
  for (const k of [1.4, 1.8, 2.4]) {
    if (tries[tries.length - 1].near) break;
    tries.push(place(COL_GAP * k, ROW_GAP * k));
  }
  return (tries.find((x) => x.near) ?? tries.find((x) => x.placed) ?? tries[tries.length - 1]).d;
}

/* ---------- starter examples ---------- */

export interface SmExample {
  id: string;
  title: string;
  summary: string;
  build(): StateMachine;
}

type Tr = [from: string, event: string, to: string, guard?: string, action?: string];

function machine(name: string, states: [string, string][], events: [string, string][], trs: Tr[]): StateMachine {
  const sid = new Map(states.map(([n], i) => [n, `s${i + 1}`]));
  const eid = new Map(events.map(([n], i) => [n, `e${i + 1}`]));
  return {
    name,
    initial: 's1',
    states: states.map(([n, note], i) => ({ id: `s${i + 1}`, name: n, ...(note ? { note } : {}) })),
    events: events.map(([n, note], i) => ({ id: `e${i + 1}`, name: n, ...(note ? { note } : {}) })),
    transitions: trs.map(([from, ev, to, guard, action], i) => ({
      id: `t${i + 1}`,
      from: sid.get(from) as string,
      event: eid.get(ev) as string,
      to: sid.get(to) as string,
      ...(guard ? { guard } : {}),
      ...(action ? { action } : {}),
    })),
  };
}

/** Filled machines so the designer never starts empty. Texts are translated when loaded. */
export function smExamples(): SmExample[] {
  return [
    {
      id: 'thermostat',
      title: t('Thermostat (from the lesson)'),
      summary: t('Idle, heating and an error state that waits for a reset.'),
      build: () =>
        machine(
          'thermostat',
          [['IDLE', t('Heater off')], ['HEATING', t('Heater on')], ['ERROR', t('Heater off, LED blinks')]],
          [['TOO_COLD', t('Temperature below the target')], ['TARGET_REACHED', t('Temperature at the target')], ['SENSOR_FAILS', t('The sensor stops answering')], ['RESET', t('The user presses reset')]],
          [
            ['IDLE', 'TOO_COLD', 'HEATING', '', t('heater on')],
            ['HEATING', 'TARGET_REACHED', 'IDLE', '', t('heater off')],
            ['IDLE', 'SENSOR_FAILS', 'ERROR'],
            ['HEATING', 'SENSOR_FAILS', 'ERROR', '', t('heater off')],
            ['ERROR', 'RESET', 'IDLE'],
          ],
        ),
    },
    {
      id: 'traffic-light',
      title: t('Traffic light'),
      summary: t('Red, green, yellow on a timer; a pedestrian button shortens green.'),
      build: () =>
        machine(
          'traffic_light',
          [['RED', t('Red on, 20 s')], ['GREEN', t('Green on, 20 s')], ['YELLOW', t('Yellow on, 3 s')]],
          [['TIMER_DONE', t('The time of the current light is over')], ['BUTTON', t('A pedestrian presses the button')]],
          [
            ['RED', 'TIMER_DONE', 'GREEN', '', t('start the 20 s timer')],
            ['GREEN', 'TIMER_DONE', 'YELLOW', '', t('start the 3 s timer')],
            ['GREEN', 'BUTTON', 'YELLOW', t('green for at least 5 s'), t('start the 3 s timer')],
            ['YELLOW', 'TIMER_DONE', 'RED', '', t('start the 20 s timer')],
          ],
        ),
    },
    {
      id: 'debounce',
      title: t('Button debounce'),
      summary: t('A press counts only when the pin stays low for 20 ms.'),
      build: () =>
        machine(
          'button',
          [['RELEASED', t('Not pressed')], ['MAYBE_PRESSED', t('Went low, waiting 20 ms')], ['PRESSED', t('Pressed for sure')], ['MAYBE_RELEASED', t('Went high, waiting 20 ms')]],
          [['PIN_LOW', t('The pin reads LOW (pressed, with a pull-up)')], ['PIN_HIGH', t('The pin reads HIGH')], ['TIMER_DONE', t('20 ms have passed')]],
          [
            ['RELEASED', 'PIN_LOW', 'MAYBE_PRESSED', '', t('start the 20 ms timer')],
            ['MAYBE_PRESSED', 'PIN_HIGH', 'RELEASED', '', t('it was a bounce')],
            ['MAYBE_PRESSED', 'TIMER_DONE', 'PRESSED', '', t('report a press')],
            ['PRESSED', 'PIN_HIGH', 'MAYBE_RELEASED', '', t('start the 20 ms timer')],
            ['MAYBE_RELEASED', 'PIN_LOW', 'PRESSED', '', t('it was a bounce')],
            ['MAYBE_RELEASED', 'TIMER_DONE', 'RELEASED', '', t('report a release')],
          ],
        ),
    },
    {
      id: 'plant-watering',
      title: t('Plant watering (template)'),
      summary: t('The logic of the Plant watering template: wait, water for 3 s, let it soak 30 s.'),
      build: () =>
        machine(
          'plant_watering',
          [['WAITING', t('Pump off, checks the soil every second')], ['WATERING', t('Pump on')], ['SOAKING', t('Pump off, water soaks in')]],
          [['SOIL_DRY', t('Soil below 40%')], ['PUMP_TIME_UP', t('The pump ran for 3 s')], ['SOAK_TIME_UP', t('30 s have passed')]],
          [
            ['WAITING', 'SOIL_DRY', 'WATERING', '', t('pump on')],
            ['WATERING', 'PUMP_TIME_UP', 'SOAKING', '', t('pump off')],
            ['SOAKING', 'SOAK_TIME_UP', 'WAITING'],
          ],
        ),
    },
  ];
}

/** A small machine to start from scratch: two states and one event. */
export function emptyMachine(): StateMachine {
  return machine('my_machine', [['IDLE', ''], ['RUNNING', '']], [['START', ''], ['STOP', '']], [['IDLE', 'START', 'RUNNING'], ['RUNNING', 'STOP', 'IDLE']]);
}
