/** Google polyline algorithm (precision 5), used to encode a route compactly for the Mapbox Static Images API. */
export function encodePolyline(points: [lat: number, lng: number][]): string {
  let output = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const [lat, lng] of points) {
    const latE5 = Math.round(lat * 1e5);
    const lngE5 = Math.round(lng * 1e5);
    output += encodeValue(latE5 - prevLat);
    output += encodeValue(lngE5 - prevLng);
    prevLat = latE5;
    prevLng = lngE5;
  }

  return output;
}

function encodeValue(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let output = '';
  while (v >= 0x20) {
    output += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  output += String.fromCharCode(v + 63);
  return output;
}
