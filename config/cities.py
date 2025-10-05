# Coordenadas de ciudades peruanas principales
CITIES_COORDINATES = {
    "huancayo": {
        "name": "Huancayo",
        "lat": -12.0667,
        "lon": -75.2,
        "region": "Junín"
    },
    "lima": {
        "name": "Lima",
        "lat": -12.0464,
        "lon": -77.0428,
        "region": "Lima"
    },
    "arequipa": {
        "name": "Arequipa",
        "lat": -16.4090,
        "lon": -71.5375,
        "region": "Arequipa"
    },
    "cusco": {
        "name": "Cusco",
        "lat": -13.5319,
        "lon": -71.9675,
        "region": "Cusco"
    },
    "trujillo": {
        "name": "Trujillo",
        "lat": -8.1116,
        "lon": -79.0287,
        "region": "La Libertad"
    },
    "chiclayo": {
        "name": "Chiclayo",
        "lat": -6.7714,
        "lon": -79.8371,
        "region": "Lambayeque"
    },
    "piura": {
        "name": "Piura",
        "lat": -5.1945,
        "lon": -80.6328,
        "region": "Piura"
    },
    "iquitos": {
        "name": "Iquitos",
        "lat": -3.7437,
        "lon": -73.2516,
        "region": "Loreto"
    }
}

def get_city_coordinates(city_name):
    """
    Obtiene las coordenadas de una ciudad
    """
    city_key = city_name.lower().strip()
    return CITIES_COORDINATES.get(city_key)

def get_all_cities():
    """
    Obtiene todas las ciudades disponibles
    """
    return list(CITIES_COORDINATES.keys())