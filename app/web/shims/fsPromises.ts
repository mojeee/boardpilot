// node:fs/promises for the browser demo (see memfs.ts). Only what the main-process code uses.

import { memfs, type Data } from './memfs';

export async function readFile(path: string, encoding?: unknown) {
  return memfs.read(path, encoding);
}
export async function writeFile(path: string, data: Data, _opts?: unknown) {
  memfs.write(path, data);
}
export async function appendFile(path: string, data: Data) {
  memfs.append(path, data);
}
export async function mkdir(_path: string, _opts?: unknown) {
  return undefined;
}
export async function readdir(path: string) {
  return memfs.list(path);
}
export async function stat(path: string) {
  const dir = !memfs.has(path) && memfs.isDir(path);
  const size = dir ? 0 : memfs.size(path);
  return { size, isFile: () => !dir, isDirectory: () => dir, mtimeMs: Date.now() };
}
export async function rename(from: string, to: string) {
  memfs.rename(from, to);
}
export async function unlink(path: string) {
  memfs.remove(path);
}

export default { readFile, writeFile, appendFile, mkdir, readdir, stat, rename, unlink };
