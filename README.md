<div align="center">

# 🌱 Smart Plant Monitor

### Hệ thống giám sát & tưới cây thông minh với ESP32 + AI

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-3.0-lightgrey.svg)](https://flask.palletsprojects.com)
[![ESP32](https://img.shields.io/badge/ESP32-Supported-orange.svg)](https://www.espressif.com)
[![Groq AI](https://img.shields.io/badge/AI-Groq%20LLaMA-purple.svg)](https://groq.com)

<br/>

<img src="https://img.icons8.com/color/200/potted-plant.png" alt="Plant Monitor" width="150"/>

**Theo dõi nhiệt độ, độ ẩm đất & không khí theo thời gian thực.**  
**Tự động tưới cây khi đất khô. Nhận diện cây bằng AI.**

[Tính năng](#-tính-năng) · [Công nghệ](#-công-nghệ) · [Cài đặt](#-cài-đặt) · [Sử dụng](#-sử-dụng) · [API](#-api-endpoints)

</div>

---

## 📸 Tổng quan

Dự án **Smart Plant Monitor** kết hợp phần cứng ESP32 với ứng dụng web Flask để tạo ra hệ thống chăm sóc cây trồng hoàn chỉnh — từ giám sát cảm biến, điều khiển máy bơm, đến dự báo tưới nước dựa trên thời tiết và trí tuệ nhân tạo.

## ✨ Tính năng

| Tính năng | Mô tả |
|-----------|--------|
| 📊 **Dashboard thời gian thực** | Hiển thị nhiệt độ, độ ẩm đất, độ ẩm không khí từ cảm biến ESP32 |
| 💧 **Tự động tưới cây** | ESP32 tự kích hoạt bơm nước khi đất quá khô |
| 🤖 **Nhận diện cây bằng AI** | Chụp ảnh → AI (Groq LLaMA Vision) nhận diện loài & đề xuất điều kiện lý tưởng |
| 🌤️ **Dự báo tưới nước** | Kết hợp dữ liệu thời tiết 7 ngày (Open-Meteo) + đặc tính cây → lịch tưới thông minh |
| 💬 **Chat thông báo** | Cây "nói chuyện" với bạn — cảnh báo khô, nóng, quá ẩm bằng tin nhắn dễ thương |
| 📈 **Lịch sử dữ liệu** | Biểu đồ lịch sử cảm biến & sự kiện tưới nước |
| 🔍 **Tra cứu chăm sóc** | AI tra cứu cách chăm sóc từng loài cây (tần suất tưới, ánh sáng, ...) |
| 📱 **Responsive Web** | Giao diện web tương thích điện thoại & máy tính |

## 🛠 Công nghệ

### Phần mềm
| Thành phần | Công nghệ |
|------------|-----------|
| Backend | **Python 3.10+**, Flask 3.0 |
| Database | SQLite |
| AI/LLM | Groq API (LLaMA 3.3 70B + LLaMA 4 Scout Vision) |
| Thời tiết | Open-Meteo API (miễn phí, không cần key) |
| Frontend | HTML/CSS/JS, Material Icons |

### Phần cứng
| Linh kiện | Chức năng |
|-----------|-----------|
| **ESP32 Dev Module** | Vi điều khiển chính, kết nối WiFi |
| **DHT11** | Đo nhiệt đô & độ ẩm không khí |
| **Soil Moisture Sensor** | Đo độ ẩm đất (Analog) |
| **Relay Module** | Điều khiển bơm nước (Active LOW) |
| **Mini Water Pump** | Tưới cây tự động |

### Sơ đồ kết nối ESP32

```
ESP32 Pin    →  Linh kiện
─────────────────────────
GPIO 4       →  DHT11 Signal
GPIO 2       →  DHT11 VCC (Power Hack)
GPIO 15      →  DHT11 GND (Power Hack)
GPIO 34      →  Soil Moisture (Analog)
GPIO 5       →  Relay IN (Active LOW)
```

## 🚀 Cài đặt

### 1. Clone repository

```bash
git clone https://github.com/thaibao06032007-eng/Hackathon.git
cd Hackathon
```

### 2. Tạo môi trường Python & cài dependencies

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS/Linux
source .venv/bin/activate

pip install -r HACKATHON2026/requirements.txt
```

### 3. Cấu hình API Key

Tạo file `HACKATHON2026/.env`:

```env
GROQ_API_KEY=your_groq_api_key_here
```

> 💡 Lấy API key miễn phí tại [console.groq.com](https://console.groq.com)

### 4. Chạy server

```bash
cd HACKATHON2026
python app.py
```

Server sẽ chạy tại `http://localhost:5000`

### 5. Upload code ESP32

1. Mở `HACKATHON2026/arduino/esp32_plant_monitor.ino` bằng **Arduino IDE**
2. Sửa WiFi credentials & Server URL trong code:
   ```cpp
   const char* ssid = "Your_WiFi_Name";
   const char* password = "Your_WiFi_Password";
   const char* SERVER_URL = "http://YOUR_PC_IP:5000/api/sensor-data";
   ```
3. Cài thư viện: **ArduinoJson**, **DHT sensor library (Adafruit)**, **Adafruit Unified Sensor**
4. Chọn Board: **ESP32 Dev Module** → Upload

## 📖 Sử dụng

| Trang | URL | Chức năng |
|-------|-----|-----------|
| Dashboard | `/` | Tổng quan tất cả cây |
| Chi tiết cây | `/plant/<id>` | Dữ liệu chi tiết + chat + điều khiển bơm |
| Lịch sử | `/history` | Biểu đồ lịch sử cảm biến |
| Dự báo | `/forecast` | Dự báo thời tiết & lịch tưới 7 ngày |
| Cài đặt | `/settings` | Thêm/sửa/xóa cây, cấu hình ESP32 |
| AR View | `/ar` | Xem cây qua camera (thử nghiệm) |

## 📡 API Endpoints

<details>
<summary><b>Xem tất cả API (click để mở)</b></summary>

### Plants CRUD
| Method | Endpoint | Mô tả |
|--------|----------|--------|
| `GET` | `/api/plants` | Lấy danh sách tất cả cây |
| `GET` | `/api/plants/<id>` | Lấy thông tin 1 cây |
| `POST` | `/api/plants` | Thêm cây mới |
| `PUT` | `/api/plants/<id>` | Cập nhật cây |
| `DELETE` | `/api/plants/<id>` | Xóa cây |

### Sensor & Control
| Method | Endpoint | Mô tả |
|--------|----------|--------|
| `POST` | `/api/sensor-data` | ESP32 gửi dữ liệu cảm biến |
| `GET` | `/api/plants/<id>/history` | Lịch sử cảm biến |
| `GET` | `/api/plants/<id>/health` | Điểm sức khỏe cây |
| `POST` | `/api/plants/<id>/water` | Điều khiển tưới nước |
| `POST` | `/api/plants/<id>/auto-water` | Bật/tắt tưới tự động |

### AI & Weather
| Method | Endpoint | Mô tả |
|--------|----------|--------|
| `POST` | `/api/identify-plant` | Nhận diện cây qua ảnh (AI Vision) |
| `GET` | `/api/plant-care/<id>` | Tra cứu chăm sóc cây (AI) |
| `GET` | `/api/forecast` | Dự báo thời tiết + lịch tưới |
| `GET` | `/api/geocode` | Tìm kiếm vị trí |

### ESP32
| Method | Endpoint | Mô tả |
|--------|----------|--------|
| `POST` | `/api/esp32/register` | ESP32 đăng ký IP |
| `GET` | `/api/esp32/discover` | Danh sách ESP32 đã kết nối |

</details>

## 📁 Cấu trúc dự án

```
HACKATHON2026/
├── app.py                 # Flask server chính
├── config.py              # Cấu hình (API keys, DB path)
├── database.py            # SQLite CRUD operations
├── requirements.txt       # Python dependencies
├── .env                   # API keys (không push lên git)
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

## 🤝 Đóng góp

1. Fork repo
2. Tạo branch: `git checkout -b feature/ten-tinh-nang`
3. Commit: `git commit -m "Add: tính năng mới"`
4. Push: `git push origin feature/ten-tinh-nang`
5. Tạo Pull Request

## 📄 License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for more information.

---

<div align="center">

**Hackathon 2026** · Made with 💚 by [Bao Dang](https://github.com/thaibao06032007-eng)

</div>
