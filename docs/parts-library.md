# Parts library

BoardPilot ships with an open library of hobby parts in [`parts/`](../parts/), one JSON file per part, licensed **[CC BY 4.0](../parts/LICENSE)**. Every file is loaded as a built-in part, drawn in 3D, checked by the wiring rules and published as a web page at `https://boardpilot.agentflowbind.com/parts/<id>/`.

## Format

```json
{
  "id": "bme280-gy",
  "name": "GY-BME280 breakout",
  "category": "sensor",
  "measures": ["temperature", "humidity", "pressure"],
  "pins": [
    { "name": "VIN", "role": "power" },
    { "name": "GND", "role": "ground" },
    { "name": "SCL", "role": "i2c_scl" },
    { "name": "SDA", "role": "i2c_sda" }
  ],
  "bus": "i2c",
  "addresses": ["0x76", "0x77"],
  "idCheck": { "register": "0xD0", "expect": "0x60" },
  "voltage": "3.3",
  "pullupsOnBoard": true,
  "model": { "shape": "breakout", "size": [11, 13, 1.6], "color": "#5B2A86" },
  "keywords": ["bme280", "temperature", "humidity", "pressure"],
  "sources": [{ "title": "Bosch BME280 datasheet", "section": "5.4.1 Register 0xD0 id" }]
}
```

- **pins**: header pins in the order printed on the most common board. Roles: `power`, `ground`, `i2c_sda`, `i2c_scl`, `spi_mosi`, `spi_miso`, `spi_sck`, `spi_cs`, `digital_in` (the ESP32 drives it), `digital_out` (the part drives it), `analog_out`, `onewire`, `int`, `passive` (not wired to the ESP32, e.g. motor terminals or an external supply).
- **voltage**: `"3.3"`, `"5"` or a range `"3.3-5"`. Mention 5 V logic outputs in the pin `notes`.
- **idCheck**: only when the datasheet documents an ID register; BoardPilot reads it to spot fakes and look-alikes.
- **model.shape**: `breakout`, `module`, `chip`, `oled`, `led`, `button`, `pot`, `dht`, `motor`, `relay`; **size** is `[width, depth, height]` in mm.
- **sources**: datasheet title and section for pins, addresses and ID values.

The full validator is [`shared/partSchema.ts`](../shared/partSchema.ts); `npm test` checks every file.

## Adding a part in the app

- **From the library**: Parts → search → **+**.
- **From a link**: paste a product page or datasheet link. BoardPilot recognises the chip if it is already in the library, reads the board size, measures the color from the product photo and drafts pins and a 3D model. With an AI provider it can also read PDF datasheets and search the web. You confirm every field before it is saved.
- **By hand**: Parts → *Create a part by hand*.

Your own parts are saved on your computer and travel inside saved project files.

## Contributing a part

1. Check that it is not already in [`parts/`](../parts/).
2. Add `parts/<id>.json` following the format above, with sources.
3. Run `npm test` (and `npm run build:site` to preview its web page in `site/parts/<id>/`).
4. Open a pull request. Not a coder? [Request the part](https://github.com/mojeee/boardpilot/issues/new?template=new-part.yml) with a product link.

Credit when reusing the data: *"Part data from the BoardPilot parts library, CC BY 4.0"*.
