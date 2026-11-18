import type { OpportunityLevel, PaymentMethod, PaymentStatus, PipelineStage } from '../types';

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatDateBR(isoOrDate: string): string {
  if (!isoOrDate) return '—';
  const datePart = isoOrDate.split('T')[0];
  const parts = datePart.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return isoOrDate;
  return d.toLocaleDateString('pt-BR');
}

export function todayISODate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysISODate(days: number): string {
  const target = new Date();
  target.setDate(target.getDate() + Math.max(0, Math.round(days)));
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, '0');
  const d = String(target.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function sanitizeId(raw: string, maxLen = 120): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '_');
  return cleaned.slice(0, maxLen) || `doc_${Date.now()}`;
}

export function makeBusinessDocId(uid: string, placeId: string): string {
  return sanitizeId(`biz_${uid.slice(0, 12)}_${placeId}`, 124);
}

export function makeLeadDocId(uid: string, placeId: string): string {
  return sanitizeId(`lead_${uid.slice(0, 12)}_${placeId}`, 124);
}

export function makeRandomId(prefix = 'id'): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return sanitizeId(`${prefix}_${Date.now()}_${rand}`, 124);
}

export function clampStr(val: string | undefined | null, maxLen: number): string {
  if (!val) return '';
  return String(val).trim().slice(0, maxLen);
}

export function formatWhatsappNumber(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function buildWhatsappUrl(phone: string, message: string): string {
  const digits = formatWhatsappNumber(phone);
  if (!digits) return '';
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function buildWhatsappAppUrl(
  phone: string,
  message: string,
  protocol: 'web' | 'app' = 'web'
): string {
  const digits = formatWhatsappNumber(phone);
  if (!digits) return '';
  if (protocol === 'app') {
    return `whatsapp://send?phone=${digits}&text=${encodeURIComponent(message)}`;
  }
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function renderWhatsappTemplate(
  template: string,
  vars: {
    empresa: string;
    cidade?: string;
    nota?: number;
    avaliacoes?: number;
    hasWebsite?: boolean;
  }
): string {
  const defaultTemplate =
    'Olá, tudo bem? Estava analisando o perfil de {empresa} no Google Maps ({nota}★ · {avaliacoes} avaliações) e vi um potencial enorme para vocês multiplicarem essas avaliações rapidamente.\n\nTrabalho com Placas NFC de Avaliação Google para balcão: o cliente só encosta o celular na hora de pagar e já abre a tela de avaliação em 2 segundos — sem QR Code difícil e sem pedir favor.\n\nPosso te mandar um vídeo rápido de 30s mostrando como funciona na prática e como isso já ajuda a subir no topo das buscas em {cidade}?';

  const base = template && template.trim() ? template : defaultTemplate;
  return base
    .replace(/\{empresa\}/gi, vars.empresa || 'sua empresa')
    .replace(/\{cidade\}/gi, vars.cidade || 'sua cidade')
    .replace(/\{nota\}/gi, vars.nota ? vars.nota.toFixed(1) : '—')
    .replace(/\{avaliacoes\}/gi, String(vars.avaliacoes ?? 0));
}

export function buildWhatsappPresetMessage(
  preset: 'persuasivo' | 'gmb_site' | 'direto',
  vars: {
    empresa: string;
    cidade?: string;
    nota?: number;
    avaliacoes?: number;
    hasWebsite?: boolean;
  }
): string {
  const name = vars.empresa || 'sua empresa';
  const city = vars.cidade || 'sua região';
  const ratingText = vars.nota ? `${vars.nota.toFixed(1)}★` : 'boa avaliação';
  const count = vars.avaliacoes ?? 0;

  if (preset === 'gmb_site') {
    const siteHook = vars.hasWebsite
      ? 'Notei que vocês já têm site, mas dá para aproveitar muito melhor o tráfego local do Google Meu Negócio'
      : 'Notei também que vocês ainda não têm um site vinculado na ficha do Google Maps, o que faz perder clientes prontos para comprar';
    return `Olá! Tudo bem? Analisei o perfil de ${name} no Google Maps (${ratingText} com ${count} avaliações).\n\n${siteHook}.\n\nNossos parceiros começam colocando uma Placa NFC no balcão (o cliente encosta o celular e avalia em segundos) e, com o aumento das notas, posicionamos a ficha no topo de ${city}. Quer ver um modelo personalizado com a marca de ${name}?`;
  }

  if (preset === 'direto') {
    return `Olá! Vi o perfil de ${name} no Google (${ratingText} · ${count} avaliações). Trabalho com Placa NFC de Avaliação Google para balcão: o cliente encosta o celular e avalia na hora, aumentando notas e indicações no Google Maps sem esforço. Posso te enviar foto e valores sem compromisso?`;
  }

  return `Olá, tudo bem? Estava analisando o perfil de ${name} no Google Maps (${ratingText} · ${count} avaliações) e vi uma oportunidade clara para vocês receberem muito mais avaliações 5 estrelas toda semana.\n\nCom a nossa Placa NFC de balcão, basta o cliente satisfeito encostar o celular na saída para avaliar na hora — sem baixar nada e sem precisar procurar no Google.\n\nPosso te mostrar em 30 segundos como ficaria a placa com a logo de ${name}?`;
}

export function buildFollowupPresetMessage(vars: {
  empresa: string;
  cidade?: string;
  hasWebsite?: boolean;
}): string {
  const name = vars.empresa || 'sua empresa';
  const gmbNote = vars.hasWebsite
    ? 'também deixei separado um diagnóstico rápido do Google Meu Negócio de vocês'
    : 'inclusive vi que vocês ainda estão sem site no Google Maps e preparei uma dica rápida para atrair mais clientes sem custo de anúncio';
  return `Olá! Passando rapidamente para retomar nossa conversa sobre a Placa NFC de avaliação no Google para ${name}.\n\nSe fizer sentido, ${gmbNote}. Posso te enviar uma prévia da arte com a logo de ${name} ainda hoje?`;
}

export function computeGbpSummary(biz: {
  hasWebsite?: boolean;
  websiteUri?: string;
  hasPhone?: boolean;
  phone?: string;
  hasOpeningHours?: boolean;
  hasEditorialSummary?: boolean;
  photosCount?: number;
  rating?: number;
  userRatingCount?: number;
  gbpScore?: number;
  gbpGaps?: string[];
}) {
  const hasWebsite = Boolean(biz.hasWebsite || (biz.websiteUri && biz.websiteUri.trim()));
  const hasPhone = Boolean(biz.hasPhone || (biz.phone && biz.phone.trim()));
  const count = Number(biz.userRatingCount || 0);
  const rating = Number(biz.rating || 0);
  const photosCount = typeof biz.photosCount === 'number' ? biz.photosCount : undefined;

  if (typeof biz.gbpScore === 'number' && Array.isArray(biz.gbpGaps)) {
    return {
      hasWebsite,
      hasPhone,
      hasOpeningHours: biz.hasOpeningHours,
      hasEditorialSummary: biz.hasEditorialSummary,
      photosCount,
      gbpScore: biz.gbpScore,
      gbpGaps: biz.gbpGaps,
    };
  }

  let score = 0;
  const gaps: string[] = [];

  if (hasWebsite) score += 25;
  else gaps.push('Sem site oficial vinculado na ficha');

  if (hasPhone) score += 20;
  else gaps.push('Telefone comercial ausente na ficha');

  if (biz.hasOpeningHours === true) score += 20;
  else if (biz.hasOpeningHours === false) gaps.push('Horário de funcionamento não cadastrado');
  else score += 10;

  if (typeof photosCount === 'number') {
    if (photosCount >= 5) score += 15;
    else {
      score += photosCount > 0 ? 6 : 0;
      gaps.push(
        photosCount === 0
          ? 'Sem fotos cadastradas na ficha do Google'
          : `Poucas fotos publicadas (${photosCount})`
      );
    }
  } else {
    score += 8;
  }

  if (count >= 50 && rating >= 4.3) score += 20;
  else if (count >= 20) score += 12;
  else {
    score += count > 0 ? 5 : 0;
    gaps.push(`Volume baixo de avaliações (${count}) para destacar no Google Maps`);
  }

  return {
    hasWebsite,
    hasPhone,
    hasOpeningHours: biz.hasOpeningHours,
    hasEditorialSummary: biz.hasEditorialSummary,
    photosCount,
    gbpScore: Math.max(0, Math.min(100, Math.round(score))),
    gbpGaps: gaps,
  };
}

export function formatAppError(err: unknown, fallback = 'Ocorreu um erro inesperado.'): string {
  if (!err) return fallback;
  const raw = err instanceof Error ? err.message : String(err);
  if (!raw) return fallback;

  if (raw.startsWith('{') && raw.includes('"error"')) {
    try {
      const parsed = JSON.parse(raw) as { error?: string; operationType?: string; path?: string };
      if (parsed?.error) {
        if (parsed.error.includes('PERMISSION_DENIED') || parsed.error.includes('Missing or insufficient permissions')) {
          return 'Permissão negada ao gravar os dados. Verifique sua sessão Google e tente novamente.';
        }
        return parsed.error;
      }
    } catch {
      // ignore JSON parse failure
    }
  }

  if (raw.includes('PERMISSION_DENIED') || raw.includes('Missing or insufficient permissions')) {
    return 'Permissão negada no banco de dados. Recarregue a página ou faça login novamente.';
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('Quota exceeded')) {
    return 'Limite temporário de consultas atingido. Aguarde alguns instantes.';
  }
  if (raw.includes('Unexpected token') && raw.includes('<!doctype')) {
    return 'A resposta do servidor não veio em formato JSON. Aguarde alguns segundos ou recarregue a página.';
  }
  return raw;
}

export async function safeFetchJson<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit,
  fallbackError = 'Erro ao comunicar com o servidor.'
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, init);
  const rawText = await res.text();
  const trimmed = rawText.trim();

  let parsed: unknown = null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      parsed = null;
    }
  }

  if (parsed === null) {
    const looksLikeHtml =
      trimmed.startsWith('<!') || trimmed.startsWith('<html') || trimmed.startsWith('<HTML');
    if (looksLikeHtml) {
      throw new Error(
        `A rota ${url} retornou uma página HTML em vez de JSON (HTTP ${res.status}). O servidor pode estar reiniciando — tente novamente em alguns segundos.`
      );
    }
    if (!res.ok) {
      throw new Error(trimmed ? `${fallbackError} (${res.status}): ${trimmed.slice(0, 140)}` : `${fallbackError} (HTTP ${res.status})`);
    }
    throw new Error(`${fallbackError} Resposta inesperada do servidor.`);
  }

  const obj = parsed as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      typeof obj.error === 'string' && obj.error.trim()
        ? obj.error
        : `${fallbackError} (HTTP ${res.status})`;
    const err = new Error(msg) as Error & { statusCode?: number };
    err.statusCode = res.status;
    throw err;
  }

  return { status: res.status, data: parsed as T };
}

export function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  if (!encoded) return points;
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b = 0;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

export function formatDistanceMeters(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return '0 m';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

export function formatDurationSeconds(durationStr: string): string {
  const secs = parseInt(String(durationStr || '0').replace(/s$/, ''), 10);
  if (!Number.isFinite(secs) || secs <= 0) return '0 min';
  const totalMins = Math.max(1, Math.round(secs / 60));
  if (totalMins < 60) return `${totalMins} min`;
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

export function getOpportunityMeta(level: OpportunityLevel): {
  label: string;
  shortLabel: string;
  textColor: string;
  barColor: string;
  markerColor: string;
} {
  if (level === 'alta') {
    return {
      label: 'Alta oportunidade',
      shortLabel: 'Alta',
      textColor: 'text-[#19C37D]',
      barColor: 'bg-[#19C37D]',
      markerColor: '#19C37D',
    };
  }
  if (level === 'media') {
    return {
      label: 'Média oportunidade',
      shortLabel: 'Média',
      textColor: 'text-amber-400',
      barColor: 'bg-amber-400',
      markerColor: '#F59E0B',
    };
  }
  return {
    label: 'Baixa oportunidade',
    shortLabel: 'Baixa',
    textColor: 'text-[#929BAA]',
    barColor: 'bg-[#929BAA]',
    markerColor: '#64748B',
  };
}

export function getStageLabel(stage: PipelineStage): string {
  const map: Record<PipelineStage, string> = {
    novo_lead: 'Novo lead',
    nao_contatado: 'Ainda não contatado',
    primeiro_contato: 'Primeiro contato realizado',
    interessado: 'Interessado',
    em_negociacao: 'Em negociação',
    venda_concluida: 'Venda concluída',
    sem_interesse: 'Sem interesse',
  };
  return map[stage] || stage;
}

export function getPaymentMethodLabel(method: PaymentMethod): string {
  const map: Record<PaymentMethod, string> = {
    pix: 'Pix',
    credito: 'Cartão de Crédito',
    debito: 'Cartão de Débito',
    dinheiro: 'Dinheiro',
    boleto: 'Boleto',
    transferencia: 'Transferência',
  };
  return map[method] || method;
}

export function getPaymentStatusLabel(status: PaymentStatus): string {
  const map: Record<PaymentStatus, string> = {
    pago: 'Pago',
    pendente: 'Pendente',
    cancelado: 'Cancelado',
  };
  return map[status] || status;
}
