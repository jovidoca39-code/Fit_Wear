import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  FileDown,
  Printer,
  CheckCircle2,
  RotateCcw,
  XCircle,
  AlertTriangle,
  X,
} from 'lucide-react';
import type { Product, Sale, WorkspaceData } from '../types.ts';
import {
  formatCLP,
  formatDateCL,
  formatExactCLP,
  PAYMENT_METHODS,
  SALE_CHANNELS,
  todayChileISO,
} from '../lib/format.ts';
import { exportSaleReceiptPDF, exportSalesExcel } from '../lib/exports.ts';
import { ProductImage } from '../components/ProductImage.tsx';
import { ConfirmModal } from '../components/ConfirmModal.tsx';

interface SalesViewProps {
  data: WorkspaceData;
  includeExamples: boolean;
  initialAction?: string;
  onClearAction: () => void;
  apiFetch: <T = any>(url: string, options?: RequestInit) => Promise<T>;
  onRefresh: () => Promise<void>;
  notify: (type: 'success' | 'warning' | 'error', message: string) => void;
}

interface CartLine {
  productId: number;
  variantId: number;
  saleMode: 'unit' | 'pack';
  quantity: number;
  unitPrice: number;
}

export const SalesView: React.FC<SalesViewProps> = ({
  data,
  includeExamples,
  initialAction,
  onClearAction,
  apiFetch,
  onRefresh,
  notify,
}) => {
  const [showNewForm, setShowNewForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [returnModalSale, setReturnModalSale] = useState<Sale | null>(null);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Sale | null>(null);

  useEffect(() => {
    if (initialAction === 'new') {
      setShowNewForm(true);
      onClearAction();
    }
  }, [initialAction, onClearAction]);

  const filteredSales = useMemo(() => {
    return data.sales.filter((s) => {
      if (!includeExamples && s.isExample) return false;
      if (statusFilter !== 'all' && s.paymentStatus !== statusFilter) return false;
      if (channelFilter !== 'all' && s.channel !== channelFilter) return false;
      return true;
    });
  }, [data.sales, includeExamples, statusFilter, channelFilter]);

  const handleConfirmPayment = async (sale: Sale) => {
    try {
      await apiFetch(`/api/sales/${sale.id}/confirm-payment`, {
        method: 'POST',
        body: JSON.stringify({ date: todayChileISO() }),
      });
      notify('success', `Pago confirmado en ${sale.saleNumber}. Stock e ingreso actualizados.`);
      await onRefresh();
    } catch (err: any) {
      notify('error', err.message);
    }
  };

  const confirmCancelSale = async () => {
    if (!cancelTarget) return;
    const sale = cancelTarget;
    setCancelTarget(null);
    try {
      await apiFetch(`/api/sales/${sale.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ restock: true, reason: 'Cancelación solicitada por usuario' }),
      });
      notify('success', `Venta ${sale.saleNumber} cancelada y stock devuelto correctamente.`);
      await onRefresh();
    } catch (err: any) {
      notify('error', err.message);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-neutral-200 rounded-lg bg-white text-neutral-800"
          >
            <option value="all">Todos los estados</option>
            <option value="pagado">Pagadas</option>
            <option value="pendiente">Pendientes (stock reservado)</option>
            <option value="parcial">Pago parcial</option>
            <option value="cancelado">Canceladas</option>
            <option value="devuelto">Devueltas</option>
          </select>
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-neutral-200 rounded-lg bg-white text-neutral-800"
          >
            <option value="all">Todos los canales</option>
            {SALE_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportSalesExcel(data, includeExamples)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800 cursor-pointer whitespace-nowrap"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Exportar Excel</span>
          </button>
          <button
            type="button"
            onClick={() => setShowNewForm((v) => !v)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>{showNewForm ? 'Cerrar formulario' : 'Registrar nueva venta'}</span>
          </button>
        </div>
      </div>

      {/* Fast Multi-Item Sale Form */}
      {showNewForm && (
        <NewSaleForm
          data={data}
          apiFetch={apiFetch}
          onCreated={async (sale, lowStockAlerts) => {
            setShowNewForm(false);
            notify(
              'success',
              `Venta ${sale.saleNumber} registrada por ${formatCLP(sale.total)}.`,
            );
            if (lowStockAlerts.length > 0) {
              notify('warning', `Stock bajo detectado en: ${lowStockAlerts.join(', ')}`);
            }
            await onRefresh();
          }}
          onError={(msg) => notify('error', msg)}
          onCancel={() => setShowNewForm(false)}
        />
      )}

      {/* Sales Table */}
      <div className="bg-white border border-neutral-200 rounded-lg overflow-x-auto">
        {filteredSales.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-neutral-900">Aún no hay ventas registradas</p>
            <p className="text-xs text-neutral-500 mt-1">
              Registra una venta para descontar stock automáticamente y calcular tu ganancia real.
            </p>
            <button
              type="button"
              onClick={() => setShowNewForm(true)}
              className="mt-4 px-4 py-2 text-xs font-medium rounded-lg bg-emerald-600 text-white cursor-pointer"
            >
              Registrar primera venta
            </button>
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
                <th className="py-3 px-4 font-medium">N° / Fecha</th>
                <th className="py-3 px-3 font-medium">Cliente / Canal</th>
                <th className="py-3 px-3 font-medium">Prendas</th>
                <th className="py-3 px-3 font-medium">Estado / Pago</th>
                <th className="py-3 px-3 font-medium text-right">Total</th>
                <th className="py-3 px-3 font-medium text-right">Costo (COGS)</th>
                <th className="py-3 px-3 font-medium text-right">Ganancia est.</th>
                <th className="py-3 px-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredSales.map((s) => (
                <tr key={s.id} className="hover:bg-neutral-50/70 align-top">
                  <td className="py-3 px-4 whitespace-nowrap">
                    <p className="font-mono-num font-semibold text-neutral-950">{s.saleNumber}</p>
                    <p className="text-[11px] text-neutral-500 font-mono-num">{formatDateCL(s.saleDate)}</p>
                  </td>
                  <td className="py-3 px-3">
                    <p className="font-medium text-neutral-900">{s.customerName || 'Cliente general'}</p>
                    <p className="text-[11px] text-neutral-500">
                      {s.channel} · {s.paymentMethod}
                    </p>
                  </td>
                  <td className="py-3 px-3 space-y-0.5">
                    {s.items.map((item) => (
                      <div key={item.id} className="text-neutral-800">
                        <span className="font-mono-num font-medium">{item.quantity}x</span>{' '}
                        {item.productName}{' '}
                        <span className="text-neutral-500">
                          ({item.color}/{item.size}
                          {item.saleMode === 'pack' ? ` · Pack ${item.physicalUnitsDeducted}u` : ''})
                        </span>
                        {item.returnedQuantity > 0 && (
                          <span className="text-amber-700 ml-1">
                            [{item.returnedQuantity} dev.]
                          </span>
                        )}
                      </div>
                    ))}
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap">
                    <span
                      className={`font-medium ${
                        s.paymentStatus === 'pagado'
                          ? 'text-emerald-700'
                          : s.paymentStatus === 'pendiente' || s.paymentStatus === 'parcial'
                            ? 'text-amber-700'
                            : 'text-red-700'
                      }`}
                    >
                      {s.paymentStatus === 'pagado'
                        ? 'Pagado'
                        : s.paymentStatus === 'pendiente'
                          ? 'Pendiente (reservado)'
                          : s.paymentStatus === 'parcial'
                            ? `Parcial (${formatCLP(s.amountPaid)})`
                            : s.paymentStatus === 'devuelto'
                              ? 'Devuelto'
                              : 'Cancelado'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-mono-num font-semibold text-neutral-950">
                    {formatCLP(s.total)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono-num text-neutral-600">
                    {formatExactCLP(s.totalCogs)}
                  </td>
                  <td
                    className={`py-3 px-3 text-right font-mono-num font-semibold ${
                      s.paymentStatus === 'cancelado'
                        ? 'text-neutral-400 line-through'
                        : s.estimatedProfit >= 0
                          ? 'text-emerald-700'
                          : 'text-red-700'
                    }`}
                  >
                    {formatCLP(s.estimatedProfit)}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setReceiptSale(s)}
                        className="text-neutral-600 hover:text-neutral-950 cursor-pointer"
                        title="Ver / imprimir comprobante"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          exportSaleReceiptPDF(
                            s,
                            data.settings?.businessName,
                            data.settings?.city,
                          )
                        }
                        className="text-neutral-600 hover:text-neutral-950 cursor-pointer"
                        title="Descargar PDF"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                      </button>
                      {(s.paymentStatus === 'pendiente' || s.paymentStatus === 'parcial') && (
                        <button
                          type="button"
                          onClick={() => handleConfirmPayment(s)}
                          className="text-emerald-700 hover:text-emerald-800 cursor-pointer"
                          title="Confirmar cobro"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {s.paymentStatus === 'pagado' && (
                        <button
                          type="button"
                          onClick={() => setReturnModalSale(s)}
                          className="text-amber-700 hover:text-amber-800 cursor-pointer"
                          title="Registrar devolución"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {s.paymentStatus !== 'cancelado' && s.paymentStatus !== 'devuelto' && (
                        <button
                          type="button"
                          onClick={() => setCancelTarget(s)}
                          className="text-red-600 hover:text-red-800 cursor-pointer"
                          title="Cancelar venta y devolver stock"
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
        )}
      </div>

      {/* Printable Receipt Modal */}
      {receiptSale && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-lg max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between border-b border-neutral-200 pb-3">
              <div>
                <h3 className="font-display text-lg font-bold text-neutral-950">
                  {data.settings?.businessName || 'DUNA ACTIVE'}
                </h3>
                <p className="text-xs text-neutral-500">
                  {data.settings?.city || 'Antofagasta, Chile'} · Comprobante {receiptSale.saleNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceiptSale(null)}
                className="text-neutral-400 hover:text-neutral-700 no-print"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-neutral-700">
              <p>Fecha: <strong className="font-mono-num">{formatDateCL(receiptSale.saleDate)}</strong></p>
              <p>Canal: <strong>{receiptSale.channel}</strong></p>
              <p>Cliente: <strong>{receiptSale.customerName || 'General'}</strong></p>
              <p>Pago: <strong>{receiptSale.paymentMethod}</strong></p>
            </div>
            <table className="w-full text-xs border-t border-b border-neutral-200">
              <thead>
                <tr className="text-neutral-500 border-b border-neutral-100">
                  <th className="py-2 text-left font-medium">Prenda</th>
                  <th className="py-2 text-right font-medium">Cant.</th>
                  <th className="py-2 text-right font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {receiptSale.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2 text-neutral-900">
                      {item.productName} ({item.color}/{item.size})
                    </td>
                    <td className="py-2 text-right font-mono-num">{item.quantity}</td>
                    <td className="py-2 text-right font-mono-num">{formatCLP(item.lineSubtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-1 text-xs text-right">
              <p className="text-neutral-600">Subtotal: <span className="font-mono-num">{formatCLP(receiptSale.subtotal)}</span></p>
              {receiptSale.discount > 0 && (
                <p className="text-neutral-600">Descuento: <span className="font-mono-num">-{formatCLP(receiptSale.discount)}</span></p>
              )}
              <p className="text-base font-bold text-neutral-950 font-mono-num pt-1">
                Total: {formatCLP(receiptSale.total)}
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200 no-print">
              <button
                type="button"
                onClick={() =>
                  exportSaleReceiptPDF(
                    receiptSale,
                    data.settings?.businessName,
                    data.settings?.city,
                  )
                }
                className="px-3.5 py-2 text-xs font-medium rounded-lg border border-neutral-200 text-neutral-800 cursor-pointer"
              >
                Descargar PDF
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-neutral-950 text-white cursor-pointer"
              >
                Imprimir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return Garment Modal */}
      {returnModalSale && (
        <ReturnSaleModal
          sale={returnModalSale}
          apiFetch={apiFetch}
          onClose={() => setReturnModalSale(null)}
          onDone={async () => {
            setReturnModalSale(null);
            notify('success', 'Devolución registrada e inventario actualizado según estado de prenda.');
            await onRefresh();
          }}
          onError={(msg) => notify('error', msg)}
        />
      )}

      <ConfirmModal
        open={Boolean(cancelTarget)}
        title={`Cancelar venta ${cancelTarget?.saleNumber || ''}`}
        description="Las prendas volverán automáticamente al stock disponible y se revertirá el ingreso asociado en caja."
        confirmLabel="Sí, cancelar venta"
        onConfirm={confirmCancelSale}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
};

// =============================================================================
// NEW SALE FORM COMPONENT
// =============================================================================
const NewSaleForm: React.FC<{
  data: WorkspaceData;
  apiFetch: <T = any>(url: string, options?: RequestInit) => Promise<T>;
  onCreated: (sale: Sale, lowStockAlerts: string[]) => Promise<void>;
  onError: (msg: string) => void;
  onCancel: () => void;
}> = ({ data, apiFetch, onCreated, onError, onCancel }) => {
  const activeProducts = useMemo(
    () => data.products.filter((p) => p.isActive && p.variants.some((v) => v.stock - v.reservedStock > 0)),
    [data.products],
  );

  const [saleDate, setSaleDate] = useState(todayChileISO());
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [channel, setChannel] = useState<string>('Instagram');
  const [paymentMethod, setPaymentMethod] = useState<string>('Transferencia');
  const [paymentStatus, setPaymentStatus] = useState<'pagado' | 'pendiente' | 'parcial'>('pagado');
  const [accountId, setAccountId] = useState<string>(
    String(data.accounts.find((a) => a.isDefault)?.id || data.accounts[0]?.id || ''),
  );
  const [discount, setDiscount] = useState('0');
  const [shippingCost, setShippingCost] = useState('0');
  const [commission, setCommission] = useState('0');
  const [otherCost, setOtherCost] = useState('0');
  const [amountPaid, setAmountPaid] = useState('0');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const makeDefaultLine = (p: Product | undefined): CartLine | null => {
    if (!p) return null;
    const v = p.variants.find((x) => x.stock - x.reservedStock > 0) || p.variants[0];
    if (!v) return null;
    const avail = v.stock - v.reservedStock;
    const canPack = p.isPack && avail >= p.packUnits;
    const saleMode: 'unit' | 'pack' = canPack ? 'pack' : 'unit';
    const unitPrice =
      saleMode === 'pack'
        ? p.salePrice
        : p.isPack
          ? p.singleUnitSalePrice || Math.round(p.salePrice / Math.max(1, p.packUnits))
          : v.salePriceOverride ?? p.salePrice;
    return { productId: p.id, variantId: v.id, saleMode, quantity: 1, unitPrice };
  };

  const [lines, setLines] = useState<CartLine[]>(() => {
    const first = makeDefaultLine(activeProducts[0]);
    return first ? [first] : [];
  });

  const prodMap = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data.products]);

  const summary = useMemo(() => {
    let subtotal = 0;
    let totalCogs = 0;
    for (const line of lines) {
      const prod = prodMap.get(line.productId);
      const vari = prod?.variants.find((v) => v.id === line.variantId);
      if (!prod || !vari) continue;
      const phys = line.saleMode === 'pack' && prod.isPack ? line.quantity * prod.packUnits : line.quantity;
      subtotal += line.unitPrice * line.quantity;
      totalCogs += vari.unitCost * phys;
    }
    const disc = Number(discount) || 0;
    const ship = Number(shippingCost) || 0;
    const comm = Number(commission) || 0;
    const other = Number(otherCost) || 0;
    const total = Math.max(0, subtotal - disc);
    const profit = total - totalCogs - ship - comm - other;
    return { subtotal, totalCogs, total, profit };
  }, [lines, prodMap, discount, shippingCost, commission, otherCost]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.length === 0) return onError('Agrega al menos una prenda con stock disponible.');

    const lowStockAlerts: string[] = [];
    for (const line of lines) {
      const prod = prodMap.get(line.productId);
      const vari = prod?.variants.find((v) => v.id === line.variantId);
      if (!prod || !vari) return onError('Selecciona un producto y variante válidos.');
      const avail = vari.stock - vari.reservedStock;
      const phys = line.saleMode === 'pack' && prod.isPack ? line.quantity * prod.packUnits : line.quantity;
      if (phys > avail) {
        return onError(
          `Stock insuficiente en ${prod.name} (${vari.color}/${vari.size}). Disponible: ${avail} prendas.`,
        );
      }
      if (avail - phys <= vari.minStock) {
        lowStockAlerts.push(`${prod.name} (${vari.color}/${vari.size}): quedan ${avail - phys}`);
      }
    }

    setSaving(true);
    try {
      const sale = await apiFetch<Sale>('/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          saleDate,
          customerName,
          customerPhone,
          channel,
          paymentMethod,
          paymentStatus,
          accountId: accountId ? Number(accountId) : null,
          discount: Number(discount) || 0,
          shippingCost: Number(shippingCost) || 0,
          commission: Number(commission) || 0,
          otherCost: Number(otherCost) || 0,
          amountPaid: paymentStatus === 'parcial' ? Number(amountPaid) || 0 : undefined,
          notes,
          items: lines,
        }),
      });
      await onCreated(sale, lowStockAlerts);
    } catch (err: any) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-neutral-200 rounded-lg p-5 space-y-5"
    >
      <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
        <div>
          <h3 className="text-base font-semibold text-neutral-950">Registro rápido de venta</h3>
          <p className="text-xs text-neutral-500">
            El stock se descuenta de forma atómica al confirmar, o se reserva si queda pendiente de pago.
          </p>
        </div>
        <button type="button" onClick={onCancel} className="text-neutral-400 hover:text-neutral-700">
          <X className="w-4 h-4" />
        </button>
      </div>

      {activeProducts.length === 0 ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
          No hay productos con stock disponible para vender. Agrega stock en Inventario o recibe una orden de compra.
        </p>
      ) : (
        <>
          {/* Sale Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="text-xs text-neutral-700">
              Fecha
              <input
                type="date"
                required
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
              />
            </label>
            <label className="text-xs text-neutral-700">
              Cliente (opcional)
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nombre del cliente"
                className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
              />
            </label>
            <label className="text-xs text-neutral-700">
              Canal de venta
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm bg-white"
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
                className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm bg-white"
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
                onChange={(e) => setPaymentStatus(e.target.value as any)}
                className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm bg-white"
              >
                <option value="pagado">Pagado (descuenta stock y registra ingreso)</option>
                <option value="pendiente">Pendiente (reserva stock sin contabilizar cobro)</option>
                <option value="parcial">Pago parcial (abono)</option>
              </select>
            </label>

            <label className="text-xs text-neutral-700">
              Cuenta de destino
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm bg-white"
              >
                {data.accounts.map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>

            {paymentStatus === 'parcial' && (
              <label className="text-xs text-neutral-700">
                Monto abonado ahora (CLP)
                <input
                  type="number"
                  min={0}
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
                />
              </label>
            )}

            <label className="text-xs text-neutral-700">
              Teléfono / WhatsApp (opcional)
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+56 9 ..."
                className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
              />
            </label>
          </div>

          {/* Line Items */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-900">Prendas de la venta</span>
              <button
                type="button"
                onClick={() => {
                  const next = makeDefaultLine(activeProducts[0]);
                  if (next) setLines((prev) => [...prev, next]);
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-neutral-200 hover:bg-neutral-50 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar otra prenda</span>
              </button>
            </div>

            <div className="space-y-2">
              {lines.map((line, idx) => {
                const prod = prodMap.get(line.productId);
                const vari = prod?.variants.find((v) => v.id === line.variantId);
                const avail = vari ? Math.max(0, vari.stock - vari.reservedStock) : 0;
                const maxQty =
                  line.saleMode === 'pack' && prod?.isPack
                    ? Math.floor(avail / Math.max(1, prod.packUnits))
                    : avail;
                const isLowAfter =
                  vari &&
                  avail - (line.saleMode === 'pack' && prod?.isPack ? line.quantity * prod.packUnits : line.quantity) <=
                    vari.minStock;

                return (
                  <div
                    key={idx}
                    className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center p-3 rounded-lg bg-neutral-50 border border-neutral-200"
                  >
                    <div className="md:col-span-4 flex items-center gap-2.5">
                      <ProductImage
                        src={prod?.mainPhoto}
                        alt={prod?.name || 'Producto'}
                        className="w-10 h-10 rounded shrink-0"
                      />
                      <select
                        value={line.productId}
                        onChange={(e) => {
                          const np = prodMap.get(Number(e.target.value));
                          const def = makeDefaultLine(np);
                          if (def) {
                            setLines((prev) => prev.map((r, i) => (i === idx ? def : r)));
                          }
                        }}
                        className="w-full px-2.5 py-2 border border-neutral-200 rounded-md text-xs bg-white"
                      >
                        {activeProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.isPack ? `(Pack x${p.packUnits})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-3">
                      <select
                        value={line.variantId}
                        onChange={(e) => {
                          const vid = Number(e.target.value);
                          setLines((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, variantId: vid } : r)),
                          );
                        }}
                        className="w-full px-2.5 py-2 border border-neutral-200 rounded-md text-xs bg-white"
                      >
                        {(prod?.variants || []).map((v) => {
                          const av = Math.max(0, v.stock - v.reservedStock);
                          return (
                            <option key={v.id} value={v.id} disabled={av <= 0}>
                              {v.color} / {v.size} ({av} disp.)
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {prod?.isPack ? (
                      <div className="md:col-span-2">
                        <select
                          value={line.saleMode}
                          onChange={(e) => {
                            const sm = e.target.value as 'unit' | 'pack';
                            const newPrice =
                              sm === 'pack'
                                ? prod.salePrice
                                : prod.singleUnitSalePrice ||
                                  Math.round(prod.salePrice / Math.max(1, prod.packUnits));
                            setLines((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, saleMode: sm, unitPrice: newPrice, quantity: 1 } : r,
                              ),
                            );
                          }}
                          className="w-full px-2 py-2 border border-neutral-200 rounded-md text-xs bg-white"
                        >
                          <option value="pack" disabled={avail < prod.packUnits}>
                            Pack ({prod.packUnits} u.)
                          </option>
                          {prod.allowSingleUnitSale && (
                            <option value="unit">1 unidad suelta</option>
                          )}
                        </select>
                      </div>
                    ) : (
                      <div className="md:col-span-2 text-[11px] text-neutral-500 px-1">
                        Unidad · Disp: <strong className="font-mono-num text-neutral-900">{avail}</strong>
                      </div>
                    )}

                    <div className="md:col-span-1">
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, maxQty)}
                        value={line.quantity}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((r, i) =>
                              i === idx
                                ? { ...r, quantity: Math.max(1, Number(e.target.value) || 1) }
                                : r,
                            ),
                          )
                        }
                        className="w-full px-2 py-2 border border-neutral-200 rounded-md text-xs font-mono-num bg-white"
                      />
                    </div>

                    <div className="md:col-span-2 flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        value={line.unitPrice}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, unitPrice: Math.max(0, Number(e.target.value) || 0) } : r,
                            ),
                          )
                        }
                        className="w-full px-2.5 py-2 border border-neutral-200 rounded-md text-xs font-mono-num bg-white"
                      />
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-neutral-400 hover:text-red-700 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {isLowAfter && (
                      <div className="md:col-span-12 flex items-center gap-1.5 text-[11px] text-amber-700">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Esta venta dejará la variante en stock bajo o sin stock.</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Discounts, Shipping, Commissions & Live Totals */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-2">
            <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="text-xs text-neutral-700">
                Descuento (CLP)
                <input
                  type="number"
                  min={0}
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="mt-1 w-full px-2.5 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
                />
              </label>
              <label className="text-xs text-neutral-700">
                Costo despacho
                <input
                  type="number"
                  min={0}
                  value={shippingCost}
                  onChange={(e) => setShippingCost(e.target.value)}
                  className="mt-1 w-full px-2.5 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
                />
              </label>
              <label className="text-xs text-neutral-700">
                Comisión canal
                <input
                  type="number"
                  min={0}
                  value={commission}
                  onChange={(e) => setCommission(e.target.value)}
                  className="mt-1 w-full px-2.5 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
                />
              </label>
              <label className="text-xs text-neutral-700">
                Otros costos
                <input
                  type="number"
                  min={0}
                  value={otherCost}
                  onChange={(e) => setOtherCost(e.target.value)}
                  className="mt-1 w-full px-2.5 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
                />
              </label>
              <label className="text-xs text-neutral-700 col-span-2 sm:col-span-4">
                Observaciones
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Entrega en centro de Antofagasta, envío Starken, etc."
                  className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
                />
              </label>
            </div>

            <div className="lg:col-span-5 bg-neutral-950 text-white rounded-lg p-4 space-y-1.5 text-xs">
              <div className="flex justify-between text-neutral-300">
                <span>Subtotal:</span>
                <span className="font-mono-num">{formatCLP(summary.subtotal)}</span>
              </div>
              <div className="flex justify-between text-neutral-300">
                <span>Costo mercadería (COGS exacto):</span>
                <span className="font-mono-num">{formatExactCLP(summary.totalCogs)}</span>
              </div>
              <div className="flex justify-between text-white text-base font-bold pt-2 border-t border-neutral-800">
                <span>Total venta:</span>
                <span className="font-mono-num">{formatCLP(summary.total)}</span>
              </div>
              <div className="flex justify-between text-emerald-400 font-semibold">
                <span>Ganancia estimada neta:</span>
                <span className="font-mono-num">{formatCLP(summary.profit)}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs rounded-lg border border-neutral-200 text-neutral-700 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-60"
            >
              {saving ? 'Registrando...' : 'Confirmar venta'}
            </button>
          </div>
        </>
      )}
    </form>
  );
};

// =============================================================================
// RETURN SALE MODAL
// =============================================================================
const ReturnSaleModal: React.FC<{
  sale: Sale;
  apiFetch: <T = any>(url: string, options?: RequestInit) => Promise<T>;
  onClose: () => void;
  onDone: () => Promise<void>;
  onError: (msg: string) => void;
}> = ({ sale, apiFetch, onClose, onDone, onError }) => {
  const returnableItems = sale.items.filter((i) => i.physicalUnitsDeducted > i.returnedQuantity);
  const [itemId, setItemId] = useState(String(returnableItems[0]?.id || ''));
  const [physicalUnits, setPhysicalUnits] = useState('1');
  const [condition, setCondition] = useState<'buen_estado' | 'danado'>('buen_estado');
  const [refundAmount, setRefundAmount] = useState('0');
  const [reason, setReason] = useState('Cambio de talla o devolución cliente');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemId) return;
    setSaving(true);
    try {
      await apiFetch(`/api/sales/${sale.id}/return`, {
        method: 'POST',
        body: JSON.stringify({
          itemId: Number(itemId),
          physicalUnits: Math.max(1, Number(physicalUnits) || 1),
          condition,
          refundAmount: Math.max(0, Number(refundAmount) || 0),
          reason,
        }),
      });
      await onDone();
    } catch (err: any) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-neutral-200 rounded-lg max-w-md w-full p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-950">
            Devolución en {sale.saleNumber}
          </h3>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="block text-xs text-neutral-700">
          Prenda a devolver
          <select
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm bg-white"
          >
            {returnableItems.map((i) => (
              <option key={i.id} value={String(i.id)}>
                {i.productName} ({i.color}/{i.size}) — Máx{' '}
                {i.physicalUnitsDeducted - i.returnedQuantity} u.
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-neutral-700">
            Prendas devueltas
            <input
              type="number"
              min={1}
              value={physicalUnits}
              onChange={(e) => setPhysicalUnits(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
            />
          </label>
          <label className="block text-xs text-neutral-700">
            Reembolso en CLP
            <input
              type="number"
              min={0}
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
            />
          </label>
        </div>

        <label className="block text-xs text-neutral-700">
          Estado de la prenda
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as any)}
            className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm bg-white"
          >
            <option value="buen_estado">Buen estado (reingresa al stock disponible)</option>
            <option value="danado">Dañada / merma (no vuelve a stock vendible)</option>
          </select>
        </label>

        <label className="block text-xs text-neutral-700">
          Motivo
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
          />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs rounded-md border border-neutral-200 text-neutral-700 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-xs font-medium rounded-md bg-neutral-950 text-white cursor-pointer"
          >
            {saving ? 'Procesando...' : 'Registrar devolución'}
          </button>
        </div>
      </form>
    </div>
  );
};
