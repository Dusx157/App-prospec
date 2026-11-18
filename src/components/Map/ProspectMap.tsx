import React, { useEffect, useMemo, useState } from 'react';
import {
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Globe, Navigation, Star } from 'lucide-react';
import type { DiscoveredBusinessInput } from '../../contexts/DataContext';
import { getOpportunityMeta } from '../../lib/opportunity';
import type { Business } from '../../types';

export type MapBusinessItem = DiscoveredBusinessInput | Business;

export interface RouteStopMarker {
  id: string;
  label: string;
  lat: number;
  lng: number;
  kind: 'origin' | 'stop' | 'destination';
  badge: string;
}

interface ProspectMapProps {
  items: MapBusinessItem[];
  center?: { lat: number; lng: number };
  selectedPlaceId?: string | null;
  onSelectBusiness: (item: MapBusinessItem) => void;
  onAddToRoute?: (item: MapBusinessItem) => void;
  routePath?: Array<{ lat: number; lng: number }>;
  routeTravelMode?: 'WALK' | 'DRIVE';
  routeMarkers?: RouteStopMarker[];
  heightClass?: string;
}

function MapBoundsController({
  items,
  center,
  routePath,
}: {
  items: MapBusinessItem[];
  center?: { lat: number; lng: number };
  routePath?: Array<{ lat: number; lng: number }>;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    if (routePath && routePath.length > 1) {
      let north = -90;
      let south = 90;
      let east = -180;
      let west = 180;
      for (const pt of routePath) {
        if (pt.lat > north) north = pt.lat;
        if (pt.lat < south) south = pt.lat;
        if (pt.lng > east) east = pt.lng;
        if (pt.lng < west) west = pt.lng;
      }
      map.fitBounds({ north, south, east, west }, 56);
      return;
    }

    const valid = items.filter(
      (i) => Number.isFinite(i.lat) && Number.isFinite(i.lng) && (i.lat !== 0 || i.lng !== 0)
    );
    if (valid.length === 1) {
      map.panTo({ lat: valid[0].lat, lng: valid[0].lng });
      map.setZoom(15);
      return;
    }
    if (valid.length > 1) {
      let north = -90;
      let south = 90;
      let east = -180;
      let west = 180;
      for (const item of valid) {
        if (item.lat > north) north = item.lat;
        if (item.lat < south) south = item.lat;
        if (item.lng > east) east = item.lng;
        if (item.lng < west) west = item.lng;
      }
      map.fitBounds({ north, south, east, west }, 48);
      return;
    }
    if (center) {
      map.panTo(center);
      map.setZoom(13);
    }
  }, [map, items, center, routePath]);

  return null;
}

function RoutePolylineOverlay({
  path,
  travelMode,
}: {
  path?: Array<{ lat: number; lng: number }>;
  travelMode?: 'WALK' | 'DRIVE';
}) {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !mapsLib || !path || path.length < 2) return;

    const casing = new mapsLib.Polyline({
      path,
      geodesic: true,
      strokeColor: '#0B0D12',
      strokeOpacity: 0.75,
      strokeWeight: 8,
      zIndex: 40,
      map,
    });

    const isWalk = travelMode === 'WALK';
    const gMaps = (
      window as unknown as {
        google?: { maps?: { SymbolPath?: { CIRCLE: number } } };
      }
    ).google?.maps;
    const circlePath = gMaps?.SymbolPath?.CIRCLE ?? 0;

    const line = new mapsLib.Polyline({
      path,
      geodesic: true,
      strokeColor: '#19C37D',
      strokeOpacity: isWalk ? 0 : 0.95,
      strokeWeight: 4,
      zIndex: 41,
      icons: isWalk
        ? [
            {
              icon: {
                path: circlePath,
                fillColor: '#19C37D',
                fillOpacity: 1,
                strokeColor: '#0B0D12',
                strokeWeight: 1,
                scale: 3.2,
              },
              offset: '0',
              repeat: '12px',
            },
          ]
        : undefined,
      map,
    });

    return () => {
      casing.setMap(null);
      line.setMap(null);
    };
  }, [map, mapsLib, path, travelMode]);

  return null;
}

export function ProspectMap({
  items,
  center,
  selectedPlaceId,
  onSelectBusiness,
  onAddToRoute,
  routePath,
  routeTravelMode = 'WALK',
  routeMarkers = [],
  heightClass = 'h-[520px]',
}: ProspectMapProps) {
  const [activePlaceId, setActivePlaceId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedPlaceId) {
      setActivePlaceId(selectedPlaceId);
    }
  }, [selectedPlaceId]);

  const defaultCenter = useMemo(() => {
    if (center && (center.lat !== 0 || center.lng !== 0)) return center;
    const first = items.find((i) => i.lat !== 0 || i.lng !== 0);
    if (first) return { lat: first.lat, lng: first.lng };
    return { lat: -23.0902, lng: -47.2181 };
  }, [center, items]);

  const activeItem = useMemo(
    () => items.find((i) => i.placeId === activePlaceId) || null,
    [items, activePlaceId]
  );

  return (
    <div
      className={`w-full ${heightClass} rounded-2xl overflow-hidden border border-[#252B36] bg-[#141821] relative`}
    >
      <GoogleMap
        defaultCenter={defaultCenter}
        defaultZoom={13}
        mapId="DEMO_MAP_ID"
        gestureHandling="greedy"
        disableDefaultUI={false}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        style={{ width: '100%', height: '100%' }}
      >
        <MapBoundsController items={items} center={center} routePath={routePath} />
        <RoutePolylineOverlay path={routePath} travelMode={routeTravelMode} />

        {items
          .filter(
            (item) =>
              Number.isFinite(item.lat) &&
              Number.isFinite(item.lng) &&
              (item.lat !== 0 || item.lng !== 0)
          )
          .map((item) => {
            const meta = getOpportunityMeta(item.opportunityLevel);
            const isSelected = item.placeId === activePlaceId;
            return (
              <AdvancedMarker
                key={item.placeId}
                position={{ lat: item.lat, lng: item.lng }}
                title={`${item.name} (${item.opportunityScore}/100)`}
                onClick={() => setActivePlaceId(item.placeId)}
              >
                <Pin
                  background={meta.markerColor}
                  borderColor={isSelected ? '#FFFFFF' : '#0B0D12'}
                  glyphColor="#0B0D12"
                  scale={isSelected ? 1.25 : 1.0}
                />
              </AdvancedMarker>
            );
          })}

        {routeMarkers
          .filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng) && (m.lat !== 0 || m.lng !== 0))
          .map((marker) => (
            <AdvancedMarker
              key={`route_${marker.id}`}
              position={{ lat: marker.lat, lng: marker.lng }}
              title={marker.label}
              zIndex={60}
            >
              <Pin
                background={marker.kind === 'origin' ? '#38BDF8' : '#19C37D'}
                borderColor="#FFFFFF"
                glyphColor="#0B0D12"
                glyphText={marker.badge}
                scale={1.15}
              />
            </AdvancedMarker>
          ))}

        {activeItem && (
          <InfoWindow
            position={{ lat: activeItem.lat, lng: activeItem.lng }}
            onCloseClick={() => setActivePlaceId(null)}
            maxWidth={290}
          >
            <div className="p-1 text-[#0B0D12] space-y-1.5 min-w-[220px]">
              <div className="text-xs font-semibold leading-snug">{activeItem.name}</div>
              <div className="text-[11px] text-slate-600 flex items-center justify-between gap-2">
                <span>{activeItem.category}</span>
                <span className="inline-flex items-center gap-1 font-medium">
                  <Globe className="w-3 h-3" />
                  {activeItem.hasWebsite ? 'Com site' : 'Sem site'}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="inline-flex items-center gap-1">
                  <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                  {activeItem.rating > 0 ? activeItem.rating.toFixed(1) : '—'} (
                  {activeItem.userRatingCount})
                </span>
                <span className="font-semibold text-emerald-700">
                  Score {activeItem.opportunityScore}/100
                </span>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => onSelectBusiness(activeItem)}
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#0B0D12] text-[#F5F7FA] text-[11px] font-medium hover:bg-slate-800 transition-colors"
                >
                  Abrir ficha
                </button>
                {onAddToRoute && (
                  <button
                    type="button"
                    onClick={() => onAddToRoute(activeItem)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-700 transition-colors"
                  >
                    <Navigation className="w-3 h-3" />
                    Rota
                  </button>
                )}
              </div>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
    </div>
  );
}
