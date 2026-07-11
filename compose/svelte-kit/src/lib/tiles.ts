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

// Builds a MapTiler raster tile URL for a style. MapTiler styles need a key,
// so they surface as presets only once one is set.
export function maptilerTileUrl(style: string, key: string, ext = 'png'): string {
  return `https://api.maptiler.com/maps/${style}/256/{z}/{x}/{y}.${ext}?key=${key}`;
}

// The deepest zoom each source actually serves. Set as a layer's maxNativeZoom
// so Leaflet upscales tiles past it rather than showing blank squares.
export function nativeMaxZoom(url: string): number {
  if (url.includes('api.maptiler.com')) return 22;
  if (url.includes('google.com/vt')) return 21;
  if (url.includes('basemaps.cartocdn.com')) return 20;
  if (url.includes('tile.openstreetmap.org')) return 19;
  if (url.includes('opentopomap.org')) return 17;
  if (url.includes('basemap.nationalmap.gov')) return 16;
  if (url.includes('arcgisonline.com')) return 19;
  return 19;
}

// Free, keyless tile sources offered as presets in the Integrations dropdowns.
export const TILE_PRESETS: Record<'light' | 'dark' | 'satellite', { label: string; url: string }[]> = {
  light: [
    { label: 'OpenStreetMap', url: OSM_URL },
    { label: 'CARTO Voyager', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png' },
    { label: 'CARTO Positron', url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png' },
    { label: 'CARTO Positron (no labels)', url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png' },
    { label: 'Esri Topographic', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}' },
    { label: 'Esri Streets', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}' },
    { label: 'Esri Light Gray', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}' },
    { label: 'OpenTopoMap', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png' }
  ],
  dark: [
    { label: 'CARTO Dark Matter', url: CARTO_DARK_URL },
    { label: 'CARTO Dark (no labels)', url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png' },
    { label: 'CARTO Dark (labels only)', url: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png' },
    { label: 'Esri Dark Gray', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}' }
  ],
  satellite: [
    { label: 'Google Hybrid', url: GOOGLE_HYBRID_URL },
    { label: 'Google Satellite', url: 'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}' },
    { label: 'Esri World Imagery', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' },
    { label: 'USGS Imagery', url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}' }
  ]
};

// MapTiler raster styles surfaced as presets when a key is set. Each entry
// becomes a URL through maptilerTileUrl with the operator's key.
export const MAPTILER_PRESETS: Record<'light' | 'dark' | 'satellite', { label: string; style: string; ext?: string }[]> = {
  light: [
    { label: 'MapTiler Streets', style: 'streets-v2' },
    { label: 'MapTiler Basic', style: 'basic-v2' },
    { label: 'MapTiler Bright', style: 'bright-v2' },
    { label: 'MapTiler Dataviz', style: 'dataviz' },
    { label: 'MapTiler Topo', style: 'topo-v2' },
    { label: 'MapTiler Outdoor', style: 'outdoor-v2' },
    { label: 'MapTiler Winter', style: 'winter-v2' }
  ],
  dark: [
    { label: 'MapTiler Streets Dark', style: 'streets-v2-dark' },
    { label: 'MapTiler Basic Dark', style: 'basic-v2-dark' },
    { label: 'MapTiler Dataviz Dark', style: 'dataviz-dark' },
    { label: 'MapTiler Topo Dark', style: 'topo-v2-dark' },
    { label: 'MapTiler Outdoor Dark', style: 'outdoor-v2-dark' }
  ],
  satellite: [
    { label: 'MapTiler Hybrid', style: 'hybrid', ext: 'jpg' },
    { label: 'MapTiler Satellite', style: 'satellite', ext: 'jpg' }
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
  const light = config.lightUrl?.trim() || (key ? maptilerTileUrl('streets-v2', key) : OSM_URL);
  const dark = config.darkUrl?.trim() || (key ? maptilerTileUrl('streets-v2-dark', key) : CARTO_DARK_URL);
  const satellite = config.satelliteUrl?.trim() || (key ? maptilerTileUrl('hybrid', key, 'jpg') : GOOGLE_HYBRID_URL);

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
