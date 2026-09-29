// Types for tools-i18n.mjs (used by vite.tools.config.ts and tests/tools.test.ts).
export declare const TOOLS_I18N_SOURCES: string[];
export declare function toolsI18nKeys(root: string): string[];
export declare function toolsItDict(root: string, IT: Record<string, string>): Record<string, string>;
export declare function toolsI18nModule(dict: Record<string, string>): string;
