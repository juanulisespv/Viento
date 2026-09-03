/**
 * Previsión de Viento Modular para Embalses y Spots de Costa (Wingfoil / Windsurf)
 * Incluye: Múltiples Zonas Seleccionables, Cuadrícula Densa Auto-calculada por Coordenadas,
 * Mejores Ventanas Automáticas, Resumen Semanal y Caché por Zona/Modelo.
 */

// --- Registro Modular de Zonas y Spots ---
const SPOT_REGIONS = [
  {
    id: 'ullibarri',
    name: 'Ullíbarri & Urrunaga (Álava)',
    title: 'Viento Llanada Alavesa',
    subtitle: 'Ullíbarri-Gamboa & Urrunaga — Wingfoil & Windsurf',
    spots: [
      { id: 'garaio', name: 'Garaio (Club Náutico)', lat: 42.9062, lon: -2.5449, notes: 'Acceso fácil por el club. Térmico limpio N/NW en verano.' },
      { id: 'landa', name: 'Landa (Playa / Norte)', lat: 42.9433, lon: -2.5870, notes: 'Playa norte de Ullíbarri-Gamboa.' },
      { id: 'urrunaga', name: 'Urrunaga (Legutio)', lat: 42.9720, lon: -2.6543, notes: 'Embalse de Legutio. Buena entrada con frentes W/NW.' }
    ]
  },
  {
    id: 'ebro',
    name: 'Embalse del Ebro (Arija & Cabañas)',
    title: 'Embalse del Ebro',
    subtitle: 'Arija & Cabañas de Virtus — Térmico N/NE (15–25 kn)',
    spots: [
      { id: 'arija', name: 'Arija (Embalse del Ebro)', lat: 42.9934, lon: -3.9486, notes: 'Térmico N/NE (15-25kn) y frentes W/SW. Chop moderado, orilla arenosa muy segura. Ideal para progresar con W945.' },
      { id: 'cabanas', name: 'Cabañas de Virtus', lat: 42.9868, lon: -3.8711, notes: 'Frentes W/SW y téemico N/NE constante.' }
    ]
  },
  {
    id: 'yesa',
    name: 'Embalse de Yesa (Navarra)',
    title: 'Embalse de Yesa',
    subtitle: 'Yesa (Navarra) — Cierzo (NW) Encañonado',
    spots: [
      { id: 'yesa', name: 'Embalse de Yesa', lat: 42.6175, lon: -1.1897, notes: 'Cierzo (NW) encañonado con fuerza y racheado. Agua plana a chop corto. Ojo con cambios de nivel y piedras/barro.' }
    ]
  },
  {
    id: 'regaton',
    name: 'Playa del Regatón (Laredo)',
    title: 'Ría de Treto / Laredo',
    subtitle: 'Playa del Regatón — Agua Plana en Ría',
    spots: [
      { id: 'regaton', name: 'Playa del Regatón (Laredo)', lat: 43.4072, lon: -3.4475, notes: 'Térmico NE o SW/NW. Agua plana en ría. Consultar mareas (funciona con media marea subiendo para mástil 72cm).' }
    ]
  },
  {
    id: 'ereaga',
    name: 'El Abra / Ereaga (Getxo)',
    title: 'El Abra / Getxo',
    subtitle: 'Playa de Ereaga — Resguardo de Temporales NW',
    spots: [
      { id: 'ereaga', name: 'Playa de Ereaga (Getxo)', lat: 43.3486, lon: -3.0134, notes: 'NW fuerte o W. Zona resguardada tras el espigón. Ideal cuando en el interior no hay viento.' }
    ]
  },
  {
    id: 'chingudi',
    name: 'Bahía de Txingudi (Hondarribia)',
    title: 'Bahía de Txingudi',
    subtitle: 'Hondarribia / Hendaya — Transiciones en Agua Plana',
    spots: [
      { id: 'chingudi', name: 'Bahía de Txingudi (Hondarribia)', lat: 43.3642, lon: -1.7820, notes: 'NW, N o W. Bahía cerrada con agua plana. Ojo con corrientes de marea en el canal central.' }
    ]
  }
];

// Grid de resolución Open-Meteo (14x14 = 196 puntos por zona)
const API_GRID_ROWS = 14;
const API_GRID_COLS = 14;

// --- Estado Global ---
let selectedRegionId = 'ullibarri';
let rawApiPoints = [];
let spotDataStore = {};
let currentHourIndex = 0;
let selectedUnit = 'knots';
let selectedModel = 'arome_france_hd'; // 🇫🇷 AROME HD por defecto
let isPlaying = false;
let playInterval = null;
let map = null;
let gridMarkers = [];
let spotMarkers = [];

// --- Helpers para Obtener Región / Spots / BBOX ---
function getCurrentRegion() {
  return SPOT_REGIONS.find(r => r.id === selectedRegionId) || SPOT_REGIONS[0];
}

function getCurrentSpots() {
  return getCurrentRegion().spots;
}

function calculateCurrentBBox() {
  const region = getCurrentRegion();
  const lats = region.spots.map(s => s.lat);
  const lons = region.spots.map(s => s.lon);

  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLon = Math.min(...lons);
  let maxLon = Math.max(...lons);

  let latSpan = maxLat - minLat;
  let lonSpan = maxLon - minLon;

  const minLatSpan = 0.11;
  const minLonSpan = 0.15;

  const targetLatSpan = Math.max(latSpan * 1.6, minLatSpan);
  const targetLonSpan = Math.max(lonSpan * 1.6, minLonSpan);

  const midLat = (minLat + maxLat) / 2;
  const midLon = (minLon + maxLon) / 2;

  return {
    minLat: parseFloat((midLat - targetLatSpan / 2).toFixed(4)),
    maxLat: parseFloat((midLat + targetLatSpan / 2).toFixed(4)),
    minLon: parseFloat((midLon - targetLonSpan / 2).toFixed(4)),
    maxLon: parseFloat((midLon + targetLonSpan / 2).toFixed(4))
  };
}

// --- Inicialización ---
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initEventListeners();
  renderSpotCards();
  loadData();
});

// --- Configuración de Leaflet ---
function initMap() {
  const esriDark = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 16,
    attribution: 'Tiles &copy; Esri',
    crossOrigin: 'anonymous'
  });

  const osmStandard = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
    crossOrigin: 'anonymous'
  });

  const esriSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18,
    attribution: 'Tiles &copy; Esri Satellite',
    crossOrigin: 'anonymous'
  });

  const bbox = calculateCurrentBBox();

  map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
    layers: [esriDark]
  });

  map.fitBounds([
    [bbox.minLat, bbox.minLon],
    [bbox.maxLat, bbox.maxLon]
  ], { padding: [20, 20] });

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  const baseMaps = {
    "Oscuro": esriDark,
    "Satélite": esriSatellite,
    "Mapa Callejero": osmStandard
  };

  L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);

  L.control.attribution({ position: 'bottomright' })
    .addAttribution('&copy; <a href="https://open-meteo.com/">Open-Meteo API</a>')
    .addTo(map);

  renderSpotMarkersOnMap();

  map.on('zoomend moveend', () => {
    renderGridMarkers();
  });
}

function renderSpotMarkersOnMap() {
  spotMarkers.forEach(m => map.removeLayer(m.marker));
  spotMarkers = [];

  const spots = getCurrentSpots();
  spots.forEach(spot => {
    const customIcon = L.divIcon({
      className: 'spot-marker-wrapper',
      html: `<div class="spot-marker-icon" id="markerIcon_${spot.id}">
               <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 22h20L12 2z"/></svg>
             </div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });

    const marker = L.marker([spot.lat, spot.lon], { icon: customIcon, zIndexOffset: 1000 }).addTo(map);
    marker.on('click', () => openSpotModal(spot.id));
    spotMarkers.push({ spotId: spot.id, marker });
  });
}

// --- Renderizado Dinámico de Tarjetas de Spots ---
function renderSpotCards() {
  const container = document.getElementById('spotsContainer');
  if (!container) return;

  const spots = getCurrentSpots();
  container.innerHTML = spots.map(spot => `
    <div class="spot-card" id="spotCard_${spot.id}" onclick="openSpotModal('${spot.id}')">
      <div class="spot-header">
        <h3>${spot.name}</h3>
        <span class="spot-badge" id="badge_${spot.id}">-- kn</span>
      </div>
      <div class="spot-details">
        <div class="stat"><span class="lbl">Viento:</span> <strong id="wind_${spot.id}">--</strong></div>
        <div class="stat"><span class="lbl">Ráfagas:</span> <strong id="gust_${spot.id}">--</strong></div>
        <div class="stat"><span class="lbl">Racheado:</span> <strong id="gustFactor_${spot.id}">--</strong></div>
        <div class="stat"><span class="lbl">Dir:</span> <strong id="dir_${spot.id}">--</strong></div>
      </div>
      ${spot.notes ? `<div class="spot-notes">Info: ${spot.notes}</div>` : ''}
    </div>
  `).join('');
}

// --- Event Listeners ---
function initEventListeners() {
  const slider = document.getElementById('timeSlider');
  if (slider) {
    slider.addEventListener('input', (e) => {
      currentHourIndex = parseInt(e.target.value, 10);
      updateVisualization();
    });
  }

  // Listener para el selector de zona
  const zoneSelect = document.getElementById('zoneSelect');
  if (zoneSelect) {
    zoneSelect.addEventListener('change', (e) => {
      switchRegion(e.target.value);
    });
  }

  const playBtn = document.getElementById('playBtn');
  if (playBtn) playBtn.addEventListener('click', togglePlay);

  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadData(true);
    });
  }

  // Resumen Semanal Modal
  const weeklyBtn = document.getElementById('weeklyBtn');
  if (weeklyBtn) {
    weeklyBtn.addEventListener('click', () => {
      calculateWeeklySummary();
      const modal = document.getElementById('weeklyModal');
      if (modal) modal.classList.add('active');
    });
  }

  initCollapsiblePanels();

  const weeklyModalClose = document.getElementById('weeklyModalClose');
  if (weeklyModalClose) {
    weeklyModalClose.addEventListener('click', () => {
      const modal = document.getElementById('weeklyModal');
      if (modal) modal.classList.remove('active');
    });
  }

  const weeklyModal = document.getElementById('weeklyModal');
  if (weeklyModal) {
    weeklyModal.addEventListener('click', (e) => {
      if (e.target.id === 'weeklyModal') {
        weeklyModal.classList.remove('active');
      }
    });
  }

  // GIF Dropdown Menu
  const gifBtn = document.getElementById('exportGifBtn');
  if (gifBtn) {
    const gifDropdown = gifBtn.parentElement;
    gifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (gifDropdown) gifDropdown.classList.toggle('active');
    });

    document.addEventListener('click', () => {
      if (gifDropdown) gifDropdown.classList.remove('active');
    });
  }

  const export24hBtn = document.getElementById('export24hBtn');
  if (export24hBtn) {
    export24hBtn.addEventListener('click', () => {
      const gifDropdown = document.getElementById('gifMenu')?.parentElement;
      if (gifDropdown) gifDropdown.classList.remove('active');
      exportGif(24);
    });
  }

  const export120hBtn = document.getElementById('export120hBtn');
  if (export120hBtn) {
    export120hBtn.addEventListener('click', () => {
      const gifDropdown = document.getElementById('gifMenu')?.parentElement;
      if (gifDropdown) gifDropdown.classList.remove('active');
      exportGif(120);
    });
  }

  const modelToggle = document.getElementById('modelToggle');
  if (modelToggle) {
    modelToggle.addEventListener('click', (e) => {
      if (e.target.classList.contains('model-btn')) {
        document.querySelectorAll('.model-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        selectedModel = e.target.dataset.model;
        loadData(true);
      }
    });
  }

  const unitToggle = document.getElementById('unitToggle');
  if (unitToggle) {
    unitToggle.addEventListener('click', (e) => {
      if (e.target.classList.contains('unit-btn')) {
        document.querySelectorAll('.unit-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        selectedUnit = e.target.dataset.unit;
        updateVisualization();
      }
    });
  }

  const modalClose = document.getElementById('modalClose');
  if (modalClose) modalClose.addEventListener('click', closeSpotModal);

  const spotModal = document.getElementById('spotModal');
  if (spotModal) {
    spotModal.addEventListener('click', (e) => {
      if (e.target.id === 'spotModal') closeSpotModal();
    });
  }
}

// --- Control de Paneles Informativos Desplegables (Individual y Global) ---
function initCollapsiblePanels() {
  const isMobile = window.innerWidth <= 768;

  const panels = [
    { id: 'spotsPanel', headerId: 'spotsPanelHeader' },
    { id: 'bestWindowsPanel', headerId: 'bestWindowsPanelHeader' },
    { id: 'legendPanel', headerId: 'legendPanelHeader' }
  ];

  panels.forEach(p => {
    const panelEl = document.getElementById(p.id);
    const headerEl = document.getElementById(p.headerId);
    if (!panelEl || !headerEl) return;

    // En móvil, si el usuario no ha guardado una preferencia manual, por defecto estará colapsado en forma de píldora compacta
    const saved = localStorage.getItem(`panel_collapsed_${p.id}`);
    const isCollapsed = saved !== null ? (saved === 'true') : isMobile;

    if (isCollapsed) {
      panelEl.classList.add('collapsed');
    }

    headerEl.addEventListener('click', () => {
      panelEl.classList.toggle('collapsed');
      const nowCollapsed = panelEl.classList.contains('collapsed');
      localStorage.setItem(`panel_collapsed_${p.id}`, nowCollapsed ? 'true' : 'false');
    });
  });

  // Botones maestros (Cabecera + Botón Flotante en Mapa) para ocultar / mostrar todos los paneles informativos
  const toggleAllBtn = document.getElementById('toggleAllPanelsBtn');
  const mapToggleBtn = document.getElementById('mapTogglePanelsBtn');
  const mainContent = document.querySelector('.main-content');

  const updateGlobalToggleUI = (isHidden) => {
    if (toggleAllBtn) {
      toggleAllBtn.classList.toggle('active', isHidden);
      const btnText = toggleAllBtn.querySelector('.btn-text');
      if (btnText) btnText.textContent = isHidden ? 'Ver Cuadros' : 'Cuadros';
    }
    if (mapToggleBtn) {
      mapToggleBtn.classList.toggle('active', isHidden);
      const btnText = mapToggleBtn.querySelector('.btn-text');
      if (btnText) btnText.textContent = isHidden ? 'Ver Cuadros' : 'Cuadros';
    }
    if (mainContent) {
      mainContent.classList.toggle('panels-hidden', isHidden);
    }
  };

  const isHiddenGlobal = localStorage.getItem('panels_hidden_global') === 'true';
  updateGlobalToggleUI(isHiddenGlobal);

  const handleGlobalToggleClick = () => {
    if (!mainContent) return;
    const currentlyHidden = mainContent.classList.contains('panels-hidden');
    const newHiddenState = !currentlyHidden;
    updateGlobalToggleUI(newHiddenState);
    localStorage.setItem('panels_hidden_global', newHiddenState ? 'true' : 'false');
  };

  if (toggleAllBtn) toggleAllBtn.addEventListener('click', handleGlobalToggleClick);
  if (mapToggleBtn) mapToggleBtn.addEventListener('click', handleGlobalToggleClick);
}

// --- Cambio de Zona / Región ---
function switchRegion(regionId) {
  if (selectedRegionId === regionId) return;
  selectedRegionId = regionId;

  const region = getCurrentRegion();

  const appTitle = document.getElementById('appTitle');
  const appSubtitle = document.getElementById('appSubtitle');
  if (appTitle) appTitle.textContent = region.title;
  if (appSubtitle) appSubtitle.textContent = region.subtitle;

  const bbox = calculateCurrentBBox();
  map.flyToBounds([
    [bbox.minLat, bbox.minLon],
    [bbox.maxLat, bbox.maxLon]
  ], { padding: [30, 30], duration: 1.2 });

  renderSpotMarkersOnMap();
  renderSpotCards();
  loadData(true);
}

// --- Generar Coordenadas ---
function generateSamplingCoordinates() {
  const points = [];
  const bbox = calculateCurrentBBox();
  const spots = getCurrentSpots();

  const latStep = (bbox.maxLat - bbox.minLat) / (API_GRID_ROWS - 1);
  const lonStep = (bbox.maxLon - bbox.minLon) / (API_GRID_COLS - 1);

  for (let i = 0; i < API_GRID_ROWS; i++) {
    for (let j = 0; j < API_GRID_COLS; j++) {
      const lat = parseFloat((bbox.minLat + i * latStep).toFixed(4));
      const lon = parseFloat((bbox.minLon + j * lonStep).toFixed(4));
      points.push({ lat, lon, r: i, c: j });
    }
  }

  spots.forEach(spot => points.push({ lat: spot.lat, lon: spot.lon, isSpot: spot.id }));

  return points;
}

// Helper para pausas (anti rate-limit)
const delay = ms => new Promise(res => setTimeout(res, ms));

async function fetchBatchWithRetry(url, statusText, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      if (res.status === 429) {
        statusText.textContent = `Saturación Open-Meteo (reintentando)...`;
        await delay(3000);
      } else {
        await delay(500);
      }
    } catch (err) {
      if (i === retries - 1) throw err;
      await delay(800);
    }
  }
  throw new Error('Servidor Open-Meteo saturado');
}

// --- Caché Inteligente por Hora de Modelo Open-Meteo (00, 06, 12, 18 UTC) ---
function getLatestModelRun() {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const runHours = [0, 6, 12, 18];
  let latestRunHour = 18;
  for (let i = runHours.length - 1; i >= 0; i--) {
    if (utcHour >= runHours[i] + 1) {
      latestRunHour = runHours[i];
      break;
    }
  }
  const dateStr = now.toISOString().slice(0, 10);
  return `${dateStr}_${latestRunHour.toString().padStart(2, '0')}UTC`;
}

// --- Carga de Datos Resiliente (JSON Estático con Fallback a API Directa) ---
async function loadData(forceRefresh = false) {
  const statusText = document.getElementById('statusText');
  const statusDot = document.querySelector('.status-dot');

  const cacheKeyModel = `viento_data_v23_${selectedRegionId}_${selectedModel}`;
  const cacheModelRunKey = `viento_model_run_v23_${selectedRegionId}_${selectedModel}`;

  const currentModelRun = getLatestModelRun();
  const cachedModelRun = localStorage.getItem(cacheModelRunKey);
  const cachedData = localStorage.getItem(cacheKeyModel);

  const isCacheValid = cachedModelRun === currentModelRun && cachedData;

  const modelNames = {
    'arome_france_hd': 'AROME HD 1.3km',
    'icon_eu': 'ICON-EU 7km',
    'best_match': 'Global'
  };
  const modelLabel = modelNames[selectedModel] || selectedModel;

  if (!forceRefresh && isCacheValid) {
    try {
      const parsed = JSON.parse(cachedData);
      processLoadedData(parsed);

      if (statusText) statusText.textContent = `${modelLabel} (${parsed[0]?.hourly?.time?.length || 48}h)`;
      if (statusDot) statusDot.className = 'status-dot green';
      return;
    } catch (e) {
      console.warn('Caché dañada, intentando cargar datos estáticos...');
    }
  }

  if (statusText) statusText.textContent = `Cargando ${modelLabel}...`;
  if (statusDot) statusDot.className = 'status-dot yellow';

  // 1. Intentar cargar desde JSON estático generado en servidor (GitHub Actions)
  try {
    const staticUrl = `./data/${selectedRegionId}.json?v=${Date.now()}`;
    const staticRes = await fetch(staticUrl);
    if (staticRes.ok) {
      const staticPayload = await staticRes.json();
      if (staticPayload && staticPayload.models && staticPayload.models[selectedModel]) {
        const results = staticPayload.models[selectedModel];
        try {
          localStorage.setItem(cacheKeyModel, JSON.stringify(results));
          localStorage.setItem(cacheModelRunKey, currentModelRun);
        } catch (sErr) {}

        processLoadedData(results);
        const totalHours = results[0]?.hourly?.time?.length || 48;
        if (statusText) statusText.textContent = `${modelLabel} (${totalHours}h)`;
        if (statusDot) statusDot.className = 'status-dot green';
        return;
      }
    }
  } catch (staticErr) {
    console.warn('Servidor estático no disponible, usando API en vivo:', staticErr);
  }

  // 2. Fallback a consulta en vivo a Open-Meteo API
  try {
    const points = generateSamplingCoordinates();
    const BATCH_SIZE = 250;
    const batches = [];
    for (let i = 0; i < points.length; i += BATCH_SIZE) {
      batches.push(points.slice(i, i + BATCH_SIZE));
    }

    const allResults = [];
    const modelParam = selectedModel === 'best_match' ? '' : `&models=${selectedModel}`;

    for (let bIdx = 0; bIdx < batches.length; bIdx++) {
      const batch = batches[bIdx];
      const lats = batch.map(p => p.lat).join(',');
      const lons = batch.map(p => p.lon).join(',');
      const daysParam = selectedModel === 'arome_france_hd' ? 2 : 5;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,precipitation_probability,weather_code${modelParam}&forecast_days=${daysParam}&timezone=Europe/Madrid`;

      const data = await fetchBatchWithRetry(url, statusText);
      const dataArray = Array.isArray(data) ? data : [data];

      dataArray.forEach((item, index) => {
        allResults.push({
          lat: batch[index].lat,
          lon: batch[index].lon,
          r: batch[index].r,
          c: batch[index].c,
          isSpot: batch[index].isSpot || false,
          hourly: item.hourly
        });
      });

      await delay(200);
    }

    try {
      localStorage.setItem(cacheKeyModel, JSON.stringify(allResults));
      localStorage.setItem(cacheModelRunKey, currentModelRun);
    } catch (storageErr) {}

    processLoadedData(allResults);

    const totalHours = allResults[0]?.hourly?.time?.length || 48;
    if (statusText) statusText.textContent = `${modelLabel} (${totalHours}h)`;
    if (statusDot) statusDot.className = 'status-dot green';
  } catch (err) {
    console.error('Error al cargar datos:', err);
    
    if (cachedData) {
      try {
        const parsed = JSON.parse(cachedData);
        processLoadedData(parsed);
        if (statusText) statusText.textContent = `${modelLabel} (Caché previa)`;
        if (statusDot) statusDot.className = 'status-dot yellow';
        return;
      } catch (e) {}
    }

    if (statusText) statusText.textContent = 'Reintentando en 5s...';
    if (statusDot) statusDot.className = 'status-dot yellow';

    setTimeout(() => loadData(true), 5000);
  }
}

// --- Procesar Datos ---
function processLoadedData(dataArray) {
  gridMarkers.forEach(m => map.removeLayer(m.marker || m));
  gridMarkers = [];

  rawApiPoints = [];
  spotDataStore = {};

  // Si el modelo seleccionado es AROME HD, recortar estrictamente a sus 48 horas reales (2 días)
  if (selectedModel === 'arome_france_hd') {
    dataArray.forEach(item => {
      if (item && item.hourly && item.hourly.time && item.hourly.time.length > 48) {
        item.hourly.time = item.hourly.time.slice(0, 48);
        if (item.hourly.wind_speed_10m) item.hourly.wind_speed_10m = item.hourly.wind_speed_10m.slice(0, 48);
        if (item.hourly.wind_direction_10m) item.hourly.wind_direction_10m = item.hourly.wind_direction_10m.slice(0, 48);
        if (item.hourly.wind_gusts_10m) item.hourly.wind_gusts_10m = item.hourly.wind_gusts_10m.slice(0, 48);
        if (item.hourly.temperature_2m) item.hourly.temperature_2m = item.hourly.temperature_2m.slice(0, 48);
        if (item.hourly.precipitation_probability) item.hourly.precipitation_probability = item.hourly.precipitation_probability.slice(0, 48);
        if (item.hourly.weather_code) item.hourly.weather_code = item.hourly.weather_code.slice(0, 48);
      }
    });
  }

  dataArray.forEach(item => {
    if (item.isSpot) {
      spotDataStore[item.isSpot] = item;
    } else {
      rawApiPoints.push(item);
    }
  });

  if (rawApiPoints.length > 0 && rawApiPoints[0].hourly && rawApiPoints[0].hourly.time) {
    setupDaySelector(rawApiPoints[0].hourly.time);
  }

  calculateBestWindows();
  updateVisualization();
}

// --- Selector de Días ---
function setupDaySelector(timeList) {
  const container = document.getElementById('daySelector');
  if (!container) return;
  container.innerHTML = '';

  const dayIndices = [];
  let currentDay = '';

  timeList.forEach((timeStr, idx) => {
    const d = new Date(timeStr);
    const dayName = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
    if (dayName !== currentDay && dayIndices.length < 5) {
      currentDay = dayName;
      dayIndices.push({ dayName, idx });
    }
  });

  dayIndices.forEach(({ dayName, idx }, i) => {
    const chip = document.createElement('button');
    chip.className = `day-chip ${i === 0 ? 'active' : ''}`;
    chip.textContent = dayName;
    chip.addEventListener('click', () => {
      currentHourIndex = idx;
      document.getElementById('timeSlider').value = currentHourIndex;
      updateVisualization();
    });
    container.appendChild(chip);
  });

  // Si se usa AROME HD (48h), añadir botón de aviso interactivo para cambiar a 5 Días
  if (selectedModel === 'arome_france_hd') {
    const noticeBtn = document.createElement('button');
    noticeBtn.className = 'day-chip-notice';
    noticeBtn.title = 'AROME HD solo ofrece 48h de previsión. Haz clic para cambiar a ICON 7k (5 Días).';
    noticeBtn.innerHTML = `<span>Días 3–5 no disponibles en AROME (48h) • Cambiar a ICON 7k</span>`;
    noticeBtn.addEventListener('click', () => {
      document.querySelectorAll('.model-btn').forEach(b => b.classList.remove('active'));
      const iconBtn = document.querySelector('.model-btn[data-model="icon_eu"]');
      if (iconBtn) iconBtn.classList.add('active');
      selectedModel = 'icon_eu';
      loadData(true);
    });
    container.appendChild(noticeBtn);
  }
}

// --- Actualización de la Interfaz ---
function updateVisualization() {
  if (rawApiPoints.length === 0) return;

  const totalTimePoints = rawApiPoints[0].hourly.time.length;
  const maxHours = Math.max(totalTimePoints - 1, 0);
  const slider = document.getElementById('timeSlider');
  if (slider) slider.max = maxHours;

  if (currentHourIndex > maxHours) {
    currentHourIndex = 0;
  }

  const sampleTime = rawApiPoints[0].hourly.time[currentHourIndex];
  const dateObj = new Date(sampleTime);
  const formattedDate = dateObj.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
  document.getElementById('currentDateTime').textContent = formattedDate;

  slider.value = currentHourIndex;
  updateActiveDayChip(dateObj);

  renderGridMarkers();
  updateSpotCards();
}

function updateActiveDayChip(dateObj) {
  const currentDayName = dateObj.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
  document.querySelectorAll('.day-chip').forEach(chip => {
    if (chip.textContent.toLowerCase() === currentDayName.toLowerCase()) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });
}

// --- Renderizado Optimizado de Flechas (Reutilización in-situ para 60fps) ---
function renderGridMarkers() {
  if (rawApiPoints.length === 0) return;

  const zoom = map.getZoom();
  const bounds = map.getBounds();

  let step = 1;
  if (zoom <= 10.5) step = 2;

  let baseSize = step === 1 ? 18 : 22;

  // Inicializar marcadores solo si la zona cambia o no existen
  if (gridMarkers.length !== rawApiPoints.length || gridMarkers.length === 0 || !gridMarkers[0].pathEl) {
    gridMarkers.forEach(m => map.removeLayer(m.marker || m));
    gridMarkers = [];

    rawApiPoints.forEach(point => {
      const containerEl = document.createElement('div');
      containerEl.className = 'grid-arrow-container';

      const wrapperEl = document.createElement('div');
      wrapperEl.className = 'wind-arrow-icon';

      const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgEl.setAttribute('class', 'wind-arrow-svg');
      svgEl.setAttribute('viewBox', '0 0 24 24');

      const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathEl.setAttribute('d', 'M12 2L4 21l8-4 8 4L12 2z');
      pathEl.setAttribute('stroke', '#000');
      pathEl.setAttribute('stroke-width', '1.2');

      svgEl.appendChild(pathEl);
      wrapperEl.appendChild(svgEl);
      containerEl.appendChild(wrapperEl);

      const customIcon = L.divIcon({
        className: 'grid-arrow-icon-wrapper',
        html: containerEl,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([point.lat, point.lon], { icon: customIcon }).addTo(map);
      marker.bindTooltip('', { direction: 'top', opacity: 0.95 });

      gridMarkers.push({
        point,
        marker,
        wrapperEl,
        svgEl,
        pathEl
      });
    });
  }

  let visibleCount = 0;

  // Actualizar propiedades in-situ (0 creaciones de nodos DOM al mover el slider)
  gridMarkers.forEach(item => {
    const { point, marker, wrapperEl, svgEl, pathEl } = item;

    const isVisible = (point.r % step === 0 && point.c % step === 0) && bounds.contains([point.lat, point.lon]);

    if (!isVisible) {
      if (marker._icon) marker._icon.style.display = 'none';
      return;
    }

    if (marker._icon) marker._icon.style.display = 'block';
    visibleCount++;

    let speedKmh = point.hourly.wind_speed_10m[currentHourIndex];
    let gustsKmh = point.hourly.wind_gusts_10m[currentHourIndex];
    let dir = point.hourly.wind_direction_10m[currentHourIndex];

    if (speedKmh === null || speedKmh === undefined || isNaN(speedKmh)) speedKmh = 0;
    if (gustsKmh === null || gustsKmh === undefined || isNaN(gustsKmh)) gustsKmh = speedKmh;
    if (dir === null || dir === undefined || isNaN(dir)) dir = 0;

    const speedKnots = kmhToKnots(speedKmh);
    const gustsKnots = kmhToKnots(gustsKmh);
    const displaySpeed = selectedUnit === 'knots' ? Math.round(speedKnots) : Math.round(speedKmh);
    const unitLabel = selectedUnit === 'knots' ? 'kn' : 'km/h';

    const color = getWingfoilColor(speedKnots);
    const iconSize = Math.min(Math.max(Math.round(baseSize + speedKnots * 0.25), 14), 34);

    const flowDir = (dir + 180) % 360;
    wrapperEl.style.transform = `rotate(${flowDir}deg)`;
    svgEl.setAttribute('width', iconSize);
    svgEl.setAttribute('height', iconSize);
    pathEl.setAttribute('fill', color);

    const dirName = getDirectionName(dir);
    const gustInfo = getGustFactor(speedKnots, gustsKnots);
    marker.setTooltipContent(
      `<strong>${displaySpeed} ${unitLabel}</strong> (${dirName} ${dir}°)<br/>Ráfagas: ${Math.round(selectedUnit === 'knots' ? gustsKnots : gustsKmh)} ${unitLabel}<br/>Estabilidad: <strong>${gustInfo.text} (${gustInfo.ratio}x)</strong>`
    );
  });

  const densityBadge = document.getElementById('densityBadge');
  if (densityBadge) {
    densityBadge.textContent = `${visibleCount} flechas API • Cobertura Densa (~900m)`;
  }
}

// --- Indicador de Factor de Ráfaga ---
function getGustFactor(speedKn, gustsKn) {
  if (speedKn < 3) return { ratio: 1.0, text: 'Estable', class: 'gust-stable' };
  const ratio = parseFloat((gustsKn / speedKn).toFixed(1));
  if (ratio < 1.3) return { ratio, text: 'Estable', class: 'gust-stable' };
  if (ratio <= 1.6) return { ratio, text: 'Racheado', class: 'gust-gusty' };
  return { ratio, text: 'Muy Racheado', class: 'gust-extreme' };
}

// Helper para obtener datos del spot primario
function getPrimarySpotData() {
  const spots = getCurrentSpots();
  for (const s of spots) {
    if (spotDataStore[s.id]) return spotDataStore[s.id];
  }
  return Object.values(spotDataStore)[0];
}

// --- Actualizar Spot Overlay Cards Dinámicamente ---
function updateSpotCards() {
  const spots = getCurrentSpots();
  spots.forEach(spot => {
    const spotData = spotDataStore[spot.id];
    if (!spotData) return;

    const speedKmh = spotData.hourly.wind_speed_10m[currentHourIndex];
    const gustsKmh = spotData.hourly.wind_gusts_10m[currentHourIndex];
    const dir = spotData.hourly.wind_direction_10m[currentHourIndex];

    const speedKn = kmhToKnots(speedKmh);
    const gustsKn = kmhToKnots(gustsKmh);
    const color = getWingfoilColor(speedKn);

    const badge = document.getElementById(`badge_${spot.id}`);
    const windEl = document.getElementById(`wind_${spot.id}`);
    const gustEl = document.getElementById(`gust_${spot.id}`);
    const gustFactorEl = document.getElementById(`gustFactor_${spot.id}`);
    const dirEl = document.getElementById(`dir_${spot.id}`);

    const displaySpeed = selectedUnit === 'knots' ? `${Math.round(speedKn)} kn` : `${Math.round(speedKmh)} km/h`;
    const displayGusts = selectedUnit === 'knots' ? `${Math.round(gustsKn)} kn` : `${Math.round(gustsKmh)} km/h`;

    if (badge) {
      badge.textContent = displaySpeed;
      badge.style.backgroundColor = color;
    }

    if (windEl) windEl.textContent = displaySpeed;
    if (gustEl) gustEl.textContent = displayGusts;
    if (dirEl) dirEl.textContent = `${getDirectionName(dir)} (${dir}°)`;

    const gustInfo = getGustFactor(speedKn, gustsKn);
    if (gustFactorEl) {
      gustFactorEl.innerHTML = `<span class="gust-badge ${gustInfo.class}">${gustInfo.text} (${gustInfo.ratio}x)</span>`;
    }

    const markerIcon = document.getElementById(`markerIcon_${spot.id}`);
    if (markerIcon) {
      markerIcon.style.borderColor = color;
      const svgEl = markerIcon.querySelector('svg');
      if (svgEl) {
        const flowDir = (dir + 180) % 360;
        svgEl.style.transform = `rotate(${flowDir}deg)`;
        svgEl.style.transition = 'transform 0.2s ease';
      }
    }
  });
}

// --- Calculador de Mejores Ventanas Automáticas (5 Días) ---
function calculateBestWindows() {
  const primarySpot = getPrimarySpotData();
  if (!primarySpot || !primarySpot.hourly) return;

  const hourly = primarySpot.hourly;
  const timeList = hourly.time;
  const windows = [];

  let currentWindow = null;

  for (let i = 0; i < timeList.length; i++) {
    const rawSpeed = hourly.wind_speed_10m[i];
    if (rawSpeed === null || rawSpeed === undefined || isNaN(rawSpeed)) continue;

    const speedKn = kmhToKnots(rawSpeed);
    const gustsKn = kmhToKnots(hourly.wind_gusts_10m[i] || rawSpeed);
    const dir = hourly.wind_direction_10m[i] || 0;
    const dateObj = new Date(timeList[i]);
    const hour = dateObj.getHours();

    const isDaylight = hour >= 8 && hour <= 21;
    const isGoodWind = speedKn >= 10;

    if (isDaylight && isGoodWind) {
      if (!currentWindow) {
        currentWindow = {
          startIndex: i,
          endIndex: i,
          speeds: [speedKn],
          gusts: [gustsKn],
          dirs: [dir],
          startTime: timeList[i],
          endTime: timeList[i]
        };
      } else {
        currentWindow.endIndex = i;
        currentWindow.speeds.push(speedKn);
        currentWindow.gusts.push(gustsKn);
        currentWindow.dirs.push(dir);
        currentWindow.endTime = timeList[i];
      }
    } else {
      if (currentWindow) {
        if (currentWindow.speeds.length >= 1) {
          windows.push(currentWindow);
        }
        currentWindow = null;
      }
    }
  }

  if (currentWindow && currentWindow.speeds.length >= 1) {
    windows.push(currentWindow);
  }

  // Fallback si la semana tiene muy poco viento: seleccionar las 3 horas pico
  if (windows.length === 0) {
    const hourScores = [];
    for (let i = 0; i < timeList.length; i++) {
      const sp = kmhToKnots(hourly.wind_speed_10m[i] || 0);
      hourScores.push({ index: i, speed: sp });
    }
    hourScores.sort((a, b) => b.speed - a.speed);
    const topHours = hourScores.slice(0, 3);
    topHours.forEach(item => {
      const i = item.index;
      const sp = item.speed;
      const gt = kmhToKnots(hourly.wind_gusts_10m[i] || 0);
      const dr = hourly.wind_direction_10m[i] || 0;
      windows.push({
        startIndex: i,
        endIndex: i,
        speeds: [sp],
        gusts: [gt],
        dirs: [dr],
        startTime: timeList[i],
        endTime: timeList[i]
      });
    });
  }

  const scoredWindows = windows.map(w => {
    const avgSpeed = w.speeds.reduce((a, b) => a + b, 0) / w.speeds.length;
    const avgGusts = w.gusts.reduce((a, b) => a + b, 0) / w.gusts.length;
    const duration = w.speeds.length;
    const gustInfo = getGustFactor(avgSpeed, avgGusts);
    const mainDir = getDirectionName(w.dirs[Math.floor(w.dirs.length / 2)]);

    let qualityClass = 'c-calm';
    let qualityText = 'No navegable (<10kn)';
    if (avgSpeed >= 10 && avgSpeed < 14) {
      qualityClass = 'c-light';
      qualityText = 'Ligero (10-14kn)';
    } else if (avgSpeed >= 14 && avgSpeed < 18) {
      qualityClass = 'c-ideal-soft';
      qualityText = 'Ideal Suave';
    } else if (avgSpeed >= 18 && avgSpeed <= 22) {
      qualityClass = 'c-ideal-strong';
      qualityText = 'Ideal Fuerte';
    } else if (avgSpeed > 22 && avgSpeed <= 26) {
      qualityClass = 'c-strong';
      qualityText = 'Fuerte';
    } else if (avgSpeed > 26 && avgSpeed <= 30) {
      qualityClass = 'c-very-strong';
      qualityText = 'Muy Fuerte';
    } else if (avgSpeed > 30) {
      qualityClass = 'c-extreme';
      qualityText = 'Extremo';
    }

    const startDate = new Date(w.startTime);
    const endDate = new Date(w.endTime);
    const dayName = startDate.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
    const startHourStr = startDate.getHours() + 'h';
    const endHourStr = (endDate.getHours() + 1) + 'h';

    return {
      startIndex: w.startIndex,
      dayName,
      hoursText: duration === 1 ? startHourStr : `${startHourStr}–${endHourStr}`,
      avgSpeed: Math.round(avgSpeed),
      duration,
      mainDir,
      gustText: gustInfo.text,
      qualityClass,
      qualityText,
      score: avgSpeed * duration * (gustInfo.ratio < 1.3 ? 1.2 : 0.9)
    };
  });

  scoredWindows.sort((a, b) => b.score - a.score);
  renderBestWindows(scoredWindows.slice(0, 3));
}

function renderBestWindows(topWindows) {
  const container = document.getElementById('bestWindowsList');
  if (!container) return;

  if (topWindows.length === 0) {
    container.innerHTML = `<div class="window-item-loading">Sin ventanas óptimas (≥10kn) en los 5 días</div>`;
    return;
  }

  container.innerHTML = topWindows.map(w => `
    <div class="window-card" onclick="jumpToHour(${w.startIndex})">
      <div class="window-title-row">
        <span class="window-date">${w.dayName} (${w.hoursText})</span>
        <span class="window-quality ${w.qualityClass}">${w.qualityText}</span>
      </div>
      <div class="window-details">
        <span>Viento: <strong>${w.avgSpeed} kn</strong></span>
        <span>Dir: <strong>${w.mainDir}</strong></span>
        <span>Estabilidad: ${w.gustText}</span>
      </div>
    </div>
  `).join('');
}

function jumpToHour(hourIndex) {
  currentHourIndex = hourIndex;
  document.getElementById('timeSlider').value = currentHourIndex;
  updateVisualization();
}

// --- Calculador de Resumen Semanal (Tabla 48h o 5 Días según Modelo) ---
function calculateWeeklySummary() {
  const primarySpot = getPrimarySpotData();
  if (!primarySpot || !primarySpot.hourly || !primarySpot.hourly.time) return;

  const hourly = primarySpot.hourly;
  const daysMap = [];
  const totalAvailableDays = Math.min(Math.ceil(hourly.time.length / 24), 5);

  const weeklyTitle = document.querySelector('#weeklyModal h2');
  if (weeklyTitle) {
    weeklyTitle.textContent = totalAvailableDays <= 2 
      ? `Resumen AROME HD (${hourly.time.length} Horas / ${totalAvailableDays} Días)`
      : `Resumen Semanal de Wingfoil (${totalAvailableDays} Días)`;
  }

  for (let d = 0; d < totalAvailableDays; d++) {
    const startIndex = d * 24;
    const endIndex = Math.min((d + 1) * 24, hourly.time.length);
    if (startIndex >= hourly.time.length) break;

    const dayTime = hourly.time[startIndex];
    const dateObj = new Date(dayTime);
    const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });

    let daylightSpeeds = [];
    let daylightGusts = [];
    let daylightDirs = [];
    let bestSpeed = 0;
    let bestHour = '--';

    for (let i = startIndex; i < endIndex; i++) {
      const h = new Date(hourly.time[i]).getHours();
      const sp = kmhToKnots(hourly.wind_speed_10m[i]);
      const gt = kmhToKnots(hourly.wind_gusts_10m[i]);
      const dr = hourly.wind_direction_10m[i];

      if (h >= 9 && h <= 21) {
        daylightSpeeds.push(sp);
        daylightGusts.push(gt);
        daylightDirs.push(dr);
      }

      if (sp > bestSpeed) {
        bestSpeed = sp;
        bestHour = `${h}:00h`;
      }
    }

    const avgSpeed = daylightSpeeds.length > 0 ? daylightSpeeds.reduce((a, b) => a + b, 0) / daylightSpeeds.length : 0;
    const maxGust = daylightGusts.length > 0 ? Math.max(...daylightGusts) : 0;
    const mainDir = daylightDirs.length > 0 ? getDirectionName(daylightDirs[Math.floor(daylightDirs.length / 2)]) : '--';

    const gustInfo = getGustFactor(avgSpeed, maxGust);

    let qualityLabel = 'No navegable';
    let qualityColor = '#6B7280';
    if (avgSpeed >= 18 && avgSpeed <= 22) {
      qualityLabel = 'Ideal Fuerte';
      qualityColor = '#22C55E';
    } else if (avgSpeed >= 14 && avgSpeed < 18) {
      qualityLabel = 'Ideal Suave';
      qualityColor = '#2DD4BF';
    } else if (avgSpeed >= 10 && avgSpeed < 14) {
      qualityLabel = 'Ligero';
      qualityColor = '#60A5FA';
    } else if (avgSpeed > 22 && avgSpeed <= 26) {
      qualityLabel = 'Fuerte';
      qualityColor = '#F59E0B';
    } else if (avgSpeed > 26 && avgSpeed <= 30) {
      qualityLabel = 'Muy Fuerte';
      qualityColor = '#F97316';
    } else if (avgSpeed > 30) {
      qualityLabel = 'Extremo';
      qualityColor = '#EF4444';
    }

    daysMap.push({
      dayName: dayName.charAt(0).toUpperCase() + dayName.slice(1),
      qualityLabel,
      qualityColor,
      bestWindowText: `${bestHour} (max ${Math.round(bestSpeed)} kn)`,
      avgMaxSpeed: `${Math.round(avgSpeed)} / ${Math.round(bestSpeed)} kn`,
      maxGust: `${Math.round(maxGust)} kn`,
      mainDir,
      gustInfo
    });
  }

  renderWeeklyTable(daysMap);
}

function renderWeeklyTable(days) {
  const tbody = document.getElementById('weeklyTableBody');
  if (!tbody) return;

  tbody.innerHTML = days.map(d => `
    <tr>
      <td><strong>${d.dayName}</strong></td>
      <td><span class="quality-pill" style="background: ${d.qualityColor}; color: #fff;">${d.qualityLabel}</span></td>
      <td>${d.bestWindowText}</td>
      <td>${d.avgMaxSpeed}</td>
      <td>${d.maxGust}</td>
      <td><strong>${d.mainDir}</strong></td>
      <td><span class="gust-badge ${d.gustInfo.class}">${d.gustInfo.text}</span></td>
    </tr>
  `).join('');
}

// --- Modal de Previsión Detallada ---
function openSpotModal(spotId) {
  let spot = null;
  for (const reg of SPOT_REGIONS) {
    const found = reg.spots.find(s => s.id === spotId);
    if (found) { spot = found; break; }
  }
  const spotData = spotDataStore[spotId];
  if (!spot || !spotData) return;

  document.getElementById('modalTitle').textContent = spot.name;
  const modalSub = document.getElementById('modalSubtitle');
  if (modalSub) modalSub.textContent = spot.notes || 'Previsión horaria para las próximas 24h';

  const currentSpeedKn = kmhToKnots(spotData.hourly.wind_speed_10m[currentHourIndex]);
  const wingStatus = getWingfoilStatusText(currentSpeedKn);

  let maxWind = 0;
  let bestHour = '--';
  const startIndex = currentHourIndex;
  const endIndex = Math.min(currentHourIndex + 24, spotData.hourly.time.length);

  for (let i = startIndex; i < endIndex; i++) {
    const sp = kmhToKnots(spotData.hourly.wind_speed_10m[i]);
    if (sp > maxWind) {
      maxWind = sp;
      const t = new Date(spotData.hourly.time[i]);
      bestHour = `${t.getHours()}:00h`;
    }
  }

  const currentTemp = spotData.hourly.temperature_2m[currentHourIndex];
  const currentRain = spotData.hourly.precipitation_probability[currentHourIndex];

  document.getElementById('modalWingStatus').textContent = wingStatus;
  document.getElementById('modalMaxWind').textContent = selectedUnit === 'knots' ? `${Math.round(maxWind)} kn` : `${Math.round(knotsToKmh(maxWind))} km/h`;
  document.getElementById('modalBestTime').textContent = bestHour;
  document.getElementById('modalTempRain').textContent = `${Math.round(currentTemp)}°C / Lluvia: ${currentRain}%`;

  renderHourlyChart(spotData.hourly, startIndex, endIndex);

  document.getElementById('spotModal').classList.add('active');
}

function closeSpotModal() {
  document.getElementById('spotModal').classList.remove('active');
}

function renderHourlyChart(hourlyData, startIndex, endIndex) {
  const chart = document.getElementById('hourlyChart');
  chart.innerHTML = '';

  const maxVal = Math.max(...hourlyData.wind_speed_10m.slice(startIndex, endIndex).map(kmhToKnots), 25);

  for (let i = startIndex; i < endIndex; i++) {
    const speedKn = kmhToKnots(hourlyData.wind_speed_10m[i]);
    const timeStr = hourlyData.time[i];
    const hourLabel = new Date(timeStr).getHours() + 'h';
    const color = getWingfoilColor(speedKn);

    const heightPct = Math.max(Math.round((speedKn / maxVal) * 100), 8);
    const displayVal = selectedUnit === 'knots' ? Math.round(speedKn) : Math.round(hourlyData.wind_speed_10m[i]);

    const col = document.createElement('div');
    col.className = 'bar-col';
    col.innerHTML = `
      <span class="bar-val" style="color: ${color};">${displayVal}</span>
      <div class="bar-fill" style="height: ${heightPct}%; background-color: ${color};"></div>
      <span class="bar-label">${hourLabel}</span>
    `;
    chart.appendChild(col);
  }
}

// --- Animación Temporal ---
function togglePlay() {
  const playIcon = document.getElementById('playIcon');
  if (isPlaying) {
    clearInterval(playInterval);
    isPlaying = false;
    playIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
  } else {
    isPlaying = true;
    playIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
    playInterval = setInterval(() => {
      currentHourIndex = (currentHourIndex + 1) % 120;
      updateVisualization();
    }, 400);
  }
}

// --- GENERADOR DE GIF NATIVO (sin gifshot — codificador GIF89a propio) ---
async function exportGif(modeHours = 24) {
  const statusText = document.getElementById('statusText');
  const exportBtn = document.getElementById('exportGifBtn');

  exportBtn.disabled = true;
  exportBtn.style.opacity = '0.5';
  const originalStatus = statusText.textContent;

  let startHour = 0;
  let numFrames = 24;
  let hourStep = 1;

  if (modeHours === 24) {
    startHour = Math.floor(currentHourIndex / 24) * 24;
    numFrames = 24;
    hourStep = 1;
  } else {
    startHour = 0;
    numFrames = 30;
    hourStep = 4;
  }

  const width = 400;
  const height = 280;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const mapSize = map.getSize();

  try {
    // Capturar todos los fotogramas como ImageData
    const frameDatas = [];
    for (let f = 0; f < numFrames; f++) {
      const targetHourIndex = startHour + (f * hourStep);
      statusText.textContent = `Capturando (${f + 1}/${numFrames})...`;

      ctx.fillStyle = '#0b1120';
      ctx.fillRect(0, 0, width, height);

      // Dibujar los tiles del mapa de Leaflet en el fondo del Canvas
      const tilePane = map.getContainer().querySelector('.leaflet-tile-pane');
      if (tilePane) {
        const mapContainerRect = map.getContainer().getBoundingClientRect();
        const tileImgs = tilePane.querySelectorAll('img');
        
        tileImgs.forEach(tileImg => {
          try {
            if (tileImg.complete && tileImg.naturalWidth > 0) {
              const rect = tileImg.getBoundingClientRect();
              const dx = ((rect.left - mapContainerRect.left) / mapContainerRect.width) * width;
              const dy = 36 + ((rect.top - mapContainerRect.top) / mapContainerRect.height) * (height - 62);
              const dw = (rect.width / mapContainerRect.width) * width;
              const dh = (rect.height / mapContainerRect.height) * (height - 62);

              ctx.drawImage(tileImg, dx, dy, dw, dh);
            }
          } catch(e) {}
        });
      }

      const sampleTime = rawApiPoints[0]?.hourly?.time[targetHourIndex] || new Date().toISOString();
      const dateObj = new Date(sampleTime);
      const formattedDate = dateObj.toLocaleDateString('es-ES', {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
      });

      // Header bar
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, width, 36);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 12px Inter, system-ui, sans-serif';
      const activeRegion = getCurrentRegion();
      ctx.fillText(`Viento - ${activeRegion.name}`, 10, 23);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(formattedDate, width - 10, 23);
      ctx.textAlign = 'left';

      // Wind arrows
      const step = (modeHours === 120) ? 3 : 2;
      const visiblePoints = rawApiPoints.filter(p => p.r % step === 0 && p.c % step === 0);

      visiblePoints.forEach(point => {
        const speedKmh = point.hourly.wind_speed_10m[targetHourIndex];
        const dir = point.hourly.wind_direction_10m[targetHourIndex];
        const speedKn = kmhToKnots(speedKmh);
        const pointPx = map.latLngToContainerPoint([point.lat, point.lon]);
        const x = (pointPx.x / mapSize.x) * width;
        const y = 36 + (pointPx.y / mapSize.y) * (height - 62);

        if (x >= 0 && x <= width && y >= 36 && y <= height - 26) {
          drawWindArrowCanvas(ctx, x, y, dir, speedKn, getWingfoilColorHex(speedKn));
        }
      });

      // Spot labels dinámicos
      const currentSpots = getCurrentSpots();
      currentSpots.forEach(spot => {
        const spotPx = map.latLngToContainerPoint([spot.lat, spot.lon]);
        const x = (spotPx.x / mapSize.x) * width;
        const y = 36 + (spotPx.y / mapSize.y) * (height - 62);
        if (x >= 0 && x <= width && y >= 36 && y <= height - 26) {
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, 2 * Math.PI);
          ctx.fillStyle = '#0f172a';
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = '#38bdf8';
          ctx.stroke();
          const spotData = spotDataStore[spot.id];
          const speedKn = spotData ? kmhToKnots(spotData.hourly.wind_speed_10m[targetHourIndex]) : 0;
          const shortName = spot.name.split(' ')[0];
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 9px Inter, sans-serif';
          ctx.fillText(`${shortName} ${Math.round(speedKn)}kn`, x + 8, y + 3);
        }
      });

      drawLegendCanvas(ctx, width, height);
      frameDatas.push(ctx.getImageData(0, 0, width, height));
      await delay(2);
    }

    statusText.textContent = 'Generando GIF...';
    await delay(50);

    // --- Codificador GIF89a Propio ---
    const gif = encodeGIF89a(frameDatas, width, height, modeHours === 120 ? 28 : 35);

    const blob = new Blob([gif], { type: 'image/gif' });
    const blobUrl = URL.createObjectURL(blob);
    const fileName = modeHours === 120
      ? `viento_embalses_5dias_${new Date().toISOString().slice(0, 10)}.gif`
      : `viento_embalses_24h_${new Date().toISOString().slice(0, 10)}.gif`;

    const link = document.createElement('a');
    link.download = fileName;
    link.href = blobUrl;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (document.body.contains(link)) document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    }, 3000);

    statusText.textContent = '¡GIF Descargado!';
    exportBtn.disabled = false;
    exportBtn.style.opacity = '1';
    setTimeout(() => { statusText.textContent = originalStatus; }, 4000);

  } catch (err) {
    console.error('Error generando GIF:', err);
    statusText.textContent = 'Error al crear GIF';
    exportBtn.disabled = false;
    exportBtn.style.opacity = '1';
  }
}

// --- Codificador GIF89a mínimo propio (sin dependencias) ---
function encodeGIF89a(frames, width, height, delayCs) {
  const palette = buildGlobalPalette();
  const paletteSize = palette.length / 3; // 256
  const parts = [];

  // Header
  parts.push(strToBytes('GIF89a'));
  // Logical Screen Descriptor
  parts.push(new Uint8Array([
    width & 0xFF, (width >> 8) & 0xFF,
    height & 0xFF, (height >> 8) & 0xFF,
    0xF7, // GCT flag + color resolution (8) + sort + size (2^8=256)
    0,    // background color index
    0     // pixel aspect ratio
  ]));
  // Global Color Table
  parts.push(palette);

  // Netscape extension for looping
  parts.push(new Uint8Array([
    0x21, 0xFF, 0x0B,
    0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, // NETSCAPE
    0x32, 0x2E, 0x30, // 2.0
    0x03, 0x01,
    0x00, 0x00, // loop count (0 = infinite)
    0x00
  ]));

  for (const frameData of frames) {
    // Graphic Control Extension
    parts.push(new Uint8Array([
      0x21, 0xF9, 0x04,
      0x00,  // no transparency, no disposal
      delayCs & 0xFF, (delayCs >> 8) & 0xFF, // delay in hundredths of second
      0x00,  // transparent color index
      0x00   // terminator
    ]));

    // Image Descriptor
    parts.push(new Uint8Array([
      0x2C,
      0, 0, 0, 0, // left, top
      width & 0xFF, (width >> 8) & 0xFF,
      height & 0xFF, (height >> 8) & 0xFF,
      0x00 // no local color table
    ]));

    // LZW Minimum Code Size
    parts.push(new Uint8Array([0x08]));

    // Image data (LZW compressed)
    const indexedPixels = quantizeFrame(frameData.data, palette);
    const compressed = lzwEncode(indexedPixels, 8);
    parts.push(compressed);
  }

  // Trailer
  parts.push(new Uint8Array([0x3B]));

  // Concatenate all parts
  let totalLen = 0;
  for (const p of parts) totalLen += p.length;
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of parts) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
}

function strToBytes(str) {
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i);
  return arr;
}

function buildGlobalPalette() {
  // Build a 256-color palette: 216 web-safe + 40 greys
  const palette = new Uint8Array(256 * 3);
  let idx = 0;
  // 6x6x6 color cube (216 colors)
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        palette[idx++] = r * 51;
        palette[idx++] = g * 51;
        palette[idx++] = b * 51;
      }
    }
  }
  // 40 additional greys
  for (let i = 0; i < 40; i++) {
    const v = Math.round((i / 39) * 255);
    palette[idx++] = v;
    palette[idx++] = v;
    palette[idx++] = v;
  }
  return palette;
}

function quantizeFrame(rgba, palette) {
  const numPixels = rgba.length / 4;
  const indexed = new Uint8Array(numPixels);
  for (let i = 0; i < numPixels; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    // Map to 6x6x6 cube index
    const ri = Math.round(r / 51);
    const gi = Math.round(g / 51);
    const bi = Math.round(b / 51);
    indexed[i] = ri * 36 + gi * 6 + bi;
  }
  return indexed;
}

function lzwEncode(indexStream, minCodeSize) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  const maxCode = 4096;

  // Output buffer
  const outputBytes = [];
  let curByte = 0;
  let curBit = 0;

  function writeBits(code, size) {
    curByte |= (code << curBit);
    curBit += size;
    while (curBit >= 8) {
      outputBytes.push(curByte & 0xFF);
      curByte >>= 8;
      curBit -= 8;
    }
  }

  // Initialize code table as a Map for speed
  let codeTable = new Map();
  for (let i = 0; i < clearCode; i++) {
    codeTable.set(String(i), i);
  }

  writeBits(clearCode, codeSize);

  let buffer = String(indexStream[0]);
  for (let i = 1; i < indexStream.length; i++) {
    const k = String(indexStream[i]);
    const bufferPlusK = buffer + ',' + k;
    if (codeTable.has(bufferPlusK)) {
      buffer = bufferPlusK;
    } else {
      writeBits(codeTable.get(buffer), codeSize);
      if (nextCode < maxCode) {
        codeTable.set(bufferPlusK, nextCode++);
        if (nextCode > (1 << codeSize) && codeSize < 12) {
          codeSize++;
        }
      } else {
        // Reset
        writeBits(clearCode, codeSize);
        codeTable = new Map();
        for (let j = 0; j < clearCode; j++) {
          codeTable.set(String(j), j);
        }
        nextCode = eoiCode + 1;
        codeSize = minCodeSize + 1;
      }
      buffer = k;
    }
  }

  writeBits(codeTable.get(buffer), codeSize);
  writeBits(eoiCode, codeSize);
  if (curBit > 0) outputBytes.push(curByte & 0xFF);

  // Pack into sub-blocks (max 255 bytes each)
  const subBlocked = [];
  let pos = 0;
  while (pos < outputBytes.length) {
    const blockSize = Math.min(255, outputBytes.length - pos);
    subBlocked.push(blockSize);
    for (let i = 0; i < blockSize; i++) {
      subBlocked.push(outputBytes[pos++]);
    }
  }
  subBlocked.push(0); // block terminator

  return new Uint8Array(subBlocked);
}

// Helpers para renderizado en Canvas nativo
function drawWindArrowCanvas(ctx, x, y, deg, knots, colorHex) {
  ctx.save();
  ctx.translate(x, y);
  const flowDeg = (deg + 180) % 360;
  ctx.rotate(flowDeg * Math.PI / 180);

  const size = Math.min(Math.max(14 + knots * 0.25, 12), 26);

  ctx.beginPath();
  ctx.moveTo(0, -size / 2);
  ctx.lineTo(size / 2.4, size / 2);
  ctx.lineTo(0, size / 3);
  ctx.lineTo(-size / 2.4, size / 2);
  ctx.closePath();

  ctx.fillStyle = colorHex;
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = '#000000';
  ctx.stroke();

  ctx.restore();
}

function drawLegendCanvas(ctx, width, height) {
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, height - 36, width, 36);

  ctx.font = '10px Inter, system-ui, sans-serif';
  const items = [
    { label: '<10kn No nav.', color: '#6B7280' },
    { label: '10-14kn Ligero', color: '#60A5FA' },
    { label: '14-18kn Ideal S.', color: '#2DD4BF' },
    { label: '18-22kn Ideal F.', color: '#22C55E' },
    { label: '22-26kn Fuerte', color: '#F59E0B' },
    { label: '26-30kn Muy F.', color: '#F97316' },
    { label: '>30kn Extremo', color: '#EF4444' }
  ];

  const itemWidth = Math.floor((width - 20) / items.length);
  let startX = 10;
  items.forEach(item => {
    ctx.fillStyle = item.color;
    ctx.fillRect(startX, height - 24, 10, 10);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(item.label, startX + 13, height - 15);
    startX += itemWidth;
  });
}

function getWingfoilColorHex(knots) {
  if (knots < 10) return '#6B7280';
  if (knots < 14) return '#60A5FA';
  if (knots < 18) return '#2DD4BF';
  if (knots <= 22) return '#22C55E';
  if (knots <= 26) return '#F59E0B';
  if (knots <= 30) return '#F97316';
  return '#EF4444';
}

function dataURItoBlob(dataURI) {
  const byteString = atob(dataURI.split(',')[1]);
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
}

// --- Helpers ---
function kmhToKnots(kmh) {
  return kmh * 0.539957;
}

function knotsToKmh(kn) {
  return kn / 0.539957;
}

function getWingfoilColor(knots) {
  if (knots === null || knots === undefined || isNaN(knots) || knots < 10) return 'var(--c-calm)';
  if (knots < 14) return 'var(--c-light)';
  if (knots < 18) return 'var(--c-ideal-soft)';
  if (knots <= 22) return 'var(--c-ideal-strong)';
  if (knots <= 26) return 'var(--c-strong)';
  if (knots <= 30) return 'var(--c-very-strong)';
  return 'var(--c-extreme)';
}

function getWingfoilStatusText(knots) {
  if (knots < 10) return 'No navegable <10kn';
  if (knots < 14) return 'Viento ligero 10-14kn';
  if (knots < 18) return 'Ideal Suave 14-18kn';
  if (knots <= 22) return 'Ideal Fuerte 18-22kn';
  if (knots <= 26) return 'Viento fuerte 22-26kn';
  if (knots <= 30) return 'Muy fuerte 26-30kn';
  return 'Extremo >30kn';
}

function getDirectionName(deg) {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(deg / 22.5) % 16;
  return directions[index];
}
