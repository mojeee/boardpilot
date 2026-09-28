// USB-serial bridge detection by USB vendor/product id. Pure, tested.

import type { UsbBridge } from '@shared/types';
import { t } from '@shared/i18n';

/**
 * Vendor ids: Silicon Labs 0x10C4 (CP210x), WCH 0x1A86 (CH340 = 0x7523, CH9102 = 0x55D4),
 * FTDI 0x0403, Espressif 0x303A (native USB on S2/S3/C3), Arduino 0x2341 / 0x2A03 (ATmega16U2
 * on Uno R3 and Mega), Raspberry Pi 0x2E8A (RP2040/RP2350), STMicroelectronics 0x0483 (ST-LINK
 * 0x374B/0x3752/0x374E/0x3748), SEGGER 0x1366 (J-Link on Nordic DKs), PJRC 0x16C0 (Teensy).
 */
export function bridgeFromUsb(vendorId?: string, productId?: string): UsbBridge {
  const v = vendorId?.toLowerCase().replace(/^0x/, '');
  const p = productId?.toLowerCase().replace(/^0x/, '');
  if (v === '10c4') return 'CP210x';
  if (v === '1a86') return p === '55d4' || p === '55d3' ? 'CH9102' : 'CH340';
  if (v === '0403') return 'FTDI';
  if (v === '303a') return 'ESP32 native USB';
  if (v === '2341' || v === '2a03') return 'ATmega16U2';
  if (v === '2e8a') return 'RP2040 native USB';
  if (v === '0483' && (p === '374b' || p === '3752' || p === '374e' || p === '374f' || p === '3748')) return 'ST-LINK';
  if (v === '1366') return 'J-Link';
  if (v === '16c0') return 'Teensy USB';
  return 'unknown';
}

/** macOS exposes each device twice (tty.* and cu.*); apps should use cu.* for outgoing connections. */
export function isUsefulMacPort(path: string): boolean {
  if (!path.startsWith('/dev/cu.')) return false;
  return !/Bluetooth|debug-console|wlan-debug|AirPods/i.test(path);
}

export function driverHint(bridge: UsbBridge): string {
  switch (bridge) {
    case 'CP210x':
      return process.platform === 'win32'
        ? t('This board uses a Silicon Labs CP210x chip. Install the “CP210x Universal Windows Driver” from silabs.com, then unplug and replug the board.')
        : t('This board uses a Silicon Labs CP210x chip. On recent macOS it works without a driver; if not, install the “CP210x VCP driver” from silabs.com.');
    case 'CH340':
    case 'CH9102':
      return process.platform === 'win32'
        ? t('This board uses a WCH CH34x chip. Install the “CH341SER” Windows driver from wch-ic.com, then unplug and replug the board.')
        : t('This board uses a WCH CH34x chip. Install the “CH34x macOS driver” from wch-ic.com, then allow it in System Settings → Privacy & Security.');
    default:
      return t('Look at the small chip next to the USB port: “CP2102” needs the Silicon Labs driver, “CH340” needs the WCH driver.');
  }
}
