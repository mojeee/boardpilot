// Types shared by the Electron main process, the preload bridge and the renderer.
// No runtime code here except tiny helpers; keep it free of Node and DOM imports.

import type { StateMachine } from './statemachine';

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

export type UsbBridge =
  | 'CP210x'
  | 'CH340'
  | 'CH9102'
  | 'FTDI'
  | 'ESP32 native USB'
  | 'ATmega16U2'
  | 'RP2040 native USB'
  | 'ST-LINK'
  | 'J-Link'
  | 'Teensy USB'
  | 'unknown';

export interface PortInfo {
  path: string;
  manufacturer?: string;
  vendorId?: string;
  productId?: string;
  serialNumber?: string;
  bridge: UsbBridge;
  /** True when the USB ids belong to a development board or a bridge commonly used on one. */
  likelyBoard: boolean;
  /** Boards from the library whose USB ids match this port, best match first. */
  boardIds?: string[];
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

export interface HelloReply { agent: string; ver: string; chip: string; heapFree: number; board?: string }
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
  /** Story markers from probe.step() / state() / event(). */
  step?: string;
  state?: string;
  event?: string;
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
  /** Strapping pin whose wrong level at reset stops the board from booting (ESP32 GPIO 12). */
  | 'strapping_critical'
  | 'adc1'
  | 'adc2'
  /** Analog input on boards without ESP32-style ADC1/ADC2 blocks. */
  | 'adc'
  | 'uart0'
  | 'touch'
  | 'dac'
  | 'onboard_led'
  | 'no_internal_pull'
  /** Tolerates 5 V on its input even though the chip runs at 3.3 V (STM32 "FT" pins, for example). */
  | 'five_volt_tolerant'
  /** Used by something on the board (USB, debug probe link, radio). Usable only with care. */
  | 'reserved'
  /** Native USB data line (D+ / D-). */
  | 'usb'
  /** Debug port (SWDIO, SWCLK, JTAG). */
  | 'swd';

export type PinKind = 'gpio' | 'power' | 'ground' | 'enable';

/** How the pin is mounted: header pins pointing down (breadboard boards), sockets on top (Arduino style), pins up, or a pad. */
export type PinMount = 'male-down' | 'female-up' | 'male-up' | 'pad';

export interface PinDef {
  id: string;
  /**
   * The number used in code with the board's Arduino core (digitalRead(gpio)): the GPIO number on
   * ESP32 and RP2040/RP2350, the Arduino pin number on AVR and Teensy, (port × 16 + pin) on STM32
   * (STM32duino PinName: PA0 = 0, PB0 = 16, PC13 = 45) and (port × 32 + pin) on nRF52 (P1.01 = 33).
   * null for power, ground and reset pins.
   */
  gpio: number | null;
  /** MCU pin name when it differs from the label, e.g. "PA5", "P0.13", "PD2". */
  chipPin?: string;
  /** Legacy two-row layout (see BoardDef.header). New boards use posMm. */
  row?: 'front' | 'back';
  index?: number;
  /** Centre of the pin in mm from the PCB top-left corner: [along the length, across the width]. */
  posMm?: [number, number];
  mount?: PinMount;
  /** Id of another pin that is the same electrical signal (Uno SDA = A4, Nucleo morpho = Arduino header). */
  sameAs?: string;
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
  type: 'module' | 'mcu' | 'chip' | 'usb' | 'jack' | 'button' | 'led' | 'regulator' | 'bridge' | 'crystal' | 'antenna' | 'connector' | 'switch';
  label?: string;
  /** [x, y, w, h] in layout px (see BoardDef.layoutPxPerMm), origin at PCB top-left, x along length */
  rect: [number, number, number, number];
  /** Height above the PCB in mm (defaults per type). */
  heightMm?: number;
  color?: string;
}

export type BoardFamily = 'esp32' | 'esp32s3' | 'esp32c3' | 'rp2040' | 'rp2350' | 'avr' | 'stm32' | 'nrf52' | 'imxrt';

/** The tool that reads and writes the board's flash. */
export type Flasher = 'esptool' | 'picotool' | 'avrdude' | 'stm32' | 'nrfjprog' | 'teensy';

export interface BoardRules {
  /** Datasheet cited by wiring findings, e.g. "ESP32 Series Datasheet". */
  datasheet: string;
  /** Default I2C pins (pin ids). remappable: any GPIO can be SDA/SCL in software (ESP32). */
  i2c: { sda: string; scl: string; remappable: boolean; note?: string };
  spi?: { mosi: string; miso: string; sck: string; cs: string };
  /** Output-capable pins with no side effects, in order of preference, for automatic assignment. */
  safeIo: string[];
  /** Analog inputs in order of preference. */
  adcPins: string[];
  /** Pins that are fine for plain inputs (buttons, interrupts), tried before safeIo. */
  inputPins?: string[];
  /** ESP32: ADC2 pins stop working while Wi-Fi is on. */
  adcWifiConflict?: boolean;
  /** Full-scale of the ADC in millivolts (3300 or 5000). */
  adcMaxMv: number;
}

export interface BoardToolchain {
  flasher: Flasher;
  /** arduino-cli fully qualified board name, e.g. "esp32:esp32:esp32s3". */
  fqbn: string;
  /** arduino-cli core to install, e.g. "rp2040:rp2040". */
  core: string;
  /** Extra board manager URL for the core, when it is not in the default index. */
  coreUrl?: string;
  /** Chip name for esptool --chip (esp32, esp32s3, esp32c3). */
  esptoolChip?: string;
  /** avrdude part and programmer, e.g. { part: "m328p", programmer: "arduino", baud: 115200 }. */
  avrdude?: { part: string; programmer: string; baud: number };
  /** Firmware file type the flasher takes: "bin", "uf2", "hex". */
  imageFormat: 'bin' | 'uf2' | 'hex';
  /** Is the diagnostic agent bundled for this board? */
  agent: boolean;
  /** Plain-language note for getting the board into upload mode, if the user may need it. */
  uploadNote?: string;
  /** How the flash is reached: over USB serial, the USB bootloader, or an on-board debug probe. */
  link: 'usb-serial' | 'usb-bootloader' | 'debug-probe';
  /** Pico SDK board name (PICO_BOARD), e.g. "pico", "pico2", "pico_w". RP2040/RP2350 boards only;
   *  the names are the header files in pico-sdk/src/boards/include/boards/. */
  picoBoard?: string;
}

export interface BoardDef {
  id: string;
  name: string;
  vendor: string;
  family: BoardFamily;
  /** Module or MCU part on the board, e.g. "ESP32-WROOM-32", "RP2040", "STM32F401RET6". */
  module: string;
  chip: string;
  /** One line: core, clock, memory. */
  cpu: string;
  logicVolt: number;
  flashBytes?: number;
  ramBytes?: number;
  pcbMm: { length: number; width: number; thickness: number };
  layoutPxPerMm: number;
  /** Legacy two-row header layout for pins that use row/index instead of posMm. */
  header?: { pitchMm: number; rowSpacingMm: number; firstPinOffsetMm: number };
  /** Default pin mount for the board (pins can override it). */
  headerStyle: PinMount;
  /** PCB color, if not the usual blue. */
  pcbColor?: string;
  /** Radius of the PCB corners, mm (default 0.8). */
  cornerRadiusMm?: number;
  /** Current of the chip (or whole board, as the note says), from its datasheet. */
  power?: CurrentDraw;
  /** Peripheral clocks as the board's Arduino core sets them up, for the timer, UART and ADC calculators. */
  clocks?: BoardClocks;
  /** Mounting holes: [x, y, diameter] in mm from the PCB top-left corner, from the board's mechanical drawing. */
  holesMm?: [number, number, number][];
  pins: PinDef[];
  components: BoardComponent[];
  rules: BoardRules;
  toolchain: BoardToolchain;
  /** USB ids that identify this board (lower-case hex, no 0x). pid omitted = any product of the vendor. */
  usb: { vid: string; pid?: string; note?: string }[];
  /** Short plain-language description for the board picker. */
  summary: string;
  links?: { title: string; url: string }[];
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

export type PartShape = 'breakout' | 'led' | 'button' | 'pot' | 'dht' | 'oled' | 'chip' | 'module' | 'motor' | 'relay';

/** Supply current from a datasheet: typical in normal use, lowest standby, short peaks (mA). */
/** Clock frequencies in Hz. Which clock each one is (APB1 timer clock, APB_CLK…) is in the note. */
export interface BoardClocks {
  cpuHz: number;
  /** clock feeding the timer / PWM peripheral */
  pwmHz?: number;
  /** clock feeding the UART that Serial (or Serial1) uses */
  uartHz?: number;
  /** clock feeding the ADC before its own prescaler */
  adcHz?: number;
  note: string;
  source: { title: string; section?: string };
}

export interface CurrentDraw {
  typMa: number;
  sleepMa?: number;
  peakMa?: number;
  note: string;
  source: { title: string; section?: string };
}

/** A known trap for a part (DHT22 needs 2 s between reads…). `when` limits it to some boards. */
export interface PartGotcha {
  text: string;
  when?: 'logic3v3' | 'logic5v' | 'avr' | 'esp32';
  source: { title: string; section?: string };
}

/* ---------- register maps (datasheet register tables, decoded live) ---------- */

/** r: read-only, rw: read and write, w: write-only (reading it back returns nothing useful). */
export type RegAccess = 'r' | 'rw' | 'w';

/** A datasheet section that a register, field or command comes from. */
export interface RegSource {
  title: string;
  section: string;
}

export interface RegisterField {
  /** [highest bit, lowest bit], inclusive. [6, 6] is a single bit. */
  bits: [number, number];
  name: string;
  /** What the field controls, one plain sentence (English; shown through t()). */
  text: string;
  access: RegAccess;
  /** Meaning of each field value, keyed by the value in decimal ("0", "5"). A missing value is not documented. */
  values?: Record<string, string>;
  /** Reserved bits: shown, never interpreted. */
  reserved?: boolean;
}

export interface RegisterDef {
  /** Register address: the byte written to the chip before the read, e.g. "0xF4". */
  addr: string;
  /** Datasheet name, e.g. "ctrl_meas". */
  name: string;
  /** What the register is for, one plain sentence. */
  text: string;
  access: RegAccess;
  /** Bytes read from addr upward and combined high byte first (default 1). */
  len?: number;
  /** Right shift applied to the combined bytes (BME280 20-bit results: 4). */
  shift?: number;
  /** The combined value is a two's complement number. */
  signed?: boolean;
  /** Value after power-on reset, from the datasheet. */
  reset?: string;
  fields?: RegisterField[];
  /** Meaning of whole values (chip ids, "no measurement yet"), keyed by hex value. Missing value = not documented. */
  values?: Record<string, string>;
  source: RegSource;
}

/** A command for chips that are driven by command bytes instead of registers (SSD1306). Never read back. */
export interface CommandDef {
  /** "0xAE", or a range "0xB0-0xB7". */
  code: string;
  name: string;
  text: string;
  /** Parameter bytes that follow the command. */
  params?: number;
  source: RegSource;
}

export interface RegisterMapDef {
  /** How this chip is read, one or two plain sentences. */
  note?: string;
  registers: RegisterDef[];
  /** Documented commands (write-only chips). Shown as a reference table, never read. */
  commands?: CommandDef[];
}

export interface PartDef {
  id: string;
  name: string;
  category: 'sensor' | 'display' | 'output' | 'input';
  measures?: string[];
  pins: PartPin[];
  bus?: 'i2c' | 'spi' | 'onewire' | 'gpio' | 'analog';
  /** Every I2C address the part can have, the usual (default) one first. */
  addresses?: string[];
  idCheck?: { register: string; expect: string; otherValues?: Record<string, string> };
  /** supply voltage the part needs: "3.3", "5", "3.3-5" */
  voltage: string;
  /** the part pulls its data lines up to this voltage when powered (breakouts with on-board pull-ups) */
  pullupsOnBoard?: boolean;
  model: { shape: PartShape; size: [number, number, number]; color: string };
  /** Small product photo (JPEG data URL, about 160 px) for imported parts. */
  image?: string;
  /** Where a user-imported part came from. Built-in parts have no origin. */
  origin?: { url?: string; importedAt: string; method: 'ai' | 'manual' };
  keywords: string[];
  /** Known traps, shown when the part is added. Each one is sourced. */
  gotchas?: PartGotcha[];
  /** Supply current, only when a datasheet gives it (the power budget lists others as unknown). */
  current?: CurrentDraw;
  sources: { title: string; section?: string }[];
  starterSketch?: string;
  /** The chip's register map from the datasheet, for the live register viewer. */
  registers?: RegisterMapDef;
  /** Id of another part with the same chip whose register map applies (a smaller SSD1306 module). */
  registersFrom?: string;
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
  /** Rotation around the vertical axis, degrees. Default: pins face the board. */
  rotation?: number;
  label?: string;
  /** Set when the user confirmed an AI suggestion ("this photo shows a BME280") */
  confirmed?: boolean;
}

export interface Scene {
  board: string;
  parts: ScenePart[];
  wires: SceneWire[];
  /** The project's state machine (New project → State machine designer), saved as it is. */
  stateMachine?: StateMachine;
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
    | 'reserved_pin'
    | 'logic_level'
    | 'i2c_address_conflict'
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
  /** Board picked by the user (id from /boards). */
  board: string;
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

/* ---------- license ---------- */

export interface LicenseStatus {
  state: 'trial' | 'licensed' | 'expired';
  daysLeft: number;
  trialDays: number;
  licensee?: string;
  plan?: string;
  firstRun: string;
}
