// JSON Schema adjustments per provider. Our schemas are written once (strict JSON Schema, as
// Anthropic and OpenAI structured outputs want them) and adapted here.

import type { JsonSchema } from './types';

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

// Keywords Gemini accepts in parametersJsonSchema / responseJsonSchema
// (https://ai.google.dev/gemini-api/docs/structured-output, "Supported JSON Schema keywords").
// additionalProperties is dropped on purpose: older Gemini models reject it in function
// declarations, and our code validates every answer anyway.
const GEMINI_KEYWORDS = new Set([
  'type',
  'enum',
  'properties',
  'required',
  'items',
  'prefixItems',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'description',
  'title',
  'format',
  'anyOf',
  'nullable',
  'propertyOrdering',
]);

/** A copy of `schema` that Gemini accepts: unsupported keywords removed, enums of numbers turned
 *  into a range plus a note (Gemini enums are for strings), empty `required` lists dropped. */
export function sanitizeForGemini(schema: JsonSchema): JsonSchema {
  const out: JsonSchema = {};
  for (const [k, v] of Object.entries(schema)) {
    if (!GEMINI_KEYWORDS.has(k)) continue;
    if (k === 'properties' && isObj(v)) {
      out.properties = Object.fromEntries(Object.entries(v).map(([p, s]) => [p, isObj(s) ? sanitizeForGemini(s) : s]));
    } else if (k === 'items' && isObj(v)) {
      out.items = sanitizeForGemini(v);
    } else if ((k === 'anyOf' || k === 'prefixItems') && Array.isArray(v)) {
      out[k] = v.map((s) => (isObj(s) ? sanitizeForGemini(s) : s));
    } else if (k === 'required' && Array.isArray(v)) {
      if (v.length) out.required = v;
    } else if (k === 'enum' && Array.isArray(v)) {
      if (v.every((e) => typeof e === 'string')) out.enum = v;
      else {
        const nums = v.filter((e): e is number => typeof e === 'number');
        if (nums.length === v.length && nums.length) {
          out.minimum = Math.min(...nums);
          out.maximum = Math.max(...nums);
        }
        const note = `One of: ${v.map((e) => JSON.stringify(e)).join(', ')}.`;
        out.description = typeof schema.description === 'string' ? `${schema.description} ${note}` : note;
      }
    } else if (k === 'description' && typeof out.description === 'string') {
      // already merged with an enum note
    } else {
      out[k] = v;
    }
  }
  // Gemini wants an explicit (possibly empty) properties map on objects.
  if (out.type === 'object' && !isObj(out.properties)) out.properties = {};
  return out;
}

/** True if OpenAI's strict mode accepts the schema: every object lists all its properties as
 *  required and sets additionalProperties to false. */
export function isStrictCompatible(schema: JsonSchema): boolean {
  const walk = (s: unknown): boolean => {
    if (!isObj(s)) return true;
    const types = Array.isArray(s.type) ? s.type : [s.type];
    if (types.includes('object')) {
      const props = isObj(s.properties) ? s.properties : {};
      const req = Array.isArray(s.required) ? s.required : [];
      if (s.additionalProperties !== false) return false;
      if (!Object.keys(props).every((p) => req.includes(p))) return false;
      if (!Object.values(props).every(walk)) return false;
    }
    if (s.items !== undefined && !walk(s.items)) return false;
    if (Array.isArray(s.anyOf) && !s.anyOf.every(walk)) return false;
    return true;
  };
  return walk(schema);
}
