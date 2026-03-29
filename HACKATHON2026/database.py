import sqlite3
from config import DATABASE_PATH
from datetime import datetime, timedelta


def get_db():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_db()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS plants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            species TEXT DEFAULT '',
            location TEXT DEFAULT '',
            esp32_ip TEXT DEFAULT '',
            ideal_soil_humidity_min REAL DEFAULT 30,
            ideal_soil_humidity_max REAL DEFAULT 70,
            ideal_temperature_min REAL DEFAULT 18,
            ideal_temperature_max REAL DEFAULT 30,
            water_duration INTEGER DEFAULT 5,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS sensor_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plant_id INTEGER NOT NULL,
            soil_humidity REAL,
            temperature REAL,
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (plant_id) REFERENCES plants(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS water_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plant_id INTEGER NOT NULL,
            duration_seconds INTEGER,
            triggered_by TEXT DEFAULT 'manual',
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (plant_id) REFERENCES plants(id) ON DELETE CASCADE
        );
    ''')
    conn.commit()
    conn.close()


# ==================== Plant CRUD ====================

def get_all_plants():
    conn = get_db()
    plants = conn.execute('SELECT * FROM plants ORDER BY name').fetchall()
    conn.close()
    return [dict(p) for p in plants]


def get_plant(plant_id):
    conn = get_db()
    plant = conn.execute('SELECT * FROM plants WHERE id = ?', (plant_id,)).fetchone()
    conn.close()
    return dict(plant) if plant else None


def create_plant(data):
    conn = get_db()
    cursor = conn.execute('''
        INSERT INTO plants (name, species, location, esp32_ip,
            ideal_soil_humidity_min, ideal_soil_humidity_max,
            ideal_temperature_min, ideal_temperature_max,
            water_duration)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        data['name'],
        data.get('species', ''),
        data.get('location', ''),
        data.get('esp32_ip', ''),
        data.get('ideal_soil_humidity_min', 30),
        data.get('ideal_soil_humidity_max', 70),
        data.get('ideal_temperature_min', 18),
        data.get('ideal_temperature_max', 30),
        data.get('water_duration', 5)
    ))
    conn.commit()
    plant_id = cursor.lastrowid
    conn.close()
    return plant_id


def update_plant(plant_id, data):
    conn = get_db()
    conn.execute('''
        UPDATE plants SET name=?, species=?, location=?, esp32_ip=?,
            ideal_soil_humidity_min=?, ideal_soil_humidity_max=?,
            ideal_temperature_min=?, ideal_temperature_max=?,
            water_duration=?
        WHERE id=?
    ''', (
        data['name'],
        data.get('species', ''),
        data.get('location', ''),
        data.get('esp32_ip', ''),
        data.get('ideal_soil_humidity_min', 30),
        data.get('ideal_soil_humidity_max', 70),
        data.get('ideal_temperature_min', 18),
        data.get('ideal_temperature_max', 30),
        data.get('water_duration', 5),
        plant_id
    ))
    conn.commit()
    conn.close()


def delete_plant(plant_id):
    conn = get_db()
    conn.execute('DELETE FROM plants WHERE id = ?', (plant_id,))
    conn.commit()
    conn.close()


# ==================== Sensor Data ====================

def add_sensor_data(plant_id, soil_humidity, temperature):
    conn = get_db()
    conn.execute('''
        INSERT INTO sensor_data (plant_id, soil_humidity, temperature)
        VALUES (?, ?, ?)
    ''', (plant_id, soil_humidity, temperature))
    conn.commit()
    conn.close()


def get_latest_sensor_data(plant_id):
    conn = get_db()
    data = conn.execute('''
        SELECT * FROM sensor_data WHERE plant_id = ?
        ORDER BY recorded_at DESC LIMIT 1
    ''', (plant_id,)).fetchone()
    conn.close()
    return dict(data) if data else None


def get_sensor_history(plant_id, hours=24):
    conn = get_db()
    since = (datetime.now() - timedelta(hours=hours)).isoformat()
    data = conn.execute('''
        SELECT * FROM sensor_data WHERE plant_id = ? AND recorded_at >= ?
        ORDER BY recorded_at ASC
    ''', (plant_id, since)).fetchall()
    conn.close()
    return [dict(d) for d in data]


# ==================== Water Events ====================

def add_water_event(plant_id, duration, triggered_by='manual'):
    conn = get_db()
    conn.execute('''
        INSERT INTO water_events (plant_id, duration_seconds, triggered_by)
        VALUES (?, ?, ?)
    ''', (plant_id, duration, triggered_by))
    conn.commit()
    conn.close()


def get_water_history(plant_id, hours=168):
    conn = get_db()
    since = (datetime.now() - timedelta(hours=hours)).isoformat()
    data = conn.execute('''
        SELECT * FROM water_events WHERE plant_id = ? AND recorded_at >= ?
        ORDER BY recorded_at DESC
    ''', (plant_id, since)).fetchall()
    conn.close()
    return [dict(d) for d in data]


# ==================== Health Prediction (Rule-Based) ====================

def predict_health(plant_id):
    plant = get_plant(plant_id)
    if not plant:
        return None

    latest = get_latest_sensor_data(plant_id)
    if not latest:
        return {'status': 'unknown', 'label': 'No Data', 'color': '#6c757d', 'score': 0, 'details': []}

    issues = []
    score = 100

    # Check soil humidity
    if latest['soil_humidity'] is not None:
        if latest['soil_humidity'] < plant['ideal_soil_humidity_min']:
            deficit = plant['ideal_soil_humidity_min'] - latest['soil_humidity']
            issues.append(
                f"Soil too dry ({latest['soil_humidity']:.1f}% \u2014 min: {plant['ideal_soil_humidity_min']}%)")
            score -= min(40, deficit * 2)
        elif latest['soil_humidity'] > plant['ideal_soil_humidity_max']:
            excess = latest['soil_humidity'] - plant['ideal_soil_humidity_max']
            issues.append(
                f"Soil too wet ({latest['soil_humidity']:.1f}% \u2014 max: {plant['ideal_soil_humidity_max']}%)")
            score -= min(30, excess * 2)

    # Check temperature
    if latest['temperature'] is not None:
        if latest['temperature'] < plant['ideal_temperature_min']:
            deficit = plant['ideal_temperature_min'] - latest['temperature']
            issues.append(
                f"Too cold ({latest['temperature']:.1f}\u00b0C \u2014 min: {plant['ideal_temperature_min']}\u00b0C)")
            score -= min(30, deficit * 3)
        elif latest['temperature'] > plant['ideal_temperature_max']:
            excess = latest['temperature'] - plant['ideal_temperature_max']
            issues.append(
                f"Too hot ({latest['temperature']:.1f}\u00b0C \u2014 max: {plant['ideal_temperature_max']}\u00b0C)")
            score -= min(30, excess * 3)

    score = max(0, score)

    if score >= 70:
        status = {'status': 'healthy', 'label': 'Healthy', 'color': '#2d6a4f'}
    elif score >= 40:
        status = {'status': 'attention', 'label': 'Needs Attention', 'color': '#f4a261'}
    else:
        status = {'status': 'critical', 'label': 'Critical', 'color': '#e63946'}

    status['score'] = score
    status['details'] = issues
    status['sensor_data'] = latest

    return status
