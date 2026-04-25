(function () {
  const DATA = window.MuresData;
  const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
  const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";

  const map = L.map("map", {
    zoomControl: false,
    preferCanvas: true
  }).setView([46.15, 23.1], 7);

  L.control.zoom({ position: "topright" }).addTo(map);

  const osmBase = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  const topoBase = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
    maxZoom: 17,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, <a href="https://opentopomap.org">OpenTopoMap</a>'
  });

  L.control
    .layers(
      {
        OpenStreetMap: osmBase,
        Terrain: topoBase
      },
      {},
      { position: "topright" }
    )
    .addTo(map);

  const groups = {
    mures: L.layerGroup().addTo(map),
    continuation: L.layerGroup().addTo(map),
    danube: L.layerGroup().addTo(map),
    tributaries: L.layerGroup().addTo(map),
    catalog: L.layerGroup().addTo(map),
    places: L.layerGroup().addTo(map),
    osm: L.layerGroup().addTo(map)
  };

  let routeBounds = L.latLngBounds([]);
  let catalogItems = [];
  let catalogMarkers = new Map();

  const els = {
    networkStatus: document.getElementById("networkStatus"),
    osmStatus: document.getElementById("osmStatus"),
    lengthStatus: document.getElementById("lengthStatus"),
    catalogStatus: document.getElementById("catalogStatus"),
    catalogCount: document.getElementById("catalogCount"),
    totalLength: document.getElementById("totalLength"),
    muresLength: document.getElementById("muresLength"),
    journeyList: document.getElementById("journeyList"),
    journeyStatus: document.getElementById("journeyStatus"),
    elevationProfile: document.getElementById("elevationProfile"),
    elevationStatus: document.getElementById("elevationStatus"),
    elevationSummary: document.getElementById("elevationSummary"),
    tributaryList: document.getElementById("tributaryList"),
    tributaryCount: document.getElementById("tributaryCount"),
    catalogList: document.getElementById("catalogList"),
    catalogSearch: document.getElementById("catalogSearch")
  };

  function km(value) {
    return `${Math.round(value).toLocaleString("en-US")} km`;
  }

  function meters(value) {
    return `${Math.round(value).toLocaleString("en-US")} m`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function haversineKm(a, b) {
    const toRad = (degree) => (degree * Math.PI) / 180;
    const earthKm = 6371;
    const dLat = toRad(b[0] - a[0]);
    const dLng = toRad(b[1] - a[1]);
    const lat1 = toRad(a[0]);
    const lat2 = toRad(b[0]);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

    return 2 * earthKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function lineLengthKm(points) {
    return points.reduce((total, point, index) => {
      if (index === 0) return total;
      return total + haversineKm(points[index - 1], point);
    }, 0);
  }

  function popup(title, meta) {
    return `
      <p class="popup-title">${escapeHtml(title)}</p>
      <p class="popup-meta">${escapeHtml(meta)}</p>
    `;
  }

  function addPolyline(layer, points, options, title, meta) {
    const line = L.polyline(points, options).bindPopup(popup(title, meta));
    line.addTo(layer);
    routeBounds.extend(line.getBounds());
    return line;
  }

  function setStatus(message, isWarn = false) {
    els.networkStatus.textContent = message;
    els.networkStatus.classList.toggle("is-warn", isWarn);
  }

  function setupBaseGeometry() {
    const { mures, tisza, danube } = DATA.routeSegments;

    addPolyline(
      groups.mures,
      mures.points,
      {
        color: mures.color,
        weight: 7,
        opacity: 0.86,
        lineCap: "round",
        lineJoin: "round"
      },
      "Mureș River",
      `${DATA.metadata.sourceName} to ${DATA.metadata.mouthName}`
    );

    addPolyline(
      groups.continuation,
      tisza.points,
      {
        color: tisza.color,
        weight: 6,
        opacity: 0.85,
        lineCap: "round",
        lineJoin: "round",
        dashArray: "10 7"
      },
      "Tisza continuation",
      "Downstream from the Mureș confluence to the Danube confluence"
    );

    addPolyline(
      groups.danube,
      danube.points,
      {
        color: danube.color,
        weight: 5,
        opacity: 0.72,
        lineCap: "round",
        lineJoin: "round"
      },
      "Danube context",
      "Danube reach around the Tisza confluence"
    );

    DATA.majorTributaries.forEach((river) => {
      const line = addPolyline(
        groups.tributaries,
        river.points,
        {
          color: "#3f8f54",
          weight: Math.max(3, Math.min(6, river.lengthKm / 42)),
          opacity: 0.82,
          lineCap: "round",
          lineJoin: "round"
        },
        river.name,
        `${km(river.lengthKm)} · ${river.side} · ${river.mouth}`
      );
      line.on("mouseover", () => line.setStyle({ weight: 7, opacity: 1 }));
      line.on("mouseout", () =>
        line.setStyle({ weight: Math.max(3, Math.min(6, river.lengthKm / 42)), opacity: 0.82 })
      );
    });

    renderJourneyStops();
    renderTributaries();
    updateLengthSummary();
    map.fitBounds(routeBounds.pad(0.09));
  }

  function renderJourneyStops() {
    const maxKm = DATA.metadata.totalToDanubeKm;
    const sourceElevation = DATA.journeyStops[0].elevationM;
    const lowestElevation = Math.min(...DATA.journeyStops.map((stop) => stop.elevationM));
    const fallM = sourceElevation - lowestElevation;

    els.journeyList.innerHTML = DATA.journeyStops
      .map((stop, index) => {
        const percent = Math.round((stop.km / maxKm) * 100);
        return `
          <article class="journey-item" style="background: linear-gradient(90deg, rgba(8, 127, 140, 0.08) ${percent}%, #fff ${percent}%);">
            <span class="journey-index">${index + 1}</span>
            <span class="journey-copy">
              <strong>${escapeHtml(stop.name)}</strong>
              <span>${escapeHtml(stop.detail)}</span>
            </span>
            <span class="journey-readout">
              <span>${km(stop.km)}</span>
              <strong>${meters(stop.elevationM)}</strong>
            </span>
          </article>
        `;
      })
      .join("");

    DATA.journeyStops.forEach((stop, index) => {
      const marker = L.marker(stop.coords, {
        icon: L.divIcon({
          className: "",
          html: `<span class="marker-label">${index + 1}</span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        })
      }).bindPopup(
        popup(stop.name, `${stop.detail} · ${km(stop.km)} from source · ${meters(stop.elevationM)} elevation`)
      );

      marker.addTo(groups.places);
      routeBounds.extend(stop.coords);
    });

    els.journeyStatus.textContent = `${km(maxKm)} mapped`;
    els.elevationStatus.textContent = `${meters(fallM)} total fall`;
    renderElevationProfile();
  }

  function renderElevationProfile() {
    const stops = DATA.journeyStops;
    const width = 360;
    const height = 150;
    const pad = {
      top: 16,
      right: 18,
      bottom: 32,
      left: 38
    };
    const maxKm = DATA.metadata.totalToDanubeKm;
    const elevations = stops.map((stop) => stop.elevationM);
    const minElevation = Math.min(...elevations);
    const maxElevation = Math.max(...elevations);
    const range = Math.max(1, maxElevation - minElevation);
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;

    const points = stops.map((stop) => {
      const x = pad.left + (stop.km / maxKm) * plotWidth;
      const y = pad.top + ((maxElevation - stop.elevationM) / range) * plotHeight;
      return { ...stop, x, y };
    });

    const linePath = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
      .join(" ");
    const areaPath = `${linePath} L ${points.at(-1).x.toFixed(1)} ${height - pad.bottom} L ${points[0].x.toFixed(
      1
    )} ${height - pad.bottom} Z`;
    const gridLines = [maxElevation, Math.round((maxElevation + minElevation) / 2), minElevation]
      .map((value) => {
        const y = pad.top + ((maxElevation - value) / range) * plotHeight;
        return `
          <line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${width - pad.right}" y2="${y.toFixed(
            1
          )}" class="elevation-grid"></line>
          <text x="8" y="${(y + 4).toFixed(1)}" class="elevation-axis">${meters(value)}</text>
        `;
      })
      .join("");
    const markers = points
      .map(
        (point) => `
          <g class="elevation-point">
            <circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4"></circle>
            <title>${escapeHtml(point.name)} · ${meters(point.elevationM)} · ${km(point.km)}</title>
          </g>
        `
      )
      .join("");

    els.elevationProfile.innerHTML = `
      <defs>
        <linearGradient id="elevationFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#087f8c" stop-opacity="0.26"></stop>
          <stop offset="100%" stop-color="#087f8c" stop-opacity="0.04"></stop>
        </linearGradient>
      </defs>
      ${gridLines}
      <path d="${areaPath}" class="elevation-area"></path>
      <path d="${linePath}" class="elevation-line"></path>
      ${markers}
      <text x="${pad.left}" y="${height - 8}" class="elevation-axis">source</text>
      <text x="${width - pad.right}" y="${height - 8}" text-anchor="end" class="elevation-axis">Danube</text>
    `;

    els.elevationSummary.innerHTML = `
      <span><strong>${meters(maxElevation)}</strong> highest sampled point</span>
      <span><strong>${meters(minElevation)}</strong> lowest sampled point</span>
    `;
  }

  function renderTributaries() {
    const rows = DATA.majorTributaries
      .slice()
      .sort((a, b) => b.lengthKm - a.lengthKm)
      .map((river) => {
        return `
          <article class="tributary-row">
            <span>
              <strong>${escapeHtml(river.name)}</strong>
              <span>${escapeHtml(river.side)} · ${escapeHtml(river.mouth)}</span>
            </span>
            <button type="button" data-tributary="${escapeHtml(river.name)}" title="Focus ${escapeHtml(river.name)}">
              <i data-lucide="locate-fixed" aria-hidden="true"></i>
            </button>
            <span class="length-chip">${km(river.lengthKm)}</span>
          </article>
        `;
      })
      .join("");

    els.tributaryList.innerHTML = rows;
    els.tributaryCount.textContent = `${DATA.majorTributaries.length} shown`;
  }

  function updateLengthSummary() {
    const simplifiedMainKm = lineLengthKm(DATA.routeSegments.mures.points);
    const simplifiedTiszaKm = lineLengthKm(DATA.routeSegments.tisza.points);

    els.muresLength.textContent = km(DATA.metadata.muresLengthKm);
    els.totalLength.textContent = km(DATA.metadata.totalToDanubeKm);
    els.lengthStatus.textContent = `Catalog: ${km(DATA.metadata.muresLengthKm)} Mureș + ${km(
      DATA.metadata.tiszaSegmentKm
    )} Tisza reach`;

    return {
      simplifiedMainKm,
      simplifiedTiszaKm
    };
  }

  function setupEvents() {
    document.getElementById("fitRoute").addEventListener("click", () => {
      map.fitBounds(routeBounds.pad(0.09));
    });

    document.getElementById("focusSource").addEventListener("click", () => {
      const source = DATA.journeyStops[0];
      map.setView(source.coords, 12);
    });

    document.getElementById("focusMouth").addEventListener("click", () => {
      const mouth = DATA.journeyStops.find((stop) => stop.name === "Tisza confluence");
      map.setView(mouth.coords, 11);
    });

    document.getElementById("reloadData").addEventListener("click", () => {
      loadOnlineLayers(true);
    });

    document.querySelectorAll("[data-layer]").forEach((input) => {
      input.addEventListener("change", () => {
        const layer = groups[input.dataset.layer];
        if (!layer) return;
        setLayerVisible(layer, input.checked);
        if (input.dataset.layer === "mures") {
          setLayerVisible(groups.osm, input.checked);
        }
      });
    });

    els.tributaryList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-tributary]");
      if (!button) return;

      const river = DATA.majorTributaries.find((item) => item.name === button.dataset.tributary);
      if (!river) return;

      map.fitBounds(L.latLngBounds(river.points).pad(0.25));
    });

    els.catalogList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-catalog]");
      if (!button) return;

      const item = catalogItems.find((candidate) => candidate.qid === button.dataset.catalog);
      const marker = catalogMarkers.get(button.dataset.catalog);
      if (!item || !item.coords || !marker) return;

      map.setView(item.coords, 12);
      marker.openPopup();
    });

    els.catalogSearch.addEventListener("input", () => renderCatalogList());
  }

  function setLayerVisible(layer, visible) {
    if (visible) {
      layer.addTo(map);
    } else {
      map.removeLayer(layer);
    }
  }

  function parseWktPoint(value) {
    if (!value) return null;
    const match = value.match(/Point\((-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\)/);
    if (!match) return null;
    return [Number(match[2]), Number(match[1])];
  }

  function qidFromUri(uri) {
    return uri.split("/").pop();
  }

  async function loadWikidataCatalog() {
    const query = `
      SELECT ?river ?riverLabel ?length ?coord WHERE {
        ?river wdt:P403 wd:${DATA.metadata.muresWikidata}.
        OPTIONAL { ?river wdt:P2043 ?length. }
        OPTIONAL { ?river wdt:P625 ?coord. }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en,ro,hu". }
      }
      ORDER BY ?riverLabel
    `;

    const url = `${WIKIDATA_ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/sparql-results+json"
      }
    });

    if (!response.ok) {
      throw new Error(`Wikidata request failed with ${response.status}`);
    }

    const data = await response.json();
    const byQid = new Map();

    data.results.bindings.forEach((binding) => {
      const qid = qidFromUri(binding.river.value);
      const label = binding.riverLabel?.value || qid;
      const lengthKm = binding.length ? Number(binding.length.value) : null;
      const coords = parseWktPoint(binding.coord?.value);
      const current = byQid.get(qid) || {
        qid,
        name: label,
        lengthKm: null,
        coords: null
      };

      if (label && !label.startsWith("Q")) current.name = label;
      if (Number.isFinite(lengthKm)) current.lengthKm = lengthKm;
      if (coords && !current.coords) current.coords = coords;

      byQid.set(qid, current);
    });

    catalogItems = Array.from(byQid.values()).sort((a, b) => {
      if (a.lengthKm && b.lengthKm) return b.lengthKm - a.lengthKm;
      if (a.lengthKm) return -1;
      if (b.lengthKm) return 1;
      return a.name.localeCompare(b.name);
    });

    drawCatalogMarkers();
    renderCatalogList();
    els.catalogCount.textContent = catalogItems.length.toLocaleString("en-US");
    els.catalogStatus.textContent = `${catalogItems.length} loaded`;
  }

  function drawCatalogMarkers() {
    groups.catalog.clearLayers();
    catalogMarkers = new Map();

    catalogItems.forEach((item) => {
      if (!item.coords) return;
      const radius = item.lengthKm ? Math.max(4, Math.min(10, 4 + item.lengthKm / 38)) : 4;
      const marker = L.circleMarker(item.coords, {
        radius,
        color: "#245f3a",
        weight: 1,
        fillColor: "#6fba73",
        fillOpacity: 0.68
      }).bindPopup(
        popup(
          item.name,
          `${item.lengthKm ? `${km(item.lengthKm)} · ` : ""}Direct tributary catalog · ${item.qid}`
        )
      );

      marker.addTo(groups.catalog);
      catalogMarkers.set(item.qid, marker);
    });
  }

  function renderCatalogList() {
    const needle = els.catalogSearch.value.trim().toLocaleLowerCase();
    const visible = catalogItems
      .filter((item) => item.name.toLocaleLowerCase().includes(needle))
      .slice(0, 80);

    if (!visible.length) {
      els.catalogList.innerHTML = `
        <article class="catalog-row">
          <span>
            <strong>No matching tributaries</strong>
            <span>Try a different filter.</span>
          </span>
        </article>
      `;
      return;
    }

    els.catalogList.innerHTML = visible
      .map((item) => {
        const length = item.lengthKm ? km(item.lengthKm) : "length n/a";
        const disabled = item.coords ? "" : "disabled";
        return `
          <article class="catalog-row">
            <span>
              <strong>${escapeHtml(item.name)}</strong>
              <span>${escapeHtml(length)} · ${escapeHtml(item.qid)}</span>
            </span>
            <button type="button" data-catalog="${escapeHtml(item.qid)}" ${disabled} title="Focus ${escapeHtml(item.name)}">
              <i data-lucide="map-pin" aria-hidden="true"></i>
            </button>
          </article>
        `;
      })
      .join("");

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  async function loadOsmMuresGeometry() {
    const query = `
      [out:json][timeout:60];
      relation(${DATA.metadata.muresOsmRelation});
      way(r);
      out geom;
    `;
    const response = await fetch(`${OVERPASS_ENDPOINT}?data=${encodeURIComponent(query)}`);

    if (!response.ok) {
      throw new Error(`Overpass request failed with ${response.status}`);
    }

    const data = await response.json();
    const ways = data.elements.filter((element) => element.type === "way" && element.geometry);
    let osmKm = 0;

    groups.osm.clearLayers();

    ways.forEach((way) => {
      const points = way.geometry.map((point) => [point.lat, point.lon]);
      osmKm += lineLengthKm(points);
      L.polyline(points, {
        color: "#053d47",
        weight: 3,
        opacity: 0.76,
        lineCap: "round",
        lineJoin: "round"
      })
        .bindPopup(popup("Mureș OSM geometry", `OpenStreetMap way ${way.id}`))
        .addTo(groups.osm);
    });

    els.osmStatus.textContent = `OSM Mureș geometry: ${ways.length} segments, ${km(osmKm)}`;
  }

  async function loadOnlineLayers(force = false) {
    if (force) {
      groups.osm.clearLayers();
      groups.catalog.clearLayers();
      catalogItems = [];
      catalogMarkers = new Map();
      renderCatalogList();
    }

    setStatus("Loading data");
    els.osmStatus.textContent = "Loading OSM geometry";
    els.catalogStatus.textContent = "Loading";

    const outcomes = await Promise.allSettled([loadOsmMuresGeometry(), loadWikidataCatalog()]);
    const failed = outcomes.filter((item) => item.status === "rejected");

    if (failed.length === outcomes.length) {
      setStatus("Offline fallback", true);
      els.osmStatus.textContent = "Online river data unavailable";
      els.catalogStatus.textContent = "offline";
      return;
    }

    if (failed.length) {
      setStatus("Partial data", true);
      failed.forEach((item) => console.warn(item.reason));
      return;
    }

    setStatus("Live data");
  }

  function init() {
    setupBaseGeometry();
    setupEvents();
    loadOnlineLayers();

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  window.addEventListener("DOMContentLoaded", init);
})();
