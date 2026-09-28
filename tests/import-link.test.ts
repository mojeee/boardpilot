import { describe, expect, it } from 'vitest';
import { extractDimensionsMm, findLibraryMatch } from '@shared/partHeuristics';
import { BUILTIN_PART_IDS, PARTS } from '@shared/board';
import { productImageUrl } from '../app/main/parts/importer';

const builtins = Object.values(PARTS).filter((p) => BUILTIN_PART_IDS.has(p.id));

describe('add a part from a link', () => {
  it('recognises the chip a product page is about', () => {
    const m = findLibraryMatch('Adafruit VL53L0X Time of Flight Distance Sensor - ~30 to 1000mm', 'The VL53L0X is a Time of Flight distance sensor...', builtins);
    expect(m?.token).toBe('vl53l0x');
    const m2 = findLibraryMatch('HC-SR04 Ultrasonic Sensor Module', 'Ultrasonic ranging module HC-SR04 provides 2cm - 400cm', builtins);
    expect(m2?.part.pins.map((p) => p.name)).toEqual(expect.arrayContaining(['TRIG', 'ECHO']));
  });
  it('does not confuse BMP280 and BME280', () => {
    expect(findLibraryMatch('GY-BMP280 barometric pressure sensor', 'BMP280 pressure and temperature', builtins)?.token).toBe('bmp280');
  });
  it('returns nothing for unrelated pages', () => {
    expect(findLibraryMatch('Garden hose 20 m', 'green hose for the garden', builtins)).toBeNull();
  });
  it('reads board dimensions', () => {
    expect(extractDimensionsMm('Dimensions: 45 x 20 x 15 mm, weight 8g')).toEqual([45, 20, 15]);
    expect(extractDimensionsMm('Size 25,4mm × 17,8mm')).toEqual([25.4, 17.8]);
    expect(extractDimensionsMm('Resolution 128 x 64 pixels')).toBeNull();
  });
  it('finds the product photo', () => {
    const base = new URL('https://shop.example/p/1');
    expect(productImageUrl('<meta property="og:image" content="/img/p1.jpg">', base)).toBe('https://shop.example/img/p1.jpg');
    expect(productImageUrl('<meta content="https://cdn.x/y.png" property="og:image">', base)).toBe('https://cdn.x/y.png');
    expect(productImageUrl('<p>nothing</p>', base)).toBeNull();
  });
});
