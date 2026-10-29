// Walks a folder the user added to the archive and finds the projects in it. A folder with a
// build or design file (platformio.ini, a sketch, a CubeMX .ioc, sdkconfig, a KiCad project, a
// BoardPilot project) is one project with everything under it; a folder with only documents or
// schematics is a project of its own too. Only reads, with limits on depth, files and size, and
// skips build output and tool folders. No file watcher: the user presses Rescan.

import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { PartDef } from '@shared/types';
import { DOC_EXT, SOURCE_EXT, analyzeProject, isProjectMarker } from '@shared/archive/extract';
import type { ArchiveProject, ProjectFile } from '@shared/archive/types';

export const SCAN_LIMITS = { depth: 8, entries: 20_000, filesPerProject: 2_000, textBytes: 1024 * 1024, schematicBytes: 4 * 1024 * 1024 };

export const SKIP_DIRS = /^(\.git|\.svn|\.hg|node_modules|\.pio|\.pioenvs|build|cmake-build-\w+|Debug|Release|out|dist|\.vscode|\.idea|\.settings|\.metadata|__pycache__|managed_components|\.cache)$/i;

/** Files whose text the extractors read; everything else is listed by name only. */
const TEXT_FILE = /\.(ino|c|cc|cpp|h|hpp|ini|ioc|yml|yaml|md|txt|csv|kicad_sch|json)$|^sdkconfig(\.defaults)?$|^cmakelists\.txt$/i;

interface Entry {
  name: string;
  path: string;
  dir: boolean;
  size: number;
  mtime: number;
}

export interface ScanResult {
  projects: ArchiveProject[];
  /** true when a limit stopped the walk early */
  truncated: boolean;
}

export async function scanFolder(
  archiveRoot: string,
  parts: Record<string, PartDef>,
  previous: ArchiveProject[] = [],
  now = Date.now(),
  onProgress?: (found: number) => void,
): Promise<ScanResult> {
  let seen = 0;
  let truncated = false;
  const prevByRoot = new Map(previous.map((p) => [p.root, p]));
  const out: ArchiveProject[] = [];

  const list = async (dir: string): Promise<Entry[]> => {
    let names: string[] = [];
    try {
      names = await readdir(dir);
    } catch {
      return [];
    }
    const entries: Entry[] = [];
    for (const name of names) {
      if (++seen > SCAN_LIMITS.entries) {
        truncated = true;
        break;
      }
      if (name.startsWith('.') && name !== '.') continue;
      const path = join(dir, name);
      try {
        const s = await stat(path);
        entries.push({ name, path, dir: s.isDirectory(), size: s.size, mtime: s.mtimeMs });
      } catch {
        /* vanished or unreadable: skip */
      }
    }
    return entries;
  };

  /** Every file under a project folder, relative paths with "/". */
  const collect = async (dir: string, rel: string, depth: number, files: Entry[]): Promise<void> => {
    if (depth > SCAN_LIMITS.depth || files.length >= SCAN_LIMITS.filesPerProject) return;
    for (const e of await list(dir)) {
      if (e.dir) {
        if (!SKIP_DIRS.test(e.name)) await collect(e.path, `${rel}${e.name}/`, depth + 1, files);
      } else if (files.length < SCAN_LIMITS.filesPerProject) files.push({ ...e, name: `${rel}${e.name}` });
    }
  };

  const analyze = async (root: string, name: string, entries: Entry[]) => {
    const lastModified = entries.reduce((m, f) => Math.max(m, f.mtime), 0);
    const prev = prevByRoot.get(root);
    if (prev && prev.lastModified === lastModified && prev.fileCount === entries.length) {
      out.push(prev);
      onProgress?.(out.length);
      return;
    }
    const files: ProjectFile[] = [];
    for (const e of entries) {
      const base = basename(e.name);
      const limit = /\.kicad_sch$/i.test(base) ? SCAN_LIMITS.schematicBytes : SCAN_LIMITS.textBytes;
      let text = '';
      if (TEXT_FILE.test(base) && e.size <= limit) text = await readFile(e.path, 'utf8').catch(() => '');
      // a .json is read only if it is a BoardPilot project
      if (/\.json$/i.test(base) && !/\.boardpilot\.json$/i.test(base)) text = '';
      files.push({ path: e.name, text, size: e.size, mtime: e.mtime });
    }
    out.push(analyzeProject(root, archiveRoot, name, files, parts, now));
    onProgress?.(out.length);
  };

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > SCAN_LIMITS.depth || truncated) return;
    const entries = await list(dir);
    const fileNames = entries.filter((e) => !e.dir).map((e) => e.name);
    const markers = fileNames.filter(isProjectMarker);
    const onlyBoardpilot = markers.length > 1 && markers.every((m) => /\.boardpilot\.json$/i.test(m));
    if (markers.length && !onlyBoardpilot) {
      const files: Entry[] = [];
      await collect(dir, '', depth, files);
      await analyze(dir, basename(dir), files);
      return;
    }
    if (onlyBoardpilot) {
      // a folder of saved BoardPilot projects: each file is a project
      for (const e of entries.filter((x) => !x.dir && /\.boardpilot\.json$/i.test(x.name)))
        await analyze(e.path, e.name.replace(/\.boardpilot\.json$/i, ''), [{ ...e, name: e.name }]);
    }
    for (const e of entries) if (e.dir && !SKIP_DIRS.test(e.name)) await walk(e.path, depth + 1);
    // documents or schematics directly in a folder (not the archive folder itself): a project too
    const loose = entries.filter((e) => !e.dir && (DOC_EXT.test(e.name) || /\.(kicad_sch|kicad_pcb|sch|brd)$/i.test(e.name)) && !SOURCE_EXT.test(e.name));
    if (depth > 0 && loose.length && !onlyBoardpilot) await analyze(dir, basename(dir), loose.map((e) => ({ ...e, name: e.name })));
  };

  await walk(archiveRoot, 0);
  return { projects: out, truncated };
}
