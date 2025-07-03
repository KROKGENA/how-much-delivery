
const ORS_API_KEY = '5b3ce3597851110001cf62480793bada4b33404496495e4e014c8e3d';
const warehouse = [54.907129, 38.054109];
let map = L.map('map').setView(warehouse, 9);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19
}).addTo(map);
L.marker(warehouse).addTo(map).bindPopup("Склад").openPopup();
L.circle(warehouse, { radius: 40000, color: 'green', fillOpacity: 0.1 }).addTo(map);

let clientMarker, routeLine;

map.on('click', async function(e) {
  const lat = e.latlng.lat.toFixed(6);
  const lon = e.latlng.lng.toFixed(6);
  document.querySelector("input[name='address']").value = lat + "," + lon;

  if (clientMarker) clientMarker.setLatLng(e.latlng);
  else clientMarker = L.marker(e.latlng).addTo(map);
});

document.getElementById("calcForm").addEventListener("submit", async function(e) {
  e.preventDefault();
  const address = this.address.value.trim();
  if (!address.includes(',')) return alert("Введите координаты (lat, lon)");

  const coords = address.split(",").map(Number);
  const route = await getRoute(warehouse, coords);
  if (routeLine) map.removeLayer(routeLine);
  routeLine = L.geoJSON(route.geojson, { color: 'blue' }).addTo(map);

  const distanceKm = (route.distance / 1000).toFixed(2);
  document.getElementById("result").innerHTML = `<b>Расстояние:</b> ${distanceKm} км<br/><b>Стоимость:</b> ~${4000 + distanceKm * 100} ₽`;
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
  return {
    geojson: data,
    distance: data.features[0].properties.summary.distance
  };
}
