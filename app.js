(function () {
  const DATA = window.MuresData;
  const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
  const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";
  const MAJOR_TRIBUTARY_KM = 50;
  const BASIN_SHAPE_BATCH_SIZE = 220;

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
    basinShapes: L.layerGroup(),
    places: L.layerGroup().addTo(map),
    osm: L.layerGroup().addTo(map)
  };

  let routeBounds = L.latLngBounds([]);
  let journeyMarkers = [];
  let majorTributaryBounds = new Map();
  let catalogItems = [];
  let catalogMarkers = new Map();
  let catalogMode = "direct";
  let catalogCache = {
    direct: null,
    basin: null
  };
  let basinShapeCache = null;
  let basinShapeLoading = false;

  const els = {
    networkStatus: document.getElementById("networkStatus"),
    osmStatus: document.getElementById("osmStatus"),
    lengthStatus: document.getElementById("lengthStatus"),
    catalogTitle: document.getElementById("catalogTitle"),
    catalogStatus: document.getElementById("catalogStatus"),
    catalogCount: document.getElementById("catalogCount"),
    catalogMetricLabel: document.getElementById("catalogMetricLabel"),
    totalLength: document.getElementById("totalLength"),
    muresLength: document.getElementById("muresLength"),
    journeyList: document.getElementById("journeyList"),
    journeyStatus: document.getElementById("journeyStatus"),
    elevationProfile: document.getElementById("elevationProfile"),
    elevationStatus: document.getElementById("elevationStatus"),
    elevationSummary: document.getElementById("elevationSummary"),
    tributaryList: document.getElementById("tributaryList"),
    tributaryCount: document.getElementById("tributaryCount"),
    basinMode: document.getElementById("basinMode"),
    basinShapesControl: document.getElementById("basinShapesControl"),
    basinShapesMode: document.getElementById("basinShapesMode"),
    basinShapeStatus: document.getElementById("basinShapeStatus"),
    basinSummary: document.getElementById("basinSummary"),
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

    drawFallbackTributaries();

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
      journeyMarkers[index] = marker;
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

    const points = stops.map((stop, index) => {
      const x = pad.left + (stop.km / maxKm) * plotWidth;
      const y = pad.top + ((maxElevation - stop.elevationM) / range) * plotHeight;
      return { ...stop, index, x, y };
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
          <g
            class="elevation-point"
            data-stop-index="${point.index}"
            tabindex="0"
            role="button"
            aria-label="Go to ${escapeHtml(point.name)}, ${meters(point.elevationM)} elevation"
          >
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

  function drawFallbackTributaries() {
    groups.tributaries.clearLayers();
    majorTributaryBounds = new Map();
    DATA.majorTributaries.forEach((river) => addFallbackTributary(river));
  }

  function addFallbackTributary(river, muted = false) {
    const style = tributaryLineStyle(river, muted);
    const line = addPolyline(
      groups.tributaries,
      river.points,
      style,
      river.name,
      `${km(river.lengthKm)} · ${river.side} · ${river.mouth} · fallback geometry`
    );
    const bounds = L.latLngBounds(river.points);
    majorTributaryBounds.set(river.name, bounds);
    line.on("mouseover", () => line.setStyle({ weight: style.weight + 2, opacity: 1 }));
    line.on("mouseout", () => line.setStyle(style));
    return bounds;
  }

  function tributaryLineStyle(river, muted = false) {
    return {
      color: muted ? "#789879" : "#2f8a5b",
      weight: Math.max(3, Math.min(6, river.lengthKm / 42)),
      opacity: muted ? 0.58 : 0.86,
      lineCap: "round",
      lineJoin: "round",
      dashArray: muted ? "6 5" : null
    };
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

    els.elevationProfile.addEventListener("click", (event) => {
      const point = event.target.closest(".elevation-point");
      if (!point) return;
      focusJourneyStop(Number(point.dataset.stopIndex));
    });

    els.elevationProfile.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const point = event.target.closest(".elevation-point");
      if (!point) return;
      event.preventDefault();
      focusJourneyStop(Number(point.dataset.stopIndex));
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

      const bounds = majorTributaryBounds.get(river.name) || L.latLngBounds(river.points);
      map.fitBounds(bounds.pad(0.25));
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

    els.basinMode.addEventListener("change", () => {
      catalogMode = els.basinMode.checked ? "basin" : "direct";
      els.catalogTitle.textContent = catalogModeTitle(catalogMode);
      els.catalogStatus.textContent = catalogModeStatus(catalogMode);
      els.catalogList.innerHTML = loadingCatalogRow(catalogMode);
      updateBasinShapeControl();

      loadWikidataCatalog(catalogMode).catch((error) => {
        console.warn(error);
        els.catalogStatus.textContent = "load failed";
        els.catalogList.innerHTML = `
          <article class="catalog-row is-empty">
            <span>
              <strong>Could not load ${escapeHtml(catalogModeTitle(catalogMode).toLocaleLowerCase())}</strong>
              <span>Reload the online data and try again.</span>
            </span>
          </article>
        `;
      });
    });

    els.basinShapesMode.addEventListener("change", () => {
      if (!els.basinShapesMode.checked) {
        setLayerVisible(groups.basinShapes, false);
        updateBasinShapeControl();
        return;
      }

      setLayerVisible(groups.basinShapes, true);
      loadBasinShapeGeometry().catch((error) => {
        console.warn(error);
        els.basinShapesMode.checked = false;
        setLayerVisible(groups.basinShapes, false);
        els.basinShapeStatus.textContent = "shape load failed";
      });
    });
  }

  function setLayerVisible(layer, visible) {
    if (visible) {
      layer.addTo(map);
    } else {
      map.removeLayer(layer);
    }
  }

  function focusJourneyStop(index) {
    const stop = DATA.journeyStops[index];
    const marker = journeyMarkers[index];
    if (!stop || !marker) return;

    map.setView(stop.coords, 11, {
      animate: true
    });
    marker.openPopup();

    const mapArea = document.querySelector(".map-area");
    if (mapArea && window.matchMedia("(max-width: 980px)").matches) {
      mapArea.scrollIntoView({
        behavior: "auto",
        block: "start"
      });
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

  function catalogModeTitle(mode) {
    return mode === "basin" ? "Complete Basin" : "Direct Tributaries";
  }

  function catalogModeStatus(mode) {
    return mode === "basin" ? "Loading basin" : "Loading direct";
  }

  function updateBasinShapeControl() {
    const basinActive = catalogMode === "basin";
    els.basinShapesMode.disabled = !basinActive || basinShapeLoading;
    els.basinShapesControl.classList.toggle("is-disabled", els.basinShapesMode.disabled);

    if (!basinActive) {
      els.basinShapesMode.checked = false;
      setLayerVisible(groups.basinShapes, false);
      els.basinShapeStatus.textContent = "enable complete basin first";
      return;
    }

    if (basinShapeLoading) return;
    if (basinShapeCache) {
      els.basinShapeStatus.textContent = shapeStatusText(basinShapeCache);
      return;
    }

    els.basinShapeStatus.textContent = "optional OSM geometry load";
  }

  function catalogQuery(mode) {
    const riverClause =
      mode === "basin"
        ? `
          ?river wdt:P403+ wd:${DATA.metadata.muresWikidata}.
          OPTIONAL { ?river wdt:P403 ?mouth. }
          BIND(EXISTS { ?river wdt:P403 wd:${DATA.metadata.muresWikidata} } AS ?direct)
        `
        : `
          ?river wdt:P403 wd:${DATA.metadata.muresWikidata}.
          BIND(wd:${DATA.metadata.muresWikidata} AS ?mouth)
          BIND(true AS ?direct)
        `;

    return `
      SELECT ?river ?riverLabel ?mouth ?mouthLabel ?length ?coord ?direct WHERE {
        ${riverClause}
        OPTIONAL { ?river wdt:P2043 ?length. }
        OPTIONAL { ?river wdt:P625 ?coord. }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en,ro,hu". }
      }
      ORDER BY DESC(?length) ?riverLabel
    `;
  }

  async function loadWikidataCatalog(mode = catalogMode, force = false) {
    if (!force && catalogCache[mode]) {
      if (mode === catalogMode) {
        applyCatalog(catalogCache[mode], mode);
      }
      return;
    }

    const query = catalogQuery(mode);

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
    const items = parseCatalogBindings(data.results.bindings);

    catalogCache[mode] = items;
    if (mode === catalogMode) {
      applyCatalog(items, mode);
    }
  }

  function parseCatalogBindings(bindings) {
    const byQid = new Map();

    bindings.forEach((binding) => {
      const qid = qidFromUri(binding.river.value);
      const label = binding.riverLabel?.value || qid;
      const lengthKm = binding.length ? Number(binding.length.value) : null;
      const coords = parseWktPoint(binding.coord?.value);
      const direct = binding.direct?.value === "true";
      const mouthName = binding.mouthLabel?.value;
      const mouthQid = binding.mouth ? qidFromUri(binding.mouth.value) : null;
      const current = byQid.get(qid) || {
        qid,
        name: label,
        lengthKm: null,
        coords: null,
        direct: false,
        mouthQid: null,
        mouthNames: new Set()
      };

      if (label && !label.startsWith("Q")) current.name = label;
      if (Number.isFinite(lengthKm)) {
        current.lengthKm = Math.max(current.lengthKm || 0, lengthKm);
      }
      if (coords && !current.coords) current.coords = coords;
      if (direct) current.direct = true;
      if (mouthQid) current.mouthQid = mouthQid;
      if (mouthName && !mouthName.startsWith("Q")) current.mouthNames.add(mouthName);

      byQid.set(qid, current);
    });

    return Array.from(byQid.values())
      .map((item) => ({
        ...item,
        mouthNames: Array.from(item.mouthNames)
      }))
      .sort(sortCatalogItems);
  }

  function sortCatalogItems(a, b) {
    const aHasLength = Number.isFinite(a.lengthKm);
    const bHasLength = Number.isFinite(b.lengthKm);
    if (aHasLength && bHasLength) return b.lengthKm - a.lengthKm;
    if (aHasLength) return -1;
    if (bHasLength) return 1;
    return a.name.localeCompare(b.name);
  }

  function applyCatalog(items, mode) {
    catalogItems = items;

    drawCatalogMarkers();
    renderCatalogList();
    renderCatalogSummary(mode);
    updateBasinShapeControl();
  }

  function drawCatalogMarkers() {
    groups.catalog.clearLayers();
    catalogMarkers = new Map();

    catalogItems.forEach((item) => {
      if (!item.coords) return;
      const rank = tributaryRank(item);
      const style = markerStyle(rank);
      const radius = Number.isFinite(item.lengthKm)
        ? Math.max(3, Math.min(10, 3 + item.lengthKm / 35))
        : 3;
      const marker = L.circleMarker(item.coords, {
        radius,
        color: item.direct ? "#075d66" : style.stroke,
        weight: 1,
        fillColor: style.fill,
        fillOpacity: 0.72
      }).bindPopup(
        popup(
          item.name,
          `${catalogMetaText(item)} · ${item.qid}`
        )
      );

      marker.addTo(groups.catalog);
      catalogMarkers.set(item.qid, marker);
    });
  }

  function renderCatalogList() {
    const needle = els.catalogSearch.value.trim().toLocaleLowerCase();
    const visible = catalogItems
      .filter((item) => {
        const mouthText = item.mouthNames.join(" ").toLocaleLowerCase();
        return (
          item.name.toLocaleLowerCase().includes(needle) ||
          item.qid.toLocaleLowerCase().includes(needle) ||
          mouthText.includes(needle)
        );
      })
      .slice(0, catalogMode === "basin" ? 140 : 80);

    if (!visible.length) {
      els.catalogList.innerHTML = `
        <article class="catalog-row is-empty">
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
        const rank = tributaryRank(item);
        const disabled = item.coords ? "" : "disabled";
        return `
          <article class="catalog-row">
            <span>
              <strong>${escapeHtml(item.name)}</strong>
              <span>${escapeHtml(catalogMetaText(item))}</span>
            </span>
            <span class="catalog-chip is-${rank}">${escapeHtml(rankLabel(rank))}</span>
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

  function loadingCatalogRow(mode) {
    return `
      <article class="catalog-row is-empty">
        <span>
          <strong>${escapeHtml(catalogModeStatus(mode))}</strong>
          <span>Wikidata basin query</span>
        </span>
      </article>
    `;
  }

  function tributaryRank(item) {
    if (!Number.isFinite(item.lengthKm)) return "unknown";
    return item.lengthKm >= MAJOR_TRIBUTARY_KM ? "major" : "minor";
  }

  function rankLabel(rank) {
    if (rank === "major") return "major";
    if (rank === "minor") return "minor";
    return "unknown";
  }

  function markerStyle(rank) {
    if (rank === "major") return { fill: "#2f8a5b", stroke: "#245f3a" };
    if (rank === "minor") return { fill: "#9fca72", stroke: "#5d783e" };
    return { fill: "#b8c2b8", stroke: "#6e776f" };
  }

  function catalogMetaText(item) {
    const length = Number.isFinite(item.lengthKm) ? km(item.lengthKm) : "length n/a";
    const connection = item.direct
      ? "direct to Mureș"
      : `via ${item.mouthNames[0] || "upstream tributary"}`;
    return `${length} · ${rankLabel(tributaryRank(item))} · ${connection}`;
  }

  function getCatalogStats() {
    return catalogItems.reduce(
      (stats, item) => {
        const rank = tributaryRank(item);
        stats.total += 1;
        if (item.direct) stats.direct += 1;
        if (!item.direct) stats.upstream += 1;
        if (item.coords) stats.withCoords += 1;
        if (rank === "major") stats.major += 1;
        if (rank === "minor") stats.minor += 1;
        if (rank === "unknown") stats.unknown += 1;
        if (Number.isFinite(item.lengthKm)) stats.knownLengthKm += item.lengthKm;
        return stats;
      },
      {
        total: 0,
        direct: 0,
        upstream: 0,
        major: 0,
        minor: 0,
        unknown: 0,
        withCoords: 0,
        knownLengthKm: 0
      }
    );
  }

  function renderCatalogSummary(mode) {
    const stats = getCatalogStats();
    const totalLabel = stats.total.toLocaleString("en-US");

    els.catalogTitle.textContent = catalogModeTitle(mode);
    els.catalogCount.textContent = totalLabel;
    els.catalogMetricLabel.textContent = mode === "basin" ? "basin tributaries" : "direct tributaries";
    els.catalogStatus.textContent = mode === "basin" ? `${totalLabel} basin items` : `${totalLabel} direct`;
    els.basinSummary.innerHTML = `
      <span><strong>${stats.major.toLocaleString("en-US")}</strong> major ≥ ${MAJOR_TRIBUTARY_KM} km</span>
      <span><strong>${stats.minor.toLocaleString("en-US")}</strong> minor &lt; ${MAJOR_TRIBUTARY_KM} km</span>
      <span><strong>${stats.unknown.toLocaleString("en-US")}</strong> unknown length</span>
      <span><strong>${km(stats.knownLengthKm)}</strong> known total length</span>
      <span><strong>${stats.direct.toLocaleString("en-US")}</strong> direct branches</span>
      <span><strong>${stats.upstream.toLocaleString("en-US")}</strong> upstream branches</span>
    `;
  }

  async function loadBasinShapeGeometry() {
    if (basinShapeCache) {
      setLayerVisible(groups.basinShapes, true);
      els.basinShapeStatus.textContent = shapeStatusText(basinShapeCache);
      return;
    }

    if (catalogMode !== "basin") {
      els.basinMode.checked = true;
      catalogMode = "basin";
      await loadWikidataCatalog("basin");
    }

    const basinItems = catalogCache.basin || catalogItems;
    const qidToItem = new Map(basinItems.map((item) => [item.qid, item]));
    const qids = Array.from(qidToItem.keys());
    const batches = chunk(qids, BASIN_SHAPE_BATCH_SIZE);
    const stats = {
      direct: new Set(),
      descendant: new Set(),
      segments: 0,
      km: 0,
      relations: 0,
      ways: 0,
      batches: batches.length,
      failedBatches: 0
    };

    groups.basinShapes.clearLayers();
    basinShapeLoading = true;
    updateBasinShapeControl();

    for (const [index, batch] of batches.entries()) {
      els.basinShapeStatus.textContent = `loading shapes ${index + 1}/${batches.length}`;
      try {
        const data = await fetchOverpass(basinShapeQuery(batch));
        drawBasinShapeBatch(data, qidToItem, stats);
      } catch (error) {
        console.warn(error);
        stats.failedBatches = batches.length - index;
        break;
      }

      if (index < batches.length - 1) {
        await delay(900);
      }
    }

    basinShapeCache = {
      direct: stats.direct.size,
      descendant: stats.descendant.size,
      segments: stats.segments,
      km: stats.km,
      relations: stats.relations,
      ways: stats.ways,
      failedBatches: stats.failedBatches
    };
    basinShapeLoading = false;
    els.basinShapesMode.checked = true;
    setLayerVisible(groups.basinShapes, true);
    els.lengthStatus.textContent = `Basin shapes: ${shapeStatusText(basinShapeCache)}`;
    updateBasinShapeControl();
  }

  function basinShapeQuery(qids) {
    const pattern = qids.join("|");
    return `
      [out:json][timeout:90];
      (
        relation["waterway"]["wikidata"~"^(${pattern})$"];
        way["waterway"]["wikidata"~"^(${pattern})$"];
      )->.matched;
      (
        .matched;
        way(r.matched);
      );
      out body geom;
    `;
  }

  async function fetchOverpass(query) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(OVERPASS_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
        },
        body: new URLSearchParams({ data: query })
      });

      if (response.ok) {
        return response.json();
      }

      if ((response.status === 429 || response.status === 504) && attempt < 3) {
        await delay((attempt + 1) * 4500);
        continue;
      }

      throw new Error(`Overpass request failed with ${response.status}`);
    }

    throw new Error("Overpass request failed");
  }

  function drawBasinShapeBatch(data, qidToItem, stats) {
    const relations = data.elements.filter((element) => element.type === "relation" && element.tags?.wikidata);
    const ways = data.elements.filter((element) => element.type === "way" && element.geometry?.length > 1);
    const waysById = new Map(ways.map((way) => [way.id, way]));
    const drawn = new Set();

    relations.forEach((relation) => {
      const item = qidToItem.get(relation.tags.wikidata);
      if (!item) return;

      const memberWays = relation.members
        ?.filter((member) => member.type === "way")
        .map((member) => waysById.get(member.ref))
        .filter((way) => way?.geometry?.length > 1);

      if (!memberWays?.length) return;

      stats.relations += 1;
      memberWays.forEach((way) => {
        const key = `${item.qid}:${way.id}`;
        if (drawn.has(key)) return;
        drawn.add(key);
        addBasinShapeLine(item, way.geometry, `OSM relation ${relation.id}`, stats);
      });
    });

    ways.forEach((way) => {
      const item = qidToItem.get(way.tags?.wikidata);
      if (!item) return;

      const key = `${item.qid}:${way.id}`;
      if (drawn.has(key)) return;
      drawn.add(key);
      stats.ways += 1;
      addBasinShapeLine(item, way.geometry, `OSM way ${way.id}`, stats);
    });
  }

  function addBasinShapeLine(item, geometry, source, stats) {
    const points = geometry.map((point) => [point.lat, point.lon]);
    const style = basinShapeStyle(item);
    const segmentKm = lineLengthKm(points);
    const line = L.polyline(points, style).bindPopup(
      popup(item.name, `${catalogMetaText(item)} · ${km(segmentKm)} mapped · ${source}`)
    );

    line.on("mouseover", () => line.setStyle({ weight: style.weight + 1.5, opacity: 0.96 }));
    line.on("mouseout", () => line.setStyle(style));
    line.addTo(groups.basinShapes);

    stats.segments += 1;
    stats.km += segmentKm;
    if (item.direct) {
      stats.direct.add(item.qid);
    } else {
      stats.descendant.add(item.qid);
    }
  }

  function basinShapeStyle(item) {
    if (item.direct) {
      return {
        color: "#2f8a5b",
        weight: 2.6,
        opacity: 0.72,
        lineCap: "round",
        lineJoin: "round"
      };
    }

    return {
      color: "#b08b2e",
      weight: 1.7,
      opacity: 0.58,
      lineCap: "round",
      lineJoin: "round"
    };
  }

  function shapeStatusText(stats) {
    const partial = stats.failedBatches ? "partial, " : "";
    return `${partial}${stats.direct} direct, ${stats.descendant} descendants, ${stats.segments} shapes, ${km(
      stats.km
    )}`;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function chunk(items, size) {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
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

  async function loadOsmMajorTributaryGeometry() {
    const qids = DATA.majorTributaries.map((river) => river.qid).filter(Boolean).join("|");
    const query = `
      [out:json][timeout:90];
      relation["waterway"="river"]["wikidata"~"^(${qids})$"];
      out body;
      way(r);
      out geom;
    `;
    const response = await fetch(`${OVERPASS_ENDPOINT}?data=${encodeURIComponent(query)}`);

    if (!response.ok) {
      throw new Error(`Overpass tributary request failed with ${response.status}`);
    }

    const data = await response.json();
    const relations = data.elements.filter((element) => element.type === "relation");
    const waysById = new Map(
      data.elements
        .filter((element) => element.type === "way" && element.geometry)
        .map((way) => [way.id, way])
    );
    const relationByQid = new Map(
      relations
        .filter((relation) => relation.tags?.wikidata)
        .map((relation) => [relation.tags.wikidata, relation])
    );

    groups.tributaries.clearLayers();
    majorTributaryBounds = new Map();

    let loaded = 0;
    let fallback = 0;
    let segmentCount = 0;
    let osmKm = 0;

    DATA.majorTributaries.forEach((river) => {
      const relation = relationByQid.get(river.qid);
      const memberIds = relation?.members
        ?.filter((member) => member.type === "way")
        .map((member) => member.ref);
      const wayGeometries = (memberIds || [])
        .map((id) => waysById.get(id))
        .filter((way) => way?.geometry?.length > 1)
        .map((way) => ({
          id: way.id,
          points: way.geometry.map((point) => [point.lat, point.lon])
        }));

      if (!relation || !wayGeometries.length) {
        addFallbackTributary(river, true);
        fallback += 1;
        return;
      }

      const bounds = L.latLngBounds([]);
      const style = tributaryLineStyle(river);
      const geometryKm = wayGeometries.reduce((total, way) => total + lineLengthKm(way.points), 0);
      wayGeometries.forEach((way) => {
        const line = L.polyline(way.points, style).bindPopup(
          popup(
            river.name,
            `${km(river.lengthKm)} catalog length · ${km(geometryKm)} OSM geometry · relation ${relation.id}`
          )
        );
        line.on("mouseover", () => line.setStyle({ weight: style.weight + 2, opacity: 1 }));
        line.on("mouseout", () => line.setStyle(style));
        line.addTo(groups.tributaries);
        bounds.extend(line.getBounds());
      });

      majorTributaryBounds.set(river.name, bounds);
      loaded += 1;
      segmentCount += wayGeometries.length;
      osmKm += geometryKm;
    });

    els.tributaryCount.textContent = `${loaded} OSM / ${fallback} fallback`;
    els.lengthStatus.textContent = `Major tributaries: ${loaded} OSM relations, ${segmentCount} segments, ${km(osmKm)}`;
  }

  async function loadOnlineLayers(force = false) {
    if (force) {
      groups.osm.clearLayers();
      groups.catalog.clearLayers();
      groups.basinShapes.clearLayers();
      drawFallbackTributaries();
      catalogItems = [];
      catalogMarkers = new Map();
      basinShapeCache = null;
      basinShapeLoading = false;
      catalogCache = {
        direct: null,
        basin: null
      };
      updateBasinShapeControl();
      renderCatalogList();
    }

    setStatus("Loading data");
    els.osmStatus.textContent = "Loading OSM geometry";
    els.catalogStatus.textContent = catalogModeStatus(catalogMode);

    const outcomes = await Promise.allSettled([
      loadOsmMuresGeometry(),
      loadOsmMajorTributaryGeometry(),
      loadWikidataCatalog(catalogMode, force)
    ]);
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
