from flask import Flask, render_template, request, jsonify
import requests as http_requests
import database as db
from config import is_valid_local_ip, PERENUAL_API_KEY
import threading
import time
import random
import math
from datetime import datetime, timedelta

app = Flask(__name__)

# Initialize database on startup
db.init_db()


# ==================== Background ESP32 Polling ====================

def poll_esp32_sensors():
    """Background thread that polls all ESP32 devices for sensor data."""
    while True:
        time.sleep(30)  # Poll every 30 seconds
        try:
            plants = db.get_all_plants()
            for plant in plants:
                ip = plant.get('esp32_ip')
                if not ip or not is_valid_local_ip(ip):
                    continue
                try:
                    resp = http_requests.get(f"http://{ip}/status", timeout=5)
                    if resp.status_code == 200:
                        data = resp.json()
                        db.add_sensor_data(
                            plant['id'],
                            data.get('soil_humidity'),
                            data.get('temperature'),
                            data.get('light_level', 0)
                        )
                except Exception:
                    pass  # ESP32 unreachable, skip this cycle
        except Exception:
            pass  # DB error, retry next cycle

polling_thread = threading.Thread(target=poll_esp32_sensors, daemon=True)
polling_thread.start()


# ==================== Page Routes ====================

@app.route('/')
def dashboard():
    return render_template('dashboard.html')


@app.route('/plant/<int:plant_id>')
def plant_detail(plant_id):
    return render_template('plant.html', plant_id=plant_id)


@app.route('/history')
def history():
    return render_template('history.html')


@app.route('/settings')
def settings():
    return render_template('settings.html')


@app.route('/ar')
def ar_view():
    return render_template('ar.html')


@app.route('/forecast')
def forecast():
    return render_template('forecast.html')


# ==================== API: Plants CRUD ====================

@app.route('/api/plants', methods=['GET'])
def api_get_plants():
    plants = db.get_all_plants()
    for plant in plants:
        plant['latest_data'] = db.get_latest_sensor_data(plant['id'])
        plant['health'] = db.predict_health(plant['id'])
    return jsonify(plants)


@app.route('/api/plants/<int:plant_id>', methods=['GET'])
def api_get_plant(plant_id):
    plant = db.get_plant(plant_id)
    if not plant:
        return jsonify({'error': 'Plant not found'}), 404
    plant['latest_data'] = db.get_latest_sensor_data(plant_id)
    plant['health'] = db.predict_health(plant_id)
    return jsonify(plant)


@app.route('/api/plants', methods=['POST'])
def api_create_plant():
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({'error': 'Plant name is required'}), 400
    plant_id = db.create_plant(data)
    return jsonify({'id': plant_id, 'message': 'Plant created'}), 201


@app.route('/api/plants/<int:plant_id>', methods=['PUT'])
def api_update_plant(plant_id):
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({'error': 'Plant name is required'}), 400
    db.update_plant(plant_id, data)
    return jsonify({'message': 'Plant updated'})


@app.route('/api/plants/<int:plant_id>', methods=['DELETE'])
def api_delete_plant(plant_id):
    db.delete_plant(plant_id)
    return jsonify({'message': 'Plant deleted'})


# ==================== API: Sensor Data ====================

@app.route('/api/sensor-data', methods=['POST'])
def api_receive_sensor_data():
    data = request.get_json()
    if not data or not data.get('plant_id'):
        return jsonify({'error': 'plant_id is required'}), 400

    plant_id = int(data['plant_id'])
    plant = db.get_plant(plant_id)
    if not plant:
        return jsonify({'error': 'Plant not found'}), 404

    db.add_sensor_data(
        plant_id,
        data.get('soil_humidity'),
        data.get('temperature'),
        data.get('light_level')
    )
    return jsonify({'message': 'Data recorded'}), 201


@app.route('/api/plants/<int:plant_id>/history', methods=['GET'])
def api_get_history(plant_id):
    hours = request.args.get('hours', 24, type=int)
    hours = max(1, min(8760, hours))  # Clamp between 1h and 1 year
    sensor_data = db.get_sensor_history(plant_id, hours)
    water_events = db.get_water_history(plant_id, hours)
    return jsonify({
        'sensor_data': sensor_data,
        'water_events': water_events
    })


# ==================== API: Health Prediction ====================

@app.route('/api/plants/<int:plant_id>/health', methods=['GET'])
def api_get_health(plant_id):
    health = db.predict_health(plant_id)
    if not health:
        return jsonify({'error': 'Plant not found'}), 404
    return jsonify(health)


# ==================== API: Water Pump Control ====================

@app.route('/api/plants/<int:plant_id>/water', methods=['POST'])
def api_water_plant(plant_id):
    plant = db.get_plant(plant_id)
    if not plant:
        return jsonify({'error': 'Plant not found'}), 404

    if not plant['esp32_ip'] or not is_valid_local_ip(plant['esp32_ip']):
        return jsonify({'error': 'No valid ESP32 IP configured for this plant'}), 400

    data = request.get_json(silent=True) or {}
    duration = data.get('duration', plant['water_duration'])
    duration = max(1, min(60, int(duration)))  # Safety: 1-60 seconds

    try:
        resp = http_requests.get(
            f"http://{plant['esp32_ip']}/water",
            params={'duration': duration},
            timeout=10
        )
        if resp.status_code == 200:
            db.add_water_event(plant_id, duration, 'manual')
            return jsonify({'message': f'Watering for {duration} seconds'})
        else:
            return jsonify({'error': 'ESP32 returned an error'}), 502
    except http_requests.exceptions.RequestException as e:
        return jsonify({'error': f'Could not reach ESP32: {str(e)}'}), 503


# ==================== API: Auto-Water Toggle ====================

@app.route('/api/plants/<int:plant_id>/auto-water', methods=['POST'])
def api_auto_water(plant_id):
    plant = db.get_plant(plant_id)
    if not plant:
        return jsonify({'error': 'Plant not found'}), 404

    if not plant['esp32_ip'] or not is_valid_local_ip(plant['esp32_ip']):
        return jsonify({'error': 'No valid ESP32 IP configured'}), 400

    data = request.get_json(silent=True) or {}
    enabled = data.get('enabled', False)

    try:
        resp = http_requests.get(
            f"http://{plant['esp32_ip']}/auto-water",
            params={'enabled': 'true' if enabled else 'false'},
            timeout=5
        )
        if resp.status_code == 200:
            return jsonify(resp.json())
        else:
            return jsonify({'error': 'ESP32 returned an error'}), 502
    except http_requests.exceptions.RequestException as e:
        return jsonify({'error': f'Could not reach ESP32: {str(e)}'}), 503


# ==================== API: Chat Notifications ====================

PLANT_CHAT_MESSAGES = {
    'soil_dry_critical': [
        "Help! My soil is SO dry right now ({value:.0f}%)... I'm really thirsty! Can you water me please? 🥺",
        "Owner, my roots are parched! Soil is only at {value:.0f}%. I need water urgently! 💧",
        "SOS! Dry soil alert at {value:.0f}%! A good drink would save my day 🌵",
    ],
    'soil_dry': [
        "Hey, my soil is getting a bit dry ({value:.0f}%). A little water would be lovely! 😊",
        "Just a friendly reminder — my soil is at {value:.0f}%. Getting thirsty over here! 🙂",
        "My feet are drying out ({value:.0f}% humidity). Mind giving me a splash? 💦",
    ],
    'soil_wet': [
        "Whoa, that's a lot of water! My soil is at {value:.0f}%. Let me drain a bit first 💧",
        "I'm swimming here! Soil at {value:.0f}%. Maybe hold off on watering for now 🏊",
        "Too much water alert! {value:.0f}% humidity — I might get root rot! 😰",
    ],
    'soil_good': [
        "My soil feels perfect right now at {value:.0f}%! Thanks for taking great care of me 🌱",
        "Soil humidity is just right ({value:.0f}%). I'm one happy plant! 😄",
    ],
    'temp_hot': [
        "It's {value:.0f}°C — way too hot! Please move me somewhere cooler or give me shade 🔥",
        "I'm overheating at {value:.0f}°C! Make sure I'm not in direct sun ☀️🥵",
        "Temperature hit {value:.0f}°C! This is scorching! Help me cool down! 🌡️",
    ],
    'temp_cold': [
        "Brrr! It's {value:.0f}°C — that's quite cold for me. Can I go somewhere warmer? 🥶",
        "I'm shivering at {value:.0f}°C! Please keep me away from drafts ❄️",
    ],
    'temp_good': [
        "Temperature is a comfy {value:.0f}°C. I'm feeling great! 🌤️",
    ],
    'light_low': [
        "It's pretty dark where I am ({value:.0f} lux). I could use more sunshine! 🌑",
        "Not enough light ({value:.0f} lux)! Can you move me closer to a window? 🪟",
    ],
    'light_high': [
        "The light is super intense ({value:.0f} lux)! A little shade would be nice 😎",
        "Too bright! {value:.0f} lux is scorching my leaves. Sunglasses needed! 🕶️",
    ],
    'light_good': [
        "Lighting is perfect at {value:.0f} lux! Photosynthesis mode ON ☀️🌿",
    ],
    'watered_recently': [
        "Thanks for watering me! That {duration}s drink was refreshing 💙",
        "Ahh, {duration}s of water — just what I needed! You're the best owner! 🌷",
    ],
    'health_critical': [
        "I'm not doing well at all... My health score is only {score}. Please check on me! 😢",
        "CRITICAL: Health at {score}/100. I need urgent attention! 🚨",
    ],
    'health_attention': [
        "I'm hanging in there, but my health score is {score}. Could use some help 🤔",
        "Not my best day — score {score}/100. Let's fix some issues together 🩹",
    ],
    'health_good': [
        "I'm feeling amazing! Health score: {score}/100! Keep it up! 🌟",
        "Thriving over here! Score {score}. Life is good 🌻",
    ],
    'weather_rain': [
        "Looks like rain today ({precip:.1f}mm)! No need to water me — nature's got it covered ☔",
        "Rain is coming ({precip:.1f}mm)! Save some water — the sky will handle it 🌧️",
    ],
    'weather_hot_day': [
        "Weather forecast says {temp:.0f}°C today — that's hot! Extra water would help 🥤",
    ],
    'weather_uv_high': [
        "UV index is {uv:.0f} today — very strong! Make sure I have some shade 🧴",
    ],
    'greeting_morning': [
        "Good morning! Ready for a new day of growing 🌅",
        "Rise and shine! Let's make today a great growing day! ☀️",
    ],
    'greeting_night': [
        "Good night! I'll be resting my leaves now 🌙",
    ],
}


def generate_chat_messages(plant, sensor_data, health, weather_today=None, water_events=None):
    """Generate natural-language chat messages from sensor data."""
    messages = []
    now = datetime.now()
    plant_name = plant.get('name', 'My Plant')

    def pick(key, **kwargs):
        templates = PLANT_CHAT_MESSAGES.get(key, [])
        if not templates:
            return None
        msg = random.choice(templates).format(**kwargs)
        return msg

    # Time-based greeting
    hour = now.hour
    if 5 <= hour < 12:
        messages.append({
            'type': 'greeting', 'priority': 0,
            'text': pick('greeting_morning'),
            'time': now.strftime('%H:%M'),
            'icon': 'wb_sunny'
        })
    elif hour >= 22 or hour < 5:
        messages.append({
            'type': 'greeting', 'priority': 0,
            'text': pick('greeting_night'),
            'time': now.strftime('%H:%M'),
            'icon': 'nightlight'
        })

    if sensor_data:
        ts = sensor_data.get('recorded_at', now.strftime('%Y-%m-%d %H:%M:%S'))
        try:
            data_time = datetime.strptime(ts, '%Y-%m-%d %H:%M:%S')
        except (ValueError, TypeError):
            data_time = now
        time_str = data_time.strftime('%H:%M')

        # Soil humidity
        soil = sensor_data.get('soil_humidity')
        if soil is not None:
            soil_min = plant.get('ideal_soil_humidity_min', 30)
            soil_max = plant.get('ideal_soil_humidity_max', 70)
            if soil < soil_min * 0.5:
                messages.append({'type': 'alert', 'priority': 3, 'text': pick('soil_dry_critical', value=soil), 'time': time_str, 'icon': 'water_drop'})
            elif soil < soil_min:
                messages.append({'type': 'warning', 'priority': 2, 'text': pick('soil_dry', value=soil), 'time': time_str, 'icon': 'water_drop'})
            elif soil > soil_max:
                messages.append({'type': 'warning', 'priority': 2, 'text': pick('soil_wet', value=soil), 'time': time_str, 'icon': 'water_drop'})
            else:
                messages.append({'type': 'good', 'priority': 0, 'text': pick('soil_good', value=soil), 'time': time_str, 'icon': 'grass'})

        # Temperature
        temp = sensor_data.get('temperature')
        if temp is not None:
            temp_min = plant.get('ideal_temperature_min', 18)
            temp_max = plant.get('ideal_temperature_max', 30)
            if temp > temp_max:
                messages.append({'type': 'warning', 'priority': 2, 'text': pick('temp_hot', value=temp), 'time': time_str, 'icon': 'thermostat'})
            elif temp < temp_min:
                messages.append({'type': 'warning', 'priority': 2, 'text': pick('temp_cold', value=temp), 'time': time_str, 'icon': 'thermostat'})
            else:
                messages.append({'type': 'good', 'priority': 0, 'text': pick('temp_good', value=temp), 'time': time_str, 'icon': 'thermostat'})

        # Light
        light = sensor_data.get('light_level')
        if light is not None:
            light_min = plant.get('ideal_light_min', 200)
            light_max = plant.get('ideal_light_max', 800)
            if light < light_min:
                messages.append({'type': 'warning', 'priority': 1, 'text': pick('light_low', value=light), 'time': time_str, 'icon': 'light_mode'})
            elif light > light_max:
                messages.append({'type': 'warning', 'priority': 1, 'text': pick('light_high', value=light), 'time': time_str, 'icon': 'light_mode'})
            else:
                messages.append({'type': 'good', 'priority': 0, 'text': pick('light_good', value=light), 'time': time_str, 'icon': 'light_mode'})

    # Health score
    if health and health.get('score') is not None:
        score = health['score']
        if score < 40:
            messages.append({'type': 'alert', 'priority': 3, 'text': pick('health_critical', score=score), 'time': now.strftime('%H:%M'), 'icon': 'favorite'})
        elif score < 70:
            messages.append({'type': 'warning', 'priority': 2, 'text': pick('health_attention', score=score), 'time': now.strftime('%H:%M'), 'icon': 'favorite'})
        else:
            messages.append({'type': 'good', 'priority': 0, 'text': pick('health_good', score=score), 'time': now.strftime('%H:%M'), 'icon': 'favorite'})

    # Recent watering events
    if water_events:
        latest_water = water_events[0]
        messages.append({
            'type': 'info', 'priority': 1,
            'text': pick('watered_recently', duration=latest_water['duration_seconds']),
            'time': latest_water.get('recorded_at', '')[-8:-3] if latest_water.get('recorded_at') else now.strftime('%H:%M'),
            'icon': 'opacity'
        })

    # Weather-based messages
    if weather_today:
        precip = weather_today.get('precipitation', 0) or 0
        temp_max = weather_today.get('temp_max')
        uv = weather_today.get('uv_index', 0) or 0

        if precip > 3:
            messages.append({'type': 'info', 'priority': 1, 'text': pick('weather_rain', precip=precip), 'time': now.strftime('%H:%M'), 'icon': 'cloud'})
        if temp_max and temp_max > 35:
            messages.append({'type': 'warning', 'priority': 2, 'text': pick('weather_hot_day', temp=temp_max), 'time': now.strftime('%H:%M'), 'icon': 'wb_sunny'})
        if uv > 8:
            messages.append({'type': 'warning', 'priority': 2, 'text': pick('weather_uv_high', uv=uv), 'time': now.strftime('%H:%M'), 'icon': 'wb_sunny'})

    # Sort: alerts first, then warnings, then good
    messages.sort(key=lambda m: -m['priority'])

    return messages


def _generate_demo_sensor_history():
    """Generate realistic demo sensor data for display when no Arduino is connected."""
    now = datetime.now()
    history = []
    for i in range(24, -1, -1):
        t = now - timedelta(minutes=i * 15)
        hour = t.hour + t.minute / 60.0
        # Soil humidity: fluctuates 40-65%, dips when "watered"
        base_soil = 52 + 10 * math.sin(hour / 6 * math.pi)
        soil = round(base_soil + random.uniform(-3, 3), 1)
        # Temperature: cooler at night, warmer midday
        base_temp = 23 + 5 * math.sin((hour - 6) / 12 * math.pi)
        temp = round(base_temp + random.uniform(-1, 1), 1)
        # Light: low at night, peaks midday
        if 6 <= t.hour <= 19:
            base_light = 300 + 400 * math.sin((hour - 6) / 13 * math.pi)
        else:
            base_light = random.uniform(5, 30)
        light = round(base_light + random.uniform(-20, 20), 0)
        history.append({
            'recorded_at': t.strftime('%Y-%m-%d %H:%M:%S'),
            'soil_humidity': max(0, min(100, soil)),
            'temperature': max(5, min(45, temp)),
            'light_level': max(0, light)
        })
    return history


def _generate_demo_water_events():
    """Generate demo watering events for display."""
    now = datetime.now()
    events = []
    triggers = ['auto', 'manual', 'auto', 'schedule', 'auto']
    for i in range(5):
        t = now - timedelta(hours=random.randint(2 + i * 5, 4 + i * 6))
        events.append({
            'recorded_at': t.strftime('%Y-%m-%d %H:%M:%S'),
            'duration_seconds': random.choice([3, 5, 5, 8, 10]),
            'triggered_by': triggers[i]
        })
    return events


@app.route('/api/plants/<int:plant_id>/chat', methods=['GET'])
def api_plant_chat(plant_id):
    """Generate chat-style notification messages for a plant."""
    plant = db.get_plant(plant_id)
    if not plant:
        return jsonify({'error': 'Plant not found'}), 404

    sensor_data = db.get_latest_sensor_data(plant_id)
    health = db.predict_health(plant_id)
    water_events = db.get_water_history(plant_id, hours=24)
    sensor_history = db.get_sensor_history(plant_id, hours=6)

    # Use demo data when no real data is available
    use_demo = not sensor_history
    if use_demo:
        sensor_history = _generate_demo_sensor_history()
    if not water_events:
        water_events = _generate_demo_water_events()
    if not sensor_data and sensor_history:
        sensor_data = sensor_history[-1]
    if not health:
        health = {'score': random.randint(65, 92), 'status': 'healthy', 'label': 'Healthy'}

    # Try to get today's weather
    weather_today = None
    try:
        resp = http_requests.get(OPEN_METEO_URL, params={
            'latitude': 39.1031, 'longitude': -84.5120,
            'daily': 'temperature_2m_max,precipitation_sum,uv_index_max',
            'timezone': 'auto', 'forecast_days': 1
        }, timeout=5)
        if resp.status_code == 200:
            w = resp.json().get('daily', {})
            weather_today = {
                'temp_max': (w.get('temperature_2m_max') or [None])[0],
                'precipitation': (w.get('precipitation_sum') or [0])[0],
                'uv_index': (w.get('uv_index_max') or [0])[0],
            }
    except Exception:
        pass

    messages = generate_chat_messages(
        plant, sensor_data, health,
        weather_today=weather_today,
        water_events=water_events
    )

    return jsonify({
        'plant_id': plant_id,
        'plant_name': plant['name'],
        'species': plant.get('species', ''),
        'messages': messages,
        'sensor_data': sensor_data,
        'health': health,
        'sensor_history': sensor_history,
        'water_events': water_events[:5] if water_events else [],
        'demo_mode': use_demo
    })


# ==================== API: Forecast & Watering Plan ====================

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
PERENUAL_BASE_URL = "https://perenual.com/api/v2"


@app.route('/api/geocode', methods=['GET'])
def api_geocode():
    query = request.args.get('q', '').strip()
    if not query or len(query) < 2:
        return jsonify({'results': []})

    try:
        resp = http_requests.get(OPEN_METEO_GEOCODING_URL, params={
            'name': query,
            'count': 5,
            'language': 'en',
            'format': 'json'
        }, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        results = []
        for r in data.get('results', []):
            results.append({
                'name': r.get('name', ''),
                'country': r.get('country', ''),
                'admin1': r.get('admin1', ''),
                'latitude': r.get('latitude'),
                'longitude': r.get('longitude')
            })
        return jsonify({'results': results})
    except Exception as e:
        return jsonify({'results': [], 'error': str(e)})


@app.route('/api/plant-care/<int:plant_id>', methods=['GET'])
def api_get_plant_care(plant_id):
    """Fetch care info from Perenual API based on plant species."""
    plant = db.get_plant(plant_id)
    if not plant:
        return jsonify({'error': 'Plant not found'}), 404

    species = plant.get('species', '').strip()
    search_query = species if species else plant.get('name', '')
    if not search_query:
        return jsonify({'error': 'No species or name to search'}), 400

    # Step 1: Search for the species on Perenual
    try:
        resp = http_requests.get(f"{PERENUAL_BASE_URL}/species-list", params={
            'key': PERENUAL_API_KEY,
            'q': search_query
        }, timeout=10)
        resp.raise_for_status()
        search_data = resp.json()
    except Exception as e:
        return jsonify({'error': f'Perenual search failed: {str(e)}'}), 502

    results = search_data.get('data', [])
    if not results:
        return jsonify({'error': f'No plant found for "{search_query}"'}), 404

    # Pick the first match
    perenual_id = results[0]['id']

    # Step 2: Get detailed species info
    try:
        resp = http_requests.get(f"{PERENUAL_BASE_URL}/species/details/{perenual_id}", params={
            'key': PERENUAL_API_KEY
        }, timeout=10)
        resp.raise_for_status()
        details = resp.json()
    except Exception as e:
        return jsonify({'error': f'Perenual details failed: {str(e)}'}), 502

    # Extract care data
    watering_benchmark = details.get('watering_general_benchmark') or {}
    care_info = {
        'perenual_id': perenual_id,
        'common_name': details.get('common_name', ''),
        'scientific_name': details.get('scientific_name', []),
        'watering': details.get('watering', 'Average'),
        'watering_benchmark_value': watering_benchmark.get('value', ''),
        'watering_benchmark_unit': watering_benchmark.get('unit', ''),
        'sunlight': details.get('sunlight', []),
        'care_level': details.get('care_level', ''),
        'growth_rate': details.get('growth_rate', ''),
        'drought_tolerant': details.get('drought_tolerant', False),
        'indoor': details.get('indoor', False),
        'description': details.get('description', ''),
        'image': None
    }

    default_image = details.get('default_image')
    if default_image:
        care_info['image'] = (
            default_image.get('medium_url') or
            default_image.get('regular_url') or
            default_image.get('small_url')
        )

    return jsonify(care_info)


@app.route('/api/forecast', methods=['GET'])
def api_get_forecast():
    lat = request.args.get('lat', 39.1031, type=float)
    lon = request.args.get('lon', -84.5120, type=float)
    plant_id = request.args.get('plant_id', None, type=int)

    # Fetch weather
    try:
        resp = http_requests.get(OPEN_METEO_URL, params={
            'latitude': lat,
            'longitude': lon,
            'daily': 'temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max,weathercode',
            'hourly': 'temperature_2m,relative_humidity_2m,precipitation,shortwave_radiation',
            'timezone': 'auto',
            'forecast_days': 7
        }, timeout=10)
        resp.raise_for_status()
        weather = resp.json()
    except Exception as e:
        return jsonify({'error': f'Could not fetch weather data: {str(e)}'}), 502

    # Get target plant(s)
    if plant_id:
        plant = db.get_plant(plant_id)
        plants = [plant] if plant else []
    else:
        plants = db.get_all_plants()

    daily = weather.get('daily', {})
    dates = daily.get('time', [])
    temp_maxes = daily.get('temperature_2m_max', [])
    temp_mins = daily.get('temperature_2m_min', [])
    precip_sums = daily.get('precipitation_sum', [])
    uv_maxes = daily.get('uv_index_max', [])
    weather_codes = daily.get('weathercode', [])

    watering_plans = []
    for plant in plants:
        # Try to get Perenual care data for smarter planning
        care_data = None
        species = plant.get('species', '').strip()
        search_q = species if species else plant.get('name', '')
        if search_q:
            try:
                resp = http_requests.get(f"{PERENUAL_BASE_URL}/species-list", params={
                    'key': PERENUAL_API_KEY,
                    'q': search_q
                }, timeout=5)
                if resp.status_code == 200:
                    search_results = resp.json().get('data', [])
                    if search_results:
                        detail_resp = http_requests.get(
                            f"{PERENUAL_BASE_URL}/species/details/{search_results[0]['id']}",
                            params={'key': PERENUAL_API_KEY},
                            timeout=5
                        )
                        if detail_resp.status_code == 200:
                            care_data = detail_resp.json()
            except Exception:
                pass

        # Determine watering frequency from Perenual
        watering_level = 'Average'
        watering_days = 3  # default every 3 days
        sunlight_needs = []
        drought_tolerant = False

        if care_data:
            watering_level = care_data.get('watering', 'Average')
            drought_tolerant = care_data.get('drought_tolerant', False)
            sunlight_needs = care_data.get('sunlight', [])
            bench = care_data.get('watering_general_benchmark') or {}
            bench_val = bench.get('value', '')
            if isinstance(bench_val, str) and '-' in str(bench_val):
                parts = str(bench_val).split('-')
                try:
                    watering_days = (int(parts[0].strip()) + int(parts[1].strip())) / 2
                except ValueError:
                    watering_days = 3
            elif bench_val:
                try:
                    watering_days = float(bench_val)
                except (ValueError, TypeError):
                    watering_days = 3

            if watering_level == 'Frequent':
                watering_days = min(watering_days, 2)
            elif watering_level == 'Minimum':
                watering_days = max(watering_days, 7)

        plant_plan = {
            'plant_id': plant['id'],
            'plant_name': plant['name'],
            'species': plant.get('species', ''),
            'care_info': {
                'watering_level': watering_level,
                'watering_days': watering_days,
                'sunlight': sunlight_needs,
                'drought_tolerant': drought_tolerant
            },
            'daily': []
        }

        for i, date in enumerate(dates):
            temp_max = temp_maxes[i] if i < len(temp_maxes) else None
            temp_min = temp_mins[i] if i < len(temp_mins) else None
            precip = precip_sums[i] if i < len(precip_sums) else 0
            uv = uv_maxes[i] if i < len(uv_maxes) else 0
            code = weather_codes[i] if i < len(weather_codes) else 0

            avg_temp = ((temp_max or 25) + (temp_min or 15)) / 2

            # Smart watering logic using Perenual + weather
            should_water = (i % max(1, round(watering_days))) == 0
            water_amount = 'normal'
            reasons = []

            # Rain adjustments
            if precip and precip > 5:
                should_water = False
                water_amount = 'none'
                reasons.append(f'Rain expected: {precip:.1f}mm')
            elif precip and precip > 2:
                if should_water:
                    water_amount = 'light'
                reasons.append(f'Light rain: {precip:.1f}mm')

            # Temperature adjustments
            if avg_temp > plant.get('ideal_temperature_max', 30):
                if should_water:
                    water_amount = 'extra'
                elif not should_water and not drought_tolerant:
                    should_water = True
                    water_amount = 'light'
                reasons.append(f'Hot day: {avg_temp:.0f}°C')
            elif avg_temp < plant.get('ideal_temperature_min', 18):
                if should_water and water_amount == 'normal':
                    water_amount = 'light'
                reasons.append(f'Cold day: {avg_temp:.0f}°C')

            # UV adjustments
            if uv and uv > 8:
                if should_water and water_amount == 'normal':
                    water_amount = 'extra'
                reasons.append(f'High UV: {uv:.0f}')

            # Drought tolerant plants skip more
            if drought_tolerant and water_amount == 'normal' and not should_water:
                reasons.append('Drought tolerant — skip OK')

            if should_water and watering_level:
                reasons.append(f'Watering needs: {watering_level}')

            if not reasons:
                if should_water:
                    reasons.append('Scheduled watering day')
                else:
                    reasons.append('Rest day')

            # Duration
            base_duration = plant.get('water_duration', 5)
            if not should_water:
                suggested_duration = 0
            elif water_amount == 'extra':
                suggested_duration = int(base_duration * 1.5)
            elif water_amount == 'light':
                suggested_duration = max(1, int(base_duration * 0.5))
            else:
                suggested_duration = base_duration

            plant_plan['daily'].append({
                'date': date,
                'should_water': should_water,
                'water_amount': water_amount if should_water else 'none',
                'suggested_duration': suggested_duration,
                'reasons': reasons,
                'weather': {
                    'temp_max': temp_max,
                    'temp_min': temp_min,
                    'precipitation': precip,
                    'uv_index': uv,
                    'weather_code': code
                }
            })

        watering_plans.append(plant_plan)

    return jsonify({
        'location': {
            'latitude': lat,
            'longitude': lon,
            'timezone': weather.get('timezone', '')
        },
        'weather_daily': daily,
        'watering_plans': watering_plans
    })


# ==================== Run ====================

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
