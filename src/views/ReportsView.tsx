import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import {
  formatCurrency,
  formatDateBR,
  getPaymentMethodLabel,
  getPaymentStatusLabel,
  getStageLabel,
  todayISODate,
} from '../lib/opportunity';

type PeriodPreset = '7d' | '30d' | '90d' | 'all' | 'custom';

function shiftDays(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function tsToIsoDate(ts?: { toDate?: () => Date }): string {
  if (!ts || typeof ts.toDate !== 'function') return todayISODate();
  return ts.toDate().toISOString().slice(0, 10);
}

export function ReportsView() {
  const { businesses, leads, sales, expenses, products } = useData();
  const { showToast } = useToast();

  const [preset, setPreset] = useState<PeriodPreset>('30d');
  const [customStart, setCustomStart] = useState(shiftDays(30));
  const [customEnd, setCustomEnd] = useState(todayISODate());

  const range = useMemo(() => {
    const end = preset === 'custom' ? customEnd : todayISODate();
    if (preset === '7d') return { start: shiftDays(7), end };
    if (preset === '30d') return { start: shiftDays(30), end };
    if (preset === '90d') return { start: shiftDays(90), end };
    if (preset === 'custom') return { start: customStart, end: customEnd };
    return { start: '1970-01-01', end: '2999-12-31' };
  }, [preset, customStart, customEnd]);

  const inRange = (isoDate: string) =>
    isoDate >= range.start && isoDate <= range.end;

  const report = useMemo(() => {
    const periodBusinesses = businesses.filter((b) => inRange(tsToIsoDate(b.createdAt)));
    const periodLeads = leads.filter((l) => inRange(tsToIsoDate(l.createdAt)));
    const approachedLeads = periodLeads.filter(
      (l) => l.stage !== 'novo_lead' && l.stage !== 'nao_contatado'
    );
    const interestedLeads = periodLeads.filter(
      (l) => l.stage === 'interessado' || l.stage === 'em_negociacao'
    );

    const periodSales = sales.filter(
      (s) => s.paymentStatus !== 'cancelado' && inRange(s.saleDate)
    );
    const periodExpenses = expenses.filter((e) => inRange(e.expenseDate));

    const revenue = periodSales.reduce((a, s) => a + s.totalRevenue, 0);
    const productCost = periodSales.reduce((a, s) => a + s.totalCost, 0);
    const expenseSum = periodExpenses.reduce((a, e) => a + e.amount, 0);
    const grossProfit = revenue - productCost - expenseSum;
    const unitsSold = periodSales.reduce((a, s) => a + s.totalQuantity, 0);
    const avgTicket = periodSales.length > 0 ? revenue / periodSales.length : 0;
    const conversionRate =
      periodLeads.length > 0 ? (periodSales.length / periodLeads.length) * 100 : 0;

    // Payment method breakdown
    const methodMap: Record<string, { method: string; total: number; count: number }> = {};
    for (const s of periodSales) {
      const label = getPaymentMethodLabel(s.paymentMethod);
      if (!methodMap[label]) methodMap[label] = { method: label, total: 0, count: 0 };
      methodMap[label].total += s.totalRevenue;
      methodMap[label].count += 1;
    }

    return {
      businessesFound: periodBusinesses.length,
      leadsFound: periodLeads.length,
      leadsApproached: approachedLeads.length,
      leadsInterested: interestedLeads.length,
      salesConverted: periodSales.length,
      conversionRate,
      revenue,
      grossProfit,
      avgTicket,
      unitsSold,
      periodSales,
      periodLeads,
      paymentBreakdown: Object.values(methodMap),
    };
  }, [businesses, leads, sales, expenses, range]);

  const handleExportCSV = () => {
    const headers = [
      'Data',
      'Cliente',
      'Produtos',
      'Quantidade',
      'Receita (R$)',
      'Custo (R$)',
      'Lucro Bruto (R$)',
      'Pagamento',
      'Status',
    ];
    const rows = report.periodSales.map((s) => [
      formatDateBR(s.saleDate),
      `"${s.customerName.replace(/"/g, '""')}"`,
      `"${s.productSummary.replace(/"/g, '""')}"`,
      s.totalQuantity,
      s.totalRevenue.toFixed(2),
      s.totalCost.toFixed(2),
      s.grossProfit.toFixed(2),
      getPaymentMethodLabel(s.paymentMethod),
      getPaymentStatusLabel(s.paymentStatus),
    ]);

    const csv = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nfc-prospect-relatorio-${todayISODate()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Relatório CSV exportado.');
  };

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    const summarySheet = XLSX.utils.json_to_sheet([
      { Indicador: 'Estabelecimentos encontrados', Valor: report.businessesFound },
      { Indicador: 'Leads cadastrados', Valor: report.leadsFound },
      { Indicador: 'Leads abordados', Valor: report.leadsApproached },
      { Indicador: 'Leads interessados', Valor: report.leadsInterested },
      { Indicador: 'Vendas convertidas', Valor: report.salesConverted },
      { Indicador: 'Taxa de conversão (%)', Valor: Number(report.conversionRate.toFixed(2)) },
      { Indicador: 'Faturamento (R$)', Valor: Number(report.revenue.toFixed(2)) },
      { Indicador: 'Lucro bruto (R$)', Valor: Number(report.grossProfit.toFixed(2)) },
      { Indicador: 'Ticket médio (R$)', Valor: Number(report.avgTicket.toFixed(2)) },
      { Indicador: 'Quantidade de placas vendidas', Valor: report.unitsSold },
    ]);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Resumo');

    const salesSheet = XLSX.utils.json_to_sheet(
      report.periodSales.map((s) => ({
        Data: formatDateBR(s.saleDate),
        Cliente: s.customerName,
        Produtos: s.productSummary,
        Quantidade: s.totalQuantity,
        Receita: s.totalRevenue,
        Custo: s.totalCost,
        LucroBruto: s.grossProfit,
        MargemPercent: s.marginPercent,
        Pagamento: getPaymentMethodLabel(s.paymentMethod),
        Status: getPaymentStatusLabel(s.paymentStatus),
      }))
    );
    XLSX.utils.book_append_sheet(wb, salesSheet, 'Vendas');

    const leadsSheet = XLSX.utils.json_to_sheet(
      report.periodLeads.map((l) => ({
        Empresa: l.businessName,
        Categoria: l.category,
        Cidade: l.city,
        Nota: l.rating,
        Avaliacoes: l.userRatingCount,
        Pontuacao: l.opportunityScore,
        Etapa: getStageLabel(l.stage),
        Telefone: l.phone,
        Email: l.email,
        Instagram: l.instagram,
      }))
    );
    XLSX.utils.book_append_sheet(wb, leadsSheet, 'Leads');

    const stockSheet = XLSX.utils.json_to_sheet(
      products.map((p) => ({
        Produto: p.name,
        SKU: p.sku,
        Saldo: p.stockQuantity,
        Minimo: p.minStock,
        CustoMedio: p.avgAcquisitionCost,
        PrecoVenda: p.salePrice,
      }))
    );
    XLSX.utils.book_append_sheet(wb, stockSheet, 'Estoque');

    XLSX.writeFile(wb, `nfc-prospect-relatorio-${todayISODate()}.xlsx`);
    showToast('Planilha Excel (.xlsx) exportada.');
  };

  const indicators = [
    { label: 'Leads encontrados', value: String(report.leadsFound) },
    { label: 'Leads abordados', value: String(report.leadsApproached) },
    { label: 'Leads interessados', value: String(report.leadsInterested) },
    { label: 'Vendas convertidas', value: String(report.salesConverted) },
    { label: 'Taxa de conversão', value: `${report.conversionRate.toFixed(1)}%` },
    { label: 'Faturamento', value: formatCurrency(report.revenue) },
    { label: 'Lucro bruto', value: formatCurrency(report.grossProfit), accent: report.grossProfit > 0 },
    { label: 'Ticket médio', value: formatCurrency(report.avgTicket) },
    { label: 'Placas vendidas', value: String(report.unitsSold) },
  ];

  return (
    <div className="space-y-5">
      {/* Controls & Export */}
      <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: '7d', label: '7 dias' },
            { id: '30d', label: '30 dias' },
            { id: '90d', label: '90 dias' },
            { id: 'all', label: 'Tudo' },
            { id: 'custom', label: 'Personalizado' },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id as PeriodPreset)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-[0.98] whitespace-nowrap shrink-0 ${
                preset === p.id
                  ? 'bg-[#19C37D] text-[#0B0D12] font-semibold'
                  : 'bg-[#0B0D12] border border-[#252B36] text-[#929BAA] hover:text-[#F5F7FA] hover:border-[#929BAA]/50'
              }`}
            >
              {p.label}
            </button>
          ))}

          {preset === 'custom' && (
            <div className="flex items-center gap-2 ml-1">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-9 px-3 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
              />
              <span className="text-xs text-[#929BAA]">até</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-9 px-3 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs font-medium text-[#F5F7FA] hover:border-[#19C37D] active:scale-[0.98] transition-all whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-[#929BAA]" />
            Exportar CSV
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#19C37D] text-[#0B0D12] text-xs font-semibold hover:bg-[#16AE6F] active:scale-[0.98] transition-all whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Exportar Excel
          </button>
        </div>
      </div>

      {/* 9 Indicators */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {indicators.map((ind) => (
          <div
            key={ind.label}
            className="bg-[#141821] border border-[#252B36] rounded-2xl p-4 space-y-1.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]"
          >
            <div className="text-[11px] font-medium text-[#929BAA]">{ind.label}</div>
            <div
              className={`text-lg font-semibold font-mono tabular-nums ${
                ind.accent ? 'text-[#19C37D]' : 'text-[#F5F7FA]'
              }`}
            >
              {ind.value}
            </div>
          </div>
        ))}
      </div>

      {/* Payment Breakdown & Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-5 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
          <h3 className="text-sm font-semibold text-[#F5F7FA]">
            Receita por forma de pagamento no período
          </h3>
          {report.paymentBreakdown.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-xs text-[#929BAA]">
              Nenhuma venda encontrada no período selecionado.
            </div>
          ) : (
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.paymentBreakdown}>
                  <CartesianGrid stroke="#252B36" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="method" stroke="#929BAA" fontSize={11} tickLine={false} />
                  <YAxis stroke="#929BAA" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(11, 13, 18, 0.94)',
                      border: '1px solid #252B36',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: '#F5F7FA',
                      padding: '8px 12px',
                    }}
                    formatter={(v: unknown) => formatCurrency(Number(v))}
                  />
                  <Bar dataKey="total" name="Receita" fill="#19C37D" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-5 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
          <h3 className="text-sm font-semibold text-[#F5F7FA]">
            Vendas do período ({report.periodSales.length})
          </h3>
          {report.periodSales.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-xs text-[#929BAA]">
              Sem vendas registradas neste intervalo.
            </div>
          ) : (
            <div className="divide-y divide-[#252B36] max-h-52 overflow-y-auto text-xs">
              {report.periodSales.map((s) => (
                <div key={s.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-[#F5F7FA] truncate">
                      {s.customerName}
                    </div>
                    <div className="text-[11px] text-[#929BAA] truncate">
                      {formatDateBR(s.saleDate)} · {s.productSummary}
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <div className="text-[#F5F7FA]">{formatCurrency(s.totalRevenue)}</div>
                    <div className="text-[11px] text-[#19C37D]">
                      +{formatCurrency(s.grossProfit)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
