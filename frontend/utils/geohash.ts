const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/**
 * Encodes latitude and longitude into a geohash string.
 */
export function encodeGeohash(
  lat: number,
  lng: number,
  precision: number = 6
): string {
  let isEven = true;
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  let bit = 0;
  let ch = 0;
  let geohash = "";

  while (geohash.length < precision) {
    if (isEven) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        ch |= 1 << (4 - bit);
        lngMin = mid;
      } else {
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        ch |= 1 << (4 - bit);
        latMin = mid;
      } else {
        latMax = mid;
      }
    }

    isEven = !isEven;
    if (bit < 4) {
      bit++;
    } else {
      geohash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }

  return geohash;
}

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * Maps map zoom level to Geohash precision level (string length).
 * Zoom <= 6  -> Precision 3 (~156km x 156km)
 * Zoom 7-9   -> Precision 4 (~39km x 19.5km)
 * Zoom 10-12 -> Precision 5 (~4.9km x 4.9km)
 * Zoom 13-15 -> Precision 6 (~1.2km x 0.6km)
 * Zoom 16+   -> Precision 7 (~152m x 76m)
 */
export function getPrecisionForZoom(zoom: number): number {
  if (zoom <= 4) return 3;
  if (zoom <= 6) return 4;
  if (zoom <= 7) return 5;
  if (zoom <= 15) return 6;
  return 7;
}

/**
 * Determines appropriate geohash precision based on zoom level or bounding box dimensions.
 * Targets ~10-40 geohashes max to avoid overloading backend DB queries.
 */
export function getPrecisionForBounds(bounds: Bounds, zoom?: number): number {
  let p = zoom !== undefined && zoom !== null ? getPrecisionForZoom(zoom) : 6;

  if (zoom === undefined || zoom === null) {
    const latSpan = Math.abs(bounds.north - bounds.south);
    const lngSpan = Math.abs(bounds.east - bounds.west);
    const maxSpan = Math.max(latSpan, lngSpan);

    if (maxSpan > 10) p = 3;
    else if (maxSpan > 2) p = 4;
    else if (maxSpan > 0.3) p = 5;
    else if (maxSpan > 0.05) p = 6;
    else p = 7;
  }

  // Dynamic cap: Limit maximum estimated tiles to 50
  const latSpan = Math.abs(bounds.north - bounds.south);
  const lngSpan = Math.abs(bounds.east - bounds.west);

  while (p > 2) {
    const latBits = Math.floor((p * 5) / 2);
    const lngBits = p * 5 - latBits;
    const latStep = 180 / Math.pow(2, latBits);
    const lngStep = 360 / Math.pow(2, lngBits);

    const estimatedTiles = (latSpan / latStep + 1) * (lngSpan / lngStep + 1);
    if (estimatedTiles <= 50) {
      break;
    }
    p--;
  }

  return p;
}

/**
 * Computes all unique geohashes covering a given bounding box.
 */
export function getGeohashesForBounds(
  bounds: Bounds,
  zoom?: number,
  explicitPrecision?: number
): string[] {
  const precision = explicitPrecision ?? getPrecisionForBounds(bounds, zoom);

  const latBits = Math.floor((precision * 5) / 2);
  const lngBits = precision * 5 - latBits;

  const latStep = 180 / Math.pow(2, latBits);
  const lngStep = 360 / Math.pow(2, lngBits);

  const south = Math.max(-90, Math.min(bounds.south, bounds.north));
  const north = Math.min(90, Math.max(bounds.south, bounds.north));
  let west = bounds.west;
  let east = bounds.east;

  if (west > east) {
    east += 360;
  }

  const geohashes = new Set<string>();

  const sampleLatStep = latStep * 0.7;
  const sampleLngStep = lngStep * 0.7;

  for (
    let lat = south;
    lat <= north + sampleLatStep * 0.5;
    lat += sampleLatStep
  ) {
    const clampedLat = Math.min(90, Math.max(-90, lat));
    for (
      let lng = west;
      lng <= east + sampleLngStep * 0.5;
      lng += sampleLngStep
    ) {
      let normalizedLng = lng;
      while (normalizedLng > 180) normalizedLng -= 360;
      while (normalizedLng < -180) normalizedLng += 360;

      geohashes.add(encodeGeohash(clampedLat, normalizedLng, precision));
    }
  }

  const corners = [
    [south, west],
    [south, east],
    [north, west],
    [north, east],
    [(south + north) / 2, (west + east) / 2],
  ];

  corners.forEach(([lat, lng]) => {
    const clampedLat = Math.min(90, Math.max(-90, lat));
    let normalizedLng = lng;
    while (normalizedLng > 180) normalizedLng -= 360;
    while (normalizedLng < -180) normalizedLng += 360;
    geohashes.add(encodeGeohash(clampedLat, normalizedLng, precision));
  });

  return Array.from(geohashes);
}
