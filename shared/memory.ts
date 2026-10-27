// Project memory (a client calls it a "mind"): what the user learnt in old projects (source code,
// datasheet text, notes), split into chunks with file and line ranges, searched locally with BM25.
// Nothing here talks to a server: the store lives in the app data folder (app/main/memory/) and the
// assistant reads it through search_memory / read_memory, citing "memory · <name> · <file>:<lines>".
// Pure logic, no Node: used by the main process, the tests and the renderer (types only).

export const MEMORY_FORMAT = 'boardpilot-memory@1';

export type MemorySourceKind = 'code' | 'pdf' | 'note';

export interface MemorySource {
  /** "s1", "s2"…, unique inside the memory */
  id: string;
  kind: MemorySourceKind;
  /** folder name, PDF file name, or the first words of a note */
  label: string;
  /** ISO time of the import */
  addedAt: string;
  files: number;
  bytes: number;
  /** files left out (too big, binary, over the limits) */
  skipped: number;
  /** the folder or file it came from, on this computer only (removed on export) */
  origin?: string;
}

export interface MemoryChunk {
  /** "<source id>-<n>", unique inside the memory */
  id: string;
  source: string;
  /** path inside the imported folder ("drivers/st7789_init.c"), the PDF name, or "notes/<slug>.txt" */
  file: string;
  /** first and last line, 1-based, inclusive; the chunks of one file cover all its lines in order */
  start: number;
  end: number;
  text: string;
}

/** One memory as it is saved: a JSON file in <app data>/memory, and the file shared with a colleague. */
export interface MemoryFile {
  format: typeof MEMORY_FORMAT;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  sources: MemorySource[];
  chunks: MemoryChunk[];
}

/** What the renderer sees of a memory: no chunk text. */
export interface MemoryInfo {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  sources: MemorySource[];
  chunks: number;
  bytes: number;
}

/** A search result, as the assistant and the Memory panel get it. */
export interface MemoryHit {
  /** "<memory id>/<chunk id>": what read_memory takes */
  ref: string;
  memoryId: string;
  memory: string;
  file: string;
  start: number;
  end: number;
  /** the label to cite, e.g. "memory · acme-panels · st7789_init.c:40-58" */
  citation: string;
  score: number;
  text: string;
}

/** What a folder import reports back. */
export interface MemoryFolderImport {
  memory: MemoryInfo;
  files: number;
  chunks: number;
  skipped: number;
  /** folders left out because they hold build output or vendor code */
  skippedDirs: string[];
  /** true when a limit stopped the import early */
  capped: boolean;
}

/* ---------------- limits ---------------- */

export const MEMORY_LIMITS = {
  /** one source file; bigger files are skipped (generated tables, logs) */
  fileBytes: 512 * 1024,
  /** files read from one folder */
  files: 3000,
  /** text read from one folder */
  importBytes: 25 * 1024 * 1024,
  /** text in one memory */
  memoryBytes: 60 * 1024 * 1024,
  /** a note */
  noteChars: 20_000,
  /** folder depth */
  depth: 12,
  /** text of one hit sent to the model */
  hitChars: 3000,
  /** lines read_memory returns at most */
  readLines: 200,
};

/** Source files worth learning from: Arduino, ESP-IDF, STM32 HAL / CubeMX, Pico SDK, PlatformIO, notes. */
const CODE_EXT = /\.(ino|pde|c|cc|cpp|cxx|h|hh|hpp|hxx|ioc|cmake|ini|ld)$/i;
const TEXT_EXT = /\.(md|txt|rst)$/i;
const CODE_NAMES = /^(CMakeLists\.txt|Makefile|Kconfig(\..+)?|sdkconfig\.defaults|platformio\.ini|library\.properties|idf_component\.yml)$/;

/** Folders never read: version control, build output, editor state, downloaded or vendor code. */
const SKIP_DIRS = new Set([
  '.git', '.svn', '.hg', 'node_modules', 'build', '.pio', '.pioenvs', '.piolibdeps', '.vscode', '.idea', '.settings', '.metadata',
  'Debug', 'Release', 'out', 'dist', 'bin', 'obj', '__pycache__', '.cache', 'managed_components', 'CMSIS', 'Middlewares', 'pico-sdk', 'esp-idf',
]);

export type MemoryFileKind = 'code' | 'text' | null;

/** Whether a file in an imported folder is read, and as code or as text. */
export function memoryFileKind(name: string): MemoryFileKind {
  if (CODE_NAMES.test(name)) return 'code';
  if (CODE_EXT.test(name)) return 'code';
  if (TEXT_EXT.test(name)) return 'text';
  return null;
}

/** Folders skipped while importing (STM32 *_HAL_Driver folders are ST's own code, thousands of files). */
export function skipMemoryDir(name: string): boolean {
  return SKIP_DIRS.has(name) || /^cmake-build-/.test(name) || /_(HAL|LL)_Driver$/.test(name) || (name.startsWith('.') && name.length > 1);
}

/* ---------------- chunking ---------------- */

export interface TextChunk {
  start: number;
  end: number;
  text: string;
}

const blank = (s: string) => !s.trim();

/**
 * Brace depth at the start of every line, ignoring braces in comments, strings and characters.
 * Enough to find where a function, struct or table ends; not a C parser.
 */
export function braceDepths(lines: string[]): number[] {
  const out: number[] = [];
  let depth = 0;
  let inBlock = false;
  for (const line of lines) {
    out.push(depth);
    let q: string | null = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      const n = line[i + 1];
      if (inBlock) {
        if (c === '*' && n === '/') {
          inBlock = false;
          i++;
        }
        continue;
      }
      if (q) {
        if (c === '\\') i++;
        else if (c === q) q = null;
        continue;
      }
      if (c === '/' && n === '/') break;
      if (c === '/' && n === '*') {
        inBlock = true;
        i++;
      } else if (c === '"' || c === "'") q = c;
      else if (c === '{') depth++;
      else if (c === '}') depth = Math.max(0, depth - 1);
    }
  }
  out.push(depth);
  return out;
}

/** Split [0, n) into pieces at the allowed cut points, each about `target` lines, never over `max`. */
function pack(n: number, cuts: Set<number>, target: number, max: number, lines: string[], second: Set<number> = new Set()): [number, number][] {
  const out: [number, number][] = [];
  const min = Math.max(5, Math.floor(target / 3));
  let from = 0;
  while (from < n) {
    const rest = n - from;
    if (rest <= target * 1.5) {
      out.push([from, n]);
      break;
    }
    // the allowed cut closest to the target size; second-choice cuts only when there is none
    const closest = (set: Set<number>) => {
      let c = -1;
      for (let i = from + min; i <= Math.min(from + max, n - min); i++) {
        if (set.has(i) && (c < 0 || Math.abs(i - from - target) < Math.abs(c - from - target))) c = i;
      }
      return c;
    };
    let cut = closest(cuts);
    if (cut < 0) cut = closest(second);
    if (cut < 0 && rest <= max) {
      out.push([from, n]);
      break;
    }
    if (cut < 0) {
      // no good place: a blank line before max, else max itself
      cut = from + max;
      for (let i = from + max; i > from + target; i--) if (blank(lines[i - 1] ?? '')) { cut = i; break; }
    }
    out.push([from, cut]);
    from = cut;
  }
  return out;
}

/** Pieces that are only blank lines join the piece before them (or after, at the top). */
function joinBlank(pieces: [number, number][], lines: string[]): [number, number][] {
  const out: [number, number][] = [];
  for (const p of pieces) {
    const empty = lines.slice(p[0], p[1]).every(blank);
    if (empty && out.length) out[out.length - 1][1] = p[1];
    else if (out.length && lines.slice(out[out.length - 1][0], out[out.length - 1][1]).every(blank)) out[out.length - 1][1] = p[1];
    else out.push([...p]);
  }
  return out;
}

const toChunks = (pieces: [number, number][], lines: string[]): TextChunk[] =>
  pieces.map(([a, b]) => ({ start: a + 1, end: b, text: lines.slice(a, b).join('\n') })).filter((c) => c.text.trim());

/**
 * Code in chunks of about 40 lines that start where a top-level block may start: after a blank
 * line or a closing brace at depth 0. A comment right above a function stays with it. Long
 * functions are cut at blank lines. The chunks cover every line, in order.
 */
export function chunkCode(text: string, target = 40, max = 80): TextChunk[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const depth = braceDepths(lines);
  const cuts = new Set<number>();
  for (let i = 1; i < lines.length; i++) {
    if (depth[i] !== 0 || blank(lines[i])) continue;
    // a new top-level line after a blank line, or right after a block closed
    if (blank(lines[i - 1]) || (depth[i - 1] > 0 && depth[i] === 0)) cuts.add(i);
  }
  // inside long functions, blank lines are the second choice
  const second = new Set<number>();
  for (let i = 1; i < lines.length; i++) if (blank(lines[i - 1]) && !blank(lines[i]) && depth[i] <= 1) second.add(i);
  return toChunks(joinBlank(pack(lines.length, cuts, target, max, lines, second), lines), lines);
}

/** Plain text (notes, README files, datasheet text) in chunks of paragraphs, about 30 lines. */
export function chunkText(text: string, target = 30, max = 60): TextChunk[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const cuts = new Set<number>();
  for (let i = 1; i < lines.length; i++) if (blank(lines[i - 1]) && !blank(lines[i])) cuts.add(i);
  for (let i = 1; i < lines.length; i++) if (/^#{1,6}\s/.test(lines[i])) cuts.add(i);
  return toChunks(joinBlank(pack(lines.length, cuts, target, max, lines), lines), lines);
}

/* ---------------- tokens ---------------- */

const STOP = new Set(
  (
    'the a an and or of to in is it its for on with as at by be this that these those are was were will can could should would not no if then else ' +
    'we i you he she they me my our your how what which who when where why did do does done have has had last time use used using about from into ' +
    'please tell show give get got make made want need there here also just like so some any all one'
  ).split(' '),
);
// Italian question words, so "come abbiamo inizializzato il ST7789" searches like the English one
for (const w of 'il lo la le gli di da del della dei con per che non un una uno come abbiamo avevamo ho hai ultima volta quale quali dove quando cosa mio mia nostro nostra'.split(' ')) STOP.add(w);

/** Words that mean the same in code and in questions. */
const SAME: Record<string, string> = {
  initialise: 'init', initialize: 'init', initialised: 'init', initialized: 'init', initialising: 'init', initializing: 'init',
  initialisation: 'init', initialization: 'init', initialisations: 'init', initializations: 'init', inizializzato: 'init', inizializzare: 'init',
  inizializzazione: 'init', initial: 'init', setup: 'init', begin: 'init',
  rst: 'reset', resets: 'reset', rotation: 'rotate', rotations: 'rotate', orientation: 'rotate',
  milliseconds: 'ms', millisecond: 'ms', msec: 'ms', delays: 'delay', wait: 'delay', waits: 'delay',
  colour: 'color', colours: 'color', colors: 'color', brightness: 'backlight', bl: 'backlight',
  registers: 'register', reg: 'register', regs: 'register', command: 'cmd', commands: 'cmd', cmds: 'cmd',
};

/** "0x36", "0X0036" and "36h" are all the register 0x36. */
function hex(digits: string): string {
  const d = digits.toLowerCase().replace(/^0+(?=.)/, '');
  return `0x${d.length < 2 ? d.padStart(2, '0') : d}`;
}

function word(w: string): string {
  if (SAME[w]) return SAME[w];
  // plural s on plain words (pins → pin), not on "ss" (address) or short words
  if (/^[a-z]{5,}s$/.test(w) && !w.endsWith('ss')) {
    const one = w.slice(0, -1);
    return SAME[one] ?? one;
  }
  return w;
}

/**
 * Code-aware tokens: identifiers whole and split (ST7789_MADCTL → st7789_madctl, st7789, madctl;
 * setAddrWindow → setaddrwindow, set, addr, window), part numbers with and without their suffix
 * (ST7789V → st7789v, st7789), hex values normalised (0x36, 0x0036, 36h → 0x36), numbers.
 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  const re = /0[xX]([0-9a-fA-F]+)|\b([0-9a-fA-F]{1,4})[hH]\b|[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?/g;
  for (const m of text.matchAll(re)) {
    if (m[1] !== undefined) {
      out.push(hex(m[1]));
      continue;
    }
    if (m[2] !== undefined) {
      // "36h" only when it has a digit (not "each", "high")
      if (/\d/.test(m[2])) out.push(hex(m[2]));
      else push(m[0]);
      continue;
    }
    push(m[0]);
  }
  return out;

  function push(raw: string) {
    if (/^\d/.test(raw)) {
      if (raw.length >= 2) out.push(raw);
      return;
    }
    const whole = raw.toLowerCase().replace(/^_+|_+$/g, '');
    if (!whole) return;
    const parts = raw
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .split(/[_\s]+/)
      .map((p) => p.toLowerCase())
      .filter(Boolean);
    const seen = new Set<string>();
    const add = (w: string) => {
      if (w.length < 2 || STOP.has(w) || seen.has(w)) return;
      seen.add(w);
      out.push(w);
    };
    add(parts.length > 1 ? whole : word(whole));
    if (parts.length > 1) for (const p of parts) add(/^\d+$/.test(p) ? p : word(p));
    // part numbers: st7789v → st7789, ssd1306a → ssd1306
    for (const p of parts.length > 1 ? parts : [whole]) {
      const stem = /^([a-z]+\d+)[a-z]{1,2}$/.exec(p);
      if (stem) add(stem[1]);
    }
  }
}

/* ---------------- search (BM25) ---------------- */

interface Doc {
  memoryId: string;
  memory: string;
  chunk: MemoryChunk;
  len: number;
  tf: Map<string, number>;
}

export interface MemoryIndex {
  docs: Doc[];
  df: Map<string, number>;
  avgLen: number;
}

/** Big data tables (fonts, bitmaps) would match every hex value: their numbers are not indexed. */
const DATA_TABLE_NUMBERS = 400;

const NOT_NAMES = new Set(['if', 'for', 'while', 'switch', 'return', 'sizeof', 'else', 'do', 'case']);

/**
 * Names a chunk defines at the top level: functions, #define, struct / class / enum. A chunk that
 * defines st7789_init says more about it than one that only calls it.
 */
export function definedNames(text: string): string[] {
  const lines = text.split('\n');
  const depth = braceDepths(lines);
  const out: string[] = [];
  lines.forEach((line, i) => {
    const def = /^\s*#\s*define\s+([A-Za-z_]\w*)/.exec(line) ?? /^\s*(?:typedef\s+)?(?:struct|class|enum|union)\s+([A-Za-z_]\w*)/.exec(line);
    if (def) return void out.push(def[1]);
    if (depth[i] !== 0) return;
    // "static void st7789_cmd(uint8_t c) {": a return type, a name, "(" and no ";" (not a prototype or a call)
    const fn = /^(?:[A-Za-z_][\w:<>,]*[\s*&]+)+([A-Za-z_]\w*)\s*\([^;]*$/.exec(line);
    if (fn && !NOT_NAMES.has(fn[1])) out.push(fn[1]);
  });
  return out;
}

const NUMBER = /^(0x[0-9a-f]+|\d+(\.\d+)?)$/;

function docTokens(chunk: MemoryChunk): string[] {
  let toks = tokenize(chunk.text);
  const numbers = toks.filter((x) => NUMBER.test(x)).length;
  if (numbers > DATA_TABLE_NUMBERS) toks = toks.filter((x) => !NUMBER.test(x));
  // the file name and the names defined here count twice: "st7789_init.c", "void st7789_init(void)"
  const name = tokenize(chunk.file.replace(/\.[a-z]+$/i, '').replace(/[/\\.-]+/g, ' '));
  const defs = [...new Set(tokenize(definedNames(chunk.text).join(' ')))];
  return [...toks, ...name, ...name, ...defs, ...defs];
}

export function buildIndex(memories: { id: string; name: string; chunks: MemoryChunk[] }[]): MemoryIndex {
  const docs: Doc[] = [];
  const df = new Map<string, number>();
  let total = 0;
  for (const m of memories) {
    for (const chunk of m.chunks) {
      const toks = docTokens(chunk);
      const tf = new Map<string, number>();
      for (const x of toks) tf.set(x, (tf.get(x) ?? 0) + 1);
      for (const x of tf.keys()) df.set(x, (df.get(x) ?? 0) + 1);
      docs.push({ memoryId: m.id, memory: m.name, chunk, len: toks.length, tf });
      total += toks.length;
    }
  }
  return { docs, df, avgLen: docs.length ? total / docs.length : 1 };
}

const K1 = 2;
const B = 0.4;

/** Best chunks for a query, BM25 with a bonus for chunks that contain more of the query's words. */
export function searchIndex(index: MemoryIndex, query: string, limit = 6): MemoryHit[] {
  const terms = [...new Set(tokenize(query))].filter((x) => index.df.has(x));
  if (!terms.length) return [];
  const n = index.docs.length;
  const idf = new Map(terms.map((x) => [x, Math.log(1 + (n - index.df.get(x)! + 0.5) / (index.df.get(x)! + 0.5))]));
  const scored: { doc: Doc; score: number }[] = [];
  for (const doc of index.docs) {
    let score = 0;
    let matched = 0;
    for (const x of terms) {
      const f = doc.tf.get(x);
      if (!f) continue;
      matched++;
      score += idf.get(x)! * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * doc.len) / index.avgLen)));
    }
    if (score > 0) scored.push({ doc, score: score * (1 + (0.5 * matched) / terms.length) });
  }
  scored.sort((a, b) => b.score - a.score || a.doc.chunk.file.localeCompare(b.doc.chunk.file) || a.doc.chunk.start - b.doc.chunk.start);
  return scored.slice(0, Math.max(1, Math.min(limit, 20))).map(({ doc, score }) => ({
    ref: `${doc.memoryId}/${doc.chunk.id}`,
    memoryId: doc.memoryId,
    memory: doc.memory,
    file: doc.chunk.file,
    start: doc.chunk.start,
    end: doc.chunk.end,
    citation: memoryCitation(doc.memory, doc.chunk.file, doc.chunk.start, doc.chunk.end),
    score: Math.round(score * 100) / 100,
    text: doc.chunk.text,
  }));
}

/* ---------------- citations ---------------- */

/** "memory · acme-panels · st7789_init.c:40-58": the label of an AiSource of kind "memory". */
export function memoryCitation(memory: string, file: string, start: number, end: number): string {
  return `memory · ${memory} · ${file}:${start === end ? start : `${start}-${end}`}`;
}

export function parseMemoryCitation(label: string): { memory: string; file: string; start: number; end: number } | null {
  const m = /^\s*memory\s*·\s*(.+?)\s*·\s*(.+?):(\d+)(?:\s*[-–]\s*(\d+))?\s*$/i.exec(label);
  if (!m) return null;
  const start = Number(m[3]);
  const end = m[4] ? Number(m[4]) : start;
  return { memory: m[1], file: m[2], start: Math.min(start, end), end: Math.max(start, end) };
}

/**
 * A memory citation counts only if a memory tool returned that file of that memory, with lines that
 * overlap what the tool returned (the model may cite the few lines it used out of a chunk).
 */
export function citationBacked(label: string, returned: Iterable<string>): boolean {
  const c = parseMemoryCitation(label);
  if (!c) return false;
  for (const r of returned) {
    const x = parseMemoryCitation(r);
    if (x && x.memory.toLowerCase() === c.memory.toLowerCase() && x.file === c.file && c.start <= x.end && c.end >= x.start) return true;
  }
  return false;
}

/* ---------------- reading ---------------- */

/** Lines start..end of one file of a memory, put back together from its chunks. */
export function readRange(mem: MemoryFile, file: string, start: number, end: number): { file: string; start: number; end: number; text: string } | null {
  const want = file.replace(/\\/g, '/').replace(/^\.?\//, '');
  const exact = mem.chunks.filter((c) => c.file === want);
  const chunks = exact.length ? exact : mem.chunks.filter((c) => c.file.endsWith(`/${want}`) && c.file.endsWith(want));
  if (!chunks.length) return null;
  const name = chunks[0].file;
  const own = chunks.filter((c) => c.file === name).sort((a, b) => a.start - b.start);
  const last = own[own.length - 1].end;
  const from = Math.max(1, Math.min(start, last));
  const to = Math.min(last, Math.max(from, end), from + MEMORY_LIMITS.readLines - 1);
  const lines: string[] = [];
  for (const c of own) {
    const cl = c.text.split('\n');
    for (let i = 0; i < cl.length; i++) {
      const n = c.start + i;
      if (n >= from && n <= to) lines.push(cl[i]);
    }
  }
  return { file: name, start: from, end: to, text: lines.join('\n') };
}

/* ---------------- files: create, notes, export / import ---------------- */

export const newMemoryId = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Names are shown in citations: one line, no "·", at most 60 characters. */
export function cleanMemoryName(name: string): string {
  return name.replace(/[·\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

export function emptyMemory(name: string, now = new Date()): MemoryFile {
  const iso = now.toISOString();
  return { format: MEMORY_FORMAT, id: newMemoryId(), name: cleanMemoryName(name) || 'Memory', createdAt: iso, updatedAt: iso, sources: [], chunks: [] };
}

export function memoryInfo(m: MemoryFile): MemoryInfo {
  return {
    id: m.id,
    name: m.name,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    sources: m.sources,
    chunks: m.chunks.length,
    bytes: m.sources.reduce((s, x) => s + x.bytes, 0),
  };
}

export const nextSourceId = (m: MemoryFile) => `s${m.sources.reduce((n, s) => Math.max(n, Number(s.id.slice(1)) || 0), 0) + 1}`;

/** A short file name for a note from its first words: "notes/st7789-needs-120-ms-after-reset.txt". */
export function noteFile(text: string, taken: Set<string>): string {
  const slug =
    tokenize(text.split('\n')[0] ?? '')
      .filter((w) => !w.includes('_'))
      .slice(0, 6)
      .join('-')
      .slice(0, 48) || 'note';
  let name = `notes/${slug}.txt`;
  for (let i = 2; taken.has(name); i++) name = `notes/${slug}-${i}.txt`;
  return name;
}

/** Add a note as its own source. */
export function addNote(m: MemoryFile, text: string, now = new Date()): MemoryFile {
  const body = text.replace(/\r\n?/g, '\n').trim().slice(0, MEMORY_LIMITS.noteChars);
  const id = nextSourceId(m);
  const file = noteFile(body, new Set(m.chunks.map((c) => c.file)));
  const chunks = chunkText(body).map((c, i) => ({ id: `${id}-${i + 1}`, source: id, file, ...c }));
  const label = body.split('\n')[0].slice(0, 80);
  const source: MemorySource = { id, kind: 'note', label, addedAt: now.toISOString(), files: 1, bytes: body.length, skipped: 0 };
  return { ...m, updatedAt: now.toISOString(), sources: [...m.sources, source], chunks: [...m.chunks, ...chunks] };
}

/** Add files read from a folder (or one PDF's text) as one source. Re-importing the same origin replaces it. */
export function addFiles(
  m: MemoryFile,
  src: { kind: 'code' | 'pdf'; label: string; origin?: string; skipped: number },
  files: { path: string; text: string; kind: 'code' | 'text' }[],
  now = new Date(),
): MemoryFile {
  const base = src.origin ? removeSource(m, m.sources.find((s) => s.origin === src.origin)?.id ?? '') : m;
  const id = nextSourceId(base);
  const chunks: MemoryChunk[] = [];
  let bytes = 0;
  for (const f of files) {
    bytes += f.text.length;
    const parts = f.kind === 'code' ? chunkCode(f.text) : chunkText(f.text);
    for (const c of parts) chunks.push({ id: `${id}-${chunks.length + 1}`, source: id, file: f.path, ...c });
  }
  const source: MemorySource = {
    id,
    kind: src.kind,
    label: src.label.slice(0, 120),
    addedAt: now.toISOString(),
    files: files.length,
    bytes,
    skipped: src.skipped,
    ...(src.origin ? { origin: src.origin } : {}),
  };
  return { ...base, updatedAt: now.toISOString(), sources: [...base.sources, source], chunks: [...base.chunks, ...chunks] };
}

export function removeSource(m: MemoryFile, sourceId: string): MemoryFile {
  if (!m.sources.some((s) => s.id === sourceId)) return m;
  return { ...m, sources: m.sources.filter((s) => s.id !== sourceId), chunks: m.chunks.filter((c) => c.source !== sourceId) };
}

/** The file shared with a colleague: the same memory without where it came from on this computer. */
export function exportMemory(m: MemoryFile): string {
  return JSON.stringify({ ...m, sources: m.sources.map(({ origin: _origin, ...s }) => s) });
}

const isStr = (x: unknown): x is string => typeof x === 'string';
const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;

/** Checks a memory file (saved or shared) field by field; null when it is not one. */
export function parseMemoryFile(raw: unknown): MemoryFile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.format !== MEMORY_FORMAT || !isStr(r.id) || !isStr(r.name) || !Array.isArray(r.sources) || !Array.isArray(r.chunks)) return null;
  const sources: MemorySource[] = [];
  for (const s of r.sources as Record<string, unknown>[]) {
    if (typeof s !== 'object' || s === null || !isStr(s.id) || !isStr(s.label) || !['code', 'pdf', 'note'].includes(s.kind as string)) return null;
    sources.push({
      id: s.id,
      kind: s.kind as MemorySourceKind,
      label: s.label,
      addedAt: isStr(s.addedAt) ? s.addedAt : '',
      files: isInt(s.files) ? s.files : 0,
      bytes: isInt(s.bytes) ? s.bytes : 0,
      skipped: isInt(s.skipped) ? s.skipped : 0,
      ...(isStr(s.origin) ? { origin: s.origin } : {}),
    });
  }
  const ids = new Set(sources.map((s) => s.id));
  const chunks: MemoryChunk[] = [];
  for (const c of r.chunks as Record<string, unknown>[]) {
    if (typeof c !== 'object' || c === null || !isStr(c.id) || !isStr(c.source) || !isStr(c.file) || !isStr(c.text) || !isInt(c.start) || !isInt(c.end)) return null;
    if (!ids.has(c.source)) return null;
    chunks.push({ id: c.id, source: c.source, file: c.file, start: c.start, end: c.end, text: c.text });
  }
  return {
    format: MEMORY_FORMAT,
    id: r.id,
    name: cleanMemoryName(r.name) || 'Memory',
    createdAt: isStr(r.createdAt) ? r.createdAt : '',
    updatedAt: isStr(r.updatedAt) ? r.updatedAt : '',
    sources,
    chunks,
  };
}

/* ---------------- project attachments ---------------- */

/** The memories a project uses (saved in the project file as scene.memories). */
export function attachMemory(ids: readonly string[] | undefined, id: string): string[] {
  return [...new Set([...(ids ?? []), id])];
}

export function detachMemory(ids: readonly string[] | undefined, id: string): string[] {
  return (ids ?? []).filter((x) => x !== id);
}
