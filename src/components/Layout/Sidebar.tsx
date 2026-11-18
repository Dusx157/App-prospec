import React from 'react';
import {
  LayoutDashboard,
  Radar,
  Users,
  Map as MapIcon,
  Sparkles,
  Kanban,
  DollarSign,
  Package,
  BarChart3,
  Settings,
  Send,
  X,
  Nfc,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { NavSection } from '../../types';

interface SidebarProps {
  activeSection: NavSection;
  onSelect: (section: NavSection) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  leadsCount: number;
  lowStockCount: number;
  outreachReadyCount?: number;
}

const NAV_GROUPS: Array<{
  title: string;
  items: Array<{
    id: NavSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }>;
}> = [
  {
    title: 'Visão geral',
    items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Prospecção',
    items: [
      { id: 'radar', label: 'Radar de empresas', icon: Radar },
      { id: 'inteligencia', label: 'Inteligência comercial', icon: Sparkles },
      { id: 'disparos', label: 'Disparos automáticos', icon: Send },
      { id: 'mapa', label: 'Mapa e rotas', icon: MapIcon },
    ],
  },
  {
    title: 'CRM & Operação',
    items: [
      { id: 'leads', label: 'Leads', icon: Users },
      { id: 'pipeline', label: 'Pipeline de vendas', icon: Kanban },
      { id: 'vendas', label: 'Vendas', icon: DollarSign },
      { id: 'estoque', label: 'Estoque', icon: Package },
      { id: 'relatorios', label: 'Relatórios', icon: BarChart3 },
    ],
  },
  {
    title: 'Conta',
    items: [{ id: 'configuracoes', label: 'Configurações', icon: Settings }],
  },
];

export function Sidebar({
  activeSection,
  onSelect,
  mobileOpen,
  onCloseMobile,
  leadsCount,
  lowStockCount,
  outreachReadyCount = 0,
}: SidebarProps) {
  const renderNavContent = (isMobile: boolean) => (
    <div className="flex flex-col h-full w-64 bg-[#0B0D12]/95 backdrop-blur-xl border-r border-[#252B36]/80 select-none">
      <div className="h-16 px-5 flex items-center justify-between border-b border-[#252B36]/70 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#19C37D]/15 border border-[#19C37D]/30 flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]">
            <Nfc className="w-4 h-4 text-[#19C37D]" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-[#F5F7FA] whitespace-nowrap">
            NFC Prospect
          </span>
        </div>
        {isMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="p-2 text-[#929BAA] hover:text-[#F5F7FA] hover:bg-[#141821] rounded-xl transition-colors"
            aria-label="Fechar menu"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="space-y-1">
            <div className="px-3 pb-1 text-[11px] font-medium text-[#929BAA]/70">
              {group.title}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelect(item.id);
                    onCloseMobile();
                  }}
                  className={`relative w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'text-[#F5F7FA]'
                      : 'text-[#929BAA] hover:text-[#F5F7FA] hover:bg-[#141821]/50'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId={isMobile ? 'sidebar-active-mobile' : 'sidebar-active-desktop'}
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      className="absolute inset-0 rounded-xl bg-[#141821] border border-[#252B36] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]"
                      aria-hidden="true"
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        active ? 'text-[#19C37D]' : 'text-[#929BAA]'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.id === 'disparos' && outreachReadyCount > 0 && (
                    <span className="relative z-10 text-[11px] font-mono tabular-nums text-[#19C37D]">
                      {outreachReadyCount}
                    </span>
                  )}
                  {item.id === 'leads' && leadsCount > 0 && (
                    <span className="relative z-10 text-[11px] font-mono tabular-nums text-[#929BAA]">
                      {leadsCount}
                    </span>
                  )}
                  {item.id === 'estoque' && lowStockCount > 0 && (
                    <span className="relative z-10 text-[11px] font-mono tabular-nums text-amber-400">
                      {lowStockCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0">{renderNavContent(false)}</aside>
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 bg-black/65 backdrop-blur-sm"
              onClick={onCloseMobile}
              aria-hidden="true"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 34 }}
              className="relative z-10 h-full"
            >
              {renderNavContent(true)}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
