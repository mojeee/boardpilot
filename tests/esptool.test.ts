import { describe, expect, it } from 'vitest';
import { classifyEsptoolError, commandName, parseChipInfo, parseProgress } from '../app/main/hardware/esptool';
import { bridgeFromUsb, isUsefulMacPort } from '../app/main/hardware/ports';

const V4 = `esptool.py v4.7.0
Serial port /dev/cu.usbserial-0001
Connecting....
Detecting chip type... Unsupported detection protocol, switching and trying again...
Connecting....
Detecting chip type... ESP32
Chip is ESP32-D0WD-V3 (revision v3.0)
Features: WiFi, BT, Dual Core, 240MHz, VRef calibration in efuse, Coding Scheme None
Crystal is 40MHz
MAC: 24:6f:28:a1:b2:c3
Uploading stub...
Running stub...
Stub running...
Manufacturer: 20
Device: 4016
Detected flash size: 4MB
Hard resetting via RTS pin...`;

const V5 = `esptool v5.0.2
Connected to ESP32 on /dev/cu.usbserial-0001:
Chip type:          ESP32-D0WD-V3 (revision v3.1)
Features:           Wi-Fi, BT, Dual Core + LP Core, 240MHz, Vref calibration in eFuse, Coding Scheme None
Crystal frequency:  40MHz
MAC:                24:6f:28:a1:b2:c3

Stub flasher running.

Flash Memory Information:
=========================
Manufacturer: 20
Device: 4016
Detected flash size: 4MB

Hard resetting via RTS pin...`;

describe('esptool output parsing', () => {
  it('parses esptool.py v4 flash_id output', () => {
    const c = parseChipInfo(V4, '/dev/cu.usbserial-0001', 'CP210x');
    expect(c).toMatchObject({ chip: 'ESP32-D0WD-V3', revision: 'v3.0', mac: '24:6F:28:A1:B2:C3', flashSize: '4MB', flashBytes: 4194304, crystalMHz: 40, toolVersion: '4.7.0' });
    expect(c.features).toContain('Dual Core');
  });
  it('parses esptool v5 flash-id output', () => {
    const c = parseChipInfo(V5, '/dev/cu.usbserial-0001', 'CP210x');
    expect(c).toMatchObject({ chip: 'ESP32-D0WD-V3', revision: 'v3.1', mac: '24:6F:28:A1:B2:C3', flashSize: '4MB', crystalMHz: 40, toolVersion: '5.0.2' });
  });
  it('uses hyphenated commands only on v5', () => {
    expect(commandName({ cmd: 'esptool', baseArgs: [], major: 5, version: '5.0.0' }, 'read-flash')).toBe('read-flash');
    expect(commandName({ cmd: 'esptool.py', baseArgs: [], major: 4, version: '4.7.0' }, 'read-flash')).toBe('read_flash');
  });
  it('turns failures into plain-language errors', () => {
    expect(classifyEsptoolError('A fatal error occurred: Failed to connect to ESP32: No serial data received.').code).toBe('no_sync');
    expect(classifyEsptoolError('[Errno 16] Resource busy: /dev/cu.usbserial-0001').code).toBe('port_busy');
    expect(classifyEsptoolError('could not open port /dev/cu.x: [Errno 2] No such file or directory').code).toBe('port_gone');
  });
  it('reads progress from both versions', () => {
    expect(parseProgress('Writing at 0x00010000... (12 %)')).toBe(12);
    expect(parseProgress('Writing at 0x00010000 [=====>     ]  37.5% 16384/43690 bytes...')).toBe(37.5);
    expect(parseProgress('Connecting....')).toBeNull();
  });
});

describe('USB port detection', () => {
  it('knows the common ESP32 USB bridges', () => {
    expect(bridgeFromUsb('10c4', 'ea60')).toBe('CP210x');
    expect(bridgeFromUsb('1A86', '7523')).toBe('CH340');
    expect(bridgeFromUsb('1a86', '55d4')).toBe('CH9102');
    expect(bridgeFromUsb('303a', '1001')).toBe('ESP32 native USB');
    expect(bridgeFromUsb(undefined, undefined)).toBe('unknown');
  });
  it('keeps only useful macOS call-out ports', () => {
    expect(isUsefulMacPort('/dev/cu.usbserial-0001')).toBe(true);
    expect(isUsefulMacPort('/dev/tty.usbserial-0001')).toBe(false);
    expect(isUsefulMacPort('/dev/cu.Bluetooth-Incoming-Port')).toBe(false);
  });
});
