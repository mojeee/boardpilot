// Types shared by the Electron main process, the preload bridge and the renderer.
// No runtime code here except tiny helpers; keep it free of Node and DOM imports.

/* ---------- errors ---------- */

/** Every failure that reaches the UI has this shape. Never a raw exception. */
export interface AppError {
  code: string;
  /** What happened, in one or two plain sentences. */
  humanMessage: string;
  /** What the user can do next. */
  hint: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T = never>(code: string, humanMessage: string, hint: string): Result<T> => ({
  ok: false,
  error: { code, humanMessage, hint },
});

/* ---------- targets (things the 3D view can focus) ---------- */

/** "pin:D21", "wire:w1", "part:bme1" */
export type TargetRef = `pin:${string}` | `wire:${string}` | `part:${string}`;

export function parseTarget(ref: string): { kind: 'pin' | 'wire' | 'part'; id: string } | null {
  const m = /^(pin|wire|part):(.+)$/.exec(ref);
  return m ? { kind: m[1] as 'pin' | 'wire' | 'part', id: m[2] } : null;
}

/* ---------- ports and chips ---------- */

export type UsbBridge = 'CP210x' | 'CH340' | 'CH9102' | 'FTDI' | 'ESP32 native USB' | 'unknown';

export interface PortInfo {
  path: string;
  manufacturer?: string;
  vendorId?: string;
  productId?: string;
  serialNumber?: string;
  bridge: UsbBridge;
  /** True when the USB bridge is one commonly used on ESP32 boards. */
  likelyEsp32: boolean;
}

export interface ChipInfo {
  port: string;
  chip: string;
  revision?: string;
  features: string[];
  crystalMHz?: number;
  mac: string;
  flashSize: string;
  flashBytes?: number;
  bridge: UsbBridge;
  toolVersion?: string;
}

export interface BackupInfo {
  id: string;
  port: string;
  chip: string;
  mac: string;
  sizeBytes: number;
  path: string;
  createdAt: string;
}

export interface FirmwareImage {
  name: string;
  kind: 'agent' | 'user';
  parts: { offset: number; path: string }[];
  /** One-time token issued when the user clicked Confirm in the UI. */
  confirmToken: string;
}

/* ---------- diagnostic agent protocol ---------- */

export type AgentPinMode = 'in' | 'out' | 'pwm' | 'adc' | 'i2c' | 'uart' | 'unused';

export interface AgentPinState {
  mode: AgentPinMode | string;
  level?: 0 | 1;
  /** Only present when the pin was actually measured by the ADC. */
  mv?: number;
  duty?: number;
  hz?: number;
}

export interface I2cTraceStep {
  t: 'start' | 'restart' | 'addr' | 'data' | 'stop';
  v?: string;
  rw?: 'r' | 'w';
  dir?: 'r' | 'w';
  ack?: boolean;
}

export type AgentRequest =
  | { cmd: 'hello' }
  | { cmd: 'pins' }
  | { cmd: 'strapping' }
  | { cmd: 'pullup_check'; pins: number[] }
  | { cmd: 'i2c_scan'; sda: number; scl: number; hz?: number }
  | { cmd: 'i2c_read'; sda: number; scl: number; addr: string; reg: string; len: number; hz?: number }
  | { cmd: 'adc'; pin: number }
  | { cmd: 'pwm'; pin: number; duty: number; hz: number }
  | { cmd: 'gpio_write'; pin: number; level: 0 | 1 }
  | { cmd: 'gpio_read'; pin: number }
  | { cmd: 'stream'; pins: number[]; hz: number }
  | { cmd: 'stream_stop' }
  | { cmd: 'reset_pins' };

export interface HelloReply { agent: string; ver: string; chip: string; heapFree: number }
export interface PinsReply { pins: Record<string, AgentPinState> }
export interface PullupReply { external: Record<string, boolean>; levels?: Record<string, 0 | 1> }
export interface I2cScanReply { found: string[]; trace: I2cTraceStep[] }
export interface I2cReadReply { data: string[]; trace: I2cTraceStep[] }
export interface AdcReply { mv: number; raw: number }
export interface StrappingReply { strapping: Record<string, 0 | 1> }

export interface AgentReplyMap {
  hello: HelloReply;
  pins: PinsReply;
  strapping: StrappingReply;
  pullup_check: PullupReply;
  i2c_scan: I2cScanReply;
  i2c_read: I2cReadReply;
  adc: AdcReply;
  pwm: Record<string, never>;
  gpio_write: Record<string, never>;
  gpio_read: { level: 0 | 1 };
  stream: Record<string, never>;
  stream_stop: Record<string, never>;
  reset_pins: Record<string, never>;
}

export interface StreamFrame { t: number; pins: Record<string, AgentPinState> }

/* ---------- live data pushed to the renderer ---------- */

export interface LiveFrame {
  /** ms since the stream started (board clock) */
  t: number;
  /** keyed by GPIO number as string */
  pins: Record<string, AgentPinState>;
}

export interface ProbeFrame {
  t: number;
  values?: Record<string, number>;
  pins?: Record<string, number>;
  mem?: { heapFree: number; heapMin?: number; heapSize?: number; stackFree?: number };
}

/* ---------- session log ---------- */

export type LogType = 'info' | 'check' | 'warning' | 'failed' | 'found' | 'action';

export interface LogEntry {
  id: number;
  /** epoch ms */
  t: number;
  type: LogType;
  text: string;
  target?: TargetRef;
  /** where the fact came from: "measured: i2c_scan", "datasheet: …", "library: bme280-gy" */
  source?: string;
}

/* ---------- boards ---------- */

export type PinFlag =
  | 'input_only'
  | 'flash'
  | 'strapping'
  | 'adc1'
  | 'adc2'
  | 'uart0'
  | 'touch'
  | 'dac'
  | 'onboard_led'
  | 'no_internal_pull';

export type PinKind = 'gpio' | 'power' | 'ground' | 'enable';

export interface PinDef {
  id: string;
  gpio: number | null;
  row: 'front' | 'back';
  index: number;
  label: string;
  kind: PinKind;
  functions: string[];
  flags: PinFlag[];
  maxVolt: number;
  /** voltage this pin supplies, for power pins */
  supplies?: number;
  notes?: string;
}

export interface BoardComponent {
  type: 'module' | 'usb' | 'button' | 'led' | 'regulator' | 'bridge';
  label?: string;
  /** [x, y, w, h] in layout px (see BoardDef.layoutPxPerMm), origin at PCB top-left, x along length */
  rect: [number, number, number, number];
}

export interface BoardDef {
  id: string;
  name: string;
  module: string;
  chip: string;
  logicVolt: number;
  pcbMm: { length: number; width: number; thickness: number };
  layoutPxPerMm: number;
  header: { pitchMm: number; rowSpacingMm: number; firstPinOffsetMm: number };
  pins: PinDef[];
  components: BoardComponent[];
  sources: { title: string; section?: string; url?: string }[];
}

/* ---------- parts ---------- */

export type PartPinRole =
  | 'power'
  | 'ground'
  | 'i2c_sda'
  | 'i2c_scl'
  | 'spi_mosi'
  | 'spi_miso'
  | 'spi_sck'
  | 'spi_cs'
  | 'digital_in'
  | 'digital_out'
  | 'analog_out'
  | 'onewire'
  | 'int'
  | 'passive';

export interface PartPin {
  name: string;
  role: PartPinRole;
  /** for digital_in parts like an LED: the board pin must be able to drive it */
  needsOutput?: boolean;
  notes?: string;
}

export interface PartDef {
  id: string;
  name: string;
  category: 'sensor' | 'display' | 'output' | 'input';
  measures?: string[];
  pins: PartPin[];
  bus?: 'i2c' | 'spi' | 'onewire' | 'gpio' | 'analog';
  addresses?: string[];
  idCheck?: { register: string; expect: string; otherValues?: Record<string, string> };
  /** supply voltage the part needs: "3.3", "5", "3.3-5" */
  voltage: string;
  /** the part pulls its data lines up to this voltage when powered (breakouts with on-board pull-ups) */
  pullupsOnBoard?: boolean;
  model: { shape: 'breakout' | 'led' | 'button' | 'pot' | 'dht' | 'oled'; size: [number, number, number]; color: string };
  keywords: string[];
  sources: { title: string; section?: string }[];
  starterSketch?: string;
}

/* ---------- scene ---------- */

export interface WireEnd { part: string; pin: string }

export interface SceneWire {
  id: string;
  from: WireEnd;
  to: WireEnd;
  color: string;
}

export interface ScenePart {
  id: string;
  partId: string;
  position: [number, number, number];
  label?: string;
  /** Set when the user confirmed an AI suggestion ("this photo shows a BME280") */
  confirmed?: boolean;
}

export interface Scene {
  board: string;
  parts: ScenePart[];
  wires: SceneWire[];
}

export interface WiringFinding {
  id: string;
  rule:
    | 'voltage_mismatch'
    | 'output_on_input_only'
    | 'flash_pin'
    | 'strapping_pin'
    | 'i2c_swapped'
    | 'shared_pin_conflict'
    | 'missing_ground'
    | 'missing_power'
    | 'adc2_wifi'
    | 'uart0_pin'
    | 'not_adc'
    | 'wrong_pin_type'
    | 'unknown_pin';
  severity: 'error' | 'warning' | 'info';
  message: string;
  hint: string;
  targets: TargetRef[];
  source?: string;
}

/* ---------- AI ---------- */

export type Confidence = 'measured' | 'documented' | 'suggestion';

export interface AiSource {
  kind: 'measurement' | 'datasheet' | 'library' | 'user';
  label: string;
}

export interface AiReply {
  message: string;
  confidence: Confidence;
  sources: AiSource[];
  highlight: TargetRef[];
  nextOptions: string[];
  /** tool calls the model made in this turn, for the "how I know this" view */
  toolCalls?: { name: string; input: unknown; ok: boolean }[];
  /** a write the model asked for; the UI must show a confirmation dialog */
  pendingWrite?: WriteRequest;
}

export interface WriteRequest {
  kind: 'flash_agent' | 'flash_user' | 'gpio_write';
  reason: string;
  pin?: number;
  level?: 0 | 1;
}

export interface AiContext {
  screen: string;
  answers: Record<string, unknown>;
  log: LogEntry[];
  live?: LiveFrame | null;
  scene: Scene;
  flowId?: string;
  stepId?: string;
}

export interface PhotoRecognition {
  partId: string | null;
  name: string;
  confidence: 'suggestion';
  reasoning: string;
  alternatives: string[];
}

/* ---------- app status ---------- */

export type HardwareMode = 'sim' | 'real';

export interface ConnectionState {
  mode: HardwareMode;
  port: string | null;
  chip: ChipInfo | null;
  agent: HelloReply | null;
  streaming: boolean;
  serialOpen: boolean;
  scenario: string | null;
  backups: BackupInfo[];
}

export interface ScenarioInfo {
  id: string;
  name: string;
  description: string;
}
