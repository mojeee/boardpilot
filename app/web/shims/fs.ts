// node:fs (synchronous calls) for the browser demo (see memfs.ts).

import { memfs, type Data } from './memfs';

export const existsSync = (path: string) => memfs.has(path) || memfs.isDir(path);
export const readFileSync = (path: string, encoding?: unknown) => memfs.read(path, encoding);
export const writeFileSync = (path: string, data: Data, _opts?: unknown) => memfs.write(path, data);
export const mkdirSync = (_path: string, _opts?: unknown) => undefined;
export const readdirSync = (path: string) => memfs.list(path);

export default { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync };
