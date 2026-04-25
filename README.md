# Mureș River Map

Interactive online map for the Mureș River, its direct tributaries, and the downstream route through the Tisza to the Danube.

## Features

- Leaflet map using OpenStreetMap tiles.
- Source-to-mouth route from Izvoru Mureșului to the Mureș-Tisza confluence near Szeged.
- Downstream continuation along the Tisza to the Danube confluence near Titel.
- Curated major tributary layer with lengths, bank side, and mouth locations.
- Elevation values and a profile chart for the main source-to-Danube journey stops.
- Live OpenStreetMap geometry overlay for the Mureș river relation.
- Live Wikidata catalog of direct tributaries whose mouth is the Mureș.
- Optional complete-basin Wikidata loader for direct and upstream tributaries, with major/minor length summaries.

## Run Locally

This is a static site. Run it with any local web server:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://localhost:4173
```

## Data Sources

- OpenStreetMap map tiles and Mureș relation geometry.
- Wikidata direct tributary catalog for entities with `mouth of the watercourse = Mureș`.
- Wikidata complete-basin catalog using recursive `mouth of the watercourse` links back to the Mureș.
- Curated route and major tributary coordinates in `data.js` for a reliable offline fallback.
- Elevation samples in `data.js`, based on point samples from the Open-Meteo Elevation API and rounded to whole meters.

OpenStreetMap data is available under the ODbL. Wikidata content is available under CC0.

## GitHub Pages

Because the app has no build step, it can be deployed from the repository root:

1. Push this repository to GitHub.
2. Open repository Settings.
3. Go to Pages.
4. Choose `Deploy from a branch`.
5. Select the `main` branch and `/root`.

## Next Data Improvements

- Replace curated tributary polylines with generated OSM geometry for every cataloged tributary.
- Add recursive tributary-of-tributary exploration for the full basin tree.
- Add hydrological profile data, elevation, discharge, and time-based flood history.
