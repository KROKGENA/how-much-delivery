// === Константы ===
const ORS_API_KEY = '5b3ce3597851110001cf62480793bada4b33404496495e4e014c8e3d';
const warehouseCoords = [54.907129, 38.054109];

let clientMarker = null;
let routeLine = null;

// === Обработка формы ===
document.getElementById("calcForm").addEventListener("submit", async function(e) {
  e.preventDefault();
  const form = e.target;

  const weightStandard = parseFloat(form.weight_standard.value) || 0;
  const weightLarge = parseFloat(form.weight_large.value) || 0;
  const totalWeight = weightStandard + weightLarge;

  const loadType = form.load_type.value;
  const isUnderground = document.getElementById('underground').checked;
  const heightLimit = parseFloat(form.height_limit?.value) || null;
  const preciseTime = document.getElementById('precise_time').checked;
  const returnPallet = document.getElementById('return_pallets')?.checked;
  const addressInput = form.address.value.trim();

  if (!addressInput) return alert("Укажите адрес или координаты");

  // === Координаты ===
  let coords;
  if (/^\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(addressInput)) {
    coords = addressInput.split(',').map(Number);
  } else {
    coords = await geocodeAddress(addressInput);
    if (!coords) return alert("Адрес не найден");
  }

  // === Отметка клиента на карте ===
  const latlng = L.latLng(coords[0], coords[1]);
  if (clientMarker) clientMarker.setLatLng(latlng);
  else clientMarker = L.marker(latlng).addTo(map);

  // === Построение маршрута ===
  const route = await getRoute(warehouseCoords, coords);
  const distanceKm = (route.distance / 1000).toFixed(2);

  if (routeLine) map.removeLayer(routeLine);
  routeLine = L.geoJSON(route.geojson, { color: 'blue' }).addTo(map);

  // === Расчёт стоимости ===
  const cost = calculateDeliveryCost(totalWeight, loadType, distanceKm, {
    isUnderground, heightLimit, preciseTime, returnPallet
  });

  document.getElementById("result").innerHTML = `
    <b>Расстояние:</b> ${distanceKm} км<br/>
    <b>Стоимость доставки:</b> ${cost.toLocaleString()} ₽
  `;
});

// === Получение маршрута ===
async function getRoute(start, end) {
  const res = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
    method: "POST",
    headers: {
      "Authorization": ORS_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      coordinates: [start.slice().reverse(), end.slice().reverse()],
      instructions: false
    })
  });
  const data = await res.json();
  const distance = data.features[0].properties.summary.distance;

  return {
    geojson: data,
    distance: distance
  };
}

// === Геокодер адреса → координаты ===
async function geocodeAddress(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data[0]) return null;
  return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
}

// === Расчёт стоимости ===
function calculateDeliveryCost(weight, loadType, km, options) {
  const tariffs = [
    { name: "до 1т", max: 1000, base: 4000, kmCost: 100, load: { top: 1000, side: 1000, any: 0 } },
    { name: "до 1.5т", max: 1500, base: 4000, kmCost: 100, load: { top: 1500, side: 1500, any: 0 } },
    { name: "до 3т", max: 3000, base: 4500, kmCost: 115, load: { top: 1500, side: 1500, any: 0 } },
    { name: "до 5т", max: 5000, base: 5000, kmCost: 144, load: { top: 1500, side: 1500, any: 0 } },
    { name: "до 10т", max: 10000, base: 8000, kmCost: 210, load: { top: 3000, side: 3000, any: 0 } },
    { name: "до 20т", max: 20000, base: 10000, kmCost: 250, load: { top: 3500, side: 3500, any: 0 } }
  ];

  // === Ограничение по высоте + вес > 1.5т → разбиваем на рейсы по 1500 кг ===
  if (options.heightLimit && options.heightLimit < 2.2 && weight > 1500) {
    const trips = Math.ceil(weight / 1500);
    const basePerTrip = 4000;
    const kmCost = 100;
    let total = trips * basePerTrip;

    if (km > 40) total += trips * (km - 40) * kmCost;

    if (options.returnPallet) total += 2500;
    if (options.preciseTime) total += 2500;
    if (options.isUnderground) total *= 1.15;

    return Math.round(total);
  }

  const tariff = tariffs.find(t => weight <= t.max);
  if (!tariff) return 0;

  let cost = tariff.base;

  if (km > 40) {
    cost += (km - 40) * tariff.kmCost;
  }

  // Загрузка
  cost += tariff.load[loadType] || 0;

  if (options.returnPallet) cost += 2500;
  if (options.preciseTime) cost += 2500;
  if (options.isUnderground) cost *= 1.15;

  return Math.round(cost);
}
