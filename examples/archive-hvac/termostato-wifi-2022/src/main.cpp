// Termostato Wi-Fi: SHT31 + OLED + relè richiesta calore + pulsante setpoint
#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <Adafruit_SHT31.h>
#include <Adafruit_SSD1306.h>

#define RELAY_PIN 26
#define BUTTON_PIN 27
const float HYSTERESIS = 0.3;

Adafruit_SHT31 sht = Adafruit_SHT31();
Adafruit_SSD1306 oled(128, 64, &Wire, -1);
WiFiClient net;
PubSubClient mqtt(net);
float setpoint = 20.5;
unsigned long lastSwitch = 0;

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  Wire.begin(21, 22);
  sht.begin(0x44);
  oled.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  WiFi.begin("casa", "********");
  mqtt.setServer("192.168.1.10", 1883);
}

void loop() {
  float t = sht.readTemperature();
  if (digitalRead(BUTTON_PIN) == LOW) setpoint += 0.5;
  bool heat = digitalRead(RELAY_PIN);
  if (millis() - lastSwitch > 120000) {
    if (t < setpoint - HYSTERESIS && !heat) { digitalWrite(RELAY_PIN, HIGH); lastSwitch = millis(); }
    if (t > setpoint + HYSTERESIS && heat) { digitalWrite(RELAY_PIN, LOW); lastSwitch = millis(); }
  }
  mqtt.loop();
  delay(500);
}
