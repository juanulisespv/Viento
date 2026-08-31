const fs = require('fs');
const path = require('path');

const SPOT_REGIONS = [
  {
    id: 'ullibarri',
    name: 'Ullíbarri & Urrunaga (Álava)',
    spots: [
      { id: 'garaio', name: 'Garaio (Club Náutico)', lat: 42.9062, lon: -2.5449 },
      { id: 'landa', name: 'Landa (Playa / Norte)', lat: 42.9433, lon: -2.5933 },
      { id: 'urrunaga', name: 'Urrunaga (Legutio)', lat: 42.9720, lon: -2.6543 }
    ]
  },
  {
    id: 'ebro',
    name: 'Embalse del Ebro (Arija & Cabañas)',
    spots: [
      { id: 'arija', name: 'Arija (Embalse del Ebro)', lat: 42.9934, lon: -3.9486 },
      { id: 'cabanas', name: 'Cabañas de Virtus', lat: 42.9868, lon: -3.8711 }
    ]
  },
  {
    id: 'yesa',
    name: 'Embalse de Yesa (Navarra)',
    spots: [
      { id: 'yesa', name: 'Embalse de Yesa', lat: 42.6175, lon: -1.1897 }
    ]
  },
  {
    id: 'regaton',
    name: 'Playa del Regatón (Laredo)',
    spots: [
      { id: 'regaton', name: 'Playa del Regatón (Laredo)', lat: 43.4072, lon: -3.4475 }
    ]
  },
  {
    id: 'ereaga',
    name: 'El Abra / Ereaga (Getxo)',
    spots: [
      { id: 'ereaga', name: 'Playa de Ereaga (Getxo)', lat: 43.3486, lon: -3.0134 }
    ]
  },
  {
    id: 'chingudi',
    name: 'Bahía de Txingudi (Hondarribia)',
    spots: [
      { id: 'chingudi', name: 'Bahía de Txingudi (Hondarribia)', lat: 43.3642, lon: -1.7820 }
    ]
  }
];

const API_GRID_ROWS = 14;
const API_GRID_COLS = 14;
const MODELS = ['arome_france_hd', 'icon_eu', 'best_match'];

function calculateRegionBBox(region) {
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

function generateSamplingCoordinates(region) {
  const points = [];
  const bbox = calculateRegionBBox(region);

  const latStep = (bbox.maxLat - bbox.minLat) / (API_GRID_ROWS - 1);
  const lonStep = (bbox.maxLon - bbox.minLon) / (API_GRID_COLS - 1);

  for (let i = 0; i < API_GRID_ROWS; i++) {
    for (let j = 0; j < API_GRID_COLS; j++) {
      const lat = parseFloat((bbox.minLat + i * latStep).toFixed(4));
      const lon = parseFloat((bbox.minLon + j * lonStep).toFixed(4));
      points.push({ lat, lon, r: i, c: j });
    }
  }

  region.spots.forEach(spot => points.push({ lat: spot.lat, lon: spot.lon, isSpot: spot.id }));

  return points;
}

const delay = ms => new Promise(res => setTimeout(res, ms));

async function fetchWithRetry(url, retries = 6) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      if (res.status === 429) {
        const waitMs = (5 + i * 4) * 1000;
        console.log(`    ⚠️ Open-Meteo Rate Limit (429). Pausando ${waitMs / 1000}s...`);
        await delay(waitMs);
      } else {
        await delay(2000);
      }
    } catch (err) {
      if (i === retries - 1) throw err;
      await delay(3000);
    }
  }
  throw new Error(`Error en llamada Open-Meteo tras reintentos.`);
}

async function fetchModelData(points, model) {
  const lats = points.map(p => p.lat).join(',');
  const lons = points.map(p => p.lon).join(',');
  const modelParam = model === 'best_match' ? '' : `&models=${model}`;
  const daysParam = model === 'arome_france_hd' ? 2 : 5; // AROME HD = 2 días (48h), ICON/Global = 5 días (120h)

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,precipitation_probability,weather_code${modelParam}&forecast_days=${daysParam}&timezone=Europe/Madrid`;

  const data = await fetchWithRetry(url);
  const dataArray = Array.isArray(data) ? data : [data];

  return dataArray.map((item, index) => ({
    lat: points[index].lat,
    lon: points[index].lon,
    r: points[index].r,
    c: points[index].c,
    isSpot: points[index].isSpot || false,
    hourly: item.hourly
  }));
}

async function main() {
  console.log('🚀 Iniciando descarga de pronósticos Open-Meteo para GitHub Pages...');
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const updatedTime = new Date().toISOString();

  for (const region of SPOT_REGIONS) {
    console.log(`\n📌 Procesando Región: ${region.name} (${region.id})`);
    const points = generateSamplingCoordinates(region);
    const regionPayload = {
      regionId: region.id,
      updatedAt: updatedTime,
      gridRows: API_GRID_ROWS,
      gridCols: API_GRID_COLS,
      models: {}
    };

    for (const model of MODELS) {
      console.log(`  -> Descargando modelo: ${model}...`);
      try {
        const results = await fetchModelData(points, model);
        regionPayload.models[model] = results;
        console.log(`  ✓ Modelo ${model} descargado con éxito (${results.length} puntos).`);
      } catch (err) {
        console.error(`  ❌ Error descargando ${model} para ${region.id}:`, err.message);
      }
      await delay(3000);
    }

    const filePath = path.join(dataDir, `${region.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(regionPayload));
    console.log(`💾 Guardado archivo estático: data/${region.id}.json`);
  }

  console.log('\n🎉 ¡Proceso finalizado con éxito! Todos los archivos JSON están listos.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
