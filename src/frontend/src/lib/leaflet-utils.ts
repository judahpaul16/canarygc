import * as L from 'leaflet';

export interface MapConfig {
  initialLocation: L.LatLngExpression;
  zoom: number;
  mapType?: 'openstreetmap' | 'satellite';
}

export interface MarkerConfig {
  iconUrl: string;
  iconSize?: [number, number];
  iconAnchor?: [number, number];
  popupAnchor?: [number, number];
}

export class LeafletMapManager {
  private map: L.Map | null = null;
  private tileLayer: L.TileLayer | null = null;
  private mavMarker: L.Marker | null = null;

  constructor(private config: MapConfig) {
    if (!L) {
      throw new Error('Leaflet library not loaded');
    }
  }

  private toLatLngTuple(location: L.LatLngExpression): L.LatLngTuple {
    if (Array.isArray(location)) {
      return location as L.LatLngTuple;
    }
    
    const latLngObj = location as L.LatLngLiteral;
    return [latLngObj.lat, latLngObj.lng];
  }

  initializeMap(elementId: string): L.Map {
    const initialLocation = this.toLatLngTuple(this.config.initialLocation);
    this.map = L.map(elementId).setView(initialLocation, this.config.zoom);
    this.setTileLayer(this.config.mapType || 'openstreetmap');
    return this.map;
  }

  setTileLayer(type: 'openstreetmap' | 'satellite'): L.TileLayer {
    if (this.tileLayer) {
      this.map?.removeLayer(this.tileLayer);
    }

    const tileLayerOptions = {
      minZoom: 0,
      maxZoom: 20,
    };

    this.tileLayer = type === 'openstreetmap'
      ? L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', tileLayerOptions)
      : L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.jpg', tileLayerOptions);

    this.map?.addLayer(this.tileLayer);
    return this.tileLayer;
  }

  createIcon(config: MarkerConfig): L.Icon {
    return L.icon({
      iconUrl: config.iconUrl,
      iconSize: config.iconSize || [45, 45],
      iconAnchor: config.iconAnchor || [23, 40],
      popupAnchor: config.popupAnchor || [0, -45],
    });
  }

  addMarker(
    location: L.LatLngExpression, 
    icon: L.Icon, 
    popupText?: string
  ): L.Marker {
    if (!this.map) {
      throw new Error('Map not initialized');
    }

    const marker = L.marker(this.toLatLngTuple(location), { icon });
    if (popupText) {
      marker.bindPopup(popupText);
    }
    this.map.addLayer(marker);
    return marker;
  }

  updateMavMarker(
    location: L.LatLngExpression, 
    heading: number, 
    markerImageSrc: string
  ): L.Marker | null {
    if (!this.map) {
      throw new Error('Map not initialized');
    }

    // Remove existing MAV marker
    if (this.mavMarker) {
      this.map.removeLayer(this.mavMarker);
    }

    const img = new Image();
    img.src = markerImageSrc;

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.translate(img.width / 2, img.height / 2);
      ctx.rotate((heading) * Math.PI / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      const icon = L.icon({
        iconUrl: canvas.toDataURL(),
        iconSize: [45, 45],
        iconAnchor: [23, 20],
        popupAnchor: [0, -15],
      });

      const locationArray = this.toLatLngTuple(location);

      this.mavMarker = L.marker(locationArray, { icon })
        .bindPopup(`MAV Location: ${locationArray[0]}, ${locationArray[1]}`);
      
      this.map.addLayer(this.mavMarker);
    }

    return this.mavMarker;
  }

  addPolyline(
    start: L.LatLngExpression, 
    end: L.LatLngExpression, 
    color: string = 'red'
  ): L.Polyline {
    if (!this.map) {
      throw new Error('Map not initialized');
    }

    const polyline = L.polyline([
      this.toLatLngTuple(start), 
      this.toLatLngTuple(end)
    ], { color });
    this.map.addLayer(polyline);
    return polyline;
  }

  removeLayer(layer: L.Layer): void {
    if (this.map) {
      this.map.removeLayer(layer);
    }
  }

  flyTo(location: L.LatLngExpression, zoom?: number): void {
    const locationArray = this.toLatLngTuple(location);
    this.map?.flyTo(locationArray, zoom);
  }

  getMap(): L.Map | null {
    return this.map;
  }
}

export function generatePolylineKey(start: L.LatLng, end: L.LatLng): string {
  const startLatLng = [start.lat, start.lng].join(',');
  const endLatLng = [end.lat, end.lng].join(',');
  return [startLatLng, endLatLng].sort().join('-');
}
