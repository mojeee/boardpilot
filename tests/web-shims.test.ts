// The in-memory node:fs / node:path shims that let the browser demo run the main-process code.

import { describe, expect, it } from 'vitest';
import { memfs, norm } from '../app/web/shims/memfs';
import * as fsp from '../app/web/shims/fsPromises';
import * as fs from '../app/web/shims/fs';
import { basename, dirname, join } from '../app/web/shims/path';
import { EventEmitter } from '../app/web/shims/events';

describe('web demo shims', () => {
  it('normalises paths like node:path', () => {
    expect(norm('a//b/../c/')).toBe('/a/c');
    expect(join('/data', 'backups', 'index.json')).toBe('/data/backups/index.json');
    expect(dirname('/data/parts/x.json')).toBe('/data/parts');
    expect(basename('/uploads/sketch.ino.bin')).toBe('sketch.ino.bin');
  });

  it('reads back text and bytes, lists folders and renames', async () => {
    await fsp.writeFile('/t/a.json', '{"x":1}');
    await fsp.writeFile('/t/sub/b.bin', new Uint8Array([0xe9, 1, 2]));
    expect(await fsp.readFile('/t/a.json', 'utf8')).toBe('{"x":1}');
    expect([...(await fsp.readFile('/t/sub/b.bin')) as Uint8Array]).toEqual([0xe9, 1, 2]);
    expect(await fsp.readdir('/t')).toEqual(['a.json', 'sub']);
    expect((await fsp.stat('/t/sub/b.bin')).size).toBe(3);
    await fsp.appendFile('/t/a.json', '\n');
    await fsp.rename('/t/a.json', '/t/c.json');
    expect(fs.existsSync('/t/a.json')).toBe(false);
    expect(fs.readFileSync('/t/c.json', 'utf8')).toBe('{"x":1}\n');
    await fsp.unlink('/t/c.json');
    await expect(fsp.readFile('/t/c.json', 'utf8')).rejects.toThrow(/ENOENT/);
    expect(memfs.isDir('/t')).toBe(true);
  });

  it('emits events in order and removes listeners', () => {
    const e = new EventEmitter();
    const got: unknown[] = [];
    const fn = (v: never) => got.push(v);
    e.on('state', fn);
    e.once('state', (v: never) => got.push(`once ${v}`));
    e.emit('state', 1);
    e.emit('state', 2);
    e.off('state', fn);
    e.emit('state', 3);
    expect(got).toEqual([1, 'once 1', 2]);
  });
});
