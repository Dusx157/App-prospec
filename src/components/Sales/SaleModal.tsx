import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useData } from '../../contexts/DataContext';
import { useToast } from '../../contexts/ToastContext';
import { formatAppError, formatCurrency, todayISODate } from '../../lib/opportunity';
import type { Lead, PaymentMethod, PaymentStatus } from '../../types';

interface SaleModalProps {
  open: boolean;
  initialLead?: Lead | null;
  onClose: () => void;
}

export function SaleModal({ open, initialLead, onClose }: SaleModalProps) {
  const { leads, products, createSaleAtomic, createProduct } = useData();
  const { showToast } = useToast();

  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [items, setItems] = useState<Array<{ productId: string; quantity: number; unitPrice: number }>>([]);
  const [discount, setDiscount] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pago');
  const [saleDate, setSaleDate] = useState(todayISODate());
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [seedingProduct, setSeedingProduct] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initialLead) {
      setSelectedLeadId(initialLead.id);
      setCustomerName(initialLead.businessName);
    } else {
      setSelectedLeadId('');
      setCustomerName('');
    }
    setDiscount(0);
    setShipping(0);
    setPaymentMethod('pix');
    setPaymentStatus('pago');
    setSaleDate(todayISODate());
    setNotes('');
    if (products.length > 0) {
      const p = products.find((item) => item.active) || products[0];
      setItems([{ productId: p.id, quantity: 1, unitPrice: p.salePrice }]);
    } else {
      setItems([]);
    }
    // Only reset when modal opens or initialLead changes — never wipe inputs when products snapshot updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialLead]);

  useEffect(() => {
    if (!open) return;
    if (items.length === 0 && products.length > 0) {
      const p = products.find((item) => item.active) || products[0];
      setItems([{ productId: p.id, quantity: 1, unitPrice: p.salePrice }]);
    }
  }, [open, products, items.length]);

  const handleLeadChange = (leadId: string) => {
    setSelectedLeadId(leadId);
    const found = leads.find((l) => l.id === leadId);
    if (found) setCustomerName(found.businessName);
  };

  const handleCreateDefaultProduct = async () => {
    setSeedingProduct(true);
    try {
      const prod = await createProduct({
        name: 'Placa NFC de avaliação Google',
        sku: 'NFC-GOOGLE-01',
        unitCost: 22,
        salePrice: 129,
        stockQuantity: 25,
        minStock: 5,
      });
      setItems([{ productId: prod.id, quantity: 1, unitPrice: prod.salePrice }]);
      showToast('Produto padrão cadastrado no estoque.');
    } catch (err) {
      showToast(formatAppError(err, 'Erro ao criar produto.'), 'error');
    } finally {
      setSeedingProduct(false);
    }
  };

  const totals = useMemo(() => {
    let subtotal = 0;
    let cost = 0;
    for (const item of items) {
      const prod = products.find((p) => p.id === item.productId);
      const qty = Math.max(1, Number(item.quantity) || 1);
      const price = Math.max(0, Number(item.unitPrice) || 0);
      const unitCost = prod ? prod.avgAcquisitionCost || prod.unitCost : 0;
      subtotal += qty * price;
      cost += qty * unitCost;
    }
    const totalRevenue = Math.max(0, subtotal - (Number(discount) || 0) + (Number(shipping) || 0));
    const grossProfit = totalRevenue - cost;
    const margin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    return { subtotal, cost, totalRevenue, grossProfit, margin };
  }, [items, products, discount, shipping]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      showToast('Informe o nome do cliente.', 'error');
      return;
    }
    if (items.length === 0) {
      showToast('Adicione pelo menos um produto à venda.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await createSaleAtomic({
        leadId: selectedLeadId || undefined,
        customerName: customerName.trim(),
        items,
        discount: Number(discount) || 0,
        shipping: Number(shipping) || 0,
        paymentMethod,
        paymentStatus,
        saleDate,
        notes: notes.trim(),
      });
      showToast('Venda registrada e indicadores atualizados.');
      onClose();
    } catch (err) {
      showToast(formatAppError(err, 'Erro ao registrar venda.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/65 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: 'spring', stiffness: 360, damping: 32 }}
            className="relative z-10 w-full max-w-2xl bg-[#141821]/95 backdrop-blur-xl border border-[#252B36] rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
          >
        <div className="px-6 py-4 border-b border-[#252B36] flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#F5F7FA]">Registrar nova venda</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#929BAA] hover:text-[#F5F7FA] rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#929BAA] mb-1.5">Vincular lead (opcional)</label>
              <select
                value={selectedLeadId}
                onChange={(e) => handleLeadChange(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
              >
                <option value="">Cliente avulso (sem lead)</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.businessName} {l.city ? `— ${l.city}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#929BAA] mb-1.5">Nome do cliente *</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ex.: Barbearia Central"
                className="w-full h-9 px-3 rounded-lg bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
              />
            </div>
          </div>

          {/* Items */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-[#F5F7FA]">Produtos</label>
              {products.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const p = products[0];
                    setItems((prev) => [
                      ...prev,
                      { productId: p.id, quantity: 1, unitPrice: p.salePrice },
                    ]);
                  }}
                  className="inline-flex items-center gap-1 text-xs text-[#19C37D] hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar item
                </button>
              )}
            </div>

            {products.length === 0 ? (
              <div className="bg-[#0B0D12] border border-[#252B36] rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-xs text-[#929BAA]">
                  Nenhum produto cadastrado no estoque ainda.
                </span>
                <button
                  type="button"
                  onClick={handleCreateDefaultProduct}
                  disabled={seedingProduct}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#19C37D] text-[#0B0D12] text-xs font-semibold hover:bg-[#16AE6F]"
                >
                  {seedingProduct && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Criar Placa NFC Google padrão
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item, idx) => {
                  const selectedProd = products.find((p) => p.id === item.productId);
                  return (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 items-center bg-[#0B0D12] border border-[#252B36] rounded-lg p-2.5"
                    >
                      <div className="col-span-12 sm:col-span-6">
                        <select
                          value={item.productId}
                          onChange={(e) => {
                            const prod = products.find((p) => p.id === e.target.value);
                            setItems((prev) =>
                              prev.map((it, i) =>
                                i === idx
                                  ? {
                                      ...it,
                                      productId: e.target.value,
                                      unitPrice: prod ? prod.salePrice : it.unitPrice,
                                    }
                                  : it
                              )
                            );
                          }}
                          className="w-full h-8 px-2.5 rounded-md bg-[#141821] border border-[#252B36] text-xs text-[#F5F7FA]"
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (Est.: {p.stockQuantity})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((it, i) =>
                                i === idx ? { ...it, quantity: Number(e.target.value) } : it
                              )
                            )
                          }
                          className="w-full h-8 px-2.5 rounded-md bg-[#141821] border border-[#252B36] text-xs font-mono tabular-nums text-[#F5F7FA]"
                          title="Quantidade"
                        />
                      </div>
                      <div className="col-span-6 sm:col-span-3">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((it, i) =>
                                i === idx ? { ...it, unitPrice: Number(e.target.value) } : it
                              )
                            )
                          }
                          className="w-full h-8 px-2.5 rounded-md bg-[#141821] border border-[#252B36] text-xs font-mono tabular-nums text-[#F5F7FA]"
                          title="Valor unitário (R$)"
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-1 flex justify-end">
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                            className="p-1 text-[#929BAA] hover:text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      {selectedProd && paymentStatus === 'pago' && item.quantity > selectedProd.stockQuantity && (
                        <div className="col-span-12 text-[11px] text-amber-400">
                          Atenção: quantidade maior que o estoque atual ({selectedProd.stockQuantity} un.).
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-[#929BAA] mb-1">Desconto (R$)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg bg-[#0B0D12] border border-[#252B36] text-xs font-mono tabular-nums text-[#F5F7FA]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#929BAA] mb-1">Frete (R$)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={shipping}
                onChange={(e) => setShipping(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg bg-[#0B0D12] border border-[#252B36] text-xs font-mono tabular-nums text-[#F5F7FA]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#929BAA] mb-1">Pagamento</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full h-9 px-2.5 rounded-lg bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA]"
              >
                <option value="pix">Pix</option>
                <option value="credito">Cartão de Crédito</option>
                <option value="debito">Cartão de Débito</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="boleto">Boleto</option>
                <option value="transferencia">Transferência</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#929BAA] mb-1">Status</label>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                className="w-full h-9 px-2.5 rounded-lg bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA]"
              >
                <option value="pago">Pago (baixa estoque)</option>
                <option value="pendente">Pendente</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#929BAA] mb-1">Data da venda</label>
              <input
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#929BAA] mb-1">Observações</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex.: Entrega combinada na sexta"
                className="w-full h-9 px-3 rounded-lg bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA]"
              />
            </div>
          </div>

          {/* Summary Strip */}
          <div className="bg-[#0B0D12] border border-[#252B36] rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <div className="text-[11px] text-[#929BAA]">Receita total</div>
              <div className="text-sm font-semibold font-mono tabular-nums text-[#F5F7FA] mt-0.5">
                {formatCurrency(totals.totalRevenue)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#929BAA]">Custo produtos</div>
              <div className="text-sm font-semibold font-mono tabular-nums text-[#929BAA] mt-0.5">
                {formatCurrency(totals.cost)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#929BAA]">Lucro bruto</div>
              <div className="text-sm font-semibold font-mono tabular-nums text-[#19C37D] mt-0.5">
                {formatCurrency(totals.grossProfit)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#929BAA]">Margem</div>
              <div className="text-sm font-semibold font-mono tabular-nums text-[#F5F7FA] mt-0.5">
                {totals.margin.toFixed(1)}%
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-[#929BAA] hover:text-[#F5F7FA]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || items.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#19C37D] text-[#0B0D12] text-xs font-semibold hover:bg-[#16AE6F] transition-colors disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Confirmar venda
            </button>
          </div>
        </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
