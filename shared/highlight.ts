// Syntax colouring for the Code panel: a small tokenizer for C, C++ and Arduino sketches. No
// parser and no dependency: comments, strings, preprocessor lines, keywords, types, numbers,
// function calls and the Arduino API are enough to read a sketch at a glance.

export type TokenKind = 'plain' | 'comment' | 'string' | 'pre' | 'keyword' | 'type' | 'number' | 'call' | 'api' | 'const';

export interface Token {
  kind: TokenKind;
  text: string;
}

const KEYWORDS = new Set(
  'if else for while do switch case default break continue return goto sizeof new delete class struct union enum typedef template typename namespace using public private protected virtual override static const constexpr volatile extern inline auto register mutable friend operator this true false nullptr NULL'.split(
    ' ',
  ),
);
const TYPES = new Set(
  'void bool boolean char byte int long short float double unsigned signed size_t word String uint8_t uint16_t uint32_t uint64_t int8_t int16_t int32_t int64_t gpio_num_t pin_size_t'.split(
    ' ',
  ),
);
/** Arduino and ESP32 core functions a beginner meets first. */
const API = new Set(
  'setup loop pinMode digitalWrite digitalRead analogRead analogWrite analogReadMilliVolts delay delayMicroseconds millis micros attachInterrupt detachInterrupt tone noTone map constrain random pulseIn ledcAttach ledcAttachPin ledcWrite ledcSetup'.split(
    ' ',
  ),
);
const CONSTS = /^(HIGH|LOW|INPUT|OUTPUT|INPUT_PULLUP|INPUT_PULLDOWN|LED_BUILTIN|RISING|FALLING|CHANGE|[A-Z][A-Z0-9_]{2,})$/;

/** Tokens of one line. `inComment` carries a block comment over from the line before. */
export function tokenizeLine(line: string, inComment: boolean): { tokens: Token[]; inComment: boolean } {
  const out: Token[] = [];
  const push = (kind: TokenKind, text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ kind, text });
  };
  let i = 0;
  if (inComment) {
    const end = line.indexOf('*/');
    if (end < 0) return { tokens: [{ kind: 'comment', text: line }], inComment: true };
    push('comment', line.slice(0, end + 2));
    i = end + 2;
    inComment = false;
  }
  if (/^\s*#/.test(line.slice(i))) {
    // #include <Wire.h>, #define LED 25: the directive is coloured, the rest tokenized as usual
    const m = /^(\s*#\s*\w+)/.exec(line.slice(i));
    if (m) {
      push('pre', m[1]);
      i += m[1].length;
      const rest = line.slice(i);
      const inc = /^(\s*)(<[^>]*>)/.exec(rest);
      if (inc) {
        push('plain', inc[1]);
        push('string', inc[2]);
        i += inc[0].length;
      }
    }
  }
  while (i < line.length) {
    const rest = line.slice(i);
    if (rest.startsWith('//')) {
      push('comment', rest);
      break;
    }
    if (rest.startsWith('/*')) {
      const end = rest.indexOf('*/', 2);
      if (end < 0) {
        push('comment', rest);
        return { tokens: out, inComment: true };
      }
      push('comment', rest.slice(0, end + 2));
      i += end + 2;
      continue;
    }
    const str = /^("(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?)/.exec(rest);
    if (str) {
      push('string', str[0]);
      i += str[0].length;
      continue;
    }
    const num = /^(0x[0-9a-fA-F]+|0b[01]+|\d+\.?\d*(?:[eE][-+]?\d+)?[fFuUlL]*)/.exec(rest);
    if (num && !/[\w]/.test(line[i - 1] ?? '')) {
      push('number', num[0]);
      i += num[0].length;
      continue;
    }
    const word = /^[A-Za-z_]\w*/.exec(rest);
    if (word) {
      const w = word[0];
      const after = line.slice(i + w.length);
      let kind: TokenKind = 'plain';
      if (KEYWORDS.has(w)) kind = 'keyword';
      else if (TYPES.has(w)) kind = 'type';
      else if (API.has(w)) kind = 'api';
      else if (CONSTS.test(w)) kind = 'const';
      else if (/^\s*\(/.test(after)) kind = 'call';
      push(kind, w);
      i += w.length;
      continue;
    }
    push('plain', line[i]);
    i++;
  }
  return { tokens: out, inComment };
}

/** Tokens for every line of a text. */
export function tokenize(text: string): Token[][] {
  let inComment = false;
  return text.split('\n').map((line) => {
    const r = tokenizeLine(line, inComment);
    inComment = r.inComment;
    return r.tokens;
  });
}
