// import.meta.glob is provided by Vite (electron-vite and Vitest both use it).
interface ImportMeta {
  glob<T = unknown>(pattern: string, options?: { eager?: boolean; import?: string }): Record<string, T>;
}
