import { describe, expect, it } from 'vitest';
import { tokenize, tokenizeLine } from '@shared/highlight';

const kinds = (line: string) => tokenizeLine(line, false).tokens.filter((t) => t.kind !== 'plain').map((t) => [t.kind, t.text.trim()]);

describe('code colouring', () => {
  it('keeps the text exactly as it is', () => {
    const src = '#include <Wire.h>\nvoid setup() {\n  Serial.begin(115200); // hi\n  /* a\n b */ int x = 0x3C;\n}';
    expect(tokenize(src).map((l) => l.map((t) => t.text).join('')).join('\n')).toBe(src);
  });

  it('colours preprocessor lines, includes, types, API calls, numbers and comments', () => {
    expect(kinds('#include <Wire.h>')).toEqual([
      ['pre', '#include'],
      ['string', '<Wire.h>'],
    ]);
    expect(kinds('void setup() {')).toEqual([
      ['type', 'void'],
      ['api', 'setup'],
    ]);
    expect(kinds('  pinMode(25, OUTPUT); // LED')).toEqual([
      ['api', 'pinMode'],
      ['number', '25'],
      ['const', 'OUTPUT'],
      ['comment', '// LED'],
    ]);
    expect(kinds('bme.begin(0x76);')).toEqual([
      ['call', 'begin'],
      ['number', '0x76'],
    ]);
  });

  it('carries a block comment over several lines', () => {
    const lines = tokenize('/* start\nmiddle\nend */ int a;');
    expect(lines[1]).toEqual([{ kind: 'comment', text: 'middle' }]);
    expect(lines[2][0]).toEqual({ kind: 'comment', text: 'end */' });
    expect(lines[2].some((t) => t.kind === 'type' && t.text === 'int')).toBe(true);
  });

  it('does not colour digits inside names', () => {
    expect(kinds('int led2 = 5;')).toEqual([
      ['type', 'int'],
      ['number', '5'],
    ]);
  });

  it('colours strings with escaped quotes', () => {
    expect(kinds('Serial.println("say \\"hi\\"");')).toEqual([
      ['call', 'println'],
      ['string', '"say \\"hi\\""'],
    ]);
  });
});
