# BoardPilotProbe

An Arduino library for ESP32 that lets your own sketch send named values to the
BoardPilot **Monitor**. The Monitor plots them live and shows memory use.

Each batch is one line that starts with `@bp ` and holds a JSON object, so it can
sit next to your normal `Serial.print` output. The Monitor only reads lines that
start with `@bp `.

## Install

Copy this `probe` folder into your Arduino `libraries` folder and rename it to
`BoardPilotProbe`. With arduino-cli you can also point to it directly:

```sh
arduino-cli compile --fqbn esp32:esp32:esp32 --library path/to/firmware/probe MySketch
```

## Use

```cpp
#include <BoardPilotProbe.h>

BoardPilotProbe probe(Serial);

void setup() {
  Serial.begin(115200);
  probe.begin(100);                 // send every 100 ms
}

void loop() {
  probe.value("pot", analogReadMilliVolts(34), 34);  // name, value, optional GPIO
  probe.loop();                     // sends the batch and a memory line when due
}
```

| Call | What it does |
| --- | --- |
| `BoardPilotProbe probe(Serial)` | Any `Print` works (Serial, Serial1, ...). |
| `probe.begin(intervalMs = 100)` | Sets how often `loop()` sends. |
| `probe.value(name, v, pin = -1)` | Adds or updates a value in the batch. `pin` tells the Monitor which GPIO it comes from. Up to 16 values, names up to 23 characters. |
| `probe.send()` | Sends the batch now as one line and clears it. |
| `probe.memory()` | Sends one memory line now. |
| `probe.loop()` | Every interval: `send()` then `memory()`. |
| `probe.setMemoryEnabled(false)` | Stops the memory line in `loop()`. |

## Line format

```
@bp {"t":12345,"v":{"temperature":22.4,"humidity":41.2}}
@bp {"t":12345,"v":{"pot":1840},"pins":{"pot":34}}
@bp {"t":12345,"mem":{"heapFree":201344,"heapMin":190000,"heapSize":327680,"stackFree":6000}}
```

- `t`: `millis()` when the line was sent.
- `v`: the values. A value that is not a number (NaN or infinity) is sent as `null`.
- `pins`: optional GPIO hint per value name.
- `mem`: `heapFree` = `ESP.getFreeHeap()`, `heapMin` = `ESP.getMinFreeHeap()`
  (lowest free heap since boot), `heapSize` = `ESP.getHeapSize()`, `stackFree` =
  `uxTaskGetStackHighWaterMark(NULL)`: the smallest free stack of the task that
  calls `memory()` (usually the Arduino loop task), in bytes.

## Example

`examples/WeatherStation` reads a potentiometer on GPIO 34 and sends its voltage.
Comments show where to add a BME280 with the Adafruit library.
