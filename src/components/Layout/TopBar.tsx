import React, { useMemo, useState } from 'react';
import { LogOut, Menu, Plus, Search } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import type { Business, Lead, NavSection } from '../../types';

interface TopBarProps {
  activeSection: NavSection;
  onOpenMobileMenu: () => void;
  onOpenSaleModal: () => void;
  onSelectBusiness: (biz: Business) => void;
  onSelectLead: (lead: Lead) => void;
}

const SECTION_TITLES: Record<NavSection, string> = {
  dashboard: 'Dashboard',
  radar: 'Radar de empresas',
  leads: 'Leads',
  disparos: 'Disparos automáticos',
  mapa: 'Mapa e rotas',
  inteligencia: 'Inteligência comercial',
  pipeline: 'Pipeline de vendas',
  vendas: 'Vendas',
  estoque: 'Estoque',
  relatorios: 'Relatórios',
  configuracoes: 'Configurações',
};

export function TopBar({
  activeSection,
  onOpenMobileMenu,
  onOpenSaleModal,
  onSelectBusiness,
  onSelectLead,
}: TopBarProps) {
  const { user, profile, logout } = useAuth();
  const { leads, businesses } = useData();
  const [queryText, setQueryText] = useState('');
  const [focused, setFocused] = useState(false);

  const searchResults = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return { matchedLeads: [], matchedBusinesses: [] };

    const matchedLeads = leads
      .filter(
        (l) =>
          l.businessName.toLowerCase().includes(q) ||
          l.city.toLowerCase().includes(q) ||
          l.category.toLowerCase().includes(q)
      )
      .slice(0, 5);

    const leadPlaceIds = new Set(matchedLeads.map((l) => l.placeId));
    const matchedBusinesses = businesses
      .filter(
        (b) =>
          !leadPlaceIds.has(b.placeId) &&
          (b.name.toLowerCase().includes(q) ||
            b.city.toLowerCase().includes(q) ||
            b.category.toLowerCase().includes(q))
      )
      .slice(0, 5);

    return { matchedLeads, matchedBusinesses };
  }, [queryText, leads, businesses]);

  const hasResults =
    searchResults.matchedLeads.length > 0 || searchResults.matchedBusinesses.length > 0;

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-[#252B36]/80 bg-[#0B0D12]/80 backdrop-blur-xl px-4 lg:px-8 flex items-center justify-between gap-4 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 -ml-1 text-[#929BAA] hover:text-[#F5F7FA] hover:bg-[#141821] rounded-xl transition-colors"
          aria-label="Abrir navegação"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-[15px] font-semibold tracking-tight text-[#F5F7FA] truncate">
          {SECTION_TITLES[activeSection]}
        </h1>
      </div>

      <div className="relative flex-1 max-w-md hidden sm:block">
        <Search className="w-3.5 h-3.5 text-[#929BAA] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 180)}
          placeholder="Buscar empresa, lead ou cidade..."
          className="w-full h-9 pl-9 pr-3.5 bg-[#141821]/85 border border-[#252B36] rounded-xl text-xs text-[#F5F7FA] placeholder:text-[#929BAA] focus:outline-none focus:border-[#19C37D] transition-colors"
        />

        {focused && queryText.trim().length > 0 && (
          <div className="absolute left-0 right-0 top-11 z-50 bg-[#141821]/95 backdrop-blur-xl border border-[#252B36] rounded-2xl shadow-2xl overflow-hidden">
            {!hasResults ? (
              <div className="px-4 py-3.5 text-xs text-[#929BAA]">
                Nenhum lead ou empresa encontrado para "{queryText}".
              </div>
            ) : (
              <div className="divide-y divide-[#252B36] max-h-72 overflow-y-auto">
                {searchResults.matchedLeads.map((lead) => (
                  <button
                    key={lead.id}
                    type="button"
                    onMouseDown={() => {
                      onSelectLead(lead);
                      setQueryText('');
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-[#181D28] transition-colors flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[#F5F7FA] truncate">
                        {lead.businessName}
                      </div>
                      <div className="text-[11px] text-[#929BAA] truncate mt-0.5">
                        Lead · {lead.category} · {lead.city || 'Sem cidade'}
                      </div>
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-[#19C37D] shrink-0">
                      {lead.opportunityScore}/100
                    </span>
                  </button>
                ))}
                {searchResults.matchedBusinesses.map((biz) => (
                  <button
                    key={biz.id}
                    type="button"
                    onMouseDown={() => {
                      onSelectBusiness(biz);
                      setQueryText('');
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-[#181D28] transition-colors flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[#F5F7FA] truncate">
                        {biz.name}
                      </div>
                      <div className="text-[11px] text-[#929BAA] truncate mt-0.5">
                        Empresa · {biz.category} · {biz.city || 'Sem cidade'}
                      </div>
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-[#929BAA] shrink-0">
                      {biz.opportunityScore}/100
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={onOpenSaleModal}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-[#19C37D] text-[#0B0D12] text-xs font-semibold hover:bg-[#16AE6F] transition-all active:scale-[0.98] whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Nova venda
        </button>

        <div className="flex items-center gap-2 pl-2.5 border-l border-[#252B36]">
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt={profile?.displayName || 'Avatar'}
              referrerPolicy="no-referrer"
              className="w-7 h-7 rounded-full object-cover border border-[#252B36]"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-[#141821] border border-[#252B36] flex items-center justify-center text-xs font-semibold text-[#F5F7FA]">
              {(profile?.displayName || user?.email || 'U').charAt(0).toUpperCase()}
            </div>
          )}
          <span className="hidden md:block text-xs text-[#929BAA] max-w-[130px] truncate">
            {profile?.displayName || user?.email}
          </span>
          <button
            type="button"
            onClick={() => void logout()}
            title="Sair da conta"
            className="p-2 text-[#929BAA] hover:text-[#F5F7FA] hover:bg-[#141821] rounded-xl transition-colors"
            aria-label="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
