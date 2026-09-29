// Small inline icons (no icon library).

const P: Record<string, string> = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  connect: 'M9 7V3m6 4V3M7 7h10v4a5 5 0 0 1-10 0zM12 16v5',
  project: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM16.5 13v7M13 16.5h7',
  flash: 'M13 2L4 14h7l-1 8 9-12h-7z',
  debug: 'M8 9a4 4 0 0 1 8 0v5a4 4 0 0 1-8 0zM12 9v9M4 12h4M16 12h4M5 6l3 2M19 6l-3 2M5 19l3-2M19 19l-3-2',
  monitor: 'M3 17l5-6 4 3 5-8 4 5M3 21h18',
  test: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3',
  report: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7',
  ai: 'M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  send: 'M4 12l16-8-6 16-2-7z',
  restore: 'M4 12a8 8 0 1 0 3-6.2M4 4v4h4',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 12l2-1-1-3-2 .3-1.5-1.5L17 5l-3-1-1 2h-2L10 4 7 5l.5 2L6 8.5 4 8.2 3 11l2 1v0l-2 1 1 3 2-.3 1.5 1.5L7 19l3 1 1-2h2l1 2 3-1-.5-2 1.5-1.5 2 .3 1-3z',
  check: 'M5 12l5 5 9-10',
  x: 'M6 6l12 12M18 6L6 18',
  warn: 'M12 3l10 18H2zM12 10v5M12 18v.5',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  folder: 'M3 6h6l2 2h10v11H3z',
  save: 'M5 3h11l3 3v15H5zM8 3v6h8V3M8 21v-7h8v7',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18',
  key: 'M14 10a4 4 0 1 0-3.4 4L10 15H8v2H6v2H3v-3l7-7a4 4 0 0 0 4 1',
  rotate: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  box: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M16 16l5 5',
  learn: 'M3 7l9-4 9 4-9 4zM7 9v5c0 1.7 2.2 3 5 3s5-1.3 5-3V9M21 7v6',
  board: 'M3 7h18v10H3zM7 10h4v4H7zM14 10h.01M17 10h.01M14 14h.01M17 14h.01M6 7V4M10 7V4M14 7V4M18 7V4M6 20v-3M10 20v-3M14 20v-3M18 20v-3',
};

export function Icon({ name, size = 18 }: { name: keyof typeof P | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[name] ?? ''} />
    </svg>
  );
}
