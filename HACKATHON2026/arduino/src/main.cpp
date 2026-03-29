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
#include <Ticker.h>
#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "DHT.h"

// ==========================================
// 1. WIFI SETTINGS (CHANGE THESE!)
// ==========================================
const char* ssid = "Galaxy Z Fold6 200A";
const char* password = "c8j2p3dx36isnmk";

// Flask backend server address (your PC's local IP)
const char* SERVER_URL = "http://10.175.88.221:5000/api/sensor-data";

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
void handleAutoWater();
void handleDebug();

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

// Hardware safety timer — guaranteed pump shutoff
Ticker pumpSafetyTimer;

// Auto-watering toggle (can be changed via /auto-water endpoint)
bool autoWaterEnabled = false;

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
  digitalWrite(relayPin, LOW); // Turn pump OFF initially (active HIGH)
  dht.begin(); 
  
  // --- CONNECT TO WIFI ---
  Serial.println();
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println("\n=> WiFi Connected!");
  Serial.print("=> ESP32 IP Address: ");
  Serial.println(WiFi.localIP());

  // Setup HTTP server endpoints
  server.on("/", handleRoot);
  server.on("/water", handleWater);
  server.on("/status", handleStatus);
  server.on("/auto-water", handleAutoWater);
  server.on("/debug", handleDebug);
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
    if (autoWaterEnabled && sensorValue > threshold && !pumpRunning) {
      Serial.println("=> Status: DRY! Starting pump for 10s...");
      startPump(10000);
    } else if (!pumpRunning) {
      Serial.println(autoWaterEnabled ? "=> Status: MOIST. No pumping needed." : "=> Auto-water DISABLED.");
    }

    // 4. SEND DATA TO FLASK BACKEND (skip while pump is running to avoid blocking)
    if (!pumpRunning) {
        sendSensorData();
    } else {
        Serial.println("Pump running — skipping HTTP send.");
    }

    Serial.println("------------------------------------");
  }
}

// ==================== NON-BLOCKING PUMP CONTROL ====================
// Ticker callback — runs independently, guaranteed to fire
void pumpSafetyOff() {
    digitalWrite(relayPin, LOW);  // Pump OFF (active HIGH)
    pumpRunning = false;
    Serial.println("=> Timer: Pump OFF.");
}

void startPump(unsigned long durationMs) {
    if (pumpRunning) return;  // Already running
    pumpRunning = true;
    pumpStartTime = millis();
    pumpDuration = durationMs;
    digitalWrite(relayPin, HIGH);  // Pump ON (active HIGH)
    // Set hardware timer to guarantee shutoff
    pumpSafetyTimer.once_ms(durationMs + 500, pumpSafetyOff);
    Serial.printf("Pump ON for %lu ms\n", durationMs);
}

void forceStartPump(unsigned long durationMs) {
    // Cancel any existing safety timer
    pumpSafetyTimer.detach();
    // Start fresh
    pumpRunning = true;
    pumpStartTime = millis();
    pumpDuration = durationMs;
    digitalWrite(relayPin, HIGH);  // Pump ON (active HIGH)
    // Set hardware timer to guarantee shutoff
    pumpSafetyTimer.once_ms(durationMs + 500, pumpSafetyOff);
    Serial.printf("Pump FORCE ON for %lu ms\n", durationMs);
}

void checkPump() {
    if (pumpRunning && (millis() - pumpStartTime >= pumpDuration)) {
        digitalWrite(relayPin, LOW);  // Pump OFF (active HIGH)
        pumpRunning = false;
        Serial.println("=> Done pumping. Turning off.");
    }
    // Safety: if pump is not supposed to be running, ensure relay is OFF
    if (!pumpRunning) {
        digitalWrite(relayPin, LOW);
    }
    // Hard safety limit: never run pump longer than 65 seconds
    if (pumpRunning && (millis() - pumpStartTime >= 65000)) {
        digitalWrite(relayPin, LOW);
        pumpRunning = false;
        Serial.println("=> SAFETY: Pump exceeded max time. Forced OFF.");
    }
}

// ==================== SEND DATA TO BACKEND ====================
void sendSensorData() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi disconnected, skipping data send.");
        return;
    }

    HTTPClient http;
    http.begin(SERVER_URL);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(2000);

    // Build JSON payload
    JsonDocument doc;
    doc["plant_id"]       = PLANT_ID;
    doc["soil_humidity"]  = round(lastSoilPercent * 10) / 10.0;
    doc["temperature"]    = round(lastTemperature * 10) / 10.0;
    doc["air_humidity"]   = round(lastAirHumidity * 10) / 10.0;

    String json;
    serializeJson(doc, json);

    int httpCode = http.POST(json);
    if (httpCode > 0) {
        Serial.printf("Data sent -> HTTP %d\n", httpCode);
    } else {
        Serial.printf("Send failed: %s\n", http.errorToString(httpCode).c_str());
    }
    http.end();
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
    html += "<div class='reading'>Auto-Water: <strong>" + String(autoWaterEnabled ? "ON" : "OFF") + "</strong></div>";
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

    // Start pump using non-blocking helper (override any auto-water cycle)
    forceStartPump((unsigned long)duration * 1000);

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
    doc["pump_running"]   = pumpRunning;
    doc["auto_water"]     = autoWaterEnabled;
    doc["uptime_seconds"] = millis() / 1000;
    doc["wifi_rssi"]      = WiFi.RSSI();
    doc["free_heap"]      = ESP.getFreeHeap();

    String json;
    serializeJson(doc, json);
    server.send(200, "application/json", json);
}

// ==================== DEBUG: RAW GPIO RELAY TEST ====================
void handleDebug() {
    String action = "";
    if (server.hasArg("action")) action = server.arg("action");

    String result = "";

    if (action == "relay_on") {
        // Bypass ALL pump logic — raw GPIO HIGH = relay ON (active HIGH)
        pumpSafetyTimer.detach();
        pumpRunning = false;
        digitalWrite(relayPin, HIGH);
        result = "RELAY PIN SET HIGH (pump should be ON). If pump does NOT run = CIRCUIT issue.";
        Serial.println("DEBUG: relayPin -> HIGH (raw ON)");
    }
    else if (action == "relay_off") {
        // Bypass ALL pump logic — raw GPIO LOW = relay OFF (active HIGH)
        pumpSafetyTimer.detach();
        pumpRunning = false;
        digitalWrite(relayPin, LOW);
        result = "RELAY PIN SET LOW (pump should be OFF). If pump does NOT stop = CIRCUIT issue.";
        Serial.println("DEBUG: relayPin -> LOW (raw OFF)");
    }
    else if (action == "timed_test") {
        // Raw 3-second test: no startPump, no checkPump, just direct GPIO + delay
        pumpSafetyTimer.detach();
        pumpRunning = false;
        Serial.println("DEBUG: Starting raw 3s timed test...");
        unsigned long t0 = millis();
        digitalWrite(relayPin, HIGH);
        delay(3000);  // Intentionally blocking — pure hardware test
        digitalWrite(relayPin, LOW);
        unsigned long elapsed = millis() - t0;
        result = "Raw 3s test done. Actual elapsed: " + String(elapsed) + " ms. If pump ran ~3s = circuit OK, code issue. If not = circuit issue.";
        Serial.printf("DEBUG: Raw 3s test done in %lu ms\n", elapsed);
    }
    else if (action == "managed_test") {
        // Use forceStartPump — tests the software timer path
        forceStartPump(3000);
        result = "forceStartPump(3000) called. Watch serial monitor. Pump should stop in ~3s via checkPump() + Ticker safety at 3.5s.";
    }
    else if (action == "read_pin") {
        int pinState = digitalRead(relayPin);
        result = "relayPin (" + String(relayPin) + ") reads: " + String(pinState) + " (HIGH=1=OFF, LOW=0=ON). pumpRunning=" + String(pumpRunning);
        Serial.printf("DEBUG: relayPin=%d, pumpRunning=%d\n", pinState, pumpRunning);
    }
    else {
        // Serve the debug page
        String html = "<!DOCTYPE html><html><head>";
        html += "<meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1.0'>";
        html += "<title>Debug: Relay Test</title>";
        html += "<style>";
        html += "body{font-family:monospace;max-width:500px;margin:30px auto;padding:0 15px;background:#1a1a2e;color:#e0e0e0;}";
        html += "h1{color:#ff6b6b;font-size:1.3em;}";
        html += ".btn{display:block;width:100%;padding:14px;margin:8px 0;border:none;border-radius:6px;font-size:1em;font-family:monospace;cursor:pointer;}";
        html += ".on{background:#e63946;color:#fff;} .off{background:#2d6a4f;color:#fff;}";
        html += ".test{background:#0288d1;color:#fff;} .managed{background:#f4a261;color:#000;}";
        html += ".read{background:#6c757d;color:#fff;}";
        html += "#result{margin-top:16px;padding:12px;background:#16213e;border:1px solid #444;border-radius:6px;min-height:40px;white-space:pre-wrap;}";
        html += ".warn{color:#ff6b6b;font-size:0.85em;margin:12px 0;}";
        html += "</style></head><body>";
        html += "<h1>RELAY DEBUG TEST</h1>";
        html += "<p class='warn'>Pin " + String(relayPin) + " | ACTIVE HIGH (HIGH=ON, LOW=OFF)</p>";
        html += "<button class='btn on' onclick=\"send('relay_on')\">1. RELAY ON (raw GPIO HIGH)</button>";
        html += "<button class='btn off' onclick=\"send('relay_off')\">2. RELAY OFF (raw GPIO LOW)</button>";
        html += "<button class='btn test' onclick=\"send('timed_test')\">3. RAW 3s TEST (blocking delay)</button>";
        html += "<button class='btn managed' onclick=\"send('managed_test')\">4. MANAGED 3s TEST (forceStartPump)</button>";
        html += "<button class='btn read' onclick=\"send('read_pin')\">5. READ PIN STATE</button>";
        html += "<div id='result'>Press a button to test...</div>";
        html += "<script>";
        html += "function send(a){document.getElementById('result').textContent='Sending '+a+'...';";
        html += "fetch('/debug?action='+a).then(r=>r.json()).then(d=>{";
        html += "document.getElementById('result').textContent=d.result;";
        html += "}).catch(e=>{document.getElementById('result').textContent='Error: '+e;});}";
        html += "</script></body></html>";
        server.send(200, "text/html", html);
        return;
    }

    // JSON response for button actions
    String json = "{\"action\":\"" + action + "\",\"result\":\"" + result + "\"}";
    server.send(200, "application/json", json);
}

// Auto-water toggle endpoint
void handleAutoWater() {
    if (server.hasArg("enabled")) {
        String val = server.arg("enabled");
        autoWaterEnabled = (val == "1" || val == "true");
        Serial.printf("Auto-water set to: %s\n", autoWaterEnabled ? "ON" : "OFF");
    }
    String response = "{\"auto_water\":" + String(autoWaterEnabled ? "true" : "false") + "}";
    server.send(200, "application/json", response);
}
