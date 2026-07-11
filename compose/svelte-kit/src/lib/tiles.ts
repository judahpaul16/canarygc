// Basemap tile sources for the 2D map. With a MapTiler key the map uses
// MapTiler's rich raster styles (a proper dark map and a labeled hybrid
// satellite); without one it falls back to keyless sources. Any mode can be
// overridden with a custom XYZ tile URL from the Integrations settings.

const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const CARTO_DARK_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
// Google hybrid: satellite imagery with roads and labels, no key required.
const GOOGLE_HYBRID_URL = 'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';

const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const CARTO_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
const MAPTILER_ATTR =
  '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const GOOGLE_ATTR = 'Imagery &copy; <a href="https://www.google.com/maps">Google</a>';

// Free, keyless tile sources offered as presets in the Integrations dropdowns.
export const TILE_PRESETS: Record<'light' | 'dark' | 'satellite', { label: string; url: string }[]> = {
  light: [
    { label: 'OpenStreetMap', url: OSM_URL },
    { label: 'CARTO Voyager', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png' },
    { label: 'CARTO Positron', url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png' },
    { label: 'Esri Topographic', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}' },
    { label: 'OpenTopoMap', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png' }
  ],
  dark: [
    { label: 'CARTO Dark Matter', url: CARTO_DARK_URL },
    { label: 'CARTO Dark (no labels)', url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png' }
  ],
  satellite: [
    { label: 'Google Hybrid', url: GOOGLE_HYBRID_URL },
    { label: 'Google Satellite', url: 'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}' },
    { label: 'Esri World Imagery', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' }
  ]
};

export interface TileConfig {
  maptilerKey?: string;
  lightUrl?: string;
  darkUrl?: string;
  satelliteUrl?: string;
}

export interface TileSources {
  light: string;
  dark: string;
  satellite: string;
  osmAttribution: string;
  satelliteAttribution: string;
}

export function resolveTiles(config: TileConfig = {}): TileSources {
  const key = config.maptilerKey?.trim() || '';
  const mt = (style: string, ext = 'png') =>
    `https://api.maptiler.com/maps/${style}/256/{z}/{x}/{y}.${ext}?key=${key}`;

  const light = config.lightUrl?.trim() || (key ? mt('streets-v2') : OSM_URL);
  const dark = config.darkUrl?.trim() || (key ? mt('streets-v2-dark') : CARTO_DARK_URL);
  const satellite = config.satelliteUrl?.trim() || (key ? mt('hybrid', 'jpg') : GOOGLE_HYBRID_URL);

  const usingMaptilerBase = !config.lightUrl && !config.darkUrl && Boolean(key);
  const usingMaptilerSat = !config.satelliteUrl && Boolean(key);

  return {
    light,
    dark,
    satellite,
    osmAttribution: usingMaptilerBase ? MAPTILER_ATTR : key ? CARTO_ATTR : OSM_ATTR,
    satelliteAttribution: usingMaptilerSat ? MAPTILER_ATTR : GOOGLE_ATTR
  };
}
