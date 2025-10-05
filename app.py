import os
import sys
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional, Tuple

from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import BadRequest, InternalServerError
import requests

# Agregar el directorio actual al path para importaciones locales
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.co2_service import CO2Service
from services.geocoding_service import GeocodingService
from config.cities import CITIES_COORDINATES, get_city_coordinates, get_all_cities

# Cargar variables desde .env si existe

def _load_env_file(path: str = ".env") -> None:
    try:
        if not os.path.exists(path):
            return
        with open(path, "r") as f:
            for line in f:
                s = line.strip()
                if not s or s.startswith("#"):
                    continue
                if "=" in s:
                    key, value = s.split("=", 1)
                    key = key.strip()
                    value = value.strip()
                    if key and os.getenv(key) is None:
                        os.environ[key] = value
    except Exception:
        pass

_load_env_file()

# Configurar Flask con las rutas correctas de templates y static
app = Flask(__name__, 
           template_folder='app/templates',
           static_folder='app/static')
app.config['SECRET_KEY'] = 'co2-monitoring-app-secret-key'

# Habilitar CORS para todas las rutas
CORS(app)

# Inicializar servicios
co2_service = CO2Service()
geocoding_service = GeocodingService()

@app.route('/')
def index():
    """Página principal con el mapa"""
    return render_template('index.html', OPENWEATHERMAP_API_KEY=os.getenv('OPENWEATHERMAP_API_KEY', ''))

@app.route('/api/cities')
def get_cities():
    """API para obtener todas las ciudades disponibles"""
    try:
        cities = get_all_cities()
        return jsonify({
            'success': True,
            'cities': cities
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/city/<city_name>/coordinates')
def get_city_coords(city_name):
    """API para obtener coordenadas de una ciudad (primero busca en ciudades predefinidas, luego en geocodificación)"""
    try:
        # Primero intentar con ciudades predefinidas
        coords = get_city_coordinates(city_name)
        if coords:
            return jsonify({
                'success': True,
                'city': coords,
                'source': 'predefined'
            })
        
        # Si no se encuentra, usar geocodificación
        city_info = geocoding_service.search_city(city_name)
        if city_info:
            return jsonify({
                'success': True,
                'city': city_info,
                'source': 'geocoding'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Ciudad no encontrada'
            }), 404
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/search/cities')
def search_cities():
    """API para buscar ciudades globalmente"""
    try:
        query = request.args.get('q', '').strip()
        if not query:
            return jsonify({
                'success': False,
                'error': 'Parámetro de búsqueda requerido'
            }), 400
        
        limit = min(int(request.args.get('limit', 5)), 10)  # Máximo 10 resultados
        
        cities = geocoding_service.search_cities(query, limit)
        
        return jsonify({
            'success': True,
            'cities': cities,
            'query': query
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/health')
def health():
    """Endpoint de verificación de salud y configuración (CDS, cfgrib, OWM)."""
    try:
        env_url = os.getenv('CDSAPI_URL')
        env_key = os.getenv('CDSAPI_KEY')
        uid_env = os.getenv('CDSAPI_USER_ID')
        source = 'none'
        url = None
        key = None
        if env_url and env_key:
            source = 'env'
            url, key = env_url, env_key
        else:
            candidate_paths = [
                os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cdsapirc'),
                os.path.join(os.getcwd(), '.cdsapirc'),
                os.path.expanduser('~/.cdsapirc'),
            ]
            for p in candidate_paths:
                try:
                    if not os.path.exists(p):
                        continue
                    url_val, key_val = None, None
                    with open(p, 'r') as f:
                        for line in f:
                            s = line.strip()
                            if not s or s.startswith('#'):
                                continue
                            lower = s.lower()
                            if lower.startswith('url:'):
                                url_val = s.split(':', 1)[1].strip()
                            elif lower.startswith('key:'):
                                key_val = s.split(':', 1)[1].strip()
                    if url_val and key_val:
                        source = 'cdsapirc'
                        url, key = url_val, key_val
                        break
                except Exception:
                    continue
        cfgrib_available = bool(co2_service._check_cfgrib_availability())
        owm_present = os.getenv('OPENWEATHERMAP_API_KEY') is not None
        return jsonify({
            'success': True,
            'health': {
                'cds': {
                    'url_present': bool(url),
                    'key_present': bool(key),
                    'key_has_uid': (":" in key) if key else False,
                    'uid_env_present': bool(uid_env),
                    'source': source
                },
                'cfgrib_available': cfgrib_available,
                'openweathermap_key_present': owm_present
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/co2/<city_name>')
def get_co2_data(city_name):
    """API para obtener datos de CO2 de una ciudad"""
    try:
        # Obtener coordenadas de la ciudad
        city_info = get_city_coordinates(city_name)
        if not city_info:
            return jsonify({
                'success': False,
                'error': f'Ciudad "{city_name}" no encontrada'
            }), 404
        
        # Parámetros opcionales
        date = request.args.get('date')  # formato YYYY-MM-DD
        leadtime_hours = request.args.getlist('hours') or ["0", "12", "24"]
        
        # Obtener datos de CO2
        co2_data = co2_service.get_co2_data_for_city(
            city_name=city_info['name'],
            lat=city_info['lat'],
            lon=city_info['lon'],
            date=date,
            leadtime_hours=leadtime_hours
        )
        
        if 'error' in co2_data:
            # Log del error para debugging
            print(f"❌ Error en CO2 service: {co2_data['error']}")
            kind = co2_data.get('error_kind')
            status = 500
            user_msg = co2_data['error']
            if kind in ('credentials_missing', 'auth_error', 'terms_error'):
                status = 400
                if kind == 'credentials_missing':
                    user_msg = 'Faltan credenciales de Copernicus/ADS (.cdsapirc)'
                elif kind == 'auth_error':
                    user_msg = 'Token de Copernicus inválido o no autorizado'
                elif kind == 'terms_error':
                    user_msg = 'Debes aceptar los términos del dataset en ADS antes de descargar'
            elif kind == 'quota_error':
                status = 429
                user_msg = 'Cuota de descarga excedida, intenta más tarde'
            elif kind in ('connection', 'timeout'):
                status = 502
                user_msg = 'Problema de conexión/timeout con la API de Copernicus'
            elif kind in ('download_incomplete', 'processing_failed', 'cfgrib_missing'):
                status = 500
            return jsonify({
                'success': False,
                'error': user_msg,
                'error_kind': kind
            }), status
        
        return jsonify({
            'success': True,
            'data': co2_data
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Error interno del servidor: {str(e)}'
        }), 500

@app.route('/api/co2/custom')
def get_co2_custom():
    """API para obtener datos de CO2 con coordenadas personalizadas"""
    try:
        # Obtener parámetros
        lat = request.args.get('lat', type=float)
        lon = request.args.get('lon', type=float)
        city_name = request.args.get('city', 'Ubicación personalizada')
        date = request.args.get('date')
        leadtime_hours = request.args.getlist('hours') or ["0", "12", "24"]
        
        if lat is None or lon is None:
            return jsonify({
                'success': False,
                'error': 'Se requieren parámetros lat y lon'
            }), 400
        
        # Validar rangos de coordenadas
        if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
            return jsonify({
                'success': False,
                'error': 'Coordenadas fuera de rango válido'
            }), 400
        
        # Obtener datos de CO2
        co2_data = co2_service.get_co2_data_for_city(
            city_name=city_name,
            lat=lat,
            lon=lon,
            date=date,
            leadtime_hours=leadtime_hours
        )
        
        if 'error' in co2_data:
            # Log del error para debugging
            print(f"❌ Error en CO2 service (custom): {co2_data['error']}")
            return jsonify({
                'success': False,
                'error': f"Error general: {co2_data['error']}"
            }), 500
        
        return jsonify({
            'success': True,
            'data': co2_data
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Error interno del servidor: {str(e)}'
        }), 500

# ----------------------------
# OpenWeatherMap proxy endpoint
# ----------------------------

def _aqi_label_and_color(aqi: int) -> Tuple[str, str]:
    """Mapeo AQI según especificación: Verde (Buena), Amarillo (Moderada), Naranja (Insalubre para grupos sensibles), Rojo (Insalubre), Morado (Muy insalubre), Granate (Peligroso)."""
    mapping = {
        1: ("Verde (Buena)", "#00E400"),
        2: ("Amarillo (Moderada)", "#FFFF00"),
        3: ("Naranja (Insalubre para grupos sensibles)", "#FF7E00"),
        4: ("Rojo (Insalubre)", "#FF0000"),
        5: ("Morado (Muy insalubre)", "#8F3F97"),
        6: ("Granate (Peligroso)", "#7E0023"),
    }
    return mapping.get(aqi, ("Desconocido", "#6B7280"))

@app.route('/api/weather')
def get_weather():
    """Obtiene clima actual, pronóstico y calidad del aire desde OpenWeatherMap por lat/lon."""
    try:
        lat = request.args.get('lat', type=float)
        lon = request.args.get('lon', type=float)
        if lat is None or lon is None:
            return jsonify({'success': False, 'error': 'Parámetros lat y lon requeridos'}), 400

        api_key = os.getenv('OPENWEATHERMAP_API_KEY')
        if not api_key:
            return jsonify({'success': False, 'error': 'OPENWEATHERMAP_API_KEY no configurada en el entorno'}), 500

        base_params = {
            'lat': lat,
            'lon': lon,
            'appid': api_key
        }

        # Clima actual
        weather_url = 'https://api.openweathermap.org/data/2.5/weather'
        weather_params = {**base_params, 'units': 'metric', 'lang': 'es'}
        weather_resp = requests.get(weather_url, params=weather_params, timeout=10)
        weather_resp.raise_for_status()
        weather = weather_resp.json()

        # Pronóstico 5 días / 3 horas
        forecast_url = 'https://api.openweathermap.org/data/2.5/forecast'
        forecast_params = {**base_params, 'units': 'metric', 'lang': 'es'}
        forecast_resp = requests.get(forecast_url, params=forecast_params, timeout=10)
        forecast_resp.raise_for_status()
        forecast = forecast_resp.json()

        # Calidad del aire (AQI)
        aqi_url = 'https://api.openweathermap.org/data/2.5/air_pollution'
        aqi_resp = requests.get(aqi_url, params=base_params, timeout=10)
        aqi_resp.raise_for_status()
        aqi_data = aqi_resp.json()

        aqi_index = None
        components = {}
        if aqi_data.get('list'):
            aqi_index = aqi_data['list'][0]['main'].get('aqi')
            components = aqi_data['list'][0].get('components', {})
        label, color = _aqi_label_and_color(aqi_index or 0)

        return jsonify({
            'success': True,
            'weather': weather,
            'forecast': forecast,
            'air_quality': {
                'aqi': aqi_index,
                'label': label,
                'color': color,
                'components': components
            }
        })
    except requests.HTTPError as e:
        try:
            return jsonify({'success': False, 'error': e.response.json()}), e.response.status_code
        except Exception:
            return jsonify({'success': False, 'error': str(e)}), 502
    except Exception as e:
        return jsonify({'success': False, 'error': f'Error interno del servidor: {str(e)}'}), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'success': False,
        'error': 'Endpoint no encontrado'
    }), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({
        'success': False,
        'error': 'Error interno del servidor'
    }), 500

if __name__ == '__main__':
    # Preferir credenciales por variables de entorno en despliegue (Railway)
    cdsapi_url = os.getenv('CDSAPI_URL')
    cdsapi_key = os.getenv('CDSAPI_KEY')
    cdsapi_config = os.path.expanduser('~/.cdsapirc')
    if not (cdsapi_url and cdsapi_key) and not os.path.exists(cdsapi_config):
        print("⚠️  Advertencia: No se encontró configuración de CDS API.")
        print("   Define CDSAPI_URL y CDSAPI_KEY como variables de entorno o crea ~/.cdsapirc")

    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', '0') == '1'

    print("🌍 Iniciando aplicación CO2 Monitor")
    print(f"📍 Accede a: http://0.0.0.0:{port}")
    print(f"🔗 API disponible en: http://0.0.0.0:{port}/api/")

    app.run(debug=debug, host='0.0.0.0', port=port)