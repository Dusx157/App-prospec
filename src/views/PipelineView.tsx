import React, { useMemo, useState } from 'react';
import {
  Bell,
  Check,
  CheckCheck,
  DollarSign,
  Globe,
  GripVertical,
  MessageCircle,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
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
import {
  PIPELINE_COLUMNS,
  type Lead,
  type OpportunityLevel,
  type PipelineStage,
} from '../types';

interface PipelineViewProps {
  onSelectLead: (lead: Lead) => void;
  onOpenSaleForLead: (lead: Lead) => void;
  onGoToRadar: () => void;
}

export function PipelineView({
  onSelectLead,
  onOpenSaleForLead,
  onGoToRadar,
}: PipelineViewProps) {
  const { profile } = useAuth();
  const {
    businesses,
    leads,
    interactions,
    reminders,
    updateLeadStage,
    logInteraction,
    toggleReminder,
    deleteReminder,
  } = useData();
  const { showToast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [oppFilter, setOppFilter] = useState<'all' | OpportunityLevel>('all');
  const [showReminders, setShowReminders] = useState(false);

  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<PipelineStage | null>(null);

  const categories = useMemo(() => {
    const s = new Set<string>();
    leads.forEach((l) => l.category && s.add(l.category));
    return Array.from(s).sort();
  }, [leads]);

  const cities = useMemo(() => {
    const s = new Set<string>();
    leads.forEach((l) => l.city && s.add(l.city));
    return Array.from(s).sort();
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return leads.filter((l) => {
      if (categoryFilter !== 'all' && l.category !== categoryFilter) return false;
      if (cityFilter !== 'all' && l.city !== cityFilter) return false;
      if (oppFilter !== 'all' && l.opportunityLevel !== oppFilter) return false;
      if (
        q &&
        !l.businessName.toLowerCase().includes(q) &&
        !l.city.toLowerCase().includes(q) &&
        !l.category.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [leads, searchTerm, categoryFilter, cityFilter, oppFilter]);

  const waByLeadId = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of interactions) {
      if (item.type === 'whatsapp' && !map.has(item.leadId)) {
        map.set(item.leadId, item.contactDate);
      }
    }
    return map;
  }, [interactions]);

  const pendingReminders = useMemo(() => {
    return reminders
      .filter((r) => !r.completed)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [reminders]);

  const today = todayISODate();

  const handleMoveStage = async (lead: Lead, newStage: PipelineStage) => {
    if (lead.stage === newStage) return;
    try {
      await updateLeadStage(lead.id, newStage);
      showToast(`"${lead.businessName}" movido para ${PIPELINE_COLUMNS.find((c) => c.id === newStage)?.label}.`);
      if (newStage === 'venda_concluida' && !lead.convertedSaleId) {
        onOpenSaleForLead({ ...lead, stage: newStage });
      }
    } catch (err) {
      showToast(formatAppError(err, 'Erro ao mover lead.'), 'error');
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
      showToast(`Envio no WhatsApp registrado para "${lead.businessName}".`);
    } catch (err) {
      showToast(formatAppError(err, 'Erro ao registrar envio no WhatsApp.'), 'error');
    }
  };

  const handleDrop = async (targetStage: PipelineStage) => {
    setDragOverStage(null);
    if (!draggedLeadId) return;
    const lead = leads.find((l) => l.id === draggedLeadId);
    setDraggedLeadId(null);
    if (lead) {
      await handleMoveStage(lead, targetStage);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar & Filters */}
      <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-[#929BAA] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar leads no funil..."
            className="w-full h-9 pl-8 pr-3 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D] transition-colors"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-9 px-3 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
        >
          <option value="all">Todas categorias</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="h-9 px-3 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
        >
          <option value="all">Todas cidades</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={oppFilter}
          onChange={(e) => setOppFilter(e.target.value as 'all' | OpportunityLevel)}
          className="h-9 px-3 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
        >
          <option value="all">Todas oportunidades</option>
          <option value="alta">Alta</option>
          <option value="media">Média</option>
          <option value="baixa">Baixa</option>
        </select>

        <button
          type="button"
          onClick={() => setShowReminders((prev) => !prev)}
          className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-xl border text-xs font-medium transition-all whitespace-nowrap shrink-0 active:scale-[0.98] ${
            showReminders
              ? 'bg-[#19C37D]/12 border-[#19C37D] text-[#19C37D]'
              : 'bg-[#0B0D12] border-[#252B36] text-[#F5F7FA] hover:border-[#19C37D]/60'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          Lembretes ({pendingReminders.length})
        </button>
      </div>

      {/* Reminders Drawer Panel */}
      {showReminders && (
        <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[#F5F7FA]">
              Lembretes de follow-up pendentes
            </h3>
            <span className="text-[11px] text-[#929BAA] font-mono tabular-nums">
              {pendingReminders.length} aberto(s)
            </span>
          </div>
          {pendingReminders.length === 0 ? (
            <p className="text-xs text-[#929BAA]">
              Nenhum lembrete pendente. Abra a ficha de qualquer lead para agendar retornos.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {pendingReminders.map((rem) => {
                const overdue = rem.dueDate < today;
                const lead = leads.find((l) => l.id === rem.leadId);
                return (
                  <div
                    key={rem.id}
                    className="bg-[#0B0D12] border border-[#252B36] rounded-xl p-3 flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0 space-y-1">
                      <button
                        type="button"
                        onClick={() => lead && onSelectLead(lead)}
                        className="text-xs font-medium text-[#F5F7FA] hover:text-[#19C37D] truncate block text-left"
                      >
                        {rem.businessName}
                      </button>
                      <div className="text-[11px] text-[#929BAA] truncate">{rem.title}</div>
                      <div
                        className={`text-[11px] font-mono tabular-nums ${
                          overdue ? 'text-rose-400' : 'text-[#929BAA]'
                        }`}
                      >
                        {formatDateBR(rem.dueDate)} {overdue ? '· Atrasado' : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => void toggleReminder(rem.id, true)}
                        title="Concluir"
                        className="p-1.5 rounded-lg text-[#19C37D] hover:bg-[#141821]"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteReminder(rem.id)}
                        title="Excluir"
                        className="p-1.5 rounded-lg text-[#929BAA] hover:text-rose-400 hover:bg-[#141821]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Empty State or Kanban Board */}
      {leads.length === 0 ? (
        <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-12 text-center space-y-3">
          <div className="text-sm font-semibold text-[#F5F7FA]">
            Seu pipeline de vendas ainda está vazio
          </div>
          <p className="text-xs text-[#929BAA] max-w-md mx-auto">
            Busque estabelecimentos no Radar de empresas e salve-os como leads para gerenciar suas negociações no Kanban.
          </p>
          <button
            type="button"
            onClick={onGoToRadar}
            className="px-4 py-2 rounded-xl bg-[#19C37D] text-[#0B0D12] text-xs font-semibold hover:bg-[#16AE6F] transition-all active:scale-[0.98]"
          >
            Abrir Radar de empresas
          </button>
        </div>
      ) : (
        <div className="flex gap-3.5 overflow-x-auto pb-4">
          {PIPELINE_COLUMNS.map((col) => {
            const colLeads = filteredLeads.filter((l) => l.stage === col.id);
            const isOver = dragOverStage === col.id;
            return (
              <div
                key={col.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverStage !== col.id) setDragOverStage(col.id);
                }}
                onDragLeave={() => setDragOverStage(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  void handleDrop(col.id);
                }}
                className={`w-76 shrink-0 bg-[#141821] border rounded-2xl flex flex-col max-h-[calc(100vh-230px)] transition-colors ${
                  isOver ? 'border-[#19C37D]' : 'border-[#252B36]'
                }`}
              >
                {/* Column Header */}
                <div className="px-4 py-3.5 border-b border-[#252B36] flex items-center justify-between gap-2 shrink-0">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#F5F7FA] truncate">
                      {col.label}
                    </div>
                    <div className="text-[11px] text-[#929BAA] truncate">
                      {col.description}
                    </div>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-[#929BAA] shrink-0">
                    {colLeads.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="p-3 space-y-2.5 overflow-y-auto flex-1">
                  {colLeads.length === 0 ? (
                    <div className="py-10 text-center text-[11px] text-[#929BAA]/60">
                      Arraste um lead para cá
                    </div>
                  ) : (
                    colLeads.map((lead) => {
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
                        hasWebsite: gbp.hasWebsite,
                      });
                      const waUrl = buildWhatsappUrl(lead.whatsapp || lead.phone, waText);

                      return (
                        <div
                          key={lead.id}
                          draggable
                          onDragStart={() => setDraggedLeadId(lead.id)}
                          onDragEnd={() => {
                            setDraggedLeadId(null);
                            setDragOverStage(null);
                          }}
                          onClick={() => onSelectLead(lead)}
                          className="bg-[#0B0D12] border border-[#252B36] hover:border-[#19C37D]/70 rounded-xl p-3.5 space-y-2.5 cursor-pointer transition-all"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-[#F5F7FA] truncate">
                                {lead.businessName}
                              </div>
                              <div className="text-[11px] text-[#929BAA] truncate mt-0.5">
                                {lead.category} · {lead.city || 'Sem cidade'}
                              </div>
                            </div>
                            <GripVertical className="w-3.5 h-3.5 text-[#929BAA]/50 shrink-0 cursor-grab" />
                          </div>

                          <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                            <span className="inline-flex items-center gap-1 text-[#F5F7FA]">
                              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                              {lead.rating > 0 ? lead.rating.toFixed(1) : '—'}
                              <span className="text-[#929BAA]">({lead.userRatingCount})</span>
                            </span>
                            <span className={`font-semibold ${opp.textColor}`}>
                              {lead.opportunityScore}/100
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
                            <span
                              className={`inline-flex items-center gap-1 font-medium ${
                                gbp.hasWebsite ? 'text-[#19C37D]' : 'text-amber-400'
                              }`}
                            >
                              <Globe className="w-3 h-3" />
                              {gbp.hasWebsite ? 'Possui site' : 'Sem site'}
                            </span>
                            <span aria-hidden="true" className="text-[#929BAA]">·</span>
                            <span className="text-[#929BAA] font-mono tabular-nums">
                              GBP {gbp.gbpScore}/100
                            </span>
                            {waSentDate && (
                              <>
                                <span aria-hidden="true" className="text-[#929BAA]">·</span>
                                <span className="inline-flex items-center gap-1 text-[#19C37D] font-medium">
                                  <CheckCheck className="w-3 h-3" />
                                  WA enviado
                                </span>
                              </>
                            )}
                          </div>

                          {lead.nextFollowUpAt && (
                            <div className="text-[11px] text-[#929BAA] font-mono tabular-nums">
                              Retorno: {formatDateBR(lead.nextFollowUpAt)}
                            </div>
                          )}

                          <div
                            className="pt-2.5 border-t border-[#252B36] flex items-center justify-between gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <select
                              value={lead.stage}
                              onChange={(e) =>
                                void handleMoveStage(lead, e.target.value as PipelineStage)
                              }
                              className="h-7 px-2 rounded-lg bg-[#141821] border border-[#252B36] text-[10px] text-[#929BAA] focus:text-[#F5F7FA] focus:outline-none max-w-[136px]"
                            >
                              {PIPELINE_COLUMNS.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.label}
                                </option>
                              ))}
                            </select>

                            <div className="flex items-center gap-1">
                              {waUrl && (
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() => void handleQuickWhatsappSent(lead, waText)}
                                  title={
                                    waSentDate
                                      ? `WhatsApp enviado em ${formatDateBR(waSentDate)} (enviar novamente)`
                                      : 'Enviar no WhatsApp e registrar'
                                  }
                                  className={`p-1.5 rounded-lg border transition-colors ${
                                    waSentDate
                                      ? 'bg-[#19C37D]/15 border-[#19C37D]/50 text-[#19C37D]'
                                      : 'bg-[#141821] border-[#252B36] text-[#19C37D] hover:border-[#19C37D]'
                                  }`}
                                >
                                  {waSentDate ? (
                                    <CheckCheck className="w-3.5 h-3.5" />
                                  ) : (
                                    <MessageCircle className="w-3.5 h-3.5" />
                                  )}
                                </a>
                              )}
                              {!lead.convertedSaleId && (
                                <button
                                  type="button"
                                  onClick={() => onOpenSaleForLead(lead)}
                                  title="Registrar venda"
                                  className="p-1.5 rounded-lg border border-[#252B36] bg-[#141821] text-[#929BAA] hover:text-[#19C37D] hover:border-[#19C37D] transition-colors"
                                >
                                  <DollarSign className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
