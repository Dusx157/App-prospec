import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import net from 'net';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const GMP_ATTRIBUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';

const CATEGORY_TYPE_MAP: Record<string, { includedTypes: string[]; queryPt: string; highFootTraffic: boolean }> = {
  restaurantes: { includedTypes: ['restaurant'], queryPt: 'Restaurantes', highFootTraffic: true },
  lanchonetes: { includedTypes: ['fast_food_restaurant', 'sandwich_shop'], queryPt: 'Lanchonetes', highFootTraffic: true },
  cafeterias: { includedTypes: ['cafe', 'coffee_shop'], queryPt: 'Cafeterias', highFootTraffic: true },
  barbearias: { includedTypes: ['barber_shop'], queryPt: 'Barbearias', highFootTraffic: true },
  saloes_beleza: { includedTypes: ['beauty_salon', 'hair_salon'], queryPt: 'Salões de beleza', highFootTraffic: true },
  clinicas_odontologicas: { includedTypes: ['dentist', 'dental_clinic'], queryPt: 'Clínicas odontológicas', highFootTraffic: true },
  clinicas_medicas: { includedTypes: ['medical_clinic', 'doctor'], queryPt: 'Clínicas médicas', highFootTraffic: true },
  academias: { includedTypes: ['gym', 'fitness_center'], queryPt: 'Academias', highFootTraffic: true },
  oficinas_mecanicas: { includedTypes: ['car_repair', 'auto_repair'], queryPt: 'Oficinas mecânicas', highFootTraffic: true },
  pet_shops: { includedTypes: ['pet_store', 'veterinary_care'], queryPt: 'Pet shops', highFootTraffic: true },
  lojas_roupas: { includedTypes: ['clothing_store'], queryPt: 'Lojas de roupas', highFootTraffic: true },
  mercados: { includedTypes: ['supermarket', 'grocery_store'], queryPt: 'Mercados', highFootTraffic: true },
  hoteis: { includedTypes: ['hotel', 'lodging'], queryPt: 'Hotéis', highFootTraffic: true },
  escolas: { includedTypes: ['school'], queryPt: 'Escolas', highFootTraffic: false },
  outros: { includedTypes: [], queryPt: 'Comércio', highFootTraffic: false },
};

interface PlaceReviewRaw {
  rating?: number;
  publishTime?: string;
  relativePublishTimeDescription?: string;
  text?: { text?: string; languageCode?: string };
  originalText?: { text?: string };
  authorAttribution?: { displayName?: string };
}

interface PlacePhotoRaw {
  name?: string;
  widthPx?: number;
  heightPx?: number;
  authorAttributions?: Array<{ displayName?: string; uri?: string; photoUri?: string }>;
}

interface PlaceRaw {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  reviews?: PlaceReviewRaw[];
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  types?: string[];
  businessStatus?: string;
  regularOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
  };
  editorialSummary?: { text?: string; languageCode?: string };
  photos?: PlacePhotoRaw[];
}

function getMapsApiKey(): string {
  return process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';
}

function extractCityAndState(components?: PlaceRaw['addressComponents']): {
  city: string;
  state: string;
  neighborhood: string;
  postalCode: string;
} {
  if (!components || !Array.isArray(components)) {
    return { city: '', state: '', neighborhood: '', postalCode: '' };
  }
  let city = '';
  let state = '';
  let neighborhood = '';
  let postalCode = '';

  for (const comp of components) {
    const types = comp.types || [];
    if (types.includes('administrative_area_level_2') || types.includes('locality')) {
      if (!city) city = comp.longText || comp.shortText || '';
    }
    if (types.includes('administrative_area_level_1')) {
      state = comp.shortText || comp.longText || '';
    }
    if (types.includes('sublocality_level_1') || types.includes('sublocality') || types.includes('neighborhood')) {
      if (!neighborhood) neighborhood = comp.longText || comp.shortText || '';
    }
    if (types.includes('postal_code')) {
      postalCode = comp.longText || comp.shortText || '';
    }
  }
  return { city, state, neighborhood, postalCode };
}

function formatWhatsappDigits(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function calculateOpportunity(place: PlaceRaw, categoryKey: string) {
  let score = 0;
  const reasons: string[] = [];

  const rating = typeof place.rating === 'number' ? place.rating : 0;
  const count = typeof place.userRatingCount === 'number' ? place.userRatingCount : 0;
  const hasWebsite = Boolean(place.websiteUri && place.websiteUri.trim().length > 0);
  const phone = place.nationalPhoneNumber || place.internationalPhoneNumber || '';
  const hasPhone = phone.trim().length > 0;
  const reviews = Array.isArray(place.reviews) ? place.reviews : [];

  // 1. Average rating analysis
  if (count === 0 || rating === 0) {
    score += 24;
    reasons.push('Perfil sem avaliações suficientes no Google para transmitir confiança inicial.');
  } else if (rating < 3.8) {
    score += 26;
    reasons.push(`Estabelecimento com nota ${rating.toFixed(1)} (abaixo de 3,8 estrelas), indicando espaço relevante para recuperar reputação.`);
  } else if (rating <= 4.2) {
    score += 18;
    reasons.push(`Nota média de ${rating.toFixed(1)} estrelas oferece margem clara para fortalecimento de posicionamento local.`);
  } else if (rating <= 4.6) {
    score += 11;
    reasons.push(`Nota ${rating.toFixed(1)} positiva, com potencial para ampliar o volume de provas sociais.`);
  } else if (count < 45) {
    score += 15;
    reasons.push(`Nota alta (${rating.toFixed(1)}), porém com apenas ${count} avaliações — ideal para consolidar autoridade local.`);
  } else {
    score += 6;
  }

  // 2. Review volume analysis
  if (count > 0 && count < 15) {
    score += 24;
    reasons.push(`Apenas ${count} avaliações registradas — volume muito baixo em relação ao perfil comercial.`);
  } else if (count >= 15 && count < 50) {
    score += 18;
    reasons.push(`Poucas avaliações (${count}) em comparação com concorrentes consolidados da região.`);
  } else if (count >= 50 && count < 150) {
    score += 10;
    reasons.push(`Volume intermediário (${count} avaliações), com espaço para acelerar avaliações recorrentes.`);
  } else if (count >= 150) {
    score += 4;
  }

  // 3. Negative & recent reviews analysis
  const now = Date.now();
  const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;
  let negativeCount = 0;
  let recentNegative = false;
  let positiveCount = 0;

  for (const r of reviews) {
    const rRating = typeof r.rating === 'number' ? r.rating : 0;
    if (rRating > 0 && rRating <= 3) {
      negativeCount += 1;
      if (r.publishTime) {
        const pubTime = Date.parse(r.publishTime);
        if (!Number.isNaN(pubTime) && now - pubTime <= sixtyDaysMs) {
          recentNegative = true;
        }
      }
    } else if (rRating >= 4) {
      positiveCount += 1;
    }
  }

  if (recentNegative) {
    score += 16;
    reasons.push('Possui avaliações negativas recentes que podem influenciar novos clientes.');
  } else if (negativeCount > 0) {
    score += 10;
    reasons.push(`Exibe ${negativeCount} avaliação(ões) crítica(s) entre os comentários públicos recentes.`);
  }

  if (positiveCount > 0) {
    score += 4;
    reasons.push('Conta com avaliações positivas visíveis, demonstrando base de clientes que elogiam quando estimulados.');
  }

  // 4. Digital presence (website)
  if (!hasWebsite) {
    score += 12;
    reasons.push('Não possui site identificado — depende prioritariamente da vitrine do Google Maps.');
  } else {
    score += 4;
  }

  // 5. Contact availability (phone)
  if (hasPhone) {
    score += 12;
    reasons.push('Possui telefone disponível para abordagem comercial imediata.');
  } else {
    reasons.push('Sem telefone cadastrado na ficha pública — requer contato presencial ou via redes sociais.');
  }

  // 6. Category foot traffic fit
  const catMeta = CATEGORY_TYPE_MAP[categoryKey];
  if (!catMeta || catMeta.highFootTraffic) {
    score += 8;
    reasons.push('Segmento com fluxo presencial recorrente no balcão/atendimento.');
  }

  const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
  const opportunityLevel: 'baixa' | 'media' | 'alta' =
    boundedScore >= 70 ? 'alta' : boundedScore >= 40 ? 'media' : 'baixa';

  return {
    opportunityScore: boundedScore,
    opportunityLevel,
    opportunityReasons: reasons.slice(0, 8),
  };
}

function computeGbpAudit(place: PlaceRaw, hasWebsite: boolean, hasPhone: boolean) {
  const photosCount = Array.isArray(place.photos) ? place.photos.length : 0;
  const weekdayDescriptions = place.regularOpeningHours?.weekdayDescriptions || [];
  const hasOpeningHours = weekdayDescriptions.length > 0;
  const openingHoursSummary = hasOpeningHours
    ? weekdayDescriptions.slice(0, 7).join(' · ').slice(0, 400)
    : '';
  const editorialText = (place.editorialSummary?.text || '').trim();
  const hasEditorialSummary = editorialText.length > 0;
  const count = typeof place.userRatingCount === 'number' ? place.userRatingCount : 0;
  const rating = typeof place.rating === 'number' ? place.rating : 0;

  let gbpScore = 0;
  const gbpGaps: string[] = [];

  if (hasWebsite) {
    gbpScore += 22;
  } else {
    gbpGaps.push('Sem site oficial vinculado na ficha');
  }

  if (hasOpeningHours) {
    gbpScore += 18;
  } else {
    gbpGaps.push('Horário de funcionamento não cadastrado');
  }

  if (hasPhone) {
    gbpScore += 15;
  } else {
    gbpGaps.push('Sem telefone visível para contato');
  }

  if (photosCount >= 8) {
    gbpScore += 15;
  } else if (photosCount >= 3) {
    gbpScore += 9;
    gbpGaps.push(`Galeria rasa no perfil (${photosCount} fotos disponíveis)`);
  } else {
    gbpScore += photosCount > 0 ? 4 : 0;
    gbpGaps.push(
      photosCount === 0
        ? 'Nenhuma foto publicada na ficha do Google'
        : `Apenas ${photosCount} foto(s) na ficha — baixa atratividade visual`
    );
  }

  if (hasEditorialSummary) {
    gbpScore += 10;
  } else {
    gbpGaps.push('Sem descrição editorial configurada no perfil');
  }

  if (count >= 50 && rating >= 4.3) {
    gbpScore += 20;
  } else if (count >= 20) {
    gbpScore += 12;
    if (rating < 4.3) {
      gbpGaps.push(`Nota média (${rating.toFixed(1)}★) abaixo do ideal para topo local`);
    }
  } else {
    gbpScore += count > 0 ? 5 : 0;
    gbpGaps.push(`Poucas avaliações (${count}) para ranquear bem no Google Maps`);
  }

  return {
    photosCount,
    hasOpeningHours,
    hasEditorialSummary,
    editorialSummary: editorialText.slice(0, 500),
    openingHoursSummary,
    gbpScore: Math.max(0, Math.min(100, Math.round(gbpScore))),
    gbpGaps: gbpGaps.slice(0, 8),
  };
}

function mapPlaceToBusiness(
  place: PlaceRaw,
  fallbackCity: string,
  fallbackState: string,
  categoryLabel: string,
  categoryKey: string
) {
  const { city, state, neighborhood, postalCode } = extractCityAndState(place.addressComponents);
  const phone = place.nationalPhoneNumber || place.internationalPhoneNumber || '';
  const whatsapp = formatWhatsappDigits(place.internationalPhoneNumber || place.nationalPhoneNumber);
  const scoring = calculateOpportunity(place, categoryKey);
  const hasWebsite = Boolean(place.websiteUri && place.websiteUri.trim().length > 0);
  const hasPhone = Boolean(phone.trim().length > 0);
  const gbpAudit = computeGbpAudit(place, hasWebsite, hasPhone);

  const reviews = (place.reviews || []).slice(0, 5).map((r) => ({
    author: r.authorAttribution?.displayName || 'Cliente Google',
    rating: r.rating || 0,
    relativeTime: r.relativePublishTimeDescription || '',
    publishTime: r.publishTime || '',
    text: (r.text?.text || r.originalText?.text || '').slice(0, 500),
  }));

  return {
    placeId: place.id || '',
    name: place.displayName?.text || 'Estabelecimento sem nome',
    category: place.primaryTypeDisplayName?.text || categoryLabel || 'Comércio',
    categoryKey,
    address: place.formattedAddress || place.shortFormattedAddress || '',
    city: city || fallbackCity || '',
    state: state || fallbackState || '',
    neighborhood,
    postalCode,
    lat: place.location?.latitude ?? 0,
    lng: place.location?.longitude ?? 0,
    rating: typeof place.rating === 'number' ? place.rating : 0,
    userRatingCount: typeof place.userRatingCount === 'number' ? place.userRatingCount : 0,
    reviews,
    phone,
    whatsapp,
    websiteUri: place.websiteUri || '',
    googleMapsUri: place.googleMapsUri || (place.id ? `https://www.google.com/maps/place/?q=place_id:${place.id}` : ''),
    instagram: '',
    email: '',
    hasWebsite,
    hasPhone,
    ...gbpAudit,
    ...scoring,
  };
}

// SSRF protection for website enrichment
function isPrivateIpOrHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal') ||
    lower === 'metadata.google.internal'
  ) {
    return true;
  }
  const ipType = net.isIP(lower);
  if (ipType === 4) {
    const parts = lower.split('.').map(Number);
    if (
      parts[0] === 10 ||
      parts[0] === 127 ||
      parts[0] === 0 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168)
    ) {
      return true;
    }
  }
  if (ipType === 6) {
    if (lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) {
      return true;
    }
  }
  return false;
}

const SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.shortFormattedAddress',
  'places.addressComponents',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.reviews',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.googleMapsUri',
  'places.primaryType',
  'places.primaryTypeDisplayName',
  'places.businessStatus',
  'places.regularOpeningHours',
  'places.editorialSummary',
  'places.photos',
].join(',');

const TEXT_SEARCH_FIELD_MASK = `${SEARCH_FIELD_MASK},nextPageToken`;

const DETAILS_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'shortFormattedAddress',
  'addressComponents',
  'location',
  'rating',
  'userRatingCount',
  'reviews',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'googleMapsUri',
  'primaryType',
  'primaryTypeDisplayName',
  'businessStatus',
  'regularOpeningHours',
  'editorialSummary',
  'photos',
].join(',');

// Simple in-memory rate-limit guard per IP to prevent accidental cost spikes
const searchRateMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, limitPerMin = 30): boolean {
  const now = Date.now();
  const entry = searchRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    searchRateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= limitPerMin) return false;
  entry.count += 1;
  return true;
}

async function geocodeLocation(
  apiKey: string,
  params: { city?: string; state?: string; neighborhood?: string; postalCode?: string }
): Promise<{ lat: number; lng: number } | null> {
  const parts = [params.neighborhood, params.city, params.state, params.postalCode, 'Brasil']
    .map((p) => (p || '').trim())
    .filter(Boolean);
  if (parts.length <= 1) return null;

  const addressQuery = encodeURIComponent(parts.join(', '));
  const url = `https://geocode.googleapis.com/v4/geocode/address/${addressQuery}?languageCode=pt-BR&regionCode=BR`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'results.location,results.formattedAddress',
      'X-Goog-Maps-Solution-ID': GMP_ATTRIBUTION_ID,
    },
  });

  if (res.status === 429) {
    const err = new Error('RESOURCE_EXHAUSTED');
    (err as Error & { statusCode?: number }).statusCode = 429;
    throw err;
  }

  if (!res.ok) {
    return null;
  }

  const data = (await res.json()) as { results?: Array<{ location?: { latitude?: number; longitude?: number } }> };
  const loc = data.results?.[0]?.location;
  if (typeof loc?.latitude === 'number' && typeof loc?.longitude === 'number') {
    return { lat: loc.latitude, lng: loc.longitude };
  }
  return null;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'nfc-prospect' });
  });

  // Exposes Maps JS API key to client <APIProvider> without hardcoding
  app.get('/api/maps/config', (_req: Request, res: Response) => {
    const apiKey = getMapsApiKey();
    res.json({
      configured: Boolean(apiKey),
      apiKey,
    });
  });

  // Radar de Empresas: Geocoding + Places API (New) Text Search or Nearby Search
  app.post('/api/places/search', async (req: Request, res: Response) => {
    try {
      const clientIp = req.ip || 'local';
      if (!checkRateLimit(clientIp, 40)) {
        res.status(429).json({
          error: 'Limite temporário de consultas atingido. Aguarde alguns segundos antes de pesquisar novamente.',
        });
        return;
      }

      const apiKey = getMapsApiKey();
      if (!apiKey) {
        res.status(503).json({
          error: 'Chave do Google Maps Platform não configurada no ambiente do servidor.',
        });
        return;
      }

      const {
        city = '',
        state = '',
        neighborhood = '',
        postalCode = '',
        radiusKm = 10,
        categoryKey = 'barbearias',
        customQuery = '',
        maxResults = 20,
        searchMode = 'text',
      } = req.body || {};

      const boundedRadiusMeters = Math.max(500, Math.min(50000, Number(radiusKm || 10) * 1000));
      const desiredTotal = Math.max(1, Math.min(60, Number(maxResults || 20)));
      const catInfo = CATEGORY_TYPE_MAP[categoryKey] || CATEGORY_TYPE_MAP.outros;
      const categoryLabel = customQuery?.trim() ? customQuery.trim() : catInfo.queryPt;

      const center = await geocodeLocation(apiKey, { city, state, neighborhood, postalCode });

      const collected: PlaceRaw[] = [];
      let nextPageToken: string | undefined;

      if (searchMode === 'nearby' && center && catInfo.includedTypes.length > 0 && !customQuery?.trim()) {
        // Nearby Search (New) returns up to 20 per request
        const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': SEARCH_FIELD_MASK,
            'X-Goog-Maps-Solution-ID': GMP_ATTRIBUTION_ID,
          },
          body: JSON.stringify({
            includedTypes: catInfo.includedTypes,
            maxResultCount: Math.min(20, desiredTotal),
            languageCode: 'pt-BR',
            regionCode: 'BR',
            locationRestriction: {
              circle: {
                center: { latitude: center.lat, longitude: center.lng },
                radius: boundedRadiusMeters,
              },
            },
          }),
        });

        if (response.status === 429) {
          res.status(429).json({ error: 'RESOURCE_EXHAUSTED: Cota da Places API excedida.' });
          return;
        }
        if (!response.ok) {
          const text = await response.text();
          res.status(response.status).json({ error: `Erro na Places API (${response.status}): ${text}` });
          return;
        }

        const data = (await response.json()) as { places?: PlaceRaw[] };
        if (Array.isArray(data.places)) {
          collected.push(...data.places);
        }
      } else {
        // Text Search (New) with optional pagination up to desiredTotal (max 60)
        const locationText = [neighborhood, city, state, postalCode].map((s) => (s || '').trim()).filter(Boolean).join(', ');
        const queryPrefix = customQuery?.trim() ? customQuery.trim() : catInfo.queryPt;
        const textQuery = locationText ? `${queryPrefix} em ${locationText}` : queryPrefix;

        const maxPages = Math.ceil(desiredTotal / 20);
        for (let page = 0; page < maxPages; page++) {
          const pageSize = Math.min(20, desiredTotal - collected.length);
          if (pageSize <= 0) break;

          const bodyPayload: Record<string, unknown> = {
            textQuery,
            pageSize,
            languageCode: 'pt-BR',
            regionCode: 'BR',
          };

          if (catInfo.includedTypes.length === 1 && !customQuery?.trim()) {
            bodyPayload.includedType = catInfo.includedTypes[0];
          }

          if (center) {
            bodyPayload.locationBias = {
              circle: {
                center: { latitude: center.lat, longitude: center.lng },
                radius: boundedRadiusMeters,
              },
            };
          }

          if (nextPageToken) {
            bodyPayload.pageToken = nextPageToken;
          }

          const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask': TEXT_SEARCH_FIELD_MASK,
              'X-Goog-Maps-Solution-ID': GMP_ATTRIBUTION_ID,
            },
            body: JSON.stringify(bodyPayload),
          });

          if (response.status === 429) {
            if (collected.length > 0) break;
            res.status(429).json({ error: 'RESOURCE_EXHAUSTED: Cota da Places API excedida.' });
            return;
          }

          if (!response.ok) {
            const text = await response.text();
            if (collected.length > 0) break;
            res.status(response.status).json({ error: `Erro na Places API (${response.status}): ${text}` });
            return;
          }

          const data = (await response.json()) as { places?: PlaceRaw[]; nextPageToken?: string };
          if (Array.isArray(data.places) && data.places.length > 0) {
            collected.push(...data.places);
          }

          if (!data.nextPageToken || collected.length >= desiredTotal) {
            break;
          }
          nextPageToken = data.nextPageToken;
          // Brief pause recommended before requesting nextPageToken
          await new Promise((r) => setTimeout(r, 250));
        }
      }

      // Deduplicate by placeId
      const seen = new Set<string>();
      const businesses = collected
        .filter((p) => {
          if (!p.id || seen.has(p.id)) return false;
          seen.add(p.id);
          return p.businessStatus !== 'CLOSED_PERMANENTLY';
        })
        .slice(0, desiredTotal)
        .map((p) => mapPlaceToBusiness(p, city, state, categoryLabel, categoryKey));

      res.json({
        center: center || (businesses[0] ? { lat: businesses[0].lat, lng: businesses[0].lng } : { lat: -23.5505, lng: -46.6333 }),
        totalFound: businesses.length,
        businesses,
      });
    } catch (error) {
      const err = error as Error & { statusCode?: number };
      if (err.statusCode === 429 || err.message.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({ error: 'RESOURCE_EXHAUSTED: Cota da Google Maps Platform excedida.' });
        return;
      }
      console.error('Places search error:', error);
      res.status(500).json({ error: err.message || 'Erro interno ao buscar estabelecimentos.' });
    }
  });

  // Place Photos (New) fresh facade lookup (no photo names cached in DB per ToS §3.2.3(b))
  app.get('/api/places/:placeId/photo', async (req: Request, res: Response) => {
    try {
      const apiKey = getMapsApiKey();
      if (!apiKey) {
        res.status(503).json({ error: 'Chave do Google Maps Platform não configurada.' });
        return;
      }

      const rawId = String(req.params.placeId || '').trim();
      if (!/^[a-zA-Z0-9_\-]+$/.test(rawId)) {
        res.status(400).json({ error: 'Place ID inválido.' });
        return;
      }

      const detailsUrl = `https://places.googleapis.com/v1/places/${rawId}?languageCode=pt-BR&regionCode=BR`;
      const detailsRes = await fetch(detailsUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'id,photos',
          'X-Goog-Maps-Solution-ID': GMP_ATTRIBUTION_ID,
        },
      });

      if (detailsRes.status === 429) {
        res.status(429).json({ error: 'RESOURCE_EXHAUSTED: Cota da Places API excedida.' });
        return;
      }
      if (!detailsRes.ok) {
        res.json({ photos: [] });
        return;
      }

      const placeData = (await detailsRes.json()) as { photos?: PlacePhotoRaw[] };
      const photoRefs = Array.isArray(placeData.photos) ? placeData.photos.slice(0, 3) : [];
      if (photoRefs.length === 0) {
        res.json({ photos: [] });
        return;
      }

      const resolved = await Promise.all(
        photoRefs.map(async (photo) => {
          if (!photo.name) return null;
          const mediaUrl = `https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=900&maxHeightPx=600&skipHttpRedirect=true`;
          const mediaRes = await fetch(mediaUrl, {
            method: 'GET',
            headers: {
              'X-Goog-Api-Key': apiKey,
              'X-Goog-Maps-Solution-ID': GMP_ATTRIBUTION_ID,
            },
          });
          if (!mediaRes.ok) return null;
          const mediaData = (await mediaRes.json()) as { photoUri?: string };
          if (!mediaData.photoUri) return null;
          return {
            photoUri: mediaData.photoUri,
            attributions: (photo.authorAttributions || []).map((a) => ({
              displayName: a.displayName || 'Colaborador Google Maps',
              uri: a.uri || '',
            })),
          };
        })
      );

      res.json({
        photos: resolved.filter(Boolean),
      });
    } catch (error) {
      console.error('Place photo error:', error);
      res.status(500).json({ error: 'Erro ao carregar foto do estabelecimento.' });
    }
  });

  // Place Details refresh endpoint
  app.get('/api/places/:placeId', async (req: Request, res: Response) => {
    try {
      const apiKey = getMapsApiKey();
      if (!apiKey) {
        res.status(503).json({ error: 'Chave do Google Maps Platform não configurada.' });
        return;
      }

      const rawId = String(req.params.placeId || '').trim();
      if (!/^[a-zA-Z0-9_\-]+$/.test(rawId)) {
        res.status(400).json({ error: 'Place ID inválido.' });
        return;
      }

      const url = `https://places.googleapis.com/v1/places/${rawId}?languageCode=pt-BR&regionCode=BR`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': DETAILS_FIELD_MASK,
          'X-Goog-Maps-Solution-ID': GMP_ATTRIBUTION_ID,
        },
      });

      if (response.status === 429) {
        res.status(429).json({ error: 'RESOURCE_EXHAUSTED: Cota da Places API excedida.' });
        return;
      }
      if (!response.ok) {
        const text = await response.text();
        res.status(response.status).json({ error: `Falha ao atualizar Place Details: ${text}` });
        return;
      }

      const place = (await response.json()) as PlaceRaw;
      const mapped = mapPlaceToBusiness(place, '', '', place.primaryTypeDisplayName?.text || 'Comércio', 'outros');
      res.json({ business: mapped });
    } catch (error) {
      console.error('Place details error:', error);
      res.status(500).json({ error: 'Erro ao atualizar detalhes do estabelecimento.' });
    }
  });

  // Google Maps Routes API: Multi-stop walking / driving route planner
  app.post('/api/routes/compute', async (req: Request, res: Response) => {
    try {
      const apiKey = getMapsApiKey();
      if (!apiKey) {
        res.status(503).json({ error: 'Chave do Google Maps Platform não configurada.' });
        return;
      }

      interface StopInput {
        lat?: number;
        lng?: number;
        address?: string;
        placeId?: string;
      }

      const {
        origin,
        destination,
        intermediates = [],
        travelMode = 'WALK',
        optimizeWaypointOrder = false,
      } = (req.body || {}) as {
        origin?: StopInput;
        destination?: StopInput;
        intermediates?: StopInput[];
        travelMode?: 'WALK' | 'DRIVE';
        optimizeWaypointOrder?: boolean;
      };

      const toWaypoint = (stop?: StopInput) => {
        if (!stop) return null;
        if (typeof stop.lat === 'number' && typeof stop.lng === 'number' && (stop.lat !== 0 || stop.lng !== 0)) {
          return { location: { latLng: { latitude: stop.lat, longitude: stop.lng } } };
        }
        if (stop.placeId && /^[a-zA-Z0-9_\-]+$/.test(stop.placeId)) {
          return { placeId: stop.placeId };
        }
        if (stop.address && stop.address.trim()) {
          return { address: stop.address.trim() };
        }
        return null;
      };

      const originWp = toWaypoint(origin);
      const destWp = toWaypoint(destination);
      const interWps = Array.isArray(intermediates)
        ? intermediates.slice(0, 25).map(toWaypoint).filter(Boolean)
        : [];

      if (!originWp || !destWp) {
        res.status(400).json({ error: 'Informe uma origem e um destino válidos para traçar a rota.' });
        return;
      }

      const mode: 'WALK' | 'DRIVE' = travelMode === 'DRIVE' ? 'DRIVE' : 'WALK';
      const shouldOptimize = Boolean(optimizeWaypointOrder) && interWps.length > 1;

      const fieldMaskParts = [
        'routes.duration',
        'routes.distanceMeters',
        'routes.polyline.encodedPolyline',
        'routes.legs.duration',
        'routes.legs.distanceMeters',
        'routes.legs.startLocation',
        'routes.legs.endLocation',
        'routes.legs.steps.navigationInstruction',
        'routes.legs.steps.distanceMeters',
        'routes.legs.steps.staticDuration',
        'routes.legs.steps.startLocation',
        'routes.legs.steps.endLocation',
      ];
      if (shouldOptimize) {
        fieldMaskParts.push('routes.optimizedIntermediateWaypointIndex');
      }

      const bodyPayload: Record<string, unknown> = {
        origin: originWp,
        destination: destWp,
        travelMode: mode,
        languageCode: 'pt-BR',
        units: 'METRIC',
      };

      if (interWps.length > 0) {
        bodyPayload.intermediates = interWps;
      }
      if (shouldOptimize) {
        bodyPayload.optimizeWaypointOrder = true;
      }
      // Routes API rule: NEVER send routingPreference when travelMode is WALK
      if (mode === 'DRIVE') {
        bodyPayload.routingPreference = 'TRAFFIC_AWARE';
      }

      const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': fieldMaskParts.join(','),
          'X-Goog-Maps-Solution-ID': GMP_ATTRIBUTION_ID,
        },
        body: JSON.stringify(bodyPayload),
      });

      if (response.status === 429) {
        res.status(429).json({ error: 'RESOURCE_EXHAUSTED: Cota da Routes API excedida.' });
        return;
      }

      if (!response.ok) {
        const errText = await response.text();
        res.status(response.status).json({
          error: `Não foi possível calcular o trajeto (${response.status}). Verifique os endereços informados.`,
          details: errText,
        });
        return;
      }

      const data = (await response.json()) as {
        routes?: Array<{
          duration?: string;
          distanceMeters?: number;
          polyline?: { encodedPolyline?: string };
          optimizedIntermediateWaypointIndex?: number[];
          legs?: Array<{
            duration?: string;
            distanceMeters?: number;
            startLocation?: { latLng?: { latitude: number; longitude: number } };
            endLocation?: { latLng?: { latitude: number; longitude: number } };
            steps?: Array<{
              distanceMeters?: number;
              staticDuration?: string;
              navigationInstruction?: { instructions?: string; maneuver?: string };
            }>;
          }>;
        }>;
      };

      const route = data.routes?.[0];
      if (!route || !route.polyline?.encodedPolyline) {
        res.status(404).json({
          error: 'Nenhuma rota encontrada entre os pontos selecionados.',
        });
        return;
      }

      res.json({
        travelMode: mode,
        distanceMeters: route.distanceMeters || 0,
        duration: route.duration || '0s',
        encodedPolyline: route.polyline.encodedPolyline,
        optimizedIntermediateWaypointIndex: route.optimizedIntermediateWaypointIndex || null,
        legs: (route.legs || []).map((leg) => ({
          distanceMeters: leg.distanceMeters || 0,
          duration: leg.duration || '0s',
          startLocation: leg.startLocation?.latLng || null,
          endLocation: leg.endLocation?.latLng || null,
          steps: (leg.steps || []).map((step) => ({
            distanceMeters: step.distanceMeters || 0,
            duration: step.staticDuration || '0s',
            instruction: step.navigationInstruction?.instructions || '',
            maneuver: step.navigationInstruction?.maneuver || '',
          })),
        })),
      });
    } catch (error) {
      console.error('Routes compute error:', error);
      res.status(500).json({ error: 'Erro interno ao calcular rota.' });
    }
  });

  // Public official website enrichment (Instagram + Contact Email) — strictly official website only, no scraping of Maps
  app.post('/api/enrich', async (req: Request, res: Response) => {
    try {
      const { websiteUri } = req.body || {};
      if (!websiteUri || typeof websiteUri !== 'string') {
        res.json({ instagram: '', email: '', source: 'none' });
        return;
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(websiteUri.startsWith('http') ? websiteUri : `https://${websiteUri}`);
      } catch {
        res.status(400).json({ error: 'URL do site oficial inválida.' });
        return;
      }

      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        res.status(400).json({ error: 'Protocolo não permitido.' });
        return;
      }
      if (isPrivateIpOrHost(parsedUrl.hostname)) {
        res.status(403).json({ error: 'Endereço não permitido.' });
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5500);

      let html = '';
      try {
        const siteRes = await fetch(parsedUrl.toString(), {
          method: 'GET',
          signal: controller.signal,
          redirect: 'follow',
          headers: {
            'User-Agent': 'NFCProspectBot/1.0 (+public-metadata-lookup)',
            Accept: 'text/html,application/xhtml+xml',
          },
        });
        if (siteRes.ok) {
          const text = await siteRes.text();
          html = text.slice(0, 260_000);
        }
      } catch {
        // Website offline or blocked; return empty gracefully
      } finally {
        clearTimeout(timeout);
      }

      if (!html) {
        res.json({ instagram: '', email: '', source: 'unreachable' });
        return;
      }

      // Extract Instagram URL from official site links
      const igMatches = html.match(/https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]{2,40})\/?/gi) || [];
      const ignoredIgPaths = new Set(['p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'share', 'tv']);
      let instagram = '';
      for (const rawLink of igMatches) {
        try {
          const u = new URL(rawLink);
          const slug = u.pathname.replace(/^\/+|\/+$/g, '').split('/')[0];
          if (slug && !ignoredIgPaths.has(slug.toLowerCase())) {
            instagram = `https://instagram.com/${slug}`;
            break;
          }
        } catch {
          // ignore malformed match
        }
      }

      // Extract email (prefer mailto:, fallback to standard contact email regex)
      let email = '';
      const mailtoMatch = html.match(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
      if (mailtoMatch && mailtoMatch[1]) {
        email = mailtoMatch[1].toLowerCase();
      } else {
        const emailMatches = html.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [];
        const filtered = emailMatches.filter((e) => {
          const lower = e.toLowerCase();
          return (
            !lower.endsWith('.png') &&
            !lower.endsWith('.jpg') &&
            !lower.endsWith('.svg') &&
            !lower.endsWith('.webp') &&
            !lower.includes('example.com') &&
            !lower.includes('sentry.io') &&
            !lower.includes('wixpress.com')
          );
        });
        if (filtered.length > 0) {
          email = filtered[0].toLowerCase();
        }
      }

      res.json({
        instagram,
        email,
        source: 'official_website',
      });
    } catch (error) {
      console.error('Enrich error:', error);
      res.status(500).json({ error: 'Não foi possível consultar o site oficial.' });
    }
  });

  // Gemini AI Commercial Analysis (Server-Side Only with Retry + Fallback)
  app.post('/api/gemini/analyze', async (req: Request, res: Response) => {
    try {
      const apiKey = (process.env.GEMINI_API_KEY || '').trim();
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        res.status(503).json({
          error: 'Chave do Gemini não configurada no servidor. Verifique GEMINI_API_KEY em Settings > Secrets.',
        });
        return;
      }

      const {
        name,
        category,
        city,
        rating,
        userRatingCount,
        opportunityScore,
        opportunityLevel,
        opportunityReasons,
        hasWebsite,
        hasPhone,
        hasOpeningHours,
        photosCount,
        gbpScore,
        gbpGaps,
        reviews,
      } = req.body || {};

      if (!name) {
        res.status(400).json({ error: 'Dados do estabelecimento são obrigatórios.' });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const reviewsSnippet = Array.isArray(reviews) && reviews.length > 0
        ? reviews
            .slice(0, 3)
            .map((r: { rating?: number; text?: string }) => `- Nota ${r.rating}: "${(r.text || '').slice(0, 180)}"`)
            .join('\n')
        : 'Sem comentários recentes detalhados.';

      const gbpGapText = Array.isArray(gbpGaps) && gbpGaps.length > 0
        ? gbpGaps.join('; ')
        : 'Perfil básico preenchido, mas pode ganhar escala contínua de provas sociais.';

      const prompt = `Analise este estabelecimento comercial para uma abordagem B2B consultiva em 2 etapas:
1) Porta de entrada: vender placa NFC de avaliação no Google para o balcão/atendimento.
2) Upsell posterior: oferecer otimização completa do Google Meu Negócio (Perfil da Empresa no Google) e presença digital.

Dados do estabelecimento:
- Nome: ${name}
- Categoria: ${category || 'Comércio local'}
- Cidade: ${city || 'Brasil'}
- Nota no Google: ${rating || 0} estrelas (${userRatingCount || 0} avaliações)
- Score de oportunidade NFC: ${opportunityScore || 0}/100 (${opportunityLevel || 'media'})
- Saúde estimada do Google Meu Negócio: ${typeof gbpScore === 'number' ? `${gbpScore}/100` : 'não medida'}
- Site próprio na ficha: ${hasWebsite ? 'Sim (possui site)' : 'NÃO POSSUI SITE'}
- Telefone na ficha: ${hasPhone ? 'Sim' : 'Não'}
- Horário cadastrado: ${hasOpeningHours === false ? 'Não identificado' : 'Sim'}
- Fotos na ficha: ${typeof photosCount === 'number' ? photosCount : 'não informado'}
- Pontos observados na ficha: ${gbpGapText}
- Fatores da pontuação: ${(opportunityReasons || []).join('; ')}
- Amostra de avaliações:
${reviewsSnippet}

Entregue uma análise prática, direta e persuasiva em português (3 blocos curtos, sem asteriscos ou markdown excessivo):
1. Raio-X do Google Meu Negócio & Site: explique em 2–3 frases o que está faltando ou pode ser melhorado hoje (site, fotos, avaliações).
2. Argumento da Placa NFC (porta de entrada) + Upsell: como usar a placa NFC para gerar resultados visíveis rápidos no balcão e abrir caminho para vender a gestão/melhoria do Google Meu Negócio depois.
3. Mensagem de WhatsApp pronta e apelativa: 2 a 3 linhas curtas, naturais e impossíveis de ignorar para enviar ao responsável.`;

      const systemInstruction =
        'Você é um especialista sênior em prospecção B2B local e otimização de Google Meu Negócio no Brasil. Escreva com clareza executiva, sem exageros artificiais, focado em conversão real.';

      const attempts: Array<{ model: string; useLowThinking: boolean; delayMs: number }> = [
        { model: 'gemini-4-hydrogen', useLowThinking: true, delayMs: 0 },
        { model: 'gemini-4-hydrogen', useLowThinking: true, delayMs: 650 },
        { model: 'gemini-3.1-flash-lite', useLowThinking: false, delayMs: 250 },
      ];

      let analysisText = '';
      let usedModel = '';
      let lastError: unknown = null;

      for (const attempt of attempts) {
        if (attempt.delayMs > 0) {
          await new Promise((r) => setTimeout(r, attempt.delayMs));
        }
        try {
          const response = await ai.models.generateContent({
            model: attempt.model,
            contents: prompt,
            config: {
              systemInstruction,
              ...(attempt.useLowThinking
                ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                : {}),
            },
          });
          const text = (response.text || '').trim();
          if (text) {
            analysisText = text;
            usedModel = attempt.model;
            break;
          }
        } catch (err) {
          lastError = err;
          console.warn(`Gemini attempt failed (${attempt.model}):`, err instanceof Error ? err.message : String(err));
        }
      }

      if (!analysisText) {
        const errMsg = lastError instanceof Error ? lastError.message : String(lastError || '');
        if (errMsg.includes('API_KEY_INVALID') || errMsg.includes('PERMISSION_DENIED') || errMsg.includes('403')) {
          res.status(403).json({
            error: 'Chave da API Gemini inválida ou sem permissão. Verifique GEMINI_API_KEY em Settings > Secrets.',
          });
          return;
        }
        if (errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('429')) {
          res.status(429).json({
            error: 'Cota da API Gemini atingida temporariamente. Aguarde alguns segundos e tente novamente.',
          });
          return;
        }
        res.status(503).json({
          error: 'O serviço de análise com IA está temporariamente sobrecarregado. Tente novamente em alguns segundos.',
        });
        return;
      }

      res.json({ analysis: analysisText, model: usedModel });
    } catch (error) {
      console.error('Gemini analyze error:', error);
      res.status(500).json({ error: 'Não foi possível gerar a análise comercial agora.' });
    }
  });

  // Batch AI personalized WhatsApp outreach generator (up to 12 prospects per batch)
  app.post('/api/gemini/batch-messages', async (req: Request, res: Response) => {
    try {
      const apiKey = (process.env.GEMINI_API_KEY || '').trim();
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        res.status(503).json({
          error: 'Chave do Gemini não configurada no servidor. Verifique GEMINI_API_KEY em Settings > Secrets.',
        });
        return;
      }

      const {
        items = [],
        mode = 'primeiro_contato',
      } = (req.body || {}) as {
        items?: Array<{
          placeId: string;
          name: string;
          category?: string;
          city?: string;
          rating?: number;
          userRatingCount?: number;
          hasWebsite?: boolean;
          opportunityScore?: number;
        }>;
        mode?: 'primeiro_contato' | 'followup';
      };

      const validItems = Array.isArray(items)
        ? items.filter((it) => it && it.placeId && it.name).slice(0, 12)
        : [];

      if (validItems.length === 0) {
        res.status(400).json({ error: 'Selecione ao menos 1 estabelecimento válido para personalizar.' });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const listSummary = validItems
        .map(
          (it, idx) =>
            `${idx + 1}. placeId="${it.placeId}" | Nome="${it.name}" | Categoria="${it.category || 'Comércio'}" | Cidade="${it.city || 'Brasil'}" | Nota=${typeof it.rating === 'number' ? it.rating.toFixed(1) : '0.0'} | Avaliacoes=${it.userRatingCount || 0} | TemSite=${it.hasWebsite ? 'sim' : 'nao'} | Score=${it.opportunityScore || 0}`
        )
        .join('\n');

      const prompt =
        mode === 'followup'
          ? `Crie mensagens curtas e naturais de FOLLOW-UP no WhatsApp (em português do Brasil) para estes ${validItems.length} estabelecimentos que já receberam um primeiro contato sobre Placa NFC de Avaliação Google.
Regras:
- Cada mensagem deve ter no máximo 3 linhas curtas, tom consultivo, humano e sem parecer robô ou spam.
- Varie a abertura e o gancho entre uma empresa e outra para não ficarem idênticas.
- Se TemSite=nao, cite sutilmente a oportunidade de fortalecer a ficha do Google Meu Negócio e depois ter presença digital própria.
- Sem asteriscos (**), sem hashtags e sem placeholders não preenchidos.

Lista de estabelecimentos:
${listSummary}`
          : `Crie mensagens únicas, persuasivas e naturais de PRIMEIRO CONTATO no WhatsApp (em português do Brasil) para oferecer Placa NFC de Avaliação Google para balcão (porta de entrada) com gancho consultivo de melhoria no Google Meu Negócio.
Regras obrigatórias:
- Cada mensagem deve mencionar o nome real da empresa e usar os dados reais (nota/avaliações ou ausência de site) de forma natural.
- Varie o estilo da abertura entre cada empresa para evitar textos repetitivos.
- Máximo de 3 a 4 linhas curtas, fáceis de ler no celular, terminando com uma pergunta simples de resposta rápida (ex: "Posso te mostrar um modelo pronto?").
- Se TemSite=nao, destaque que eles dependem ainda mais da vitrine do Google Maps.
- Sem markdown (**), sem hashtags e sem placeholders como {empresa}.

Lista de estabelecimentos:
${listSummary}`;

      const systemInstruction =
        'Você é um especialista brasileiro em prospecção B2B via WhatsApp. Escreva mensagens curtas, humanas e personalizadas que parecem digitadas individualmente por um consultor local.';

      const attempts: Array<{ model: string; useLowThinking: boolean; delayMs: number }> = [
        { model: 'gemini-4-hydrogen', useLowThinking: true, delayMs: 0 },
        { model: 'gemini-3.1-flash-lite', useLowThinking: false, delayMs: 300 },
      ];

      let parsedMessages: Array<{ placeId: string; message: string }> = [];
      let usedModel = '';
      let lastError: unknown = null;

      for (const attempt of attempts) {
        if (attempt.delayMs > 0) {
          await new Promise((r) => setTimeout(r, attempt.delayMs));
        }
        try {
          const response = await ai.models.generateContent({
            model: attempt.model,
            contents: prompt,
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  messages: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        placeId: { type: Type.STRING },
                        message: { type: Type.STRING },
                      },
                      required: ['placeId', 'message'],
                    },
                  },
                },
                required: ['messages'],
              },
              ...(attempt.useLowThinking
                ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                : {}),
            },
          });

          const rawJson = (response.text || '').trim();
          if (rawJson) {
            const parsed = JSON.parse(rawJson) as {
              messages?: Array<{ placeId?: string; message?: string }>;
            };
            if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
              parsedMessages = parsed.messages
                .filter((m) => m?.placeId && m?.message)
                .map((m) => ({
                  placeId: String(m.placeId).trim(),
                  message: String(m.message).trim(),
                }));
              usedModel = attempt.model;
              break;
            }
          }
        } catch (err) {
          lastError = err;
          console.warn(
            `Gemini batch attempt failed (${attempt.model}):`,
            err instanceof Error ? err.message : String(err)
          );
        }
      }

      if (parsedMessages.length === 0) {
        const errMsg = lastError instanceof Error ? lastError.message : String(lastError || '');
        if (errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('429')) {
          res.status(429).json({
            error: 'Cota da API Gemini atingida temporariamente. Aguarde alguns segundos e tente novamente.',
          });
          return;
        }
        res.status(503).json({
          error: 'Não foi possível personalizar as mensagens em lote agora. Tente novamente em instantes.',
        });
        return;
      }

      res.json({ messages: parsedMessages, model: usedModel });
    } catch (error) {
      console.error('Gemini batch-messages error:', error);
      res.status(500).json({ error: 'Erro interno ao personalizar mensagens com IA.' });
    }
  });

  // Server-side WhatsApp gateway status (no secrets exposed)
  app.get('/api/whatsapp/status', (_req: Request, res: Response) => {
    const webhookUrl = (process.env.WHATSAPP_WEBHOOK_URL || '').trim();
    res.json({
      webhookConfigured: Boolean(webhookUrl),
    });
  });

  // Server-side WhatsApp webhook dispatch (for Evolution API / Z-API / Make / n8n configured via env)
  app.post('/api/whatsapp/dispatch', async (req: Request, res: Response) => {
    try {
      const webhookUrl = (process.env.WHATSAPP_WEBHOOK_URL || '').trim();
      const webhookToken = (process.env.WHATSAPP_WEBHOOK_TOKEN || '').trim();

      if (!webhookUrl) {
        res.status(501).json({
          error:
            'Webhook de WhatsApp não configurado no servidor (WHATSAPP_WEBHOOK_URL). Utilize o modo Piloto Assistido clicando no botão de envio da fila.',
        });
        return;
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(webhookUrl);
      } catch {
        res.status(500).json({ error: 'WHATSAPP_WEBHOOK_URL configurada no servidor é inválida.' });
        return;
      }

      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        res.status(400).json({ error: 'Protocolo do webhook inválido.' });
        return;
      }
      if (isPrivateIpOrHost(parsedUrl.hostname)) {
        res.status(403).json({ error: 'Destino do webhook não permitido.' });
        return;
      }

      const { phone, message, businessName, placeId } = (req.body || {}) as {
        phone?: string;
        message?: string;
        businessName?: string;
        placeId?: string;
      };

      const digits = formatWhatsappDigits(phone);
      const cleanMsg = String(message || '').trim();

      if (!digits || digits.length < 10) {
        res.status(400).json({ error: 'Número de WhatsApp inválido para disparo automático.' });
        return;
      }
      if (!cleanMsg) {
        res.status(400).json({ error: 'A mensagem não pode estar vazia.' });
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (webhookToken) {
          headers.Authorization = `Bearer ${webhookToken}`;
          headers.apikey = webhookToken;
        }

        const gatewayRes = await fetch(parsedUrl.toString(), {
          method: 'POST',
          signal: controller.signal,
          headers,
          body: JSON.stringify({
            number: digits,
            phone: digits,
            text: cleanMsg,
            message: cleanMsg,
            businessName: businessName || '',
            placeId: placeId || '',
          }),
        });

        if (!gatewayRes.ok) {
          const errBody = await gatewayRes.text().catch(() => '');
          res.status(502).json({
            error: `Gateway retornou HTTP ${gatewayRes.status}${errBody ? `: ${errBody.slice(0, 140)}` : ''}`,
          });
          return;
        }

        res.json({ ok: true, phone: digits });
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      console.error('WhatsApp webhook dispatch error:', error);
      res.status(502).json({
        error: 'Não foi possível conectar ao webhook de WhatsApp configurado.',
      });
    }
  });

  // Never let unmatched /api/* routes or Express body errors fall through to Vite HTML!
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Endpoint da API não encontrado.' });
  });

  app.use(
    '/api',
    (
      err: Error & { status?: number; statusCode?: number },
      _req: Request,
      res: Response,
      _next: express.NextFunction
    ) => {
      const code = err.status || err.statusCode || 500;
      res.status(code).json({
        error: err.message || 'Erro interno no processamento da requisição.',
      });
    }
  );

  // Vite middleware in dev, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NFC Prospect server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
