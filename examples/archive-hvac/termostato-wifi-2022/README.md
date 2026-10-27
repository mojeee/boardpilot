# Termostato Wi-Fi ambiente

Termostato da parete con sensore SHT31 (temperatura e umidità), display OLED e un relè che
comanda la richiesta di calore alla caldaia. Si collega al Wi-Fi di casa e pubblica i valori via MQTT.

## Hardware
- ESP32 DevKit
- SHT31 su I2C
- OLED SSD1306 128x64
- Modulo relè 1 canale (contatto pulito verso la caldaia, morsetti TA)
- Pulsante per cambiare la temperatura impostata

## Note
Isteresi 0,3 °C. Il relè non deve commutare più di una volta ogni 2 minuti.
