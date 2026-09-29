// node:path (POSIX) for the browser demo.

import { norm } from './memfs';

export const sep = '/';
export const delimiter = ':';
export const join = (...parts: string[]) => norm(parts.filter(Boolean).join('/'));
export const resolve = join;
export const dirname = (p: string) => {
  const n = norm(p);
  return n.slice(0, n.lastIndexOf('/')) || '/';
};
export const basename = (p: string, ext?: string) => {
  const b = String(p).replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? '';
  return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b;
};
export const extname = (p: string) => /\.[^./]*$/.exec(basename(p))?.[0] ?? '';

export default { sep, delimiter, join, resolve, dirname, basename, extname };
