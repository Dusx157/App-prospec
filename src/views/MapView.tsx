import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Car,
  ExternalLink,
  Footprints,
  Globe,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  Plus,
  Route,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react';
import { ProspectMap, type MapBusinessItem, type RouteStopMarker } from '../components/Map/ProspectMap';
import { useData, type DiscoveredBusinessInput } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import {
  decodePolyline,
  formatAppError,
  formatDistanceMeters,
  formatDurationSeconds,
  getOpportunityMeta,
  safeFetchJson,
} from '../lib/opportunity';
import type { Business } from '../types';

export interface RouteStopItem {
  id: string;
  label: string;
  address?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
}

interface ComputedRouteLeg {
  distanceMeters: number;
  duration: string;
  startLocation: { latitude: number; longitude: number } | null;
  endLocation: { latitude: number; longitude: number } | null;
  steps: Array<{
    distanceMeters: number;
    duration: string;
    instruction: string;
    maneuver: string;
  }>;
}

interface ComputedRouteData {
  travelMode: 'WALK' | 'DRIVE';
  distanceMeters: number;
  duration: string;
  encodedPolyline: string;
  optimizedIntermediateWaypointIndex: number[] | null;
  legs: ComputedRouteLeg[];
}

interface MapViewProps {
  onSelectBusiness: (biz: Business) => void;
  mapsConfigured: boolean;
  queuedStop?: DiscoveredBusinessInput | Business | null;
  onConsumeQueuedStop?: () => void;
}

export function MapView({
  onSelectBusiness,
  mapsConfigured,
  queuedStop,
  onConsumeQueuedStop,
}: MapViewProps) {
  const { businesses, leads } = useData();
  const { showToast } = useToast();

  const [panelTab, setPanelTab] = useState<'places' | 'route'>('places');
  const [filterScope, setFilterScope] = useState<'all' | 'leads' | 'alta'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);

  // Walking / Multi-stop Route Planner State
  const [origin, setOrigin] = useState<RouteStopItem | null>(null);
  const [originAddressInput, setOriginAddressInput] = useState('');
  const [locatingUser, setLocatingUser] = useState(false);

  const [stops, setStops] = useState<RouteStopItem[]>([]);
  const [customStopAddress, setCustomStopAddress] = useState('');
  const [selectedBizIdToAdd, setSelectedBizIdToAdd] = useState('');
  const [travelMode, setTravelMode] = useState<'WALK' | 'DRIVE'>('WALK');
  const [optimizeOrder, setOptimizeOrder] = useState(true);

  const [computingRoute, setComputingRoute] = useState(false);
  const [computedRoute, setComputedRoute] = useState<ComputedRouteData | null>(null);

  // Consume business queued from BusinessDrawer ("Traçar rota até aqui")
  useEffect(() => {
    if (!queuedStop) return;
    setPanelTab('route');
    setStops((prev) => {
      if (prev.some((s) => s.placeId === queuedStop.placeId)) return prev;
      return [
        ...prev,
        {
          id: `stop_${queuedStop.placeId}`,
          label: queuedStop.name,
          address: queuedStop.address,
          lat: queuedStop.lat,
          lng: queuedStop.lng,
          placeId: queuedStop.placeId,
        },
      ];
    });
    if (queuedStop.placeId) setSelectedPlaceId(queuedStop.placeId);
    onConsumeQueuedStop?.();
  }, [queuedStop, onConsumeQueuedStop]);

  const leadPlaceIds = useMemo(() => new Set(leads.map((l) => l.placeId)), [leads]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    businesses.forEach((b) => {
      if (b.category) set.add(b.category);
    });
    return Array.from(set).sort();
  }, [businesses]);

  const filtered = useMemo(() => {
    return businesses.filter((b) => {
      if (filterScope === 'leads' && !leadPlaceIds.has(b.placeId)) return false;
      if (filterScope === 'alta' && b.opportunityLevel !== 'alta') return false;
      if (categoryFilter !== 'all' && b.category !== categoryFilter) return false;
      return true;
    });
  }, [businesses, filterScope, categoryFilter, leadPlaceIds]);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      showToast('Seu navegador não suporta geolocalização. Digite um endereço de origem.', 'error');
      return;
    }
    setLocatingUser(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({
          id: 'origin_gps',
          label: 'Minha localização atual',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setOriginAddressInput('Minha localização atual (GPS)');
        setLocatingUser(false);
        showToast('Localização atual definida como origem.');
      },
      () => {
        setLocatingUser(false);
        showToast('Não foi possível obter sua localização. Informe um endereço de partida.', 'error');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleAddBusinessToRoute = (item: MapBusinessItem) => {
    setPanelTab('route');
    setStops((prev) => {
      if (prev.some((s) => s.placeId === item.placeId)) {
        showToast(`"${item.name}" já está na lista de paradas.`);
        return prev;
      }
      showToast(`"${item.name}" adicionado ao roteiro.`);
      return [
        ...prev,
        {
          id: `stop_${item.placeId}_${Date.now()}`,
          label: item.name,
          address: item.address,
          lat: item.lat,
          lng: item.lng,
          placeId: item.placeId,
        },
      ];
    });
  };

  const handleAddCustomStop = () => {
    const addr = customStopAddress.trim();
    if (!addr) return;
    setStops((prev) => [
      ...prev,
      {
        id: `stop_addr_${Date.now()}`,
        label: addr,
        address: addr,
      },
    ]);
    setCustomStopAddress('');
  };

  const handleAddSelectedBiz = (bizId: string) => {
    setSelectedBizIdToAdd('');
    const found = businesses.find((b) => b.id === bizId);
    if (found) handleAddBusinessToRoute(found);
  };

  const moveStop = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= stops.length) return;
    setStops((prev) => {
      const next = [...prev];
      const [removed] = next.splice(idx, 1);
      next.splice(target, 0, removed);
      return next;
    });
  };

  const removeStop = (id: string) => {
    setStops((prev) => prev.filter((s) => s.id !== id));
    setComputedRoute(null);
  };

  const handleComputeRoute = async () => {
    const resolvedOrigin: RouteStopItem | null =
      origin ||
      (originAddressInput.trim()
        ? {
            id: 'origin_text',
            label: originAddressInput.trim(),
            address: originAddressInput.trim(),
          }
        : null);

    if (!resolvedOrigin) {
      showToast('Defina um ponto de origem (GPS ou endereço) para traçar a rota.', 'error');
      return;
    }
    if (stops.length === 0) {
      showToast('Adicione pelo menos 1 parada de destino.', 'error');
      return;
    }

    const destination = stops[stops.length - 1];
    const intermediates = stops.slice(0, -1);

    setComputingRoute(true);
    try {
      let routeData: ComputedRouteData;
      try {
        const res = await safeFetchJson<ComputedRouteData>(
          '/api/routes/compute',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              origin: resolvedOrigin,
              destination,
              intermediates,
              travelMode,
              optimizeWaypointOrder: optimizeOrder && intermediates.length > 1,
            }),
          },
          'Falha ao calcular rota.'
        );
        routeData = res.data;
      } catch (fetchErr) {
        const errWithCode = fetchErr as Error & { statusCode?: number };
        if (errWithCode.statusCode === 429 || errWithCode.message.includes('RESOURCE_EXHAUSTED')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        throw fetchErr;
      }

      setComputedRoute(routeData);

      // Reorder intermediate stops visually if optimized
      if (
        Array.isArray(routeData.optimizedIntermediateWaypointIndex) &&
        routeData.optimizedIntermediateWaypointIndex.length === intermediates.length
      ) {
        const reordered = routeData.optimizedIntermediateWaypointIndex.map((i) => intermediates[i]);
        setStops([...reordered, destination]);
      }

      showToast('Rota traçada com sucesso.');
    } catch (err) {
      showToast(formatAppError(err, 'Erro ao traçar rota.'), 'error');
    } finally {
      setComputingRoute(false);
    }
  };

  const routePath = useMemo(() => {
    if (!computedRoute?.encodedPolyline) return [];
    return decodePolyline(computedRoute.encodedPolyline);
  }, [computedRoute]);

  const routeMarkers: RouteStopMarker[] = useMemo(() => {
    const list: RouteStopMarker[] = [];
    if (origin && origin.lat && origin.lng) {
      list.push({
        id: 'origin',
        label: origin.label,
        lat: origin.lat,
        lng: origin.lng,
        kind: 'origin',
        badge: 'P',
      });
    }
    stops.forEach((s, idx) => {
      if (s.lat && s.lng) {
        list.push({
          id: s.id,
          label: s.label,
          lat: s.lat,
          lng: s.lng,
          kind: idx === stops.length - 1 ? 'destination' : 'stop',
          badge: String(idx + 1),
        });
      }
    });
    return list;
  }, [origin, stops]);

  const googleMapsExternalUrl = useMemo(() => {
    const resolvedOrigin = origin
      ? origin.lat && origin.lng
        ? `${origin.lat},${origin.lng}`
        : origin.address || ''
      : originAddressInput.trim();
    if (!resolvedOrigin || stops.length === 0) return '';
    const formatStop = (s: RouteStopItem) =>
      s.lat && s.lng ? `${s.lat},${s.lng}` : s.address || s.label;
    const dest = formatStop(stops[stops.length - 1]);
    const wps = stops.slice(0, -1).map(formatStop).join('|');
    const mode = travelMode === 'WALK' ? 'walking' : 'driving';
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(resolvedOrigin)}&destination=${encodeURIComponent(dest)}${wps ? `&waypoints=${encodeURIComponent(wps)}` : ''}&travelmode=${mode}`;
  }, [origin, originAddressInput, stops, travelMode]);

  return (
    <div className="space-y-4">
      <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-[#0B0D12] border border-[#252B36] rounded-xl">
          <button
            type="button"
            onClick={() => setFilterScope('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filterScope === 'all' ? 'bg-[#141821] text-[#F5F7FA]' : 'text-[#929BAA] hover:text-[#F5F7FA]'
            }`}
          >
            Todos ({businesses.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterScope('leads')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filterScope === 'leads' ? 'bg-[#141821] text-[#F5F7FA]' : 'text-[#929BAA] hover:text-[#F5F7FA]'
            }`}
          >
            Somente Leads ({leads.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterScope('alta')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filterScope === 'alta' ? 'bg-[#141821] text-[#19C37D]' : 'text-[#929BAA] hover:text-[#F5F7FA]'
            }`}
          >
            Alta oportunidade
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-9 px-3 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA]"
          >
            <option value="all">Todas as categorias</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setPanelTab(panelTab === 'route' ? 'places' : 'route')}
            className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border text-xs font-medium transition-all ${
              panelTab === 'route'
                ? 'bg-[#19C37D] text-[#0B0D12] border-[#19C37D] font-semibold'
                : 'bg-[#0B0D12] border-[#252B36] text-[#F5F7FA] hover:border-[#19C37D]'
            }`}
          >
            <Route className="w-3.5 h-3.5" />
            Roteiro a pé {stops.length > 0 ? `(${stops.length})` : ''}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Left Panel: Places OR Walking Route Planner */}
        <div className="xl:col-span-4 bg-[#141821] border border-[#252B36] rounded-2xl h-[660px] flex flex-col overflow-hidden">
          <div className="px-3 py-2.5 border-b border-[#252B36] flex items-center gap-1 bg-[#0B0D12]/40 shrink-0">
            <button
              type="button"
              onClick={() => setPanelTab('places')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                panelTab === 'places'
                  ? 'bg-[#141821] text-[#F5F7FA] border border-[#252B36]'
                  : 'text-[#929BAA] hover:text-[#F5F7FA]'
              }`}
            >
              Locais ({filtered.length})
            </button>
            <button
              type="button"
              onClick={() => setPanelTab('route')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center justify-center gap-1.5 ${
                panelTab === 'route'
                  ? 'bg-[#141821] text-[#19C37D] border border-[#252B36]'
                  : 'text-[#929BAA] hover:text-[#F5F7FA]'
              }`}
            >
              <Footprints className="w-3.5 h-3.5" />
              Traçar rota ({stops.length})
            </button>
          </div>

          {panelTab === 'places' ? (
            filtered.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-2">
                <MapPin className="w-5 h-5 text-[#929BAA]" />
                <p className="text-xs text-[#929BAA]">
                  Nenhum estabelecimento salvo corresponde aos filtros selecionados.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto divide-y divide-[#252B36]">
                {filtered.map((b) => {
                  const opp = getOpportunityMeta(b.opportunityLevel);
                  const inRoute = stops.some((s) => s.placeId === b.placeId);
                  return (
                    <div
                      key={b.id}
                      onClick={() => {
                        setSelectedPlaceId(b.placeId);
                        onSelectBusiness(b);
                      }}
                      className={`p-3.5 cursor-pointer transition-colors space-y-1.5 ${
                        selectedPlaceId === b.placeId ? 'bg-[#181D28]' : 'hover:bg-[#181D28]/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-[#F5F7FA] truncate">
                          {b.name}
                        </span>
                        <span className={`text-xs font-mono tabular-nums font-semibold ${opp.textColor}`}>
                          {b.opportunityScore}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-[#929BAA]">
                        <span className="truncate">
                          {b.category} · {b.city || 'Local'}
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono shrink-0">
                          <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                          {b.rating > 0 ? b.rating.toFixed(1) : '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] pt-0.5">
                        <span className={b.hasWebsite ? 'text-[#19C37D]' : 'text-amber-400'}>
                          <Globe className="w-3 h-3 inline mr-1" />
                          {b.hasWebsite ? 'Possui site' : 'Sem site'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddBusinessToRoute(b);
                          }}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-medium transition-colors ${
                            inRoute
                              ? 'border-[#19C37D] text-[#19C37D] bg-[#19C37D]/10'
                              : 'border-[#252B36] text-[#929BAA] hover:text-[#F5F7FA] hover:border-[#19C37D]'
                          }`}
                        >
                          <Navigation className="w-2.5 h-2.5" />
                          {inRoute ? 'Na rota' : '+ Rota'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Travel mode switch */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTravelMode('WALK');
                    setComputedRoute(null);
                  }}
                  className={`flex items-center justify-center gap-1.5 h-9 rounded-xl border text-xs font-medium transition-all ${
                    travelMode === 'WALK'
                      ? 'bg-[#19C37D]/15 border-[#19C37D] text-[#19C37D]'
                      : 'bg-[#0B0D12] border-[#252B36] text-[#929BAA] hover:text-[#F5F7FA]'
                  }`}
                >
                  <Footprints className="w-3.5 h-3.5" />
                  A pé (Google Walk)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTravelMode('DRIVE');
                    setComputedRoute(null);
                  }}
                  className={`flex items-center justify-center gap-1.5 h-9 rounded-xl border text-xs font-medium transition-all ${
                    travelMode === 'DRIVE'
                      ? 'bg-[#19C37D]/15 border-[#19C37D] text-[#19C37D]'
                      : 'bg-[#0B0D12] border-[#252B36] text-[#929BAA] hover:text-[#F5F7FA]'
                  }`}
                >
                  <Car className="w-3.5 h-3.5" />
                  De carro
                </button>
              </div>

              {/* Origin */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-[#929BAA]">
                    Ponto de partida (Origem)
                  </label>
                  <button
                    type="button"
                    onClick={handleUseCurrentLocation}
                    disabled={locatingUser}
                    className="inline-flex items-center gap-1 text-[11px] text-[#19C37D] hover:underline disabled:opacity-50"
                  >
                    {locatingUser ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <LocateFixed className="w-3 h-3" />
                    )}
                    Usar minha localização
                  </button>
                </div>
                <input
                  type="text"
                  value={originAddressInput}
                  onChange={(e) => {
                    setOriginAddressInput(e.target.value);
                    if (origin?.id === 'origin_gps') setOrigin(null);
                  }}
                  placeholder="Digite rua, bairro ou cidade de saída..."
                  className="w-full h-9 px-3 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
                />
                {businesses.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      const b = businesses.find((x) => x.id === e.target.value);
                      if (b) {
                        setOrigin({
                          id: `origin_${b.placeId}`,
                          label: b.name,
                          address: b.address,
                          lat: b.lat,
                          lng: b.lng,
                          placeId: b.placeId,
                        });
                        setOriginAddressInput(b.name);
                      }
                    }}
                    className="w-full h-8 px-2.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-[11px] text-[#929BAA]"
                  >
                    <option value="">Ou partir de um estabelecimento salvo...</option>
                    {businesses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} — {b.city}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Add Stops */}
              <div className="space-y-2 pt-2 border-t border-[#252B36]">
                <label className="block text-[11px] font-medium text-[#929BAA]">
                  Paradas no roteiro (até lá, e depois outro lugar...)
                </label>

                {businesses.length > 0 && (
                  <select
                    value={selectedBizIdToAdd}
                    onChange={(e) => handleAddSelectedBiz(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA]"
                  >
                    <option value="">+ Adicionar empresa salva ao roteiro...</option>
                    {businesses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.opportunityScore}/100)
                      </option>
                    ))}
                  </select>
                )}

                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={customStopAddress}
                    onChange={(e) => setCustomStopAddress(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomStop();
                      }
                    }}
                    placeholder="Ou digite um endereço / local..."
                    className="flex-1 h-9 px-3 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomStop}
                    className="h-9 px-3 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] hover:border-[#19C37D]"
                    title="Adicionar parada"
                  >
                    <Plus className="w-4 h-4 text-[#19C37D]" />
                  </button>
                </div>
              </div>

              {/* Stops Queue */}
              {stops.length > 0 && (
                <div className="space-y-2">
                  {stops.map((stop, idx) => (
                    <div
                      key={stop.id}
                      className="flex items-center justify-between gap-2 bg-[#0B0D12] border border-[#252B36] rounded-xl px-3 py-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-[#19C37D] text-[#0B0D12] text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-[#F5F7FA] truncate">
                            {stop.label}
                          </div>
                          {stop.address && stop.address !== stop.label && (
                            <div className="text-[10px] text-[#929BAA] truncate">
                              {stop.address}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => moveStop(idx, -1)}
                          disabled={idx === 0}
                          className="p-1 text-[#929BAA] hover:text-[#F5F7FA] disabled:opacity-30"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveStop(idx, 1)}
                          disabled={idx === stops.length - 1}
                          className="p-1 text-[#929BAA] hover:text-[#F5F7FA] disabled:opacity-30"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeStop(stop.id)}
                          className="p-1 text-[#929BAA] hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {stops.length > 2 && (
                    <label className="flex items-center gap-2 text-[11px] text-[#929BAA] cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={optimizeOrder}
                        onChange={(e) => setOptimizeOrder(e.target.checked)}
                        className="rounded border-[#252B36] bg-[#0B0D12] text-[#19C37D]"
                      />
                      Otimizar ordem das paradas intermediárias automaticamente
                    </label>
                  )}
                </div>
              )}

              {/* Compute Route CTA */}
              <button
                type="button"
                onClick={() => void handleComputeRoute()}
                disabled={computingRoute || stops.length === 0}
                className="w-full h-10 rounded-xl bg-[#19C37D] text-[#0B0D12] text-xs font-semibold hover:bg-[#16AE6F] transition-all active:scale-[0.98] inline-flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {computingRoute ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {travelMode === 'WALK' ? 'Traçar rota a pé' : 'Traçar rota de carro'}
              </button>

              {/* Route Result Details */}
              {computedRoute && (
                <div className="bg-[#0B0D12] border border-[#252B36] rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] text-[#929BAA]">Tempo & distância total</div>
                      <div className="text-base font-semibold font-mono tabular-nums text-[#F5F7FA]">
                        {formatDurationSeconds(computedRoute.duration)} ·{' '}
                        <span className="text-[#19C37D]">
                          {formatDistanceMeters(computedRoute.distanceMeters)}
                        </span>
                      </div>
                    </div>
                    {googleMapsExternalUrl && (
                      <a
                        href={googleMapsExternalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#141821] border border-[#252B36] text-[11px] text-[#19C37D] hover:border-[#19C37D]"
                      >
                        Abrir GPS
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  {computedRoute.travelMode === 'WALK' && (
                    <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-200 leading-snug">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        Aviso Beta: rotas a pé no Google Maps Platform estão em fase beta e podem ocasionalmente não exibir todas as calçadas ou travessias. Atenção ao caminhar.
                      </span>
                    </div>
                  )}

                  <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                    {computedRoute.legs.map((leg, legIdx) => (
                      <div key={legIdx} className="space-y-1.5 pt-2 first:pt-0 border-t first:border-t-0 border-[#252B36]">
                        <div className="flex items-center justify-between text-[11px] font-medium text-[#F5F7FA]">
                          <span>
                            Trecho {legIdx + 1}: {stops[legIdx]?.label || `Parada ${legIdx + 1}`}
                          </span>
                          <span className="font-mono text-[#929BAA]">
                            {formatDurationSeconds(leg.duration)} · {formatDistanceMeters(leg.distanceMeters)}
                          </span>
                        </div>
                        <ul className="space-y-1">
                          {leg.steps
                            .filter((s) => s.instruction)
                            .map((step, sIdx) => (
                              <li key={sIdx} className="text-[11px] text-[#929BAA] flex items-start justify-between gap-2">
                                <span className="leading-snug">• {step.instruction}</span>
                                <span className="font-mono text-[10px] shrink-0">
                                  {formatDistanceMeters(step.distanceMeters)}
                                </span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Map Canvas */}
        <div className="xl:col-span-8">
          {mapsConfigured ? (
            <ProspectMap
              items={filtered as MapBusinessItem[]}
              selectedPlaceId={selectedPlaceId}
              onSelectBusiness={(item) => onSelectBusiness(item as Business)}
              onAddToRoute={handleAddBusinessToRoute}
              routePath={routePath}
              routeTravelMode={computedRoute?.travelMode || travelMode}
              routeMarkers={routeMarkers}
              heightClass="h-[660px]"
            />
          ) : (
            <div className="h-[660px] bg-[#141821] border border-[#252B36] rounded-2xl flex items-center justify-center p-6 text-xs text-[#929BAA]">
              Chave do Google Maps Platform não configurada no servidor.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
