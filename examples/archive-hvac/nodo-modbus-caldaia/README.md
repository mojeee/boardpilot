# Nodo Modbus caldaia

Scheda slave Modbus RTU (RS-485, 19200 8E1) che legge due sonde NTC 10k (mandata e ritorno)
e comanda il relè della pompa di circolazione. Indirizzo slave impostato da dip switch.

Registri: 30001 temperatura mandata (0,1 °C), 30002 temperatura ritorno, 40001 comando pompa.
