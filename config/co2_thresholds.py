# Configuración de umbrales de CO2 y colores para visualización en el mapa

# Umbrales de concentración de CO2 (en ppm - partes por millón)
CO2_THRESHOLDS = {
    'good': {
        'max': 400,  # Hasta 400 ppm - Bueno (verde)
        'color': '#28a745',  # Verde
        'label': 'Bueno',
        'description': 'Concentración normal de CO2'
    },
    'acceptable': {
        'min': 400,
        'max': 450,  # 400-450 ppm - Aceptable (naranja)
        'color': '#fd7e14',  # Naranja
        'label': 'Aceptable',
        'description': 'Concentración moderada de CO2'
    },
    'dangerous': {
        'min': 450,  # Más de 450 ppm - Peligroso (rojo)
        'color': '#dc3545',  # Rojo
        'label': 'Peligroso',
        'description': 'Concentración alta de CO2'
    }
}

def get_co2_status(concentration):
    """
    Determina el estado de la concentración de CO2
    
    Args:
        concentration (float): Concentración de CO2 en ppm
        
    Returns:
        dict: Información del estado (color, label, description)
    """
    if concentration <= CO2_THRESHOLDS['good']['max']:
        return CO2_THRESHOLDS['good']
    elif concentration <= CO2_THRESHOLDS['acceptable']['max']:
        return CO2_THRESHOLDS['acceptable']
    else:
        return CO2_THRESHOLDS['dangerous']

def get_buffer_radius(concentration):
    """
    Calcula el radio del buffer basado en la concentración
    
    Args:
        concentration (float): Concentración de CO2 en ppm
        
    Returns:
        int: Radio en metros para el círculo en el mapa
    """
    # Radio base de 5km, aumenta con la concentración
    base_radius = 5000  # 5 km
    
    if concentration <= CO2_THRESHOLDS['good']['max']:
        return base_radius
    elif concentration <= CO2_THRESHOLDS['acceptable']['max']:
        return base_radius + 2000  # 7 km
    else:
        return base_radius + 5000  # 10 km