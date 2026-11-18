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
import { Check, Loader2, Plus, Trash2, XCircle } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import {
  formatAppError,
  formatCurrency,
  formatDateBR,
  getPaymentMethodLabel,
  getPaymentStatusLabel,
  todayISODate,
} from '../lib/opportunity';
import type { PaymentStatus } from '../types';

interface SalesViewProps {
  onOpenSaleModal: () => void;
}

type SalesTab = 'historico' | 'analise' | 'despesas';

export function SalesView({ onOpenSaleModal }: SalesViewProps) {
  const {
    sales,
    saleItems,
    expenses,
    markSalePaidAtomic,
    cancelSale,
    createExpense,
    deleteExpense,
  } = useData();
  const { showToast } = useToast();

  const [tab, setTab] = useState<SalesTab>('historico');
  const [statusFilter, setStatusFilter] = useState<'all' | PaymentStatus>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Expense form
  const [expDesc, setExpDesc] = useState('');
  const [expCategory, setExpCategory] = useState('Gráfica e Produção');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(todayISODate());
  const [savingExp, setSavingExp] = useState(false);

  const summary = useMemo(() => {
    const valid = sales.filter((s) => s.paymentStatus !== 'cancelado');
    const paid = valid.filter((s) => s.paymentStatus === 'pago');
    const pending = valid.filter((s) => s.paymentStatus === 'pendente');

    const totalRevenue = valid.reduce((acc, s) => acc + s.totalRevenue, 0);
    const totalReceived = paid.reduce((acc, s) => acc + s.totalRevenue, 0);
    const totalPending = pending.reduce((acc, s) => acc + s.totalRevenue, 0);
    const totalProductCost = valid.reduce((acc, s) => acc + s.totalCost, 0);
    const totalExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);
    const grossProfit = totalRevenue - totalProductCost - totalExpenses;
    const avgMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const avgTicket = valid.length > 0 ? totalRevenue / valid.length : 0;

    return {
      totalRevenue,
      totalReceived,
      totalPending,
      pendingCount: pending.length,
      totalCost: totalProductCost + totalExpenses,
      grossProfit,
      avgMargin,
      avgTicket,
    };
  }, [sales, expenses]);

  const filteredSales = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return sales
      .filter((s) => {
        if (statusFilter !== 'all' && s.paymentStatus !== statusFilter) return false;
        if (
          q &&
          !s.customerName.toLowerCase().includes(q) &&
          !s.productSummary.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.saleDate.localeCompare(a.saleDate));
  }, [sales, statusFilter, searchTerm]);

  const productPerformance = useMemo(() => {
    const validSaleIds = new Set(
      sales.filter((s) => s.paymentStatus !== 'cancelado').map((s) => s.id)
    );
    const map: Record<
      string,
      { name: string; quantity: number; revenue: number; cost: number; profit: number }
    > = {};
    for (const item of saleItems) {
      if (!validSaleIds.has(item.saleId)) continue;
      if (!map[item.productId]) {
        map[item.productId] = {
          name: item.productName,
          quantity: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
        };
      }
      map[item.productId].quantity += item.quantity;
      map[item.productId].revenue += item.subtotal;
      const itemCost = item.quantity * item.unitCost;
      map[item.productId].cost += itemCost;
      map[item.productId].profit += item.subtotal - itemCost;
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [sales, saleItems]);

  const topCustomers = useMemo(() => {
    const map: Record<string, { name: string; orders: number; units: number; total: number }> = {};
    for (const s of sales) {
      if (s.paymentStatus === 'cancelado') continue;
      const key = s.customerName.trim() || 'Cliente';
      if (!map[key]) {
        map[key] = { name: key, orders: 0, units: 0, total: 0 };
      }
      map[key].orders += 1;
      map[key].units += s.totalQuantity;
      map[key].total += s.totalRevenue;
    }
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [sales]);

  const monthlyChart = useMemo(() => {
    const valid = sales.filter((s) => s.paymentStatus !== 'cancelado');
    const out: Array<{ label: string; faturamento: number; lucro: number }> = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const list = valid.filter((s) => s.saleDate.startsWith(ym));
      out.push({
        label: `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`,
        faturamento: list.reduce((a, s) => a + s.totalRevenue, 0),
        lucro: list.reduce((a, s) => a + s.grossProfit, 0),
      });
    }
    return out;
  }, [sales]);

  const handleMarkPaid = async (saleId: string) => {
    setProcessingId(saleId);
    try {
      await markSalePaidAtomic(saleId);
      showToast('Pagamento confirmado e estoque atualizado.');
    } catch (err) {
      showToast(formatAppError(err, 'Erro ao confirmar pagamento.'), 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancel = async (saleId: string) => {
    setProcessingId(saleId);
    try {
      await cancelSale(saleId);
      showToast('Venda cancelada.');
    } catch (err) {
      showToast(formatAppError(err, 'Erro ao cancelar venda.'), 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(expAmount);
    if (!expDesc.trim() || !Number.isFinite(amount) || amount <= 0) {
      showToast('Informe descrição e valor válido para a despesa.', 'error');
      return;
    }
    setSavingExp(true);
    try {
      await createExpense({
        description: expDesc.trim(),
        category: expCategory,
        amount,
        expenseDate: expDate,
      });
      setExpDesc('');
      setExpAmount('');
      showToast('Despesa registrada.');
    } catch (err) {
      showToast(formatAppError(err, 'Erro ao salvar despesa.'), 'error');
    } finally {
      setSavingExp(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="bg-[#141821] border border-[#252B36] rounded-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-y lg:divide-y-0 lg:divide-x divide-[#252B36] overflow-hidden">
        <div className="p-4 space-y-1">
          <div className="text-[11px] font-medium text-[#929BAA]">Faturamento total</div>
          <div className="text-base font-semibold font-mono tabular-nums text-[#F5F7FA]">
            {formatCurrency(summary.totalRevenue)}
          </div>
        </div>
        <div className="p-4 space-y-1">
          <div className="text-[11px] font-medium text-[#929BAA]">Recebido</div>
          <div className="text-base font-semibold font-mono tabular-nums text-[#19C37D]">
            {formatCurrency(summary.totalReceived)}
          </div>
        </div>
        <div className="p-4 space-y-1">
          <div className="text-[11px] font-medium text-[#929BAA]">Pendente ({summary.pendingCount})</div>
          <div className="text-base font-semibold font-mono tabular-nums text-amber-400">
            {formatCurrency(summary.totalPending)}
          </div>
        </div>
        <div className="p-4 space-y-1">
          <div className="text-[11px] font-medium text-[#929BAA]">Custos + Despesas</div>
          <div className="text-base font-semibold font-mono tabular-nums text-[#929BAA]">
            {formatCurrency(summary.totalCost)}
          </div>
        </div>
        <div className="p-4 space-y-1">
          <div className="text-[11px] font-medium text-[#929BAA]">Lucro líquido</div>
          <div
            className={`text-base font-semibold font-mono tabular-nums ${
              summary.grossProfit >= 0 ? 'text-[#19C37D]' : 'text-rose-400'
            }`}
          >
            {formatCurrency(summary.grossProfit)}
          </div>
        </div>
        <div className="p-4 space-y-1">
          <div className="text-[11px] font-medium text-[#929BAA]">Ticket médio · Margem</div>
          <div className="text-sm font-semibold font-mono tabular-nums text-[#F5F7FA]">
            {formatCurrency(summary.avgTicket)} · {summary.avgMargin.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-[#141821] border border-[#252B36] rounded-xl p-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
          {[
            { id: 'historico', label: 'Histórico de vendas' },
            { id: 'analise', label: 'Produtos e clientes' },
            { id: 'despesas', label: `Despesas (${expenses.length})` },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as SalesTab)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap shrink-0 ${
                tab === item.id
                  ? 'bg-[#0B0D12] text-[#F5F7FA] border border-[#252B36] shadow-xs'
                  : 'text-[#929BAA] hover:text-[#F5F7FA]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onOpenSaleModal}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#19C37D] text-[#0B0D12] text-xs font-semibold hover:bg-[#16AE6F] active:scale-[0.98] transition-all whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Registrar venda
        </button>
      </div>

      {/* Tab 1: Histórico */}
      {tab === 'historico' && (
        <div className="space-y-4">
          <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por cliente ou produto..."
              className="flex-1 min-w-[200px] h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] placeholder:text-[#929BAA]/60 focus:outline-none focus:border-[#19C37D] transition-colors"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | PaymentStatus)}
              className="h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
            >
              <option value="all">Todos os status</option>
              <option value="pago">Pago</option>
              <option value="pendente">Pendente</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>

          <div className="bg-[#141821] border border-[#252B36] rounded-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] overflow-hidden">
            {filteredSales.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <div className="text-sm font-semibold text-[#F5F7FA]">
                  Nenhuma venda registrada
                </div>
                <p className="text-xs text-[#929BAA] max-w-md mx-auto">
                  Registre sua primeira venda para acompanhar faturamento, lucro bruto e baixa automática no estoque.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#252B36] text-[11px] font-medium text-[#929BAA]">
                      <th className="py-3.5 px-4">Data</th>
                      <th className="py-3.5 px-4">Cliente</th>
                      <th className="py-3.5 px-4">Produtos</th>
                      <th className="py-3.5 px-4">Pagamento</th>
                      <th className="py-3.5 px-4">Receita</th>
                      <th className="py-3.5 px-4">Lucro bruto</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#252B36] text-xs">
                    {filteredSales.map((s) => (
                      <tr key={s.id} className="hover:bg-[#181D28]/80 transition-colors">
                        <td className="py-3.5 px-4 font-mono tabular-nums text-[#929BAA] whitespace-nowrap">
                          {formatDateBR(s.saleDate)}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-[#F5F7FA]">
                          {s.customerName}
                        </td>
                        <td className="py-3.5 px-4 text-[#929BAA] max-w-[220px] truncate">
                          {s.productSummary}
                        </td>
                        <td className="py-3.5 px-4 text-[#929BAA] whitespace-nowrap">
                          {getPaymentMethodLabel(s.paymentMethod)}
                        </td>
                        <td className="py-3.5 px-4 font-mono tabular-nums text-[#F5F7FA] whitespace-nowrap">
                          {formatCurrency(s.totalRevenue)}
                        </td>
                        <td className="py-3.5 px-4 font-mono tabular-nums text-[#19C37D] whitespace-nowrap">
                          {formatCurrency(s.grossProfit)}{' '}
                          <span className="text-[11px] text-[#929BAA]">
                            ({s.marginPercent.toFixed(0)}%)
                          </span>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={`font-medium ${
                              s.paymentStatus === 'pago'
                                ? 'text-[#19C37D]'
                                : s.paymentStatus === 'pendente'
                                  ? 'text-amber-400'
                                  : 'text-rose-400'
                            }`}
                          >
                            {getPaymentStatusLabel(s.paymentStatus)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {s.paymentStatus === 'pendente' && (
                              <button
                                type="button"
                                disabled={processingId === s.id}
                                onClick={() => void handleMarkPaid(s.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#19C37D] text-[#0B0D12] text-[11px] font-semibold hover:bg-[#16AE6F] active:scale-[0.98] transition-all disabled:opacity-50"
                              >
                                {processingId === s.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Check className="w-3 h-3" />
                                )}
                                Confirmar
                              </button>
                            )}
                            {s.paymentStatus !== 'cancelado' && (
                              <button
                                type="button"
                                disabled={processingId === s.id}
                                onClick={() => void handleCancel(s.id)}
                                title="Cancelar venda"
                                className="p-1.5 rounded-xl text-[#929BAA] hover:text-rose-400 hover:bg-[#0B0D12] transition-colors"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Análise Produtos e Clientes */}
      {tab === 'analise' && (
        <div className="space-y-4">
          <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-5 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
            <h3 className="text-sm font-semibold text-[#F5F7FA]">
              Faturamento e lucro mensal (últimos 6 meses)
            </h3>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChart}>
                  <CartesianGrid stroke="#252B36" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" stroke="#929BAA" fontSize={11} tickLine={false} />
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
                  <Bar dataKey="faturamento" name="Faturamento" fill="#3B82F6" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="lucro" name="Lucro bruto" fill="#19C37D" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-5 space-y-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
              <h3 className="text-sm font-semibold text-[#F5F7FA]">
                Produtos mais vendidos e lucro
              </h3>
              {productPerformance.length === 0 ? (
                <p className="text-xs text-[#929BAA]">Sem dados de vendas concluídas.</p>
              ) : (
                <div className="divide-y divide-[#252B36] text-xs">
                  {productPerformance.map((p) => (
                    <div key={p.name} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-[#F5F7FA] truncate">{p.name}</div>
                        <div className="text-[11px] text-[#929BAA] font-mono tabular-nums">
                          {p.quantity} un. vendidas
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums shrink-0">
                        <div className="text-[#F5F7FA]">{formatCurrency(p.revenue)}</div>
                        <div className="text-[11px] text-[#19C37D]">
                          Lucro: {formatCurrency(p.profit)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-5 space-y-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
              <h3 className="text-sm font-semibold text-[#F5F7FA]">
                Clientes que mais compram
              </h3>
              {topCustomers.length === 0 ? (
                <p className="text-xs text-[#929BAA]">Nenhum cliente registrado ainda.</p>
              ) : (
                <div className="divide-y divide-[#252B36] text-xs">
                  {topCustomers.map((c) => (
                    <div key={c.name} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-[#F5F7FA] truncate">{c.name}</div>
                        <div className="text-[11px] text-[#929BAA] font-mono tabular-nums">
                          {c.orders} pedido(s) · {c.units} placas
                        </div>
                      </div>
                      <div className="font-mono tabular-nums font-semibold text-[#19C37D] shrink-0">
                        {formatCurrency(c.total)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Despesas */}
      {tab === 'despesas' && (
        <div className="space-y-4">
          <form
            onSubmit={handleAddExpense}
            className="bg-[#141821] border border-[#252B36] rounded-2xl p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
          >
            <div className="sm:col-span-4">
              <label className="block text-[11px] font-medium text-[#929BAA] mb-1.5">Descrição</label>
              <input
                type="text"
                required
                value={expDesc}
                onChange={(e) => setExpDesc(e.target.value)}
                placeholder="Ex.: Tags NFC NTAG215, embalagem, combustível..."
                className="w-full h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-[11px] font-medium text-[#929BAA] mb-1.5">Categoria</label>
              <select
                value={expCategory}
                onChange={(e) => setExpCategory(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
              >
                <option value="Gráfica e Produção">Gráfica e Produção</option>
                <option value="Insumos NFC">Insumos NFC</option>
                <option value="Logística e Entrega">Logística e Entrega</option>
                <option value="Marketing">Marketing</option>
                <option value="Operacional">Operacional</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-medium text-[#929BAA] mb-1.5">Valor (R$)</label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={expAmount}
                onChange={(e) => setExpAmount(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs font-mono tabular-nums text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-medium text-[#929BAA] mb-1.5">Data</label>
              <input
                type="date"
                value={expDate}
                onChange={(e) => setExpDate(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
              />
            </div>
            <div className="sm:col-span-1">
              <button
                type="submit"
                disabled={savingExp}
                className="w-full h-10 rounded-xl bg-[#19C37D] text-[#0B0D12] text-xs font-semibold hover:bg-[#16AE6F] active:scale-[0.98] transition-all flex items-center justify-center"
              >
                {savingExp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Salvar'}
              </button>
            </div>
          </form>

          <div className="bg-[#141821] border border-[#252B36] rounded-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] overflow-hidden">
            {expenses.length === 0 ? (
              <div className="p-10 text-center text-xs text-[#929BAA]">
                Nenhuma despesa operacional cadastrada.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#252B36] text-[11px] font-medium text-[#929BAA]">
                      <th className="py-3.5 px-4">Data</th>
                      <th className="py-3.5 px-4">Descrição</th>
                      <th className="py-3.5 px-4">Categoria</th>
                      <th className="py-3.5 px-4">Valor</th>
                      <th className="py-3.5 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#252B36] text-xs">
                    {expenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-[#181D28]/80 transition-colors">
                        <td className="py-3.5 px-4 font-mono tabular-nums text-[#929BAA] whitespace-nowrap">
                          {formatDateBR(exp.expenseDate)}
                        </td>
                        <td className="py-3.5 px-4 text-[#F5F7FA]">{exp.description}</td>
                        <td className="py-3.5 px-4 text-[#929BAA] whitespace-nowrap">{exp.category}</td>
                        <td className="py-3.5 px-4 font-mono tabular-nums text-rose-400 whitespace-nowrap">
                          {formatCurrency(exp.amount)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => void deleteExpense(exp.id)}
                            className="p-1.5 rounded-xl text-[#929BAA] hover:text-rose-400 hover:bg-[#0B0D12] transition-colors"
                            title="Excluir despesa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
