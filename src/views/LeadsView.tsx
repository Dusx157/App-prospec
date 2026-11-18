import React, { useMemo, useState } from 'react';
import { CheckCheck, ExternalLink, Globe, MessageCircle, Search, Star } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import {
  buildWhatsappUrl,
  computeGbpSummary,
  formatAppError,
  formatDateBR,
  getOpportunityMeta,
  renderWhatsappTemplate,
  todayISODate,
} from '../lib/opportunity';
import { PIPELINE_COLUMNS, type Lead, type PipelineStage } from '../types';

interface LeadsViewProps {
  onSelectLead: (lead: Lead) => void;
  onGoToRadar: () => void;
}

export function LeadsView({ onSelectLead, onGoToRadar }: LeadsViewProps) {
  const { profile } = useAuth();
  const { businesses, leads, interactions, updateLeadStage, logInteraction } = useData();
  const { showToast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [oppFilter, setOppFilter] = useState<string>('all');
  const [cityFilter, setCityFilter] = useState<string>('all');

  const cities = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => {
      if (l.city) set.add(l.city);
    });
    return Array.from(set).sort();
  }, [leads]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return leads.filter((l) => {
      if (stageFilter !== 'all' && l.stage !== stageFilter) return false;
      if (oppFilter !== 'all' && l.opportunityLevel !== oppFilter) return false;
      if (cityFilter !== 'all' && l.city !== cityFilter) return false;
      if (
        q &&
        !l.businessName.toLowerCase().includes(q) &&
        !l.category.toLowerCase().includes(q) &&
        !l.city.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [leads, searchTerm, stageFilter, oppFilter, cityFilter]);

  const waByLeadId = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of interactions) {
      if (item.type === 'whatsapp' && !map.has(item.leadId)) {
        map.set(item.leadId, item.contactDate);
      }
    }
    return map;
  }, [interactions]);

  const handleStageChange = async (
    e: React.ChangeEvent<HTMLSelectElement>,
    lead: Lead
  ) => {
    e.stopPropagation();
    const newStage = e.target.value as PipelineStage;
    try {
      await updateLeadStage(lead.id, newStage);
      showToast(`Etapa de "${lead.businessName}" atualizada.`);
    } catch (err) {
      showToast(formatAppError(err, 'Erro ao atualizar etapa.'), 'error');
    }
  };

  const handleQuickWhatsappSent = async (lead: Lead, message: string) => {
    try {
      const shouldAdvance = lead.stage === 'novo_lead' || lead.stage === 'nao_contatado';
      await logInteraction({
        leadId: lead.id,
        businessName: lead.businessName,
        type: 'whatsapp',
        summary: `WhatsApp enviado: ${message.slice(0, 140)}`,
        contactDate: todayISODate(),
        nextStage: shouldAdvance ? 'primeiro_contato' : undefined,
      });
      showToast(`WhatsApp registrado para "${lead.businessName}".`);
    } catch (err) {
      showToast(formatAppError(err, 'Erro ao registrar envio no WhatsApp.'), 'error');
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-[#929BAA] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar por empresa, categoria ou cidade..."
            className="w-full h-10 pl-9 pr-3.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] placeholder:text-[#929BAA]/60 focus:outline-none focus:border-[#19C37D] transition-colors"
          />
        </div>

        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D] transition-colors"
        >
          <option value="all">Todas as etapas</option>
          {PIPELINE_COLUMNS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>

        <select
          value={oppFilter}
          onChange={(e) => setOppFilter(e.target.value)}
          className="h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D] transition-colors"
        >
          <option value="all">Todas oportunidades</option>
          <option value="alta">Alta oportunidade</option>
          <option value="media">Média oportunidade</option>
          <option value="baixa">Baixa oportunidade</option>
        </select>

        <select
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D] transition-colors"
        >
          <option value="all">Todas as cidades</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-[#141821] border border-[#252B36] rounded-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="text-sm font-semibold text-[#F5F7FA]">
              {leads.length === 0
                ? 'Nenhum lead cadastrado ainda'
                : 'Nenhum lead corresponde aos filtros aplicados'}
            </div>
            <p className="text-xs text-[#929BAA] max-w-md mx-auto">
              {leads.length === 0
                ? 'Use o Radar de empresas para buscar negócios e salvá-los no seu funil comercial.'
                : 'Tente limpar a busca ou ajustar os filtros acima.'}
            </p>
            {leads.length === 0 && (
              <button
                type="button"
                onClick={onGoToRadar}
                className="px-4 py-2 rounded-xl bg-[#19C37D] text-[#0B0D12] text-xs font-semibold hover:bg-[#16AE6F] active:scale-[0.98] transition-all whitespace-nowrap shrink-0"
              >
                Prospectar no Radar
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#252B36] text-[11px] font-medium text-[#929BAA]">
                  <th className="py-3.5 px-4">Estabelecimento</th>
                  <th className="py-3.5 px-4">Site & GBP</th>
                  <th className="py-3.5 px-4">Google</th>
                  <th className="py-3.5 px-4">Oportunidade</th>
                  <th className="py-3.5 px-4">Etapa & WhatsApp</th>
                  <th className="py-3.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#252B36] text-xs">
                {filtered.map((lead) => {
                  const opp = getOpportunityMeta(lead.opportunityLevel);
                  const linkedBiz = businesses.find((b) => b.placeId === lead.placeId);
                  const gbp = computeGbpSummary({
                    ...(linkedBiz || {}),
                    websiteUri: lead.websiteUri,
                    phone: lead.phone,
                    rating: lead.rating,
                    userRatingCount: lead.userRatingCount,
                  });
                  const waSentDate = waByLeadId.get(lead.id);
                  const waText = renderWhatsappTemplate(profile?.whatsappTemplate || '', {
                    empresa: lead.businessName,
                    cidade: lead.city,
                    nota: lead.rating,
                    avaliacoes: lead.userRatingCount,
                    hasWebsite: Boolean(lead.websiteUri),
                  });
                  const waUrl = buildWhatsappUrl(lead.whatsapp || lead.phone, waText);
                  return (
                    <tr
                      key={lead.id}
                      onClick={() => onSelectLead(lead)}
                      className="hover:bg-[#181D28]/80 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-[#F5F7FA]">{lead.businessName}</div>
                        <div className="text-[11px] text-[#929BAA]">
                          {lead.category} · {lead.city || '—'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className={`inline-flex items-center gap-1 text-[11px] font-medium ${gbp.hasWebsite ? 'text-[#19C37D]' : 'text-amber-400'}`}>
                          <Globe className="w-3 h-3" />
                          {gbp.hasWebsite ? 'Possui site' : 'Sem site'}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-[#929BAA]">
                          GBP {gbp.gbpScore}/100
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-[#F5F7FA] whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                          {lead.rating > 0 ? lead.rating.toFixed(1) : '—'}
                          <span className="text-[#929BAA]">({lead.userRatingCount})</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums whitespace-nowrap">
                        <span className={`font-semibold ${opp.textColor}`}>
                          {lead.opportunityScore}/100
                        </span>
                        <span className="text-[#929BAA] ml-1.5 text-[11px] font-sans">
                          · {opp.shortLabel}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={lead.stage}
                          onChange={(e) => void handleStageChange(e, lead)}
                          className="h-8 px-2.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-[11px] text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
                        >
                          {PIPELINE_COLUMNS.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                        {waSentDate && (
                          <div className="flex items-center gap-1 text-[10px] text-[#19C37D] font-medium whitespace-nowrap">
                            <CheckCheck className="w-3 h-3" />
                            WhatsApp enviado ({formatDateBR(waSentDate)})
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-2">
                          {waUrl && (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => void handleQuickWhatsappSent(lead, waText)}
                              title={waSentDate ? 'WhatsApp já enviado (enviar novamente)' : 'Enviar no WhatsApp e registrar'}
                              className={`p-2 rounded-xl border transition-all active:scale-[0.98] ${
                                waSentDate
                                  ? 'bg-[#19C37D]/15 border-[#19C37D] text-[#19C37D]'
                                  : 'bg-[#0B0D12] border-[#252B36] text-[#19C37D] hover:border-[#19C37D]'
                              }`}
                            >
                              {waSentDate ? (
                                <CheckCheck className="w-3.5 h-3.5" />
                              ) : (
                                <MessageCircle className="w-3.5 h-3.5" />
                              )}
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => onSelectLead(lead)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-[11px] font-medium text-[#F5F7FA] hover:border-[#19C37D] active:scale-[0.98] transition-all whitespace-nowrap shrink-0"
                          >
                            Ficha
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
