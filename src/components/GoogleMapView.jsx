/**
 * GoogleMapView — drop-in replacement for the leaflet <MapContainer>
 * blocks scattered across LiveTracking, RouteMapModal and
 * CompactTrackingMap. Uses the official Google Maps JavaScript API via
 * @react-google-maps/api, authenticated with VITE_GOOGLE_MAPS_API_KEY.
 *
 * Why this exists
 * ───────────────
 * The previous leaflet TileLayer hit
 *   https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}
 * which is an unofficial Google endpoint — it works without a key but
 * Google can block it any time and there's no SLA. This wrapper uses
 * the real Google Maps SDK so we get reliable tiles, vector rendering
 * and standard map controls.
 *
 * Usage (mirrors the leaflet shape)
 * ─────────────────────────────────
 *   <GoogleMapView
 *     center={{ lat, lng }}
 *     zoom={13}
 *     style={{ width: '100%', height: '100%' }}
 *     markers={[
 *       { id: 'office', position: { lat, lng }, label: 'HQ', color: '#16A34A' },
 *     ]}
 *     polyline={[ { lat, lng }, { lat, lng } ]}
 *     polylineColor="#16A34A"
 *   />
 *
 * Setup
 * ─────
 * 1. `npm install @react-google-maps/api` (already in package.json).
 * 2. Add to your .env / Vercel env:
 *      VITE_GOOGLE_MAPS_API_KEY=AIza...
 *    The key must have the "Maps JavaScript API" enabled in the
 *    Google Cloud console; HTTP referrer restriction should include
 *    your Vercel domain.
 */
import React from 'react';
import { GoogleMap, useJsApiLoader, MarkerF, PolylineF, InfoWindowF } from '@react-google-maps/api';

const DEFAULT_CENTER = { lat: 13.0412, lng: 80.2127 }; // Tesco HQ — Ashok Nagar, Chennai
const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const LIBRARIES = [];   // 'geometry' etc. — leave empty for vanilla maps

export default function GoogleMapView({
  center,
  zoom = 13,
  style = { width: '100%', height: '100%' },
  markers = [],
  polyline = null,
  polylineColor = '#16A34A',
  fitToBounds = true,
  mapTypeId = 'roadmap',   // 'roadmap' | 'satellite' | 'hybrid' | 'terrain'
  selectedMarkerId = null,
  onMarkerClick = null,
  children = null,
}) {
  // EARLY API-KEY GATE (Jun 2026 — #278).
  // Previously this check was AFTER the loadError + isLoaded branches,
  // which made it unreachable: useJsApiLoader with an empty key
  // resolves with isLoaded=true and no loadError, so the user just got
  // a watermarked / blocked map with no explanation. Surfacing it
  // FIRST means dev/QA can see immediately when a deploy is missing
  // the VITE_GOOGLE_MAPS_API_KEY variable.
  if (!API_KEY) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFBEB', color: '#92400E', fontSize: 13, padding: 16, textAlign: 'center' }}>
        VITE_GOOGLE_MAPS_API_KEY is not set on this deployment. Add it to
        the host's environment variables and rebuild.
      </div>
    );
  }

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: API_KEY,
    libraries: LIBRARIES,
    id: 'tesco-hrms-google-maps',
  });

  // ── Fit bounds whenever markers / polyline change ────────────────────
  // We expose `mapRef` instead of relying on a `bounds` prop so changes
  // to a single point don't force a full remount.
  const mapRef = React.useRef(null);
  React.useEffect(() => {
    if (!mapRef.current || !fitToBounds) return;
    if (typeof window === 'undefined' || !window.google) return;
    const pts = [];
    if (Array.isArray(polyline)) {
      for (const p of polyline) {
        if (isFinite(p?.lat) && isFinite(p?.lng)) pts.push(p);
      }
    }
    for (const m of markers) {
      if (isFinite(m?.position?.lat) && isFinite(m?.position?.lng)) pts.push(m.position);
    }
    if (pts.length === 0) return;
    if (pts.length === 1) {
      mapRef.current.panTo(pts[0]);
      return;
    }
    const bounds = new window.google.maps.LatLngBounds();
    pts.forEach((p) => bounds.extend(p));
    mapRef.current.fitBounds(bounds, 64);
  }, [markers, polyline, fitToBounds]);

  if (loadError) {
    // The most common causes of loadError are surfaced explicitly so
    // ops can triage in 5 seconds instead of digging through DevTools:
    //  • Key restricted to a different HTTP referrer (Google Cloud
    //    Console → Credentials → key → Application restrictions).
    //  • Billing not enabled on the GCP project.
    //  • Maps JavaScript API not enabled on the project.
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FEF2F2', color: '#B91C1C', fontSize: 13, padding: 16, textAlign: 'center' }}>
        Failed to load Google Maps. Check the GCP Console: (1) Maps
        JavaScript API enabled, (2) billing enabled, (3) HTTP referrer
        restriction includes this domain.
      </div>
    );
  }
  if (!isLoaded) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', color: '#64748B', fontSize: 13 }}>
        Loading Google Maps…
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={style}
      center={center || DEFAULT_CENTER}
      zoom={zoom}
      mapTypeId={mapTypeId}
      onLoad={(m) => { mapRef.current = m; }}
      options={{
        streetViewControl: false,
        fullscreenControl: false,
        mapTypeControl: false,
        // The default Google "place" labels can clash with our markers —
        // hide POIs so HR sees ONLY employee pins and the polyline.
        styles: [
          { featureType: 'poi',            elementType: 'labels', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit',        elementType: 'labels', stylers: [{ visibility: 'off' }] },
        ],
      }}
    >
      {Array.isArray(polyline) && polyline.length >= 2 && (
        <PolylineF
          path={polyline}
          options={{
            strokeColor:   polylineColor,
            strokeOpacity: 0.85,
            strokeWeight:  4,
          }}
        />
      )}
      {markers.map((m) => (
        <MarkerF
          key={m.id || `${m.position.lat}-${m.position.lng}`}
          position={m.position}
          title={m.title || m.label || ''}
          onClick={() => onMarkerClick && onMarkerClick(m)}
          icon={m.color ? {
            path: window.google?.maps?.SymbolPath?.CIRCLE,
            fillColor:  m.color,
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
            scale: m.id === selectedMarkerId ? 12 : 9,
          } : undefined}
        />
      ))}
      {children}
    </GoogleMap>
  );
}
