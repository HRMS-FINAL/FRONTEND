/**
 * Canonical GPS-route helpers shared by the Daily Routes report and the Travel
 * report, so BOTH show the identical route for the same employee + date:
 *
 *   GPS Route = Check-In place  →  Check-Out place
 *
 * • From  = the employee's actual CHECK-IN location, reverse-geocoded.
 * • To    = the LAST valid road-matched GPS point (≈ the check-out location),
 *           reverse-geocoded. Never an unrelated / intermediate point.
 * • The trace is already road-matched upstream (OSRM), so this is not a
 *   straight line.
 * • No GPS trace → "GPS Route Not Available".
 *
 * Reverse-geocoding uses the loaded Google Maps JS Geocoder and a MODULE-LEVEL
 * cache, so the two reports resolve the exact same label for a coordinate and
 * never geocode it twice. `reverseGeocode` is awaitable — exports await it so a
 * PDF never bakes in a half-resolved "Loading…"/raw-coordinate value.
 */

const NA = 'GPS Route Not Available';

const _cache    = new Map(); // "lat5,lng5" -> resolved label
const _inflight = new Map(); // "lat5,lng5" -> Promise<label>

const keyOf     = (lat, lng) => `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
const coordText = (lat, lng) => `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;

/** Synchronous best-effort label (for live tables): cached place or raw coords. */
export function cachedPlace(lat, lng, isOffice) {
  if (isOffice) return 'Office';
  if (lat == null || lng == null) return '';
  const k = keyOf(lat, lng);
  return _cache.get(k) || coordText(lat, lng);
}

/** Awaitable reverse-geocode → short 2-part place label (or coords on failure). */
export function reverseGeocode(lat, lng, isOffice) {
  if (isOffice) return Promise.resolve('Office');
  if (lat == null || lng == null) return Promise.resolve('');
  const k = keyOf(lat, lng);
  if (_cache.has(k))    return Promise.resolve(_cache.get(k));
  if (_inflight.has(k)) return _inflight.get(k);

  const G = typeof window !== 'undefined'
    && window.google && window.google.maps && window.google.maps.Geocoder;
  if (typeof G !== 'function') return Promise.resolve(coordText(lat, lng)); // maps not ready

  const p = new Promise((resolve) => {
    try {
      const geocoder = new G();
      geocoder.geocode({ location: { lat: Number(lat), lng: Number(lng) } }, (results, status) => {
        let label = '';
        if (status === 'OK' && results && results[0]) {
          const parts = String(results[0].formatted_address)
            .split(',').map((s) => s.trim()).filter(Boolean);
          label = parts.slice(0, 2).join(', '); // don't collapse to a bare city
        }
        const val = label || coordText(lat, lng);
        _cache.set(k, val);
        _inflight.delete(k);
        resolve(val);
      });
    } catch {
      const val = coordText(lat, lng);
      _cache.set(k, val);
      _inflight.delete(k);
      resolve(val);
    }
  });
  _inflight.set(k, p);
  return p;
}

/**
 * Build the "From → To" route string from two resolved place labels.
 * Same place (or no destination) → just the single place. Neither → not available.
 */
export function routeString(fromLabel, toLabel, { arrow = '→', notAvailable = NA } = {}) {
  const f = String(fromLabel || '').trim();
  const t = String(toLabel   || '').trim();
  if (!f && !t) return notAvailable;
  if (!t || t === f) return f || notAvailable;
  return `${f} ${arrow} ${t}`;
}

/**
 * jsPDF's default (Helvetica) font is limited to Latin-1, so Unicode glyphs a
 * geocoder can emit — the "→" arrow, en/em dashes, curly quotes — render as
 * garbage / oddly-spaced boxes. Normalise them to plain ASCII so the report
 * text stays clean and professional in the PDF.
 */
export function pdfSafe(s) {
  return String(s == null ? '' : s)
    .replace(/→/g, '->')
    .replace(/[–—]/g, '-')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"');
}

export const GPS_ROUTE_NOT_AVAILABLE = NA;
