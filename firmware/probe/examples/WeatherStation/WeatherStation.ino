// WeatherStation: send live values to the BoardPilot Monitor.
//
// Wiring for this example: a potentiometer with its ends on 3V3 and GND and
// its middle pin (wiper) on GPIO 34. GPIO 34 is an ADC1 pin, so it keeps
// working when Wi-Fi is on.
//
// Every value sent here is a real measurement. Nothing is made up.
//
// Open the BoardPilot Monitor (or any serial monitor at 115200 baud) to see
// lines like:
//   @bp {"t":1234,"v":{"pot":1840},"pins":{"pot":34}}
//   @bp {"t":1234,"mem":{"heapFree":301234,"heapMin":298000,"heapSize":327680,"stackFree":6400}}

#include <BoardPilotProbe.h>

// To add a BME280 (temperature, humidity, pressure), install the
// "Adafruit BME280 Library" and uncomment the lines marked BME280.
// #include <Wire.h>              // BME280
// #include <Adafruit_BME280.h>   // BME280
// Adafruit_BME280 bme;           // BME280

const int POT_PIN = 34;

BoardPilotProbe probe(Serial);

void setup() {
  Serial.begin(115200);
  probe.begin(100);  // send a batch and a memory line every 100 ms

  // Wire.begin(21, 22);                              // BME280: SDA 21, SCL 22
  // if (!bme.begin(0x76)) {                          // BME280: or 0x77
  //   Serial.println("BME280 not found at 0x76.");  // plain prints still work
  // }
}

void loop() {
  // Real reading from the ADC, in millivolts (calibrated by the core).
  const uint32_t mv = analogReadMilliVolts(POT_PIN);
  probe.value("pot", (float)mv, POT_PIN);

  // probe.value("temperature", bme.readTemperature());        // BME280: °C
  // probe.value("humidity", bme.readHumidity());              // BME280: %
  // probe.value("pressure", bme.readPressure() / 100.0f);     // BME280: hPa

  probe.loop();
  delay(10);
}
