import { useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  Map as GoogleMap,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Crosshair,
  Layers,
  MapPin,
  Navigation,
  Plus,
  Minus,
  RotateCcw,
} from 'lucide-react';
import { BloodGroup } from '../types';
import {
  CampPinSnapshot,
  GeoPoint,
  HospitalVaultSnapshot,
  MUMBAI_METRO_CENTER,
  haversineDistanceKm,
} from '../utils/regionalVaults';

export interface RouteEtaSummary {
  distanceKm: number;
  durationMinutes: number;
  mode: 'routes_api' | 'estimated';
  originLabel: string;
  destinationName: string;
}

interface RegionalBloodMapCanvasProps {
  vaults: HospitalVaultSnapshot[];
  camps: CampPinSnapshot[];
  selectedBloodGroup: BloodGroup | 'ALL';
  showVaults: boolean;
  showCamps: boolean;
  highlightSubstitutes?: boolean;
  selectedVaultId: number | null;
  selectedCampId: number | null;
  userLocation: GeoPoint | null;
  routeOrigin: GeoPoint | null;
  routeOriginLabel?: string;
  routeDestinationVaultId: number | null;
  quotaExceeded?: boolean;
  heightClassName?: string;
  compact?: boolean;
  onSelectVault: (vault: HospitalVaultSnapshot) => void;
  onSelectCamp: (camp: CampPinSnapshot) => void;
  onRouteResolved?: (summary: RouteEtaSummary | null) => void;
}

// Reference: https://developers.google.com/maps/documentation/javascript/routes?utm_campaign=gmp_mcp_codeassist_v1_aistudio
const MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
const GMP_ATTRIBUTION_IDS = ['gmp_mcp_codeassist_v1_aistudio'];

function isQuotaError(err: unknown): boolean {
  if (!err) return false;
  const text =
    typeof err === 'string'
      ? err
      : err instanceof Error
      ? `${err.name} ${err.message}`
      : JSON.stringify(err);
  const upper = text.toUpperCase();
  return (
    upper.includes('OVER_QUERY_LIMIT') ||
    upper.includes('RESOURCE_EXHAUSTED') ||
    upper.includes('OVERQUOTAMAPERROR') ||
    upper.includes('QUOTAEXCEEDED') ||
    upper.includes('429')
  );
}

/**
 * Keeps the Google Map camera smoothly centered when the user focuses a vault or camp.
 */
function CameraFocusController({
  focusPoint,
  focusZoom,
  recenterSignal,
}: {
  focusPoint: GeoPoint | null;
  focusZoom: number;
  recenterSignal: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !focusPoint) return;
    map.panTo(focusPoint);
    if ((map.getZoom() ?? 11) < focusZoom) {
      map.setZoom(focusZoom);
    }
  }, [map, focusPoint, focusZoom]);

  useEffect(() => {
    if (!map || recenterSignal === 0) return;
    map.panTo(MUMBAI_METRO_CENTER);
    map.setZoom(11.4);
  }, [map, recenterSignal]);

  return null;
}

/**
 * Modern Routes API renderer via `useMapsLibrary('routes')` and `Route.computeRoutes()`.
 * Never uses legacy DirectionsService or client-side REST fetch.
 */
function ModernRoutePolylineLayer({
  origin,
  originLabel,
  destinationVault,
  onRouteResolved,
}: {
  origin: GeoPoint | null;
  originLabel: string;
  destinationVault: HospitalVaultSnapshot | null;
  onRouteResolved?: (summary: RouteEtaSummary | null) => void;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes') as unknown as {
    Route?: {
      computeRoutes: (req: Record<string, unknown>) => Promise<{
        routes?: Array<{
          distanceMeters?: number;
          durationMillis?: number;
          viewport?: google.maps.LatLngBounds;
          createPolylines?: () => google.maps.Polyline[];
        }>;
      }>;
    };
  } | null;

  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    if (!map || !origin || !destinationVault) {
      onRouteResolved?.(null);
      return;
    }

    let cancelled = false;

    const compute = async () => {
      if (!routesLib?.Route?.computeRoutes) {
        const straightKm = haversineDistanceKm(origin, destinationVault.coordinates);
        const roadKm = Number((straightKm * 1.28).toFixed(1));
        const minutes = Math.max(6, Math.round((roadKm / 26) * 60));
        if (!cancelled) {
          onRouteResolved?.({
            distanceKm: roadKm,
            durationMinutes: minutes,
            mode: 'estimated',
            originLabel,
            destinationName: destinationVault.hospital.name,
          });
        }
        return;
      }

      try {
        const response = await routesLib.Route.computeRoutes({
          origin,
          destination: destinationVault.coordinates,
          travelMode: 'DRIVING',
          fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
        });

        if (cancelled) return;
        const primaryRoute = response?.routes?.[0];
        if (!primaryRoute) {
          onRouteResolved?.(null);
          return;
        }

        if (typeof primaryRoute.createPolylines === 'function') {
          const rendered = primaryRoute.createPolylines();
          rendered.forEach((polyline) => {
            polyline.setOptions({
              strokeColor: '#BE123C',
              strokeOpacity: 0.92,
              strokeWeight: 5,
            });
            polyline.setMap(map);
          });
          polylinesRef.current = rendered;
        }

        if (primaryRoute.viewport) {
          map.fitBounds(primaryRoute.viewport, 60);
        }

        const distanceKm = Number(((primaryRoute.distanceMeters ?? 0) / 1000).toFixed(1));
        const durationMinutes = Math.max(
          1,
          Math.round((primaryRoute.durationMillis ?? 0) / 60000)
        );

        onRouteResolved?.({
          distanceKm,
          durationMinutes,
          mode: 'routes_api',
          originLabel,
          destinationName: destinationVault.hospital.name,
        });
      } catch (err) {
        if (cancelled) return;
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        const straightKm = haversineDistanceKm(origin, destinationVault.coordinates);
        const roadKm = Number((straightKm * 1.28).toFixed(1));
        const minutes = Math.max(6, Math.round((roadKm / 26) * 60));
        onRouteResolved?.({
          distanceKm: roadKm,
          durationMinutes: minutes,
          mode: 'estimated',
          originLabel,
          destinationName: destinationVault.hospital.name,
        });
      }
    };

    compute();

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [map, routesLib, origin, originLabel, destinationVault, onRouteResolved]);

  return null;
}

/**
 * High-precision Swiss Architectural Vector Radar Map.
 * Automatically renders when Maps API key is absent, quota is exceeded, or user selects Swiss Radar mode.
 */
function SwissVectorRadarMap({
  vaults,
  camps,
  selectedBloodGroup,
  showVaults,
  showCamps,
  highlightSubstitutes,
  selectedVaultId,
  selectedCampId,
  userLocation,
  routeOrigin,
  routeOriginLabel,
  routeDestinationVault,
  onSelectVault,
  onSelectCamp,
  onRouteResolved,
}: {
  vaults: HospitalVaultSnapshot[];
  camps: CampPinSnapshot[];
  selectedBloodGroup: BloodGroup | 'ALL';
  showVaults: boolean;
  showCamps: boolean;
  highlightSubstitutes: boolean;
  selectedVaultId: number | null;
  selectedCampId: number | null;
  userLocation: GeoPoint | null;
  routeOrigin: GeoPoint | null;
  routeOriginLabel: string;
  routeDestinationVault: HospitalVaultSnapshot | null;
  onSelectVault: (vault: HospitalVaultSnapshot) => void;
  onSelectCamp: (camp: CampPinSnapshot) => void;
  onRouteResolved?: (summary: RouteEtaSummary | null) => void;
}) {
  const [zoom, setZoom] = useState(1);

  // Geographic bounding box spanning Mumbai, Navi Mumbai, and Thane clinical corridors
  const bounds = {
    minLat: 18.89,
    maxLat: 19.24,
    minLng: 72.78,
    maxLng: 73.03,
  };

  const project = (pt: GeoPoint) => {
    const xPct = ((pt.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100;
    const yPct = (1 - (pt.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 100;
    return {
      x: Math.min(94, Math.max(6, xPct)),
      y: Math.min(92, Math.max(8, yPct)),
    };
  };

  useEffect(() => {
    if (!routeOrigin || !routeDestinationVault) {
      onRouteResolved?.(null);
      return;
    }
    const straightKm = haversineDistanceKm(routeOrigin, routeDestinationVault.coordinates);
    const roadKm = Number((straightKm * 1.28).toFixed(1));
    const minutes = Math.max(6, Math.round((roadKm / 26) * 60));
    onRouteResolved?.({
      distanceKm: roadKm,
      durationMinutes: minutes,
      mode: 'estimated',
      originLabel: routeOriginLabel,
      destinationName: routeDestinationVault.hospital.name,
    });
  }, [routeOrigin, routeOriginLabel, routeDestinationVault, onRouteResolved]);

  const routeLine = useMemo(() => {
    if (!routeOrigin || !routeDestinationVault) return null;
    const p1 = project(routeOrigin);
    const p2 = project(routeDestinationVault.coordinates);
    return { p1, p2 };
  }, [routeOrigin, routeDestinationVault]);

  return (
    <div className="relative w-full h-full bg-[#F4F6F9] overflow-hidden select-none">
      {/* Subtle Swiss Architectural Coordinate Canvas */}
      <div
        className="absolute inset-0 transition-transform duration-200 ease-out origin-center"
        style={{ transform: `scale(${zoom})` }}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="w-full h-full"
          aria-hidden="true"
        >
          {/* Coordinate Grid Lines */}
          {[12.5, 25, 37.5, 50, 62.5, 75, 87.5].map((pos) => (
            <g key={pos}>
              <line
                x1={pos}
                y1={0}
                x2={pos}
                y2={100}
                stroke="#E2E8F0"
                strokeWidth="0.22"
              />
              <line
                x1={0}
                y1={pos}
                x2={100}
                y2={pos}
                stroke="#E2E8F0"
                strokeWidth="0.22"
              />
            </g>
          ))}

          {/* Stylized Mumbai Peninsula & Thane Creek Silhouette */}
          <path
            d="M 14 96 L 19 86 L 17 72 L 15 62 L 21 51 L 24 38 L 28 24 L 35 12 L 58 8 L 78 12 L 88 26 L 84 44 L 93 56 L 89 72 L 73 74 L 62 60 L 49 62 L 42 75 L 32 88 L 23 96 Z"
            fill="#FFFFFF"
            stroke="#CBD5E1"
            strokeWidth="0.35"
          />

          {/* Major Arterial Expressways (WEH / EEH / Sea Link) */}
          <path
            d="M 21 89 Q 25 69 27 56 Q 31 38 35 19"
            fill="none"
            stroke="#CBD5E1"
            strokeWidth="0.35"
            strokeDasharray="1.2 1"
          />
          <path
            d="M 27 83 Q 41 64 56 42 Q 70 24 76 11"
            fill="none"
            stroke="#CBD5E1"
            strokeWidth="0.35"
            strokeDasharray="1.2 1"
          />

          {/* Active Route Vector */}
          {routeLine && (
            <line
              x1={routeLine.p1.x}
              y1={routeLine.p1.y}
              x2={routeLine.p2.x}
              y2={routeLine.p2.y}
              stroke="#BE123C"
              strokeWidth="0.7"
              strokeDasharray="1.6 1"
            />
          )}
        </svg>

        {/* Quiet Geographic District Labels */}
        <div className="pointer-events-none absolute inset-0 text-[9px] font-mono uppercase tracking-[0.14em] text-slate-400">
          <span className="absolute left-[11%] bottom-[8%]">Fort · Colaba</span>
          <span className="absolute left-[18%] top-[61%]">Parel · Worli</span>
          <span className="absolute left-[14%] top-[47%]">Bandra</span>
          <span className="absolute left-[29%] top-[32%]">Andheri · Powai</span>
          <span className="absolute left-[63%] top-[14%]">Thane · Mulund</span>
          <span className="absolute right-[8%] top-[52%]">Vashi</span>
        </div>

        {/* User Geolocation Crosshair */}
        {userLocation && (
          (() => {
            const pt = project(userLocation);
            return (
              <div
                style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none"
              >
                <div className="w-4 h-4 rounded-full bg-slate-950 border-2 border-white shadow-sm flex items-center justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                </div>
              </div>
            );
          })()
        )}

        {/* Camp Pins */}
        {showCamps &&
          camps.map((item) => {
            const pt = project(item.coordinates);
            const isSelected = selectedCampId === item.camp.id;
            return (
              <button
                key={`camp-${item.camp.id}`}
                type="button"
                onClick={() => onSelectCamp(item)}
                style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
                title={`${item.camp.name} · ${item.remainingSlots} slots open`}
                className={`absolute -translate-x-1/2 -translate-y-1/2 transition-transform duration-150 cursor-pointer ${
                  isSelected ? 'z-30 scale-110' : 'z-10 hover:z-20 hover:scale-105'
                }`}
              >
                <div
                  className={`px-2 py-1 rounded-md border text-[10px] font-mono font-semibold shadow-sm flex items-center gap-1 whitespace-nowrap ${
                    isSelected
                      ? 'bg-slate-950 text-white border-slate-950 ring-2 ring-rose-600/30'
                      : 'bg-white text-slate-800 border-slate-300 hover:border-slate-900'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-xs bg-slate-900 shrink-0" />
                  <span>CAMP · {item.remainingSlots}</span>
                </div>
              </button>
            );
          })}

        {/* Hospital Vault Pins */}
        {showVaults &&
          vaults.map((vault) => {
            const pt = project(vault.coordinates);
            const isSelected = selectedVaultId === vault.hospital.id;
            const hasOnlySubstitutes =
              selectedBloodGroup !== 'ALL' &&
              vault.directUnits === 0 &&
              vault.compatibleSubstituteUnits > 0;

            const toneClass = isSelected
              ? 'bg-slate-950 text-white border-slate-950 ring-2 ring-rose-600/35'
              : vault.status === 'Available'
              ? 'bg-white text-slate-950 border-emerald-600 hover:border-slate-950'
              : vault.status === 'Low'
              ? 'bg-white text-slate-950 border-amber-500 hover:border-slate-950'
              : hasOnlySubstitutes && highlightSubstitutes
              ? 'bg-amber-50 text-amber-950 border-amber-400 hover:border-slate-950'
              : 'bg-white text-rose-800 border-rose-600 hover:border-slate-950';

            const dotClass =
              vault.status === 'Available'
                ? 'bg-emerald-600'
                : vault.status === 'Low'
                ? 'bg-amber-500'
                : 'bg-rose-700';

            return (
              <button
                key={`vault-${vault.hospital.id}`}
                type="button"
                onClick={() => onSelectVault(vault)}
                style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
                title={`${vault.hospital.name} · ${vault.directUnits} direct units`}
                className={`absolute -translate-x-1/2 -translate-y-1/2 transition-transform duration-150 cursor-pointer ${
                  isSelected ? 'z-30 scale-110' : 'z-20 hover:z-30 hover:scale-105'
                }`}
              >
                <div
                  className={`px-2 py-1 rounded-md border text-[11px] font-mono font-bold shadow-sm flex items-center gap-1.5 whitespace-nowrap ${toneClass}`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
                  <span className="tabular-data">
                    {vault.directUnits}
                    {hasOnlySubstitutes && highlightSubstitutes
                      ? `+${vault.compatibleSubstituteUnits}s`
                      : ''}
                  </span>
                  <span
                    className={`text-[9px] font-sans font-medium hidden sm:inline ${
                      isSelected ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    {vault.hospital.hospitalCode.replace('HOSP-', 'H')}
                  </span>
                </div>
              </button>
            );
          })}
      </div>

      {/* Swiss Coordinate Scale & Zoom Controls */}
      <div className="absolute bottom-3 left-3 z-30 bg-white/95 backdrop-blur-xs border border-slate-200 px-2.5 py-1.5 rounded-md text-[10px] font-mono text-slate-500 tabular-data">
        19.0760° N · 72.8777° E · MUMBAI METRO GRID
      </div>

      <div className="absolute bottom-3 right-3 z-30 flex items-center bg-white border border-slate-200 rounded-md overflow-hidden shadow-xs">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(1.6, Number((z + 0.15).toFixed(2))))}
          aria-label="Zoom in radar"
          className="p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-950 border-r border-slate-200 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.85, Number((z - 0.15).toFixed(2))))}
          aria-label="Zoom out radar"
          className="p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-950 border-r border-slate-200 cursor-pointer"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setZoom(1)}
          aria-label="Reset radar zoom"
          className="p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-950 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function RegionalBloodMapCanvas({
  vaults,
  camps,
  selectedBloodGroup,
  showVaults,
  showCamps,
  highlightSubstitutes = true,
  selectedVaultId,
  selectedCampId,
  userLocation,
  routeOrigin,
  routeOriginLabel = 'Your Location',
  routeDestinationVaultId,
  quotaExceeded = false,
  heightClassName = 'h-[400px]',
  compact = false,
  onSelectVault,
  onSelectCamp,
  onRouteResolved,
}: RegionalBloodMapCanvasProps) {
  const canUseGoogleMaps = Boolean(MAPS_API_KEY) && !quotaExceeded;
  const [surfaceMode, setSurfaceMode] = useState<'google' | 'swiss'>(
    canUseGoogleMaps ? 'google' : 'swiss'
  );
  const [recenterSignal, setRecenterSignal] = useState(0);

  useEffect(() => {
    if (!canUseGoogleMaps && surfaceMode === 'google') {
      setSurfaceMode('swiss');
    }
  }, [canUseGoogleMaps, surfaceMode]);

  const selectedVault = useMemo(
    () => vaults.find((v) => v.hospital.id === selectedVaultId) ?? null,
    [vaults, selectedVaultId]
  );

  const selectedCamp = useMemo(
    () => camps.find((c) => c.camp.id === selectedCampId) ?? null,
    [camps, selectedCampId]
  );

  const routeDestinationVault = useMemo(
    () => vaults.find((v) => v.hospital.id === routeDestinationVaultId) ?? null,
    [vaults, routeDestinationVaultId]
  );

  const focusPoint: GeoPoint | null = selectedVault
    ? selectedVault.coordinates
    : selectedCamp
    ? selectedCamp.coordinates
    : null;

  const activeSurface = canUseGoogleMaps && surfaceMode === 'google' ? 'google' : 'swiss';

  return (
    <div className={`relative w-full ${heightClassName} bg-slate-100 overflow-hidden`}>
      {/* Compact Top-Left Swiss Legend Overlay */}
      <div className="absolute top-3 left-3 z-30 flex flex-wrap items-center gap-3 bg-white/95 backdrop-blur-xs border border-slate-200 px-3 py-1.5 rounded-md text-[11px] text-slate-700 shadow-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-600" />
          <span>Adequate</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <span>Low</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-rose-700" />
          <span>Critical</span>
        </span>
        {showCamps && !compact && (
          <span className="inline-flex items-center gap-1.5 pl-2 border-l border-slate-200">
            <span className="w-2 h-2 rounded-xs bg-slate-900" />
            <span>Camp</span>
          </span>
        )}
      </div>

      {/* Top-Right Surface Mode & Recenter Control */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5">
        {canUseGoogleMaps && (
          <div className="flex items-center bg-white/95 backdrop-blur-xs border border-slate-200 rounded-md p-0.5 shadow-xs text-[11px] font-medium">
            <button
              type="button"
              onClick={() => setSurfaceMode('google')}
              className={`px-2 py-1 rounded-xs transition-colors cursor-pointer inline-flex items-center gap-1 ${
                activeSurface === 'google'
                  ? 'bg-slate-950 text-white'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              <MapPin className="w-3 h-3" />
              <span>Live Map</span>
            </button>
            <button
              type="button"
              onClick={() => setSurfaceMode('swiss')}
              className={`px-2 py-1 rounded-xs transition-colors cursor-pointer inline-flex items-center gap-1 ${
                activeSurface === 'swiss'
                  ? 'bg-slate-950 text-white'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>Radar</span>
            </button>
          </div>
        )}

        {activeSurface === 'google' && (
          <button
            type="button"
            onClick={() => setRecenterSignal((s) => s + 1)}
            title="Recenter Mumbai Metro view"
            aria-label="Recenter map"
            className="p-1.5 rounded-md bg-white/95 backdrop-blur-xs border border-slate-200 text-slate-600 hover:text-slate-950 shadow-xs cursor-pointer"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {activeSurface === 'google' ? (
        <APIProvider apiKey={MAPS_API_KEY} language="en" region="IN">
          <div className="w-full h-full">
            <GoogleMap
              defaultCenter={MUMBAI_METRO_CENTER}
              defaultZoom={compact ? 11.1 : 11.4}
              mapId="DEMO_MAP_ID"
              internalUsageAttributionIds={GMP_ATTRIBUTION_IDS}
              gestureHandling="greedy"
              disableDefaultUI={compact}
              streetViewControl={false}
              mapTypeControl={false}
              fullscreenControl={false}
              className="w-full h-full"
            >
              <CameraFocusController
                focusPoint={focusPoint}
                focusZoom={12.8}
                recenterSignal={recenterSignal}
              />

              <ModernRoutePolylineLayer
                origin={routeOrigin}
                originLabel={routeOriginLabel}
                destinationVault={routeDestinationVault}
                onRouteResolved={onRouteResolved}
              />

              {/* User Location Pin */}
              {userLocation && (
                <AdvancedMarker position={userLocation} title="Your Location" zIndex={50}>
                  <div className="w-5 h-5 rounded-full bg-slate-950 border-2 border-white shadow-md flex items-center justify-center">
                    <Navigation className="w-2.5 h-2.5 text-rose-400 fill-rose-400" />
                  </div>
                </AdvancedMarker>
              )}

              {/* Donation Camp Pins */}
              {showCamps &&
                camps.map((item) => {
                  const isSelected = selectedCampId === item.camp.id;
                  return (
                    <AdvancedMarker
                      key={`gcamp-${item.camp.id}`}
                      position={item.coordinates}
                      title={`${item.camp.name} · ${item.remainingSlots} slots open`}
                      zIndex={isSelected ? 45 : 15}
                      onClick={() => onSelectCamp(item)}
                    >
                      <div
                        className={`px-2 py-1 rounded-md border text-[10px] font-mono font-semibold shadow-sm flex items-center gap-1 transition-transform duration-150 cursor-pointer ${
                          isSelected
                            ? 'bg-slate-950 text-white border-slate-950 scale-110'
                            : 'bg-white text-slate-800 border-slate-400 hover:border-slate-950'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-xs bg-rose-600 shrink-0" />
                        <span>CAMP · {item.remainingSlots}</span>
                      </div>
                    </AdvancedMarker>
                  );
                })}

              {/* Hospital Vault Pins */}
              {showVaults &&
                vaults.map((vault) => {
                  const isSelected = selectedVaultId === vault.hospital.id;
                  const hasOnlySubstitutes =
                    selectedBloodGroup !== 'ALL' &&
                    vault.directUnits === 0 &&
                    vault.compatibleSubstituteUnits > 0;

                  const toneClass = isSelected
                    ? 'bg-slate-950 text-white border-slate-950 scale-110 shadow-md'
                    : vault.status === 'Available'
                    ? 'bg-white text-slate-950 border-emerald-600 hover:border-slate-950'
                    : vault.status === 'Low'
                    ? 'bg-white text-slate-950 border-amber-500 hover:border-slate-950'
                    : hasOnlySubstitutes && highlightSubstitutes
                    ? 'bg-amber-50 text-amber-950 border-amber-500 hover:border-slate-950'
                    : 'bg-white text-rose-800 border-rose-600 hover:border-slate-950';

                  const dotClass =
                    vault.status === 'Available'
                      ? 'bg-emerald-600'
                      : vault.status === 'Low'
                      ? 'bg-amber-500'
                      : 'bg-rose-700';

                  return (
                    <AdvancedMarker
                      key={`gvault-${vault.hospital.id}`}
                      position={vault.coordinates}
                      title={`${vault.hospital.name} · ${vault.directUnits} units`}
                      zIndex={isSelected ? 48 : 25}
                      onClick={() => onSelectVault(vault)}
                    >
                      <div
                        className={`px-2 py-1 rounded-md border text-[11px] font-mono font-bold shadow-sm flex items-center gap-1.5 transition-transform duration-150 cursor-pointer ${toneClass}`}
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
                        <span className="tabular-data">
                          {vault.directUnits}
                          {hasOnlySubstitutes && highlightSubstitutes
                            ? `+${vault.compatibleSubstituteUnits}s`
                            : ''}
                        </span>
                        <span
                          className={`text-[9px] font-sans font-medium ${
                            isSelected ? 'text-slate-300' : 'text-slate-500'
                          }`}
                        >
                          {vault.hospital.hospitalCode.replace('HOSP-', 'H')}
                        </span>
                      </div>
                    </AdvancedMarker>
                  );
                })}
            </GoogleMap>
          </div>
        </APIProvider>
      ) : (
        <SwissVectorRadarMap
          vaults={vaults}
          camps={camps}
          selectedBloodGroup={selectedBloodGroup}
          showVaults={showVaults}
          showCamps={showCamps}
          highlightSubstitutes={highlightSubstitutes}
          selectedVaultId={selectedVaultId}
          selectedCampId={selectedCampId}
          userLocation={userLocation}
          routeOrigin={routeOrigin}
          routeOriginLabel={routeOriginLabel}
          routeDestinationVault={routeDestinationVault}
          onSelectVault={onSelectVault}
          onSelectCamp={onSelectCamp}
          onRouteResolved={onRouteResolved}
        />
      )}
    </div>
  );
}
