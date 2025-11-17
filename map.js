import mapboxgl from "https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm";

mapboxgl.accessToken = 'pk.eyJ1IjoiZGdvbGRzdGVpbjIiLCJhIjoiY21pMHYwbTJvMTJ1dDJrb3M3amFna3YybSJ9.W0UmWSmQ_PmUsAm0usvJyQ';

// ------------ MAP SETUP ------------------

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/streets-v12",
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

const svg = d3.select("#map svg");

// ------------ DATA STORAGE -----------------

let stations = [];
let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

// ------------ TIME HELPERS -----------------

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function filterByMinute(tripsByMinute, minute) {
  if (minute === -1) return tripsByMinute.flat();

  let minMinute = (minute - 60 + 1440) % 1440;
  let maxMinute = (minute + 60) % 1440;

  if (minMinute > maxMinute) {
    return tripsByMinute.slice(minMinute).concat(tripsByMinute.slice(0, maxMinute)).flat();
  }
  return tripsByMinute.slice(minMinute, maxMinute).flat();
}

function computeStationTraffic(stations, timeFilter = -1) {
  const departures = d3.rollup(
    filterByMinute(departuresByMinute, timeFilter),
    v => v.length,
    d => d.start_station_id
  );

  const arrivals = d3.rollup(
    filterByMinute(arrivalsByMinute, timeFilter),
    v => v.length,
    d => d.end_station_id
  );

  return stations.map(s => {
    const id = s.short_name;
    s.departures = departures.get(id) ?? 0;
    s.arrivals = arrivals.get(id) ?? 0;
    s.totalTraffic = s.departures + s.arrivals;
    return s;
  });
}

// ------------ DRAWING -----------------

const radiusScale = d3.scaleSqrt().range([0, 25]);

const stationFlow = d3.scaleQuantize()
    .domain([0, 1])
    .range([0, 0.5, 1]);  // 3 discrete classes

    function updateScatter(stations) {
        radiusScale.domain([0, d3.max(stations, d => d.totalTraffic)]);
      
        const circles = svg.selectAll("circle")
          .data(stations, d => d.short_name);
      
        circles.enter()
          .append("circle")
          .attr("opacity", 0.85)
          .merge(circles)
          .attr("r", d => radiusScale(d.totalTraffic))
          .attr("cx", d => project(d).x)
          .attr("cy", d => project(d).y)
          .style("--departure-ratio", d =>
            d.totalTraffic > 0
              ? stationFlow(d.departures / d.totalTraffic)
              : 0.5
          );
      
        circles.exit().remove();
      }

function project(station) {
  return map.project([station.lon, station.lat]);
}

map.on("move", () => updateScatter(stations));

// ------------ LOAD DATA -----------------

map.on("load", async () => {
  console.log("Loading data…");

  const stationData = await d3.json("https://dsc106.com/labs/lab07/data/bluebikes-stations.json");
  stations = stationData.data.stations.map(s => ({
    ...s,
    lat: +s.lat,
    lon: +s.lon,
  }));

  const trips = await d3.csv("https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv");

  for (let trip of trips) {
    trip.started_at = new Date(trip.started_at);
    trip.ended_at = new Date(trip.ended_at);

    departuresByMinute[minutesSinceMidnight(trip.started_at)].push(trip);
    arrivalsByMinute[minutesSinceMidnight(trip.ended_at)].push(trip);
  }

  stations = computeStationTraffic(stations);
  updateScatter(stations);
});

// ------------ SLIDER INTERACTION -----------------

const slider = document.getElementById("time-slider");
const selectedTime = document.getElementById("selected-time");
const anyTime = document.getElementById("any-time");

slider.addEventListener("input", () => {
  const value = +slider.value;

  if (value === -1) {
    selectedTime.hidden = true;
    anyTime.hidden = false;
  } else {
    selectedTime.hidden = false;
    anyTime.hidden = true;

    const hours = Math.floor(value / 60).toString().padStart(2, "0");
    const minutes = (value % 60).toString().padStart(2, "0");
    selectedTime.textContent = `${hours}:${minutes}`;
  }

  const filtered = computeStationTraffic(stations, value);
  updateScatter(filtered);
});
