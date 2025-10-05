// Aplicación principal para el Monitor de CO2
class CO2Monitor {
    constructor() {
        this.map = null;
        this.markers = {};
        this.circles = {};
        this.currentCity = null;
        this.cities = [];
        this.userLocation = null;
        this.tempAQI = { marker: null, circle: null };
        this.lastAQI = null;
        this.mainMarker = null;
        this.mainCircle = null;
        this.currentCO2Data = null;
        
        // Control de reintentos para geolocalización
        this.geolocationRetries = 0;
        this.maxGeolocationRetries = 3;
        this.lastGeolocationError = null;
        this.isMacOS = this.detectMacOS();
        
        this.init();
    }

    // Detectar si estamos en macOS
    detectMacOS() {
        return navigator.platform.toUpperCase().indexOf('MAC') >= 0 || 
               navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;
    }
    
    async init() {
        this.initMap();
        this.setupEventListeners();
        await this.loadCities();
        
        // Mostrar mensaje inicial sin intentar detectar ubicación automáticamente
        this.showInitialMessage();
    }
    
    initMap() {
        // Inicializar mapa centrado en Perú
        this.map = L.map('map').setView([-12.0667, -75.2], 6);
        
        // Usar múltiples proveedores de tiles para mayor confiabilidad
        const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
            errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            crossOrigin: true
        });
        
        // Capa alternativa de CartoDB como respaldo
        const cartoLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            maxZoom: 19,
            subdomains: 'abcd'
        });
        
        // Agregar la capa principal
        osmLayer.addTo(this.map);
        
        // Control de capas para cambiar entre proveedores
        const baseMaps = {
            "OpenStreetMap": osmLayer,
            "CartoDB Light": cartoLayer
        };
        
        L.control.layers(baseMaps).addTo(this.map);
        
        // Agregar control de escala
        L.control.scale().addTo(this.map);
        
        // Agregar marcador con valor externo (Universidad Continental - Huancayo)
        this.addExternalValueMarker();
    }
    
    // Marcador de valor externo en coordenadas fijas (Firebase)
    addExternalValueMarker() {
        const ucLat = -12.0485033;
        const ucLon = -75.2026392;
        const url = this.getExternalValueURL();
        
        fetch(url)
            .then(resp => resp.json())
            .then(json => {
                const valor = this.extractExternalValue(json);
                if (valor === undefined || valor === null) return;
                
                const color = '#4e73df';
                const icon = L.divIcon({
                    className: 'co2-marker',
                    html: `
                        <div class="marker-content" style="background-color: ${color}; border-color: ${color}; color:${getContrastingTextColor(color)};">
                            <div class="co2-value">${valor}</div>
                            <div class="co2-unit">ppm</div>
                        </div>
                    `,
                    iconSize: [60, 60],
                    iconAnchor: [30, 30]
                });
                
                if (this.externalValueMarker) {
                    // Actualizar icono y popup si el marcador ya existe
                    this.externalValueMarker.setIcon(icon);
                    this.updateExternalPopup(this.externalValueMarker, valor, ucLat, ucLon);
                } else {
                    const marker = L.marker([ucLat, ucLon], { icon }).addTo(this.map);
                    this.updateExternalPopup(marker, valor, ucLat, ucLon);
                    this.externalValueMarker = marker;
                }
                
                // Programar auto-actualización periódica
                this.scheduleExternalValueAutoRefresh();
            })
            .catch(err => console.error('Error obteniendo valor externo:', err));
    }
    
    // URL fija del valor externo
    getExternalValueURL() {
        return 'https://testluis-36e52-default-rtdb.firebaseio.com/DATA1/VALOR1.json';
    }
    
    // Extraer valor desde la respuesta (primitivo u objeto)
    extractExternalValue(json) {
        if (typeof json === 'object' && json !== null) {
            return json.lectura ?? json.valor ?? json.value ?? json.VALOR1 ?? json;
        }
        return json;
    }
    
    // Actualizar contenido del popup del marcador externo
    updateExternalPopup(marker, valor, ucLat, ucLon) {
        const popup = `
            <div class="popup-container">
                <div class="popup-title">Universidad Continental</div>
                <div class="popup-co2">
                    <i class="fas fa-database me-1"></i>
                    VALOR DE CO2 DESPUES DE USAR MICROALGAS: <strong>${valor} ppm</strong>
                </div>
                <div class="popup-info">
                    <small>
                        <i class="fas fa-crosshairs me-1"></i>
                        ${ucLat.toFixed(4)}°, ${ucLon.toFixed(4)}°
                    </small>
                </div>
            </div>
        `;
        const existingPopup = marker.getPopup();
        if (existingPopup) {
            existingPopup.setContent(popup);
        } else {
            marker.bindPopup(popup);
        }
    }
    
    // Refrescar el valor del marcador externo sin recargar la página
    refreshExternalValueMarker() {
        const ucLat = -12.0485033;
        const ucLon = -75.2026392;
        const url = this.getExternalValueURL();
        
        fetch(url)
            .then(resp => resp.json())
            .then(json => {
                const valor = this.extractExternalValue(json);
                if (valor === undefined || valor === null) return;
                
                const color = '#4e73df';
                const icon = L.divIcon({
                    className: 'co2-marker',
                    html: `
                        <div class="marker-content" style="background-color: ${color}; border-color: ${color}; color:${getContrastingTextColor(color)};">
                            <div class="co2-value">${valor}</div>
                            <div class="co2-unit">ppm</div>
                        </div>
                    `,
                    iconSize: [60, 60],
                    iconAnchor: [30, 30]
                });
                
                if (this.externalValueMarker) {
                    this.externalValueMarker.setIcon(icon);
                    this.updateExternalPopup(this.externalValueMarker, valor, ucLat, ucLon);
                } else {
                    const marker = L.marker([ucLat, ucLon], { icon }).addTo(this.map);
                    this.updateExternalPopup(marker, valor, ucLat, ucLon);
                    this.externalValueMarker = marker;
                }
            })
            .catch(err => console.error('Error refrescando valor externo:', err));
    }
    
    // Programar intervalo de auto-actualización (cada 30s)
    scheduleExternalValueAutoRefresh() {
        if (this.externalValueInterval) {
            clearInterval(this.externalValueInterval);
        }
        this.externalValueInterval = setInterval(() => {
            this.refreshExternalValueMarker();
        }, 30000);
    }
    
    setupEventListeners() {
        // Búsqueda de ciudades
        const searchInput = document.getElementById('citySearch');
        const searchBtn = document.getElementById('searchBtn');
        
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.handleSearch(e.target.value);
            });
            
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const query = e.target.value.trim();
                    if (query) {
                        this.prepareLoadingStateForNewCity(query);
                        this.performSearch(query);
                        const suggestions = document.getElementById('searchSuggestions');
                        if (suggestions) suggestions.style.display = 'none';
                    }
                }
            });
        }
        
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                const query = searchInput.value.trim();
                if (query) {
                    this.prepareLoadingStateForNewCity(query);
                    this.performSearch(query);
                    const suggestions = document.getElementById('searchSuggestions');
                    if (suggestions) suggestions.style.display = 'none';
                }
            });
        }
        
        // Botones de ciudades predefinidas
        document.querySelectorAll('.city-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const cityName = e.target.closest('.city-btn').dataset.city;
                this.selectCity(cityName);
            });
        });

        // Botón de detección de ubicación
        const detectLocationBtn = document.getElementById('detectLocationBtn');
        if (detectLocationBtn) {
            detectLocationBtn.addEventListener('click', () => {
                this.detectUserLocation(false); // Pasar false para indicar que es manual
            });
        }
    }

    // Mostrar mensaje inicial sin detectar ubicación automáticamente
    showInitialMessage() {
        const messageContainer = document.getElementById('infoPanel');
        if (!messageContainer) {
            console.error('Elemento infoPanel no encontrado');
            return;
        }
        
        messageContainer.innerHTML = `
            <div class="alert alert-info">
                <h5><i class="fas fa-info-circle"></i> Bienvenido al Monitor de CO2</h5>
                <p>Para comenzar, selecciona una ciudad en la lista de la izquierda.</p>
            </div>
        `;
    }

    // Método para intentar detectar ubicación automáticamente al cargar
    async tryAutoDetectLocation() {
        // En macOS, deshabilitar detección automática debido a problemas con CoreLocation
        if (this.isMacOS) {
            console.log('macOS detectado - omitiendo geolocalización automática');
            this.showMacOSLocationMessage();
            return;
        }
        
        if (!navigator.geolocation) {
            console.log('Geolocalización no soportada por este navegador');
            // Mostrar mensaje de fallback
            this.showLocationNotSupportedMessage();
            return;
        }

        // Verificar si ya se han dado permisos previamente
        if ('permissions' in navigator) {
            try {
                const permission = await navigator.permissions.query({name: 'geolocation'});
                if (permission.state === 'granted') {
                    // Si ya se concedieron permisos, detectar ubicación automáticamente
                    this.detectUserLocation(true);
                    return;
                } else if (permission.state === 'denied') {
                    // Si se denegaron permisos, mostrar mensaje
                    this.showLocationDeniedMessage();
                    return;
                }
            } catch (error) {
                console.log('No se pudo verificar permisos de geolocalización');
            }
        }

        // Si no hay permisos previos, mantener el mensaje inicial
        // No cargar datos automáticamente
    }

    // Mostrar mensaje específico para macOS
    showMacOSLocationMessage() {
        const infoPanel = document.getElementById('infoPanel');
        if (infoPanel) {
            infoPanel.innerHTML = `
                <div class="text-center text-muted">
                    <i class="fas fa-apple-alt fa-2x mb-2 text-secondary"></i>
                    <p class="mb-2"><strong>Sistema macOS detectado</strong></p>
                    <p class="small">La detección automática de ubicación está deshabilitada debido a limitaciones de CoreLocation en macOS</p>
                    <div class="mt-3">
                        <button class="btn btn-primary btn-sm me-2" onclick="window.co2Monitor.detectUserLocation(false)">
                            <i class="fas fa-location-arrow me-1"></i>
                            Intentar detectar ubicación
                        </button>
                    </div>
                    <p class="small text-muted mt-2">
                        <i class="fas fa-info-circle me-1"></i>
                        Recomendamos seleccionar una ciudad manualmente para mejor experiencia
                    </p>
                </div>
            `;
        }
    }
    showLocationNotSupportedMessage() {
        const infoPanel = document.getElementById('infoPanel');
        if (infoPanel) {
            infoPanel.innerHTML = `
                <div class="text-center text-muted">
                    <i class="fas fa-exclamation-triangle fa-2x mb-2 text-warning"></i>
                    <p class="mb-2"><strong>Geolocalización no soportada</strong></p>
                    <p class="small">Tu navegador no soporta detección de ubicación</p>
                    <div class="mt-3">
                        <p class="small text-muted">Selecciona una ciudad manualmente:</p>
                    </div>
                </div>
            `;
        }
    }

    // Mostrar mensaje cuando se deniegan los permisos de ubicación
    showLocationDeniedMessage() {
        const infoPanel = document.getElementById('infoPanel');
        if (infoPanel) {
            infoPanel.innerHTML = `
                <div class="text-center text-muted">
                    <i class="fas fa-location-slash fa-2x mb-2 text-danger"></i>
                    <p class="mb-2"><strong>Permisos de ubicación denegados</strong></p>
                    <p class="small">Para obtener datos locales, permite el acceso a tu ubicación</p>
                    <div class="mt-3">
                        <button class="btn btn-outline-primary btn-sm" onclick="window.co2Monitor.detectUserLocation()">
                            <i class="fas fa-location-arrow me-1"></i>
                            Intentar de nuevo
                        </button>
                    </div>
                    <p class="small text-muted mt-2">O selecciona una ciudad manualmente:</p>
                </div>
            `;
        }
    }

    // Método para detectar la ubicación del usuario
    detectUserLocation(isAutomatic = false) {
        const detectBtn = document.getElementById('detectLocationBtn');
        
        if (!navigator.geolocation) {
            this.showAlert('Tu navegador no soporta geolocalización', 'warning');
            this.showLocationNotSupportedMessage();
            return;
        }

        // Verificar permisos antes de solicitar ubicación
        if (navigator.permissions) {
            navigator.permissions.query({name: 'geolocation'}).then((result) => {
                console.log('Estado de permisos de geolocalización:', result.state);
                if (result.state === 'denied') {
                    console.log('Permisos denegados previamente');
                    this.showLocationDeniedMessage();
                    return;
                }
                this.proceedWithGeolocation(isAutomatic);
            }).catch(() => {
                // Fallback si no se pueden verificar permisos
                console.log('No se pueden verificar permisos, procediendo con geolocalización');
                this.proceedWithGeolocation(isAutomatic);
            });
        } else {
            // Navegador no soporta API de permisos
            console.log('API de permisos no disponible, procediendo con geolocalización');
            this.proceedWithGeolocation(isAutomatic);
        }
    }

    proceedWithGeolocation(isAutomatic = false) {
        const detectBtn = document.getElementById('detectLocationBtn');

        // Resetear contadores al iniciar detección manual
        if (!isAutomatic) {
            this.geolocationRetries = 0;
            this.lastGeolocationError = null;
        }

        // Verificar límite de reintentos
        if (this.geolocationRetries >= this.maxGeolocationRetries) {
            console.warn('Máximo número de reintentos de geolocalización alcanzado');
            this.showLocationFailedMessage();
            return;
        }

        // Mostrar estado de carga
        if (detectBtn && !isAutomatic) {
            detectBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Detectando...';
            detectBtn.disabled = true;
        }

        // Incrementar contador de reintentos
        this.geolocationRetries++;

        // Configuración mejorada para macOS y mejor compatibilidad
        const options = {
            enableHighAccuracy: this.geolocationRetries <= 1, // Alta precisión en el primer intento, luego estándar para mayor compatibilidad
            timeout: this.geolocationRetries <= 1 ? 20000 : 30000, // Aumentar timeout en reintentos
            maximumAge: this.geolocationRetries <= 1 ? 60000 : 0 // En reintentos, evitar cache
        };

        console.log(`Solicitando geolocalización (intento ${this.geolocationRetries}/${this.maxGeolocationRetries})`);

        navigator.geolocation.getCurrentPosition(
            (position) => {
                console.log('Geolocalización exitosa:', position);
                // Resetear contador en caso de éxito
                this.geolocationRetries = 0;
                this.lastGeolocationError = null;
                this.handleLocationSuccess(position, isAutomatic);
            },
            (error) => {
                console.error('Error de geolocalización:', error);
                this.lastGeolocationError = error;
                this.handleLocationError(error, isAutomatic);
            },
            options
        );
    }


    // Manejar éxito en la detección de ubicación
    async handleLocationSuccess(position, isAutomatic = false) {
        const { latitude, longitude } = position.coords;
        this.userLocation = { lat: latitude, lon: longitude };

        console.log(`Ubicación detectada: ${latitude}, ${longitude}`);

        // Restaurar botón
        const detectBtn = document.getElementById('detectLocationBtn');
        if (detectBtn) {
            detectBtn.innerHTML = '<i class="fas fa-location-arrow me-2"></i>Detectar mi ubicación';
            detectBtn.disabled = false;
        }

        try {
            // Primero centrar el mapa y agregar marcador del usuario
            console.log('Centrando mapa en ubicación del usuario...');
            this.map.setView([latitude, longitude], 10);
            this.addUserLocationMarker(latitude, longitude);

            // Obtener nombre de la ciudad más cercana usando geocodificación inversa
            console.log('Obteniendo nombre de ciudad...');
            const cityName = await this.reverseGeocode(latitude, longitude);
            console.log(`Ciudad detectada: ${cityName}`);
            
            if (!isAutomatic) {
                this.showAlert(`Ubicación detectada: ${cityName}`, 'success');
            }

            // Seleccionar la ubicación detectada
            console.log('Seleccionando ciudad global...');
            await this.selectGlobalCity(cityName, latitude, longitude);

        } catch (error) {
            console.error('Error al procesar ubicación:', error);
            if (!isAutomatic) {
                this.showAlert('Error al obtener datos de tu ubicación', 'error');
            }
            // Fallback a Huancayo
            this.selectCity('huancayo');
        }
    }

    // Manejar errores en la detección de ubicación
    handleLocationError(error, isAutomatic = false) {
        const detectBtn = document.getElementById('detectLocationBtn');
        
        // Restaurar botón
        if (detectBtn) {
            detectBtn.innerHTML = '<i class="fas fa-location-arrow me-2"></i>Detectar mi ubicación';
            detectBtn.disabled = false;
        }

        let message = 'Error al detectar ubicación';
        let isRetryable = false;

        console.error(`Error de geolocalización (código ${error.code}):`, error.message);

        switch (error.code) {
            case error.PERMISSION_DENIED:
                message = 'Permisos de ubicación denegados';
                console.log('Permisos denegados - mostrando mensaje específico');
                this.showLocationDeniedMessage();
                return; // Salir temprano para permisos denegados
            case error.POSITION_UNAVAILABLE:
                message = 'Ubicación no disponible';
                isRetryable = this.geolocationRetries < this.maxGeolocationRetries;
                break;
            case error.TIMEOUT:
                message = 'Tiempo de espera agotado';
                isRetryable = this.geolocationRetries < this.maxGeolocationRetries;
                break;
        }

        // Solo mostrar mensajes de error si no es automático o si es el primer intento
        if (!isAutomatic || this.geolocationRetries === 1) {
            console.error('Error de geolocalización:', message, `(Intento ${this.geolocationRetries}/${this.maxGeolocationRetries})`);
            
            if (!isAutomatic) {
                this.showAlert(message, 'warning');
            }
        }

        // Mostrar mensaje apropiado según el número de reintentos
        if (this.geolocationRetries >= this.maxGeolocationRetries) {
            console.log('Máximo de reintentos alcanzado - mostrando mensaje de fallo');
            if (this.isMacOS) {
                this.showMacOSLocationErrorMessage();
            } else {
                this.showLocationFailedMessage();
            }
        } else if (isRetryable) {
            // Solo mostrar mensaje de error en el primer intento para evitar spam
            if (this.geolocationRetries === 1) {
                this.showLocationErrorMessage(message, true); // true indica que se puede reintentar
            }
            // Reintentar automáticamente después de un breve delay
            setTimeout(() => {
                console.log('Reintentando geolocalización automáticamente...');
                this.proceedWithGeolocation(isAutomatic);
            }, 2000);
        } else {
            this.showLocationErrorMessage(message, false);
        }
    }

    // Mostrar mensaje cuando hay error en la detección de ubicación
    showLocationErrorMessage(errorMessage, canRetry = true) {
        const infoPanel = document.getElementById('infoPanel');
        if (infoPanel) {
            const retryButton = canRetry ? `
                <button class="btn btn-outline-primary btn-sm me-2" onclick="window.co2Monitor.detectUserLocation(false)">
                    <i class="fas fa-location-arrow me-1"></i>
                    Intentar de nuevo (${this.maxGeolocationRetries - this.geolocationRetries} intentos restantes)
                </button>
            ` : '';
            const manualButton = ``;
            const macTip = this.isMacOS ? `
                <p class="small text-muted mt-2">
                    <i class="fas fa-apple-alt me-1"></i>
                    En macOS/Safari, activa Servicios de Ubicación en macOS (Privacidad y Seguridad) y permite la ubicación para este sitio en Safari.
                </p>
            ` : '';
            infoPanel.innerHTML = `
                <div class="text-center text-muted">
                    <i class="fas fa-exclamation-triangle fa-2x mb-2 text-warning"></i>
                    <p class="mb-2"><strong>${errorMessage}</strong></p>
                    <div class="mt-3">
                        ${retryButton}
                        ${manualButton}
                    </div>
                    ${macTip}
                </div>
            `;
        }
    }

    // Mostrar mensaje cuando se agotaron los reintentos
    showLocationFailedMessage() {
        const infoPanel = document.getElementById('infoPanel');
        if (infoPanel) {
            infoPanel.innerHTML = `
                <div class="text-center text-muted">
                    <i class="fas fa-times-circle fa-2x mb-2 text-danger"></i>
                    <p class="mb-2"><strong>No se pudo detectar tu ubicación</strong></p>
                    <p class="small">Se agotaron los intentos de detección automática</p>
                    <div class="mt-3">
                        <button class="btn btn-primary btn-sm me-2" onclick="window.co2Monitor.resetGeolocationAndRetry()">
                            <i class="fas fa-redo me-1"></i>
                            Reiniciar detección
                        </button>
                    </div>
                    <p class="small text-muted mt-2">
                        <i class="fas fa-lightbulb me-1"></i>
                        Consejo: Verifica que los permisos de ubicación estén habilitados en tu navegador
                    </p>
                </div>
            `;
        }
    }

    // Mostrar mensaje específico para errores de macOS CoreLocation
    showMacOSLocationErrorMessage() {
        const infoPanel = document.getElementById('infoPanel');
        if (infoPanel) {
            infoPanel.innerHTML = `
                <div class="text-center text-muted">
                    <i class="fas fa-apple-alt fa-2x mb-2 text-warning"></i>
                    <p class="mb-2"><strong>Error de CoreLocation en macOS</strong></p>
                    <p class="small">La detección de ubicación en macOS puede fallar debido a limitaciones del sistema</p>
                    <div class="mt-3">
                        <button class="btn btn-primary btn-sm me-2" onclick="window.co2Monitor.resetGeolocationAndRetry()">
                            <i class="fas fa-redo me-1"></i>
                            Intentar de nuevo
                        </button>
                    </div>
                    <p class="small text-muted mt-2">
                        <i class="fas fa-lightbulb me-1"></i>
                        Recomendamos seleccionar una ciudad manualmente para mejor experiencia en macOS
                    </p>
                </div>
            `;
        }
    }

    // Reiniciar el sistema de geolocalización
    resetGeolocationAndRetry() {
        this.geolocationRetries = 0;
        this.lastGeolocationError = null;
        console.log('Reiniciando sistema de geolocalización...');
        
        // Detectar ubicación inmediatamente sin delay
        this.detectUserLocation(false);
    }

    // Geocodificación inversa para obtener nombre de ciudad
    async reverseGeocode(lat, lon) {
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`);
            const data = await response.json();
            
            if (data && data.address) {
                // Priorizar ciudad, luego pueblo, luego estado
                return data.address.city || 
                       data.address.town || 
                       data.address.village || 
                       data.address.state || 
                       data.address.country || 
                       'Ubicación desconocida';
            }
            
            return 'Ubicación desconocida';
        } catch (error) {
            console.error('Error en geocodificación inversa:', error);
            return 'Ubicación desconocida';
        }
    }

    // Agregar marcador de ubicación del usuario
    addUserLocationMarker(lat, lon) {
        // Remover marcador anterior si existe
        if (this.userLocationMarker) {
            this.map.removeLayer(this.userLocationMarker);
        }

        // Crear icono personalizado para ubicación del usuario
        const userIcon = L.divIcon({
            className: 'user-location-marker',
            html: '<i class="fas fa-user-circle" style="color: #007bff; font-size: 20px;"></i>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        // Agregar marcador
        this.userLocationMarker = L.marker([lat, lon], { icon: userIcon })
            .addTo(this.map)
            .bindPopup('<strong>Tu ubicación</strong>')
            .openPopup();
    }

    async loadCities() {
        try {
            const response = await fetch('/api/cities');
            const data = await response.json();
            
            if (data.success) {
                this.cities = data.cities;
            }
        } catch (error) {
            console.error('Error cargando ciudades:', error);
        }
    }
    
    async handleSearch(query) {
        const suggestions = document.getElementById('searchSuggestions');
        
        if (!query.trim()) {
            suggestions.style.display = 'none';
            return;
        }
        
        // Primero filtrar ciudades predefinidas que coincidan con la búsqueda
        const localMatches = this.cities.filter(city => 
            city.toLowerCase().includes(query.toLowerCase())
        );
        
        // Buscar ciudades globalmente usando la API de geocodificación
        let globalMatches = [];
        try {
            const response = await fetch(`/api/search/cities?q=${encodeURIComponent(query)}&limit=5`);
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    globalMatches = data.cities;
                }
            }
        } catch (error) {
            console.warn('Error buscando ciudades globales:', error);
        }
        
        // Combinar resultados (primero locales, luego globales)
        const allMatches = [];
        
        // Agregar ciudades locales
        localMatches.forEach(city => {
            allMatches.push({
                name: city,
                display_name: this.capitalize(city),
                type: 'local'
            });
        });
        
        // Agregar ciudades globales (evitar duplicados)
        globalMatches.forEach(city => {
            const isLocal = localMatches.some(local => 
                local.toLowerCase() === city.name.toLowerCase()
            );
            if (!isLocal) {
                allMatches.push({
                    name: city.name,
                    display_name: city.display_name,
                    type: 'global',
                    lat: city.lat,
                    lon: city.lon
                });
            }
        });
        
        if (allMatches.length > 0) {
            suggestions.innerHTML = allMatches.map(city => {
                const icon = city.type === 'local' ? 'fas fa-map-pin' : 'fas fa-globe';
                return `<div class="suggestion-item" data-city="${city.name}" data-type="${city.type}" 
                            ${city.lat ? `data-lat="${city.lat}" data-lon="${city.lon}"` : ''}>
                    <i class="${icon} me-2"></i>${city.display_name}
                    ${city.type === 'global' ? '<small class="text-muted ms-2">(Global)</small>' : ''}
                </div>`;
            }).join('');
            
            suggestions.style.display = 'block';
            
            // Agregar event listeners a las sugerencias
            suggestions.querySelectorAll('.suggestion-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    const cityName = e.target.dataset.city;
                    const cityType = e.target.dataset.type;
                    
                    this.prepareLoadingStateForNewCity(cityName);
                    
                    if (cityType === 'global') {
                        const lat = parseFloat(e.target.dataset.lat);
                        const lon = parseFloat(e.target.dataset.lon);
                        this.selectGlobalCity(cityName, lat, lon);
                    } else {
                        this.selectCity(cityName);
                    }
                    
                    suggestions.style.display = 'none';
                    document.getElementById('citySearch').value = '';
                });
            });
        } else {
            suggestions.style.display = 'none';
        }
    }
    
    async performSearch(query) {
        if (!query.trim()) return;
        
        const cityName = query.trim();
        
        // Primero intentar con ciudades locales
        const localCity = this.cities.find(city => 
            city.toLowerCase() === cityName.toLowerCase()
        );
        
        if (localCity) {
            this.selectCity(localCity);
        } else {
            // Buscar globalmente
            try {
                const response = await fetch(`/api/search/cities?q=${encodeURIComponent(cityName)}&limit=1`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.cities.length > 0) {
                        const city = data.cities[0];
                        this.selectGlobalCity(city.name, city.lat, city.lon);
                    } else {
                        this.showAlert('Ciudad no encontrada. Intenta con otra ciudad.', 'warning');
                    }
                } else {
                    this.showAlert('Error al buscar la ciudad. Intenta nuevamente.', 'error');
                }
            } catch (error) {
                console.error('Error buscando ciudad:', error);
                this.showAlert('Error al buscar la ciudad. Intenta nuevamente.', 'error');
            }
        }
        
        document.getElementById('citySearch').value = '';
        document.getElementById('searchSuggestions').style.display = 'none';
    }
    
    async selectGlobalCity(cityName, lat, lon) {
        this.currentCity = cityName;
        this.showLoading(true);
        
        console.log(`Seleccionando ciudad global: ${cityName} en coordenadas ${lat}, ${lon}`);
        
        try {
            // Centrar el mapa en las coordenadas de la ciudad antes de obtener los datos
            this.map.setView([lat, lon], 10);
            
            // Iniciar carga de clima y AQI mientras se cargan datos de CO2
            fetchAndDisplayWeather(lat, lon, cityName);
            
            // Obtener datos de CO2 usando coordenadas personalizadas
            console.log('Solicitando datos de CO2...');
            const co2Response = await fetch(`/api/co2/custom?lat=${lat}&lon=${lon}`);
            const co2Data = await co2Response.json();
            
            console.log('Respuesta de CO2:', co2Data);
            
            if (!co2Data.success) {
                throw new Error(co2Data.error);
            }
            
            // Agregar información de la ciudad a los datos
            co2Data.data.city_name = cityName;
            co2Data.data.city_coordinates = {
                lat: lat,
                lon: lon
            };
            
            console.log('Mostrando datos de CO2...');
            // Mostrar datos
            this.displayCO2Data(co2Data.data);
            this.addMarkerToMap(co2Data.data);
            this.updateActiveButton(null); // No hay botón activo para ciudades globales
            
        } catch (error) {
            console.error('Error cargando datos de CO2:', error);
            
            // Mostrar mensaje de error más específico
            let errorMessage = 'Error al cargar datos de CO2';
            if (error.message) {
                if (error.message.includes('API key')) {
                    errorMessage = 'Error de autenticación con la API de Copernicus';
                } else if (error.message.includes('quota')) {
                    errorMessage = 'Cuota de descarga excedida';
                } else if (error.message.includes('network') || error.message.includes('connection')) {
                    errorMessage = 'Error de conexión a internet';
                } else {
                    errorMessage = `Error: ${error.message}`;
                }
            }
            
            this.showAlert(errorMessage, 'error');
        } finally {
            this.showLoading(false);
        }
    }
    
    async selectCity(cityName) {
        this.currentCity = cityName;
        this.showLoading(true);
        
        try {
            // Obtener coordenadas de la ciudad
            const coordsResponse = await fetch(`/api/city/${cityName}/coordinates`);
            const coordsData = await coordsResponse.json();
            
            if (!coordsData.success) {
                throw new Error(coordsData.error);
            }
            
            const cityInfo = coordsData.city;
            
            // Centrar mapa en la ciudad
            this.map.setView([cityInfo.lat, cityInfo.lon], 10);
            
            // Iniciar carga de clima y AQI mientras se cargan datos de CO2
            fetchAndDisplayWeather(cityInfo.lat, cityInfo.lon, cityInfo.name || cityName);
            
            // Obtener datos de CO2
            const co2Response = await fetch(`/api/co2/${cityName}`);
            const co2Data = await co2Response.json();
            
            if (!co2Data.success) {
                throw new Error(co2Data.error);
            }
            
            // Agregar coordenadas de la ciudad a los datos para el marcador
            co2Data.data.city_coordinates = {
                lat: cityInfo.lat,
                lon: cityInfo.lon
            };
            
            // Mostrar datos
            this.displayCO2Data(co2Data.data);
            this.addMarkerToMap(co2Data.data);
            this.updateActiveButton(cityName);
            
        } catch (error) {
            console.error('Error cargando datos de CO2:', error);
            
            // Mostrar mensaje de error más específico
            let errorMessage = 'Error al cargar datos de CO2';
            if (error.message) {
                if (error.message.includes('API key')) {
                    errorMessage = 'Error de autenticación con la API de Copernicus';
                } else if (error.message.includes('quota')) {
                    errorMessage = 'Cuota de descarga excedida';
                } else if (error.message.includes('network') || error.message.includes('connection')) {
                    errorMessage = 'Error de conexión a internet';
                } else {
                    errorMessage = `Error: ${error.message}`;
                }
            }
            
            this.showAlert(errorMessage, 'error');
        } finally {
            this.showLoading(false);
        }
    }
    
    displayCO2Data(data) {
        const infoPanel = document.getElementById('infoPanel');
        const co2Panel = document.getElementById('co2Panel');
        const co2Data = document.getElementById('co2Data');
        
        // Ocultar panel de info y mostrar panel de CO2
        infoPanel.style.display = 'none';
        co2Panel.classList.remove('d-none');
        
        const avgCO2 = data.co2_data.average_ppm;
        const minCO2 = data.co2_data.min_ppm;
        const maxCO2 = data.co2_data.max_ppm;
        
        co2Data.innerHTML = `
            <div class="text-center mb-3">
                <div class="co2-value">
                    ${avgCO2.toFixed(2)}
                    <span class="co2-unit">ppm</span>
                </div>
                <div class="text-center">
                    <small>Promedio de CO2</small>
                </div>
            </div>
            
            <div class="co2-stats">
                <div class="stat-item">
                    <span class="stat-label">Mínimo</span>
                    <div class="stat-value">${minCO2.toFixed(2)} ppm</div>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Máximo</span>
                    <div class="stat-value">${maxCO2.toFixed(2)} ppm</div>
                </div>
            </div>
            
            <div class="mt-3 text-center">
                <small>
                    <i class="fas fa-map-marker-alt me-1"></i>
                    ${data.city_name || data.city} (${data.distance_km.toFixed(1)} km del punto exacto)
                </small>
            </div>
            
            <div class="mt-2 text-center">
                <button class="btn btn-light btn-sm" onclick="co2Monitor.showDetailedData()">
                    <i class="fas fa-chart-line me-1"></i>
                    Ver detalles
                </button>
            </div>
        `;
        
        // Agregar animación
        co2Panel.classList.add('fade-in');
    }
    
    addMarkerToMap(data) {
        // Limpiar marcador/círculo principal anteriores
        if (this.mainMarker) {
            this.map.removeLayer(this.mainMarker);
            this.mainMarker = null;
        }
        if (this.mainCircle) {
            this.map.removeLayer(this.mainCircle);
            this.mainCircle = null;
        }
        this.currentCO2Data = data;
        
        // Usar las coordenadas de la ciudad para el marcador, no las coordenadas de los datos de CO2
        const lat = data.city_coordinates.lat;
        const lon = data.city_coordinates.lon;
        const avgCO2 = data.co2_data.average_ppm;
        const co2Status = data.co2_status;
        const { label: co2HazardLabel, color: co2HazardColor } = getCO2HazardLabelAndColor(avgCO2);
        const co2HazardDescription = avgCO2 <= 800 ? 'Nivel saludable de CO2' : (avgCO2 <= 1200 ? 'Concentración moderada de CO2' : 'Concentración alta de CO2');
        
        // Crear círculo de buffer coloreado según AQI y radio según CO2
        const circle = L.circle([lat, lon], {
            color: co2HazardColor,
            fillColor: co2HazardColor,
            fillOpacity: 0.2,
            radius: co2Status.buffer_radius,
            weight: 3
        }).addTo(this.map);
        
        // Crear marcador personalizado con color según AQI (o CO2 si aún no hay AQI)
        const markerIcon = L.divIcon({
            className: 'co2-marker',
            html: `
                <div class="marker-content" style="background-color: ${co2HazardColor}; border-color: ${co2HazardColor}; color:${getContrastingTextColor(co2HazardColor)};">
                    <div class="co2-value">${avgCO2.toFixed(0)}</div>
                    <div class="co2-unit">ppm</div>
                </div>
            `,
            iconSize: [60, 60],
            iconAnchor: [30, 30]
        });
        const popupTextColor = getContrastingTextColor(co2HazardColor);

        
        const marker = L.marker([lat, lon], { icon: markerIcon }).addTo(this.map);
        
        // Popup con información mejorada (CO2 + AQI si está disponible)
        const popupContent = `
            <div class="popup-container">
                <div class="popup-title">${data.city}</div>
                <div class="popup-status" style="display:flex;align-items:center;gap:8px;color:${popupTextColor};background:#f8f9fa;border-radius:16px;padding:6px 10px;">
                    <span style="width:10px;height:10px;background:${co2HazardColor};border-radius:50%;display:inline-block"></span>
                    <span><strong>${co2HazardLabel}</strong> - ${co2HazardDescription}</span>
                </div>
                ${this.lastAQI ? `
                <div class="popup-aqi" style="color:${this.lastAQI.color}">
                    <i class="fas fa-wind me-1"></i>
                    AQI: ${this.lastAQI.aqi} - ${this.lastAQI.label}
                </div>` : ''}
                <div class="popup-co2">
                    <i class="fas fa-cloud me-1"></i>
                    CO2: ${avgCO2.toFixed(2)} ppm
                </div>
                <div class="popup-range">
                    <small>
                        <i class="fas fa-chart-line me-1"></i>
                        Rango: ${data.co2_data.min_ppm.toFixed(2)} - ${data.co2_data.max_ppm.toFixed(2)} ppm
                    </small>
                </div>
                <div class="popup-info">
                    <small>
                        <i class="fas fa-crosshairs me-1"></i>
                        Ciudad: ${lat.toFixed(4)}°, ${lon.toFixed(4)}°<br>
                        <i class="fas fa-satellite me-1"></i>
                        Datos CO2: ${data.coordinates.actual_lat.toFixed(4)}°, ${data.coordinates.actual_lon.toFixed(4)}°<br>
                        <i class="fas fa-ruler me-1"></i>
                        ${data.distance_km.toFixed(1)} km del punto de datos<br>
                        <i class="fas fa-expand-arrows-alt me-1"></i>
                        Radio de zona: ${(co2Status.buffer_radius / 1000).toFixed(1)} km
                    </small>
                </div>
                <div class="popup-btn">
                    <button class="btn btn-primary btn-sm" onclick="co2Monitor.showDetailedData()">
                        Ver detalles
                    </button>
                </div>
            </div>
        `;
        
        marker.bindPopup(popupContent);
        
        // Guardar el marcador y círculo principales
        this.mainMarker = marker;
        this.mainCircle = circle;
        
        // Asegurarse de que el mapa esté centrado en la ciudad si no lo está ya
        const currentCenter = this.map.getCenter();
        const currentZoom = this.map.getZoom();
        
        // Si la distancia entre el centro actual y la ciudad es mayor de 1 grado o no está en el zoom adecuado
        if (Math.abs(currentCenter.lat - lat) > 1 || Math.abs(currentCenter.lng - lon) > 1 || currentZoom < 7) {
            this.map.setView([lat, lon], Math.max(currentZoom, 10)); // Asegurar un zoom mínimo
        }
    }
    
    updateActiveButton(cityName) {
        // Remover clase active de todos los botones
        document.querySelectorAll('.city-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Agregar clase active al botón seleccionado
        const activeBtn = document.querySelector(`[data-city="${cityName}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    }
    
    showDetailedData() {
        if (!this.currentCity) return;
        const modalEl = document.getElementById('co2Modal');
        const contentEl = document.getElementById('modalContent');
        if (!modalEl || !contentEl) return;

        const cityName = this.currentCity || 'Ciudad';
        const co2Data = this.currentCO2Data;
        const weatherMain = (window.co2Monitor && window.co2Monitor.lastWeatherMain) ? window.co2Monitor.lastWeatherMain : null;
        const weatherDesc = (window.co2Monitor && window.co2Monitor.lastWeatherDescription) ? window.co2Monitor.lastWeatherDescription : null;

        const temperatureHtml = weatherMain && typeof weatherMain.temp !== 'undefined'
            ? `<div class="d-flex align-items-center mb-1"><i class="fas fa-thermometer-half me-2"></i><strong>Temperatura:</strong> ${Math.round(weatherMain.temp)} °C</div>`
            : `<div class="text-muted small mb-1">Temperatura no disponible</div>`;
        const humidityHtml = weatherMain && typeof weatherMain.humidity !== 'undefined'
            ? `<div class="d-flex align-items-center"><i class="fas fa-tint me-2"></i><strong>Humedad:</strong> ${weatherMain.humidity}%</div>`
            : `<div class="text-muted small">Humedad no disponible</div>`;
        const weatherDescHtml = weatherDesc
            ? `<div class="small text-capitalize text-white-50 mt-1"><i class="fas fa-cloud me-2"></i>${weatherDesc}</div>`
            : '';

        let co2Html = '';
        if (co2Data && co2Data.co2_data) {
            const avgCO2 = co2Data.co2_data.average_ppm;
            const minCO2 = co2Data.co2_data.min_ppm;
            const maxCO2 = co2Data.co2_data.max_ppm;
            co2Html = `
                <div class="row g-3">
                    <div class="col-12 col-md-4 text-center">
                        <div class="co2-value">
                            ${avgCO2.toFixed(2)} <span class="co2-unit">ppm</span>
                        </div>
                        <div class="small text-white-50">Promedio</div>
                    </div>
                    <div class="col-6 col-md-4">
                        <div class="small text-white-50">Mínimo</div>
                        <div class="fw-bold">${minCO2.toFixed(2)} ppm</div>
                    </div>
                    <div class="col-6 col-md-4">
                        <div class="small text-white-50">Máximo</div>
                        <div class="fw-bold">${maxCO2.toFixed(2)} ppm</div>
                    </div>
                </div>`;
        } else {
            co2Html = `<div class="text-muted small">Datos de CO2 no disponibles aún...</div>`;
        }

        contentEl.innerHTML = `
            <div class="bg-dark text-white p-2 rounded">
                <h6 class="mb-3"><i class="fas fa-city me-2"></i>${this.capitalize(cityName)}</h6>
                <div class="mb-3">
                    <h6 class="mb-2"><i class="fas fa-cloud-sun me-2"></i>Clima (OpenWeatherMap)</h6>
                    ${temperatureHtml}
                    ${humidityHtml}
                    ${weatherDescHtml}
                </div>
                <div>
                    <h6 class="mb-2"><i class="fas fa-smog me-2"></i>CO2</h6>
                    ${co2Html}
                </div>
            </div>
        `;

        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    }
    
    showLoading(show) {
        const spinner = document.getElementById('loadingSpinner');
        const co2Panel = document.getElementById('co2Panel');
        const infoPanel = document.getElementById('infoPanel');
        
        if (show) {
            spinner.classList.remove('d-none');
            co2Panel.classList.add('d-none');
            // No ocultar el infoPanel para permitir mostrar Clima/AQI mientras carga CO2
            // infoPanel.style.display = 'none';
        } else {
            spinner.classList.add('d-none');
        }
    }
    
    // Preparar estado de carga para nueva ciudad: limpiar paneles y mostrar mensaje
    prepareLoadingStateForNewCity(cityName) {
        const infoPanel = document.getElementById('infoPanel');
        const co2Panel = document.getElementById('co2Panel');
        const co2DataEl = document.getElementById('co2Data');
        const aqiCardEl = document.getElementById('aqiCard');
        
        // Limpiar contenidos previos
        if (co2DataEl) co2DataEl.innerHTML = '';
        if (aqiCardEl) aqiCardEl.innerHTML = '';
        
        // Ocultar panel de CO2 y quitar animación
        if (co2Panel) {
            co2Panel.classList.add('d-none');
            co2Panel.classList.remove('fade-in');
        }
        
        // Mostrar mensaje de carga en el infoPanel
        if (infoPanel) {
            infoPanel.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-spinner fa-spin me-2"></i>
                    Cargando datos de la nueva ciudad: <strong>${this.capitalize(cityName)}</strong>...
                </div>
            `;
            infoPanel.style.display = 'block';
        }
        
        // Mostrar spinner general
        this.showLoading(true);
        
        // Limpiar marcador/círculo principales del mapa
        if (this.mainMarker) {
            this.map.removeLayer(this.mainMarker);
            this.mainMarker = null;
        }
        if (this.mainCircle) {
            this.map.removeLayer(this.mainCircle);
            this.mainCircle = null;
        }
        
        // Limpiar marcador de AQI si existe
        try {
            clearAQIMarker();
        } catch (e) {
            // Ignorar si no existe
        }
        
        // Reset de datos actuales
        this.currentCO2Data = null;
        // Reset de datos de clima para evitar mostrar valores antiguos en el modal
        this.lastWeatherMain = null;
        this.lastWeatherDescription = null;
    }
    
    showAlert(message, type = 'info') {
        // Crear alerta temporal
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        alertDiv.style.cssText = 'top: 70px; right: 20px; z-index: 9999; max-width: 300px;';
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(alertDiv);
        
        // Auto-remover después de 5 segundos
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }
    
    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

// Inicializar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.co2Monitor = new CO2Monitor();
});

// Función global para mostrar datos detallados (llamada desde HTML)
function showDetailedData() {
    if (window.co2Monitor) {
        window.co2Monitor.showDetailedData();
    }
}

// Utilidad: color de texto con buen contraste para fondos hex
function getContrastingTextColor(hex) {
    try {
        if (!hex) return '#0F172A';
        const c = hex.replace('#','');
        if (c.length < 6) return '#0F172A';
        const r = parseInt(c.substring(0,2), 16);
        const g = parseInt(c.substring(2,4), 16);
        const b = parseInt(c.substring(4,6), 16);
        const yiq = (r*299 + g*587 + b*114) / 1000;
        return yiq >= 186 ? '#0F172A' : '#FFFFFF';
    } catch (e) {
        return '#0F172A';
    }
}

// --- Integración OpenWeatherMap (Clima + AQI) ---
async function fetchAndDisplayWeather(lat, lon, cityName) {
    try {
        const resp = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
        const data = await resp.json();
        if (!data.success) {
            console.warn('No se pudo obtener datos de clima/AQI:', data.error);
            getAirPollution(lat, lon, cityName);
            return;
        }
        if (window.co2Monitor) {
            window.co2Monitor.lastWeatherMain = (data.weather && data.weather.main) ? data.weather.main : null;
            window.co2Monitor.lastWeatherDescription = (data.weather && Array.isArray(data.weather.weather) && data.weather.weather[0]) ? data.weather.weather[0].description : null;
        }
        renderWeatherPanel(cityName, data);
        if (data.air_quality && data.air_quality.aqi) {
            addAQIMarker(lat, lon, data.air_quality);
        }
    } catch (err) {
        console.error('Error al cargar clima/AQI:', err);
        getAirPollution(lat, lon, cityName);
    }
}
function renderWeatherPanel(cityName, data) {
    const infoPanel = document.getElementById('infoPanel');
    if (!infoPanel) return;

    // Mostrar un panel informativo básico si no hay datos
    if (!data || (!data.weather && !data.air_quality)) {
        infoPanel.innerHTML = `
            <div class="card bg-dark text-white">
                <div class="card-body p-2">
                    <h6 class="mb-2"><i class="fas fa-cloud-sun me-2"></i>Clima y AQI</h6>
                    <div>Mostrando información mientras se carga CO2...</div>
                </div>
            </div>
        `;
        infoPanel.style.display = 'block';
        return;
    }

    // Si sólo hay datos de AQI (sin clima), renderizar un panel simplificado
    if (!data.weather && data.air_quality) {
        const aq = data.air_quality;
        const aqiCard = document.getElementById('aqiCard');
        const aqi = aq.aqi || 'N/A';
        const aqiLabel = aq.label || 'Calidad de aire';
        const aqiColor = aq.color || '#6c757d';

        // Actualizar el card independiente de AQI dentro del co2Panel
        if (aqiCard) {
            aqiCard.innerHTML = `
                <div class="card bg-dark text-white mt-2">
                    <div class="card-body p-2">
                        <div class="mt-1 p-2 rounded" style="background:${aqiColor}33;border-left:4px solid ${aqiColor}">
                            <i class="fas fa-wind me-2" style="color:${aqiColor}"></i>
                            <strong>Índice de Calidad del Aire (AQI):</strong>
                            <span class="badge ms-2 aqi-badge" style="background:${aqiColor};color:${getContrastingTextColor(aqiColor)}">${aqi} · ${aqiLabel}</span>
                        </div>
                        ${aq.components ? `
                        <div class="small mt-2">
                            <div>Componentes:</div>
                            <div>PM2.5: ${aq.components.pm2_5 ?? 'N/A'} μg/m³ · PM10: ${aq.components.pm10 ?? 'N/A'} μg/m³</div>
                            <div>O3: ${aq.components.o3 ?? 'N/A'} μg/m³ · NO2: ${aq.components.no2 ?? 'N/A'} μg/m³</div>
                            <div>SO2: ${aq.components.so2 ?? 'N/A'} μg/m³ · CO: ${aq.components.co ?? 'N/A'} μg/m³</div>
                        </div>` : ''}
                    </div>
                </div>
            `;
            // Asegurar que el panel de CO2 se muestre para ver el card de AQI
            const co2Panel = document.getElementById('co2Panel');
            if (co2Panel) {
                co2Panel.classList.remove('d-none');
                co2Panel.classList.add('fade-in');
            }
            // Mostrar placeholder de CO2 mientras carga
            const co2DataEl = document.getElementById('co2Data');
            if (co2DataEl && !co2DataEl.innerHTML.trim()) {
                co2DataEl.innerHTML = `
                    <div class="text-center text-white-50 small">Cargando datos de CO2...</div>
                `;
            }
        }

        // También mantener el panel infoPanel para mostrar AQI cuando aún no se ve el co2Panel
        infoPanel.innerHTML = `
            <div class="card bg-dark text-white">
                <div class="card-body p-2">
                    <h6 class="mb-2"><i class="fas fa-cloud-sun me-2"></i>Clima y AQI</h6>
                    <div class="mt-1 p-2 rounded" style="background:${aqiColor}33;border-left:4px solid ${aqiColor}">
                        <i class="fas fa-wind me-2" style="color:${aqiColor}"></i>
                        <strong>Índice de Calidad del Aire (AQI):</strong>
                        <span class="badge ms-2 aqi-badge" style="background:${aqiColor};color:${getContrastingTextColor(aqiColor)}">${aqi} · ${aqiLabel}</span>
                    </div>
                    <div class="text-muted small mt-2">Mostrando AQI mientras se cargan datos de CO2...</div>
                </div>
            </div>
        `;
        infoPanel.style.display = 'block';
        return;
    }

    // Si hay clima y AQI
    const aq = data.air_quality || {};
    const aqiCard = document.getElementById('aqiCard');
    const aqi = aq.aqi || 'N/A';
    const aqiLabel = aq.label || 'Calidad de aire';
    const aqiColor = aq.color || '#6c757d';

    // Actualizar el card independiente de AQI dentro del co2Panel
    if (aqiCard) {
        aqiCard.innerHTML = `
            <div class="card bg-dark text-white mt-2">
                <div class="card-body p-2">
                    <div class="mt-1 p-2 rounded" style="background:${aqiColor}33;border-left:4px solid ${aqiColor}">
                    <i class="fas fa-wind me-2" style="color:${aqiColor}"></i>
                    <strong>Índice de Calidad del Aire (AQI):</strong>
                    <span class="badge ms-2 aqi-badge" style="background:${aqiColor};color:${getContrastingTextColor(aqiColor)}">${aqi} · ${aqiLabel}</span>
                    </div>
                    ${aq.components ? `
                    <div class="small mt-2">
                        <div>Componentes:</div>
                        <div>PM2.5: ${aq.components.pm2_5 ?? 'N/A'} μg/m³ · PM10: ${aq.components.pm10 ?? 'N/A'} μg/m³</div>
                        <div>O3: ${aq.components.o3 ?? 'N/A'} μg/m³ · NO2: ${aq.components.no2 ?? 'N/A'} μg/m³</div>
                        <div>SO2: ${aq.components.so2 ?? 'N/A'} μg/m³ · CO: ${aq.components.co ?? 'N/A'} μg/m³</div>
                    </div>` : ''}
                </div>
            </div>
        `;
        // Asegurar que el panel de CO2 se muestre para ver el card de AQI
        const co2Panel = document.getElementById('co2Panel');
        if (co2Panel) {
            co2Panel.classList.remove('d-none');
            co2Panel.classList.add('fade-in');
        }
        // Mostrar placeholder de CO2 mientras carga (si aún no hay contenido)
        const co2DataEl = document.getElementById('co2Data');
        if (co2DataEl && !co2DataEl.innerHTML.trim()) {
            co2DataEl.innerHTML = `
                <div class="text-center text-white-50 small">Cargando datos de CO2...</div>
            `;
        }
    }

    // Mantener también el infoPanel para estado durante la carga
    infoPanel.innerHTML = `
        <div class="card bg-dark text-white">
            <div class="card-body p-2">
                <h6 class="mb-2"><i class="fas fa-cloud-sun me-2"></i>Clima y AQI</h6>
                <div class="mt-1 p-2 rounded" style="background:${aqiColor}33;border-left:4px solid ${aqiColor}">
                    <i class="fas fa-wind me-2" style="color:${aqiColor}"></i>
                    <strong>Índice de Calidad del Aire (AQI):</strong>
                    <span class="badge ms-2 aqi-badge" style="background:${aqiColor};color:${getContrastingTextColor(aqiColor)}">${aqi} · ${aqiLabel}</span>
                </div>
                <div class="text-muted small mt-2">Mostrando clima y AQI mientras se cargan datos de CO2...</div>
            </div>
        </div>
    `;
    infoPanel.style.display = 'block';
}

function addAQIMarker(lat, lon, air_quality) {
    const monitor = window.co2Monitor;
    if (!monitor || !monitor.map) return;
    
    // Actualizar último AQI
    monitor.lastAQI = air_quality;
    
    // Usar color del AQI si está disponible, sino fallback al color por CO2
    const hazardColor = (air_quality && air_quality.color)
        ? air_quality.color
        : ((monitor.currentCO2Data && monitor.currentCO2Data.co2_data)
            ? getCO2HazardLabelAndColor(monitor.currentCO2Data.co2_data.average_ppm).color
            : '#6c757d');
    const aqi = air_quality.aqi || 'N/A';
    const label = air_quality.label || 'Calidad de aire';
    
    // Si ya existe el marcador principal, actualizar su icono y el círculo
    if (monitor.mainMarker) {
        const markerIcon = L.divIcon({
            className: 'co2-marker',
            html: `
                <div class="marker-content" style="background-color: ${hazardColor}; border-color: ${hazardColor}; color:${getContrastingTextColor(hazardColor)};">
                    <div class="co2-value">${monitor.currentCO2Data ? monitor.currentCO2Data.co2_data.average_ppm.toFixed(0) : ''}</div>
                    <div class="co2-unit">ppm</div>
                </div>
            `,
            iconSize: [60, 60],
            iconAnchor: [30, 30]
        });
        monitor.mainMarker.setIcon(markerIcon);
        
        if (monitor.mainCircle) {
            monitor.mainCircle.setStyle({ color: hazardColor, fillColor: hazardColor });
        } else {
            monitor.mainCircle = L.circle([lat, lon], {
                color: hazardColor,
                fillColor: hazardColor,
                fillOpacity: 0.15,
                radius: 4000,
                weight: 2
            }).addTo(monitor.map);
        }
        
        // Reconstruir el marcador/popup con ambos datos si ya tenemos CO2
        if (monitor.currentCO2Data) {
            monitor.addMarkerToMap(monitor.currentCO2Data);
        } else {
            const popup = `
                <div>
                    <div class="fw-bold" style="color:${getContrastingTextColor(hazardColor)}">${label} (AQI ${aqi})</div>
                    <div class="small">Se actualizará con datos de CO2...</div>
                </div>
            `;
            monitor.mainMarker.bindPopup(popup);
        }
        return;
    }
    
    // Si no existe el marcador principal, crearlo ahora usando color de AQI si ya está
    const circle = L.circle([lat, lon], {
        color: hazardColor,
        fillColor: hazardColor,
        fillOpacity: 0.15,
        radius: 4000,
        weight: 2
    }).addTo(monitor.map);
    
    const markerIcon = L.divIcon({
        className: 'co2-marker',
        html: `
            <div class="marker-content" style="background-color: ${hazardColor}; border-color: ${hazardColor}; color:${getContrastingTextColor(hazardColor)};">
                <div class="co2-value"></div>
                <div class="co2-unit">ppm</div>
            </div>
        `,
        iconSize: [60, 60],
        iconAnchor: [30, 30]
    });
    const marker = L.marker([lat, lon], { icon: markerIcon }).addTo(monitor.map);
    
    const popup = `
        <div>
            <div class="fw-bold" style="color:${getContrastingTextColor(hazardColor)}">${label} (AQI ${aqi})</div>
            <div class="small">Se actualizará con datos de CO2...</div>
        </div>
    `;
    marker.bindPopup(popup);
    
    monitor.mainMarker = marker;
    monitor.mainCircle = circle;
    monitor.tempAQI = { marker: null, circle: null };
}

function clearAQIMarker() {
    const monitor = window.co2Monitor;
    if (!monitor || !monitor.map) return;
    
    // Restablecer estado AQI y reconstruir el marcador principal si hay CO2
    monitor.lastAQI = null;
    if (monitor.currentCO2Data && monitor.mainMarker) {
        monitor.addMarkerToMap(monitor.currentCO2Data);
    }
}

// Helper para mapear AQI (1-6) a etiqueta y color según estándar solicitado
function getAQILabelAndColor(aqi) {
    switch (aqi) {
        case 1: return { label: 'Verde (Buena)', color: '#00E400' };       // Verde
        case 2: return { label: 'Amarillo (Moderada)', color: '#FFFF00' }; // Amarillo
        case 3: return { label: 'Naranja (Insalubre para grupos sensibles)', color: '#FF7E00' }; // Naranja
        case 4: return { label: 'Rojo (Insalubre)', color: '#FF0000' };    // Rojo
        case 5: return { label: 'Morado (Muy insalubre)', color: '#8F3F97' }; // Morado
        case 6: return { label: 'Granate (Peligroso)', color: '#7E0023' }; // Granate
        default: return { label: 'Desconocido', color: '#6B7280' }; // Gris neutro
    }
}

// Fallback: obtener calidad del aire directamente desde OpenWeatherMap (sin pasar por backend)
function getAirPollution(lat, lon, cityName) {
    const apiKey = window.OPENWEATHERMAP_API_KEY;
    if (!apiKey) {
        console.warn('OPENWEATHERMAP_API_KEY no establecido en el navegador. Usa el backend o define window.OPENWEATHERMAP_API_KEY.');
        renderWeatherPanel(cityName, null);
        return;
    }
    
    fetch(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`)
        .then(resp => {
            if (!resp.ok) throw new Error('Respuesta no OK');
            return resp.json();
        })
        .then(json => {
            if (json.list && json.list.length > 0) {
                const entry = json.list[0];
                const aqi = entry.main && entry.main.aqi;
                const comps = entry.components || {};
                const { label, color } = getAQILabelAndColor(aqi);
                const air_quality = { aqi, label, color, components: comps };
                
                // Renderizar panel sólo con AQI
                renderWeatherPanel(cityName, { air_quality });
                // Dibujar marcador/círculo temporal de AQI
                addAQIMarker(lat, lon, air_quality);
            } else {
                renderWeatherPanel(cityName, null);
            }
        })
        .catch(err => {
            console.error('Error al obtener Air Pollution:', err);
            renderWeatherPanel(cityName, null);
        });
}

// Helper para peligrosidad del CO2 por ppm
function getCO2HazardLabelAndColor(ppm) {
    // Escala proporcionada por el usuario
    if (ppm <= 800) {
        return { label: 'Bueno', color: '#2ecc71' };
    }
    if (ppm <= 1200) {
        return { label: 'Aceptable', color: '#f1c40f' };
    }
    // > 1200 ppm
    return { label: 'Peligroso', color: '#e74c3c' };
}
