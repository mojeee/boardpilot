// Scenario files describe a simulated bench: the ports that appear, the chip, what is physically
// wired (which may differ from what the user drew in the app), and what the user's firmware prints.

import type { ChipInfo, Scene, AgentPinState, UsbBridge } from '@shared/types';

export interface SimI2cDevice {
  addr: string;
  /** Board GPIO the device's SDA pin is physically connected to */
  sda: number;
  /** Board GPIO the device's SCL pin is physically connected to */
  scl: number;
  registers: Record<string, string>;
  pullups: boolean;
  powered: boolean;
}

/** A device on an SPI bus: which board GPIOs its pins are wired to and what it answers. */
export interface SimSpiDevice {
  sck: number;
  miso: number;
  mosi: number;
  cs: number;
  /** Data/command pin, for display controllers (needed by tft_id) */
  dc?: number;
  powered: boolean;
  /** Bytes it clocks out for spi_xfer, by position in the transfer (missing = 0x00) */
  reply?: string[];
  /** Raw 4 bytes after the RDDID (0x04) and RDID4 (0xD3) commands, dummy byte first */
  rddid?: string[];
  rdid4?: string[];
}

export interface SimPhysical {
  i2c: SimI2cDevice[];
  /** SPI devices. Missing means none. */
  spi?: SimSpiDevice[];
  pins: Record<
    string,
    {
      external?: 'pullup' | 'pulldown';
      /** stuck: the knob does not change the reading (an outer leg of the potentiometer is loose) */
      analog?: { mv: number; noise: number; stuck?: boolean };
      /** a push button from this pin to GND; with no pull-up the released pin floats */
      button?: boolean;
    }
  >;
}

export interface Scenario {
  id: string;
  /** Board this bench uses. Default: the ESP32 DevKit. */
  board?: string;
  name: string;
  description: string;
  ports: { path: string; manufacturer?: string; vendorId?: string; productId?: string; serialNumber?: string }[];
  bridge: UsbBridge;
  chip: Omit<ChipInfo, 'port' | 'bridge'>;
  identify: 'ok' | 'busy' | 'no_sync';
  scene: Scene;
  physical: SimPhysical;
  /** What "Fix the wiring" in the developer menu changes the bench to. */
  fixedPhysical?: SimPhysical;
  strappingAtBoot: Record<string, 0 | 1>;
  initialAgentPins?: Record<string, AgentPinState>;
  serial: {
    baud: number;
    mode: 'weather' | 'lines' | 'resetting';
    lines?: string[];
    intervalMs?: number;
    /** GPIOs of the weather station's sensor bus and knob. Default: SDA 21, SCL 22, knob 34. */
    pins?: { sda: number; scl: number; pot: number | null };
  };
}
