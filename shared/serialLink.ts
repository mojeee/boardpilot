// From a line of serial output back to the code that printed it: the Monitor's serial console
// links a line to the Serial.print / printf / ESP_LOG call whose fixed text it starts with. Text
// matching only (the board does not say which line printed what), so the link is a likely match,
// and the console says so.

import { calls, stripComments } from './codeCheck';
import type { ProjectFile } from './types';

export interface PrintSite {
  file: string;
  /** 1-based line of the call */
  line: number;
  /** The fixed text the call prints first (format codes cut off), trimmed. */
  text: string;
}

const PRINTS = /^(?:Serial\d?\s*\.\s*(?:print|println|printf)|printf|puts|ESP_LOG[EWIDV]|ets_printf|log_[ewidv]|probe\s*\.\s*(?:step|state|event))$/;

/** The text of a C string literal at the start of `s` ("…" "…" pieces joined), or null. */
function literal(s: string): string | null {
  let out = '';
  let rest = s.trim();
  let any = false;
  for (;;) {
    const m = /^(?:F\(\s*)?"((?:\\.|[^"\\\n])*)"\s*\)?/.exec(rest);
    if (!m) break;
    any = true;
    out += m[1].replace(/\\n|\\r|\\t/g, ' ').replace(/\\(.)/g, '$1');
    rest = rest.slice(m[0].length).trim();
  }
  return any ? out : null;
}

/** Every call that prints fixed text, in every source file. */
export function printSites(files: ProjectFile[]): PrintSite[] {
  const out: PrintSite[] = [];
  for (const f of files) {
    const code = stripComments(f.text);
    for (const c of calls(code)) {
      const name = c.name.replace(/\s+/g, '');
      if (!PRINTS.test(name)) continue;
      // ESP_LOGI(TAG, "format", …): the text is the second argument.
      const idx = /^ESP_LOG|^log_/.test(name) && c.args.length > 1 && !c.args[0].startsWith('"') ? 1 : 0;
      const at = c.argPos[idx];
      if (at === undefined) continue;
      const lit = literal(f.text.slice(at, c.end));
      if (lit === null) continue;
      const text = lit.split(/%[-+ #0]*\d*(?:\.\d+)?(?:l{0,2}|h{0,2}|z|j|t)?[diouxXeEfFgGcspaA%]/)[0].trim();
      if (text.replace(/\W/g, '').length >= 3) out.push({ file: f.name, line: c.line, text });
    }
  }
  return out;
}

/** The print call a line of output most likely came from, or null. */
export function siteForOutput(output: string, sites: PrintSite[]): PrintSite | null {
  const o = output.trim();
  if (!o) return null;
  let best: PrintSite | null = null;
  for (const s of sites) {
    const hit = o.startsWith(s.text) || (s.text.length >= 8 && o.includes(s.text));
    if (hit && (!best || s.text.length > best.text.length)) best = s;
  }
  return best;
}
