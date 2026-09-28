// One-off generator for boards/esp32-devkitc-30.json. Kept in the repo so the data is reviewable.
// Pin facts: Espressif "ESP32 Series Datasheet" (v4.x): section "Pin Description" (IO_MUX table),
// section "Strapping Pins", and ESP32 Technical Reference Manual chapter "IO_MUX and GPIO Matrix".
import { writeFileSync } from 'node:fs';

const P = (id, gpio, label, kind, functions, flags = [], extra = {}) => ({
  id, gpio, label, kind, functions, flags, maxVolt: 3.3, ...extra,
});

const front = [
  P('D23', 23, 'D23', 'gpio', ['GPIO', 'VSPI_MOSI']),
  P('D22', 22, 'D22', 'gpio', ['GPIO', 'I2C_SCL_default', 'U0RTS']),
  P('TX0', 1, 'TX0', 'gpio', ['GPIO', 'U0TXD'], ['uart0'], { notes: 'USB serial TX. Used for uploading and the serial monitor.' }),
  P('RX0', 3, 'RX0', 'gpio', ['GPIO', 'U0RXD'], ['uart0'], { notes: 'USB serial RX. Used for uploading and the serial monitor.' }),
  P('D21', 21, 'D21', 'gpio', ['GPIO', 'I2C_SDA_default']),
  P('D19', 19, 'D19', 'gpio', ['GPIO', 'VSPI_MISO', 'U0CTS']),
  P('D18', 18, 'D18', 'gpio', ['GPIO', 'VSPI_SCK']),
  P('D5', 5, 'D5', 'gpio', ['GPIO', 'VSPI_CS'], ['strapping'], { notes: 'Strapping pin (SDIO timing). Pulled up at reset. Fine to use after boot.' }),
  P('TX2', 17, 'TX2', 'gpio', ['GPIO', 'U2TXD']),
  P('RX2', 16, 'RX2', 'gpio', ['GPIO', 'U2RXD']),
  P('D4', 4, 'D4', 'gpio', ['GPIO', 'ADC2_CH0', 'TOUCH0'], ['adc2', 'touch']),
  P('D2', 2, 'D2', 'gpio', ['GPIO', 'ADC2_CH2', 'TOUCH2'], ['strapping', 'adc2', 'touch', 'onboard_led'], { notes: 'Strapping pin: must be LOW or floating to enter download mode. Drives the blue on-board LED on most DevKit V1 boards.' }),
  P('D15', 15, 'D15', 'gpio', ['GPIO', 'ADC2_CH3', 'TOUCH3', 'HSPI_CS', 'MTDO'], ['strapping', 'adc2', 'touch'], { notes: 'Strapping pin: LOW at reset silences the boot messages.' }),
  P('GND2', null, 'GND', 'ground', ['GND'], [], { maxVolt: 0 }),
  P('3V3', null, '3V3', 'power', ['3V3'], [], { supplies: 3.3, notes: 'Output of the on-board 3.3 V regulator (about 600 mA shared with the ESP32).' }),
];

const back = [
  P('EN', null, 'EN', 'enable', ['CHIP_PU'], [], { notes: 'Reset. Pulling it LOW resets the chip (same as the EN button).' }),
  P('VP', 36, 'VP', 'gpio', ['GPIO', 'ADC1_CH0', 'SENSOR_VP'], ['input_only', 'adc1', 'no_internal_pull']),
  P('VN', 39, 'VN', 'gpio', ['GPIO', 'ADC1_CH3', 'SENSOR_VN'], ['input_only', 'adc1', 'no_internal_pull']),
  P('D34', 34, 'D34', 'gpio', ['ADC1_CH6'], ['input_only', 'adc1', 'no_internal_pull']),
  P('D35', 35, 'D35', 'gpio', ['ADC1_CH7'], ['input_only', 'adc1', 'no_internal_pull']),
  P('D32', 32, 'D32', 'gpio', ['GPIO', 'ADC1_CH4', 'TOUCH9', 'XTAL_32K_P'], ['adc1', 'touch']),
  P('D33', 33, 'D33', 'gpio', ['GPIO', 'ADC1_CH5', 'TOUCH8', 'XTAL_32K_N'], ['adc1', 'touch']),
  P('D25', 25, 'D25', 'gpio', ['GPIO', 'ADC2_CH8', 'DAC_1'], ['adc2', 'dac']),
  P('D26', 26, 'D26', 'gpio', ['GPIO', 'ADC2_CH9', 'DAC_2'], ['adc2', 'dac']),
  P('D27', 27, 'D27', 'gpio', ['GPIO', 'ADC2_CH7', 'TOUCH7'], ['adc2', 'touch']),
  P('D14', 14, 'D14', 'gpio', ['GPIO', 'ADC2_CH6', 'TOUCH6', 'HSPI_SCK', 'MTMS'], ['adc2', 'touch'], { notes: 'Outputs a short PWM signal at boot.' }),
  P('D12', 12, 'D12', 'gpio', ['GPIO', 'ADC2_CH5', 'TOUCH5', 'HSPI_MISO', 'MTDI'], ['strapping', 'adc2', 'touch'], { notes: 'Strapping pin: HIGH at reset selects 1.8 V flash voltage, so the board may not boot. Keep it LOW or floating at reset.' }),
  P('D13', 13, 'D13', 'gpio', ['GPIO', 'ADC2_CH4', 'TOUCH4', 'HSPI_MOSI', 'MTCK'], ['adc2', 'touch']),
  P('GND1', null, 'GND', 'ground', ['GND'], [], { maxVolt: 0 }),
  P('VIN', null, 'VIN', 'power', ['VIN_5V'], [], { maxVolt: 5, supplies: 5, notes: '5 V from USB (or a 5 V input when USB is not connected).' }),
];

const pins = [
  ...front.map((p, index) => ({ ...p, row: 'front', index })),
  ...back.map((p, index) => ({ ...p, row: 'back', index })),
].map(({ id, gpio, row, index, label, kind, functions, flags, maxVolt, supplies, notes }) =>
  Object.fromEntries(Object.entries({ id, gpio, row, index, label, kind, functions, flags, maxVolt, supplies, notes }).filter(([, v]) => v !== undefined)));

const board = {
  id: 'esp32-devkitc-30',
  name: 'ESP32 DevKit (30 pins)',
  module: 'ESP32-WROOM-32',
  chip: 'ESP32',
  logicVolt: 3.3,
  pcbMm: { length: 51.5, width: 28.5, thickness: 1.6 },
  layoutPxPerMm: 7,
  header: { pitchMm: 2.54, rowSpacingMm: 25.4, firstPinOffsetMm: 42.06 },
  pins,
  components: [
    { type: 'module', label: 'ESP32-WROOM-32', rect: [178, 37, 178, 126] },
    { type: 'usb', label: 'micro-USB', rect: [-8, 74, 40, 52] },
    { type: 'button', label: 'EN', rect: [42, 22, 28, 22] },
    { type: 'button', label: 'BOOT', rect: [42, 156, 28, 22] },
    { type: 'regulator', label: 'AMS1117-3.3', rect: [84, 34, 46, 26] },
    { type: 'bridge', label: 'USB-UART', rect: [88, 112, 34, 34] },
    { type: 'led', label: 'PWR', rect: [146, 60, 10, 6] },
    { type: 'led', label: 'GPIO2', rect: [146, 134, 10, 6] },
  ],
  sources: [
    { title: 'Espressif ESP32 Series Datasheet', section: 'Pin Description (IO_MUX pin functions)' },
    { title: 'Espressif ESP32 Series Datasheet', section: 'Strapping Pins (GPIO 0, 2, 5, 12, 15)' },
    { title: 'Espressif ESP32 Technical Reference Manual', section: 'IO_MUX and GPIO Matrix: GPIO 34-39 input only, no pull-ups' },
    { title: 'Espressif ESP-IDF Programming Guide', section: 'ADC: ADC2 cannot be used while Wi-Fi is running' },
  ],
};

writeFileSync(new URL('../boards/esp32-devkitc-30.json', import.meta.url), JSON.stringify(board, null, 2) + '\n');
console.log('pins', pins.length);
