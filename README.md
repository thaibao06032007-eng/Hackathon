<div align="center">

# 🌱 Smart Plant Monitor

### Intelligent Plant Monitoring & Auto-Watering System with ESP32 + AI

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-3.0-lightgrey.svg)](https://flask.palletsprojects.com)
[![ESP32](https://img.shields.io/badge/ESP32-Supported-orange.svg)](https://www.espressif.com)
[![Groq AI](https://img.shields.io/badge/AI-Groq%20LLaMA-purple.svg)](https://groq.com)

<br/>

<img src="https://img.icons8.com/color/200/potted-plant.png" alt="Plant Monitor" width="150"/>

**Real-time monitoring of temperature, soil & air humidity.**  
**Auto-waters plants when soil is dry. AI-powered plant identification.**

[Features](#-features) · [Tech Stack](#-tech-stack) · [Installation](#-installation) · [Usage](#-usage) · [API](#-api-endpoints) · [Dev Log](#-development-log)

</div>

---

## 📸 Overview

**Smart Plant Monitor** combines ESP32 hardware with a Flask web application to create a complete plant care system — from sensor monitoring and pump control to AI-powered weather-based watering forecasts.

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📊 **Real-time Dashboard** | Displays temperature, soil moisture, and air humidity from ESP32 sensors |
| 💧 **Auto Watering** | ESP32 automatically activates the water pump when soil is too dry |
| 🤖 **AI Plant Identification** | Take a photo → AI (Groq LLaMA Vision) identifies species & suggests ideal conditions |
| 🌤️ **Watering Forecast** | Combines 7-day weather data (Open-Meteo) + plant characteristics → smart watering schedule |
| 💬 **Chat Notifications** | Your plant "talks" to you — alerts for dry soil, high temp, overwatering with friendly messages |
| 📈 **Data History** | Historical charts of sensor data & watering events |
| 🔍 **Care Lookup** | AI looks up care instructions for each species (watering frequency, sunlight, etc.) |
| 📱 **Responsive Web** | Mobile & desktop friendly web interface |

## 🛠 Tech Stack

### Software
| Component | Technology |
|-----------|------------|
| Backend | **Python 3.10+**, Flask 3.0 |
| Database | SQLite |
| AI/LLM | Groq API (LLaMA 3.3 70B + LLaMA 4 Scout Vision) |
| Weather | Open-Meteo API (free, no key required) |
| Frontend | HTML/CSS/JS, Material Icons |

### Hardware
| Component | Function |
|-----------|----------|
| **ESP32 Dev Module** | Main microcontroller with WiFi connectivity |
| **DHT11** | Measures temperature & air humidity |
| **Soil Moisture Sensor** | Measures soil moisture (Analog) |
| **Relay Module** | Controls water pump (Active LOW) |
| **Mini Water Pump** | Automated plant watering |

### ESP32 Wiring Diagram

```
ESP32 Pin    →  Component
─────────────────────────
GPIO 4       →  DHT11 Signal
GPIO 2       →  DHT11 VCC (Power Hack)
GPIO 15      →  DHT11 GND (Power Hack)
GPIO 34      →  Soil Moisture (Analog)
GPIO 5       →  Relay IN (Active LOW)
```

## 🚀 Installation

### 1. Clone the repository

```bash
git clone https://github.com/thaibao06032007-eng/Hackathon.git
cd Hackathon
```

### 2. Set up Python environment & install dependencies

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS/Linux
source .venv/bin/activate

pip install -r HACKATHON2026/requirements.txt
```

### 3. Configure API Key

Create file `HACKATHON2026/.env`:

```env
GROQ_API_KEY=your_groq_api_key_here
```

> 💡 Get a free API key at [console.groq.com](https://console.groq.com)

### 4. Run the server

```bash
cd HACKATHON2026
python app.py
```

The server will start at `http://localhost:5000`

### 5. Upload ESP32 firmware

1. Open `HACKATHON2026/arduino/esp32_plant_monitor.ino` in **Arduino IDE**
2. Update WiFi credentials & Server URL in the code:
   ```cpp
   const char* ssid = "Your_WiFi_Name";
   const char* password = "Your_WiFi_Password";
   const char* SERVER_URL = "http://YOUR_PC_IP:5000/api/sensor-data";
   ```
3. Install libraries: **ArduinoJson**, **DHT sensor library (Adafruit)**, **Adafruit Unified Sensor**
4. Select Board: **ESP32 Dev Module** → Upload

## 📖 Usage

| Page | URL | Function |
|------|-----|----------|
| Dashboard | `/` | Overview of all plants |
| Plant Detail | `/plant/<id>` | Detailed data + chat + pump control |
| History | `/history` | Sensor history charts |
| Forecast | `/forecast` | 7-day weather forecast & watering schedule |
| Settings | `/settings` | Add/edit/delete plants, configure ESP32 |
| AR View | `/ar` | View plant via camera (experimental) |

## 📡 API Endpoints

<details>
<summary><b>View all API endpoints (click to expand)</b></summary>

### Plants CRUD
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/plants` | Get all plants |
| `GET` | `/api/plants/<id>` | Get a single plant |
| `POST` | `/api/plants` | Create a new plant |
| `PUT` | `/api/plants/<id>` | Update a plant |
| `DELETE` | `/api/plants/<id>` | Delete a plant |

### Sensor & Control
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sensor-data` | ESP32 sends sensor readings |
| `GET` | `/api/plants/<id>/history` | Sensor data history |
| `GET` | `/api/plants/<id>/health` | Plant health score |
| `POST` | `/api/plants/<id>/water` | Trigger manual watering |
| `POST` | `/api/plants/<id>/auto-water` | Toggle auto-watering |

### AI & Weather
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/identify-plant` | Identify plant from image (AI Vision) |
| `GET` | `/api/plant-care/<id>` | Look up plant care info (AI) |
| `GET` | `/api/forecast` | Weather forecast + watering plan |
| `GET` | `/api/geocode` | Location search |

### ESP32
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/esp32/register` | ESP32 registers its IP |
| `GET` | `/api/esp32/discover` | List connected ESP32 devices |

</details>

## 📁 Project Structure

```
HACKATHON2026/
├── app.py                 # Main Flask server
├── config.py              # Configuration (API keys, DB path)
├── database.py            # SQLite CRUD operations
├── requirements.txt       # Python dependencies
├── .env                   # API keys (not pushed to git)
├── arduino/
│   ├── esp32_plant_monitor.ino   # Arduino IDE code
│   ├── platformio.ini            # PlatformIO config
│   └── src/main.cpp              # PlatformIO code
├── static/
│   ├── css/style.css      # Stylesheet
│   └── js/                # Frontend JavaScript
│       ├── api.js         # API helper
│       ├── dashboard.js   # Dashboard logic
│       ├── plant.js       # Plant detail + chat
│       ├── forecast.js    # Weather forecast
│       ├── history.js     # History charts
│       ├── settings.js    # Settings form
│       └── ar.js          # AR view
└── templates/             # Jinja2 HTML templates
    ├── base.html
    ├── dashboard.html
    ├── plant.html
    ├── forecast.html
    ├── history.html
    ├── settings.html
    └── ar.html
```

## 📜 Development Log

This project was built incrementally with a clear commit history. You can verify the development process yourself:

**View full commit history on GitHub:**  
👉 [**Commit History**](https://github.com/thaibao06032007-eng/Hackathon/commits/main)

Or clone the repo and run:

```bash
git log --oneline --graph --all
```

<details>
<summary><b>Commit timeline (click to expand)</b></summary>

| # | Commit | Description |
|---|--------|-------------|
| 1 | `1fe1491` | Initial commit |
| 2 | `d09f3b5` | First project upload — Flask server, database, ESP32 code, templates |
| 3 | `a4c6752` | Add Forecast tab, AR View rewrite with WebXR, compass auto-detect |
| 4 | `ce384ce` | Merge Arduino features: auto-water toggle, water duration, ESP32 Ticker safety |
| 5 | `12adeea` | Redesign Forecast tab UI: hero header, search bar, UV/heat badges, watering cards |
| 6 | `07e72fd` | Replace History tab with chat-style Notifications: messenger UI, plant chat API |
| 7 | `27dc45a` | Update requirements.txt |
| 8 | `62c9b8b` | Clean up requirements.txt |
| 9 | `62726ad` | Remove light sensor, add animated health tree, custom water time, ESP32 auto-discover |
| 10 | `8bae086` | Demo data for notifications, hero padding fix, AR navbar sync |
| 11 | `4621eda` | UI improvements, Gemini API plant identification & logic |
| 12 | `044882d` | Redesign dashboard UI: hero header, stats row, new plant cards |
| 13 | `307c0c7` | Merge team updates, resolve cache conflict |
| 14 | `5132f19` | Add air humidity sensor support (DHT11) across full stack |
| 15 | `a885f72` | Restore ESP32 discover button, fix health tree centering |
| 16 | `ea053b8` | Fix air humidity icon and sensor alignment |
| 17 | `4b416d0` | Merge team updates and complete air humidity integration |
| 18 | `ffae42e` | Add .gitignore, move API key to .env for security |

</details>

> 💡 **Tip:** Each commit represents a real development milestone. You can `git checkout <hash>` to view the project at any point in time, or use `git diff <hash1> <hash2>` to see exactly what changed between any two commits.

## 🤝 Contributing

1. Fork the repo
2. Create a branch: `git checkout -b feature/feature-name`
3. Commit: `git commit -m "Add: new feature"`
4. Push: `git push origin feature/feature-name`
5. Open a Pull Request

## 📄 License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for more information.

---

<div align="center">

**Hackathon 2026** · Made with 💚 by [Bao Dang, Derin Anderson, Jacob Weigand, Thang Vo](https://github.com/thaibao06032007-eng)

</div>
