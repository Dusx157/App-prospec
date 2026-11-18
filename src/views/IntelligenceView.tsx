import React, { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  CheckCheck,
  ExternalLink,
  Globe,
  Loader2,
  MessageCircle,
  Sparkles,
  Star,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import {
  buildWhatsappUrl,
  computeGbpSummary,
  formatAppError,
  getOpportunityMeta,
  renderWhatsappTemplate,
} from '../lib/opportunity';
import type { Business, OpportunityLevel } from '../types';

interface IntelligenceViewProps {
  onSelectBusiness: (biz: Business) => void;
  onGoToRadar: () => void;
}

type SortKey =
  | 'score_desc'
  | 'rating_asc'
  | 'reviews_asc'
  | 'reviews_desc'
  | 'recent'
  | 'contact';

export function IntelligenceView({
  onSelectBusiness,
  onGoToRadar,
}: IntelligenceViewProps) {
  const { profile } = useAuth();
  const {
    businesses,
    leads,
    interactions,
    saveLeadFromBusiness,
    generateGeminiAnalysis,
    recordWhatsappSent,
  } = useData();
  const { showToast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | OpportunityLevel>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SortKey>('score_desc');
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const leadPlaceIds = useMemo(() => new Set(leads.map((l) => l.placeId)), [leads]);
  const waSentPlaceIds = useMemo(() => {
    const waLeadIds = new Set(interactions.filter((i) => i.type === 'whatsapp').map((i) => i.leadId));
    return new Set(leads.filter((l) => waLeadIds.has(l.id)).map((l) => l.placeId));
  }, [leads, interactions]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    businesses.forEach((b) => {
      if (b.category) set.add(b.category);
    });
    return Array.from(set).sort();
  }, [businesses]);

  const contactRank = (b: Business): number => {
    let score = 0;
    if (b.whatsapp || b.phone) score += 3;
    if (b.email) score += 2;
    if (b.instagram) score += 2;
    if (b.websiteUri) score += 1;
    return score;
  };

  const sortedBusinesses = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = businesses.filter((b) => {
      if (levelFilter !== 'all' && b.opportunityLevel !== levelFilter) return false;
      if (categoryFilter !== 'all' && b.category !== categoryFilter) return false;
      if (
        q &&
        !b.name.toLowerCase().includes(q) &&
        !b.city.toLowerCase().includes(q) &&
        !b.category.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'score_desc':
          return b.opportunityScore - a.opportunityScore;
        case 'rating_asc':
          return (a.rating || 5) - (b.rating || 5);
        case 'reviews_asc':
          return a.userRatingCount - b.userRatingCount;
        case 'reviews_desc':
          return b.userRatingCount - a.userRatingCount;
        case 'contact':
          return contactRank(b) - contactRank(a) || b.opportunityScore - a.opportunityScore;
        case 'recent': {
          const am = a.lastUpdatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
          const bm = b.lastUpdatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
          return bm - am;
        }
        default:
          return 0;
      }
    });
  }, [businesses, searchTerm, levelFilter, categoryFilter, sortBy]);

  const summaryCounts = useMemo(() => {
    const alta = businesses.filter((b) => b.opportunityLevel === 'alta').length;
    const media = businesses.filter((b) => b.opportunityLevel === 'media').length;
    const baixa = businesses.filter((b) => b.opportunityLevel === 'baixa').length;
    return { alta, media, baixa };
  }, [businesses]);

  const handleAnalyze = async (e: React.MouseEvent, biz: Business) => {
    e.stopPropagation();
    setAnalyzingId(biz.id);
    try {
      await generateGeminiAnalysis(biz);
      showToast(`Análise comercial gerada para ${biz.name}.`);
    } catch (err) {
      showToast(formatAppError(err, 'Falha ao gerar análise.'), 'error');
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleSaveLead = async (e: React.MouseEvent, biz: Business) => {
    e.stopPropagation();
    setSavingId(biz.id);
    try {
      await saveLeadFromBusiness(biz);
      showToast(`Lead "${biz.name}" salvo no pipeline.`);
    } catch (err) {
      showToast(formatAppError(err, 'Erro ao salvar lead.'), 'error');
    } finally {
      setSavingId(null);
    }
  };

  const handleWhatsappClick = async (biz: Business, waMessage: string) => {
    try {
      await recordWhatsappSent({
        biz,
        summary: `WhatsApp enviado: ${waMessage.slice(0, 140)}`,
      });
      showToast(`Envio registrado no CRM para "${biz.name}".`);
    } catch (err) {
      showToast(formatAppError(err, 'Erro ao registrar envio no WhatsApp.'), 'error');
    }
  };

  return (
    <div className="space-y-5">
      {/* Classification Summary Strip */}
      <div className="bg-[#141821] border border-[#252B36] rounded-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-[#252B36] overflow-hidden">
        <div className="p-4 space-y-1">
          <div className="text-[11px] font-medium text-[#929BAA]">Total analisado</div>
          <div className="text-xl font-semibold font-mono tabular-nums text-[#F5F7FA]">
            {businesses.length}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setLevelFilter(levelFilter === 'alta' ? 'all' : 'alta')}
          className={`text-left p-4 space-y-1 transition-colors ${
            levelFilter === 'alta' ? 'bg-[#19C37D]/10' : 'hover:bg-[#181D28]/70'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] font-medium text-[#929BAA]">
            <span>Alta oportunidade (70–100)</span>
            {levelFilter === 'alta' && <span className="text-[#19C37D]">Ativo</span>}
          </div>
          <div className="text-xl font-semibold font-mono tabular-nums text-[#19C37D]">
            {summaryCounts.alta}
          </div>
        </button>
        <button
          type="button"
          onClick={() => setLevelFilter(levelFilter === 'media' ? 'all' : 'media')}
          className={`text-left p-4 space-y-1 transition-colors ${
            levelFilter === 'media' ? 'bg-amber-400/10' : 'hover:bg-[#181D28]/70'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] font-medium text-[#929BAA]">
            <span>Média oportunidade (40–69)</span>
            {levelFilter === 'media' && <span className="text-amber-400">Ativo</span>}
          </div>
          <div className="text-xl font-semibold font-mono tabular-nums text-amber-400">
            {summaryCounts.media}
          </div>
        </button>
        <button
          type="button"
          onClick={() => setLevelFilter(levelFilter === 'baixa' ? 'all' : 'baixa')}
          className={`text-left p-4 space-y-1 transition-colors ${
            levelFilter === 'baixa' ? 'bg-[#252B36]/40' : 'hover:bg-[#181D28]/70'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] font-medium text-[#929BAA]">
            <span>Baixa oportunidade (0–39)</span>
            {levelFilter === 'baixa' && <span className="text-[#F5F7FA]">Ativo</span>}
          </div>
          <div className="text-xl font-semibold font-mono tabular-nums text-[#929BAA]">
            {summaryCounts.baixa}
          </div>
        </button>
      </div>

      {/* Filter & Sort Toolbar */}
      <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar por empresa, cidade ou categoria..."
          className="flex-1 min-w-[200px] h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] placeholder:text-[#929BAA]/60 focus:outline-none focus:border-[#19C37D] transition-colors"
        />

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
        >
          <option value="all">Todas as categorias</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value as 'all' | OpportunityLevel)}
          className="h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
        >
          <option value="all">Todos os níveis</option>
          <option value="alta">Alta oportunidade</option>
          <option value="media">Média oportunidade</option>
          <option value="baixa">Baixa oportunidade</option>
        </select>

        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-3.5 h-3.5 text-[#929BAA] shrink-0" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
          >
            <option value="score_desc">Maior oportunidade</option>
            <option value="rating_asc">Menor nota</option>
            <option value="reviews_asc">Menor quantidade de avaliações</option>
            <option value="reviews_desc">Maior quantidade de avaliações</option>
            <option value="recent">Mais recentes</option>
            <option value="contact">Melhor disponibilidade de contato</option>
          </select>
        </div>
      </div>

      {/* Cards Grid */}
      {sortedBusinesses.length === 0 ? (
        <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-12 text-center space-y-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
          <div className="text-sm font-semibold text-[#F5F7FA]">
            {businesses.length === 0
              ? 'Nenhum estabelecimento analisado ainda'
              : 'Nenhum resultado para os filtros selecionados'}
          </div>
          <p className="text-xs text-[#929BAA] max-w-md mx-auto">
            {businesses.length === 0
              ? 'Realize uma busca no Radar de empresas para calcular a pontuação de oportunidade comercial.'
              : 'Ajuste os filtros de nível, categoria ou busca.'}
          </p>
          {businesses.length === 0 && (
            <button
              type="button"
              onClick={onGoToRadar}
              className="px-4 py-2 rounded-xl bg-[#19C37D] text-[#0B0D12] text-xs font-semibold hover:bg-[#16AE6F] active:scale-[0.98] transition-all whitespace-nowrap shrink-0"
            >
              Ir para Radar de empresas
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {sortedBusinesses.map((biz) => {
            const opp = getOpportunityMeta(biz.opportunityLevel);
            const gbp = computeGbpSummary(biz);
            const isLead = leadPlaceIds.has(biz.placeId);
            const isWaSent = waSentPlaceIds.has(biz.placeId);
            const waText = renderWhatsappTemplate(profile?.whatsappTemplate || '', {
              empresa: biz.name,
              cidade: biz.city,
              nota: biz.rating,
              avaliacoes: biz.userRatingCount,
              hasWebsite: biz.hasWebsite,
            });
            const waUrl = buildWhatsappUrl(biz.whatsapp || biz.phone, waText);

            return (
              <div
                key={biz.id}
                onClick={() => onSelectBusiness(biz)}
                className="bg-[#141821] border border-[#252B36] hover:border-[#19C37D]/60 rounded-2xl p-5 space-y-4 transition-all cursor-pointer flex flex-col justify-between shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]"
              >
                <div className="space-y-3">
                  {/* Top Row */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <h3 className="text-sm font-semibold text-[#F5F7FA] truncate">
                        {biz.name}
                      </h3>
                      <div className="text-xs text-[#929BAA] flex flex-wrap items-center gap-1.5">
                        <span>{biz.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>{biz.city || 'Sem cidade'}</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums text-[#F5F7FA]">
                          <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                          {biz.rating > 0 ? biz.rating.toFixed(1) : '—'} ({biz.userRatingCount})
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className={`text-base font-semibold font-mono tabular-nums ${opp.textColor}`}>
                        {biz.opportunityScore}/100
                      </div>
                      <div className={`text-[11px] font-medium ${opp.textColor}`}>
                        {opp.label}
                      </div>
                    </div>
                  </div>

                  {/* Score Bar */}
                  <div className="h-1.5 w-full bg-[#0B0D12] rounded-full overflow-hidden">
                    <div
                      className={`h-full ${opp.barColor}`}
                      style={{ width: `${biz.opportunityScore}%` }}
                    />
                  </div>

                  {/* Contact & GBP signals */}
                  <div className="text-[11px] flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={`inline-flex items-center gap-1 font-medium ${gbp.hasWebsite ? 'text-[#19C37D]' : 'text-amber-400'}`}>
                      <Globe className="w-3 h-3" />
                      {gbp.hasWebsite ? 'Possui site' : 'Sem site (Oportunidade GMB)'}
                    </span>
                    <span aria-hidden="true" className="text-[#929BAA]">·</span>
                    <span className="text-[#929BAA] font-mono tabular-nums">
                      GBP {gbp.gbpScore}/100
                    </span>
                    <span aria-hidden="true" className="text-[#929BAA]">·</span>
                    <span className="text-[#929BAA]">
                      Tel: {biz.phone ? 'Sim' : 'Não encontrado'}
                    </span>
                    {isWaSent && (
                      <>
                        <span aria-hidden="true" className="text-[#929BAA]">·</span>
                        <span className="inline-flex items-center gap-1 text-[#19C37D] font-medium">
                          <CheckCheck className="w-3 h-3" />
                          WhatsApp enviado
                        </span>
                      </>
                    )}
                    {biz.instagram && (
                      <>
                        <span aria-hidden="true" className="text-[#929BAA]">·</span>
                        <span className="text-[#19C37D]">Instagram</span>
                      </>
                    )}
                  </div>

                  {/* Opportunity Reasons */}
                  {biz.opportunityReasons && biz.opportunityReasons.length > 0 && (
                    <ul className="space-y-1 pt-1">
                      {biz.opportunityReasons.slice(0, 4).map((reason, idx) => (
                        <li key={idx} className="text-xs text-[#929BAA] flex items-start gap-2">
                          <span className="text-[#19C37D] mt-0.5">•</span>
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Gemini AI Analysis */}
                  {biz.geminiAnalysis && (
                    <div className="bg-[#0B0D12] border border-[#252B36] rounded-xl p-3.5 space-y-1">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#19C37D]">
                        <Sparkles className="w-3 h-3" />
                        Análise comercial Gemini
                      </div>
                      <p className="text-xs text-[#F5F7FA]/90 leading-relaxed whitespace-pre-line">
                        {biz.geminiAnalysis}
                      </p>
                    </div>
                  )}
                </div>

                {/* Actions Footer */}
                <div
                  className="pt-3 border-t border-[#252B36] flex flex-wrap items-center justify-between gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => void handleAnalyze(e, biz)}
                      disabled={analyzingId === biz.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs font-medium text-[#F5F7FA] hover:border-[#19C37D] active:scale-[0.98] transition-all disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      {analyzingId === biz.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#19C37D]" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-[#19C37D]" />
                      )}
                      {biz.geminiAnalysis ? 'Atualizar análise' : 'Analisar com IA'}
                    </button>

                    {!isLead ? (
                      <button
                        type="button"
                        onClick={(e) => void handleSaveLead(e, biz)}
                        disabled={savingId === biz.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#19C37D] text-[#0B0D12] text-xs font-semibold hover:bg-[#16AE6F] active:scale-[0.98] transition-all disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        {savingId === biz.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <UserPlus className="w-3.5 h-3.5" />
                        )}
                        Salvar lead
                      </button>
                    ) : (
                      <span className="text-xs font-medium text-[#19C37D] px-2 whitespace-nowrap">
                        Salvo no pipeline
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {waUrl && (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => void handleWhatsappClick(biz, waText)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs transition-all active:scale-[0.98] whitespace-nowrap shrink-0 ${
                          isWaSent
                            ? 'bg-[#19C37D]/15 border-[#19C37D] text-[#19C37D] font-medium'
                            : 'bg-[#0B0D12] border-[#252B36] text-[#19C37D] hover:border-[#19C37D]'
                        }`}
                      >
                        {isWaSent ? (
                          <CheckCheck className="w-3.5 h-3.5" />
                        ) : (
                          <MessageCircle className="w-3.5 h-3.5" />
                        )}
                        {isWaSent ? 'Enviado' : 'WhatsApp'}
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => onSelectBusiness(biz)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] hover:border-[#19C37D] active:scale-[0.98] transition-all whitespace-nowrap shrink-0"
                    >
                      Ficha
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
