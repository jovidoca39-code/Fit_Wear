import React, { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Star, FileDown, X, Globe, Phone } from 'lucide-react';
import type { Supplier, WorkspaceData } from '../types.ts';
import { formatCLP, formatExactCLP } from '../lib/format.ts';
import { exportSuppliersExcel } from '../lib/exports.ts';
import { ConfirmModal } from '../components/ConfirmModal.tsx';

function toSafeWebsiteHref(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

interface SuppliersViewProps {
  data: WorkspaceData;
  apiFetch: <T = any>(url: string, options?: RequestInit) => Promise<T>;
  onRefresh: () => Promise<void>;
  notify: (type: 'success' | 'warning' | 'error', message: string) => void;
}

export const SuppliersView: React.FC<SuppliersViewProps> = ({
  data,
  apiFetch,
  onRefresh,
  notify,
}) => {
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);

  const [name, setName] = useState('');
  const [country, setCountry] = useState('Chile');
  const [city, setCity] = useState('');
  const [website, setWebsite] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [productsSupplied, setProductsSupplied] = useState('');
  const [minOrderQty, setMinOrderQty] = useState('1');
  const [avgLeadDays, setAvgLeadDays] = useState('7');
  const [shippingCostEstimate, setShippingCostEstimate] = useState('0');
  const [rating, setRating] = useState('5');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const openModal = (s: Supplier | null) => {
    setEditing(s);
    setName(s?.name || '');
    setCountry(s?.country || 'Chile');
    setCity(s?.city || '');
    setWebsite(s?.website || '');
    setWhatsapp(s?.whatsapp || '');
    setEmail(s?.email || '');
    setAddress(s?.address || '');
    setProductsSupplied(s?.productsSupplied || '');
    setMinOrderQty(String(s?.minOrderQty ?? 1));
    setAvgLeadDays(String(s?.avgLeadDays ?? 7));
    setShippingCostEstimate(String(s?.shippingCostEstimate ?? 0));
    setRating(String(s?.rating ?? 5));
    setNotes(s?.notes || '');
    setShowModal(true);
  };

  const supplierStats = useMemo(() => {
    return data.suppliers.map((s) => {
      const orders = data.purchaseOrders.filter((po) => po.supplierId === s.id && po.status !== 'cancelado');
      const totalPurchased = orders.reduce((acc, o) => acc + o.total, 0);
      const linkedProducts = data.products.filter((p) => p.supplierId === s.id);
      const avgUnitCost =
        linkedProducts.length > 0
          ? linkedProducts.reduce((acc, p) => acc + p.purchasePrice / Math.max(1, p.packUnits), 0) /
            linkedProducts.length
          : 0;
      const estimatedLandedCost =
        avgUnitCost + (s.minOrderQty > 0 ? s.shippingCostEstimate / Math.max(1, s.minOrderQty) : 0);
      return {
        supplier: s,
        ordersCount: orders.length,
        totalPurchased,
        productsCount: linkedProducts.length,
        avgUnitCost,
        estimatedLandedCost,
      };
    });
  }, [data.suppliers, data.purchaseOrders, data.products]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        country,
        city,
        website,
        whatsapp,
        email,
        address,
        productsSupplied,
        minOrderQty: Math.max(1, Number(minOrderQty) || 1),
        avgLeadDays: Math.max(0, Number(avgLeadDays) || 0),
        shippingCostEstimate: Math.max(0, Number(shippingCostEstimate) || 0),
        rating: Math.min(5, Math.max(1, Number(rating) || 5)),
        notes,
      };
      if (editing) {
        await apiFetch(`/api/suppliers/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        notify('success', `Proveedor "${name}" actualizado.`);
      } else {
        await apiFetch('/api/suppliers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify('success', `Proveedor "${name}" agregado al directorio.`);
      }
      setShowModal(false);
      await onRefresh();
    } catch (err: any) {
      notify('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const s = deleteTarget;
    setDeleteTarget(null);
    try {
      await apiFetch(`/api/suppliers/${s.id}`, { method: 'DELETE' });
      notify('success', 'Proveedor eliminado.');
      await onRefresh();
    } catch (err: any) {
      notify('error', err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-neutral-600">
          Directorio de proveedores, historial de compras y comparador de costos finales por unidad.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportSuppliersExcel(data)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800 cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Exportar Excel</span>
          </button>
          <button
            type="button"
            onClick={() => openModal(null)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo proveedor</span>
          </button>
        </div>
      </div>

      {/* Supplier Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {supplierStats.map(({ supplier: s, ordersCount, totalPurchased, productsCount }) => (
          <div key={s.id} className="bg-white border border-neutral-200 rounded-lg p-5 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-neutral-950">{s.name}</h3>
                <p className="text-xs text-neutral-500">
                  {[s.city, s.country].filter(Boolean).join(', ')} · Entrega aprox.{' '}
                  <strong className="font-mono-num text-neutral-800">{s.avgLeadDays} días</strong>
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-0.5 text-xs font-mono-num text-amber-600 mr-2">
                  <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                  {s.rating}/5
                </span>
                <button
                  type="button"
                  onClick={() => openModal(s)}
                  className="p-1.5 rounded border border-neutral-200 hover:bg-neutral-50 text-neutral-700 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(s)}
                  className="p-1.5 rounded border border-neutral-200 hover:bg-red-50 text-neutral-600 hover:text-red-700 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {s.productsSupplied && (
              <p className="text-xs text-neutral-700 leading-relaxed">{s.productsSupplied}</p>
            )}

            <div className="grid grid-cols-3 gap-2 py-2.5 border-y border-neutral-100 text-xs">
              <div>
                <p className="text-neutral-500">Pedido mín.</p>
                <p className="font-mono-num font-semibold text-neutral-900">{s.minOrderQty} u.</p>
              </div>
              <div>
                <p className="text-neutral-500">Despacho est.</p>
                <p className="font-mono-num font-semibold text-neutral-900">
                  {formatCLP(s.shippingCostEstimate)}
                </p>
              </div>
              <div>
                <p className="text-neutral-500">Compras ({ordersCount})</p>
                <p className="font-mono-num font-semibold text-emerald-700">
                  {formatCLP(totalPurchased)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-500">
              {(() => {
                const safeUrl = toSafeWebsiteHref(s.website);
                if (!safeUrl) return null;
                return (
                  <a
                    href={safeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Sitio web</span>
                  </a>
                );
              })()}
              {s.whatsapp && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" />
                  <span>{s.whatsapp}</span>
                </span>
              )}
              <span>{productsCount} producto(s) asociados</span>
            </div>
          </div>
        ))}
      </div>

      {/* Cost Comparison Table */}
      <div className="bg-white border border-neutral-200 rounded-lg overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-neutral-200">
          <h3 className="text-sm font-semibold text-neutral-950">
            Comparador de costos finales y tiempos entre proveedores
          </h3>
        </div>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
              <th className="py-2.5 px-4 font-medium">Proveedor</th>
              <th className="py-2.5 px-3 font-medium">País / Ciudad</th>
              <th className="py-2.5 px-3 font-medium text-right">Mínimo</th>
              <th className="py-2.5 px-3 font-medium text-right">Entrega</th>
              <th className="py-2.5 px-3 font-medium text-right">Despacho est.</th>
              <th className="py-2.5 px-3 font-medium text-right">Costo prom. producto</th>
              <th className="py-2.5 px-4 font-medium text-right">Costo final est./u</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {supplierStats.map((row) => (
              <tr key={row.supplier.id} className="hover:bg-neutral-50/70">
                <td className="py-2.5 px-4 font-medium text-neutral-950">{row.supplier.name}</td>
                <td className="py-2.5 px-3 text-neutral-600">
                  {[row.supplier.country, row.supplier.city].filter(Boolean).join(' · ')}
                </td>
                <td className="py-2.5 px-3 text-right font-mono-num">{row.supplier.minOrderQty} u.</td>
                <td className="py-2.5 px-3 text-right font-mono-num">{row.supplier.avgLeadDays} d.</td>
                <td className="py-2.5 px-3 text-right font-mono-num">
                  {formatCLP(row.supplier.shippingCostEstimate)}
                </td>
                <td className="py-2.5 px-3 text-right font-mono-num">
                  {row.avgUnitCost > 0 ? formatExactCLP(row.avgUnitCost) : '—'}
                </td>
                <td className="py-2.5 px-4 text-right font-mono-num font-semibold text-emerald-700">
                  {row.avgUnitCost > 0 ? formatExactCLP(row.estimatedLandedCost) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSave}
            className="bg-white border border-neutral-200 rounded-lg max-w-2xl w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="text-base font-semibold text-neutral-950">
                {editing ? 'Editar proveedor' : 'Registrar proveedor'}
              </h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-neutral-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs text-neutral-700 sm:col-span-2">
                Nombre comercial *
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
                />
              </label>
              <label className="text-xs text-neutral-700">
                País
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
                />
              </label>
              <label className="text-xs text-neutral-700">
                Ciudad
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
                />
              </label>
              <label className="text-xs text-neutral-700">
                Página web
                <input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://..."
                  className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
                />
              </label>
              <label className="text-xs text-neutral-700">
                WhatsApp
                <input
                  type="text"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
                />
              </label>
              <label className="text-xs text-neutral-700">
                Correo electrónico
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
                />
              </label>
              <label className="text-xs text-neutral-700">
                Dirección
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
                />
              </label>
              <label className="text-xs text-neutral-700 sm:col-span-2">
                Productos que suministra
                <input
                  type="text"
                  value={productsSupplied}
                  onChange={(e) => setProductsSupplied(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
                />
              </label>
              <label className="text-xs text-neutral-700">
                Cantidad mínima
                <input
                  type="number"
                  min={1}
                  value={minOrderQty}
                  onChange={(e) => setMinOrderQty(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
                />
              </label>
              <label className="text-xs text-neutral-700">
                Tiempo entrega (días)
                <input
                  type="number"
                  min={0}
                  value={avgLeadDays}
                  onChange={(e) => setAvgLeadDays(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
                />
              </label>
              <label className="text-xs text-neutral-700">
                Costo despacho estimado (CLP)
                <input
                  type="number"
                  min={0}
                  value={shippingCostEstimate}
                  onChange={(e) => setShippingCostEstimate(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
                />
              </label>
              <label className="text-xs text-neutral-700">
                Calificación (1 a 5)
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={rating}
                  onChange={(e) => setRating(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
                />
              </label>
              <label className="text-xs text-neutral-700 sm:col-span-2">
                Observaciones
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-xs rounded-lg border border-neutral-200 text-neutral-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              >
                {saving ? 'Guardando...' : 'Guardar proveedor'}
              </button>
            </div>
          </form>
        </div>
      )}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Eliminar proveedor"
        description={`¿Eliminar al proveedor "${deleteTarget?.name || ''}" del directorio?`}
        confirmLabel="Eliminar"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
