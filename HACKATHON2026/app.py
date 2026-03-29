from flask import Flask, render_template, request, jsonify
import requests as http_requests
import database as db
from config import is_valid_local_ip
import threading
import time

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


# ==================== Run ====================

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
