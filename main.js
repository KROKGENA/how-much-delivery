const ORS_API_KEY = '5b3ce3597851110001cf62480793bada4b33404496495e4e014c8e3d';
const warehouseCoords = [54.907129, 38.054109];
let clientMarker = null;
let routeLine = null;

const map = L.map('map').setView(warehouseCoords, 10);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
L.marker(warehouseCoords).addTo(map).bindPopup("Склад").openPopup();
L.circle(warehouseCoords, { radius: 40000, color: 'green', fillOpacity: 0.1 }).addTo(map);

map.on('click', function(e) {
  const lat = e.latlng.lat.toFixed(6);
  const lon = e.latlng.lng.toFixed(6);
  document.querySelector("input[name='address']").value = lat + "," + lon;
  if (clientMarker) clientMarker.setLatLng(e.latlng);
  else clientMarker = L.marker(e.latlng).addTo(map);
});

document.getElementById('weight_large').addEventListener('input', function () {
  const value = parseFloat(this.value);
  document.getElementById('large_formats_block').style.display = value > 0 ? 'block' : 'none';
  document.getElementById('return_pallet_block').style.display = value > 0 ? 'block' : 'none';
});
document.getElementById('underground').addEventListener('change', function() {
  document.getElementById('height_limit_block').style.display = this.checked ? 'block' : 'none';
});
document.getElementById('precise_time').addEventListener('change', function() {
  document.getElementById('time_block').style.display = this.checked ? 'block' : 'none';
});
document.getElementById('need_movers').addEventListener('change', function() {
  document.getElementById('movers_block').style.display = this.checked ? 'block' : 'none';
});

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
  const address = form.address.value.trim();

  if (!address) return alert("Укажите адрес или кликните на карте");

  const coords = address.split(",").map(Number);
  if (coords.length !== 2 || coords.some(isNaN)) return alert("Неверные координаты");

  if (clientMarker) clientMarker.setLatLng(coords);
  else clientMarker = L.marker(coords).addTo(map);

  const route = await getRoute(warehouseCoords, coords);
  const distanceKm = (route.distance / 1000).toFixed(2);
  if (routeLine) map.removeLayer(routeLine);
  routeLine = L.geoJSON(route.geojson, { color: 'blue' }).addTo(map);

  const deliveryCost = calculateDeliveryCost(totalWeight, loadType, distanceKm, {
    isUnderground, heightLimit, preciseTime, returnPallet
  });

  document.getElementById("result").innerHTML = `<b>Расстояние:</b> ${distanceKm} км<br/><b>Стоимость доставки:</b> ${deliveryCost.toLocaleString()} ₽`;
});

async function getRoute(start, end) {
  const body = {
    coordinates: [start.reverse(), end],
    instructions: false
  };
  const res = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
    method: "POST",
    headers: {
      Authorization: ORS_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  const dist = data.features[0].properties.summary.distance;
  return { geojson: data, distance: dist };
}

function calculateDeliveryCost(weight, loadType, km, options) {
  const tariffs = [
    { name: "до 1т", max: 1000, base: 4000, kmCost: 100, top: 1000, side: 1000, any: 0 },
    { name: "до 1.5т", max: 1500, base: 4000, kmCost: 100, top: 1500, side: 1500, any: 0 },
    { name: "до 3т", max: 3000, base: 4500, kmCost: 115, top: 1500, side: 1500, any: 0 },
    { name: "5т", max: 5000, base: 5000, kmCost: 144, top: 1500, side: 1500, lift: 1000, any: 0 },
    { name: "10т", max: 10000, base: 8000, kmCost: 210, top: 3000, side: 3000, any: 0 },
    { name: "20т", max: 20000, base: 10000, kmCost: 250, top: 3500, side: 3500, any: 0 },
    { name: "Манипулятор 5т", max: 5000, base: 15000, kmCost: 240, manipulator: 0 },
    { name: "Манипулятор 10т", max: 10000, base: 20000, kmCost: 240, manipulator: 0 }
  ];
  let tariff = tariffs.find(t => weight <= t.max);
  if (!tariff) return 0;
  let base = tariff.base;
  let perKm = km > 40 ? (km - 40) * tariff.kmCost : 0;
  let surcharge = loadType in tariff ? tariff[loadType] : 0;
  let coeff = 1;
  if (options.isUnderground) coeff *= 1.15;
  if (options.preciseTime) surcharge += 2500;
  if (options.returnPallet) surcharge += 2500;
  if (options.heightLimit && options.heightLimit < 2.2 && weight > 1500) {
    const trips = Math.ceil(weight / 1500);
    base = trips * 4000;
    perKm = trips * (km > 40 ? (km - 40) * 100 : 0);
  }
  return Math.round((base + perKm + surcharge) * coeff);
}