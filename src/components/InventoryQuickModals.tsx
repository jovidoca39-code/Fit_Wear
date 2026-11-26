import React, { useMemo, useState } from 'react';
import { X, ShoppingBag, PackagePlus, ImagePlus, Plus, Trash2, Check } from 'lucide-react';
import type { Product, WorkspaceData } from '../types.ts';
import {
  formatCLP,
  formatExactCLP,
  PAYMENT_METHODS,
  SALE_CHANNELS,
  todayChileISO,
} from '../lib/format.ts';
import { compressImageSourceToDataUrl } from '../lib/bulkImport.ts';
import { ProductImage } from './ProductImage.tsx';

// =============================================================================
// 1. QUICK SALE MODAL (from Inventory Card -> deducts stock & updates finances)
// =============================================================================
export const QuickSaleModal: React.FC<{
  product: Product;
  data: WorkspaceData;
  apiFetch: <T = any>(url: string, options?: RequestInit) => Promise<T>;
  onClose: () => void;
  onSuccess: (msg: string) => Promise<void>;
  onError: (msg: string) => void;
}> = ({ product, data, apiFetch, onClose, onSuccess, onError }) => {
  const firstAvail =
    product.variants.find((v) => Math.max(0, v.stock - v.reservedStock) > 0) || product.variants[0];

  const [variantId, setVariantId] = useState<number>(firstAvail?.id ?? 0);
  const [saleMode, setSaleMode] = useState<'unit' | 'pack'>(
    product.isPack && !product.allowSingleUnitSale ? 'pack' : 'unit',
  );
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState(() => {
    const isPackMode = product.isPack && !product.allowSingleUnitSale;
    const base = isPackMode
      ? product.salePrice
      : product.isPack
        ? product.singleUnitSalePrice || Math.round(product.salePrice / Math.max(1, product.packUnits))
        : product.salePrice;
    return String(Math.round(base));
  });
  const [discount, setDiscount] = useState('0');
  const [channel, setChannel] = useState<string>('Instagram');
  const [paymentMethod, setPaymentMethod] = useState<string>('Transferencia');
  const [paymentStatus, setPaymentStatus] = useState<'pagado' | 'pendiente'>('pagado');
  const [accountId, setAccountId] = useState<string>(
    String(data.accounts.find((a) => a.isDefault)?.id || data.accounts[0]?.id || ''),
  );
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedVariant = product.variants.find((v) => v.id === variantId) || product.variants[0];
  const availablePhysical = selectedVariant
    ? Math.max(0, selectedVariant.stock - selectedVariant.reservedStock)
    : 0;
  const unitsPerOrder = saleMode === 'pack' && product.isPack ? Math.max(2, product.packUnits) : 1;
  const maxQty = Math.floor(availablePhysical / unitsPerOrder);

  const qtyNum = Math.max(1, parseInt(quantity, 10) || 1);
  const priceNum = Math.max(0, Number(unitPrice) || 0);
  const discountNum = Math.max(0, Number(discount) || 0);
  const subtotal = qtyNum * priceNum;
  const total = Math.max(0, subtotal - discountNum);
  const physicalDeducted = qtyNum * unitsPerOrder;
  const estCogs = physicalDeducted * (selectedVariant?.unitCost || 0);
  const estProfit = total - estCogs;

  const handleModeChange = (nextMode: 'unit' | 'pack') => {
    setSaleMode(nextMode);
    const nextPrice =
      nextMode === 'pack'
        ? product.salePrice
        : product.singleUnitSalePrice || Math.round(product.salePrice / Math.max(1, product.packUnits));
    setUnitPrice(String(Math.round(nextPrice)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVariant) return onError('Selecciona una talla y color.');
    if (maxQty <= 0 || qtyNum > maxQty) {
      return onError(`Stock insuficiente. Disponible para venta: ${availablePhysical} prendas.`);
    }

    setSaving(true);
    try {
      const res = await apiFetch('/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          saleDate: todayChileISO(),
          customerName: customerName.trim(),
          customerPhone: '',
          channel,
          paymentMethod,
          paymentStatus,
          accountId: accountId ? Number(accountId) : null,
          discount: discountNum,
          shippingCost: 0,
          commission: 0,
          otherCost: 0,
          notes: notes.trim(),
          items: [
            {
              productId: product.id,
              variantId: selectedVariant.id,
              saleMode,
              quantity: qtyNum,
              unitPrice: priceNum,
            },
          ],
        }),
      });
      await onSuccess(
        `Venta ${res.saleNumber} registrada (${physicalDeducted} u. descontadas de ${selectedVariant.size}).`,
      );
    } catch (err: any) {
      onError(err.message || 'No se pudo registrar la venta.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-neutral-200 rounded-xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-5 space-y-4"
      >
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-emerald-600" />
            <h3 className="text-base font-semibold text-neutral-950">Venta rápida</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-neutral-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Product header */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50 border border-neutral-200">
          <ProductImage src={product.mainPhoto} alt={product.name} className="w-14 h-14 rounded-lg shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-950 truncate">{product.name}</p>
            <p className="text-xs text-neutral-500 font-mono-num">
              {product.sku} · Costo {formatExactCLP(selectedVariant?.unitCost || 0)}
            </p>
          </div>
        </div>

        {/* Variant selector */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-neutral-700">Selecciona talla y color</p>
          <div className="grid grid-cols-3 gap-2">
            {product.variants.map((v) => {
              const av = Math.max(0, v.stock - v.reservedStock);
              const active = v.id === selectedVariant?.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={av <= 0}
                  onClick={() => {
                    setVariantId(v.id);
                    setQuantity('1');
                  }}
                  className={`px-2.5 py-2 rounded-lg border text-left transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                    active
                      ? 'border-emerald-600 bg-emerald-50 text-neutral-950'
                      : 'border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span>Talla {v.size}</span>
                    <span
                      className={`font-mono-num ${
                        av <= 0 ? 'text-red-600' : av <= v.minStock ? 'text-amber-600' : 'text-emerald-700'
                      }`}
                    >
                      {av} u.
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 truncate mt-0.5">{v.color}</p>
                </button>
              );
            })}
          </div>
        </div>

        {product.isPack && product.allowSingleUnitSale && (
          <div className="flex items-center gap-2 p-1 bg-neutral-100 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => handleModeChange('unit')}
              className={`flex-1 py-1.5 rounded-md font-medium cursor-pointer ${
                saleMode === 'unit' ? 'bg-white text-neutral-950 shadow-xs' : 'text-neutral-600'
              }`}
            >
              Unidad suelta (1 u.)
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('pack')}
              className={`flex-1 py-1.5 rounded-md font-medium cursor-pointer ${
                saleMode === 'pack' ? 'bg-white text-neutral-950 shadow-xs' : 'text-neutral-600'
              }`}
            >
              Pack completo ({product.packUnits} u.)
            </button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <label className="text-xs text-neutral-700">
            Cantidad (máx. {maxQty})
            <input
              type="number"
              min={1}
              max={Math.max(1, maxQty)}
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="mt-1 w-full px-2.5 py-2 border border-neutral-200 rounded-md font-mono-num text-sm"
            />
          </label>
          <label className="text-xs text-neutral-700">
            Precio (CLP)
            <input
              type="number"
              min={0}
              required
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              className="mt-1 w-full px-2.5 py-2 border border-neutral-200 rounded-md font-mono-num text-sm"
            />
          </label>
          <label className="text-xs text-neutral-700">
            Descuento
            <input
              type="number"
              min={0}
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="mt-1 w-full px-2.5 py-2 border border-neutral-200 rounded-md font-mono-num text-sm"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-neutral-700">
            Canal de venta
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="mt-1 w-full px-2.5 py-2 border border-neutral-200 rounded-md text-xs bg-white"
            >
              {SALE_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-neutral-700">
            Medio de pago
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="mt-1 w-full px-2.5 py-2 border border-neutral-200 rounded-md text-xs bg-white"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-neutral-700">
            Estado de pago
            <select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value as 'pagado' | 'pendiente')}
              className="mt-1 w-full px-2.5 py-2 border border-neutral-200 rounded-md text-xs bg-white"
            >
              <option value="pagado">Pagado (descuenta stock e ingresa caja)</option>
              <option value="pendiente">Pendiente (reserva stock)</option>
            </select>
          </label>
          <label className="text-xs text-neutral-700">
            Cuenta de ingreso
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="mt-1 w-full px-2.5 py-2 border border-neutral-200 rounded-md text-xs bg-white"
            >
              {data.accounts.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs text-neutral-700">
            Cliente (opcional)
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nombre del cliente"
              className="mt-1 w-full px-2.5 py-2 border border-neutral-200 rounded-md text-xs"
            />
          </label>
          <label className="text-xs text-neutral-700">
            Observaciones
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Retiro en Antofagasta"
              className="mt-1 w-full px-2.5 py-2 border border-neutral-200 rounded-md text-xs"
            />
          </label>
        </div>

        {/* Summary */}
        <div className="p-3.5 rounded-lg bg-neutral-950 text-white flex items-center justify-between text-xs">
          <div>
            <p className="text-neutral-400">Total venta ({physicalDeducted} prenda{physicalDeducted > 1 ? 's' : ''})</p>
            <p className="font-mono-num text-xl font-bold text-white mt-0.5">{formatCLP(total)}</p>
          </div>
          <div className="text-right">
            <p className="text-neutral-400">Ganancia estimada</p>
            <p
              className={`font-mono-num text-sm font-semibold mt-0.5 ${
                estProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {formatCLP(estProfit)}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-neutral-200 text-neutral-700 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || maxQty <= 0}
            className="px-5 py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Registrando...' : 'Confirmar venta'}
          </button>
        </div>
      </form>
    </div>
  );
};

// =============================================================================
// 2. QUICK RESTOCK MODAL (add stock by S/M/L & optionally record cash outflow)
// =============================================================================
export const QuickRestockModal: React.FC<{
  product: Product;
  data: WorkspaceData;
  apiFetch: <T = any>(url: string, options?: RequestInit) => Promise<T>;
  onClose: () => void;
  onSuccess: (msg: string) => Promise<void>;
  onError: (msg: string) => void;
}> = ({ product, data, apiFetch, onClose, onSuccess, onError }) => {
  const defaultColor = product.variants[0]?.color || 'Negro';
  const defaultUnitCost =
    product.variants[0]?.unitCost || product.purchasePrice / Math.max(1, product.packUnits);

  // Build rows containing all existing variants + ensure S, M, L slots are always available to restock
  const initialRows = useMemo(() => {
    const rows: Array<{
      key: string;
      variantId?: number;
      color: string;
      size: string;
      currentStock: number;
      addQty: number;
    }> = product.variants.map((v) => ({
      key: `v-${v.id}`,
      variantId: v.id,
      color: v.color,
      size: v.size.toUpperCase(),
      currentStock: v.stock,
      addQty: 0,
    }));

    for (const stdSize of ['S', 'M', 'L']) {
      const exists = rows.some(
        (r) =>
          r.color.trim().toLowerCase() === defaultColor.trim().toLowerCase() &&
          r.size.toUpperCase() === stdSize,
      );
      if (!exists) {
        rows.push({
          key: `new-${defaultColor}-${stdSize}`,
          color: defaultColor,
          size: stdSize,
          currentStock: 0,
          addQty: 0,
        });
      }
    }
    const order = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
    return rows.sort((a, b) => {
      const ca = a.color.localeCompare(b.color);
      if (ca !== 0) return ca;
      const ia = order.indexOf(a.size);
      const ib = order.indexOf(b.size);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [product.variants, defaultColor]);

  const [rows, setRows] = useState(initialRows);
  const [unitCost, setUnitCost] = useState(String(Number(defaultUnitCost.toFixed(2))));
  const [reason, setReason] = useState('Reposición de stock');
  const [recordCashOutflow, setRecordCashOutflow] = useState(false);
  const [accountId, setAccountId] = useState<string>(
    String(data.accounts.find((a) => a.isDefault)?.id || data.accounts[0]?.id || ''),
  );
  const [paymentMethod, setPaymentMethod] = useState<string>('Transferencia');
  const [saving, setSaving] = useState(false);

  const totalToAdd = rows.reduce((s, r) => s + Math.max(0, r.addQty), 0);
  const costNum = Math.max(0, Number(unitCost) || 0);
  const totalInvestment = totalToAdd * costNum;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = rows
      .filter((r) => r.addQty > 0)
      .map((r) => ({
        variantId: r.variantId,
        color: r.color,
        size: r.size,
        addQty: Math.round(r.addQty),
        unitCost: costNum > 0 ? costNum : undefined,
      }));
    if (items.length === 0) {
      return onError('Ingresa al menos 1 unidad a reponer en alguna talla.');
    }

    setSaving(true);
    try {
      await apiFetch(`/api/products/${product.id}/restock`, {
        method: 'POST',
        body: JSON.stringify({
          items,
          reason: reason.trim() || 'Reposición rápida de inventario',
          recordCashOutflow,
          accountId: accountId ? Number(accountId) : null,
          paymentMethod,
          date: todayChileISO(),
        }),
      });
      await onSuccess(
        `Reposición registrada en ${product.name}: +${totalToAdd} unidad(es) añadidas al stock.`,
      );
    } catch (err: any) {
      onError(err.message || 'No se pudo registrar la reposición.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-neutral-200 rounded-xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-5 space-y-4"
      >
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <div className="flex items-center gap-2">
            <PackagePlus className="w-4 h-4 text-emerald-600" />
            <h3 className="text-base font-semibold text-neutral-950">Reponer stock</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-neutral-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50 border border-neutral-200">
          <ProductImage src={product.mainPhoto} alt={product.name} className="w-12 h-12 rounded-lg shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-950 truncate">{product.name}</p>
            <p className="text-xs text-neutral-500 font-mono-num">
              {product.sku} · Stock actual:{' '}
              {product.variants.reduce((s, v) => s + v.stock, 0)} prendas
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-700">
            Unidades a agregar por talla (prendas físicas)
          </p>
          <div className="grid grid-cols-3 gap-2.5">
            {rows.map((r, idx) => (
              <div
                key={r.key}
                className="p-2.5 rounded-lg border border-neutral-200 bg-white space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-neutral-950">Talla {r.size}</span>
                  <span className="text-[11px] text-neutral-500 font-mono-num">
                    Hay {r.currentStock}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 truncate">{r.color}</p>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-emerald-700 font-semibold">+</span>
                  <input
                    type="number"
                    min={0}
                    value={r.addQty}
                    onChange={(e) => {
                      const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                      setRows((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, addQty: val } : item)),
                      );
                    }}
                    className="w-full px-2 py-1.5 border border-neutral-200 rounded text-sm font-mono-num text-neutral-950"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs text-neutral-700">
            Costo unitario de reposición (CLP)
            <input
              type="number"
              step="0.01"
              min={0}
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md font-mono-num text-sm"
            />
          </label>
          <label className="text-xs text-neutral-700">
            Motivo / referencia
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: Reposición proveedor"
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
            />
          </label>
        </div>

        <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 space-y-3">
          <label className="flex items-center gap-2 text-xs font-medium text-neutral-800 cursor-pointer">
            <input
              type="checkbox"
              checked={recordCashOutflow}
              onChange={(e) => setRecordCashOutflow(e.target.checked)}
              className="w-4 h-4 accent-emerald-600"
            />
            <span>Descontar inversión de caja ahora ({formatCLP(totalInvestment)})</span>
          </label>
          {recordCashOutflow && (
            <div className="grid grid-cols-2 gap-2.5">
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="px-2.5 py-1.5 border border-neutral-200 rounded-md text-xs bg-white"
              >
                {data.accounts.map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.name}
                  </option>
                ))}
              </select>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="px-2.5 py-1.5 border border-neutral-200 rounded-md text-xs bg-white"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="text-xs text-neutral-600">
            Total a sumar:{' '}
            <strong className="font-mono-num text-emerald-700">+{totalToAdd} u.</strong>
            <span className="ml-2 text-neutral-400">({formatCLP(totalInvestment)})</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-neutral-200 text-neutral-700 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || totalToAdd <= 0}
              className="px-5 py-2 text-xs font-medium rounded-lg bg-neutral-950 hover:bg-neutral-800 text-white cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Confirmar reposición'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

// =============================================================================
// 3. QUICK PHOTO MANAGER MODAL (replace main photo or add/remove gallery photos)
// =============================================================================
export const QuickPhotoModal: React.FC<{
  product: Product;
  apiFetch: <T = any>(url: string, options?: RequestInit) => Promise<T>;
  onClose: () => void;
  onSuccess: (msg: string) => Promise<void>;
  onError: (msg: string) => void;
}> = ({ product, apiFetch, onClose, onSuccess, onError }) => {
  const [mainPhoto, setMainPhoto] = useState(product.mainPhoto || '');
  const [gallery, setGallery] = useState<string[]>(() => {
    const base = [...(product.galleryPhotos || [])];
    if (product.mainPhoto && !base.includes(product.mainPhoto)) {
      base.unshift(product.mainPhoto);
    }
    return base;
  });
  const [saving, setSaving] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, replaceMain: boolean) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      for (const f of Array.from(files)) {
        const dataUrl = await compressImageSourceToDataUrl(f);
        if (!dataUrl) throw new Error('Formato de imagen no válido.');
        if (replaceMain) {
          setMainPhoto(dataUrl);
          setGallery((prev) => [dataUrl, ...prev.filter((g) => g !== dataUrl)]);
        } else {
          setGallery((prev) => (prev.includes(dataUrl) ? prev : [...prev, dataUrl]));
          if (!mainPhoto) setMainPhoto(dataUrl);
        }
      }
    } catch (err: any) {
      onError(err.message || 'No se pudo procesar la fotografía.');
    } finally {
      e.target.value = '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/products/${product.id}/photos`, {
        method: 'PATCH',
        body: JSON.stringify({
          mainPhoto: mainPhoto || gallery[0] || '',
          galleryPhotos: gallery,
        }),
      });
      await onSuccess(`Fotografías actualizadas en "${product.name}".`);
    } catch (err: any) {
      onError(err.message || 'No se pudieron guardar las fotografías.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white border border-neutral-200 rounded-xl max-w-lg w-full p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <div>
            <h3 className="text-base font-semibold text-neutral-950">Fotografías del producto</h3>
            <p className="text-xs text-neutral-500 mt-0.5 truncate max-w-sm">
              {product.name} · {product.sku}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-neutral-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-neutral-950 hover:bg-neutral-800 text-white cursor-pointer">
            <ImagePlus className="w-3.5 h-3.5" />
            <span>Reemplazar foto principal</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleUpload(e, true)}
              className="hidden"
            />
          </label>
          <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800 cursor-pointer">
            <Plus className="w-3.5 h-3.5" />
            <span>Agregar a galería</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handleUpload(e, false)}
              className="hidden"
            />
          </label>
        </div>

        {gallery.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-neutral-200 rounded-lg text-xs text-neutral-500">
            Este producto aún no tiene fotografías cargadas.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {gallery.map((url, idx) => {
              const isMain = url === mainPhoto;
              return (
                <div
                  key={idx}
                  className={`relative rounded-lg overflow-hidden border-2 ${
                    isMain ? 'border-emerald-600' : 'border-neutral-200'
                  }`}
                >
                  <ProductImage src={url} alt={`Foto ${idx + 1}`} className="w-full h-28" />
                  <button
                    type="button"
                    onClick={() => {
                      const next = gallery.filter((g) => g !== url);
                      setGallery(next);
                      if (isMain) setMainPhoto(next[0] || '');
                    }}
                    className="absolute top-1.5 right-1.5 p-1 rounded bg-black/70 text-white hover:bg-red-600 cursor-pointer"
                    title="Eliminar foto"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMainPhoto(url)}
                    className={`w-full py-1 text-[11px] font-medium text-center cursor-pointer flex items-center justify-center gap-1 ${
                      isMain
                        ? 'bg-emerald-600 text-white'
                        : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                    }`}
                  >
                    {isMain && <Check className="w-3 h-3" />}
                    <span>{isMain ? 'Principal' : 'Usar principal'}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-neutral-200 text-neutral-700 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar fotografías'}
          </button>
        </div>
      </div>
    </div>
  );
};
