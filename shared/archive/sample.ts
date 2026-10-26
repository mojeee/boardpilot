// The sample archive (examples/archive-hvac): six small fictional heating and climate projects in
// different formats, bundled so "Try the sample archive" works in the app and the browser demo.

const RAW = import.meta.glob<string>('../../examples/archive-hvac/**/*', { query: '?raw', import: 'default', eager: true });

export const SAMPLE_ARCHIVE: { path: string; text: string }[] = Object.entries(RAW).map(([k, text]) => ({
  path: k.replace(/^.*examples\/archive-hvac\//, ''),
  text,
}));
