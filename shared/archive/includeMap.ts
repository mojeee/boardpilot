// What an #include in an old project tells us: the library, and when the header belongs to a part
// of the BoardPilot library, that part. Header names are the public headers of the Arduino / ESP-IDF
// libraries named in the comment of each line (source: each library's own repository).

import type { ArchiveBus, ArchiveProtocol } from './types';

export interface HeaderFacts {
  library: string;
  partId?: string;
  bus?: ArchiveBus;
  protocol?: ArchiveProtocol;
}

/** Keys are lower-case header names without the path. */
export const HEADERS: Record<string, HeaderFacts> = {
  // buses of the Arduino core
  'wire.h': { library: 'Wire', bus: 'i2c' },
  'spi.h': { library: 'SPI', bus: 'spi' },
  'softwareserial.h': { library: 'SoftwareSerial', bus: 'uart' },
  'hardwareserial.h': { library: 'HardwareSerial', bus: 'uart' },
  // sensors and displays (Adafruit, Sensirion, Paul Stoffregen, Miles Burton libraries)
  'adafruit_bme280.h': { library: 'Adafruit BME280', partId: 'bme280-gy', bus: 'i2c' },
  'adafruit_bmp280.h': { library: 'Adafruit BMP280', partId: 'bmp280-gy', bus: 'i2c' },
  'adafruit_ssd1306.h': { library: 'Adafruit SSD1306', partId: 'ssd1306-i2c', bus: 'i2c' },
  'adafruit_sht31.h': { library: 'Adafruit SHT31', partId: 'sht31', bus: 'i2c' },
  'adafruit_sht4x.h': { library: 'Adafruit SHT4x', partId: 'sht40', bus: 'i2c' },
  'adafruit_ahtx0.h': { library: 'Adafruit AHTX0', partId: 'aht20', bus: 'i2c' },
  'adafruit_ina219.h': { library: 'Adafruit INA219', partId: 'ina219', bus: 'i2c' },
  'adafruit_ads1x15.h': { library: 'Adafruit ADS1X15', partId: 'ads1115', bus: 'i2c' },
  'adafruit_mpu6050.h': { library: 'Adafruit MPU6050', partId: 'mpu6050', bus: 'i2c' },
  'adafruit_neopixel.h': { library: 'Adafruit NeoPixel', partId: 'ws2812b-strip' },
  'sensirionisht31.h': { library: 'Sensirion SHT31', partId: 'sht31', bus: 'i2c' },
  'sensirioni2cscd4x.h': { library: 'Sensirion I2C SCD4x', partId: 'scd40', bus: 'i2c' },
  'sensirioni2csgp40.h': { library: 'Sensirion I2C SGP40', partId: 'sgp40', bus: 'i2c' },
  'dht.h': { library: 'DHT sensor library', partId: 'dht22' },
  'onewire.h': { library: 'OneWire', bus: 'onewire' },
  'dallastemperature.h': { library: 'DallasTemperature', partId: 'ds18b20-probe', bus: 'onewire' },
  'liquidcrystal_i2c.h': { library: 'LiquidCrystal I2C', partId: 'lcd1602-i2c', bus: 'i2c' },
  'tm1637display.h': { library: 'TM1637', partId: 'tm1637-4digit' },
  'mcp_can.h': { library: 'MCP_CAN', partId: 'mcp2515-can', bus: 'can' },
  // field buses and protocols
  'modbusmaster.h': { library: 'ModbusMaster', partId: 'max485', bus: 'rs485', protocol: 'modbus' },
  'modbusrtu.h': { library: 'ModbusRTU', bus: 'rs485', protocol: 'modbus' },
  'modbusip_esp8266.h': { library: 'modbus-esp8266', protocol: 'modbus' },
  'opentherm.h': { library: 'OpenTherm (ihormelnyk)', partId: 'opentherm-adapter', protocol: 'opentherm' },
  'pubsubclient.h': { library: 'PubSubClient', protocol: 'mqtt' },
  'mqtt_client.h': { library: 'ESP-MQTT', protocol: 'mqtt' },
  'wifi.h': { library: 'WiFi', protocol: 'wifi' },
  'esp_wifi.h': { library: 'esp_wifi', protocol: 'wifi' },
  'wifimanager.h': { library: 'WiFiManager', protocol: 'wifi' },
  'bledevice.h': { library: 'ESP32 BLE', protocol: 'ble' },
  'nimbledevice.h': { library: 'NimBLE-Arduino', protocol: 'ble' },
  'lora.h': { library: 'LoRa (sandeepmistry)', partId: 'lora-ra02', bus: 'spi', protocol: 'lora' },
  'radiolib.h': { library: 'RadioLib', protocol: 'lora' },
  'ethernet.h': { library: 'Ethernet', bus: 'spi', protocol: 'ethernet' },
  'eth.h': { library: 'ESP32 ETH', protocol: 'ethernet' },
  'httpclient.h': { library: 'HTTPClient', protocol: 'http' },
  'webserver.h': { library: 'WebServer', protocol: 'http' },
  'espasyncwebserver.h': { library: 'ESPAsyncWebServer', protocol: 'http' },
  'esp_http_server.h': { library: 'esp_http_server', protocol: 'http' },
  // STM32 HAL headers name the peripherals in use
  'stm32_hal_i2c.h': { library: 'STM32 HAL I2C', bus: 'i2c' },
};

/** A PlatformIO lib_deps entry ("adafruit/Adafruit SHT31 Library@^2.2") as a header-like key. */
export function libDepFacts(dep: string): HeaderFacts | null {
  const name = dep.replace(/@.*$/, '').replace(/^.*\//, '').trim();
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!key) return null;
  for (const [h, f] of Object.entries(HEADERS)) {
    const hk = h.replace(/\.h$/, '').replace(/[^a-z0-9]/g, '');
    const lk = f.library.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (hk.length >= 3 && (key === hk || key === lk || key.startsWith(lk) || (key.includes(hk) && hk.length >= 5))) return { ...f, library: name };
  }
  return { library: name };
}
