import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  Loader2,
  PackagePlus,
  Pencil,
  Plus,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { formatAppError, formatCurrency } from '../lib/opportunity';
import type { Product } from '../types';

export function InventoryView() {
  const {
    products,
    inventoryMovements,
    createProduct,
    updateProductMeta,
    adjustProductStock,
  } = useData();
  const { showToast } = useToast();

  // New / Edit Product Modal
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [unitCost, setUnitCost] = useState('22');
  const [salePrice, setSalePrice] = useState('129');
  const [stockQuantity, setStockQuantity] = useState('20');
  const [minStock, setMinStock] = useState('5');
  const [savingProduct, setSavingProduct] = useState(false);

  // Stock Movement Modal
  const [moveModalProduct, setMoveModalProduct] = useState<Product | null>(null);
  const [moveType, setMoveType] = useState<'entrada' | 'ajuste'>('entrada');
  const [moveQty, setMoveQty] = useState('10');
  const [moveUnitCost, setMoveUnitCost] = useState('');
  const [moveReason, setMoveReason] = useState('');
  const [savingMove, setSavingMove] = useState(false);

  const lowStockProducts = useMemo(
    () => products.filter((p) => p.active && p.stockQuantity <= p.minStock),
    [products]
  );

  const totalInventoryValue = useMemo(
    () =>
      products.reduce(
        (acc, p) => acc + p.stockQuantity * (p.avgAcquisitionCost || p.unitCost),
        0
      ),
    [products]
  );

  const totalPotentialRevenue = useMemo(
    () => products.reduce((acc, p) => acc + p.stockQuantity * p.salePrice, 0),
    [products]
  );

  const openNewProduct = () => {
    setEditingProduct(null);
    setName('');
    setSku('');
    setUnitCost('22');
    setSalePrice('129');
    setStockQuantity('20');
    setMinStock('5');
    setProductModalOpen(true);
  };

  const openEditProduct = (p: Product) => {
    setEditingProduct(p);
    setName(p.name);
    setSku(p.sku);
    setUnitCost(String(p.unitCost));
    setSalePrice(String(p.salePrice));
    setStockQuantity(String(p.stockQuantity));
    setMinStock(String(p.minStock));
    setProductModalOpen(true);
  };

  const openMoveModal = (p: Product, type: 'entrada' | 'ajuste') => {
    setMoveModalProduct(p);
    setMoveType(type);
    setMoveQty(type === 'entrada' ? '10' : '0');
    setMoveUnitCost(String(p.avgAcquisitionCost || p.unitCost));
    setMoveReason(type === 'entrada' ? 'Reposição de estoque' : 'Ajuste de inventário');
  };

  const handleSeedDefault = async () => {
    setSavingProduct(true);
    try {
      await createProduct({
        name: 'Placa NFC de avaliação Google',
        sku: 'NFC-GOOGLE-01',
        unitCost: 22,
        salePrice: 129,
        stockQuantity: 30,
        minStock: 5,
      });
      showToast('Placa NFC de avaliação Google cadastrada com sucesso.');
    } catch (err) {
      showToast(formatAppError(err, 'Erro ao cadastrar produto.'), 'error');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSavingProduct(true);
    try {
      if (editingProduct) {
        await updateProductMeta(editingProduct.id, {
          name: name.trim(),
          sku: sku.trim(),
          unitCost: Number(unitCost) || 0,
          salePrice: Number(salePrice) || 0,
          minStock: Math.max(0, Math.round(Number(minStock) || 0)),
          active: editingProduct.active,
        });
        showToast('Produto atualizado.');
      } else {
        await createProduct({
          name: name.trim(),
          sku: sku.trim() || `SKU-${Date.now().toString().slice(-4)}`,
          unitCost: Number(unitCost) || 0,
          salePrice: Number(salePrice) || 0,
          stockQuantity: Math.max(0, Math.round(Number(stockQuantity) || 0)),
          minStock: Math.max(0, Math.round(Number(minStock) || 0)),
        });
        showToast('Produto cadastrado no estoque.');
      }
      setProductModalOpen(false);
    } catch (err) {
      showToast(formatAppError(err, 'Erro ao salvar produto.'), 'error');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleSaveMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moveModalProduct) return;
    const delta = Math.round(Number(moveQty));
    if (!Number.isFinite(delta) || delta === 0) {
      showToast('Informe uma quantidade diferente de zero.', 'error');
      return;
    }
    if (moveType === 'entrada' && delta < 0) {
      showToast('Para entrada de estoque, informe uma quantidade positiva.', 'error');
      return;
    }
    setSavingMove(true);
    try {
      await adjustProductStock({
        productId: moveModalProduct.id,
        type: moveType,
        quantityDelta: delta,
        unitCost: moveType === 'entrada' ? Number(moveUnitCost) || 0 : undefined,
        reason: moveReason.trim(),
      });
      showToast('Movimentação de estoque registrada.');
      setMoveModalProduct(null);
    } catch (err) {
      showToast(formatAppError(err, 'Erro ao movimentar estoque.'), 'error');
    } finally {
      setSavingMove(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Low Stock Alert */}
      {lowStockProducts.length > 0 && (
        <div className="bg-[#141821] border border-amber-500/40 rounded-2xl p-4 flex items-start gap-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <div className="font-semibold text-[#F5F7FA]">
              Alerta de estoque baixo ({lowStockProducts.length} produto{lowStockProducts.length > 1 ? 's' : ''})
            </div>
            <div className="text-[#929BAA]">
              {lowStockProducts
                .map((p) => `${p.name} (${p.stockQuantity} un. / mín. ${p.minStock})`)
                .join(' · ')}
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards + Action */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="bg-[#141821] border border-[#252B36] rounded-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] grid grid-cols-2 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#252B36] flex-1 min-w-[260px] overflow-hidden">
          <div className="p-4 space-y-1">
            <div className="text-[11px] font-medium text-[#929BAA]">Unidades em estoque</div>
            <div className="text-lg font-semibold font-mono tabular-nums text-[#F5F7FA]">
              {products.reduce((acc, p) => acc + p.stockQuantity, 0)}
            </div>
          </div>
          <div className="p-4 space-y-1">
            <div className="text-[11px] font-medium text-[#929BAA]">Valor em custo</div>
            <div className="text-lg font-semibold font-mono tabular-nums text-[#F5F7FA]">
              {formatCurrency(totalInventoryValue)}
            </div>
          </div>
          <div className="p-4 space-y-1 col-span-2 sm:col-span-1">
            <div className="text-[11px] font-medium text-[#929BAA]">Potencial de receita</div>
            <div className="text-lg font-semibold font-mono tabular-nums text-[#19C37D]">
              {formatCurrency(totalPotentialRevenue)}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={openNewProduct}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#19C37D] text-[#0B0D12] text-xs font-semibold hover:bg-[#16AE6F] active:scale-[0.98] transition-all whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Novo produto
        </button>
      </div>

      {/* Products Table */}
      <div className="bg-[#141821] border border-[#252B36] rounded-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] overflow-hidden">
        {products.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="text-sm font-semibold text-[#F5F7FA]">
              Nenhum produto cadastrado no estoque
            </div>
            <p className="text-xs text-[#929BAA] max-w-md mx-auto">
              Cadastre suas placas NFC, displays ou suportes para controlar custos médios, estoque mínimo e baixa automática nas vendas.
            </p>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSeedDefault}
                disabled={savingProduct}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#19C37D] text-[#0B0D12] text-xs font-semibold hover:bg-[#16AE6F] active:scale-[0.98] transition-all whitespace-nowrap shrink-0"
              >
                {savingProduct && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Cadastrar Placa NFC padrão
              </button>
              <button
                type="button"
                onClick={openNewProduct}
                className="px-4 py-2 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs font-medium text-[#F5F7FA] hover:border-[#19C37D] active:scale-[0.98] transition-all whitespace-nowrap shrink-0"
              >
                Cadastrar manualmente
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#252B36] text-[11px] font-medium text-[#929BAA]">
                  <th className="py-3.5 px-4">Produto</th>
                  <th className="py-3.5 px-4">SKU</th>
                  <th className="py-3.5 px-4">Custo médio</th>
                  <th className="py-3.5 px-4">Preço venda</th>
                  <th className="py-3.5 px-4">Margem</th>
                  <th className="py-3.5 px-4">Saldo</th>
                  <th className="py-3.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#252B36] text-xs">
                {products.map((p) => {
                  const cost = p.avgAcquisitionCost || p.unitCost;
                  const margin =
                    p.salePrice > 0 ? ((p.salePrice - cost) / p.salePrice) * 100 : 0;
                  const low = p.stockQuantity <= p.minStock;
                  return (
                    <tr key={p.id} className="hover:bg-[#181D28]/80 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-[#F5F7FA]">{p.name}</td>
                      <td className="py-3.5 px-4 font-mono text-[#929BAA] whitespace-nowrap">{p.sku}</td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-[#929BAA] whitespace-nowrap">
                        {formatCurrency(cost)}
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-[#F5F7FA] whitespace-nowrap">
                        {formatCurrency(p.salePrice)}
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-[#19C37D] whitespace-nowrap">
                        {margin.toFixed(1)}%
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums whitespace-nowrap">
                        <span className={low ? 'text-amber-400 font-semibold' : 'text-[#F5F7FA]'}>
                          {p.stockQuantity} un.
                        </span>
                        <span className="text-[11px] text-[#929BAA] ml-1.5">
                          (mín. {p.minStock})
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openMoveModal(p, 'entrada')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-[11px] font-medium text-[#19C37D] hover:border-[#19C37D] active:scale-[0.98] transition-all"
                          >
                            <PackagePlus className="w-3 h-3" />
                            Entrada
                          </button>
                          <button
                            type="button"
                            onClick={() => openMoveModal(p, 'ajuste')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-[11px] font-medium text-[#929BAA] hover:text-[#F5F7FA] hover:border-[#929BAA]/50 active:scale-[0.98] transition-all"
                          >
                            <ArrowDownUp className="w-3 h-3" />
                            Ajuste
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditProduct(p)}
                            title="Editar produto"
                            className="p-1.5 rounded-xl text-[#929BAA] hover:text-[#F5F7FA] hover:bg-[#0B0D12] transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inventory Movements Ledger */}
      <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-5 space-y-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
        <h3 className="text-sm font-semibold text-[#F5F7FA]">
          Histórico de movimentações de estoque
        </h3>
        {inventoryMovements.length === 0 ? (
          <p className="text-xs text-[#929BAA]">Nenhuma movimentação registrada ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#252B36] text-[11px] font-medium text-[#929BAA]">
                  <th className="py-2.5 pr-4">Tipo</th>
                  <th className="py-2.5 pr-4">Produto</th>
                  <th className="py-2.5 pr-4">Qtd</th>
                  <th className="py-2.5 pr-4">Saldo</th>
                  <th className="py-2.5 pr-4">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#252B36] text-xs">
                {inventoryMovements.slice(0, 25).map((mov) => (
                  <tr key={mov.id} className="hover:bg-[#181D28]/60 transition-colors">
                    <td className="py-2.5 pr-4 whitespace-nowrap">
                      <span
                        className={
                          mov.type === 'entrada'
                            ? 'text-[#19C37D] font-medium'
                            : mov.type === 'saida_venda'
                              ? 'text-amber-400 font-medium'
                              : 'text-[#929BAA]'
                        }
                      >
                        {mov.type === 'entrada'
                          ? 'Entrada'
                          : mov.type === 'saida_venda'
                            ? 'Saída venda'
                            : 'Ajuste'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-[#F5F7FA]">{mov.productName}</td>
                    <td className="py-2.5 pr-4 font-mono tabular-nums text-[#F5F7FA] whitespace-nowrap">
                      {mov.quantityDelta > 0 ? `+${mov.quantityDelta}` : mov.quantityDelta}
                    </td>
                    <td className="py-2.5 pr-4 font-mono tabular-nums text-[#929BAA] whitespace-nowrap">
                      {mov.previousQuantity} → {mov.newQuantity}
                    </td>
                    <td className="py-2.5 pr-4 text-[#929BAA]">{mov.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Product Modal */}
      <AnimatePresence>
        {productModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setProductModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              className="relative z-10 w-full max-w-md bg-[#141821] border border-[#252B36] rounded-2xl p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#F5F7FA]">
                  {editingProduct ? 'Editar produto' : 'Cadastrar produto'}
                </h3>
                <button
                  type="button"
                  onClick={() => setProductModalOpen(false)}
                  className="p-1 rounded-xl text-[#929BAA] hover:text-[#F5F7FA] hover:bg-[#0B0D12] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleSaveProduct} className="space-y-3">
                <div>
                  <label className="block text-xs text-[#929BAA] mb-1.5">Nome do produto *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: Placa NFC Balcão Acrílico"
                    className="w-full h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#929BAA] mb-1.5">SKU</label>
                    <input
                      type="text"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      placeholder="NFC-001"
                      className="w-full h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs font-mono text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#929BAA] mb-1.5">Estoque mínimo</label>
                    <input
                      type="number"
                      min={0}
                      value={minStock}
                      onChange={(e) => setMinStock(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs font-mono tabular-nums text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#929BAA] mb-1.5">Custo unitário (R$)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={unitCost}
                      onChange={(e) => setUnitCost(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs font-mono tabular-nums text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#929BAA] mb-1.5">Preço de venda (R$)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={salePrice}
                      onChange={(e) => setSalePrice(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs font-mono tabular-nums text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
                    />
                  </div>
                </div>
                {!editingProduct && (
                  <div>
                    <label className="block text-xs text-[#929BAA] mb-1.5">Estoque inicial (un.)</label>
                    <input
                      type="number"
                      min={0}
                      value={stockQuantity}
                      onChange={(e) => setStockQuantity(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs font-mono tabular-nums text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
                    />
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-3 border-t border-[#252B36]">
                  <button
                    type="button"
                    onClick={() => setProductModalOpen(false)}
                    className="px-3.5 py-2 rounded-xl text-xs font-medium text-[#929BAA] hover:text-[#F5F7FA]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingProduct}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#19C37D] text-[#0B0D12] text-xs font-semibold hover:bg-[#16AE6F] active:scale-[0.98] transition-all"
                  >
                    {savingProduct && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Salvar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Movement Modal */}
      <AnimatePresence>
        {moveModalProduct && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setMoveModalProduct(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              className="relative z-10 w-full max-w-md bg-[#141821] border border-[#252B36] rounded-2xl p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-[#F5F7FA] truncate">
                  {moveType === 'entrada' ? 'Entrada de estoque' : 'Ajuste de estoque'} ·{' '}
                  {moveModalProduct.name}
                </h3>
                <button
                  type="button"
                  onClick={() => setMoveModalProduct(null)}
                  className="p-1 rounded-xl text-[#929BAA] hover:text-[#F5F7FA] hover:bg-[#0B0D12] transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleSaveMovement} className="space-y-3">
                <div className="text-xs text-[#929BAA]">
                  Saldo atual:{' '}
                  <span className="font-mono text-[#F5F7FA]">
                    {moveModalProduct.stockQuantity} un.
                  </span>
                </div>
                <div>
                  <label className="block text-xs text-[#929BAA] mb-1.5">
                    {moveType === 'entrada'
                      ? 'Quantidade recebida (+)'
                      : 'Variação (use número negativo para baixa)'}
                  </label>
                  <input
                    type="number"
                    required
                    value={moveQty}
                    onChange={(e) => setMoveQty(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs font-mono tabular-nums text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
                  />
                </div>
                {moveType === 'entrada' && (
                  <div>
                    <label className="block text-xs text-[#929BAA] mb-1.5">
                      Custo unitário desta remessa (R$)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={moveUnitCost}
                      onChange={(e) => setMoveUnitCost(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs font-mono tabular-nums text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs text-[#929BAA] mb-1.5">Motivo / observação</label>
                  <input
                    type="text"
                    value={moveReason}
                    onChange={(e) => setMoveReason(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D]"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-3 border-t border-[#252B36]">
                  <button
                    type="button"
                    onClick={() => setMoveModalProduct(null)}
                    className="px-3.5 py-2 rounded-xl text-xs font-medium text-[#929BAA] hover:text-[#F5F7FA]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingMove}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#19C37D] text-[#0B0D12] text-xs font-semibold hover:bg-[#16AE6F] active:scale-[0.98] transition-all"
                  >
                    {savingMove && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Confirmar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
