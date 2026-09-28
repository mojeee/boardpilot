// USB-serial bridge detection by USB vendor/product id. Pure, tested.

import type { UsbBridge } from '@shared/types';

/**
 * Vendor ids: Silicon Labs 0x10C4 (CP210x), WCH 0x1A86 (CH340 = 0x7523, CH9102 = 0x55D4),
 * FTDI 0x0403, Espressif 0x303A (native USB on S2/S3/C3).
 */
export function bridgeFromUsb(vendorId?: string, productId?: string): UsbBridge {
  const v = vendorId?.toLowerCase().replace(/^0x/, '');
  const p = productId?.toLowerCase().replace(/^0x/, '');
  if (v === '10c4') return 'CP210x';
  if (v === '1a86') return p === '55d4' ? 'CH9102' : 'CH340';
  if (v === '0403') return 'FTDI';
  if (v === '303a') return 'ESP32 native USB';
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
      return 'This board uses a Silicon Labs CP210x chip. On recent macOS it works without a driver; if not, install the “CP210x VCP driver” from silabs.com.';
    case 'CH340':
    case 'CH9102':
      return 'This board uses a WCH CH34x chip. Install the “CH34x macOS driver” from wch-ic.com, then allow it in System Settings → Privacy & Security.';
    default:
      return 'Look at the small chip next to the USB port: “CP2102” needs the Silicon Labs driver, “CH340” needs the WCH driver.';
  }
}
