import React, { useEffect, useMemo, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { Loader2, Nfc, ShieldCheck } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { BusinessDrawer } from './components/Business/BusinessDrawer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Sidebar } from './components/Layout/Sidebar';
import { TopBar } from './components/Layout/TopBar';
import { SaleModal } from './components/Sales/SaleModal';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DataProvider, useData, type DiscoveredBusinessInput } from './contexts/DataContext';
import { ToastProvider } from './contexts/ToastContext';
import { safeFetchJson } from './lib/opportunity';
import type { Business, Lead, NavSection } from './types';
import { DashboardView } from './views/DashboardView';
import { IntelligenceView } from './views/IntelligenceView';
import { InventoryView } from './views/InventoryView';
import { LeadsView } from './views/LeadsView';
import { MapView } from './views/MapView';
import { OutreachView } from './views/OutreachView';
import { PipelineView } from './views/PipelineView';
import { RadarView } from './views/RadarView';
import { ReportsView } from './views/ReportsView';
import { SalesView } from './views/SalesView';
import { SettingsView } from './views/SettingsView';

function LoginGate() {
  const { signInWithGoogle, authError } = useAuth();
  const [signingIn, setSigningIn] = useState(false);

  const handleLogin = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch {
      // authError is already captured in AuthContext
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0D12] text-[#F5F7FA] flex items-center justify-center p-6 relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-96 opacity-60"
        style={{
          background:
            'radial-gradient(ellipse 65% 55% at 50% 0%, rgba(25, 195, 125, 0.08), transparent)',
        }}
        aria-hidden="true"
      />
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md bg-[#141821]/90 backdrop-blur-xl border border-[#252B36] rounded-3xl p-8 space-y-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]"
      >
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-[#19C37D]/15 border border-[#19C37D]/30 flex items-center justify-center shrink-0">
            <Nfc className="w-5 h-5 text-[#19C37D]" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-[#F5F7FA]">
              NFC Prospect
            </h1>
            <p className="text-xs text-[#929BAA]">
              Inteligência comercial e gestão de vendas
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold tracking-tight text-[#F5F7FA]">
            Acesse sua operação comercial
          </h2>
          <p className="text-xs text-[#929BAA] leading-relaxed">
            Encontre estabelecimentos com potencial para placas NFC de avaliação no Google, organize seu funil de vendas e controle estoque e faturamento em um só lugar.
          </p>
        </div>

        {authError && (
          <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300">
            {authError}
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleLogin()}
          disabled={signingIn}
          className="w-full h-11 rounded-xl bg-[#19C37D] text-[#0B0D12] text-xs font-semibold hover:bg-[#16AE6F] transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {signingIn ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ShieldCheck className="w-4 h-4" />
          )}
          Entrar com Google
        </button>

        <div className="pt-3.5 border-t border-[#252B36] text-[11px] text-[#929BAA] flex items-center justify-between">
          <span>Dados isolados por conta</span>
          <span>Google Maps · Firestore</span>
        </div>
      </motion.div>
    </div>
  );
}

function WorkspaceShell({ mapsApiKey }: { mapsApiKey: string }) {
  const { user, loading: authLoading } = useAuth();
  const { businesses, leads, products } = useData();

  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [drawerBusiness, setDrawerBusiness] = useState<DiscoveredBusinessInput | Business | null>(
    null
  );
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [saleModalLead, setSaleModalLead] = useState<Lead | null>(null);
  const [queuedRouteStop, setQueuedRouteStop] = useState<DiscoveredBusinessInput | Business | null>(null);

  const lowStockCount = useMemo(
    () => products.filter((p) => p.active && p.stockQuantity <= p.minStock).length,
    [products]
  );

  const outreachReadyCount = useMemo(() => {
    const leadMap = new Map(leads.map((l) => [l.placeId, l]));
    const seen = new Set<string>();
    let count = 0;
    for (const b of businesses) {
      if (!b.placeId || seen.has(b.placeId)) continue;
      seen.add(b.placeId);
      const hasPhone = Boolean((b.whatsapp || b.phone || '').replace(/\D/g, '').length >= 10);
      if (!hasPhone) continue;
      const l = leadMap.get(b.placeId);
      if (!l || l.stage === 'novo_lead' || l.stage === 'nao_contatado') {
        count += 1;
      }
    }
    for (const l of leads) {
      if (!l.placeId || seen.has(l.placeId)) continue;
      seen.add(l.placeId);
      const hasPhone = Boolean((l.whatsapp || l.phone || '').replace(/\D/g, '').length >= 10);
      if (hasPhone && (l.stage === 'novo_lead' || l.stage === 'nao_contatado')) {
        count += 1;
      }
    }
    return count;
  }, [businesses, leads]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0B0D12] flex items-center justify-center">
        <div className="flex items-center gap-2.5 text-xs text-[#929BAA]">
          <Loader2 className="w-4 h-4 animate-spin text-[#19C37D]" />
          Carregando NFC Prospect...
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginGate />;
  }

  const handleSelectLead = (lead: Lead) => {
    const existingBiz = businesses.find((b) => b.placeId === lead.placeId);
    if (existingBiz) {
      setDrawerBusiness(existingBiz);
      return;
    }
    const synthetic: DiscoveredBusinessInput = {
      placeId: lead.placeId,
      name: lead.businessName,
      category: lead.category,
      categoryKey: 'outros',
      address: lead.address,
      city: lead.city,
      state: '',
      neighborhood: '',
      postalCode: '',
      lat: 0,
      lng: 0,
      rating: lead.rating,
      userRatingCount: lead.userRatingCount,
      reviews: [],
      phone: lead.phone,
      whatsapp: lead.whatsapp,
      websiteUri: lead.websiteUri,
      googleMapsUri: lead.googleMapsUri,
      instagram: lead.instagram,
      email: lead.email,
      hasWebsite: Boolean(lead.websiteUri),
      hasPhone: Boolean(lead.phone),
      opportunityScore: lead.opportunityScore,
      opportunityLevel: lead.opportunityLevel,
      opportunityReasons: [],
    };
    setDrawerBusiness(synthetic);
  };

  const handleOpenSaleModal = (lead?: Lead) => {
    setSaleModalLead(lead || null);
    setSaleModalOpen(true);
  };

  const mapsConfigured = Boolean(mapsApiKey);

  const content = (
    <div className="min-h-screen bg-[#0B0D12] text-[#F5F7FA] flex relative">
      <Sidebar
        activeSection={activeSection}
        onSelect={setActiveSection}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        leadsCount={leads.length}
        lowStockCount={lowStockCount}
        outreachReadyCount={outreachReadyCount}
      />

      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        <TopBar
          activeSection={activeSection}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onOpenSaleModal={() => handleOpenSaleModal()}
          onSelectBusiness={(biz) => setDrawerBusiness(biz)}
          onSelectLead={handleSelectLead}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden">
          <div className="max-w-[1400px] mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              >
                {activeSection === 'dashboard' && (
                  <DashboardView onNavigate={setActiveSection} />
                )}
                {activeSection === 'radar' && (
                  <RadarView
                    onSelectBusiness={(biz) => setDrawerBusiness(biz)}
                    mapsConfigured={mapsConfigured}
                  />
                )}
                {activeSection === 'leads' && (
                  <LeadsView
                    onSelectLead={handleSelectLead}
                    onGoToRadar={() => setActiveSection('radar')}
                  />
                )}
                {activeSection === 'disparos' && (
                  <OutreachView
                    onSelectBusiness={(biz) => setDrawerBusiness(biz)}
                    onGoToRadar={() => setActiveSection('radar')}
                  />
                )}
                {activeSection === 'mapa' && (
                  <MapView
                    onSelectBusiness={(biz) => setDrawerBusiness(biz)}
                    mapsConfigured={mapsConfigured}
                    queuedStop={queuedRouteStop}
                    onConsumeQueuedStop={() => setQueuedRouteStop(null)}
                  />
                )}
                {activeSection === 'inteligencia' && (
                  <IntelligenceView
                    onSelectBusiness={(biz) => setDrawerBusiness(biz)}
                    onGoToRadar={() => setActiveSection('radar')}
                  />
                )}
                {activeSection === 'pipeline' && (
                  <PipelineView
                    onSelectLead={handleSelectLead}
                    onOpenSaleForLead={(lead) => handleOpenSaleModal(lead)}
                    onGoToRadar={() => setActiveSection('radar')}
                  />
                )}
                {activeSection === 'vendas' && (
                  <SalesView onOpenSaleModal={() => handleOpenSaleModal()} />
                )}
                {activeSection === 'estoque' && <InventoryView />}
                {activeSection === 'relatorios' && <ReportsView />}
                {activeSection === 'configuracoes' && <SettingsView />}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <BusinessDrawer
        business={drawerBusiness}
        onClose={() => setDrawerBusiness(null)}
        onOpenSaleForLead={(lead) => {
          setDrawerBusiness(null);
          handleOpenSaleModal(lead);
        }}
        onAddToRoute={(biz) => {
          setDrawerBusiness(null);
          setQueuedRouteStop(biz);
          setActiveSection('mapa');
        }}
      />

      <SaleModal
        open={saleModalOpen}
        initialLead={saleModalLead}
        onClose={() => {
          setSaleModalOpen(false);
          setSaleModalLead(null);
        }}
      />
    </div>
  );

  if (!mapsApiKey) {
    return content;
  }

  return (
    <APIProvider
      apiKey={mapsApiKey}
      language="pt-BR"
      region="BR"
      libraries={['marker', 'maps']}
    >
      {content}
    </APIProvider>
  );
}

export default function App() {
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );

  useEffect(() => {
    const onQuota = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  useEffect(() => {
    if (mapsApiKey) return;
    safeFetchJson<{ apiKey?: string }>('/api/maps/config')
      .then(({ data }) => {
        if (data?.apiKey) setMapsApiKey(data.apiKey);
      })
      .catch(() => {
        // Ignore if server not reachable yet
      });
  }, [mapsApiKey]);

  return (
    <ErrorBoundary>
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}
      <ToastProvider>
        <AuthProvider>
          <DataProvider>
            <WorkspaceShell mapsApiKey={mapsApiKey} />
          </DataProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
