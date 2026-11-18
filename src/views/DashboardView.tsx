import React, { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, Radar } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { formatCurrency, formatDateBR, todayISODate } from '../lib/opportunity';
import { PIPELINE_COLUMNS, type NavSection } from '../types';

interface DashboardViewProps {
  onNavigate: (section: NavSection) => void;
}

const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: 'rgba(11, 13, 18, 0.94)',
  border: '1px solid #252B36',
  borderRadius: '12px',
  fontSize: '12px',
  color: '#F5F7FA',
  padding: '8px 12px',
};

export function DashboardView({ onNavigate }: DashboardViewProps) {
  const { businesses, leads, sales, expenses, interactions, inventoryMovements, dataReady } = useData();

  const today = todayISODate();
  const currentMonth = today.slice(0, 7);

  const metrics = useMemo(() => {
    const validSales = sales.filter((s) => s.paymentStatus !== 'cancelado');
    const uncontactedLeads = leads.filter(
      (l) => l.stage === 'novo_lead' || l.stage === 'nao_contatado'
    ).length;
    const interestedLeads = leads.filter(
      (l) => l.stage === 'interessado' || l.stage === 'em_negociacao'
    ).length;
    const convertedLeads = leads.filter((l) => l.stage === 'venda_concluida').length;

    const todayRevenue = validSales
      .filter((s) => s.saleDate === today)
      .reduce((acc, s) => acc + s.totalRevenue, 0);

    const monthRevenue = validSales
      .filter((s) => s.saleDate.startsWith(currentMonth))
      .reduce((acc, s) => acc + s.totalRevenue, 0);

    const totalRevenue = validSales.reduce((acc, s) => acc + s.totalRevenue, 0);
    const totalProductCost = validSales.reduce((acc, s) => acc + s.totalCost, 0);
    const totalExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);
    const grossProfit = totalRevenue - totalProductCost - totalExpenses;
    const unitsSold = validSales.reduce((acc, s) => acc + s.totalQuantity, 0);
    const conversionRate = leads.length > 0 ? (convertedLeads / leads.length) * 100 : 0;

    return {
      totalBusinesses: businesses.length,
      totalLeads: leads.length,
      uncontactedLeads,
      interestedLeads,
      salesCount: validSales.length,
      todayRevenue,
      monthRevenue,
      grossProfit,
      unitsSold,
      conversionRate,
    };
  }, [businesses, leads, sales, expenses, today, currentMonth]);

  // 1. Daily revenue (last 14 days)
  const dailyRevenueData = useMemo(() => {
    const validSales = sales.filter((s) => s.paymentStatus !== 'cancelado');
    const days: Array<{ date: string; label: string; faturamento: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const daySales = validSales
        .filter((s) => s.saleDate === iso)
        .reduce((acc, s) => acc + s.totalRevenue, 0);
      days.push({
        date: iso,
        label: `${iso.slice(8, 10)}/${iso.slice(5, 7)}`,
        faturamento: Number(daySales.toFixed(2)),
      });
    }
    return days;
  }, [sales]);

  // 2. Weekly sales (last 6 weeks)
  const weeklySalesData = useMemo(() => {
    const validSales = sales.filter((s) => s.paymentStatus !== 'cancelado');
    const buckets: Array<{ label: string; vendas: number; faturamento: number }> = [];
    const now = new Date();
    for (let w = 5; w >= 0; w--) {
      const end = new Date(now);
      end.setDate(end.getDate() - w * 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      const startIso = start.toISOString().slice(0, 10);
      const endIso = end.toISOString().slice(0, 10);
      const inWeek = validSales.filter((s) => s.saleDate >= startIso && s.saleDate <= endIso);
      buckets.push({
        label: `${startIso.slice(8, 10)}/${startIso.slice(5, 7)}`,
        vendas: inWeek.length,
        faturamento: inWeek.reduce((acc, s) => acc + s.totalRevenue, 0),
      });
    }
    return buckets;
  }, [sales]);

  // 3. Monthly sales (last 6 months)
  const monthlySalesData = useMemo(() => {
    const validSales = sales.filter((s) => s.paymentStatus !== 'cancelado');
    const months: Array<{ label: string; faturamento: number; lucro: number }> = [];
    const now = new Date();
    for (let m = 5; m >= 0; m--) {
      const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const inMonth = validSales.filter((s) => s.saleDate.startsWith(ym));
      months.push({
        label: `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`,
        faturamento: inMonth.reduce((acc, s) => acc + s.totalRevenue, 0),
        lucro: inMonth.reduce((acc, s) => acc + s.grossProfit, 0),
      });
    }
    return months;
  }, [sales]);

  // 4. Lead conversion funnel
  const funnelData = useMemo(() => {
    return PIPELINE_COLUMNS.filter((c) => c.id !== 'sem_interesse').map((col) => ({
      name: col.label.split(' ').slice(0, 2).join(' '),
      fullName: col.label,
      quantidade: leads.filter((l) => l.stage === col.id).length,
    }));
  }, [leads]);

  // 5. Most approached categories
  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    const approached = leads.filter(
      (l) => l.stage !== 'novo_lead' && l.stage !== 'nao_contatado'
    );
    const source = approached.length > 0 ? approached : leads;
    for (const l of source) {
      const cat = l.category || 'Outros';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [leads]);

  // Recent activities
  const recentActivities = useMemo(() => {
    const items: Array<{ id: string; title: string; subtitle: string; timeMs: number; dateLabel: string }> = [];

    for (const s of sales.slice(0, 6)) {
      items.push({
        id: `sale_${s.id}`,
        title: `Venda registrada · ${s.customerName}`,
        subtitle: `${formatCurrency(s.totalRevenue)} · ${s.productSummary || `${s.totalQuantity} un.`}`,
        timeMs: s.createdAt?.toMillis?.() || 0,
        dateLabel: formatDateBR(s.saleDate),
      });
    }
    for (const i of interactions.slice(0, 6)) {
      items.push({
        id: `int_${i.id}`,
        title: `Contato (${i.type}) · ${i.businessName || 'Lead'}`,
        subtitle: i.summary,
        timeMs: i.createdAt?.toMillis?.() || 0,
        dateLabel: formatDateBR(i.contactDate),
      });
    }
    for (const l of leads.slice(0, 6)) {
      items.push({
        id: `lead_${l.id}`,
        title: `Lead cadastrado · ${l.businessName}`,
        subtitle: `${l.category} · Score ${l.opportunityScore}/100`,
        timeMs: l.createdAt?.toMillis?.() || 0,
        dateLabel: l.city || '—',
      });
    }
    for (const m of inventoryMovements.slice(0, 4)) {
      items.push({
        id: `mov_${m.id}`,
        title: `Estoque (${m.type === 'entrada' ? 'Entrada' : m.type === 'saida_venda' ? 'Saída' : 'Ajuste'}) · ${m.productName}`,
        subtitle: `${m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta} un. · ${m.reason}`,
        timeMs: m.createdAt?.toMillis?.() || 0,
        dateLabel: `Saldo ${m.newQuantity}`,
      });
    }

    return items.sort((a, b) => b.timeMs - a.timeMs).slice(0, 10);
  }, [sales, interactions, leads, inventoryMovements]);

  const heroMetrics = [
    {
      label: 'Faturamento mensal',
      value: formatCurrency(metrics.monthRevenue),
      sublabel: `Hoje: ${formatCurrency(metrics.todayRevenue)}`,
      accent: false,
    },
    {
      label: 'Lucro bruto',
      value: formatCurrency(metrics.grossProfit),
      sublabel: `${metrics.unitsSold} placa(s) vendida(s)`,
      accent: metrics.grossProfit > 0,
    },
    {
      label: 'Faturamento do dia',
      value: formatCurrency(metrics.todayRevenue),
      sublabel: `${metrics.salesCount} venda(s) concluída(s)`,
      accent: false,
    },
    {
      label: 'Taxa de conversão',
      value: `${metrics.conversionRate.toFixed(1)}%`,
      sublabel: `${metrics.interestedLeads} em negociação`,
      accent: metrics.conversionRate > 0,
    },
  ];

  const operationalStrip = [
    { label: 'Estabelecimentos encontrados', value: String(metrics.totalBusinesses) },
    { label: 'Leads cadastrados', value: String(metrics.totalLeads) },
    { label: 'Ainda não contatados', value: String(metrics.uncontactedLeads) },
    { label: 'Leads interessados', value: String(metrics.interestedLeads) },
    { label: 'Vendas · Placas vendidas', value: `${metrics.salesCount} · ${metrics.unitsSold} un.` },
  ];

  return (
    <div className="space-y-6">
      {/* Quick prompt if empty */}
      {dataReady && metrics.totalBusinesses === 0 && metrics.salesCount === 0 && (
        <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-base font-semibold tracking-tight text-[#F5F7FA]">
              Comece prospectando estabelecimentos no Radar de Empresas
            </h2>
            <p className="text-xs text-[#929BAA] leading-relaxed max-w-2xl">
              Busque negócios por cidade e categoria no Google Maps, avalie quem não tem site ou tem gargalos no Google Meu Negócio e salve seus primeiros leads.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('radar')}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[#19C37D] text-[#0B0D12] text-xs font-semibold hover:bg-[#16AE6F] transition-all active:scale-[0.98] whitespace-nowrap shrink-0"
          >
            <Radar className="w-4 h-4" />
            Abrir Radar de empresas
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Primary Financial Hero KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {heroMetrics.map((kpi) => (
          <div
            key={kpi.label}
            className="bg-[#141821] border border-[#252B36] rounded-2xl p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] space-y-2 transition-colors hover:border-[#343C4B]"
          >
            <div className="text-xs text-[#929BAA] font-medium">{kpi.label}</div>
            <div
              className={`text-2xl font-semibold tracking-tight font-mono tabular-nums ${
                kpi.accent ? 'text-[#19C37D]' : 'text-[#F5F7FA]'
              }`}
            >
              {kpi.value}
            </div>
            <div className="text-[11px] text-[#929BAA] font-mono tabular-nums">
              {kpi.sublabel}
            </div>
          </div>
        ))}
      </div>

      {/* Consolidated Prospecção & Funil Strip */}
      <div className="bg-[#141821] border border-[#252B36] rounded-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-[#252B36]">
        {operationalStrip.map((item) => (
          <div key={item.label} className="p-4 sm:px-5 space-y-1">
            <div className="text-[11px] text-[#929BAA] truncate">{item.label}</div>
            <div className="text-base font-semibold font-mono tabular-nums text-[#F5F7FA]">
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-[#F5F7FA]">
                Faturamento diário
              </h3>
              <p className="text-[11px] text-[#929BAA] mt-0.5">Últimos 14 dias</p>
            </div>
            <span className="text-[11px] font-mono text-[#929BAA]">BRL</span>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyRevenueData}>
                <defs>
                  <linearGradient id="dashRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#19C37D" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#19C37D" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#252B36" strokeDasharray="3 3" vertical={false} strokeOpacity={0.6} />
                <XAxis dataKey="label" stroke="#929BAA" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#929BAA" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(v: unknown) => [formatCurrency(Number(v)), 'Faturamento']}
                />
                <Area
                  type="monotone"
                  dataKey="faturamento"
                  stroke="#19C37D"
                  fill="url(#dashRevenueGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-[#F5F7FA]">
                Vendas por semana
              </h3>
              <p className="text-[11px] text-[#929BAA] mt-0.5">Últimas 6 semanas</p>
            </div>
            <span className="text-[11px] font-mono text-[#929BAA]">Pedidos</span>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklySalesData}>
                <CartesianGrid stroke="#252B36" strokeDasharray="3 3" vertical={false} strokeOpacity={0.6} />
                <XAxis dataKey="label" stroke="#929BAA" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#929BAA" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="vendas" name="Vendas" fill="#19C37D" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] space-y-4">
          <h3 className="text-sm font-semibold tracking-tight text-[#F5F7FA]">Vendas por mês</h3>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlySalesData}>
                <CartesianGrid stroke="#252B36" strokeDasharray="3 3" vertical={false} strokeOpacity={0.6} />
                <XAxis dataKey="label" stroke="#929BAA" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#929BAA" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(v: unknown) => formatCurrency(Number(v))}
                />
                <Bar dataKey="faturamento" name="Faturamento" fill="#19C37D" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] space-y-4">
          <h3 className="text-sm font-semibold tracking-tight text-[#F5F7FA]">Conversão de leads</h3>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} layout="vertical">
                <CartesianGrid stroke="#252B36" strokeDasharray="3 3" horizontal={false} strokeOpacity={0.6} />
                <XAxis type="number" stroke="#929BAA" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" stroke="#929BAA" fontSize={11} width={96} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="quantidade" name="Leads" radius={[0, 6, 6, 0]}>
                  {funnelData.map((_, idx) => (
                    <Cell
                      key={idx}
                      fill={idx === funnelData.length - 1 ? '#19C37D' : '#3B82F6'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] space-y-4">
          <h3 className="text-sm font-semibold tracking-tight text-[#F5F7FA]">
            Categorias mais abordadas
          </h3>
          {categoryData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-xs text-[#929BAA] text-center px-4">
              Salve ou aborde leads para visualizar as categorias com maior tração.
            </div>
          ) : (
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} layout="vertical">
                  <CartesianGrid stroke="#252B36" strokeDasharray="3 3" horizontal={false} strokeOpacity={0.6} />
                  <XAxis type="number" stroke="#929BAA" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" stroke="#929BAA" fontSize={11} width={105} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="total" name="Leads" fill="#19C37D" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Recent Activities */}
      <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-tight text-[#F5F7FA]">Atividades recentes</h3>
          <span className="text-xs text-[#929BAA]">Atualização em tempo real</span>
        </div>

        {recentActivities.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#929BAA]">
            Nenhuma atividade registrada ainda. Use o Radar de empresas para encontrar e salvar seus primeiros leads.
          </div>
        ) : (
          <div className="divide-y divide-[#252B36]">
            {recentActivities.map((act) => (
              <div
                key={act.id}
                className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="text-xs font-medium text-[#F5F7FA] truncate">
                    {act.title}
                  </div>
                  <div className="text-[11px] text-[#929BAA] truncate mt-0.5">
                    {act.subtitle}
                  </div>
                </div>
                <span className="text-[11px] font-mono tabular-nums text-[#929BAA] shrink-0">
                  {act.dateLabel}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
