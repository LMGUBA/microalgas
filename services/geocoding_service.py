import requests
import json
from typing import Dict, Any, Optional, List

class GeocodingService:
    """
    Servicio para geocodificación de ciudades usando Nominatim (OpenStreetMap)
    API gratuita sin necesidad de API key
    """
    
    def __init__(self):
        self.base_url = "https://nominatim.openstreetmap.org/search"
        self.headers = {
            'User-Agent': 'CO2Monitor/1.0 (Flask Application)'
        }
    
    def search_city(self, city_name: str) -> Optional[Dict[str, Any]]:
        """
        Busca una ciudad y devuelve sus coordenadas con mayor precisión
        
        Args:
            city_name: Nombre de la ciudad a buscar
            
        Returns:
            Dict con información de la ciudad o None si no se encuentra
        """
        try:
            # Primero intentar búsqueda específica para ciudades
            params = {
                'q': city_name,
                'format': 'json',
                'limit': 5,  # Aumentar límite para tener más opciones
                'addressdetails': 1,
                'class': 'place',  # Especificar clase de lugar
                'type': 'city,town,village',  # Tipos específicos de asentamientos
                'countrycodes': '',  # Permitir todos los países
                'dedupe': 1  # Eliminar duplicados
            }
            
            response = requests.get(
                self.base_url, 
                params=params, 
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if data and len(data) > 0:
                    # Filtrar y priorizar resultados más precisos
                    best_result = self._find_best_city_match(data, city_name)
                    
                    if best_result:
                        # Extraer información relevante
                        city_info = {
                            'name': self._extract_city_name(best_result),
                            'display_name': best_result.get('display_name', city_name),
                            'lat': float(best_result.get('lat', 0)),
                            'lon': float(best_result.get('lon', 0)),
                            'country': self._extract_country(best_result.get('address', {})),
                            'region': self._extract_region(best_result.get('address', {})),
                            'importance': best_result.get('importance', 0),
                            'place_type': best_result.get('type', 'unknown')
                        }
                        
                        return city_info
                    
        except Exception as e:
            print(f"Error en búsqueda de ciudad: {e}")
            
        return None
    
    def search_cities(self, city_name: str, limit: int = 5) -> List[Dict[str, Any]]:
        """
        Busca múltiples ciudades que coincidan con el nombre
        
        Args:
            city_name: Nombre de la ciudad a buscar
            limit: Número máximo de resultados
            
        Returns:
            Lista de ciudades encontradas
        """
        try:
            params = {
                'q': city_name,
                'format': 'json',
                'limit': limit,
                'addressdetails': 1,
                'class': 'place',
                'type': 'city,town,village'
            }
            
            response = requests.get(
                self.base_url, 
                params=params, 
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                cities = []
                
                for result in data:
                    city_info = {
                        'name': self._extract_city_name(result),
                        'display_name': result.get('display_name', city_name),
                        'lat': float(result.get('lat', 0)),
                        'lon': float(result.get('lon', 0)),
                        'country': self._extract_country(result.get('address', {})),
                        'region': self._extract_region(result.get('address', {})),
                        'importance': result.get('importance', 0),
                        'place_type': result.get('type', 'unknown')
                    }
                    cities.append(city_info)
                
                # Ordenar por importancia (relevancia)
                cities.sort(key=lambda x: x['importance'], reverse=True)
                return cities
                    
        except Exception as e:
            print(f"Error en búsqueda múltiple: {e}")
            
        return []
    
    def _find_best_city_match(self, results: List[Dict], city_name: str) -> Optional[Dict]:
        """
        Encuentra el mejor resultado basado en criterios de precisión
        """
        if not results:
            return None
        
        # Priorizar por tipo de lugar (city > town > village)
        type_priority = {'city': 3, 'town': 2, 'village': 1}
        
        # Calcular puntuación para cada resultado
        scored_results = []
        for result in results:
            score = 0
            place_type = result.get('type', '').lower()
            
            # Puntuación por tipo de lugar
            score += type_priority.get(place_type, 0) * 10
            
            # Puntuación por importancia
            score += result.get('importance', 0) * 5
            
            # Puntuación por coincidencia exacta en el nombre
            display_name = result.get('display_name', '').lower()
            if city_name.lower() in display_name:
                score += 5
            
            # Priorizar si el nombre de la ciudad aparece al principio
            address = result.get('address', {})
            city_in_address = (address.get('city', '') or 
                             address.get('town', '') or 
                             address.get('village', '')).lower()
            
            if city_in_address and city_name.lower() in city_in_address:
                score += 8
            
            scored_results.append((score, result))
        
        # Ordenar por puntuación y devolver el mejor
        scored_results.sort(key=lambda x: x[0], reverse=True)
        return scored_results[0][1] if scored_results else None
    
    def _extract_city_name(self, result: Dict) -> str:
        """
        Extrae el nombre más apropiado de la ciudad del resultado
        """
        address = result.get('address', {})
        
        # Priorizar nombres específicos de ciudad
        city_name = (address.get('city') or 
                    address.get('town') or 
                    address.get('village') or 
                    address.get('municipality') or
                    result.get('name', ''))
        
        return city_name if city_name else result.get('display_name', 'Unknown')
    
    def _extract_country(self, address: Dict) -> str:
        """Extrae el país de la información de dirección"""
        return address.get('country', address.get('country_code', 'Unknown'))
    
    def _extract_region(self, address: Dict) -> str:
        """Extrae la región/estado de la información de dirección"""
        return (address.get('state') or 
                address.get('province') or 
                address.get('region') or 
                address.get('county') or 
                'Unknown')