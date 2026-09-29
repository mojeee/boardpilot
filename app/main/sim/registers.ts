// Simulated register contents for the chips on the simulated benches, so the register viewer has
// something realistic to read without hardware. Everything here is simulated: the values are what a
// real chip would plausibly hold, not measurements. Registers a scenario file sets itself win.

import type { SimI2cDevice } from './scenario';

/**
 * A BME280 after the Adafruit library's begin(): normal mode, ×16 oversampling on all three
 * values, filter off, 0.5 ms standby (Adafruit_BME280::setSampling defaults).
 * Register layout: Bosch BME280 datasheet 5.3 memory map (Table 18) and 5.4.3 to 5.4.9.
 */
const BME280: Record<string, string> = {
  '0xE0': '0x00', // reset: always reads 0x00 (5.4.2)
  '0xF2': '0x05', // ctrl_hum: osrs_h = 101 (×16)
  '0xF3': '0x00', // status: idle, calibration copied
  '0xF4': '0xB7', // ctrl_meas: osrs_t = 101, osrs_p = 101, mode = 11 (normal)
  '0xF5': '0x00', // config: t_sb = 000 (0.5 ms), filter off, spi3w_en = 0
  // Raw ADC results (20-bit pressure and temperature, 16-bit humidity): made-up values in the
  // usual range, not 0x80000/0x8000 ("no result"). They are never converted to °C, hPa or %RH.
  '0xF7': '0x65', '0xF8': '0x5A', '0xF9': '0xC0',
  '0xFA': '0x7E', '0xFB': '0xED', '0xFC': '0x00',
  '0xFD': '0x6E', '0xFE': '0x9B',
};

/** A BMP280: the same layout without humidity (Bosch BMP280 datasheet 4.2 memory map). */
const BMP280: Record<string, string> = Object.fromEntries(Object.entries(BME280).filter(([k]) => !['0xF2', '0xFD', '0xFE'].includes(k)));

/**
 * An MPU6050 right after power-on: asleep (PWR_MGMT_1 = 0x40), so every measurement reads 0.
 * InvenSense MPU-6000/MPU-6050 Register Map, section 3: every register resets to 0x00 except
 * PWR_MGMT_1 (0x40) and WHO_AM_I (0x68).
 */
const MPU6050_ASLEEP: Record<string, string> = { '0x6B': '0x40', '0x75': '0x68' };

/** Which simulated chip a device is, from its ID register. */
export function simChipOf(dev: SimI2cDevice): 'bme280' | 'bmp280' | 'mpu6050' | 'ssd1306' | null {
  const r = dev.registers;
  if (r['0xD0'] === '0x60') return 'bme280';
  if (r['0xD0'] === '0x58') return 'bmp280';
  if (r['0x75'] === '0x68') return 'mpu6050';
  if (/^0x3[cd]$/i.test(dev.addr)) return 'ssd1306';
  return null;
}

/** Register value the simulated chip returns: the scenario's own value first, then the defaults, else 0x00. */
export function simRegister(dev: SimI2cDevice, reg: string): string {
  const own = dev.registers[reg];
  if (own !== undefined) return own;
  const chip = simChipOf(dev);
  const table = chip === 'bme280' ? BME280 : chip === 'bmp280' ? BMP280 : chip === 'mpu6050' ? MPU6050_ASLEEP : undefined;
  // SSD1306: the status byte (read after control byte 0x00) is 0x00 when the display is on.
  return table?.[reg] ?? '0x00';
}
