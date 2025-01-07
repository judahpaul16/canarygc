export function toProperCase(str: string): string {
  return str.replace(
    /\w\S*/g,
    function(txt) {
      return txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase();
    },
  );
}

export function extractValue(text: string, key: string): string {
  const match = text.match(new RegExp(`"${key}":"?([^,"]+)"?`));
  return match ? match[1].replace(/^"|"$/g, "") : "";
}

export const parseLocation = (lat: string | null, lon: string | null): Position | null => {
  if (!lat || !lon) return null;
  return {
    lat: parseFloat(lat) / 1e7,
    lng: parseFloat(lon) / 1e7,
  };
};

export const calculateSpeed = (text: string): number | null => {
  const vx = parseInt(extractValue(text, "vx") || "0") / 100;
  const vy = parseInt(extractValue(text, "vy") || "0") / 100;
  const vz = parseInt(extractValue(text, "vz") || "0") / 100;
  return Math.sqrt(Math.pow(vx, 2) + Math.pow(vy, 2) + Math.pow(vz, 2));
};

export interface Position {
  lat: number;
  lng: number;
}

