import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Building2,
  Camera,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Copy,
  DollarSign,
  ExternalLink,
  Globe,
  Instagram,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  RefreshCw,
  Send,
  Sparkles,
  Star,
  UserPlus,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '../../contexts/AuthContext';
import { useData, type DiscoveredBusinessInput } from '../../contexts/DataContext';
import { useToast } from '../../contexts/ToastContext';
import {
  buildWhatsappPresetMessage,
  buildWhatsappUrl,
  computeGbpSummary,
  formatAppError,
  formatDateBR,
  getOpportunityMeta,
  getStageLabel,
  renderWhatsappTemplate,
  safeFetchJson,
  todayISODate,
} from '../../lib/opportunity';
import {
  PIPELINE_COLUMNS,
  type Business,
  type InteractionType,
  type Lead,
  type PipelineStage,
} from '../../types';

interface PlacePhotoItem {
  photoUri: string;
  attributions: Array<{ displayName: string; uri: string }>;
}

interface BusinessDrawerProps {
  business: DiscoveredBusinessInput | Business | null;
  onClose: () => void;
  onOpenSaleForLead: (lead: Lead) => void;
  onAddToRoute?: (business: DiscoveredBusinessInput | Business) => void;
}

export function BusinessDrawer({
  business,
  onClose,
  onOpenSaleForLead,
  onAddToRoute,
}: BusinessDrawerProps) {
  const { profile } = useAuth();
  const {
    businesses,
    leads,
    interactions,
    reminders,
    saveLeadFromBusiness,
    enrichBusinessWebsite,
    generateGeminiAnalysis,
    refreshPlaceDetails,
    logInteraction,
    recordWhatsappSent,
    createReminder,
    toggleReminder,
    updateLeadStage,
  } = useData();
  const { showToast } = useToast();

  const [enriching, setEnriching] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [savingLead, setSavingLead] = useState(false);
  const [loggingWa, setLoggingWa] = useState(false);

  const [localEnrich, setLocalEnrich] = useState<{ instagram?: string; email?: string }>({});
  const [localAnalysis, setLocalAnalysis] = useState<string>('');
  const [localRefreshed, setLocalRefreshed] = useState<DiscoveredBusinessInput | null>(null);

  const [photos, setPhotos] = useState<PlacePhotoItem[]>([]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [loadingPhoto, setLoadingPhoto] = useState(false);

  const [waComposerOpen, setWaComposerOpen] = useState(false);
  const [waMessage, setWaMessage] = useState('');
  const [waPreset, setWaPreset] = useState<'persuasivo' | 'gmb_site' | 'direto' | 'template'>('persuasivo');

  const [contactOpen, setContactOpen] = useState(false);
  const [contactType, setContactType] = useState<InteractionType>('whatsapp');
  const [contactSummary, setContactSummary] = useState('');
  const [contactDate, setContactDate] = useState(todayISODate());
  const [nextStage, setNextStage] = useState<PipelineStage>('primeiro_contato');
  const [followUpDate, setFollowUpDate] = useState('');
  const [submittingContact, setSubmittingContact] = useState(false);

  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderDate, setReminderDate] = useState(todayISODate());

  // Resolve live Firestore business & lead if already saved
  const savedBusiness = useMemo(() => {
    if (!business) return null;
    return businesses.find((b) => b.placeId === business.placeId) || null;
  }, [businesses, business]);

  const savedLead = useMemo(() => {
    if (!business) return null;
    return leads.find((l) => l.placeId === business.placeId) || null;
  }, [leads, business]);

  const current = localRefreshed || savedBusiness || business;

  useEffect(() => {
    setLocalEnrich({});
    setLocalAnalysis('');
    setLocalRefreshed(null);
    setWaComposerOpen(false);
    setContactOpen(false);
    setPhotos([]);
    setPhotoIndex(0);

    if (!business) return;

    setWaPreset('persuasivo');
    setWaMessage(
      buildWhatsappPresetMessage('persuasivo', {
        empresa: business.name,
        cidade: business.city,
        nota: business.rating,
        avaliacoes: business.userRatingCount,
        hasWebsite: business.hasWebsite,
      })
    );

    if (!business.placeId) return;

    let cancelled = false;
    setLoadingPhoto(true);
    safeFetchJson<{ photos?: PlacePhotoItem[] }>(
      `/api/places/${encodeURIComponent(business.placeId)}/photo`,
      undefined,
      'Não foi possível carregar fotos.'
    )
      .then(({ data }) => {
        if (!cancelled && Array.isArray(data.photos)) {
          setPhotos(data.photos);
        }
      })
      .catch(() => {
        // Ignore photo errors gracefully
      })
      .finally(() => {
        if (!cancelled) setLoadingPhoto(false);
      });

    return () => {
      cancelled = true;
    };
  }, [business?.placeId]);

  const leadInteractions = useMemo(() => {
    if (!savedLead) return [];
    return interactions.filter((i) => i.leadId === savedLead.id);
  }, [interactions, savedLead]);

  const whatsappHistory = useMemo(
    () => leadInteractions.filter((i) => i.type === 'whatsapp'),
    [leadInteractions]
  );

  const leadReminders = useMemo(() => {
    if (!savedLead) return [];
    return reminders.filter((r) => r.leadId === savedLead.id);
  }, [reminders, savedLead]);

  const instagram = current ? localEnrich.instagram || savedLead?.instagram || current.instagram || '' : '';
  const email = current ? localEnrich.email || savedLead?.email || current.email || '' : '';
  const currentAnalysis =
    current && 'geminiAnalysis' in current && typeof current.geminiAnalysis === 'string'
      ? current.geminiAnalysis
      : '';
  const savedAnalysis =
    savedBusiness && typeof savedBusiness.geminiAnalysis === 'string'
      ? savedBusiness.geminiAnalysis
      : '';
  const analysis: string = localAnalysis || savedAnalysis || currentAnalysis;

  const oppMeta = current ? getOpportunityMeta(current.opportunityLevel) : getOpportunityMeta('media');
  const gbp = current ? computeGbpSummary(current) : null;
  const whatsappDigits = current ? current.whatsapp || current.phone : '';
  const waUrl = buildWhatsappUrl(whatsappDigits, waMessage);

  const handleSelectWaPreset = (preset: 'persuasivo' | 'gmb_site' | 'direto' | 'template') => {
    if (!current) return;
    setWaPreset(preset);
    if (preset === 'template') {
      setWaMessage(
        renderWhatsappTemplate(profile?.whatsappTemplate || '', {
          empresa: current.name,
          cidade: current.city,
          nota: current.rating,
          avaliacoes: current.userRatingCount,
          hasWebsite: current.hasWebsite,
        })
      );
      return;
    }
    setWaMessage(
      buildWhatsappPresetMessage(preset, {
        empresa: current.name,
        cidade: current.city,
        nota: current.rating,
        avaliacoes: current.userRatingCount,
        hasWebsite: current.hasWebsite,
      })
    );
  };

  const handleCopy = async (text: string, label: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} copiado para a área de transferência.`);
    } catch {
      showToast(`Não foi possível copiar o ${label.toLowerCase()}.`, 'error');
    }
  };

  const handleSaveLead = async (): Promise<Lead | null> => {
    if (!current) return null;
    setSavingLead(true);
    try {
      const lead = await saveLeadFromBusiness({
        ...current,
        instagram,
        email,
      });
      showToast(`Lead "${lead.businessName}" salvo no pipeline.`);
      return lead;
    } catch (err) {
      showToast(formatAppError(err, 'Erro ao salvar lead.'), 'error');
      return null;
    } finally {
      setSavingLead(false);
    }
  };

  const handleMarkWhatsappSent = async (showSuccessToast = true) => {
    if (!current) return;
    setLoggingWa(true);
    try {
      await recordWhatsappSent({
        biz: { ...current, instagram, email },
        summary: `WhatsApp enviado: ${waMessage.trim().slice(0, 140)}`,
      });
      if (showSuccessToast) {
        showToast('Envio no WhatsApp registrado no CRM.');
      }
    } catch (err) {
      showToast(formatAppError(err, 'Não foi possível registrar o envio no WhatsApp.'), 'error');
    } finally {
      setLoggingWa(false);
    }
  };

  const handleEnrich = async () => {
    if (!current) return;
    if (!current.websiteUri) {
      showToast('Este estabelecimento não possui site oficial cadastrado para consulta.', 'error');
      return;
    }
    setEnriching(true);
    try {
      const res = await enrichBusinessWebsite(current);
      setLocalEnrich({ instagram: res.instagram, email: res.email });
      if (res.instagram || res.email) {
        showToast('Dados públicos encontrados no site oficial.');
      } else {
        showToast('Nenhum Instagram ou e-mail público encontrado no site oficial.');
      }
    } catch (err) {
      showToast(formatAppError(err, 'Erro ao enriquecer dados.'), 'error');
    } finally {
      setEnriching(false);
    }
  };

  const handleGemini = async () => {
    if (!current) return;
    setAnalyzing(true);
    try {
      const text = await generateGeminiAnalysis(current);
      setLocalAnalysis(text);
      showToast('Análise comercial gerada com sucesso.');
    } catch (err) {
      showToast(formatAppError(err, 'Erro ao gerar análise comercial.'), 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRefresh = async () => {
    if (!current) return;
    setRefreshing(true);
    try {
      const updated = await refreshPlaceDetails(current.placeId);
      setLocalRefreshed(updated);
      showToast('Ficha atualizada via Google Places API.');
    } catch (err) {
      showToast(formatAppError(err, 'Erro ao atualizar ficha.'), 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSubmitContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactSummary.trim()) {
      showToast('Descreva o resumo do contato realizado.', 'error');
      return;
    }
    setSubmittingContact(true);
    try {
      const lead = savedLead || (await handleSaveLead());
      if (!lead) return;

      await logInteraction({
        leadId: lead.id,
        businessName: lead.businessName,
        type: contactType,
        summary: contactSummary.trim(),
        contactDate,
        nextStage,
        nextFollowUpAt: followUpDate,
      });

      if (followUpDate) {
        await createReminder({
          leadId: lead.id,
          businessName: lead.businessName,
          title: `Retorno: ${contactSummary.trim().slice(0, 80)}`,
          dueDate: followUpDate,
        });
      }

      setContactSummary('');
      setFollowUpDate('');
      setContactOpen(false);
      showToast('Contato registrado no histórico do lead.');
    } catch (err) {
      showToast(formatAppError(err, 'Erro ao registrar contato.'), 'error');
    } finally {
      setSubmittingContact(false);
    }
  };

  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reminderTitle.trim() || !reminderDate) return;
    try {
      const lead = savedLead || (await handleSaveLead());
      if (!lead) return;
      await createReminder({
        leadId: lead.id,
        businessName: lead.businessName,
        title: reminderTitle.trim(),
        dueDate: reminderDate,
      });
      setReminderTitle('');
      showToast('Lembrete criado com sucesso.');
    } catch (err) {
      showToast(formatAppError(err, 'Erro ao criar lembrete.'), 'error');
    }
  };

  const handleRegisterSale = async () => {
    const lead = savedLead || (await handleSaveLead());
    if (lead) {
      onOpenSaleForLead(lead);
    }
  };

  const lastUpdatedLabel =
    savedBusiness?.lastUpdatedAt && typeof savedBusiness.lastUpdatedAt.toDate === 'function'
      ? savedBusiness.lastUpdatedAt.toDate().toLocaleString('pt-BR')
      : 'Consulta atual';

  const activePhoto = photos[photoIndex] || null;
  const lastWhatsapp = whatsappHistory[0] || null;

  return (
    <AnimatePresence>
      {current && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 330, damping: 34 }}
            className="relative z-10 w-full max-w-2xl bg-[#0B0D12]/95 backdrop-blur-xl border-l border-[#252B36] h-full flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-[#252B36] bg-[#141821]/85 backdrop-blur-md flex items-start justify-between gap-4 shrink-0">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#929BAA]">
                  <span>{current.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>{current.city || 'Localidade não informada'}</span>
                  {savedLead && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#19C37D] font-medium">
                        {getStageLabel(savedLead.stage)}
                      </span>
                    </>
                  )}
                  {lastWhatsapp && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 text-[#19C37D] font-medium">
                        <CheckCheck className="w-3.5 h-3.5" />
                        WhatsApp enviado ({formatDateBR(lastWhatsapp.contactDate)})
                      </span>
                    </>
                  )}
                </div>
                <h2 className="text-lg font-semibold text-[#F5F7FA] leading-tight tracking-tight">
                  {current.name}
                </h2>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  title="Atualizar dados pela Places API"
                  className="p-2 rounded-xl border border-[#252B36] text-[#929BAA] hover:text-[#F5F7FA] hover:bg-[#181D28] transition-all active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-xl border border-[#252B36] text-[#929BAA] hover:text-[#F5F7FA] hover:bg-[#181D28] transition-all active:scale-95"
                  aria-label="Fechar ficha"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Storefront / Facade Photo Showcase */}
              <div className="bg-[#141821] border border-[#252B36] rounded-2xl overflow-hidden">
                {loadingPhoto ? (
                  <div className="h-44 w-full bg-[#181D28] animate-pulse flex items-center justify-center gap-2 text-xs text-[#929BAA]">
                    <Loader2 className="w-4 h-4 animate-spin text-[#19C37D]" />
                    Carregando foto da fachada...
                  </div>
                ) : activePhoto ? (
                  <div className="relative group">
                    <img
                      src={activePhoto.photoUri}
                      alt={`Fachada de ${current.name}`}
                      className="w-full h-52 object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0B0D12]/90 via-[#0B0D12]/40 to-transparent pointer-events-none" />
                    {photos.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setPhotoIndex((prev) => (prev - 1 + photos.length) % photos.length)
                          }
                          aria-label="Foto anterior"
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 backdrop-blur-md border border-white/15 flex items-center justify-center text-white opacity-80 hover:opacity-100 transition-opacity"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPhotoIndex((prev) => (prev + 1) % photos.length)}
                          aria-label="Próxima foto"
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 backdrop-blur-md border border-white/15 flex items-center justify-center text-white opacity-80 hover:opacity-100 transition-opacity"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between gap-2 text-[11px] text-[#F5F7FA]/85">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <Camera className="w-3.5 h-3.5 text-[#19C37D]" />
                        Foto {photoIndex + 1} de {photos.length} · Google Places
                      </span>
                      {activePhoto.attributions[0] && (
                        <span className="truncate max-w-[210px] text-[10px] text-[#929BAA]">
                          Foto:{' '}
                          {activePhoto.attributions[0].uri ? (
                            <a
                              href={activePhoto.attributions[0].uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline hover:text-[#F5F7FA]"
                            >
                              {activePhoto.attributions[0].displayName}
                            </a>
                          ) : (
                            activePhoto.attributions[0].displayName
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="px-5 py-4 flex items-center justify-between gap-3 text-xs text-[#929BAA]">
                    <div className="flex items-center gap-2.5">
                      <Camera className="w-4 h-4 text-[#929BAA] shrink-0" />
                      <span>
                        Sem foto de fachada publicada no Google Places — ótimo ponto para oferecer melhoria visual no Google Meu Negócio.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Primary Action Bar */}
              <div className="flex flex-wrap items-center gap-2">
                {!savedLead ? (
                  <button
                    type="button"
                    onClick={handleSaveLead}
                    disabled={savingLead}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#19C37D] text-[#0B0D12] text-xs font-semibold hover:bg-[#16AE6F] transition-all active:scale-[0.98] disabled:opacity-60"
                  >
                    {savingLead ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <UserPlus className="w-3.5 h-3.5" />
                    )}
                    Salvar lead
                  </button>
                ) : (
                  <select
                    value={savedLead.stage}
                    onChange={(e) => void updateLeadStage(savedLead.id, e.target.value as PipelineStage)}
                    className="h-8 px-3 rounded-xl bg-[#141821] border border-[#252B36] text-xs font-medium text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
                  >
                    {PIPELINE_COLUMNS.map((col) => (
                      <option key={col.id} value={col.id}>
                        Etapa: {col.label}
                      </option>
                    ))}
                  </select>
                )}

                {whatsappDigits ? (
                  <button
                    type="button"
                    onClick={() => setWaComposerOpen((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-medium transition-all active:scale-[0.98] ${
                      lastWhatsapp
                        ? 'bg-[#19C37D]/10 border-[#19C37D]/50 text-[#19C37D]'
                        : 'bg-[#141821] border-[#252B36] text-[#F5F7FA] hover:border-[#19C37D]'
                    }`}
                  >
                    {lastWhatsapp ? (
                      <CheckCheck className="w-3.5 h-3.5 text-[#19C37D]" />
                    ) : (
                      <MessageCircle className="w-3.5 h-3.5 text-[#19C37D]" />
                    )}
                    {lastWhatsapp ? 'WhatsApp enviado (Reenviar)' : 'Abordar no WhatsApp'}
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => setContactOpen((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#141821] border border-[#252B36] text-xs font-medium text-[#F5F7FA] hover:bg-[#181D28] transition-all active:scale-[0.98]"
                >
                  <Send className="w-3.5 h-3.5 text-[#929BAA]" />
                  Registrar contato
                </button>

                <button
                  type="button"
                  onClick={handleRegisterSale}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#141821] border border-[#252B36] text-xs font-medium text-[#F5F7FA] hover:bg-[#181D28] transition-all active:scale-[0.98]"
                >
                  <DollarSign className="w-3.5 h-3.5 text-[#19C37D]" />
                  Registrar venda
                </button>

                {onAddToRoute && (current.lat !== 0 || current.lng !== 0 || current.address) && (
                  <button
                    type="button"
                    onClick={() => onAddToRoute(current)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#141821] border border-[#252B36] text-xs font-medium text-[#F5F7FA] hover:border-[#19C37D] transition-all active:scale-[0.98]"
                  >
                    <Navigation className="w-3.5 h-3.5 text-[#19C37D]" />
                    Traçar rota até aqui
                  </button>
                )}
              </div>

              {/* WhatsApp Message Composer */}
              <AnimatePresence>
                {waComposerOpen && whatsappDigits && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#F5F7FA]">
                          Abordagem persuasiva no WhatsApp
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-[#929BAA]">
                          +{whatsappDigits.replace(/\D/g, '')}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {(
                          [
                            { id: 'persuasivo', label: 'Persuasiva (Placa NFC)' },
                            { id: 'gmb_site', label: 'NFC + Google Meu Negócio' },
                            { id: 'direto', label: 'Curta e direta' },
                            { id: 'template', label: 'Meu template' },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => handleSelectWaPreset(opt.id)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                              waPreset === opt.id
                                ? 'bg-[#19C37D]/15 border-[#19C37D] text-[#19C37D]'
                                : 'bg-[#0B0D12] border-[#252B36] text-[#929BAA] hover:text-[#F5F7FA]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>

                      <textarea
                        rows={5}
                        value={waMessage}
                        onChange={(e) => setWaMessage(e.target.value)}
                        className="w-full rounded-xl bg-[#0B0D12] border border-[#252B36] p-3 text-xs text-[#F5F7FA] leading-relaxed focus:outline-none focus:border-[#19C37D]"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => void handleMarkWhatsappSent(true)}
                          disabled={loggingWa}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#929BAA] hover:text-[#F5F7FA] hover:border-[#19C37D] transition-colors disabled:opacity-50"
                        >
                          {loggingWa ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCheck className="w-3.5 h-3.5 text-[#19C37D]" />
                          )}
                          Apenas marcar como enviado
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setWaComposerOpen(false)}
                            className="px-3 py-1.5 rounded-xl text-xs text-[#929BAA] hover:text-[#F5F7FA]"
                          >
                            Fechar
                          </button>
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => void handleMarkWhatsappSent(true)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#19C37D] text-[#0B0D12] text-xs font-semibold hover:bg-[#16AE6F] transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Enviar e registrar no CRM
                          </a>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Log Contact Form */}
              <AnimatePresence>
                {contactOpen && (
                  <motion.form
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22 }}
                    onSubmit={handleSubmitContact}
                    className="overflow-hidden"
                  >
                    <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-4 space-y-3">
                      <div className="text-xs font-semibold text-[#F5F7FA]">
                        Registrar interação comercial
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] text-[#929BAA] mb-1">Canal</label>
                          <select
                            value={contactType}
                            onChange={(e) => setContactType(e.target.value as InteractionType)}
                            className="w-full h-8 px-2.5 rounded-lg bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA]"
                          >
                            <option value="whatsapp">WhatsApp</option>
                            <option value="ligacao">Ligação</option>
                            <option value="visita">Visita presencial</option>
                            <option value="instagram">Instagram</option>
                            <option value="email">E-mail</option>
                            <option value="nota">Anotação</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#929BAA] mb-1">Data do contato</label>
                          <input
                            type="date"
                            value={contactDate}
                            onChange={(e) => setContactDate(e.target.value)}
                            className="w-full h-8 px-2.5 rounded-lg bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#929BAA] mb-1">Atualizar etapa</label>
                          <select
                            value={nextStage}
                            onChange={(e) => setNextStage(e.target.value as PipelineStage)}
                            className="w-full h-8 px-2.5 rounded-lg bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA]"
                          >
                            {PIPELINE_COLUMNS.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#929BAA] mb-1">Observações</label>
                        <textarea
                          rows={2}
                          value={contactSummary}
                          onChange={(e) => setContactSummary(e.target.value)}
                          placeholder="Ex.: Conversei com o gerente, pediu orçamento para 3 placas NFC..."
                          className="w-full rounded-lg bg-[#0B0D12] border border-[#252B36] p-2.5 text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-[#929BAA]">Lembrete de retorno:</label>
                          <input
                            type="date"
                            value={followUpDate}
                            onChange={(e) => setFollowUpDate(e.target.value)}
                            className="h-8 px-2.5 rounded-lg bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA]"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={submittingContact}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#19C37D] text-[#0B0D12] text-xs font-semibold hover:bg-[#16AE6F] disabled:opacity-50"
                        >
                          {submittingContact && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          Salvar contato
                        </button>
                      </div>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>

              {/* Website & Google Meu Negócio (GBP) Audit Card */}
              {gbp && (
                <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-[#F5F7FA]">
                        Presença Digital & Google Meu Negócio
                      </div>
                      <div className="text-[11px] text-[#929BAA] mt-0.5">
                        Diagnóstico para porta de entrada (NFC) e upsell de otimização
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono tabular-nums font-semibold text-[#F5F7FA]">
                        Saúde GBP: <span className={gbp.gbpScore >= 70 ? 'text-[#19C37D]' : gbp.gbpScore >= 45 ? 'text-amber-400' : 'text-rose-400'}>{gbp.gbpScore}/100</span>
                      </div>
                    </div>
                  </div>

                  {/* Site & GBP Core Signals Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div
                      className={`p-3 rounded-xl border text-xs space-y-1 ${
                        gbp.hasWebsite
                          ? 'bg-[#19C37D]/10 border-[#19C37D]/30'
                          : 'bg-amber-500/10 border-amber-500/30'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-[11px] text-[#929BAA]">
                        <Globe className="w-3.5 h-3.5" />
                        Site oficial
                      </div>
                      <div className={`font-semibold ${gbp.hasWebsite ? 'text-[#19C37D]' : 'text-amber-400'}`}>
                        {gbp.hasWebsite ? 'Possui site' : 'Sem site'}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl border border-[#252B36] bg-[#0B0D12] text-xs space-y-1">
                      <div className="text-[11px] text-[#929BAA]">Horários</div>
                      <div className={`font-semibold ${gbp.hasOpeningHours ? 'text-[#19C37D]' : 'text-amber-400'}`}>
                        {gbp.hasOpeningHours === true
                          ? 'Cadastrado'
                          : gbp.hasOpeningHours === false
                          ? 'Ausente'
                          : 'Atualize ficha'}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl border border-[#252B36] bg-[#0B0D12] text-xs space-y-1">
                      <div className="text-[11px] text-[#929BAA]">Fotos na ficha</div>
                      <div className="font-semibold font-mono tabular-nums text-[#F5F7FA]">
                        {typeof gbp.photosCount === 'number'
                          ? `${gbp.photosCount} foto(s)`
                          : photos.length > 0
                          ? `${photos.length}+ foto(s)`
                          : 'Verificar'}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl border border-[#252B36] bg-[#0B0D12] text-xs space-y-1">
                      <div className="text-[11px] text-[#929BAA]">Descrição GBP</div>
                      <div className={`font-semibold ${gbp.hasEditorialSummary ? 'text-[#19C37D]' : 'text-[#929BAA]'}`}>
                        {gbp.hasEditorialSummary ? 'Preenchida' : 'Não detectada'}
                      </div>
                    </div>
                  </div>

                  {gbp.gbpGaps.length > 0 && (
                    <div className="bg-[#0B0D12] border border-[#252B36] rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-400">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Gargalos no Google Meu Negócio (oportunidade de upsell)
                      </div>
                      <ul className="space-y-1">
                        {gbp.gbpGaps.map((gap, i) => (
                          <li key={i} className="text-xs text-[#929BAA] flex items-start gap-2">
                            <span className="text-amber-400 mt-0.5">•</span>
                            <span>{gap}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {current.openingHoursSummary && (
                    <div className="text-[11px] text-[#929BAA] leading-relaxed">
                      <span className="text-[#F5F7FA] font-medium">Horários cadastrados: </span>
                      {current.openingHoursSummary}
                    </div>
                  )}
                </div>
              )}

              {/* Opportunity Intelligence Card */}
              <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs text-[#929BAA]">Potencial comercial NFC</div>
                    <div className="flex items-baseline gap-2.5 mt-1">
                      <span className="text-2xl font-semibold font-mono tabular-nums text-[#F5F7FA]">
                        {current.opportunityScore}
                      </span>
                      <span className="text-xs text-[#929BAA] font-mono">/ 100</span>
                      <span className={`text-xs font-semibold ${oppMeta.textColor}`}>
                        {oppMeta.label}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-1 text-sm font-semibold font-mono tabular-nums text-[#F5F7FA]">
                      <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                      {current.rating > 0 ? current.rating.toFixed(1) : '—'}
                    </div>
                    <div className="text-xs text-[#929BAA] font-mono tabular-nums mt-0.5">
                      {current.userRatingCount} avaliações
                    </div>
                  </div>
                </div>

                <div className="h-1.5 w-full bg-[#0B0D12] rounded-full overflow-hidden">
                  <div
                    className={`h-full ${oppMeta.barColor} transition-all duration-500`}
                    style={{ width: `${current.opportunityScore}%` }}
                  />
                </div>

                {current.opportunityReasons && current.opportunityReasons.length > 0 && (
                  <ul className="space-y-1.5 pt-1">
                    {current.opportunityReasons.map((reason, idx) => (
                      <li key={idx} className="text-xs text-[#929BAA] flex items-start gap-2">
                        <span className="text-[#19C37D] mt-0.5">•</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Gemini Commercial Analysis */}
              <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#19C37D]" />
                    <h3 className="text-sm font-semibold text-[#F5F7FA]">
                      Análise comercial personalizada
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleGemini}
                    disabled={analyzing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#252B36] bg-[#0B0D12] text-xs font-medium text-[#F5F7FA] hover:border-[#19C37D] transition-all active:scale-95 disabled:opacity-50"
                  >
                    {analyzing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#19C37D]" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-[#19C37D]" />
                    )}
                    {analysis ? 'Atualizar análise' : 'Gerar análise'}
                  </button>
                </div>

                {analysis ? (
                  <div className="text-xs text-[#F5F7FA]/90 leading-relaxed whitespace-pre-line">
                    {analysis}
                  </div>
                ) : (
                  <p className="text-xs text-[#929BAA]">
                    Gere uma análise sob medida explicando como usar a placa NFC como porta de entrada e vender otimização do Google Meu Negócio para {current.name}.
                  </p>
                )}
              </div>

              {/* Contact & Digital Presence Grid */}
              <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[#F5F7FA]">
                    Dados de contato e canais públicos
                  </h3>
                  {current.websiteUri && (
                    <button
                      type="button"
                      onClick={handleEnrich}
                      disabled={enriching}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#252B36] text-[11px] font-medium text-[#929BAA] hover:text-[#F5F7FA] hover:border-[#19C37D] transition-colors disabled:opacity-50"
                    >
                      {enriching && <Loader2 className="w-3 h-3 animate-spin" />}
                      Buscar Instagram e E-mail no site
                    </button>
                  )}
                </div>

                <div className="divide-y divide-[#252B36] text-xs">
                  <div className="py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <MapPin className="w-3.5 h-3.5 text-[#929BAA] shrink-0" />
                      <span className="text-[#929BAA] shrink-0">Endereço</span>
                    </div>
                    <span className="text-[#F5F7FA] text-right truncate max-w-xs">
                      {current.address || 'Não encontrado'}
                    </span>
                  </div>

                  <div className="py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Phone className="w-3.5 h-3.5 text-[#929BAA] shrink-0" />
                      <span className="text-[#929BAA]">Telefone / WhatsApp</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono tabular-nums text-[#F5F7FA]">
                        {current.phone || 'Não encontrado'}
                      </span>
                      {current.phone && (
                        <button
                          type="button"
                          onClick={() => void handleCopy(current.phone, 'Telefone')}
                          className="p-1 text-[#929BAA] hover:text-[#F5F7FA]"
                          title="Copiar telefone"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Globe className="w-3.5 h-3.5 text-[#929BAA] shrink-0" />
                      <span className="text-[#929BAA]">Website</span>
                    </div>
                    {current.websiteUri ? (
                      <a
                        href={current.websiteUri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[#19C37D] hover:underline truncate max-w-xs"
                      >
                        <span className="truncate">{current.websiteUri}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-amber-400 font-medium">Não possui site</span>
                    )}
                  </div>

                  <div className="py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Instagram className="w-3.5 h-3.5 text-[#929BAA] shrink-0" />
                      <span className="text-[#929BAA]">Instagram</span>
                    </div>
                    {instagram ? (
                      <a
                        href={instagram}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[#19C37D] hover:underline truncate max-w-xs"
                      >
                        <span className="truncate">{instagram}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-[#929BAA]">Não encontrado</span>
                    )}
                  </div>

                  <div className="py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Mail className="w-3.5 h-3.5 text-[#929BAA] shrink-0" />
                      <span className="text-[#929BAA]">E-mail</span>
                    </div>
                    {email ? (
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[#F5F7FA]">{email}</span>
                        <button
                          type="button"
                          onClick={() => void handleCopy(email, 'E-mail')}
                          className="p-1 text-[#929BAA] hover:text-[#F5F7FA]"
                          title="Copiar e-mail"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[#929BAA]">Não encontrado</span>
                    )}
                  </div>

                  <div className="py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Building2 className="w-3.5 h-3.5 text-[#929BAA] shrink-0" />
                      <span className="text-[#929BAA]">Google Maps</span>
                    </div>
                    {current.googleMapsUri ? (
                      <a
                        href={current.googleMapsUri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[#19C37D] hover:underline"
                      >
                        Abrir ficha no Google Maps
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-[#929BAA]">Não encontrado</span>
                    )}
                  </div>

                  <div className="pt-2.5 flex items-center justify-between text-[11px] text-[#929BAA]">
                    <span>Última atualização</span>
                    <span className="font-mono">{lastUpdatedLabel}</span>
                  </div>
                </div>
              </div>

              {/* Public Reviews */}
              <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-[#F5F7FA]">
                  Avaliações disponíveis ({current.reviews?.length || 0})
                </h3>
                {current.reviews && current.reviews.length > 0 ? (
                  <div className="divide-y divide-[#252B36]">
                    {current.reviews.map((rev, idx) => (
                      <div key={idx} className="py-3 first:pt-0 last:pb-0 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-[#F5F7FA]">{rev.author}</span>
                          <span className="text-[#929BAA] font-mono tabular-nums">
                            {rev.rating}★ · {rev.relativeTime}
                          </span>
                        </div>
                        {rev.text && (
                          <p className="text-xs text-[#929BAA] leading-relaxed">{rev.text}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#929BAA]">
                    Nenhum comentário detalhado retornado pela API para este local.
                  </p>
                )}
              </div>

              {/* Lead Interactions & Reminders */}
              {savedLead && (
                <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[#F5F7FA]">
                      Histórico de interações e lembretes
                    </h3>
                  </div>

                  <form onSubmit={handleCreateReminder} className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={reminderTitle}
                      onChange={(e) => setReminderTitle(e.target.value)}
                      placeholder="Novo lembrete (ex.: Enviar mockup da placa)"
                      className="flex-1 min-w-[180px] h-8 px-3 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
                    />
                    <input
                      type="date"
                      value={reminderDate}
                      onChange={(e) => setReminderDate(e.target.value)}
                      className="h-8 px-2.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA]"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 h-8 px-3 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs font-medium text-[#F5F7FA] hover:border-[#19C37D]"
                    >
                      <Bell className="w-3.5 h-3.5 text-[#19C37D]" />
                      Agendar
                    </button>
                  </form>

                  {leadReminders.length > 0 && (
                    <div className="space-y-1.5">
                      {leadReminders.map((rem) => (
                        <button
                          key={rem.id}
                          type="button"
                          onClick={() => void toggleReminder(rem.id, !rem.completed)}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#0B0D12] border border-[#252B36] text-left text-xs"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <Check
                              className={`w-3.5 h-3.5 shrink-0 ${
                                rem.completed ? 'text-[#19C37D]' : 'text-[#929BAA]/40'
                              }`}
                            />
                            <span
                              className={`truncate ${
                                rem.completed ? 'line-through text-[#929BAA]' : 'text-[#F5F7FA]'
                              }`}
                            >
                              {rem.title}
                            </span>
                          </span>
                          <span className="font-mono text-[11px] text-[#929BAA] shrink-0">
                            {formatDateBR(rem.dueDate)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {leadInteractions.length > 0 ? (
                    <div className="divide-y divide-[#252B36]">
                      {leadInteractions.map((item) => (
                        <div key={item.id} className="py-2.5 space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-[#929BAA]">
                            <span className="capitalize font-medium text-[#F5F7FA] inline-flex items-center gap-1.5">
                              {item.type === 'whatsapp' && (
                                <CheckCheck className="w-3.5 h-3.5 text-[#19C37D]" />
                              )}
                              {item.type}
                            </span>
                            <span className="font-mono">{formatDateBR(item.contactDate)}</span>
                          </div>
                          <p className="text-xs text-[#929BAA]">{item.summary}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#929BAA]">
                      Nenhuma interação registrada ainda para este lead.
                    </p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
