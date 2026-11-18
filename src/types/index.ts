import type { Timestamp } from 'firebase/firestore';

export type NavSection =
  | 'dashboard'
  | 'radar'
  | 'leads'
  | 'disparos'
  | 'mapa'
  | 'inteligencia'
  | 'pipeline'
  | 'vendas'
  | 'estoque'
  | 'relatorios'
  | 'configuracoes';

export type OpportunityLevel = 'baixa' | 'media' | 'alta';

export type PipelineStage =
  | 'novo_lead'
  | 'nao_contatado'
  | 'primeiro_contato'
  | 'interessado'
  | 'em_negociacao'
  | 'venda_concluida'
  | 'sem_interesse';

export const PIPELINE_COLUMNS: Array<{ id: PipelineStage; label: string; description: string }> = [
  { id: 'novo_lead', label: 'Novo lead', description: 'Salvos do Radar' },
  { id: 'nao_contatado', label: 'Ainda não contatado', description: 'Aguardando abordagem' },
  { id: 'primeiro_contato', label: 'Primeiro contato realizado', description: 'Mensagem enviada' },
  { id: 'interessado', label: 'Interessado', description: 'Respondeu positivamente' },
  { id: 'em_negociacao', label: 'Em negociação', description: 'Proposta ou quantidade' },
  { id: 'venda_concluida', label: 'Venda concluída', description: 'Cliente convertido' },
  { id: 'sem_interesse', label: 'Sem interesse', description: 'Encerrado' },
];

export const BUSINESS_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: 'barbearias', label: 'Barbearias' },
  { key: 'saloes_beleza', label: 'Salões de beleza' },
  { key: 'restaurantes', label: 'Restaurantes' },
  { key: 'lanchonetes', label: 'Lanchonetes' },
  { key: 'cafeterias', label: 'Cafeterias' },
  { key: 'clinicas_odontologicas', label: 'Clínicas odontológicas' },
  { key: 'clinicas_medicas', label: 'Clínicas médicas' },
  { key: 'academias', label: 'Academias' },
  { key: 'oficinas_mecanicas', label: 'Oficinas mecânicas' },
  { key: 'pet_shops', label: 'Pet shops' },
  { key: 'lojas_roupas', label: 'Lojas de roupas' },
  { key: 'mercados', label: 'Mercados' },
  { key: 'hoteis', label: 'Hotéis' },
  { key: 'escolas', label: 'Escolas' },
  { key: 'outros', label: 'Outros estabelecimentos' },
];

export interface BusinessReview {
  author: string;
  rating: number;
  relativeTime: string;
  publishTime: string;
  text: string;
}

export interface Business {
  id: string;
  ownerId: string;
  placeId: string;
  name: string;
  category: string;
  categoryKey: string;
  address: string;
  city: string;
  state: string;
  neighborhood: string;
  postalCode: string;
  lat: number;
  lng: number;
  rating: number;
  userRatingCount: number;
  reviews: BusinessReview[];
  phone: string;
  whatsapp: string;
  websiteUri: string;
  googleMapsUri: string;
  instagram: string;
  email: string;
  opportunityScore: number;
  opportunityLevel: OpportunityLevel;
  opportunityReasons: string[];
  geminiAnalysis?: string;
  hasWebsite: boolean;
  hasPhone: boolean;
  photosCount?: number;
  hasOpeningHours?: boolean;
  hasEditorialSummary?: boolean;
  editorialSummary?: string;
  openingHoursSummary?: string;
  gbpScore?: number;
  gbpGaps?: string[];
  lastUpdatedAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Lead {
  id: string;
  ownerId: string;
  businessId: string;
  placeId: string;
  businessName: string;
  category: string;
  city: string;
  address: string;
  phone: string;
  whatsapp: string;
  email: string;
  instagram: string;
  websiteUri: string;
  googleMapsUri: string;
  rating: number;
  userRatingCount: number;
  opportunityScore: number;
  opportunityLevel: OpportunityLevel;
  stage: PipelineStage;
  notes: string;
  lastContactAt: string;
  nextFollowUpAt: string;
  convertedSaleId: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type InteractionType = 'whatsapp' | 'ligacao' | 'email' | 'instagram' | 'visita' | 'nota';

export interface Interaction {
  id: string;
  ownerId: string;
  leadId: string;
  businessName: string;
  type: InteractionType;
  summary: string;
  contactDate: string;
  createdAt?: Timestamp;
}

export interface Product {
  id: string;
  ownerId: string;
  name: string;
  sku: string;
  unitCost: number;
  salePrice: number;
  stockQuantity: number;
  minStock: number;
  avgAcquisitionCost: number;
  active: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type PaymentMethod = 'pix' | 'credito' | 'debito' | 'dinheiro' | 'boleto' | 'transferencia';
export type PaymentStatus = 'pago' | 'pendente' | 'cancelado';

export interface Sale {
  id: string;
  ownerId: string;
  leadId: string;
  customerName: string;
  productSummary: string;
  totalQuantity: number;
  totalRevenue: number;
  totalCost: number;
  discount: number;
  shipping: number;
  netReceived: number;
  grossProfit: number;
  marginPercent: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  saleDate: string;
  notes: string;
  stockDeducted: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface SaleItem {
  id: string;
  ownerId: string;
  saleId: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  subtotal: number;
  createdAt?: Timestamp;
}

export type InventoryMovementType = 'entrada' | 'saida_venda' | 'ajuste';

export interface InventoryMovement {
  id: string;
  ownerId: string;
  productId: string;
  productName: string;
  type: InventoryMovementType;
  quantityDelta: number;
  previousQuantity: number;
  newQuantity: number;
  unitCost: number;
  saleId: string;
  reason: string;
  createdAt?: Timestamp;
}

export interface Expense {
  id: string;
  ownerId: string;
  description: string;
  category: string;
  amount: number;
  expenseDate: string;
  createdAt?: Timestamp;
}

export interface Reminder {
  id: string;
  ownerId: string;
  leadId: string;
  businessName: string;
  title: string;
  dueDate: string;
  completed: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface SearchHistoryEntry {
  id: string;
  ownerId: string;
  city: string;
  state: string;
  neighborhood: string;
  postalCode: string;
  radiusKm: number;
  category: string;
  requestedCount: number;
  resultsCount: number;
  createdAt?: Timestamp;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  companyName: string;
  defaultCity: string;
  defaultState: string;
  whatsappTemplate: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
