// Generated simulator benches for boards that have no hand-written scenarios: the same weather
// station (BME280 on the board's default I2C pins, LED, knob, button), wired with the board's own
// rules, so every board can be tried without hardware.

import type { BoardDef, Scene, SceneWire } from '@shared/types';
import { ROLE_HEX, groundPins, pinById, powerPinFor } from '@shared/board';
import { t } from '@shared/i18n';
import { bridgeFromUsb } from '../hardware/ports';
import type { Scenario, SimPhysical } from './scenario';

function stableId(s: string): string {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const hex = h.toString(16).toUpperCase().padStart(8, '0');
  return `SIM-${hex.slice(0, 4)}-${hex.slice(4)}`;
}

function sizeLabel(bytes?: number): string {
  if (!bytes) return 'unknown';
  return bytes >= 1024 * 1024 ? `${Math.round(bytes / 1024 / 1024)}MB` : `${Math.round(bytes / 1024)}KB`;
}

export function benchScenarios(board: BoardDef): Scenario[] {
  const gpio = (id: string | undefined) => (id ? pinById(board, id)?.gpio ?? null : null);
  const sdaId = board.rules.i2c.sda;
  const sclId = board.rules.i2c.scl;
  const sda = gpio(sdaId) ?? 0;
  const scl = gpio(sclId) ?? 0;
  const ledId = board.rules.safeIo[0];
  const btnId = board.rules.safeIo.find((id) => id !== ledId && id !== sdaId && id !== sclId) ?? board.rules.safeIo[1];
  const potId = board.rules.adcPins.find((id) => id !== sdaId && id !== sclId);
  const power = powerPinFor(board, '3.3')?.id ?? '3V3';
  const [g1, g2] = groundPins(board);
  const gnd1 = g1?.id ?? 'GND';
  const gnd2 = g2?.id ?? gnd1;
  const zOut = board.pcbMm.width / 2;

  let n = 0;
  const w = (from: string, part: string, pin: string, color: string): SceneWire => ({
    id: `w${++n}`,
    from: { part: 'board', pin: from },
    to: { part, pin },
    color,
  });
  const wires: SceneWire[] = [
    w(sdaId, 'bme1', 'SDA', ROLE_HEX.sda),
    w(sclId, 'bme1', 'SCL', ROLE_HEX.scl),
    w(power, 'bme1', 'VIN', ROLE_HEX.power),
    w(gnd2, 'bme1', 'GND', ROLE_HEX.ground),
    w(ledId, 'led1', 'A', ROLE_HEX.gpio),
    w(gnd1, 'led1', 'K', ROLE_HEX.ground),
    w(btnId, 'btn1', '1', ROLE_HEX.gpio),
    w(gnd1, 'btn1', '2', ROLE_HEX.ground),
  ];
  const parts: Scene['parts'] = [
    { id: 'bme1', partId: 'bme280-gy', position: [12, 0, zOut + 30], label: 'BME280' },
    { id: 'led1', partId: 'led-resistor', position: [-2, 0, -(zOut + 26)], label: 'LED' },
    { id: 'btn1', partId: 'push-button', position: [-22, 0, -(zOut + 26)], label: 'Button' },
  ];
  if (potId) {
    parts.push({ id: 'pot1', partId: 'potentiometer', position: [20, 0, -(zOut + 28)], label: 'Knob' });
    wires.push(w(potId, 'pot1', 'OUT', ROLE_HEX.adc), w(power, 'pot1', 'VCC', ROLE_HEX.power), w(gnd1, 'pot1', 'GND', ROLE_HEX.ground));
  }
  const scene: Scene = { board: board.id, parts, wires };

  const potGpio = gpio(potId);
  const btnGpio = gpio(btnId);
  const ledGpio = gpio(ledId);
  const pins: SimPhysical['pins'] = {};
  if (potGpio !== null) pins[String(potGpio)] = { analog: { mv: Math.round(board.rules.adcMaxMv * 0.557), noise: 12 } };
  if (btnGpio !== null) pins[String(btnGpio)] = { external: 'pullup' };
  const bme = (s: number, c: number) => ({ addr: '0x76', sda: s, scl: c, registers: { '0xD0': '0x60', '0xF3': '0x00' }, pullups: true, powered: true });
  const good: SimPhysical = { i2c: [bme(sda, scl)], pins };
  const crossed: SimPhysical = { i2c: [bme(scl, sda)], pins };

  const usb = board.usb[0];
  const bridge = bridgeFromUsb(usb?.vid, usb?.pid);
  const port = {
    path: bridge === 'CP210x' || bridge === 'CH340' || bridge === 'CH9102' || bridge === 'FTDI' ? '/dev/cu.usbserial-0001' : '/dev/cu.usbmodem1101',
    manufacturer: board.vendor,
    vendorId: usb?.vid,
    productId: usb?.pid,
    serialNumber: stableId(board.id).slice(4),
  };
  const base = {
    board: board.id,
    ports: [port],
    bridge,
    chip: { chip: board.chip, features: [board.cpu], mac: stableId(board.id), flashSize: sizeLabel(board.flashBytes), flashBytes: board.flashBytes },
    identify: 'ok' as const,
    scene,
    strappingAtBoot: {},
  };
  const sdaLabel = pinById(board, sdaId)?.label ?? sdaId;
  const sclLabel = pinById(board, sclId)?.label ?? sclId;
  const serial = { baud: 115200, mode: 'weather' as const, pins: { sda, scl, pot: potGpio } };

  return [
    {
      ...base,
      id: `${board.id}:weather-station-swapped`,
      name: t('Weather station, SDA and SCL crossed'),
      description: t('BME280 on {sda}/{scl} with SDA and SCL crossed at the sensor, LED at 62% PWM, knob and button.', { sda: sdaLabel, scl: sclLabel }),
      physical: crossed,
      fixedPhysical: good,
      initialAgentPins: ledGpio !== null ? { [String(ledGpio)]: { mode: 'pwm', duty: 62, hz: 1000 } } : undefined,
      serial,
    },
    {
      ...base,
      id: `${board.id}:healthy`,
      name: t('Weather station, all good'),
      description: t('Everything wired correctly. The firmware streams temperature, humidity, pressure and the knob.'),
      physical: good,
      serial,
    },
    {
      ...base,
      id: `${board.id}:no-board`,
      name: t('No board detected'),
      description: t('No serial port appears: charge-only cable or missing driver.'),
      ports: [],
      physical: good,
      serial,
    },
  ];
}
