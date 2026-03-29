/*
 * ESP32 Plant Monitor — Smart Watering System (PlatformIO version)
 * 
 * Uses a DHT11 for air temperature & humidity,
 * a soil moisture sensor, and a relay-controlled water pump.
 * Auto-waters when soil is dry (threshold-based).
 * Sends data to a Flask backend via HTTP POST.
 * Serves a web interface and accepts pump commands via HTTP.
 * 
 * Board: ESP32 Dev Module (via PlatformIO)
 * Libraries: ArduinoJson, DHT sensor library
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "DHT.h"

// ==========================================
// 1. WIFI ACCESS POINT SETTINGS
// ==========================================
// ESP32 creates its own WiFi network.
// Connect your PC to this network, then open http://192.168.4.1
const char* ap_ssid = "PlantMonitor";
const char* ap_password = "plant1234";

// Flask backend — disabled in AP mode (Flask will poll ESP32 instead)
// const char* SERVER_URL = "http://192.168.4.x:5000/api/sensor-data";

// Plant ID — must match the plant ID in the web app settings
const int PLANT_ID = 1;

// ==========================================
// 2. ESP32 PIN SETUP (Matches your exact board)
// ==========================================
// DHT11 Pins
#define DHTPIN 4          // DHT11 Signal (Plug into D4)
#define DHTTYPE DHT11    
DHT dht(DHTPIN, DHTTYPE);

// Power Hack Pins for DHT11
const int dhtVccPin = 2;  // Acts as VCC (Plug into D2)
const int dhtGndPin = 15; // Acts as GND (Plug into D15)

// Relay and Soil Sensor Pins
const int relayPin = 5;   // Relay control (Plug into D5) — ACTIVE LOW
const int sensorPin = 34; // Soil sensor (Plug into D34)

// ==========================================
// 3. MOISTURE THRESHOLD
// ==========================================
// The ESP32 reads from 0 to 4095. A dry value of 800 on Arduino is ~3200 on ESP32.
const int threshold = 3200; 

// How often to read and send sensor data (milliseconds)
const unsigned long SENSOR_INTERVAL = 30000;  // 30 seconds

// ==================== FORWARD DECLARATIONS ====================
void sendSensorData();
void startPump(unsigned long durationMs);
void checkPump();
void handleRoot();
void handleWater();
void handleStatus();

// ==================== GLOBALS ====================
WebServer server(80);
unsigned long lastSensorRead = 0;
float lastSoilRaw       = 0;   // Raw analog value 0-4095
float lastSoilPercent    = 0;   // Mapped to 0-100%
float lastTemperature    = 0;   // °C from DHT11
float lastAirHumidity    = 0;   // % from DHT11

// Non-blocking watering state
bool pumpRunning = false;
unsigned long pumpStartTime = 0;
unsigned long pumpDuration = 0;

// ==================== SETUP ====================
void setup() {
  // ESP32 standard baud rate is 115200!
  Serial.begin(115200); 
  
  // --- POWER UP THE DHT11 SENSOR ---
  pinMode(dhtVccPin, OUTPUT);
  digitalWrite(dhtVccPin, HIGH); 
  
  pinMode(dhtGndPin, OUTPUT);
  digitalWrite(dhtGndPin, LOW);  
  
  // Give the DHT11 2 seconds to warm up
  delay(2000); 
  
  // --- INITIALIZE RELAY & SENSORS ---
  pinMode(relayPin, OUTPUT);
  digitalWrite(relayPin, HIGH); // Turn pump OFF initially (active LOW)
  dht.begin(); 
  
  // --- START WIFI ACCESS POINT ---
  Serial.println();
  Serial.println("Starting WiFi Access Point...");
  WiFi.mode(WIFI_AP);
  WiFi.softAP(ap_ssid, ap_password);
  delay(100);  // Brief delay for AP to stabilize
  
  Serial.println("=> Access Point Started!");
  Serial.print("=> SSID: ");
  Serial.println(ap_ssid);
  Serial.print("=> ESP32 IP: ");
  Serial.println(WiFi.softAPIP());
  Serial.println("=> Connect your PC to this WiFi network");

  // Setup HTTP server endpoints
  server.on("/", handleRoot);
  server.on("/water", handleWater);
  server.on("/status", handleStatus);
  server.begin();
  Serial.println("HTTP server started on port 80");
  Serial.println("--- ESP32 SMART WATERING SYSTEM STARTING ---");
}

// ==================== LOOP ====================
void loop() {
  // Handle incoming web requests
  server.handleClient();

  // Check if pump needs to be turned off
  checkPump();

  // Read sensors and send data on interval
  unsigned long now = millis();
  if (now - lastSensorRead >= SENSOR_INTERVAL || lastSensorRead == 0) {
    lastSensorRead = now;

    // 1. READ AIR TEMPERATURE & HUMIDITY
    float h = dht.readHumidity();
    float t = dht.readTemperature(); 

    if (isnan(h) || isnan(t)) {
      Serial.println("=> Error: Failed to read from DHT sensor!");
    } else {
      lastTemperature = t;
      lastAirHumidity = h;
      Serial.print("Temp: "); 
      Serial.print(t); 
      Serial.print(" *C  |  Humidity: "); 
      Serial.print(h); 
      Serial.println(" %");
    }

    // 2. READ SOIL SENSOR
    int sensorValue = analogRead(sensorPin); 
    lastSoilRaw = sensorValue;
    lastSoilPercent = map(sensorValue, 4095, 0, 0, 100);
    lastSoilPercent = constrain(lastSoilPercent, 0, 100);

    Serial.print("Soil Moisture (0-4095): "); 
    Serial.println(sensorValue);

    // 3. AUTO-WATER IF DRY (non-blocking)
    if (sensorValue > threshold && !pumpRunning) {
      Serial.println("=> Status: DRY! Starting pump for 10s...");
      startPump(10000);
    } else if (!pumpRunning) {
      Serial.println("=> Status: MOIST. No pumping needed.");
    }

    // 4. In AP mode, Flask polls ESP32 via /status — no push needed
    // sendSensorData();

    Serial.println("------------------------------------");
  }
}

// ==================== NON-BLOCKING PUMP CONTROL ====================
void startPump(unsigned long durationMs) {
    if (pumpRunning) return;  // Already running
    pumpRunning = true;
    pumpStartTime = millis();
    pumpDuration = durationMs;
    digitalWrite(relayPin, LOW);  // Pump ON (active LOW)
    Serial.printf("Pump ON for %lu ms\n", durationMs);
}

void checkPump() {
    if (pumpRunning && (millis() - pumpStartTime >= pumpDuration)) {
        digitalWrite(relayPin, HIGH);  // Pump OFF
        pumpRunning = false;
        Serial.println("=> Done pumping. Turning off.");
    }
}

// ==================== SEND DATA TO BACKEND ====================
// In AP mode, Flask polls the ESP32 /status endpoint instead.
// Keeping function stub in case station mode is re-enabled later.
void sendSensorData() {
    // Disabled in AP mode — no outbound connection available
}

// ==================== HTTP HANDLERS ====================

// Root page — simple status display
void handleRoot() {
    String html = "<!DOCTYPE html><html><head>";
    html += "<meta charset='UTF-8'>";
    html += "<meta name='viewport' content='width=device-width, initial-scale=1.0'>";
    html += "<title>ESP32 Plant Monitor</title>";
    html += "<style>body{font-family:sans-serif;max-width:480px;margin:40px auto;padding:0 20px;}";
    html += "h1{color:#2d6a4f;}.reading{margin:12px 0;padding:12px;background:#f5f7f5;border-radius:8px;}";
    html += "a{display:inline-block;margin-top:16px;padding:10px 20px;background:#0288d1;color:#fff;";
    html += "text-decoration:none;border-radius:8px;}</style></head><body>";
    html += "<h1>ESP32 Plant Monitor</h1>";
    html += "<p>Plant ID: " + String(PLANT_ID) + "</p>";
    html += "<div class='reading'>Soil Moisture: <strong>" + String(lastSoilPercent, 1) + "% (raw: " + String((int)lastSoilRaw) + ")</strong></div>";
    html += "<div class='reading'>Temperature: <strong>" + String(lastTemperature, 1) + " &deg;C</strong></div>";
    html += "<div class='reading'>Air Humidity: <strong>" + String(lastAirHumidity, 1) + " %</strong></div>";
    html += "<a href='/water?duration=5'>Water Plant (5s)</a>";
    html += "</body></html>";
    server.send(200, "text/html", html);
}

// Water pump endpoint — called by the Flask backend or manually
void handleWater() {
    int duration = 5;  // Default 5 seconds
    if (server.hasArg("duration")) {
        duration = server.arg("duration").toInt();
        if (duration < 1) duration = 1;
        if (duration > 60) duration = 60;  // Safety maximum
    }

    Serial.printf("Activating water pump for %d seconds (non-blocking)\n", duration);

    // Start pump using non-blocking helper
    startPump((unsigned long)duration * 1000);

    // Respond immediately with JSON
    String response = "{\"status\":\"ok\",\"duration\":" + String(duration) + ",\"pump_running\":true}";
    server.send(200, "application/json", response);
}

// Status endpoint — returns current sensor values as JSON
void handleStatus() {
    JsonDocument doc;
    doc["plant_id"]       = PLANT_ID;
    doc["soil_humidity"]  = lastSoilPercent;
    doc["soil_raw"]       = (int)lastSoilRaw;
    doc["temperature"]    = lastTemperature;
    doc["air_humidity"]   = lastAirHumidity;
    doc["light_level"]    = 0;
    doc["uptime_seconds"] = millis() / 1000;
    doc["wifi_rssi"]      = WiFi.RSSI();
    doc["free_heap"]      = ESP.getFreeHeap();

    String json;
    serializeJson(doc, json);
    server.send(200, "application/json", json);
}
