import re
import os
from dotenv import load_dotenv

load_dotenv(override=True)

DATABASE_PATH = 'plant_monitor.db'
DEFAULT_SENSOR_INTERVAL = 30
DEFAULT_WATER_DURATION = 5
GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')

def is_valid_local_ip(ip):
    """Validate that an IP is a private/local network address."""
    pattern = r'^(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$'
    return bool(re.match(pattern, ip))