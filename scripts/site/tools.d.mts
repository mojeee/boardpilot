// Types for tools.mjs (used by tests/tools.test.ts).
import type { BoardDef } from '../../shared/types';
import type { ToolBoard } from './tools-client/calc';

export declare const toolsPath: (lang: 'en' | 'it', slug?: string) => string;
export declare function toolBoards(boards: BoardDef[]): ToolBoard[];
export declare function buildTools(args: {
  lang: 'en' | 'it';
  boards: BoardDef[];
  site: string;
  head: (a: { lang: string; title: string; description: string; url: string; alt: { en: string; it: string }; ld: unknown; body: string }) => string;
  chromeFor: (paths: { en: string; it: string }) => { header: string; footer: string };
}): { pages: Record<string, string>; sitemap: { en: string; it: string; priority: string }[] };
