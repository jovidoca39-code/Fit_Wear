import React, { useEffect, useMemo, useState } from 'react';
import { Plus, PackageCheck, FileDown, Trash2, X, Truck } from 'lucide-react';
import type { PurchaseOrder, WorkspaceData } from '../types.ts';
import {
  formatCLP,
  formatDateCL,
  formatExactCLP,
  PAYMENT_METHODS,
  todayChileISO,
} from '../lib/format.ts';
import { exportPurchasesExcel } from '../lib/exports.ts';

interface PurchasesViewProps {
  data: WorkspaceData;
  includeExamples: boolean;
  initialAction?: string;
  onClearAction: () => void;
  apiFetch: <T = any>(url: string, options?: RequestInit) => Promise<T>;
  onRefresh: () => Promise<void>;
  notify: (type: 'success' | 'warning' | 'error', message: string) => void;
}

const STATUS_LABELS: Record<PurchaseOrder['status'], string> = {
  pedido_creado: 'Pedido creado',
  pagado: 'Pagado',
  en_transito: 'En tránsito',
  recibido_parcial: 'Recibido parcialmente',
  recibido: 'Recibido',
  cancelado: 'Cancelado',
};

export const PurchasesView: React.FC<PurchasesViewProps> = ({
  data,
  includeExamples,
  initialAction,
  onClearAction,
  apiFetch,
  onRefresh,
  notify,
}) => {
  const [showNewForm, setShowNewForm] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<PurchaseOrder | null>(null);

  useEffect(() => {
    if (initialAction === 'new') {
      setShowNewForm(true);
      onClearAction();
    }
  }, [initialAction, onClearAction]);

  const supplierMap = useMemo(
    () => new Map(data.suppliers.map((s) => [s.id, s.name])),
    [data.suppliers],
  );

  const prodMap = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data.products]);

  const visibleOrders = useMemo(
    () => data.purchaseOrders.filter((po) => includeExamples || !po.isExample),
    [data.purchaseOrders, includeExamples],
  );

  const handleStatusChange = async (po: PurchaseOrder, status: string, markPaid = false) => {
    try {
      await apiFetch(`/api/purchases/${po.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status, markPaid }),
      });
      notify('success', `Orden ${po.orderNumber} actualizada.`);
      await onRefresh();
    } catch (err: any) {
      notify('error', err.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-neutral-600">
          El stock aumenta únicamente al confirmar la <strong>recepción física</strong> de los productos y recalcula el costo real ponderado.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportPurchasesExcel(data, includeExamples)}
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
            <span>{showNewForm ? 'Cerrar formulario' : 'Nueva orden de compra'}</span>
          </button>
        </div>
      </div>

      {showNewForm && (
        <NewPurchaseForm
          data={data}
          apiFetch={apiFetch}
          onCreated={async (po) => {
            setShowNewForm(false);
            notify(
              'success',
              `Orden ${po.orderNumber} creada. Confirma su recepción cuando llegue la mercadería para sumar el stock.`,
            );
            await onRefresh();
          }}
          onError={(msg) => notify('error', msg)}
          onCancel={() => setShowNewForm(false)}
        />
      )}

      {/* Orders Table */}
      <div className="bg-white border border-neutral-200 rounded-lg overflow-x-auto">
        {visibleOrders.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-neutral-900">No hay órdenes de compra registradas</p>
            <p className="text-xs text-neutral-500 mt-1">
              Crea una orden a SHEIN, Alibaba o Patronato y confirma su llegada para aumentar tu stock.
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
                <th className="py-3 px-4 font-medium">N° Orden / Fecha</th>
                <th className="py-3 px-3 font-medium">Proveedor</th>
                <th className="py-3 px-3 font-medium">Detalle y costo real unitario</th>
                <th className="py-3 px-3 font-medium">Estado</th>
                <th className="py-3 px-3 font-medium text-right">Total OC</th>
                <th className="py-3 px-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {visibleOrders.map((po) => {
                const canReceive = po.status !== 'recibido' && po.status !== 'cancelado';
                return (
                  <tr key={po.id} className="hover:bg-neutral-50/70 align-top">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <p className="font-mono-num font-semibold text-neutral-950">{po.orderNumber}</p>
                      <p className="text-[11px] text-neutral-500 font-mono-num">
                        Pedido: {formatDateCL(po.orderDate)}
                      </p>
                      {po.receivedDate && (
                        <p className="text-[11px] text-emerald-700 font-mono-num">
                          Recibido: {formatDateCL(po.receivedDate)}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <p className="font-medium text-neutral-900">
                        {po.supplierId ? supplierMap.get(po.supplierId) || 'Proveedor' : 'Sin proveedor'}
                      </p>
                      <p className="text-[11px] text-neutral-500">
                        {po.isPaid ? 'Pagada' : 'Pendiente de pago'} · {po.paymentMethod}
                      </p>
                    </td>
                    <td className="py-3 px-3 space-y-1">
                      {po.items.map((item) => {
                        const prod = prodMap.get(item.productId);
                        const vari = prod?.variants.find((v) => v.id === item.variantId);
                        return (
                          <div key={item.id} className="text-neutral-800">
                            <span className="font-mono-num font-medium">
                              {item.quantityReceived}/{item.quantityOrdered}
                            </span>{' '}
                            {item.isPackPurchase ? `pack(s) x${item.unitsPerPack}` : 'u.'} —{' '}
                            {prod?.name || `#${item.productId}`}{' '}
                            <span className="text-neutral-500">
                              ({vari ? `${vari.color}/${vari.size}` : ''})
                            </span>{' '}
                            <span className="font-mono-num text-emerald-700">
                              · Costo real: {formatExactCLP(item.finalUnitCost)}/u
                            </span>
                          </div>
                        );
                      })}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`font-medium ${
                          po.status === 'recibido'
                            ? 'text-emerald-700'
                            : po.status === 'cancelado'
                              ? 'text-red-700'
                              : 'text-amber-700'
                        }`}
                      >
                        {STATUS_LABELS[po.status]}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono-num font-semibold text-neutral-950">
                      {formatCLP(po.total)}
                      {(po.shippingCost > 0 || po.taxes > 0) && (
                        <p className="text-[10px] font-normal text-neutral-500">
                          Envío/Imp: {formatCLP(po.shippingCost + po.taxes + po.otherCosts)}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        {canReceive && (
                          <button
                            type="button"
                            onClick={() => setReceiveTarget(po)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer"
                          >
                            <PackageCheck className="w-3.5 h-3.5" />
                            <span>Recibir stock</span>
                          </button>
                        )}
                        {!po.isPaid && po.status !== 'cancelado' && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(po, 'pagado', true)}
                            className="text-xs text-neutral-700 hover:text-neutral-950 underline cursor-pointer"
                          >
                            Marcar pagada
                          </button>
                        )}
                        {po.status === 'pagado' && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(po, 'en_transito', false)}
                            className="text-xs text-neutral-600 hover:text-neutral-950 cursor-pointer"
                            title="Marcar en tránsito"
                          >
                            <Truck className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Confirm Reception Modal */}
      {receiveTarget && (
        <ReceivePurchaseModal
          order={receiveTarget}
          data={data}
          apiFetch={apiFetch}
          onClose={() => setReceiveTarget(null)}
          onDone={async () => {
            setReceiveTarget(null);
            notify(
              'success',
              `Recepción confirmada en ${receiveTarget.orderNumber}. Stock y costos actualizados.`,
            );
            await onRefresh();
          }}
          onError={(msg) => notify('error', msg)}
        />
      )}
    </div>
  );
};

// =============================================================================
// NEW PURCHASE ORDER FORM
// =============================================================================
const NewPurchaseForm: React.FC<{
  data: WorkspaceData;
  apiFetch: <T = any>(url: string, options?: RequestInit) => Promise<T>;
  onCreated: (po: PurchaseOrder) => Promise<void>;
  onError: (msg: string) => void;
  onCancel: () => void;
}> = ({ data, apiFetch, onCreated, onError, onCancel }) => {
  const [orderNumber, setOrderNumber] = useState('');
  const [supplierId, setSupplierId] = useState(String(data.suppliers[0]?.id || ''));
  const [orderDate, setOrderDate] = useState(todayChileISO());
  const [estimatedArrival, setEstimatedArrival] = useState('');
  const [status, setStatus] = useState<'pedido_creado' | 'pagado' | 'en_transito'>('pedido_creado');
  const [paymentMethod, setPaymentMethod] = useState<string>('Transferencia');
  const [accountId, setAccountId] = useState(
    String(data.accounts.find((a) => a.isDefault)?.id || data.accounts[0]?.id || ''),
  );
  const [isPaid, setIsPaid] = useState(false);
  const [discount, setDiscount] = useState('0');
  const [shippingCost, setShippingCost] = useState('0');
  const [taxes, setTaxes] = useState('0');
  const [otherCosts, setOtherCosts] = useState('0');
  const [costAllocationMethod, setCostAllocationMethod] = useState<'proportional' | 'equal'>(
    data.settings?.costAllocationMethod || 'proportional',
  );
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [lines, setLines] = useState<
    Array<{
      productId: number;
      variantId: number;
      quantityOrdered: number;
      isPackPurchase: boolean;
      unitsPerPack: number;
      unitPrice: number;
    }>
  >(() => {
    const firstP = data.products[0];
    const firstV = firstP?.variants[0];
    if (!firstP || !firstV) return [];
    return [
      {
        productId: firstP.id,
        variantId: firstV.id,
        quantityOrdered: 6,
        isPackPurchase: firstP.isPack,
        unitsPerPack: firstP.isPack ? firstP.packUnits : 1,
        unitPrice: firstP.purchasePrice,
      },
    ];
  });

  const prodMap = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data.products]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantityOrdered, 0);
    const extra =
      (Number(shippingCost) || 0) +
      (Number(taxes) || 0) +
      (Number(otherCosts) || 0) -
      (Number(discount) || 0);
    const total = Math.max(0, subtotal + extra);
    const totalPhysical = lines.reduce(
      (s, l) => s + l.quantityOrdered * (l.isPackPurchase ? Math.max(2, l.unitsPerPack) : 1),
      0,
    );
    return { subtotal, extra, total, totalPhysical };
  }, [lines, shippingCost, taxes, otherCosts, discount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.length === 0) return onError('Agrega al menos un producto.');
    setSaving(true);
    try {
      const po = await apiFetch<PurchaseOrder>('/api/purchases', {
        method: 'POST',
        body: JSON.stringify({
          orderNumber: orderNumber.trim() || undefined,
          supplierId: supplierId ? Number(supplierId) : null,
          orderDate,
          estimatedArrival,
          status,
          discount: Number(discount) || 0,
          shippingCost: Number(shippingCost) || 0,
          taxes: Number(taxes) || 0,
          otherCosts: Number(otherCosts) || 0,
          costAllocationMethod,
          paymentMethod,
          accountId: accountId ? Number(accountId) : null,
          isPaid,
          notes,
          items: lines,
        }),
      });
      await onCreated(po);
    } catch (err: any) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-neutral-200 rounded-lg p-5 space-y-5">
      <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
        <h3 className="text-base font-semibold text-neutral-950">Nueva orden de compra / reposición</h3>
        <button type="button" onClick={onCancel} className="text-neutral-400 hover:text-neutral-700">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="text-xs text-neutral-700">
          Proveedor
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm bg-white"
          >
            <option value="">Sin proveedor</option>
            {data.suppliers.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-neutral-700">
          N° Pedido (auto si vacío)
          <input
            type="text"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="OC-0001 / Pedido SHEIN"
            className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
          />
        </label>
        <label className="text-xs text-neutral-700">
          Fecha pedido
          <input
            type="date"
            required
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
            className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
          />
        </label>
        <label className="text-xs text-neutral-700">
          Llegada estimada
          <input
            type="date"
            value={estimatedArrival}
            onChange={(e) => setEstimatedArrival(e.target.value)}
            className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
          />
        </label>

        <label className="text-xs text-neutral-700">
          Estado inicial
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm bg-white"
          >
            <option value="pedido_creado">Pedido creado</option>
            <option value="pagado">Pagado</option>
            <option value="en_transito">En tránsito</option>
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
          Cuenta de pago
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

        <label className="text-xs text-neutral-700">
          Distribución costos envío/imp.
          <select
            value={costAllocationMethod}
            onChange={(e) => setCostAllocationMethod(e.target.value as any)}
            className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm bg-white"
          >
            <option value="proportional">Proporcional al valor</option>
            <option value="equal">Equitativo por prenda física</option>
          </select>
        </label>
      </div>

      {/* Items */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-neutral-900">Productos a reponer</span>
          <button
            type="button"
            onClick={() => {
              const p = data.products[0];
              const v = p?.variants[0];
              if (!p || !v) return;
              setLines((prev) => [
                ...prev,
                {
                  productId: p.id,
                  variantId: v.id,
                  quantityOrdered: 1,
                  isPackPurchase: p.isPack,
                  unitsPerPack: p.isPack ? p.packUnits : 1,
                  unitPrice: p.purchasePrice,
                },
              ]);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-neutral-200 hover:bg-neutral-50 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Agregar línea</span>
          </button>
        </div>

        {lines.map((line, idx) => {
          const prod = prodMap.get(line.productId);
          return (
            <div
              key={idx}
              className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center p-3 rounded-lg bg-neutral-50 border border-neutral-200"
            >
              <select
                value={line.productId}
                onChange={(e) => {
                  const np = prodMap.get(Number(e.target.value));
                  const nv = np?.variants[0];
                  if (!np || !nv) return;
                  setLines((prev) =>
                    prev.map((r, i) =>
                      i === idx
                        ? {
                            ...r,
                            productId: np.id,
                            variantId: nv.id,
                            isPackPurchase: np.isPack,
                            unitsPerPack: np.isPack ? np.packUnits : 1,
                            unitPrice: np.purchasePrice,
                          }
                        : r,
                    ),
                  );
                }}
                className="md:col-span-4 px-2.5 py-2 border border-neutral-200 rounded-md text-xs bg-white"
              >
                {data.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.isPack ? `(Pack x${p.packUnits})` : ''}
                  </option>
                ))}
              </select>

              <select
                value={line.variantId}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((r, i) => (i === idx ? { ...r, variantId: Number(e.target.value) } : r)),
                  )
                }
                className="md:col-span-3 px-2.5 py-2 border border-neutral-200 rounded-md text-xs bg-white"
              >
                {(prod?.variants || []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.color} / {v.size} (stock: {v.stock})
                  </option>
                ))}
              </select>

              <div className="md:col-span-2">
                <input
                  type="number"
                  min={1}
                  value={line.quantityOrdered}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((r, i) =>
                        i === idx
                          ? { ...r, quantityOrdered: Math.max(1, Number(e.target.value) || 1) }
                          : r,
                      ),
                    )
                  }
                  className="w-full px-2.5 py-2 border border-neutral-200 rounded-md text-xs font-mono-num bg-white"
                  title={line.isPackPurchase ? 'Cantidad de packs' : 'Cantidad de unidades'}
                />
                <span className="text-[10px] text-neutral-500">
                  {line.isPackPurchase
                    ? `${line.quantityOrdered} pack(s) = ${line.quantityOrdered * line.unitsPerPack} u.`
                    : 'unidades'}
                </span>
              </div>

              <div className="md:col-span-2">
                <input
                  type="number"
                  step="0.01"
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
                <span className="text-[10px] text-neutral-500">
                  {line.isPackPurchase ? 'Precio x pack' : 'Precio unit.'}
                </span>
              </div>

              <div className="md:col-span-1 text-right">
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
            </div>
          );
        })}
      </div>

      {/* Extra costs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <label className="text-xs text-neutral-700">
          Gastos de envío (CLP)
          <input
            type="number"
            min={0}
            value={shippingCost}
            onChange={(e) => setShippingCost(e.target.value)}
            className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
          />
        </label>
        <label className="text-xs text-neutral-700">
          Impuestos / aduana
          <input
            type="number"
            min={0}
            value={taxes}
            onChange={(e) => setTaxes(e.target.value)}
            className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
          />
        </label>
        <label className="text-xs text-neutral-700">
          Otros gastos compra
          <input
            type="number"
            min={0}
            value={otherCosts}
            onChange={(e) => setOtherCosts(e.target.value)}
            className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
          />
        </label>
        <label className="text-xs text-neutral-700">
          Descuentos proveedor
          <input
            type="number"
            min={0}
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-neutral-200">
        <label className="flex items-center gap-2 text-xs text-neutral-800 cursor-pointer">
          <input
            type="checkbox"
            checked={isPaid}
            onChange={(e) => setIsPaid(e.target.checked)}
            className="w-4 h-4 accent-emerald-600"
          />
          <span>Registrar pago al proveedor inmediatamente en caja</span>
        </label>

        <div className="flex items-center gap-4">
          <div className="text-right text-xs">
            <p className="text-neutral-500">Total orden ({totals.totalPhysical} prendas físicas)</p>
            <p className="font-mono-num text-base font-bold text-neutral-950">
              {formatCLP(totals.total)}
            </p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-60"
          >
            {saving ? 'Creando...' : 'Guardar orden de compra'}
          </button>
        </div>
      </div>
    </form>
  );
};

// =============================================================================
// RECEIVE PURCHASE MODAL (INCREASES STOCK ATOMICALLY)
// =============================================================================
const ReceivePurchaseModal: React.FC<{
  order: PurchaseOrder;
  data: WorkspaceData;
  apiFetch: <T = any>(url: string, options?: RequestInit) => Promise<T>;
  onClose: () => void;
  onDone: () => Promise<void>;
  onError: (msg: string) => void;
}> = ({ order, data, apiFetch, onClose, onDone, onError }) => {
  const [receivedDate, setReceivedDate] = useState(todayChileISO());
  const [quantities, setQuantities] = useState<Record<number, number>>(() => {
    const init: Record<number, number> = {};
    for (const item of order.items) {
      init[item.id] = Math.max(0, item.quantityOrdered - item.quantityReceived);
    }
    return init;
  });
  const [saving, setSaving] = useState(false);

  const prodMap = new Map(data.products.map((p) => [p.id, p]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/api/purchases/${order.id}/receive`, {
        method: 'POST',
        body: JSON.stringify({
          receivedDate,
          items: Object.entries(quantities).map(([id, qty]) => ({
            purchaseOrderItemId: Number(id),
            quantityToReceive: Number(qty) || 0,
          })),
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
        className="bg-white border border-neutral-200 rounded-lg max-w-xl w-full p-6 space-y-4"
      >
        <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
          <div>
            <h3 className="text-base font-semibold text-neutral-950">
              Confirmar recepción — {order.orderNumber}
            </h3>
            <p className="text-xs text-neutral-500">
              Indica cuántas unidades o packs llegaron físicamente para sumarlos al stock.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="block text-xs text-neutral-700">
          Fecha real de recepción
          <input
            type="date"
            required
            value={receivedDate}
            onChange={(e) => setReceivedDate(e.target.value)}
            className="mt-1 px-3 py-2 border border-neutral-200 rounded-md text-sm"
          />
        </label>

        <div className="divide-y divide-neutral-100 border border-neutral-200 rounded-lg">
          {order.items.map((item) => {
            const prod = prodMap.get(item.productId);
            const vari = prod?.variants.find((v) => v.id === item.variantId);
            const pending = Math.max(0, item.quantityOrdered - item.quantityReceived);
            const qty = quantities[item.id] ?? 0;
            return (
              <div key={item.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                <div>
                  <p className="font-medium text-neutral-950">
                    {prod?.name} ({vari?.color} / {vari?.size})
                  </p>
                  <p className="text-neutral-500">
                    Pendiente: {pending} {item.isPackPurchase ? `pack(s) x${item.unitsPerPack}` : 'u.'} · Costo real:{' '}
                    <span className="font-mono-num">{formatExactCLP(item.finalUnitCost)}/u</span>
                  </p>
                </div>
                <div className="text-right">
                  <input
                    type="number"
                    min={0}
                    max={pending}
                    value={qty}
                    onChange={(e) =>
                      setQuantities((prev) => ({
                        ...prev,
                        [item.id]: Math.min(pending, Math.max(0, Number(e.target.value) || 0)),
                      }))
                    }
                    className="w-24 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono-num text-right"
                  />
                  {item.isPackPurchase && qty > 0 && (
                    <p className="text-[10px] text-emerald-700 mt-0.5 font-mono-num">
                      +{qty * item.unitsPerPack} prendas físicas
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs rounded-lg border border-neutral-200 text-neutral-700 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
          >
            {saving ? 'Ingresando stock...' : 'Confirmar recepción'}
          </button>
        </div>
      </form>
    </div>
  );
};
