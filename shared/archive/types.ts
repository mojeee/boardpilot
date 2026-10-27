// Project archive: old projects in the user's folders (firmware, schematics, documents, BoardPilot
// projects), each described by the properties the app could read from its files. Every property
// says where it came from (rule 4, honest AI): read from a file ("detected", with the file and
// line), suggested by the AI (to confirm), or typed by the user.

import type { Scene } from '../types';

export type ArchiveKind = 'firmware' | 'schematic' | 'docs' | 'boardpilot';

export type Framework = 'arduino' | 'platformio' | 'esp-idf' | 'stm32cube' | 'pico-sdk' | 'kicad' | 'boardpilot' | 'unknown';

export type FactSource = 'detected' | 'ai' | 'user';

/** Where a detected value was read: a file relative to the project folder, and a line when known. */
export interface Evidence {
  file: string;
  line?: number;
}

/** One property value with its source. */
export interface Fact<T = string> {
  value: T;
  source: FactSource;
  evidence?: Evidence;
}

/** A part of an old project. `partId` only when it is a part of the BoardPilot library. */
export interface ArchivePart {
  name: string;
  partId?: string;
}

export type ArchiveBus = 'i2c' | 'spi' | 'uart' | 'onewire' | 'can' | 'rs485' | 'adc';

export type ArchiveProtocol = 'modbus' | 'opentherm' | 'wifi' | 'ble' | 'mqtt' | 'lora' | 'ethernet' | 'http';

export interface ArchiveDoc {
  /** relative to the project folder */
  path: string;
  type: string;
}

export interface ArchiveProject {
  /** Stable id: a hash of the project folder path. */
  id: string;
  /** Absolute folder path (or the file, for a single .boardpilot.json). */
  root: string;
  /** The folder that was added to the archive and contains this project. */
  archiveRoot: string;
  name: string;
  kinds: ArchiveKind[];
  framework: Fact<Framework>;
  /** A BoardPilot board id when the board matched one of /boards; else only the MCU text. */
  board: Fact<{ boardId?: string; mcu: string }> | null;
  parts: Fact<ArchivePart>[];
  buses: Fact<ArchiveBus>[];
  protocols: Fact<ArchiveProtocol>[];
  pins: Fact<{ pin: string; use: string }>[];
  libraries: Fact[];
  docs: ArchiveDoc[];
  /** First lines of the README or of the main source comment, as written. */
  summary: Fact | null;
  /** Words for search and similarity (name, folder, README headings), lower case. */
  keywords: string[];
  /** The main source file (relative), offered when the project is used as a start. */
  mainSource?: string;
  /** The drawing, for BoardPilot projects. */
  scene?: Scene;
  /** Newest file change in the project, ms. */
  lastModified: number;
  scannedAt: number;
  fileCount: number;
}

/** What the user added or corrected. Kept apart from the scan, so a rescan never loses it. */
export interface ArchiveEdit {
  notes?: string;
  tags?: string[];
  /** Corrected values; each replaces the detected one. */
  name?: string;
  mcu?: string;
  boardId?: string;
  /** Parts the user added by hand (library ids or free names). */
  addParts?: ArchivePart[];
}

export interface ArchiveIndexFile {
  format: 'boardpilot-archive@1';
  roots: string[];
  projects: ArchiveProject[];
  edits: Record<string, ArchiveEdit>;
}

/** A project as the UI and the assistant see it: the scan with the user's edits applied. */
export interface ArchiveEntry extends ArchiveProject {
  notes: string;
  tags: string[];
}

/** One text file of a project, given to the extractors (they never touch the disk). */
export interface ProjectFile {
  /** relative to the project folder, with "/" */
  path: string;
  /** text, or '' for binary files and files too big to read */
  text: string;
  size: number;
  mtime: number;
}

export interface SimilarReason {
  kind: 'part' | 'bus' | 'protocol' | 'board' | 'mcu' | 'framework' | 'words';
  value: string;
}

export interface SimilarMatch {
  id: string;
  name: string;
  score: number;
  reasons: SimilarReason[];
}
