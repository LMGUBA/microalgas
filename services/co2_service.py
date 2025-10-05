from datetime import datetime, timedelta
import cdsapi
import xarray as xr
import numpy as np
import os
import sys
import warnings
import json

# Importar desde el paquete config
from config.cities import CITIES_COORDINATES
from config.co2_thresholds import get_co2_status, get_buffer_radius

# Suprimir warnings específicos
warnings.filterwarnings('ignore', category=FutureWarning)
warnings.filterwarnings('ignore', category=DeprecationWarning)

class CO2Service:
    def __init__(self):
        # Cliente CDS API: inicialización perezosa para evitar fallos al iniciar si faltan credenciales
        url = os.getenv("CDSAPI_URL")
        key = os.getenv("CDSAPI_KEY")
        self._cfgrib_available = None
        self.client = None
        if not (url and key):
            print("⚠️ CDSAPI_URL/CDSAPI_KEY no están configuradas. La descarga de CO2 no estará disponible hasta que las definas en las variables de entorno o proveas un archivo .cdsapirc válido en el proyecto.")

    def _check_cfgrib_availability(self):
        """Verifica si cfgrib está disponible y lo importa de forma lazy"""
        if self._cfgrib_available is None:
            try:
                import cfgrib
                self._cfgrib_available = True
                print("✅ cfgrib disponible")
            except ImportError as e:
                self._cfgrib_available = False
                print(f"❌ cfgrib no disponible: {str(e)}")
                print("💡 Instala cfgrib con: pip install cfgrib")
        return self._cfgrib_available

    def _get_cds_credentials(self):
        """Obtiene (url, key) para CDS/ADS desde variables de entorno o archivo .cdsapirc en proyecto/cwd/HOME."""
        # Variables de entorno tienen prioridad
        url = os.getenv("CDSAPI_URL")
        key = os.getenv("CDSAPI_KEY")
        if url and key:
            if ":" not in key:
                uid = os.getenv("CDSAPI_USER_ID")
                if uid:
                    key = f"{uid}:{key}"
            return url, key
        # Buscar .cdsapirc en ubicaciones comunes
        candidate_paths = [
            os.path.join(os.path.dirname(os.path.dirname(__file__)), ".cdsapirc"),
            os.path.join(os.getcwd(), ".cdsapirc"),
            os.path.expanduser("~/.cdsapirc"),
        ]
        for p in candidate_paths:
            try:
                if not os.path.exists(p):
                    continue
                url_val, key_val = None, None
                with open(p, "r") as f:
                    for line in f:
                        s = line.strip()
                        if not s or s.startswith("#"):
                            continue
                        lower = s.lower()
                        if lower.startswith("url:"):
                            url_val = s.split(":", 1)[1].strip()
                        elif lower.startswith("key:"):
                            key_val = s.split(":", 1)[1].strip()
                if url_val and key_val:
                    # Si la clave de .cdsapirc no incluye UID, intenta concatenar con CDSAPI_USER_ID del entorno
                    if ":" not in key_val:
                        uid = os.getenv("CDSAPI_USER_ID")
                        if uid:
                            key_val = f"{uid}:{key_val}"
                        else:
                            print("⚠️ La clave de .cdsapirc no incluye UID. Define CDSAPI_USER_ID en el entorno o usa el formato UID:APIKEY en .cdsapirc.")
                    print(f"🔐 Usando credenciales CDS/ADS de: {p}")
                    return url_val, key_val
            except Exception as e:
                print(f"⚠️ No se pudieron leer credenciales desde {p}: {e}")
                continue
        return None, None
        
    def get_co2_data_for_city(self, city_name, lat, lon, date=None, leadtime_hours=["0", "12", "24"]):
        """
        Obtiene datos de CO2 para una ciudad específica
        """
        # Lectura basada en GRIB (cfgrib requerido).
        # cfgrib solo será necesario si el archivo descargado es GRIB
            
        if date is None:
            # CAMS data has a 4-day delay, use a date that should have available data
            date = datetime.now() - timedelta(days=7)  # Use data from 7 days ago to ensure availability
        elif isinstance(date, str):
            # Convertir string a datetime si es necesario
            try:
                date = datetime.strptime(date, "%Y-%m-%d")
            except ValueError:
                date = datetime.now() - timedelta(days=7)
            
        try:
            # Descargar datos
            filename = self._download_co2_data(lat, lon, date, leadtime_hours)
            
            if filename is None:
                return {"error": "No se pudo descargar el archivo de datos"}
            
            # Leer y procesar datos
            data = self._read_co2_data(filename, lat, lon)
            
            if data is None:
                return {"error": "No se pudieron procesar los datos"}
            
            # Limpiar archivo temporal
            if os.path.exists(filename):
                os.remove(filename)
            
            # Formatear para respuesta JSON
            avg_co2 = float(np.mean(data['co2_ppm']))
            
            # Obtener información de estado basada en la concentración
            co2_status = get_co2_status(avg_co2)
            buffer_radius = get_buffer_radius(avg_co2)
            
            result = {
                "city": city_name,
                "coordinates": {
                    "target_lat": lat,
                    "target_lon": lon,
                    "actual_lat": data['actual_lat'],
                    "actual_lon": data['actual_lon']
                },
                "co2_data": {
                    "values_ppm": data['co2_ppm'].tolist() if hasattr(data['co2_ppm'], 'tolist') else [float(data['co2_ppm'])],
                    "average_ppm": avg_co2,
                    "min_ppm": float(np.min(data['co2_ppm'])),
                    "max_ppm": float(np.max(data['co2_ppm']))
                },
                "co2_status": {
                    "color": co2_status['color'],
                    "label": co2_status['label'],
                    "description": co2_status['description'],
                    "buffer_radius": buffer_radius
                },
                "time_info": data['time_info'],
                "distance_km": self._calculate_distance(lat, lon, data['actual_lat'], data['actual_lon'])
            }
            
            return result
            
        except Exception as e:
            return {"error": f"Error general: {str(e)}"}

    def _download_co2_data(self, lat, lon, date, leadtime_hours):
        """Descarga datos de CO2 desde la API de Copernicus con reintentos mejorados"""
        import time
        import glob
        import socket
        
        max_retries = 2  # Reducido a 2 intentos para evitar sobrecargar la API
        retry_delay = 10   # Aumentado a 10 segundos para dar más tiempo
        filename = f"co2_data_{date.strftime('%Y_%m_%d')}.grib"
        
        for attempt in range(max_retries):
            try:
                # Configurar cliente con timeout más conservador y manejo de errores mejorado
                url, key = self._get_cds_credentials()
                if url and key:
                    if ":" not in key:
                        print("⚠️ La 'key' parece no incluir el UID (formato esperado 'uid:clave').")
                    c = cdsapi.Client(url=url, key=key, timeout=300, retry_max=1)
                else:
                    raise Exception("Faltan credenciales de CDS/ADS. Define CDSAPI_URL y CDSAPI_KEY o proporciona un archivo .cdsapirc válido en proyecto/cwd/HOME.")
                
                # Configurar área de descarga (expandir un poco el área)
                area = [lat + 0.5, lon - 0.5, lat - 0.5, lon + 0.5]
                
                # Limpiar archivos anteriores
                if os.path.exists(filename):
                    os.remove(filename)
                    print(f"🗑️ Archivo anterior eliminado: {filename}")
                
                # Limpiar archivos temporales de descargas anteriores
                temp_files = glob.glob("*.grib")
                for temp_file in temp_files:
                    try:
                        file_size = os.path.getsize(temp_file)
                        if file_size < 5000000:  # Menos de 5MB (archivos incompletos)
                            os.remove(temp_file)
                            print(f"🗑️ Archivo temporal eliminado: {temp_file} ({file_size} bytes)")
                    except:
                        pass
                # (NetCDF no utilizado en Railway)
                
                print(f"🌍 Descargando datos de CO2 para {date.strftime('%Y-%m-%d')} (intento {attempt + 1}/{max_retries})...")
                print(f"📍 Coordenadas: {lat}, {lon}")
                print(f"⏱️ Timeout configurado: 10 minutos")
                
                request = {
                    "variable": ["carbon_dioxide"],
                    "model_level": ["137"],  # Nivel de superficie
                    "date": [f"{date.strftime('%Y-%m-%d')}/{date.strftime('%Y-%m-%d')}"],
                    "leadtime_hour": leadtime_hours,
                    "area": area,
                    "format": "grib"
                }
                
                # Realizar la descarga con manejo mejorado de errores de conexión
                try:
                    c.retrieve('cams-global-greenhouse-gas-forecasts', request, filename)
                except (socket.error, ConnectionError, BrokenPipeError) as conn_error:
                    print(f"🔌 Error de conexión: {str(conn_error)}")
                    raise Exception(f"Error de conexión con la API: {str(conn_error)}")
                except Exception as api_error:
                    print(f"🌐 Error de API: {str(api_error)}")
                    raise Exception(f"Error en la API de Copernicus: {str(api_error)}")
                
                # Esperar menos tiempo para que el archivo se complete
                print("⏳ Esperando que la descarga se complete...")
                time.sleep(3)  # Reducido de 5 a 3 segundos
                
                # Buscar el archivo descargado con mejor validación
                downloaded_file = None
                
                # Primero verificar si el archivo con el nombre esperado existe
                if os.path.exists(filename):
                    downloaded_file = filename
                else:
                    # Buscar archivos .grib recientes que puedan ser nuestra descarga
                    grib_files = glob.glob("*.grib")
                    candidates = grib_files
                    if candidates:
                        candidates.sort(key=lambda x: os.path.getmtime(x), reverse=True)
                        for cand in candidates:
                            try:
                                file_size = os.path.getsize(cand)
                                if cand.endswith('.grib') and file_size > 5000000:
                                    downloaded_file = cand
                                    break
                            except Exception:
                                continue
                
                if downloaded_file:
                    file_size = os.path.getsize(downloaded_file)
                    print(f"📁 Archivo encontrado: {downloaded_file} ({file_size} bytes)")
                    
                    # Verificar que el archivo no esté vacío o sea muy pequeño
                    min_size = 5000000
                    if file_size > min_size:
                        # Validar GRIB si cfgrib está disponible
                        try:
                            if self._check_cfgrib_availability():
                                import cfgrib
                                test_ds = xr.open_dataset(downloaded_file, engine='cfgrib')
                                test_ds.close()
                            else:
                                print("⚠️ cfgrib no disponible, validando solo por tamaño de archivo")
                            if downloaded_file != filename:
                                os.rename(downloaded_file, filename)
                                print(f"📝 Archivo renombrado de {downloaded_file} a {filename}")
                            print(f"✅ Descarga completada exitosamente: {filename}")
                            return filename
                        except Exception as validation_error:
                            print(f"⚠️ Archivo corrupto o incompleto: {str(validation_error)}")
                            if os.path.exists(downloaded_file):
                                os.remove(downloaded_file)
                            raise Exception(f"Archivo GRIB inválido: {str(validation_error)}")
                else:
                    raise Exception("No se encontró el archivo descargado")
                    
            except Exception as e:
                error_msg = f"Error en descarga de datos (intento {attempt + 1}): {str(e)}"
                print(f"❌ {error_msg}")
                
                # Limpiar archivos parciales más agresivamente
                temp_files = glob.glob("*.grib")
                for temp_file in temp_files:
                    try:
                        file_size = os.path.getsize(temp_file)
                        if file_size < 10000000:  # Menos de 10MB (probablemente incompleto)
                            os.remove(temp_file)
                            print(f"🗑️ Archivo parcial eliminado: {temp_file} ({file_size} bytes)")
                    except:
                        pass
                
                # Si es el último intento, lanzar la excepción
                if attempt == max_retries - 1:
                    # Proporcionar información más específica sobre posibles problemas
                    if "broken pipe" in str(e).lower() or "connectionerror" in str(e).lower():
                        print("🔌 Error de conexión - la API de Copernicus puede estar sobrecargada")
                        print("💡 Sugerencia: Intenta nuevamente en unos minutos")
                    elif "cfgrib" in str(e).lower():
                        print("🔧 Problema con cfgrib - instala con: pip install cfgrib eccodes")
                    elif "File size mismatch" in str(e) or "incompleto" in str(e):
                        print("📊 Error de descarga incompleta - reintentando con parámetros diferentes")
                        print("💡 Sugerencia: La API de Copernicus puede estar experimentando alta demanda")
                    elif "Invalid API key" in str(e) or "401" in str(e):
                        print("🔑 Verifica tu API key de Copernicus CDS")
                    elif "quota" in str(e).lower():
                        print("📊 Has excedido tu cuota de descarga")
                    elif "network" in str(e).lower() or "connection" in str(e).lower():
                        print("🌐 Problema de conexión a internet")
                    elif "timeout" in str(e).lower():
                        print("⏱️ Timeout de descarga - el servidor está lento")
                    
                    raise Exception(f"Error en descarga después de {max_retries} intentos: {str(e)}")
                
                # Esperar antes del siguiente intento con backoff más conservador
                wait_time = retry_delay * (attempt + 1)  # Incremento lineal
                wait_time = min(wait_time, 60)  # Máximo 60 segundos
                print(f"⏳ Esperando {wait_time} segundos antes del siguiente intento...")
                time.sleep(wait_time)

    def _read_co2_data(self, filename, target_lat, target_lon):
        """
        Lee y procesa los datos de CO2 del archivo GRIB (formato único en Railway)
        """
        ds = None
        try:
            # GRIB requiere cfgrib
            if not self._check_cfgrib_availability():
                print("❌ No se puede leer el archivo GRIB sin cfgrib")
                return None
            ds = xr.open_dataset(filename, engine='cfgrib')
            co2_var = 'co2' if 'co2' in ds.data_vars else 'carbon_dioxide' if 'carbon_dioxide' in ds.data_vars else None
            if co2_var is None:
                return None
            co2_data = ds.sel(latitude=target_lat, longitude=target_lon, method='nearest')
            
            # Extraer los valores de CO2
            co2_values = co2_data[co2_var].values
            
            # Procesar información temporal
            time_info = self._process_time_info(ds)
            
            # Convertir de kg/kg a ppm
            co2_ppm = co2_values * 1e6
            
            # Información de coordenadas reales seleccionadas
            actual_lat = float(co2_data.latitude.values)
            actual_lon = float(co2_data.longitude.values)
            
            result = {
                'co2_ppm': co2_ppm,
                'actual_lat': actual_lat,
                'actual_lon': actual_lon,
                'time_info': time_info
            }
            
            return result
            
        except Exception as e:
            print(f"Error leyendo archivo: {e}")
            return None
        finally:
            if ds is not None:
                try:
                    ds.close()
                except:
                    pass

    def _process_time_info(self, ds):
        """Procesa información temporal del dataset"""
        time_info = {}
        
        try:
            if 'time' in ds.coords:
                base_time = ds.time.values
                if hasattr(base_time, 'item'):
                    time_info['base_time'] = str(base_time.item())
                else:
                    time_info['base_time'] = str(base_time)
            
            # Preferir forecast_hour si existe, sino step
            if 'forecast_hour' in ds.coords:
                steps = ds.forecast_hour.values
                time_info['forecast_hours'] = [str(s) for s in steps]
            elif 'step' in ds.coords:
                steps = ds.step.values
                time_info['forecast_hours'] = [str(step) for step in steps]
                
        except Exception as e:
            time_info['error'] = str(e)
        
        return time_info
    
    def _calculate_distance(self, lat1, lon1, lat2, lon2):
        """Calcula distancia entre dos puntos en km"""
        from math import radians, cos, sin, asin, sqrt
        
        # Radio de la Tierra en km
        R = 6371.0
        
        # Convertir a radianes
        lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
        
        # Diferencias
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        
        # Fórmula haversine
        a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
        c = 2 * asin(sqrt(a))
        
        return R * c