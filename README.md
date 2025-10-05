# Monitor de CO2 - Aplicación Flask

Una aplicación web interactiva para monitorear los niveles de CO2 en ciudades peruanas, especialmente Huancayo, utilizando datos del servicio CAMS (Copernicus Atmosphere Monitoring Service).

## Características

- 🗺️ **Mapa interactivo** con Leaflet para visualizar ubicaciones
- 🔍 **Búsqueda de ciudades** con autocompletado
- 📊 **Datos de CO2 en tiempo real** desde CAMS
- 🎯 **Marcadores personalizados** que muestran niveles de CO2
- 📱 **Diseño responsivo** con Bootstrap
- 🇵🇪 **Enfoque en ciudades peruanas** (Huancayo, Lima, Arequipa, etc.)

## Estructura del Proyecto

```
flask_co2_app/
├── app.py                 # Aplicación Flask principal
├── services/
│   └── co2_service.py     # Servicio para obtener datos de CO2
├── config/
│   └── cities.py          # Configuración de ciudades y coordenadas
├── app/
│   ├── templates/
│   │   └── index.html     # Página principal
│   └── static/
│       ├── css/
│       │   └── style.css  # Estilos personalizados
│       └── js/
│           └── app.js     # JavaScript principal
├── requirements.txt       # Dependencias Python
├── .cdsapirc             # Configuración API de Copernicus
└── README.md             # Este archivo
```

## Instalación

### 1. Crear entorno virtual

```bash
cd flask_co2_app
python -m venv venv
source venv/bin/activate  # En Windows: venv\\Scripts\\activate
```

### 2. Instalar dependencias

```bash
pip install -r requirements.txt
```

### 3. Configurar API de Copernicus CDS

El archivo `.cdsapirc` ya está incluido con las credenciales necesarias. Si necesitas configurar tu propia cuenta:

1. Regístrate en [Copernicus CDS](https://cds.climate.copernicus.eu/)
2. Obtén tu API key
3. Edita el archivo `.cdsapirc`:

```
url: https://ads.atmosphere.copernicus.eu/api
key: TU_API_KEY_AQUI
```

## Ejecución

### Desarrollo

```bash
python app.py
```

La aplicación estará disponible en: http://localhost:5000

### Producción

Para producción, usa un servidor WSGI como Gunicorn:

```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

## Uso

1. **Página principal**: Abre http://localhost:5000
2. **Buscar ciudad**: Usa el campo de búsqueda o los botones predefinidos
3. **Ver datos**: Los datos de CO2 aparecerán en el panel lateral y como marcador en el mapa
4. **Explorar**: Haz clic en los marcadores para ver información detallada

## API Endpoints

### GET /api/cities
Obtiene lista de ciudades disponibles.

### GET /api/city/{city_name}/coordinates
Obtiene coordenadas de una ciudad específica.

### GET /api/co2/{city_name}
Obtiene datos de CO2 para una ciudad.

Parámetros opcionales:
- `date`: Fecha en formato YYYY-MM-DD
- `hours`: Horas de pronóstico (0, 12, 24)

### GET /api/co2/custom
Obtiene datos de CO2 para coordenadas personalizadas.

Parámetros requeridos:
- `lat`: Latitud
- `lon`: Longitud

Parámetros opcionales:
- `city`: Nombre personalizado
- `date`: Fecha
- `hours`: Horas de pronóstico

## Tecnologías Utilizadas

### Backend
- **Flask**: Framework web de Python
- **cdsapi**: Cliente para API de Copernicus
- **xarray**: Procesamiento de datos científicos
- **cfgrib**: Lectura de archivos GRIB

### Frontend
- **Leaflet**: Mapas interactivos
- **Bootstrap 5**: Framework CSS
- **Font Awesome**: Iconos
- **JavaScript ES6**: Funcionalidad del cliente

## Ciudades Soportadas

- Huancayo (Junín)
- Lima (Lima)
- Arequipa (Arequipa)
- Cusco (Cusco)
- Trujillo (La Libertad)
- Chiclayo (Lambayeque)
- Piura (Piura)
- Iquitos (Loreto)

## Datos de CO2

Los datos provienen del dataset **CAMS Global Greenhouse Gas Forecasts** que proporciona:

- Concentraciones de CO2 en superficie (nivel de modelo 137)
- Pronósticos para 0, 12 y 24 horas
- Resolución espacial de aproximadamente 40km
- Actualización diaria

## Desarrollo

### Agregar nuevas ciudades

Edita `config/cities.py` y agrega las coordenadas:

```python
"nueva_ciudad": {
    "name": "Nueva Ciudad",
    "lat": -XX.XXXX,
    "lon": -XX.XXXX,
    "region": "Región"
}
```

### Personalizar estilos

Modifica `app/static/css/style.css` para cambiar la apariencia.

### Extender funcionalidad

- Agrega nuevos endpoints en `app.py`
- Modifica el servicio de CO2 en `services/co2_service.py`
- Actualiza el frontend en `app/static/js/app.js`

## Solución de Problemas

### Error de descarga de datos
- Verifica tu conexión a internet
- Confirma que las credenciales de CDS API son correctas
- Revisa que tengas acceso al dataset CAMS

### Error de dependencias
```bash
pip install --upgrade pip
pip install -r requirements.txt --force-reinstall
```

### Problemas con cfgrib
En algunos sistemas puede ser necesario instalar eccodes:
```bash
# Ubuntu/Debian
sudo apt-get install libeccodes-dev

# macOS
brew install eccodes
```

## Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -am 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Crea un Pull Request

## Licencia

Este proyecto está bajo la Licencia MIT. Ver archivo LICENSE para más detalles.

## Contacto

Para preguntas o sugerencias sobre este proyecto, puedes crear un issue en el repositorio.