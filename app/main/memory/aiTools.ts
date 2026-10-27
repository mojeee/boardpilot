// The assistant's project-memory tools: search_memory and read_memory. They search only the
// memories attached to the current project (scene.memories). Every result carries the citation
// label the reply must use as a source of kind "memory"; enforceHonesty drops memory sources that
// no tool returned. Kept small and stable: Display Studio uses the same calls.

import { MEMORY_LIMITS } from '@shared/memory';
import type { JsonSchema, ToolSpec } from '../ai/providers/types';
import type { MemoryAccess } from './store';

const obj = (properties: Record<string, unknown>, required: string[]): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false });

export const MEMORY_TOOLS: ToolSpec[] = [
  {
    name: 'search_memory',
    description:
      'Search the user\'s project memory: code, notes and datasheet text from their own old projects that they attached to this project. ' +
      'Use the exact names: a chip or part ("ST7789", "SSD1306"), a register by name or value ("MADCTL", "0x36"), a function, or what it does ("init sequence", "backlight PWM"). ' +
      'Each result has the file, lines, text and the citation label to use as a source of kind "memory".',
    parameters: obj(
      {
        query: { type: 'string', description: 'a few words or identifiers, e.g. "ST7789 init MADCTL"' },
        limit: { type: 'integer', minimum: 1, maximum: 10 },
      },
      ['query', 'limit'],
    ),
  },
  {
    name: 'read_memory',
    description:
      'Read more of a file in the project memory: a result ref from search_memory (e.g. "m1abc/s1-12"), or a file with lines (e.g. "st7789_init.c:40-120"). At most 200 lines.',
    parameters: obj({ ref: { type: 'string', description: 'a ref from search_memory, or "file:start-end"' } }, ['ref']),
  },
];

export const MEMORY_TOOL_NAMES = new Set(MEMORY_TOOLS.map((t) => t.name));

/** What the tools need: the store and the memories attached to the project. */
export interface MemoryToolContext {
  access: MemoryAccess;
  ids: string[];
}

const NONE_ATTACHED =
  'No project memory is attached to this project, so there is nothing to search. Tell the user they can import old projects and attach them in Project tools → Project memory. Do not guess what an old project did.';

const cut = (text: string) => (text.length > MEMORY_LIMITS.hitChars ? `${text.slice(0, MEMORY_LIMITS.hitChars)}\n… (cut; read_memory with the ref reads all of it)` : text);

/**
 * Runs search_memory / read_memory. `cited` collects every citation label returned, so the reply's
 * memory sources can be checked against them.
 */
export async function runMemoryTool(
  name: string,
  input: Record<string, unknown>,
  ctx: MemoryToolContext | undefined,
  cited: string[],
): Promise<{ content: string; isError: boolean }> {
  const done = (v: unknown) => ({ content: JSON.stringify(v), isError: false });
  if (!ctx) return { content: 'Project memory is only available in the BoardPilot app.', isError: true };
  if (!ctx.ids.length) return done({ results: [], note: NONE_ATTACHED });
  if (name === 'search_memory') {
    const query = typeof input.query === 'string' ? input.query : '';
    if (!query.trim()) return { content: 'Give a query: a part, a register or what the code does.', isError: true };
    const limit = typeof input.limit === 'number' && Number.isInteger(input.limit) ? Math.max(1, Math.min(10, input.limit)) : 5;
    const hits = await ctx.access.search(query, ctx.ids, limit);
    cited.push(...hits.map((h) => h.citation));
    if (!hits.length) return done({ results: [], note: 'Nothing in the attached memory matches. Try other words (the chip name, a register, a function name), or say that the memory has nothing on it.' });
    return done({
      results: hits.map((h) => ({ ref: h.ref, memory: h.memory, file: h.file, lines: `${h.start}-${h.end}`, citation: h.citation, text: cut(h.text) })),
      note: 'This is the user\'s own old code and notes, not a datasheet. Cite each fact you use with kind "memory" and its citation label. Anything you change or infer for this project is a suggestion.',
    });
  }
  if (name === 'read_memory') {
    const ref = typeof input.ref === 'string' ? input.ref : '';
    const r = await ctx.access.read(ref, ctx.ids);
    if (!r) return { content: `Nothing found for "${ref}" in the attached memory. Use a ref or file name from search_memory.`, isError: true };
    cited.push(r.citation);
    return done({ memory: r.memory, file: r.file, lines: `${r.start}-${r.end}`, citation: r.citation, text: r.text });
  }
  return { content: `Unknown tool ${name}`, isError: true };
}
