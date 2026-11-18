import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCheck,
  Globe,
  History,
  Loader2,
  MapPin,
  Phone,
  Radar,
  Search,
  Star,
  UserPlus,
} from 'lucide-react';
import { ProspectMap, type MapBusinessItem } from '../components/Map/ProspectMap';
import { useAuth } from '../contexts/AuthContext';
import { useData, type DiscoveredBusinessInput } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { computeGbpSummary, formatAppError, getOpportunityMeta, safeFetchJson } from '../lib/opportunity';
import { BUSINESS_CATEGORIES, type Business } from '../types';

interface RadarViewProps {
  onSelectBusiness: (biz: DiscoveredBusinessInput | Business) => void;
  mapsConfigured: boolean;
}

export function RadarView({ onSelectBusiness, mapsConfigured }: RadarViewProps) {
  const { profile } = useAuth();
  const {
    leads,
    interactions,
    searchHistory,
    saveBusinessesBatch,
    saveLeadFromBusiness,
    recordSearchHistory,
  } = useData();
  const { showToast } = useToast();

  const [city, setCity] = useState(profile?.defaultCity || 'Indaiatuba');
  const [stateCode, setStateCode] = useState(profile?.defaultState || 'SP');
  const [neighborhood, setNeighborhood] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [radiusKm, setRadiusKm] = useState(10);
  const [categoryKey, setCategoryKey] = useState('barbearias');
  const [customQuery, setCustomQuery] = useState('');
  const [maxResults, setMaxResults] = useState(20);
  const [searchMode, setSearchMode] = useState<'text' | 'nearby'>('text');

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DiscoveredBusinessInput[]>([]);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | undefined>(undefined);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [savingPlaceId, setSavingPlaceId] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.defaultCity && !city) setCity(profile.defaultCity);
    if (profile?.defaultState && !stateCode) setStateCode(profile.defaultState);
  }, [profile?.defaultCity, profile?.defaultState]);

  const savedLeadPlaceIds = useMemo(() => new Set(leads.map((l) => l.placeId)), [leads]);
  const waSentPlaceIds = useMemo(() => {
    const waLeadIds = new Set(interactions.filter((i) => i.type === 'whatsapp').map((i) => i.leadId));
    return new Set(leads.filter((l) => waLeadIds.has(l.id)).map((l) => l.placeId));
  }, [leads, interactions]);

  const runSearch = async (e?: React.FormEvent, overrides?: Partial<{
    city: string;
    stateCode: string;
    neighborhood: string;
    postalCode: string;
    radiusKm: number;
    categoryKey: string;
  }>) => {
    if (e) e.preventDefault();

    const targetCity = (overrides?.city ?? city).trim();
    const targetState = (overrides?.stateCode ?? stateCode).trim();
    const targetNeighborhood = (overrides?.neighborhood ?? neighborhood).trim();
    const targetPostal = (overrides?.postalCode ?? postalCode).trim();
    const targetRadius = overrides?.radiusKm ?? radiusKm;
    const targetCategoryKey = overrides?.categoryKey ?? categoryKey;

    if (!targetCity && !targetPostal && !customQuery.trim()) {
      showToast('Informe pelo menos uma cidade, CEP ou busca personalizada.', 'error');
      return;
    }

    setLoading(true);
    try {
      let data: {
        businesses?: DiscoveredBusinessInput[];
        center?: { lat: number; lng: number };
      };
      try {
        const res = await safeFetchJson<{
          businesses?: DiscoveredBusinessInput[];
          center?: { lat: number; lng: number };
        }>(
          '/api/places/search',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              city: targetCity,
              state: targetState,
              neighborhood: targetNeighborhood,
              postalCode: targetPostal,
              radiusKm: targetRadius,
              categoryKey: targetCategoryKey,
              customQuery: customQuery.trim(),
              maxResults,
              searchMode,
            }),
          },
          'Falha ao buscar estabelecimentos.'
        );
        data = res.data;
      } catch (fetchErr) {
        const errWithCode = fetchErr as Error & { statusCode?: number };
        if (errWithCode.statusCode === 429 || errWithCode.message.includes('RESOURCE_EXHAUSTED')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        throw fetchErr;
      }

      const found: DiscoveredBusinessInput[] = Array.isArray(data.businesses) ? data.businesses : [];
      const sorted = [...found].sort((a, b) => b.opportunityScore - a.opportunityScore);
      setResults(sorted);
      if (data.center) setMapCenter(data.center);
      setSelectedPlaceId(sorted[0]?.placeId || null);

      const catLabel =
        customQuery.trim() ||
        BUSINESS_CATEGORIES.find((c) => c.key === targetCategoryKey)?.label ||
        targetCategoryKey;

      if (sorted.length > 0) {
        await saveBusinessesBatch(sorted);
      }

      await recordSearchHistory({
        city: targetCity,
        state: targetState,
        neighborhood: targetNeighborhood,
        postalCode: targetPostal,
        radiusKm: targetRadius,
        category: catLabel,
        requestedCount: maxResults,
        resultsCount: sorted.length,
      });

      showToast(`${sorted.length} estabelecimento(s) encontrado(s) no radar.`);
    } catch (err) {
      showToast(formatAppError(err, 'Erro na pesquisa do radar.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSaveLead = async (
    e: React.MouseEvent,
    biz: DiscoveredBusinessInput
  ) => {
    e.stopPropagation();
    setSavingPlaceId(biz.placeId);
    try {
      await saveLeadFromBusiness(biz);
      showToast(`"${biz.name}" salvo como lead.`);
    } catch (err) {
      showToast(formatAppError(err, 'Erro ao salvar lead.'), 'error');
    } finally {
      setSavingPlaceId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Search Controls Card */}
      <form
        onSubmit={(e) => void runSearch(e)}
        className="bg-[#141821] border border-[#252B36] rounded-2xl p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Radar className="w-4 h-4 text-[#19C37D]" />
            <h2 className="text-sm font-semibold text-[#F5F7FA]">
              Parâmetros de prospecção
            </h2>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#0B0D12] border border-[#252B36] rounded-lg">
            <button
              type="button"
              onClick={() => setSearchMode('text')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                searchMode === 'text'
                  ? 'bg-[#141821] text-[#F5F7FA]'
                  : 'text-[#929BAA] hover:text-[#F5F7FA]'
              }`}
            >
              Text Search
            </button>
            <button
              type="button"
              onClick={() => setSearchMode('nearby')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                searchMode === 'nearby'
                  ? 'bg-[#141821] text-[#F5F7FA]'
                  : 'text-[#929BAA] hover:text-[#F5F7FA]'
              }`}
            >
              Nearby Search
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] text-[#929BAA] mb-1">Cidade</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Ex.: Indaiatuba"
              className="w-full h-9 px-3 rounded-lg bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#929BAA] mb-1">Estado</label>
            <input
              type="text"
              value={stateCode}
              onChange={(e) => setStateCode(e.target.value)}
              placeholder="Ex.: SP"
              className="w-full h-9 px-3 rounded-lg bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#929BAA] mb-1">Bairro (opcional)</label>
            <input
              type="text"
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              placeholder="Ex.: Centro"
              className="w-full h-9 px-3 rounded-lg bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#929BAA] mb-1">CEP (opcional)</label>
            <input
              type="text"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="Ex.: 13330-000"
              className="w-full h-9 px-3 rounded-lg bg-[#0B0D12] border border-[#252B36] text-xs font-mono text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-[11px] text-[#929BAA] mb-1">Categoria comercial</label>
            <select
              value={categoryKey}
              onChange={(e) => setCategoryKey(e.target.value)}
              className="w-full h-9 px-3 rounded-lg bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
            >
              {BUSINESS_CATEGORIES.map((cat) => (
                <option key={cat.key} value={cat.key}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-[#929BAA] mb-1">
              Pesquisa personalizada (opcional)
            </label>
            <input
              type="text"
              value={customQuery}
              onChange={(e) => setCustomQuery(e.target.value)}
              placeholder="Ex.: Clínica estética, Pizzaria..."
              className="w-full h-9 px-3 rounded-lg bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-[#929BAA] mb-1">Raio (km)</label>
              <select
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                className="w-full h-9 px-2.5 rounded-lg bg-[#0B0D12] border border-[#252B36] text-xs font-mono text-[#F5F7FA]"
              >
                <option value={2}>2 km</option>
                <option value={5}>5 km</option>
                <option value={10}>10 km</option>
                <option value={20}>20 km</option>
                <option value={35}>35 km</option>
                <option value={50}>50 km</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-[#929BAA] mb-1">Resultados</label>
              <select
                value={maxResults}
                onChange={(e) => setMaxResults(Number(e.target.value))}
                className="w-full h-9 px-2.5 rounded-lg bg-[#0B0D12] border border-[#252B36] text-xs font-mono text-[#F5F7FA]"
              >
                <option value={10}>Até 10</option>
                <option value={20}>Até 20</option>
                <option value={40}>Até 40</option>
                <option value={60}>Até 60</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="h-9 px-4 rounded-lg bg-[#19C37D] text-[#0B0D12] text-xs font-semibold hover:bg-[#16AE6F] transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60 whitespace-nowrap"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Buscar empresas
          </button>
        </div>

        {/* Recent Searches */}
        {searchHistory.length > 0 && (
          <div className="pt-2 border-t border-[#252B36] flex items-center gap-2 overflow-x-auto">
            <span className="inline-flex items-center gap-1 text-[11px] text-[#929BAA] shrink-0">
              <History className="w-3 h-3" />
              Recentes:
            </span>
            {searchHistory.slice(0, 5).map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => {
                  setCity(h.city || '');
                  setStateCode(h.state || '');
                  setNeighborhood(h.neighborhood || '');
                  setPostalCode(h.postalCode || '');
                  setRadiusKm(h.radiusKm);
                  const matchedCat = BUSINESS_CATEGORIES.find((c) => c.label === h.category);
                  if (matchedCat) {
                    setCategoryKey(matchedCat.key);
                    setCustomQuery('');
                  } else {
                    setCustomQuery(h.category);
                  }
                }}
                className="px-2.5 py-1 rounded-md bg-[#0B0D12] border border-[#252B36] text-[11px] text-[#929BAA] hover:text-[#F5F7FA] hover:border-[#19C37D]/50 transition-colors whitespace-nowrap shrink-0"
              >
                {h.category} · {h.city || h.postalCode} ({h.resultsCount})
              </button>
            ))}
          </div>
        )}
      </form>

      {/* Results Split: List + Map */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Results List */}
        <div className="xl:col-span-5 bg-[#141821] border border-[#252B36] rounded-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] flex flex-col h-[560px] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#252B36] flex items-center justify-between shrink-0">
            <span className="text-xs font-semibold text-[#F5F7FA]">
              Estabelecimentos ({results.length})
            </span>
            <span className="text-[11px] text-[#929BAA]">Ordenado por potencial</span>
          </div>

          {results.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-2">
              <MapPin className="w-6 h-6 text-[#929BAA]" />
              <div className="text-xs font-medium text-[#F5F7FA]">
                Nenhuma pesquisa executada nesta sessão
              </div>
              <p className="text-xs text-[#929BAA] max-w-xs">
                Escolha uma cidade e categoria acima para localizar estabelecimentos reais via Google Places API (New).
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto divide-y divide-[#252B36]">
              {results.map((biz) => {
                const opp = getOpportunityMeta(biz.opportunityLevel);
                const gbp = computeGbpSummary(biz);
                const isLeadSaved = savedLeadPlaceIds.has(biz.placeId);
                const isWaSent = waSentPlaceIds.has(biz.placeId);
                const isSelected = selectedPlaceId === biz.placeId;
                return (
                  <div
                    key={biz.placeId}
                    onClick={() => {
                      setSelectedPlaceId(biz.placeId);
                      onSelectBusiness(biz);
                    }}
                    className={`p-4 cursor-pointer transition-colors space-y-2 ${
                      isSelected ? 'bg-[#181D28]' : 'hover:bg-[#181D28]/70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#F5F7FA] truncate">
                          {biz.name}
                        </div>
                        <div className="text-[11px] text-[#929BAA] truncate mt-0.5">
                          {biz.category} · {biz.neighborhood || biz.city || 'Local'}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-xs font-mono font-semibold tabular-nums ${opp.textColor}`}>
                          {biz.opportunityScore}/100
                        </div>
                        <div className="text-[10px] text-[#929BAA]">{opp.shortLabel}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                      <span className={`inline-flex items-center gap-1 font-medium ${gbp.hasWebsite ? 'text-[#19C37D]' : 'text-amber-400'}`}>
                        <Globe className="w-3 h-3" />
                        {gbp.hasWebsite ? 'Possui site' : 'Sem site'}
                      </span>
                      <span className="text-[#929BAA] font-mono tabular-nums">
                        GBP {gbp.gbpScore}/100
                      </span>
                      {isWaSent && (
                        <span className="inline-flex items-center gap-1 text-[#19C37D] font-medium">
                          <CheckCheck className="w-3 h-3" />
                          WhatsApp enviado
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[11px] text-[#929BAA]">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums text-[#F5F7FA]">
                          <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                          {biz.rating > 0 ? biz.rating.toFixed(1) : '—'}
                          <span className="text-[#929BAA]">({biz.userRatingCount})</span>
                        </span>
                        {biz.phone && (
                          <span className="inline-flex items-center gap-1 font-mono truncate">
                            <Phone className="w-3 h-3" />
                            {biz.phone}
                          </span>
                        )}
                      </div>

                      {isLeadSaved ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[#19C37D] shrink-0">
                          <Check className="w-3 h-3" />
                          Lead salvo
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => void handleQuickSaveLead(e, biz)}
                          disabled={savingPlaceId === biz.placeId}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#0B0D12] border border-[#252B36] text-[11px] font-medium text-[#F5F7FA] hover:border-[#19C37D] transition-colors shrink-0"
                        >
                          {savingPlaceId === biz.placeId ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <UserPlus className="w-3 h-3 text-[#19C37D]" />
                          )}
                          Salvar lead
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Interactive Google Map */}
        <div className="xl:col-span-7">
          {mapsConfigured ? (
            <ProspectMap
              items={results as MapBusinessItem[]}
              center={mapCenter}
              selectedPlaceId={selectedPlaceId}
              onSelectBusiness={(item) => onSelectBusiness(item)}
              heightClass="h-[560px]"
            />
          ) : (
            <div className="h-[560px] bg-[#141821] border border-[#252B36] rounded-2xl flex flex-col items-center justify-center p-6 text-center space-y-2">
              <MapPin className="w-6 h-6 text-[#929BAA]" />
              <div className="text-sm font-medium text-[#F5F7FA]">
                Mapa interativo aguardando chave do Google Maps
              </div>
              <p className="text-xs text-[#929BAA] max-w-md">
                Configure a variável GOOGLE_MAPS_API_KEY / VITE_GOOGLE_MAPS_API_KEY no ambiente para visualizar os marcadores no mapa.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
