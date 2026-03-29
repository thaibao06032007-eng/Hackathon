from flask import Flask, render_template, request, jsonify
import requests as http_requests
import database as db
from config import is_valid_local_ip, PERENUAL_API_KEY
import threading
import time
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
    lat = request.args.get('lat', 16.0544, type=float)
    lon = request.args.get('lon', 108.2022, type=float)
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
