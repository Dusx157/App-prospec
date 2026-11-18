import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  Filter,
  Globe,
  Loader2,
  MessageCircle,
  Pause,
  Play,
  RefreshCw,
  Send,
  SkipForward,
  Sparkles,
  Square,
  Star,
  Zap,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData, type DiscoveredBusinessInput } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import {
  addDaysISODate,
  buildFollowupPresetMessage,
  buildWhatsappAppUrl,
  buildWhatsappPresetMessage,
  formatAppError,
  formatDateBR,
  formatWhatsappNumber,
  renderWhatsappTemplate,
  safeFetchJson,
  todayISODate,
} from '../lib/opportunity';
import type { Business, Lead, PipelineStage } from '../types';

interface OutreachViewProps {
  onSelectBusiness: (biz: DiscoveredBusinessInput | Business) => void;
  onGoToRadar: () => void;
}

type TargetAudience = 'primeiro_contato' | 'followup' | 'sem_site' | 'todos';
type PresetStyle = 'persuasivo' | 'gmb_site' | 'direto' | 'followup' | 'template';
type DispatchProtocol = 'web' | 'app';

interface QueueCandidate {
  placeId: string;
  name: string;
  category: string;
  city: string;
  phone: string;
  whatsappDigits: string;
  rating: number;
  userRatingCount: number;
  hasWebsite: boolean;
  websiteUri: string;
  opportunityScore: number;
  stage?: PipelineStage;
  lastContactAt: string;
  nextFollowUpAt: string;
  whatsappCount: number;
  businessPayload: DiscoveredBusinessInput | Business;
  lead?: Lead;
}

export function OutreachView({ onSelectBusiness, onGoToRadar }: OutreachViewProps) {
  const { profile } = useAuth();
  const {
    businesses,
    leads,
    interactions,
    recordWhatsappSent,
    createReminder,
  } = useData();
  const { showToast } = useToast();

  // Audience & filters
  const [audience, setAudience] = useState<TargetAudience>('primeiro_contato');
  const [cityFilter, setCityFilter] = useState<string>('todas');
  const [minScore, setMinScore] = useState<number>(0);
  const [hideContactedToday, setHideContactedToday] = useState<boolean>(true);

  // Cadence & message settings
  const [preset, setPreset] = useState<PresetStyle>('persuasivo');
  const [protocol, setProtocol] = useState<DispatchProtocol>('web');
  const [intervalSeconds, setIntervalSeconds] = useState<number>(10);
  const [followUpDays, setFollowUpDays] = useState<number>(3);

  // Queue state
  const [excludedIds, setExcludedIds] = useState<Record<string, boolean>>({});
  const [customMessages, setCustomMessages] = useState<Record<string, string>>({});
  const [aiCustomizedIds, setAiCustomizedIds] = useState<Record<string, boolean>>({});
  const [sessionSentIds, setSessionSentIds] = useState<Record<string, boolean>>({});
  const [activeIndex, setActiveIndex] = useState<number>(0);

  // AI batch generation
  const [generatingBatch, setGeneratingBatch] = useState(false);
  const [regeneratingOne, setRegeneratingOne] = useState(false);

  // Cooldown timer for assisted sends
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);
  const [sendingCurrent, setSendingCurrent] = useState(false);

  // Server webhook gateway status & background batch runner
  const [webhookConfigured, setWebhookConfigured] = useState(false);
  const [checkingGateway, setCheckingGateway] = useState(true);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoPaused, setAutoPaused] = useState(false);
  const [autoProgress, setAutoProgress] = useState<{ sent: number; failed: number; total: number }>({
    sent: 0,
    failed: 0,
    total: 0,
  });
  const [autoStatusMap, setAutoStatusMap] = useState<Record<string, 'sent' | 'error'>>({});

  const stopAutoRef = useRef(false);
  const pauseAutoRef = useRef(false);

  useEffect(() => {
    let active = true;
    safeFetchJson<{ webhookConfigured?: boolean }>('/api/whatsapp/status')
      .then(({ data }) => {
        if (active) setWebhookConfigured(Boolean(data?.webhookConfigured));
      })
      .catch(() => {
        if (active) setWebhookConfigured(false);
      })
      .finally(() => {
        if (active) setCheckingGateway(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = setInterval(() => {
      setCooldownRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  const today = todayISODate();

  // Map WhatsApp interactions per leadId
  const whatsappCountByLead = useMemo(() => {
    const map = new Map<string, number>();
    for (const inter of interactions) {
      if (inter.type === 'whatsapp') {
        map.set(inter.leadId, (map.get(inter.leadId) || 0) + 1);
      }
    }
    return map;
  }, [interactions]);

  // Unified catalog of prospects with valid WhatsApp numbers
  const allCandidates = useMemo<QueueCandidate[]>(() => {
    const bizByPlaceId = new Map<string, Business>();
    for (const b of businesses) {
      if (b.placeId) bizByPlaceId.set(b.placeId, b);
    }

    const leadByPlaceId = new Map<string, Lead>();
    for (const l of leads) {
      if (l.placeId) leadByPlaceId.set(l.placeId, l);
    }

    const placeIds = new Set<string>([
      ...Array.from(bizByPlaceId.keys()),
      ...Array.from(leadByPlaceId.keys()),
    ]);

    const list: QueueCandidate[] = [];
    for (const placeId of placeIds) {
      const biz = bizByPlaceId.get(placeId);
      const lead = leadByPlaceId.get(placeId);

      const rawPhone = biz?.whatsapp || biz?.phone || lead?.whatsapp || lead?.phone || '';
      const digits = formatWhatsappNumber(rawPhone);
      if (!digits || digits.length < 10) continue;

      const stage = lead?.stage;
      if (stage === 'venda_concluida' || stage === 'sem_interesse') continue;

      const websiteUri = biz?.websiteUri || lead?.websiteUri || '';
      const hasWebsite = Boolean(biz?.hasWebsite || websiteUri.trim());
      const name = biz?.name || lead?.businessName || 'Estabelecimento';
      const category = biz?.category || lead?.category || 'Comércio';
      const city = biz?.city || lead?.city || '';
      const rating = biz?.rating ?? lead?.rating ?? 0;
      const userRatingCount = biz?.userRatingCount ?? lead?.userRatingCount ?? 0;
      const opportunityScore = biz?.opportunityScore ?? lead?.opportunityScore ?? 0;

      const businessPayload: DiscoveredBusinessInput | Business =
        biz || {
          placeId,
          name,
          category,
          categoryKey: 'outros',
          address: lead?.address || '',
          city,
          state: '',
          neighborhood: '',
          postalCode: '',
          lat: 0,
          lng: 0,
          rating,
          userRatingCount,
          reviews: [],
          phone: lead?.phone || rawPhone,
          whatsapp: digits,
          websiteUri,
          googleMapsUri: lead?.googleMapsUri || '',
          instagram: lead?.instagram || '',
          email: lead?.email || '',
          hasWebsite,
          hasPhone: true,
          opportunityScore,
          opportunityLevel: lead?.opportunityLevel || 'media',
          opportunityReasons: [],
        };

      list.push({
        placeId,
        name,
        category,
        city,
        phone: biz?.phone || lead?.phone || rawPhone,
        whatsappDigits: digits,
        rating,
        userRatingCount,
        hasWebsite,
        websiteUri,
        opportunityScore,
        stage,
        lastContactAt: lead?.lastContactAt || '',
        nextFollowUpAt: lead?.nextFollowUpAt || '',
        whatsappCount: lead ? whatsappCountByLead.get(lead.id) || 0 : 0,
        businessPayload,
        lead,
      });
    }

    return list.sort((a, b) => b.opportunityScore - a.opportunityScore);
  }, [businesses, leads, whatsappCountByLead]);

  const availableCities = useMemo(() => {
    const set = new Set<string>();
    for (const c of allCandidates) {
      if (c.city.trim()) set.add(c.city.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [allCandidates]);

  // Filtered candidates matching selected audience & filters
  const filteredCandidates = useMemo(() => {
    return allCandidates.filter((c) => {
      if (cityFilter !== 'todas' && c.city.trim() !== cityFilter) return false;
      if (c.opportunityScore < minScore) return false;
      if (hideContactedToday && (c.lastContactAt === today || sessionSentIds[c.placeId])) {
        return false;
      }

      if (audience === 'primeiro_contato') {
        const neverContacted =
          !c.lead ||
          ((c.stage === 'novo_lead' || c.stage === 'nao_contatado') && c.whatsappCount === 0);
        return neverContacted;
      }
      if (audience === 'followup') {
        return Boolean(
          c.lead &&
            (c.stage === 'primeiro_contato' ||
              c.stage === 'interessado' ||
              c.stage === 'em_negociacao' ||
              c.whatsappCount > 0)
        );
      }
      if (audience === 'sem_site') {
        return !c.hasWebsite;
      }
      return true;
    });
  }, [allCandidates, audience, cityFilter, minScore, hideContactedToday, today, sessionSentIds]);

  // Active selected queue (those not excluded by checkbox)
  const activeQueue = useMemo(
    () => filteredCandidates.filter((c) => !excludedIds[c.placeId]),
    [filteredCandidates, excludedIds]
  );

  // Keep activeIndex in bounds
  useEffect(() => {
    if (activeQueue.length === 0) {
      setActiveIndex(0);
    } else if (activeIndex >= activeQueue.length) {
      setActiveIndex(0);
    }
  }, [activeQueue.length, activeIndex]);

  // Auto-switch preset when switching between primeiro_contato and followup
  const handleAudienceChange = (next: TargetAudience) => {
    setAudience(next);
    setActiveIndex(0);
    if (next === 'followup') setPreset('followup');
    else if (next === 'sem_site') setPreset('gmb_site');
    else if (preset === 'followup') setPreset('persuasivo');
  };

  const getMessageForCandidate = (c: QueueCandidate): string => {
    if (customMessages[c.placeId] !== undefined) {
      return customMessages[c.placeId];
    }
    if (preset === 'followup') {
      return buildFollowupPresetMessage({
        empresa: c.name,
        cidade: c.city,
        hasWebsite: c.hasWebsite,
      });
    }
    if (preset === 'template') {
      return renderWhatsappTemplate(profile?.whatsappTemplate || '', {
        empresa: c.name,
        cidade: c.city,
        nota: c.rating,
        avaliacoes: c.userRatingCount,
        hasWebsite: c.hasWebsite,
      });
    }
    return buildWhatsappPresetMessage(preset, {
      empresa: c.name,
      cidade: c.city,
      nota: c.rating,
      avaliacoes: c.userRatingCount,
      hasWebsite: c.hasWebsite,
    });
  };

  const currentCandidate = activeQueue[activeIndex] || null;
  const currentMessage = currentCandidate ? getMessageForCandidate(currentCandidate) : '';
  const currentWaUrl = currentCandidate
    ? buildWhatsappAppUrl(currentCandidate.whatsappDigits, currentMessage, protocol)
    : '';

  // Metrics strip
  const metrics = useMemo(() => {
    const readyFirstContact = allCandidates.filter(
      (c) => !c.lead || ((c.stage === 'novo_lead' || c.stage === 'nao_contatado') && c.whatsappCount === 0)
    ).length;
    const readyFollowUp = allCandidates.filter(
      (c) =>
        Boolean(c.lead) &&
        (c.stage === 'primeiro_contato' || c.stage === 'interessado' || c.stage === 'em_negociacao')
    ).length;
    const sentTodayCount = leads.filter((l) => l.lastContactAt === today).length;
    return {
      readyFirstContact,
      readyFollowUp,
      sentTodayCount,
      selectedInQueue: activeQueue.length,
    };
  }, [allCandidates, leads, today, activeQueue.length]);

  const handleGenerateBatchAI = async () => {
    const targetSlice = activeQueue.slice(0, 12);
    if (targetSlice.length === 0) {
      showToast('Selecione ao menos um estabelecimento na fila para personalizar.', 'error');
      return;
    }

    setGeneratingBatch(true);
    try {
      const { data } = await safeFetchJson<{
        messages: Array<{ placeId: string; message: string }>;
      }>(
        '/api/gemini/batch-messages',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: audience === 'followup' ? 'followup' : 'primeiro_contato',
            items: targetSlice.map((c) => ({
              placeId: c.placeId,
              name: c.name,
              category: c.category,
              city: c.city,
              rating: c.rating,
              userRatingCount: c.userRatingCount,
              hasWebsite: c.hasWebsite,
              opportunityScore: c.opportunityScore,
            })),
          }),
        },
        'Erro ao gerar mensagens personalizadas com IA.'
      );

      const nextCustom: Record<string, string> = { ...customMessages };
      const nextAiFlags: Record<string, boolean> = { ...aiCustomizedIds };
      let applied = 0;

      for (const item of data.messages || []) {
        if (item.placeId && item.message) {
          nextCustom[item.placeId] = item.message;
          nextAiFlags[item.placeId] = true;
          applied += 1;
        }
      }

      setCustomMessages(nextCustom);
      setAiCustomizedIds(nextAiFlags);
      showToast(`${applied} mensagens únicas geradas com IA para a fila!`, 'success');
    } catch (err) {
      showToast(formatAppError(err, 'Falha ao personalizar lote com IA.'), 'error');
    } finally {
      setGeneratingBatch(false);
    }
  };

  const handleRegenerateSingleAI = async (c: QueueCandidate) => {
    setRegeneratingOne(true);
    try {
      const { data } = await safeFetchJson<{
        messages: Array<{ placeId: string; message: string }>;
      }>(
        '/api/gemini/batch-messages',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: audience === 'followup' ? 'followup' : 'primeiro_contato',
            items: [
              {
                placeId: c.placeId,
                name: c.name,
                category: c.category,
                city: c.city,
                rating: c.rating,
                userRatingCount: c.userRatingCount,
                hasWebsite: c.hasWebsite,
                opportunityScore: c.opportunityScore,
              },
            ],
          }),
        },
        'Erro ao regenerar mensagem.'
      );

      const match = data.messages?.[0];
      if (match?.message) {
        setCustomMessages((prev) => ({ ...prev, [c.placeId]: match.message }));
        setAiCustomizedIds((prev) => ({ ...prev, [c.placeId]: true }));
        showToast('Nova abordagem gerada com IA.', 'success');
      }
    } catch (err) {
      showToast(formatAppError(err, 'Não foi possível gerar nova mensagem.'), 'error');
    } finally {
      setRegeneratingOne(false);
    }
  };

  const persistOutreachRecord = async (c: QueueCandidate, messageText: string) => {
    const nextFollowUpDate = followUpDays > 0 ? addDaysISODate(followUpDays) : undefined;
    const savedLead = await recordWhatsappSent({
      biz: c.businessPayload,
      summary: `Disparo automático (${audience === 'followup' ? 'Follow-up' : '1º contato'}): "${messageText.slice(0, 180)}${messageText.length > 180 ? '...' : ''}"`,
      nextFollowUpAt: nextFollowUpDate,
    });

    if (followUpDays > 0) {
      await createReminder({
        leadId: savedLead.id,
        businessName: savedLead.businessName,
        title: `Follow-up WhatsApp (${followUpDays}d) — ${savedLead.businessName}`,
        dueDate: nextFollowUpDate!,
      });
    }

    setSessionSentIds((prev) => ({ ...prev, [c.placeId]: true }));
  };

  const handleAssistedSendClick = async () => {
    if (!currentCandidate || sendingCurrent) return;
    const target = currentCandidate;
    const msgSnapshot = currentMessage;

    setSendingCurrent(true);
    try {
      await persistOutreachRecord(target, msgSnapshot);
      if (intervalSeconds > 0) {
        setCooldownRemaining(intervalSeconds);
      }
      // If hideContactedToday is enabled, target automatically leaves activeQueue so activeIndex stays valid;
      // otherwise manually advance to next item.
      if (!hideContactedToday) {
        setActiveIndex((prev) => (prev + 1 < activeQueue.length ? prev + 1 : 0));
      }
      showToast(
        followUpDays > 0
          ? `Envio registrado para ${target.name} e follow-up agendado em +${followUpDays}d.`
          : `Envio registrado para ${target.name}.`,
        'success'
      );
    } catch (err) {
      showToast(formatAppError(err, 'Erro ao registrar disparo no histórico.'), 'error');
    } finally {
      setSendingCurrent(false);
    }
  };

  const handleCopyMessage = async () => {
    if (!currentMessage) return;
    try {
      await navigator.clipboard.writeText(currentMessage);
      showToast('Mensagem copiada para a área de transferência.', 'success');
    } catch {
      showToast('Não foi possível copiar automaticamente.', 'error');
    }
  };

  const handleSkipCurrent = () => {
    if (activeQueue.length <= 1) return;
    setActiveIndex((prev) => (prev + 1) % activeQueue.length);
  };

  const handleRunBackgroundBatch = async () => {
    if (!webhookConfigured || activeQueue.length === 0 || autoRunning) return;

    const batchItems = [...activeQueue];
    stopAutoRef.current = false;
    pauseAutoRef.current = false;
    setAutoRunning(true);
    setAutoPaused(false);
    setAutoProgress({ sent: 0, failed: 0, total: batchItems.length });
    setAutoStatusMap({});

    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < batchItems.length; i++) {
      if (stopAutoRef.current) break;

      while (pauseAutoRef.current && !stopAutoRef.current) {
        await new Promise((r) => setTimeout(r, 350));
      }
      if (stopAutoRef.current) break;

      const item = batchItems[i];
      const msg = getMessageForCandidate(item);

      try {
        await safeFetchJson<{ ok: boolean }>(
          '/api/whatsapp/dispatch',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: item.whatsappDigits,
              message: msg,
              businessName: item.name,
              placeId: item.placeId,
            }),
          },
          'Falha no disparo via gateway.'
        );

        await persistOutreachRecord(item, msg);
        sentCount += 1;
        setAutoStatusMap((prev) => ({ ...prev, [item.placeId]: 'sent' }));
      } catch {
        failedCount += 1;
        setAutoStatusMap((prev) => ({ ...prev, [item.placeId]: 'error' }));
      }

      setAutoProgress({ sent: sentCount, failed: failedCount, total: batchItems.length });

      // Respect anti-ban cadence between messages
      if (i < batchItems.length - 1 && !stopAutoRef.current && intervalSeconds > 0) {
        for (let s = 0; s < intervalSeconds; s++) {
          if (stopAutoRef.current) break;
          while (pauseAutoRef.current && !stopAutoRef.current) {
            await new Promise((r) => setTimeout(r, 350));
          }
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }

    setAutoRunning(false);
    setAutoPaused(false);
    showToast(
      `Disparo concluído: ${sentCount} enviada(s)${failedCount > 0 ? `, ${failedCount} falha(s)` : ''}.`,
      sentCount > 0 ? 'success' : 'error'
    );
  };

  return (
    <div className="space-y-6">
      {/* Header & Summary Strip */}
      <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#19C37D]/15 border border-[#19C37D]/30 flex items-center justify-center shrink-0">
                <Send className="w-4 h-4 text-[#19C37D]" />
              </div>
              <h2 className="text-base font-semibold tracking-tight text-[#F5F7FA]">
                Disparos automáticos &amp; Cadência WhatsApp
              </h2>
            </div>
            <p className="text-xs text-[#929BAA] max-w-2xl leading-relaxed">
              Personalize abordagens únicas em lote com IA, respeite intervalos anti-bloqueio e registre cada contato e follow-up automaticamente no funil de vendas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleGenerateBatchAI()}
              disabled={generatingBatch || activeQueue.length === 0}
              className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl bg-[#19C37D] text-[#0B0D12] text-xs font-semibold hover:bg-[#16AE6F] transition-all active:scale-[0.98] disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {generatingBatch ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              Personalizar fila com IA ({Math.min(12, activeQueue.length)})
            </button>

            {webhookConfigured && !autoRunning && (
              <button
                type="button"
                onClick={() => void handleRunBackgroundBatch()}
                disabled={activeQueue.length === 0}
                className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl bg-[#181D28] border border-[#19C37D]/40 text-[#19C37D] text-xs font-semibold hover:bg-[#19C37D]/10 transition-all disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Zap className="w-3.5 h-3.5" />
                Disparar em 2º plano ({activeQueue.length})
              </button>
            )}
          </div>
        </div>

        {/* 4 Clean KPI Tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5 pt-5 border-t border-[#252B36]">
          <div className="bg-[#0B0D12]/60 border border-[#252B36] rounded-xl px-4 py-3">
            <div className="text-[11px] text-[#929BAA]">Prontos p/ 1º contato</div>
            <div className="text-lg font-semibold font-mono tabular-nums text-[#F5F7FA] mt-0.5">
              {metrics.readyFirstContact}
            </div>
          </div>
          <div className="bg-[#0B0D12]/60 border border-[#252B36] rounded-xl px-4 py-3">
            <div className="text-[11px] text-[#929BAA]">Em follow-up</div>
            <div className="text-lg font-semibold font-mono tabular-nums text-[#F5F7FA] mt-0.5">
              {metrics.readyFollowUp}
            </div>
          </div>
          <div className="bg-[#0B0D12]/60 border border-[#252B36] rounded-xl px-4 py-3">
            <div className="text-[11px] text-[#929BAA]">Enviados hoje</div>
            <div className="text-lg font-semibold font-mono tabular-nums text-[#19C37D] mt-0.5">
              {metrics.sentTodayCount}
            </div>
          </div>
          <div className="bg-[#0B0D12]/60 border border-[#252B36] rounded-xl px-4 py-3">
            <div className="text-[11px] text-[#929BAA]">Modo de envio</div>
            <div className="text-xs font-medium text-[#F5F7FA] mt-1.5 flex items-center gap-1.5">
              {checkingGateway ? (
                <span className="text-[#929BAA]">Verificando...</span>
              ) : webhookConfigured ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-[#19C37D]" />
                  <span>Piloto + Gateway 2º plano</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-[#19C37D]" />
                  <span>Piloto Assistido em Fila</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Cadence Config Bar */}
      <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs font-medium text-[#F5F7FA]">
            <Filter className="w-3.5 h-3.5 text-[#19C37D]" />
            Segmentação da fila e regras de cadência
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-[#929BAA] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideContactedToday}
              onChange={(e) => setHideContactedToday(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-[#252B36] bg-[#0B0D12] accent-[#19C37D]"
            />
            Ocultar já abordados hoje
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-[11px] text-[#929BAA] mb-1">Público-alvo</label>
            <select
              value={audience}
              onChange={(e) => handleAudienceChange(e.target.value as TargetAudience)}
              className="w-full h-9 px-3 bg-[#0B0D12] border border-[#252B36] rounded-xl text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
            >
              <option value="primeiro_contato">1º contato (nunca abordados)</option>
              <option value="followup">Follow-up (já abordados)</option>
              <option value="sem_site">Sem site (Upsell GMB)</option>
              <option value="todos">Todos com WhatsApp</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-[#929BAA] mb-1">Cidade</label>
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="w-full h-9 px-3 bg-[#0B0D12] border border-[#252B36] rounded-xl text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
            >
              <option value="todas">Todas as cidades</option>
              {availableCities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-[#929BAA] mb-1">Score mínimo</label>
            <select
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full h-9 px-3 bg-[#0B0D12] border border-[#252B36] rounded-xl text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
            >
              <option value={0}>Qualquer score (0+)</option>
              <option value={40}>Média/Alta (40+)</option>
              <option value={70}>Somente Alta (70+)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-[#929BAA] mb-1">Estilo padrão</label>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as PresetStyle)}
              className="w-full h-9 px-3 bg-[#0B0D12] border border-[#252B36] rounded-xl text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
            >
              <option value="persuasivo">Persuasivo (Placa NFC)</option>
              <option value="gmb_site">Gancho Site + Google Meu Negócio</option>
              <option value="direto">Direto ao ponto</option>
              <option value="followup">Retomada / Follow-up</option>
              <option value="template">Meu template salvo</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-[#929BAA] mb-1">Intervalo anti-bloqueio</label>
            <select
              value={intervalSeconds}
              onChange={(e) => setIntervalSeconds(Number(e.target.value))}
              className="w-full h-9 px-3 bg-[#0B0D12] border border-[#252B36] rounded-xl text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
            >
              <option value={0}>Sem espera (0s)</option>
              <option value={5}>Rápido (5s)</option>
              <option value={10}>Seguro (10s)</option>
              <option value={20}>Moderado (20s)</option>
              <option value={30}>Conservador (30s)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-[#929BAA] mb-1">Auto-lembrete follow-up</label>
            <select
              value={followUpDays}
              onChange={(e) => setFollowUpDays(Number(e.target.value))}
              className="w-full h-9 px-3 bg-[#0B0D12] border border-[#252B36] rounded-xl text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
            >
              <option value={0}>Não agendar</option>
              <option value={2}>Agendar em +2 dias</option>
              <option value={3}>Agendar em +3 dias</option>
              <option value={5}>Agendar em +5 dias</option>
              <option value={7}>Agendar em +7 dias</option>
            </select>
          </div>
        </div>
      </div>

      {/* Background Batch Progress Bar (only when running) */}
      {autoRunning && (
        <div className="bg-[#141821] border border-[#19C37D]/40 rounded-2xl p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Loader2 className="w-4 h-4 animate-spin text-[#19C37D]" />
              <div>
                <div className="text-xs font-semibold text-[#F5F7FA]">
                  {autoPaused ? 'Disparo automático pausado' : 'Disparando mensagens em 2º plano...'}
                </div>
                <div className="text-[11px] text-[#929BAA] font-mono tabular-nums mt-0.5">
                  {autoProgress.sent} enviada(s) · {autoProgress.failed} falha(s) · Total {autoProgress.total}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const next = !autoPaused;
                  pauseAutoRef.current = next;
                  setAutoPaused(next);
                }}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] hover:border-[#929BAA] transition-colors"
              >
                {autoPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                {autoPaused ? 'Retomar' : 'Pausar'}
              </button>
              <button
                type="button"
                onClick={() => {
                  stopAutoRef.current = true;
                }}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300 hover:bg-rose-950/60 transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
                Parar
              </button>
            </div>
          </div>
          <div className="w-full h-1.5 rounded-full bg-[#0B0D12] overflow-hidden">
            <div
              className="h-full bg-[#19C37D] transition-all duration-300"
              style={{
                width: `${
                  autoProgress.total > 0
                    ? Math.round(((autoProgress.sent + autoProgress.failed) / autoProgress.total) * 100)
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Main Two-Column Workspace */}
      {activeQueue.length === 0 && filteredCandidates.length === 0 ? (
        <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-10 text-center space-y-3">
          <div className="w-11 h-11 rounded-2xl bg-[#19C37D]/10 border border-[#19C37D]/25 flex items-center justify-center mx-auto">
            <MessageCircle className="w-5 h-5 text-[#19C37D]" />
          </div>
          <h3 className="text-sm font-semibold text-[#F5F7FA]">
            Nenhum estabelecimento elegível na fila atual
          </h3>
          <p className="text-xs text-[#929BAA] max-w-md mx-auto leading-relaxed">
            {allCandidates.length === 0
              ? 'Pesquise empresas no Radar de Empresas ou cadastre leads com número de telefone/WhatsApp para iniciar seus disparos.'
              : 'Todos os contatos deste filtro já foram abordados ou não atendem aos critérios selecionados. Tente alterar o público-alvo ou desmarcar "Ocultar já abordados hoje".'}
          </p>
          <div className="pt-2 flex items-center justify-center gap-2.5 flex-wrap">
            {allCandidates.length === 0 ? (
              <button
                type="button"
                onClick={onGoToRadar}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-[#19C37D] text-[#0B0D12] text-xs font-semibold hover:bg-[#16AE6F] transition-colors"
              >
                Ir para o Radar de Empresas
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAudience('todos');
                  setCityFilter('todas');
                  setMinScore(0);
                  setHideContactedToday(false);
                }}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-[#181D28] border border-[#252B36] text-xs font-medium text-[#F5F7FA] hover:border-[#19C37D] transition-colors"
              >
                Mostrar todos os contatos
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left 7 cols: Active Dispatch Stage */}
          <div className="lg:col-span-7 space-y-4">
            {currentCandidate ? (
              <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-6 space-y-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
                {/* Item Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-[#252B36]">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 text-[11px] text-[#929BAA] font-mono tabular-nums">
                      <span className="text-[#19C37D] font-semibold">
                        Fila {activeIndex + 1} de {activeQueue.length}
                      </span>
                      <span>·</span>
                      <span>Score {currentCandidate.opportunityScore}/100</span>
                      {aiCustomizedIds[currentCandidate.placeId] && (
                        <>
                          <span>·</span>
                          <span className="text-[#19C37D] inline-flex items-center gap-1 font-sans">
                            <Sparkles className="w-3 h-3" />
                            Personalizada com IA
                          </span>
                        </>
                      )}
                    </div>
                    <h3 className="text-base font-semibold tracking-tight text-[#F5F7FA] truncate">
                      {currentCandidate.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#929BAA]">
                      <span>{currentCandidate.category}</span>
                      {currentCandidate.city && <span>· {currentCandidate.city}</span>}
                      <span className="inline-flex items-center gap-1 text-[#F5F7FA] font-mono tabular-nums">
                        <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                        {currentCandidate.rating.toFixed(1)} ({currentCandidate.userRatingCount})
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 ${
                          currentCandidate.hasWebsite ? 'text-[#929BAA]' : 'text-amber-400 font-medium'
                        }`}
                      >
                        <Globe className="w-3 h-3" />
                        {currentCandidate.hasWebsite ? 'Possui site' : 'Sem site (GMB)'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectBusiness(currentCandidate.businessPayload)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#929BAA] hover:text-[#F5F7FA] hover:border-[#929BAA]/50 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Abrir ficha
                  </button>
                </div>

                {/* Protocol Selector + Phone Display */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0B0D12]/60 border border-[#252B36] rounded-xl px-4 py-3">
                  <div className="space-y-0.5">
                    <div className="text-[11px] text-[#929BAA]">WhatsApp de destino</div>
                    <div className="text-xs font-mono tabular-nums text-[#F5F7FA]">
                      {currentCandidate.phone || `+${currentCandidate.whatsappDigits}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 bg-[#141821] p-1 rounded-xl border border-[#252B36]">
                    <button
                      type="button"
                      onClick={() => setProtocol('web')}
                      className={`h-7 px-2.5 rounded-lg text-[11px] font-medium transition-colors ${
                        protocol === 'web'
                          ? 'bg-[#19C37D] text-[#0B0D12] font-semibold'
                          : 'text-[#929BAA] hover:text-[#F5F7FA]'
                      }`}
                    >
                      WhatsApp Web
                    </button>
                    <button
                      type="button"
                      onClick={() => setProtocol('app')}
                      className={`h-7 px-2.5 rounded-lg text-[11px] font-medium transition-colors ${
                        protocol === 'app'
                          ? 'bg-[#19C37D] text-[#0B0D12] font-semibold'
                          : 'text-[#929BAA] hover:text-[#F5F7FA]'
                      }`}
                    >
                      App Desktop
                    </button>
                  </div>
                </div>

                {/* Editable Message Box */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-[#F5F7FA]">
                      Mensagem pronta para envio
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleRegenerateSingleAI(currentCandidate)}
                        disabled={regeneratingOne}
                        className="inline-flex items-center gap-1.5 text-[11px] text-[#19C37D] hover:text-[#16AE6F] font-medium disabled:opacity-50"
                      >
                        {regeneratingOne ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                        Reescrever com IA
                      </button>
                      <span className="text-[#252B36]">|</span>
                      <button
                        type="button"
                        onClick={() => void handleCopyMessage()}
                        className="inline-flex items-center gap-1 text-[11px] text-[#929BAA] hover:text-[#F5F7FA]"
                      >
                        <Copy className="w-3 h-3" />
                        Copiar
                      </button>
                    </div>
                  </div>
                  <textarea
                    rows={6}
                    value={currentMessage}
                    onChange={(e) =>
                      setCustomMessages((prev) => ({
                        ...prev,
                        [currentCandidate.placeId]: e.target.value,
                      }))
                    }
                    className="w-full p-3.5 bg-[#0B0D12] border border-[#252B36] rounded-xl text-xs text-[#F5F7FA] leading-relaxed focus:outline-none focus:border-[#19C37D] resize-y"
                  />
                  {followUpDays > 0 && (
                    <div className="flex items-center gap-1.5 text-[11px] text-[#929BAA]">
                      <CalendarClock className="w-3.5 h-3.5 text-[#19C37D]" />
                      Ao enviar, o sistema registra o contato, move o lead para 1º contato e agenda lembrete em{' '}
                      <span className="text-[#F5F7FA] font-medium">
                        {formatDateBR(addDaysISODate(followUpDays))}
                      </span>
                      .
                    </div>
                  )}
                </div>

                {/* Cooldown Notice */}
                {cooldownRemaining > 0 && (
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Pausa anti-bloqueio ativa: aguarde{' '}
                        <strong className="font-mono tabular-nums">{cooldownRemaining}s</strong> antes do próximo disparo.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCooldownRemaining(0)}
                      className="text-[11px] underline text-amber-200 hover:text-white shrink-0"
                    >
                      Liberar agora
                    </button>
                  </div>
                )}

                {/* Primary Execution Actions */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
                  <a
                    href={currentWaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      void handleAssistedSendClick();
                    }}
                    className={`flex-1 inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl text-xs font-semibold transition-all active:scale-[0.98] whitespace-nowrap ${
                      cooldownRemaining > 0
                        ? 'bg-[#19C37D]/80 text-[#0B0D12] hover:bg-[#19C37D]'
                        : 'bg-[#19C37D] text-[#0B0D12] hover:bg-[#16AE6F]'
                    }`}
                  >
                    {sendingCurrent ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <MessageCircle className="w-4 h-4" />
                    )}
                    Enviar WhatsApp, Registrar &amp; Próximo
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>

                  <button
                    type="button"
                    onClick={handleSkipCurrent}
                    disabled={activeQueue.length <= 1}
                    className="inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs font-medium text-[#929BAA] hover:text-[#F5F7FA] hover:border-[#929BAA]/50 transition-colors disabled:opacity-40 whitespace-nowrap shrink-0"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                    Pular
                  </button>
                </div>

                {/* Honest Gateway Explainer when Webhook is not configured */}
                {!checkingGateway && !webhookConfigured && (
                  <div className="pt-3 border-t border-[#252B36] flex items-start gap-2.5 text-[11px] text-[#929BAA] leading-relaxed">
                    <AlertCircle className="w-3.5 h-3.5 text-[#929BAA] shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-[#F5F7FA] font-medium">Piloto Assistido ativo:</strong> cada clique abre o WhatsApp já preenchido com a mensagem única e avança a fila automaticamente. Para disparos 100% em 2º plano sem cliques, configure{' '}
                      <code className="text-[#F5F7FA] font-mono">WHATSAPP_WEBHOOK_URL</code> nas variáveis de ambiente do servidor (Evolution API, Z-API, Make ou n8n).
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-8 text-center space-y-2">
                <p className="text-xs text-[#929BAA]">
                  Marque pelo menos um estabelecimento na lista ao lado para ativar o palco de disparo.
                </p>
              </div>
            )}
          </div>

          {/* Right 5 cols: Interactive Queue List */}
          <div className="lg:col-span-5 bg-[#141821] border border-[#252B36] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#252B36] flex items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-[#F5F7FA]">
                  Fila de disparo ({activeQueue.length}/{filteredCandidates.length})
                </h3>
                <p className="text-[11px] text-[#929BAA] mt-0.5">
                  Clique para focar ou desmarque quem não deseja abordar
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const allExcluded = activeQueue.length === 0;
                  if (allExcluded) {
                    setExcludedIds({});
                  } else {
                    const next: Record<string, boolean> = {};
                    for (const item of filteredCandidates) next[item.placeId] = true;
                    setExcludedIds(next);
                  }
                }}
                className="text-[11px] text-[#19C37D] hover:underline whitespace-nowrap shrink-0"
              >
                {activeQueue.length === 0 ? 'Marcar todos' : 'Limpar seleção'}
              </button>
            </div>

            <div className="divide-y divide-[#252B36] max-h-[540px] overflow-y-auto">
              {filteredCandidates.map((item) => {
                const isExcluded = Boolean(excludedIds[item.placeId]);
                const isCurrent = currentCandidate?.placeId === item.placeId;
                const isAi = Boolean(aiCustomizedIds[item.placeId]);
                const autoState = autoStatusMap[item.placeId];
                const isSentToday = item.lastContactAt === today || Boolean(sessionSentIds[item.placeId]);

                return (
                  <div
                    key={item.placeId}
                    className={`px-4 py-3 flex items-center gap-3 transition-colors ${
                      isCurrent
                        ? 'bg-[#19C37D]/8'
                        : isExcluded
                          ? 'opacity-50 bg-[#0B0D12]/40'
                          : 'hover:bg-[#181D28]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!isExcluded}
                      onChange={() =>
                        setExcludedIds((prev) => ({
                          ...prev,
                          [item.placeId]: !prev[item.placeId],
                        }))
                      }
                      aria-label={`Incluir ${item.name} na fila`}
                      className="w-3.5 h-3.5 rounded border-[#252B36] bg-[#0B0D12] accent-[#19C37D] shrink-0 cursor-pointer"
                    />

                    <button
                      type="button"
                      onClick={() => {
                        if (isExcluded) {
                          setExcludedIds((prev) => ({ ...prev, [item.placeId]: false }));
                          return;
                        }
                        const idx = activeQueue.findIndex((q) => q.placeId === item.placeId);
                        if (idx >= 0) setActiveIndex(idx);
                      }}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-[#F5F7FA] truncate">
                          {item.name}
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-[#929BAA] shrink-0">
                          {item.opportunityScore} pts
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[#929BAA] mt-0.5 truncate">
                        <span className="truncate">
                          {item.category}
                          {item.city ? ` · ${item.city}` : ''}
                        </span>
                        {!item.hasWebsite && (
                          <span className="text-amber-400 shrink-0">· Sem site</span>
                        )}
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isAi && (
                        <span title="Mensagem personalizada com IA">
                          <Sparkles className="w-3.5 h-3.5 text-[#19C37D]" />
                        </span>
                      )}
                      {autoState === 'sent' || isSentToday ? (
                        <span title="Enviado">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#19C37D]" />
                        </span>
                      ) : autoState === 'error' ? (
                        <span title="Falha no envio automático">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                        </span>
                      ) : isCurrent ? (
                        <span title="Em foco na fila">
                          <Check className="w-3.5 h-3.5 text-[#19C37D]" />
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
