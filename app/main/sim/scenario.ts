// Scenario files describe a simulated bench: the ports that appear, the chip, what is physically
// wired (which may differ from what the user drew in the app), and what the user's firmware prints.

import type { ChipInfo, Scene, AgentPinState, UsbBridge } from '@shared/types';

export interface SimI2cDevice {
  addr: string;
  /** ESP32 GPIO the device's SDA pin is physically connected to */
  sda: number;
  /** ESP32 GPIO the device's SCL pin is physically connected to */
  scl: number;
  registers: Record<string, string>;
  pullups: boolean;
  powered: boolean;
}

export interface SimPhysical {
  i2c: SimI2cDevice[];
  pins: Record<string, { external?: 'pullup' | 'pulldown'; analog?: { mv: number; noise: number } }>;
}

export interface Scenario {
  id: string;
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
  };
}
