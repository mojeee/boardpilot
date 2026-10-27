# Report collaudo fine linea - lotto 24-118

Collaudo funzionale delle schede termostato: test relè, lettura NTC a 25 °C, comunicazione
Modbus RTU e assorbimento a riposo. 500 schede provate, 4 scartate (relè che non chiude).

## Prove
1. Assorbimento a riposo < 15 mA
2. Lettura NTC 10k a 25 °C: 25,0 ± 0,5 °C
3. Risposta Modbus all'indirizzo 0x11, registro 30001
4. Relè: chiusura e apertura, 3 cicli
