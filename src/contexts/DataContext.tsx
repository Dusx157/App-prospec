import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  clampStr,
  formatWhatsappNumber,
  makeBusinessDocId,
  makeLeadDocId,
  makeRandomId,
  safeFetchJson,
  todayISODate,
} from '../lib/opportunity';
import { useAuth } from './AuthContext';
import type {
  Business,
  Expense,
  Interaction,
  InteractionType,
  InventoryMovement,
  Lead,
  PaymentMethod,
  PaymentStatus,
  PipelineStage,
  Product,
  Reminder,
  Sale,
  SaleItem,
  SearchHistoryEntry,
} from '../types';

export interface DiscoveredBusinessInput {
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
  reviews: Business['reviews'];
  phone: string;
  whatsapp: string;
  websiteUri: string;
  googleMapsUri: string;
  instagram: string;
  email: string;
  hasWebsite: boolean;
  hasPhone: boolean;
  photosCount?: number;
  hasOpeningHours?: boolean;
  hasEditorialSummary?: boolean;
  editorialSummary?: string;
  openingHoursSummary?: string;
  gbpScore?: number;
  gbpGaps?: string[];
  opportunityScore: number;
  opportunityLevel: Business['opportunityLevel'];
  opportunityReasons: string[];
}

export interface CreateSaleInput {
  leadId?: string;
  customerName: string;
  items: Array<{ productId: string; quantity: number; unitPrice: number }>;
  discount: number;
  shipping: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  saleDate: string;
  notes: string;
}

interface DataContextValue {
  businesses: Business[];
  leads: Lead[];
  interactions: Interaction[];
  products: Product[];
  sales: Sale[];
  saleItems: SaleItem[];
  inventoryMovements: InventoryMovement[];
  expenses: Expense[];
  reminders: Reminder[];
  searchHistory: SearchHistoryEntry[];
  dataReady: boolean;

  saveBusiness: (biz: DiscoveredBusinessInput) => Promise<Business>;
  saveBusinessesBatch: (items: DiscoveredBusinessInput[]) => Promise<void>;
  saveLeadFromBusiness: (biz: DiscoveredBusinessInput | Business) => Promise<Lead>;
  updateLeadStage: (leadId: string, stage: PipelineStage) => Promise<void>;
  updateLeadDetails: (
    leadId: string,
    updates: {
      notes?: string;
      lastContactAt?: string;
      nextFollowUpAt?: string;
      stage?: PipelineStage;
      phone?: string;
      whatsapp?: string;
      email?: string;
      instagram?: string;
      websiteUri?: string;
    }
  ) => Promise<void>;
  logInteraction: (params: {
    leadId: string;
    businessName: string;
    type: InteractionType;
    summary: string;
    contactDate: string;
    nextStage?: PipelineStage;
    nextFollowUpAt?: string;
  }) => Promise<void>;
  createReminder: (params: {
    leadId: string;
    businessName: string;
    title: string;
    dueDate: string;
  }) => Promise<void>;
  toggleReminder: (reminderId: string, completed: boolean) => Promise<void>;
  deleteReminder: (reminderId: string) => Promise<void>;
  recordWhatsappSent: (params: {
    biz: DiscoveredBusinessInput | Business;
    summary?: string;
    nextFollowUpAt?: string;
  }) => Promise<Lead>;
  enrichBusinessWebsite: (biz: DiscoveredBusinessInput | Business) => Promise<{
    instagram: string;
    email: string;
  }>;
  generateGeminiAnalysis: (biz: DiscoveredBusinessInput | Business) => Promise<string>;
  refreshPlaceDetails: (placeId: string) => Promise<DiscoveredBusinessInput>;
  createProduct: (input: {
    name: string;
    sku: string;
    unitCost: number;
    salePrice: number;
    stockQuantity: number;
    minStock: number;
  }) => Promise<Product>;
  updateProductMeta: (
    productId: string,
    updates: {
      name: string;
      sku: string;
      unitCost: number;
      salePrice: number;
      minStock: number;
      active: boolean;
    }
  ) => Promise<void>;
  adjustProductStock: (params: {
    productId: string;
    type: 'entrada' | 'ajuste';
    quantityDelta: number;
    unitCost?: number;
    reason: string;
  }) => Promise<void>;
  createSaleAtomic: (input: CreateSaleInput) => Promise<string>;
  markSalePaidAtomic: (saleId: string) => Promise<void>;
  cancelSale: (saleId: string) => Promise<void>;
  createExpense: (input: {
    description: string;
    category: string;
    amount: number;
    expenseDate: string;
  }) => Promise<void>;
  deleteExpense: (expenseId: string) => Promise<void>;
  recordSearchHistory: (input: {
    city: string;
    state: string;
    neighborhood: string;
    postalCode: string;
    radiusKm: number;
    category: string;
    requestedCount: number;
    resultsCount: number;
  }) => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

function tsMillis(ts?: { toMillis?: () => number }): number {
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([]);
  const [dataReady, setDataReady] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setBusinesses([]);
      setLeads([]);
      setInteractions([]);
      setProducts([]);
      setSales([]);
      setSaleItems([]);
      setInventoryMovements([]);
      setExpenses([]);
      setReminders([]);
      setSearchHistory([]);
      setDataReady(true);
      return;
    }

    const uid = user.uid;
    let settled = 0;
    const total = 10;
    const markSettled = () => {
      settled += 1;
      if (settled >= total) setDataReady(true);
    };

    const subscribe = <T extends { createdAt?: { toMillis?: () => number } }>(
      colName: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>
    ) => {
      const q = query(collection(db, colName), where('ownerId', '==', uid));
      return onSnapshot(
        q,
        (snap) => {
          const rows = snap.docs.map((d) => d.data() as T);
          rows.sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
          setter(rows);
          markSettled();
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, colName);
        }
      );
    };

    const unsubs = [
      subscribe<Business>('businesses', setBusinesses),
      subscribe<Lead>('leads', setLeads),
      subscribe<Interaction>('interactions', setInteractions),
      subscribe<Product>('products', setProducts),
      subscribe<Sale>('sales', setSales),
      subscribe<SaleItem>('sale_items', setSaleItems),
      subscribe<InventoryMovement>('inventory_movements', setInventoryMovements),
      subscribe<Expense>('expenses', setExpenses),
      subscribe<Reminder>('reminders', setReminders),
      subscribe<SearchHistoryEntry>('search_history', setSearchHistory),
    ];

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [user, authLoading]);

  const requireUid = () => {
    if (!user) throw new Error('Usuário não autenticado.');
    return user.uid;
  };

  const buildBusinessPayload = (uid: string, biz: DiscoveredBusinessInput, id: string) => ({
    id,
    ownerId: uid,
    placeId: clampStr(biz.placeId, 256),
    name: clampStr(biz.name || 'Estabelecimento', 200),
    category: clampStr(biz.category || 'Comércio', 100),
    categoryKey: clampStr(biz.categoryKey || 'outros', 64),
    address: clampStr(biz.address, 400),
    city: clampStr(biz.city, 100),
    state: clampStr(biz.state, 60),
    neighborhood: clampStr(biz.neighborhood, 100),
    postalCode: clampStr(biz.postalCode, 20),
    lat: Number(biz.lat) || 0,
    lng: Number(biz.lng) || 0,
    rating: Number(biz.rating) || 0,
    userRatingCount: Math.max(0, Math.round(Number(biz.userRatingCount) || 0)),
    reviews: (biz.reviews || []).slice(0, 5).map((r) => ({
      author: clampStr(r.author || 'Cliente', 120),
      rating: Number(r.rating) || 0,
      relativeTime: clampStr(r.relativeTime, 80),
      publishTime: clampStr(r.publishTime, 64),
      text: clampStr(r.text, 500),
    })),
    phone: clampStr(biz.phone, 40),
    whatsapp: clampStr(biz.whatsapp || formatWhatsappNumber(biz.phone), 40),
    websiteUri: clampStr(biz.websiteUri, 500),
    googleMapsUri: clampStr(biz.googleMapsUri, 500),
    instagram: clampStr(biz.instagram, 300),
    email: clampStr(biz.email, 200),
    opportunityScore: Math.max(0, Math.min(100, Math.round(Number(biz.opportunityScore) || 0))),
    opportunityLevel: biz.opportunityLevel,
    opportunityReasons: (biz.opportunityReasons || [])
      .slice(0, 10)
      .map((reason) => clampStr(reason, 200)),
    hasWebsite: Boolean(biz.hasWebsite),
    hasPhone: Boolean(biz.hasPhone),
    photosCount: Math.max(0, Math.round(Number(biz.photosCount) || 0)),
    hasOpeningHours: Boolean(biz.hasOpeningHours),
    hasEditorialSummary: Boolean(biz.hasEditorialSummary),
    editorialSummary: clampStr(biz.editorialSummary, 500),
    openingHoursSummary: clampStr(biz.openingHoursSummary, 400),
    gbpScore: Math.max(0, Math.min(100, Math.round(Number(biz.gbpScore) || 0))),
    gbpGaps: (biz.gbpGaps || []).slice(0, 8).map((g) => clampStr(g, 200)),
  });

  const saveBusiness = async (biz: DiscoveredBusinessInput): Promise<Business> => {
    const uid = requireUid();
    const id = makeBusinessDocId(uid, biz.placeId);
    const ref = doc(db, 'businesses', id);
    const base = buildBusinessPayload(uid, biz, id);

    try {
      const existingSnap = await getDoc(ref);
      if (existingSnap.exists()) {
        const updateData = {
          name: base.name,
          category: base.category,
          categoryKey: base.categoryKey,
          address: base.address,
          city: base.city,
          state: base.state,
          neighborhood: base.neighborhood,
          postalCode: base.postalCode,
          lat: base.lat,
          lng: base.lng,
          rating: base.rating,
          userRatingCount: base.userRatingCount,
          reviews: base.reviews,
          phone: base.phone,
          whatsapp: base.whatsapp,
          websiteUri: base.websiteUri,
          googleMapsUri: base.googleMapsUri,
          opportunityScore: base.opportunityScore,
          opportunityLevel: base.opportunityLevel,
          opportunityReasons: base.opportunityReasons,
          hasWebsite: base.hasWebsite,
          hasPhone: base.hasPhone,
          photosCount: base.photosCount,
          hasOpeningHours: base.hasOpeningHours,
          hasEditorialSummary: base.hasEditorialSummary,
          editorialSummary: base.editorialSummary,
          openingHoursSummary: base.openingHoursSummary,
          gbpScore: base.gbpScore,
          gbpGaps: base.gbpGaps,
          lastUpdatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await updateDoc(ref, updateData);
        return { ...(existingSnap.data() as Business), ...updateData } as Business;
      }

      const fullData = {
        ...base,
        lastUpdatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(ref, fullData);
      return fullData as unknown as Business;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `businesses/${id}`);
    }
  };

  const saveBusinessesBatch = async (items: DiscoveredBusinessInput[]): Promise<void> => {
    const uid = requireUid();
    const existingIds = new Set(businesses.map((b) => b.id));
    const toCreate = items.filter((item) => !existingIds.has(makeBusinessDocId(uid, item.placeId)));
    if (toCreate.length === 0) return;

    const batch = writeBatch(db);
    for (const item of toCreate.slice(0, 40)) {
      const id = makeBusinessDocId(uid, item.placeId);
      const ref = doc(db, 'businesses', id);
      const base = buildBusinessPayload(uid, item, id);
      batch.set(ref, {
        ...base,
        lastUpdatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'businesses');
    }
  };

  const saveLeadFromBusiness = async (biz: DiscoveredBusinessInput | Business): Promise<Lead> => {
    const uid = requireUid();
    const businessId = makeBusinessDocId(uid, biz.placeId);
    const leadId = makeLeadDocId(uid, biz.placeId);

    const existingLeadLocal = leads.find((l) => l.id === leadId || l.placeId === biz.placeId);
    if (existingLeadLocal) {
      return existingLeadLocal;
    }

    const bizRef = doc(db, 'businesses', businessId);
    const leadRef = doc(db, 'leads', leadId);

    try {
      const [bizSnap, leadSnap] = await Promise.all([getDoc(bizRef), getDoc(leadRef)]);
      if (leadSnap.exists()) {
        return leadSnap.data() as Lead;
      }

      const batch = writeBatch(db);
      if (!bizSnap.exists()) {
        const base = buildBusinessPayload(uid, biz, businessId);
        batch.set(bizRef, {
          ...base,
          lastUpdatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      const leadPayload = {
        id: leadId,
        ownerId: uid,
        businessId,
        placeId: clampStr(biz.placeId, 256),
        businessName: clampStr(biz.name || 'Estabelecimento', 200),
        category: clampStr(biz.category || 'Comércio', 100),
        city: clampStr(biz.city, 100),
        address: clampStr(biz.address, 400),
        phone: clampStr(biz.phone, 40),
        whatsapp: clampStr(biz.whatsapp || formatWhatsappNumber(biz.phone), 40),
        email: clampStr(biz.email, 200),
        instagram: clampStr(biz.instagram, 300),
        websiteUri: clampStr(biz.websiteUri, 500),
        googleMapsUri: clampStr(biz.googleMapsUri, 500),
        rating: Number(biz.rating) || 0,
        userRatingCount: Math.max(0, Math.round(Number(biz.userRatingCount) || 0)),
        opportunityScore: Math.max(0, Math.min(100, Math.round(Number(biz.opportunityScore) || 0))),
        opportunityLevel: biz.opportunityLevel || 'media',
        stage: 'novo_lead' as PipelineStage,
        notes: '',
        lastContactAt: '',
        nextFollowUpAt: '',
        convertedSaleId: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      batch.set(leadRef, leadPayload);
      await batch.commit();
      return leadPayload as unknown as Lead;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `leads/${leadId}`);
    }
  };

  const updateLeadStage = async (leadId: string, stage: PipelineStage) => {
    requireUid();
    try {
      await updateDoc(doc(db, 'leads', leadId), {
        stage,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `leads/${leadId}`);
    }
  };

  const updateLeadDetails = async (
    leadId: string,
    updates: {
      notes?: string;
      lastContactAt?: string;
      nextFollowUpAt?: string;
      stage?: PipelineStage;
      phone?: string;
      whatsapp?: string;
      email?: string;
      instagram?: string;
      websiteUri?: string;
    }
  ) => {
    requireUid();
    const leadRef = doc(db, 'leads', leadId);
    const hasContactChange =
      updates.phone !== undefined ||
      updates.whatsapp !== undefined ||
      updates.email !== undefined ||
      updates.instagram !== undefined ||
      updates.websiteUri !== undefined;

    try {
      if (hasContactChange) {
        const contactPayload: Record<string, unknown> = { updatedAt: serverTimestamp() };
        if (updates.phone !== undefined) contactPayload.phone = clampStr(updates.phone, 40);
        if (updates.whatsapp !== undefined) contactPayload.whatsapp = clampStr(updates.whatsapp, 40);
        if (updates.email !== undefined) contactPayload.email = clampStr(updates.email, 200);
        if (updates.instagram !== undefined) contactPayload.instagram = clampStr(updates.instagram, 300);
        if (updates.websiteUri !== undefined) contactPayload.websiteUri = clampStr(updates.websiteUri, 500);
        await updateDoc(leadRef, contactPayload);
      }

      if (
        updates.notes !== undefined ||
        updates.lastContactAt !== undefined ||
        updates.nextFollowUpAt !== undefined ||
        updates.stage !== undefined
      ) {
        const notesPayload: Record<string, unknown> = { updatedAt: serverTimestamp() };
        if (updates.notes !== undefined) notesPayload.notes = clampStr(updates.notes, 3000);
        if (updates.lastContactAt !== undefined) notesPayload.lastContactAt = clampStr(updates.lastContactAt, 64);
        if (updates.nextFollowUpAt !== undefined) notesPayload.nextFollowUpAt = clampStr(updates.nextFollowUpAt, 64);
        if (updates.stage !== undefined) notesPayload.stage = updates.stage;
        await updateDoc(leadRef, notesPayload);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `leads/${leadId}`);
    }
  };

  const logInteraction = async (params: {
    leadId: string;
    businessName: string;
    type: InteractionType;
    summary: string;
    contactDate: string;
    nextStage?: PipelineStage;
    nextFollowUpAt?: string;
  }) => {
    const uid = requireUid();
    const interactionId = makeRandomId('int');
    const intRef = doc(db, 'interactions', interactionId);
    const leadRef = doc(db, 'leads', params.leadId);

    const batch = writeBatch(db);
    batch.set(intRef, {
      id: interactionId,
      ownerId: uid,
      leadId: params.leadId,
      businessName: clampStr(params.businessName || 'Lead', 200),
      type: params.type,
      summary: clampStr(params.summary, 1500),
      contactDate: clampStr(params.contactDate || todayISODate(), 64),
      createdAt: serverTimestamp(),
    });

    const leadUpdates: Record<string, unknown> = {
      lastContactAt: clampStr(params.contactDate || todayISODate(), 64),
      updatedAt: serverTimestamp(),
    };
    if (params.nextStage) leadUpdates.stage = params.nextStage;
    if (params.nextFollowUpAt !== undefined) {
      leadUpdates.nextFollowUpAt = clampStr(params.nextFollowUpAt, 64);
    }
    batch.update(leadRef, leadUpdates);

    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `interactions/${interactionId}`);
    }
  };

  const recordWhatsappSent = async ({
    biz,
    summary,
    nextFollowUpAt,
  }: {
    biz: DiscoveredBusinessInput | Business;
    summary?: string;
    nextFollowUpAt?: string;
  }): Promise<Lead> => {
    const lead = await saveLeadFromBusiness(biz);
    const shouldAdvance = lead.stage === 'novo_lead' || lead.stage === 'nao_contatado';
    await logInteraction({
      leadId: lead.id,
      businessName: lead.businessName,
      type: 'whatsapp',
      summary: clampStr(summary || 'Abordagem comercial enviada via WhatsApp', 1500),
      contactDate: todayISODate(),
      nextStage: shouldAdvance ? 'primeiro_contato' : undefined,
      nextFollowUpAt,
    });
    return lead;
  };

  const createReminder = async (params: {
    leadId: string;
    businessName: string;
    title: string;
    dueDate: string;
  }) => {
    const uid = requireUid();
    const id = makeRandomId('rem');
    try {
      await setDoc(doc(db, 'reminders', id), {
        id,
        ownerId: uid,
        leadId: params.leadId,
        businessName: clampStr(params.businessName, 200),
        title: clampStr(params.title, 200),
        dueDate: clampStr(params.dueDate, 32),
        completed: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `reminders/${id}`);
    }
  };

  const toggleReminder = async (reminderId: string, completed: boolean) => {
    requireUid();
    try {
      await updateDoc(doc(db, 'reminders', reminderId), {
        completed,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `reminders/${reminderId}`);
    }
  };

  const deleteReminder = async (reminderId: string) => {
    requireUid();
    try {
      await deleteDoc(doc(db, 'reminders', reminderId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `reminders/${reminderId}`);
    }
  };

  const enrichBusinessWebsite = async (biz: DiscoveredBusinessInput | Business) => {
    const uid = requireUid();
    const { data } = await safeFetchJson<{ instagram: string; email: string }>(
      '/api/enrich',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteUri: biz.websiteUri }),
      },
      'Falha ao consultar site oficial.'
    );

    const businessId = 'id' in biz && biz.id ? biz.id : makeBusinessDocId(uid, biz.placeId);
    const bizRef = doc(db, 'businesses', businessId);
    const bizSnap = await getDoc(bizRef);
    if (bizSnap.exists()) {
      await updateDoc(bizRef, {
        instagram: clampStr(data.instagram || biz.instagram, 300),
        email: clampStr(data.email || biz.email, 200),
        updatedAt: serverTimestamp(),
      });
    }

    const leadId = makeLeadDocId(uid, biz.placeId);
    const leadRef = doc(db, 'leads', leadId);
    const leadSnap = await getDoc(leadRef);
    if (leadSnap.exists()) {
      await updateDoc(leadRef, {
        instagram: clampStr(data.instagram || biz.instagram, 300),
        email: clampStr(data.email || biz.email, 200),
        updatedAt: serverTimestamp(),
      });
    }

    return {
      instagram: data.instagram || '',
      email: data.email || '',
    };
  };

  const generateGeminiAnalysis = async (biz: DiscoveredBusinessInput | Business): Promise<string> => {
    const uid = requireUid();
    const { data } = await safeFetchJson<{ analysis: string }>(
      '/api/gemini/analyze',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: biz.name,
          category: biz.category,
          city: biz.city,
          rating: biz.rating,
          userRatingCount: biz.userRatingCount,
          opportunityScore: biz.opportunityScore,
          opportunityLevel: biz.opportunityLevel,
          opportunityReasons: biz.opportunityReasons,
          hasWebsite: biz.hasWebsite,
          hasPhone: biz.hasPhone,
          hasOpeningHours: biz.hasOpeningHours,
          photosCount: biz.photosCount,
          gbpScore: biz.gbpScore,
          gbpGaps: biz.gbpGaps,
          reviews: biz.reviews,
        }),
      },
      'Falha ao gerar análise com Gemini.'
    );
    const analysis = clampStr(data.analysis, 2000);

    const businessId = makeBusinessDocId(uid, biz.placeId);
    const bizRef = doc(db, 'businesses', businessId);
    try {
      const bizSnap = await getDoc(bizRef);
      if (bizSnap.exists()) {
        await updateDoc(bizRef, {
          geminiAnalysis: analysis,
          updatedAt: serverTimestamp(),
        });
      } else {
        const base = buildBusinessPayload(uid, biz, businessId);
        await setDoc(bizRef, {
          ...base,
          geminiAnalysis: analysis,
          lastUpdatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.warn('Could not persist Gemini analysis to Firestore:', err);
    }

    return analysis;
  };

  const refreshPlaceDetails = async (placeId: string): Promise<DiscoveredBusinessInput> => {
    let data: { business: DiscoveredBusinessInput };
    try {
      const res = await safeFetchJson<{ business: DiscoveredBusinessInput }>(
        `/api/places/${encodeURIComponent(placeId)}`,
        undefined,
        'Falha ao atualizar Place Details.'
      );
      data = res.data;
    } catch (err) {
      const errWithCode = err as Error & { statusCode?: number };
      if (errWithCode.statusCode === 429 || errWithCode.message.includes('RESOURCE_EXHAUSTED')) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      throw err;
    }
    await saveBusiness(data.business);
    return data.business;
  };

  const createProduct = async (input: {
    name: string;
    sku: string;
    unitCost: number;
    salePrice: number;
    stockQuantity: number;
    minStock: number;
  }): Promise<Product> => {
    const uid = requireUid();
    const productId = makeRandomId('prod');
    const movId = makeRandomId('mov');
    const qty = Math.max(0, Math.round(input.stockQuantity));
    const cost = Math.max(0, Number(input.unitCost));

    const prodPayload = {
      id: productId,
      ownerId: uid,
      name: clampStr(input.name, 160),
      sku: clampStr(input.sku, 64),
      unitCost: cost,
      salePrice: Math.max(0, Number(input.salePrice)),
      stockQuantity: qty,
      minStock: Math.max(0, Math.round(input.minStock)),
      avgAcquisitionCost: cost,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const batch = writeBatch(db);
    batch.set(doc(db, 'products', productId), prodPayload);
    if (qty > 0) {
      batch.set(doc(db, 'inventory_movements', movId), {
        id: movId,
        ownerId: uid,
        productId,
        productName: prodPayload.name,
        type: 'entrada',
        quantityDelta: qty,
        previousQuantity: 0,
        newQuantity: qty,
        unitCost: cost,
        saleId: '',
        reason: 'Saldo inicial de cadastro',
        createdAt: serverTimestamp(),
      });
    }

    try {
      await batch.commit();
      return prodPayload as unknown as Product;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `products/${productId}`);
    }
  };

  const updateProductMeta = async (
    productId: string,
    updates: {
      name: string;
      sku: string;
      unitCost: number;
      salePrice: number;
      minStock: number;
      active: boolean;
    }
  ) => {
    requireUid();
    try {
      await updateDoc(doc(db, 'products', productId), {
        name: clampStr(updates.name, 160),
        sku: clampStr(updates.sku, 64),
        unitCost: Math.max(0, Number(updates.unitCost)),
        salePrice: Math.max(0, Number(updates.salePrice)),
        minStock: Math.max(0, Math.round(updates.minStock)),
        active: Boolean(updates.active),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `products/${productId}`);
    }
  };

  const adjustProductStock = async (params: {
    productId: string;
    type: 'entrada' | 'ajuste';
    quantityDelta: number;
    unitCost?: number;
    reason: string;
  }) => {
    const uid = requireUid();
    const prodRef = doc(db, 'products', params.productId);
    const movId = makeRandomId('mov');
    const movRef = doc(db, 'inventory_movements', movId);

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(prodRef);
        if (!snap.exists()) throw new Error('Produto não encontrado.');
        const prod = snap.data() as Product;
        const delta = Math.round(params.quantityDelta);
        const prevQty = prod.stockQuantity;
        const newQty = prevQty + delta;
        if (newQty < 0) {
          throw new Error(`Estoque insuficiente. Saldo atual: ${prevQty} unidade(s).`);
        }

        let newAvgCost = prod.avgAcquisitionCost;
        let newUnitCost = prod.unitCost;
        if (params.type === 'entrada' && delta > 0 && params.unitCost !== undefined && params.unitCost >= 0) {
          const totalPrevVal = prevQty * prod.avgAcquisitionCost;
          const totalAddVal = delta * params.unitCost;
          newAvgCost = newQty > 0 ? Number(((totalPrevVal + totalAddVal) / newQty).toFixed(2)) : params.unitCost;
          newUnitCost = params.unitCost;
        }

        tx.update(prodRef, {
          stockQuantity: newQty,
          avgAcquisitionCost: newAvgCost,
          unitCost: newUnitCost,
          updatedAt: serverTimestamp(),
        });

        tx.set(movRef, {
          id: movId,
          ownerId: uid,
          productId: prod.id,
          productName: prod.name,
          type: params.type,
          quantityDelta: delta,
          previousQuantity: prevQty,
          newQuantity: newQty,
          unitCost: params.unitCost ?? prod.avgAcquisitionCost,
          saleId: '',
          reason: clampStr(params.reason || 'Movimentação manual', 300),
          createdAt: serverTimestamp(),
        });
      });
    } catch (err) {
      if (err instanceof Error && (err.message.includes('insuficiente') || err.message.includes('não encontrado'))) {
        throw err;
      }
      handleFirestoreError(err, OperationType.WRITE, `products/${params.productId}`);
    }
  };

  const createSaleAtomic = async (input: CreateSaleInput): Promise<string> => {
    const uid = requireUid();
    if (!input.items || input.items.length === 0) {
      throw new Error('Selecione ao menos um produto para registrar a venda.');
    }

    const saleId = makeRandomId('sale');
    const saleRef = doc(db, 'sales', saleId);
    const deductNow = input.paymentStatus === 'pago';

    // Deduplicate product IDs so each product document is read and updated at most once in the transaction
    const uniqueProductIds = Array.from(new Set(input.items.map((it) => it.productId)));

    try {
      await runTransaction(db, async (tx) => {
        // 1. All reads first
        const prodSnaps = await Promise.all(
          uniqueProductIds.map((pid) => tx.get(doc(db, 'products', pid)))
        );
        const prodMap = new Map<string, Product>();
        for (let i = 0; i < uniqueProductIds.length; i++) {
          const snap = prodSnaps[i];
          if (!snap.exists()) {
            throw new Error('Produto não encontrado no estoque.');
          }
          prodMap.set(uniqueProductIds[i], snap.data() as Product);
        }

        const leadRef = input.leadId ? doc(db, 'leads', input.leadId) : null;
        const leadSnap = leadRef ? await tx.get(leadRef) : null;

        let itemsSubtotal = 0;
        let itemsCost = 0;
        let totalQty = 0;
        const summaryParts: string[] = [];
        const qtyByProduct = new Map<string, number>();

        const preparedItems: Array<{
          prod: Product;
          qty: number;
          unitPrice: number;
          unitCost: number;
          subtotal: number;
        }> = [];

        for (let i = 0; i < input.items.length; i++) {
          const rawItem = input.items[i];
          const prod = prodMap.get(rawItem.productId);
          if (!prod) throw new Error('Produto não encontrado no estoque.');

          const qty = Math.max(1, Math.round(Number(rawItem.quantity) || 1));
          const unitPrice = Number.isFinite(Number(rawItem.unitPrice))
            ? Math.max(0, Number(rawItem.unitPrice))
            : 0;
          const unitCost = Number.isFinite(prod.avgAcquisitionCost || prod.unitCost)
            ? Math.max(0, prod.avgAcquisitionCost || prod.unitCost)
            : 0;

          const prevAggregated = qtyByProduct.get(prod.id) || 0;
          qtyByProduct.set(prod.id, prevAggregated + qty);

          const subtotal = Number((qty * unitPrice).toFixed(2));
          itemsSubtotal += subtotal;
          itemsCost += Number((qty * unitCost).toFixed(2));
          totalQty += qty;
          summaryParts.push(`${qty}x ${prod.name}`);
          preparedItems.push({ prod, qty, unitPrice, unitCost, subtotal });
        }

        // Validate aggregated stock per product
        if (deductNow) {
          for (const [pid, reqQty] of qtyByProduct.entries()) {
            const prod = prodMap.get(pid);
            if (prod && prod.stockQuantity < reqQty) {
              throw new Error(
                `Estoque insuficiente para "${prod.name}". Disponível: ${prod.stockQuantity} un.`
              );
            }
          }
        }

        const discount = Number.isFinite(Number(input.discount)) ? Math.max(0, Number(input.discount)) : 0;
        const shipping = Number.isFinite(Number(input.shipping)) ? Math.max(0, Number(input.shipping)) : 0;
        const totalRevenue = Math.max(0, Number((itemsSubtotal - discount + shipping).toFixed(2)));
        const safeItemsCost = Number(itemsCost.toFixed(2));
        const netReceived = input.paymentStatus === 'pago' ? totalRevenue : 0;
        const grossProfit = Number((totalRevenue - safeItemsCost).toFixed(2));
        const marginPercent = totalRevenue > 0 ? Number(((grossProfit / totalRevenue) * 100).toFixed(1)) : 0;

        // 2. All writes
        tx.set(saleRef, {
          id: saleId,
          ownerId: uid,
          leadId: clampStr(input.leadId || '', 128),
          customerName: clampStr(input.customerName || 'Cliente', 200),
          productSummary: clampStr(summaryParts.join(', '), 300),
          totalQuantity: totalQty,
          totalRevenue,
          totalCost: safeItemsCost,
          discount,
          shipping,
          netReceived,
          grossProfit,
          marginPercent,
          paymentMethod: input.paymentMethod,
          paymentStatus: input.paymentStatus,
          saleDate: clampStr(input.saleDate || todayISODate(), 32),
          notes: clampStr(input.notes, 1500),
          stockDeducted: deductNow,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        for (const item of preparedItems) {
          const itemId = makeRandomId('sitem');
          tx.set(doc(db, 'sale_items', itemId), {
            id: itemId,
            ownerId: uid,
            saleId,
            productId: item.prod.id,
            productName: clampStr(item.prod.name, 160),
            sku: clampStr(item.prod.sku, 64),
            quantity: item.qty,
            unitPrice: item.unitPrice,
            unitCost: item.unitCost,
            subtotal: item.subtotal,
            createdAt: serverTimestamp(),
          });
        }

        if (deductNow) {
          for (const [pid, reqQty] of qtyByProduct.entries()) {
            const prod = prodMap.get(pid);
            if (!prod) continue;
            const newQty = prod.stockQuantity - reqQty;
            tx.update(doc(db, 'products', prod.id), {
              stockQuantity: newQty,
              updatedAt: serverTimestamp(),
            });

            const movId = makeRandomId('mov');
            tx.set(doc(db, 'inventory_movements', movId), {
              id: movId,
              ownerId: uid,
              productId: prod.id,
              productName: clampStr(prod.name, 160),
              type: 'saida_venda',
              quantityDelta: -reqQty,
              previousQuantity: prod.stockQuantity,
              newQuantity: newQty,
              unitCost: prod.avgAcquisitionCost || prod.unitCost,
              saleId,
              reason: `Venda para ${clampStr(input.customerName, 120)}`,
              createdAt: serverTimestamp(),
            });
          }
        }

        if (leadRef && leadSnap && leadSnap.exists() && leadSnap.data()?.ownerId === uid) {
          tx.update(leadRef, {
            convertedSaleId: saleId,
            stage: 'venda_concluida',
            updatedAt: serverTimestamp(),
          });
        }
      });

      return saleId;
    } catch (err) {
      if (err instanceof Error && (err.message.includes('insuficiente') || err.message.includes('não encontrado'))) {
        throw err;
      }
      handleFirestoreError(err, OperationType.WRITE, `sales/${saleId}`);
    }
  };

  const markSalePaidAtomic = async (saleId: string) => {
    const uid = requireUid();
    const saleRef = doc(db, 'sales', saleId);
    const relatedItems = saleItems.filter((item) => item.saleId === saleId);

    const qtyByProduct = new Map<string, number>();
    for (const item of relatedItems) {
      qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) || 0) + item.quantity);
    }
    const uniqueProductIds = Array.from(qtyByProduct.keys());

    try {
      await runTransaction(db, async (tx) => {
        const saleSnap = await tx.get(saleRef);
        if (!saleSnap.exists()) throw new Error('Venda não encontrada.');
        const sale = saleSnap.data() as Sale;
        if (sale.paymentStatus === 'cancelado') {
          throw new Error('Vendas canceladas não podem ser reabertas.');
        }

        const shouldDeduct = !sale.stockDeducted;
        const prodSnaps = shouldDeduct
          ? await Promise.all(uniqueProductIds.map((pid) => tx.get(doc(db, 'products', pid))))
          : [];

        const prodMap = new Map<string, Product>();
        if (shouldDeduct) {
          for (let i = 0; i < uniqueProductIds.length; i++) {
            const snap = prodSnaps[i];
            if (!snap.exists()) continue;
            const prod = snap.data() as Product;
            const reqQty = qtyByProduct.get(prod.id) || 0;
            if (prod.stockQuantity < reqQty) {
              throw new Error(`Estoque insuficiente para "${prod.name}".`);
            }
            prodMap.set(prod.id, prod);
          }
        }

        tx.update(saleRef, {
          paymentStatus: 'pago',
          netReceived: sale.totalRevenue,
          stockDeducted: true,
          updatedAt: serverTimestamp(),
        });

        if (shouldDeduct) {
          for (const [pid, reqQty] of qtyByProduct.entries()) {
            const prod = prodMap.get(pid);
            if (!prod || reqQty <= 0) continue;
            const newQty = prod.stockQuantity - reqQty;

            tx.update(doc(db, 'products', prod.id), {
              stockQuantity: newQty,
              updatedAt: serverTimestamp(),
            });

            const movId = makeRandomId('mov');
            tx.set(doc(db, 'inventory_movements', movId), {
              id: movId,
              ownerId: uid,
              productId: prod.id,
              productName: prod.name,
              type: 'saida_venda',
              quantityDelta: -reqQty,
              previousQuantity: prod.stockQuantity,
              newQuantity: newQty,
              unitCost: prod.avgAcquisitionCost || prod.unitCost,
              saleId,
              reason: `Baixa ao confirmar pagamento de ${sale.customerName}`,
              createdAt: serverTimestamp(),
            });
          }
        }
      });
    } catch (err) {
      if (err instanceof Error && (err.message.includes('insuficiente') || err.message.includes('canceladas'))) {
        throw err;
      }
      handleFirestoreError(err, OperationType.UPDATE, `sales/${saleId}`);
    }
  };

  const cancelSale = async (saleId: string) => {
    requireUid();
    try {
      await updateDoc(doc(db, 'sales', saleId), {
        paymentStatus: 'cancelado',
        netReceived: 0,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `sales/${saleId}`);
    }
  };

  const createExpense = async (input: {
    description: string;
    category: string;
    amount: number;
    expenseDate: string;
  }) => {
    const uid = requireUid();
    const id = makeRandomId('exp');
    try {
      await setDoc(doc(db, 'expenses', id), {
        id,
        ownerId: uid,
        description: clampStr(input.description, 240),
        category: clampStr(input.category || 'Operacional', 80),
        amount: Math.max(0, Number(input.amount)),
        expenseDate: clampStr(input.expenseDate, 32),
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `expenses/${id}`);
    }
  };

  const deleteExpense = async (expenseId: string) => {
    requireUid();
    try {
      await deleteDoc(doc(db, 'expenses', expenseId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `expenses/${expenseId}`);
    }
  };

  const recordSearchHistory = async (input: {
    city: string;
    state: string;
    neighborhood: string;
    postalCode: string;
    radiusKm: number;
    category: string;
    requestedCount: number;
    resultsCount: number;
  }) => {
    const uid = requireUid();
    const id = makeRandomId('srch');
    try {
      await setDoc(doc(db, 'search_history', id), {
        id,
        ownerId: uid,
        city: clampStr(input.city, 100),
        state: clampStr(input.state, 60),
        neighborhood: clampStr(input.neighborhood, 100),
        postalCode: clampStr(input.postalCode, 20),
        radiusKm: Math.max(0.5, Math.min(100, Number(input.radiusKm) || 10)),
        category: clampStr(input.category, 100),
        requestedCount: Math.max(1, Math.min(100, Math.round(input.requestedCount))),
        resultsCount: Math.max(0, Math.round(input.resultsCount)),
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `search_history/${id}`);
    }
  };

  return (
    <DataContext.Provider
      value={{
        businesses,
        leads,
        interactions,
        products,
        sales,
        saleItems,
        inventoryMovements,
        expenses,
        reminders,
        searchHistory,
        dataReady,
        saveBusiness,
        saveBusinessesBatch,
        saveLeadFromBusiness,
        updateLeadStage,
        updateLeadDetails,
        logInteraction,
        recordWhatsappSent,
        createReminder,
        toggleReminder,
        deleteReminder,
        enrichBusinessWebsite,
        generateGeminiAnalysis,
        refreshPlaceDetails,
        createProduct,
        updateProductMeta,
        adjustProductStock,
        createSaleAtomic,
        markSalePaidAtomic,
        cancelSale,
        createExpense,
        deleteExpense,
        recordSearchHistory,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
