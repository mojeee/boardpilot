// Gateway OpenTherm -> MQTT: legge stato caldaia (temperatura mandata, modulazione, errori)
// e permette di impostare il setpoint acqua dal broker. ESP32 + adattatore OpenTherm.
#include <WiFi.h>
#include <PubSubClient.h>
#include <OpenTherm.h>

const int OT_IN_PIN = 21;
const int OT_OUT_PIN = 22;
OpenTherm ot(OT_IN_PIN, OT_OUT_PIN);
WiFiClient net;
PubSubClient mqtt(net);

void IRAM_ATTR handleInterrupt() { ot.handleInterrupt(); }

void setup() {
  Serial.begin(115200);
  ot.begin(handleInterrupt);
  WiFi.begin("impianto", "********");
  mqtt.setServer("broker.local", 1883);
}

void loop() {
  unsigned long status = ot.setBoilerStatus(true, true, false);
  float tMandata = ot.getBoilerTemperature();
  float modulation = ot.getModulation();
  ot.setBoilerTemperature(55.0);
  mqtt.publish("caldaia/mandata", String(tMandata).c_str());
  mqtt.publish("caldaia/modulazione", String(modulation).c_str());
  mqtt.loop();
  delay(1000);
}
