import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  LayoutGrid,
  Table as TableIcon,
  Upload,
  Download,
  Pencil,
  Trash2,
  Calculator,
  X,
  ImagePlus,
  History,
  ShoppingBag,
  PackagePlus,
  Camera,
  RotateCcw,
} from 'lucide-react';
import type { Product, ProductVariant, WorkspaceData } from '../types.ts';
import {
  formatCLP,
  formatDateTimeCL,
  formatExactCLP,
  formatPercent,
  PRODUCT_CATEGORIES,
  todayChileISO,
} from '../lib/format.ts';
import {
  downloadImportTemplateExcel,
  exportFullInventoryExcel,
} from '../lib/exports.ts';
import { ProductImage } from '../components/ProductImage.tsx';
import { ConfirmModal } from '../components/ConfirmModal.tsx';
import { BulkImportModal } from '../components/BulkImportModal.tsx';
import {
  QuickPhotoModal,
  QuickRestockModal,
  QuickSaleModal,
} from '../components/InventoryQuickModals.tsx';

interface InventoryViewProps {
  data: WorkspaceData;
  includeExamples: boolean;
  initialAction?: string;
  onClearAction: () => void;
  apiFetch: <T = any>(url: string, options?: RequestInit) => Promise<T>;
  onRefresh: () => Promise<void>;
  notify: (type: 'success' | 'warning' | 'error', message: string) => void;
}

const STUDIO_PRESET_PHOTOS = [
  { label: 'Calza Seamless Burdeos', url: '/src/assets/images/calza_shein_burdeos_1795654756488.jpg' },
  { label: 'Pack Velisys x2', url: '/src/assets/images/pack_velisys_calzas_1795654757719.jpg' },
  { label: 'Calza Sculpt Esmeralda', url: '/src/assets/images/calza_esmeralda_pro_1795654758695.jpg' },
  { label: 'Top Deportivo Negro', url: '/src/assets/images/top_deportivo_duna_1795654758041.jpg' },
];

async function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagen no válido'));
      img.onload = () => {
        const maxSide = 960;
        let { width, height } = img;
        if (width > maxSide || height > maxSide) {
          const ratio = Math.min(maxSide / width, maxSide / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(String(reader.result));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function getProductAvailabilityStatus(product: Product): 'available' | 'low' | 'out' {
  const totalAvail = product.variants.reduce(
    (s, v) => s + Math.max(0, v.stock - v.reservedStock),
    0,
  );
  if (totalAvail <= 0) return 'out';
  const hasLow = product.variants.some((v) => {
    const av = Math.max(0, v.stock - v.reservedStock);
    return av <= v.minStock;
  });
  return hasLow ? 'low' : 'available';
}

function getSizeBreakdown(product: Product) {
  const sizeMap = new Map<string, { size: string; stock: number; avail: number; minStock: number }>();
  for (const v of product.variants) {
    const sz = v.size.trim().toUpperCase();
    const avail = Math.max(0, v.stock - v.reservedStock);
    const prev = sizeMap.get(sz);
    if (prev) {
      prev.stock += v.stock;
      prev.avail += avail;
      prev.minStock = Math.min(prev.minStock, v.minStock);
    } else {
      sizeMap.set(sz, { size: sz, stock: v.stock, avail, minStock: v.minStock });
    }
  }

  const coreSizes = ['S', 'M', 'L'].map((sz) => ({
    size: sz,
    stock: sizeMap.get(sz)?.stock ?? 0,
    avail: sizeMap.get(sz)?.avail ?? 0,
    minStock: sizeMap.get(sz)?.minStock ?? 2,
    exists: sizeMap.has(sz),
  }));

  const extraSizes = Array.from(sizeMap.values())
    .filter((entry) => !['S', 'M', 'L'].includes(entry.size))
    .map((entry) => ({ ...entry, exists: true }));

  return { coreSizes, extraSizes };
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  data,
  includeExamples,
  initialAction,
  onClearAction,
  apiFetch,
  onRefresh,
  notify,
}) => {
  const [viewMode, setViewMode] = useState<'cards' | 'table' | 'movements'>('cards');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [colorFilter, setColorFilter] = useState('all');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<
    'all' | 'available' | 'low' | 'out' | 'pack'
  >('all');
  const [sortBy, setSortBy] = useState<
    'newest' | 'name' | 'stock_asc' | 'price_desc' | 'margin_desc'
  >('newest');

  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [quickSaleProduct, setQuickSaleProduct] = useState<Product | null>(null);
  const [quickRestockProduct, setQuickRestockProduct] = useState<Product | null>(null);
  const [quickPhotoProduct, setQuickPhotoProduct] = useState<Product | null>(null);

  const [adjustTarget, setAdjustTarget] = useState<{ product: Product; variant: ProductVariant } | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('1');
  const [adjustReason, setAdjustReason] = useState('');
  const [showCalc, setShowCalc] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  useEffect(() => {
    if (initialAction === 'new') {
      setEditingProduct(null);
      setShowModal(true);
      onClearAction();
    }
  }, [initialAction, onClearAction]);

  const supplierMap = useMemo(
    () => new Map(data.suppliers.map((s) => [s.id, s.name])),
    [data.suppliers],
  );

  const visibleProductsBase = useMemo(
    () => data.products.filter((p) => includeExamples || !p.isExample),
    [data.products, includeExamples],
  );

  // Dynamic filter options for Color & Size
  const availableColors = useMemo(() => {
    const set = new Set<string>();
    for (const p of visibleProductsBase) {
      for (const v of p.variants) {
        if (v.color.trim()) set.add(v.color.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [visibleProductsBase]);

  const availableSizes = useMemo(() => {
    const set = new Set<string>(['S', 'M', 'L']);
    for (const p of visibleProductsBase) {
      for (const v of p.variants) {
        if (v.size.trim()) set.add(v.size.trim().toUpperCase());
      }
    }
    const order = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
    return Array.from(set).sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return a.localeCompare(b);
    });
  }, [visibleProductsBase]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleProductsBase
      .filter((p) => {
        if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
        if (
          colorFilter !== 'all' &&
          !p.variants.some((v) => v.color.trim().toLowerCase() === colorFilter.toLowerCase())
        ) {
          return false;
        }
        if (
          sizeFilter !== 'all' &&
          !p.variants.some(
            (v) =>
              v.size.trim().toUpperCase() === sizeFilter.toUpperCase() &&
              Math.max(0, v.stock - v.reservedStock) > 0,
          )
        ) {
          return false;
        }

        const status = getProductAvailabilityStatus(p);
        if (availabilityFilter === 'available' && status !== 'available') return false;
        if (availabilityFilter === 'low' && status !== 'low') return false;
        if (availabilityFilter === 'out' && status !== 'out') return false;
        if (availabilityFilter === 'pack' && !p.isPack) return false;

        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.model.toLowerCase().includes(q) ||
          p.variants.some(
            (v) =>
              v.color.toLowerCase().includes(q) ||
              v.size.toLowerCase().includes(q) ||
              v.skuVariant.toLowerCase().includes(q),
          )
        );
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'price_desc') return b.salePrice - a.salePrice;
        if (sortBy === 'stock_asc') {
          const sa = a.variants.reduce((s, v) => s + v.stock, 0);
          const sb = b.variants.reduce((s, v) => s + v.stock, 0);
          return sa - sb;
        }
        if (sortBy === 'margin_desc') {
          const getMargin = (p: Product) => {
            const c =
              p.variants.length > 0
                ? p.variants.reduce((s, v) => s + v.unitCost, 0) / p.variants.length
                : p.purchasePrice / Math.max(1, p.packUnits);
            const sp = p.isPack
              ? p.singleUnitSalePrice || Math.round(p.salePrice / Math.max(1, p.packUnits))
              : p.salePrice;
            return sp > 0 ? ((sp - c) / sp) * 100 : 0;
          };
          return getMargin(b) - getMargin(a);
        }
        return b.id - a.id;
      });
  }, [
    visibleProductsBase,
    search,
    categoryFilter,
    colorFilter,
    sizeFilter,
    availabilityFilter,
    sortBy,
  ]);

  const hasActiveFilters =
    Boolean(search.trim()) ||
    categoryFilter !== 'all' ||
    colorFilter !== 'all' ||
    sizeFilter !== 'all' ||
    availabilityFilter !== 'all';

  const resetFilters = () => {
    setSearch('');
    setCategoryFilter('all');
    setColorFilter('all');
    setSizeFilter('all');
    setAvailabilityFilter('all');
  };

  const inventorySummary = useMemo(() => {
    let totalUnits = 0;
    let availableCount = 0;
    let lowCount = 0;
    let outCount = 0;
    for (const p of filteredProducts) {
      totalUnits += p.variants.reduce((s, v) => s + v.stock, 0);
      const st = getProductAvailabilityStatus(p);
      if (st === 'available') availableCount++;
      else if (st === 'low') lowCount++;
      else outCount++;
    }
    return { totalUnits, availableCount, lowCount, outCount };
  }, [filteredProducts]);

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget) return;
    const delta = parseInt(adjustDelta, 10);
    if (!delta) {
      notify('warning', 'Ingresa una cantidad distinta de cero.');
      return;
    }
    try {
      await apiFetch(`/api/variants/${adjustTarget.variant.id}/adjust`, {
        method: 'POST',
        body: JSON.stringify({
          delta,
          reason: adjustReason.trim() || 'Ajuste manual de inventario',
        }),
      });
      notify('success', 'Stock actualizado y registrado en el historial.');
      setAdjustTarget(null);
      setAdjustReason('');
      await onRefresh();
    } catch (err: any) {
      notify('error', err.message);
    }
  };

  const confirmDeleteProduct = async () => {
    if (!deleteTarget) return;
    const product = deleteTarget;
    setDeleteTarget(null);
    try {
      await apiFetch(`/api/products/${product.id}`, { method: 'DELETE' });
      notify('success', `Producto "${product.name}" eliminado.`);
      await onRefresh();
    } catch (err: any) {
      notify('error', err.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center p-1 bg-neutral-100 rounded-lg border border-neutral-200">
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap transition-colors ${
              viewMode === 'cards' ? 'bg-white text-neutral-950 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Tarjetas</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap transition-colors ${
              viewMode === 'table' ? 'bg-white text-neutral-950 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>Tabla</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('movements')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap transition-colors ${
              viewMode === 'movements' ? 'bg-white text-neutral-950 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Movimientos</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCalc((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800 cursor-pointer whitespace-nowrap"
          >
            <Calculator className="w-3.5 h-3.5 text-emerald-700" />
            <span className="hidden sm:inline">Calculadora</span>
          </button>
          <button
            type="button"
            onClick={() => setShowBulkImport(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-neutral-900 bg-neutral-950 hover:bg-neutral-800 text-white cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Importar ZIP / JSON / Excel</span>
          </button>
          <button
            type="button"
            onClick={downloadImportTemplateExcel}
            className="hidden md:inline-flex items-center px-3 py-2 text-xs font-medium rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 cursor-pointer whitespace-nowrap"
          >
            Plantilla
          </button>
          <button
            type="button"
            onClick={() => exportFullInventoryExcel(data, includeExamples)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Exportar</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingProduct(null);
              setShowModal(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo producto</span>
          </button>
        </div>
      </div>

      {/* Pricing Calculator Drawer (Section 11) */}
      {showCalc && (
        <PricingCalculatorPanel
          defaultTargetProfit={data.settings?.targetProfitPerUnit ?? 10000}
          onClose={() => setShowCalc(false)}
        />
      )}

      {/* Search & Filters (Color, Talla, Disponibilidad, Categoría, Orden) */}
      {viewMode !== 'movements' && (
        <div className="bg-white border border-neutral-200 rounded-xl p-3.5 space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, SKU, color, talla o marca..."
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-900"
              />
            </div>

            <select
              value={colorFilter}
              onChange={(e) => setColorFilter(e.target.value)}
              aria-label="Filtrar por color"
              className="px-3 py-2 text-xs border border-neutral-200 rounded-lg bg-white text-neutral-800"
            >
              <option value="all">Color: Todos</option>
              {availableColors.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>

            <select
              value={sizeFilter}
              onChange={(e) => setSizeFilter(e.target.value)}
              aria-label="Filtrar por talla"
              className="px-3 py-2 text-xs border border-neutral-200 rounded-lg bg-white text-neutral-800"
            >
              <option value="all">Talla: Todas</option>
              {availableSizes.map((sz) => (
                <option key={sz} value={sz}>
                  Talla {sz} disponible
                </option>
              ))}
            </select>

            <select
              value={availabilityFilter}
              onChange={(e) => setAvailabilityFilter(e.target.value as any)}
              aria-label="Filtrar por disponibilidad"
              className="px-3 py-2 text-xs border border-neutral-200 rounded-lg bg-white text-neutral-800"
            >
              <option value="all">Disponibilidad: Todas</option>
              <option value="available">Disponible (verde)</option>
              <option value="low">Stock bajo (amarillo)</option>
              <option value="out">Agotado (rojo)</option>
              <option value="pack">Solo packs</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filtrar por categoría"
              className="px-3 py-2 text-xs border border-neutral-200 rounded-lg bg-white text-neutral-800"
            >
              <option value="all">Categoría: Todas</option>
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              aria-label="Ordenar productos"
              className="px-3 py-2 text-xs border border-neutral-200 rounded-lg bg-white text-neutral-800"
            >
              <option value="newest">Más recientes</option>
              <option value="name">Nombre A–Z</option>
              <option value="stock_asc">Menor stock primero</option>
              <option value="price_desc">Mayor precio</option>
              <option value="margin_desc">Mayor margen</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-100 text-xs text-neutral-500">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                <strong className="font-mono-num text-neutral-900">{filteredProducts.length}</strong>{' '}
                producto{filteredProducts.length === 1 ? '' : 's'}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <strong className="font-mono-num text-neutral-900">{inventorySummary.totalUnits}</strong>{' '}
                unidades totales
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-700 font-medium">
                {inventorySummary.availableCount} disponibles
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-amber-700 font-medium">
                {inventorySummary.lowCount} stock bajo
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-red-700 font-medium">
                {inventorySummary.outCount} agotados
              </span>
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 text-xs font-medium text-neutral-700 hover:text-neutral-950 underline cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Limpiar filtros</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Cards View: 2 per row on mobile, 3 on tablet, 4 per row on desktop */}
      {viewMode === 'cards' && (
        filteredProducts.length === 0 ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center">
            <p className="text-sm font-semibold text-neutral-900">
              No hay productos que coincidan con los filtros
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              Prueba limpiando los filtros, crea un producto nuevo o importa tu catálogo desde ZIP, JSON, CSV o Excel.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="px-4 py-2 text-xs font-medium border border-neutral-200 bg-white text-neutral-800 rounded-lg cursor-pointer"
                >
                  Limpiar filtros
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowBulkImport(true)}
                className="px-4 py-2 text-xs font-medium bg-neutral-950 text-white rounded-lg cursor-pointer"
              >
                Importar catálogo
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingProduct(null);
                  setShowModal(true);
                }}
                className="px-4 py-2 text-xs font-medium bg-emerald-600 text-white rounded-lg cursor-pointer"
              >
                Nuevo producto
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {filteredProducts.map((p) => {
              const totalStock = p.variants.reduce((s, v) => s + v.stock, 0);
              const totalAvail = p.variants.reduce(
                (s, v) => s + Math.max(0, v.stock - v.reservedStock),
                0,
              );
              const totalReserved = p.variants.reduce((s, v) => s + v.reservedStock, 0);
              const status = getProductAvailabilityStatus(p);
              const { coreSizes, extraSizes } = getSizeBreakdown(p);
              const uniqueColors = Array.from(
                new Set(p.variants.map((v) => v.color.trim()).filter(Boolean)),
              );
              const colorLabel = uniqueColors.join(', ') || 'Estándar';

              const avgUnitCost =
                p.variants.length > 0
                  ? p.variants.reduce((s, v) => s + v.unitCost, 0) / p.variants.length
                  : p.purchasePrice / Math.max(1, p.packUnits);
              const displayUnitSale = p.isPack
                ? p.singleUnitSalePrice || Math.round(p.salePrice / Math.max(1, p.packUnits))
                : p.salePrice;
              const estProfitPerGarment = displayUnitSale - avgUnitCost;
              const marginPct =
                displayUnitSale > 0 ? (estProfitPerGarment / displayUnitSale) * 100 : 0;

              const statusStyles =
                status === 'available'
                  ? { bar: 'bg-emerald-600 text-white', label: 'Disponible' }
                  : status === 'low'
                    ? { bar: 'bg-amber-400 text-neutral-950', label: 'Stock bajo' }
                    : { bar: 'bg-red-600 text-white', label: 'Agotado' };

              return (
                <article
                  key={p.id}
                  className="bg-white border border-neutral-200 hover:border-neutral-300 rounded-xl overflow-hidden flex flex-col transition-colors"
                >
                  {/* Product Image + Status + Quick Photo/Delete */}
                  <div className="relative aspect-[4/3] bg-neutral-100 overflow-hidden">
                    <ProductImage
                      src={p.mainPhoto}
                      alt={p.name}
                      className="w-full h-full"
                    />

                    {/* Availability Indicator (color + text) */}
                    <div
                      className={`absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-semibold tracking-tight ${statusStyles.bar}`}
                    >
                      {statusStyles.label}
                    </div>

                    {/* Photo & Delete Controls */}
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setQuickPhotoProduct(p)}
                        className="p-1.5 rounded-md bg-white/95 hover:bg-white text-neutral-800 border border-neutral-200/90 cursor-pointer"
                        title="Cambiar o agregar fotografías"
                      >
                        <Camera className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(p)}
                        className="p-1.5 rounded-md bg-white/95 hover:bg-red-50 text-neutral-700 hover:text-red-700 border border-neutral-200/90 cursor-pointer"
                        title="Eliminar producto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {p.galleryPhotos && p.galleryPhotos.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setQuickPhotoProduct(p)}
                        className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 text-white text-[10px] font-medium cursor-pointer"
                      >
                        {p.galleryPhotos.length} fotos
                      </button>
                    )}
                  </div>

                  {/* Card Content */}
                  <div className="p-3 sm:p-3.5 flex-1 flex flex-col gap-2.5">
                    {/* SKU + Name + Color */}
                    <div className="min-w-0">
                      <p className="text-[10px] sm:text-[11px] text-neutral-500 font-mono-num truncate">
                        {p.sku}
                        {p.isPack ? ` · Pack x${p.packUnits}` : ''}
                        {p.isExample ? ' · Ejemplo' : ''}
                      </p>
                      <h3 className="text-xs sm:text-sm font-semibold text-neutral-950 leading-snug line-clamp-2 mt-0.5">
                        {p.name}
                      </h3>
                      <p className="text-[11px] sm:text-xs text-neutral-600 truncate mt-0.5">
                        Color: <span className="font-medium text-neutral-900">{colorLabel}</span>
                      </p>
                    </div>

                    {/* Sizes S, M, L Stock Breakdown + Total */}
                    <div className="space-y-1.5 pt-2 border-t border-neutral-100">
                      <div className="grid grid-cols-3 gap-1.5">
                        {coreSizes.map((sz) => {
                          const txtColor = !sz.exists || sz.avail <= 0
                            ? 'text-red-600'
                            : sz.avail <= sz.minStock
                              ? 'text-amber-700'
                              : 'text-emerald-700';
                          const boxTone = !sz.exists || sz.avail <= 0
                            ? 'bg-neutral-50 border-neutral-200/80'
                            : sz.avail <= sz.minStock
                              ? 'bg-amber-50/60 border-amber-200/80'
                              : 'bg-emerald-50/50 border-emerald-200/80';
                          return (
                            <div
                              key={sz.size}
                              className={`rounded-lg border px-1.5 py-1 text-center ${boxTone}`}
                            >
                              <p className="text-[10px] font-semibold text-neutral-600">{sz.size}</p>
                              <p className={`font-mono-num text-xs sm:text-sm font-bold ${txtColor}`}>
                                {sz.stock}
                              </p>
                            </div>
                          );
                        })}
                      </div>

                      {extraSizes.length > 0 && (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-neutral-600 font-mono-num">
                          {extraSizes.map((es) => (
                            <span key={es.size}>
                              {es.size}:{' '}
                              <strong
                                className={
                                  es.avail <= 0
                                    ? 'text-red-600'
                                    : es.avail <= es.minStock
                                      ? 'text-amber-700'
                                      : 'text-emerald-700'
                                }
                              >
                                {es.stock}
                              </strong>
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-neutral-600">
                        <span>Stock total</span>
                        <span className="font-mono-num font-semibold text-neutral-950">
                          {totalStock} u.
                          {totalReserved > 0 && (
                            <span className="text-amber-700 font-normal ml-1">
                              ({totalReserved} res.)
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Unit Cost, Sale Price & Margin */}
                    <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-neutral-100 text-[10px] sm:text-[11px]">
                      <div className="min-w-0">
                        <p className="text-neutral-500 truncate">Costo/u</p>
                        <p className="font-mono-num font-semibold text-neutral-800 truncate mt-0.5">
                          {formatExactCLP(avgUnitCost)}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-neutral-500 truncate">Venta</p>
                        <p className="font-mono-num font-semibold text-neutral-950 truncate mt-0.5">
                          {formatCLP(p.salePrice)}
                        </p>
                      </div>
                      <div className="min-w-0 text-right">
                        <p className="text-neutral-500 truncate">Margen</p>
                        <p
                          className={`font-mono-num font-semibold truncate mt-0.5 ${
                            estProfitPerGarment >= 0 ? 'text-emerald-700' : 'text-red-700'
                          }`}
                          title={`Ganancia unitaria: ${formatCLP(estProfitPerGarment)}`}
                        >
                          {formatPercent(marginPct, 0)}
                        </p>
                      </div>
                    </div>
                    <p className="text-[10px] sm:text-[11px] text-neutral-500 flex items-center justify-between -mt-1">
                      <span>Ganancia/u</span>
                      <span
                        className={`font-mono-num font-medium ${
                          estProfitPerGarment >= 0 ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {formatCLP(estProfitPerGarment)}
                      </span>
                    </p>

                    {/* Action Buttons: Vender, Reponer, Editar */}
                    <div className="mt-auto pt-2.5 border-t border-neutral-100 grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        disabled={totalAvail <= 0}
                        onClick={() => setQuickSaleProduct(p)}
                        className="inline-flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap transition-colors"
                        title={totalAvail <= 0 ? 'Sin stock disponible' : 'Registrar venta rápida'}
                      >
                        <ShoppingBag className="w-3 h-3 shrink-0 hidden sm:inline" />
                        <span>Vender</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickRestockProduct(p)}
                        className="inline-flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg bg-neutral-950 hover:bg-neutral-800 text-white text-[11px] font-medium cursor-pointer whitespace-nowrap transition-colors"
                        title="Reponer stock por talla"
                      >
                        <PackagePlus className="w-3 h-3 shrink-0 hidden sm:inline" />
                        <span>Reponer</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingProduct(p);
                          setShowModal(true);
                        }}
                        className="inline-flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800 text-[11px] font-medium cursor-pointer whitespace-nowrap transition-colors"
                        title="Editar producto completo"
                      >
                        <Pencil className="w-3 h-3 shrink-0 hidden sm:inline" />
                        <span>Editar</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )
      )}

      {/* Table View by Variant */}
      {viewMode === 'table' && (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
                <th className="py-3 px-4 font-medium">Producto / SKU</th>
                <th className="py-3 px-3 font-medium">Color / Talla</th>
                <th className="py-3 px-3 font-medium">Estado</th>
                <th className="py-3 px-3 font-medium text-right">Stock</th>
                <th className="py-3 px-3 font-medium text-right">Reserv.</th>
                <th className="py-3 px-3 font-medium text-right">Costo/u</th>
                <th className="py-3 px-3 font-medium text-right">Venta</th>
                <th className="py-3 px-3 font-medium text-right">Margen</th>
                <th className="py-3 px-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredProducts.flatMap((p) =>
                p.variants
                  .filter((v) => {
                    if (
                      colorFilter !== 'all' &&
                      v.color.trim().toLowerCase() !== colorFilter.toLowerCase()
                    ) {
                      return false;
                    }
                    if (
                      sizeFilter !== 'all' &&
                      v.size.trim().toUpperCase() !== sizeFilter.toUpperCase()
                    ) {
                      return false;
                    }
                    return true;
                  })
                  .map((v) => {
                    const avail = Math.max(0, v.stock - v.reservedStock);
                    const unitSale = p.isPack
                      ? p.singleUnitSalePrice || Math.round(p.salePrice / Math.max(1, p.packUnits))
                      : p.salePrice;
                    const profit = unitSale - v.unitCost;
                    const marginPct = unitSale > 0 ? (profit / unitSale) * 100 : 0;
                    const vStatus =
                      avail <= 0
                        ? { text: 'Agotado', cls: 'text-red-700 font-semibold' }
                        : avail <= v.minStock
                          ? { text: 'Stock bajo', cls: 'text-amber-700 font-semibold' }
                          : { text: 'Disponible', cls: 'text-emerald-700 font-semibold' };

                    return (
                      <tr key={v.id} className="hover:bg-neutral-50/70">
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <ProductImage
                              src={p.mainPhoto}
                              alt={p.name}
                              className="w-9 h-9 rounded-md shrink-0"
                            />
                            <div>
                              <p className="font-medium text-neutral-950">{p.name}</p>
                              <p className="text-[11px] text-neutral-500 font-mono-num">
                                {v.skuVariant}
                                {p.isPack ? ` · Pack x${p.packUnits}` : ''}
                                {p.supplierId && supplierMap.get(p.supplierId)
                                  ? ` · ${supplierMap.get(p.supplierId)}`
                                  : ''}
                                {p.isExample ? ' · Ejemplo' : ''}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-neutral-800 whitespace-nowrap">
                          {v.color} / <strong>{v.size}</strong>
                        </td>
                        <td className={`py-2.5 px-3 whitespace-nowrap ${vStatus.cls}`}>
                          {vStatus.text}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-num">
                          <span className={vStatus.cls}>{v.stock} u.</span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-num text-neutral-500">
                          {v.reservedStock}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-num text-neutral-800">
                          {formatExactCLP(v.unitCost)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-num text-neutral-950">
                          {formatCLP(p.salePrice)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-num text-emerald-700 font-medium whitespace-nowrap">
                          {formatCLP(profit)} ({formatPercent(marginPct, 0)})
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap space-x-2.5">
                          <button
                            type="button"
                            disabled={avail <= 0}
                            onClick={() => setQuickSaleProduct(p)}
                            className="text-emerald-700 hover:text-emerald-800 font-medium cursor-pointer disabled:opacity-40"
                          >
                            Vender
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuickRestockProduct(p)}
                            className="text-neutral-900 hover:text-neutral-600 font-medium cursor-pointer"
                          >
                            Reponer
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAdjustTarget({ product: p, variant: v });
                              setAdjustDelta('1');
                            }}
                            className="text-neutral-600 hover:text-neutral-950 cursor-pointer"
                          >
                            Ajustar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProduct(p);
                              setShowModal(true);
                            }}
                            className="text-neutral-600 hover:text-neutral-950 cursor-pointer"
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    );
                  }),
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Inventory Movements History View */}
      {viewMode === 'movements' && (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
                <th className="py-3 px-4 font-medium">Fecha y hora</th>
                <th className="py-3 px-3 font-medium">Producto / Variante</th>
                <th className="py-3 px-3 font-medium">Movimiento</th>
                <th className="py-3 px-3 font-medium text-right">Cambio</th>
                <th className="py-3 px-3 font-medium text-right">Anterior → Nuevo</th>
                <th className="py-3 px-3 font-medium">Motivo</th>
                <th className="py-3 px-4 font-medium">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {data.movements
                .filter((m) => includeExamples || !m.isExample)
                .map((m) => {
                  const prod = data.products.find((p) => p.id === m.productId);
                  const vari = prod?.variants.find((v) => v.id === m.variantId);
                  return (
                    <tr key={m.id} className="hover:bg-neutral-50/70">
                      <td className="py-2.5 px-4 font-mono-num text-neutral-600 whitespace-nowrap">
                        {formatDateTimeCL(m.createdAt)}
                      </td>
                      <td className="py-2.5 px-3 text-neutral-900">
                        {prod?.name || `#${m.productId}`}{' '}
                        <span className="text-neutral-500">
                          · {vari ? `${vari.color} / ${vari.size}` : ''}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-neutral-700">
                        {m.movementType.replace(/_/g, ' ')}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono-num font-semibold ${
                          m.quantityChange > 0 ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num text-neutral-700">
                        {m.previousStock} → {m.newStock}
                      </td>
                      <td className="py-2.5 px-3 text-neutral-600 max-w-xs truncate">{m.reason}</td>
                      <td className="py-2.5 px-4 text-neutral-500">{m.performedBy}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk Import Modal (ZIP, JSON, CSV, Excel with preview & SKU deduplication) */}
      {showBulkImport && (
        <BulkImportModal
          existingProducts={data.products}
          defaultTargetProfit={data.settings?.targetProfitPerUnit ?? 10000}
          apiFetch={apiFetch}
          onClose={() => setShowBulkImport(false)}
          onCompleted={async (summary) => {
            setShowBulkImport(false);
            notify('success', summary);
            await onRefresh();
          }}
          onError={(msg) => notify('error', msg)}
        />
      )}

      {/* Quick Sale Modal */}
      {quickSaleProduct && (
        <QuickSaleModal
          product={quickSaleProduct}
          data={data}
          apiFetch={apiFetch}
          onClose={() => setQuickSaleProduct(null)}
          onSuccess={async (msg) => {
            setQuickSaleProduct(null);
            notify('success', msg);
            await onRefresh();
          }}
          onError={(msg) => notify('error', msg)}
        />
      )}

      {/* Quick Restock Modal */}
      {quickRestockProduct && (
        <QuickRestockModal
          product={quickRestockProduct}
          data={data}
          apiFetch={apiFetch}
          onClose={() => setQuickRestockProduct(null)}
          onSuccess={async (msg) => {
            setQuickRestockProduct(null);
            notify('success', msg);
            await onRefresh();
          }}
          onError={(msg) => notify('error', msg)}
        />
      )}

      {/* Quick Photo Manager Modal */}
      {quickPhotoProduct && (
        <QuickPhotoModal
          product={quickPhotoProduct}
          apiFetch={apiFetch}
          onClose={() => setQuickPhotoProduct(null)}
          onSuccess={async (msg) => {
            setQuickPhotoProduct(null);
            notify('success', msg);
            await onRefresh();
          }}
          onError={(msg) => notify('error', msg)}
        />
      )}

      {/* Stock Adjustment Modal */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form
            onSubmit={handleAdjustStock}
            className="bg-white border border-neutral-200 rounded-xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-neutral-950">Ajuste manual de stock</h3>
              <button
                type="button"
                onClick={() => setAdjustTarget(null)}
                className="text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-neutral-600">
              <strong>{adjustTarget.product.name}</strong> · {adjustTarget.variant.color} /{' '}
              {adjustTarget.variant.size} (Stock actual:{' '}
              <span className="font-mono-num font-semibold">{adjustTarget.variant.stock} u.</span>)
            </p>
            <label className="block text-xs text-neutral-700">
              Cantidad a sumar (+) o restar (-) en prendas físicas
              <input
                type="number"
                required
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md font-mono-num text-sm"
              />
            </label>
            <label className="block text-xs text-neutral-700">
              Motivo del ajuste
              <input
                type="text"
                required
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Ej: Conteo físico de bodega o reposición inicial"
                className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAdjustTarget(null)}
                className="px-4 py-2 text-xs rounded-md border border-neutral-200 text-neutral-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium rounded-md bg-neutral-950 text-white cursor-pointer"
              >
                Guardar ajuste
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Product Create / Edit Modal */}
      {showModal && (
        <ProductFormModal
          data={data}
          product={editingProduct}
          onClose={() => setShowModal(false)}
          apiFetch={apiFetch}
          onSaved={async (msg) => {
            setShowModal(false);
            notify('success', msg);
            await onRefresh();
          }}
          onError={(msg) => notify('error', msg)}
        />
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Eliminar producto"
        description={`¿Eliminar "${deleteTarget?.name || ''}" y todas sus variantes del inventario?`}
        confirmLabel="Eliminar"
        onConfirm={confirmDeleteProduct}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

// =============================================================================
// PRICING CALCULATOR (Section 11)
// =============================================================================
const PricingCalculatorPanel: React.FC<{
  defaultTargetProfit: number;
  onClose: () => void;
}> = ({ defaultTargetProfit, onClose }) => {
  const [mode, setMode] = useState<'fixed' | 'markup' | 'margin'>('fixed');
  const [unitCost, setUnitCost] = useState('5703');
  const [packUnits, setPackUnits] = useState('1');
  const [targetProfit, setTargetProfit] = useState(String(defaultTargetProfit));
  const [markupPct, setMarkupPct] = useState('175');
  const [marginPct, setMarginPct] = useState('63');
  const [commissionPct, setCommissionPct] = useState('0');
  const [adCost, setAdCost] = useState('0');
  const [packagingCost, setPackagingCost] = useState('0');

  const costNum = Number(unitCost) || 0;
  const units = Math.max(1, Number(packUnits) || 1);
  const totalBaseCost = costNum * units;
  const extraPerItem = (Number(adCost) || 0) + (Number(packagingCost) || 0);
  const commRate = Math.min(0.8, Math.max(0, (Number(commissionPct) || 0) / 100));

  let suggestedPrice = 0;
  if (mode === 'fixed') {
    const desiredProfit = (Number(targetProfit) || 0) * units;
    suggestedPrice = (totalBaseCost + extraPerItem + desiredProfit) / (1 - commRate);
  } else if (mode === 'markup') {
    const recargo = (Number(markupPct) || 0) / 100;
    suggestedPrice = (totalBaseCost * (1 + recargo) + extraPerItem) / (1 - commRate);
  } else {
    const desiredMargin = Math.min(0.95, Math.max(0.01, (Number(marginPct) || 0) / 100));
    const denom = Math.max(0.05, 1 - desiredMargin - commRate);
    suggestedPrice = (totalBaseCost + extraPerItem) / denom;
  }

  const commissionCLP = suggestedPrice * commRate;
  const netProfit = suggestedPrice - totalBaseCost - extraPerItem - commissionCLP;
  const actualMarkup = totalBaseCost > 0 ? (netProfit / totalBaseCost) * 100 : 0;
  const actualMargin = suggestedPrice > 0 ? (netProfit / suggestedPrice) * 100 : 0;

  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-neutral-950">
            Calculadora de Precio de Venta y Margen
          </h3>
          <p className="text-xs text-neutral-500">
            Distingue ganancia sobre costo (recargo) de margen porcentual sobre precio de venta.
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4 p-1 bg-neutral-100 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setMode('fixed')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
            mode === 'fixed' ? 'bg-white text-neutral-950 shadow-xs' : 'text-neutral-600'
          }`}
        >
          1. Ganancia fija ($ CLP)
        </button>
        <button
          type="button"
          onClick={() => setMode('markup')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
            mode === 'markup' ? 'bg-white text-neutral-950 shadow-xs' : 'text-neutral-600'
          }`}
        >
          2. Recargo % sobre costo
        </button>
        <button
          type="button"
          onClick={() => setMode('margin')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
            mode === 'margin' ? 'bg-white text-neutral-950 shadow-xs' : 'text-neutral-600'
          }`}
        >
          3. Margen % sobre venta
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <label className="text-xs text-neutral-600">
            Costo unitario (CLP)
            <input
              type="number"
              step="0.01"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              className="mt-1 w-full px-2.5 py-2 border border-neutral-200 rounded-md font-mono-num text-sm text-neutral-950"
            />
          </label>
          <label className="text-xs text-neutral-600">
            Unidades (1 o pack x2)
            <input
              type="number"
              min={1}
              value={packUnits}
              onChange={(e) => setPackUnits(e.target.value)}
              className="mt-1 w-full px-2.5 py-2 border border-neutral-200 rounded-md font-mono-num text-sm text-neutral-950"
            />
          </label>
          {mode === 'fixed' && (
            <label className="text-xs text-neutral-600">
              Ganancia objetivo / calza
              <input
                type="number"
                value={targetProfit}
                onChange={(e) => setTargetProfit(e.target.value)}
                className="mt-1 w-full px-2.5 py-2 border border-neutral-200 rounded-md font-mono-num text-sm text-neutral-950"
              />
            </label>
          )}
          {mode === 'markup' && (
            <label className="text-xs text-neutral-600">
              Recargo sobre costo (%)
              <input
                type="number"
                value={markupPct}
                onChange={(e) => setMarkupPct(e.target.value)}
                className="mt-1 w-full px-2.5 py-2 border border-neutral-200 rounded-md font-mono-num text-sm text-neutral-950"
              />
            </label>
          )}
          {mode === 'margin' && (
            <label className="text-xs text-neutral-600">
              Margen sobre venta (%)
              <input
                type="number"
                value={marginPct}
                onChange={(e) => setMarginPct(e.target.value)}
                className="mt-1 w-full px-2.5 py-2 border border-neutral-200 rounded-md font-mono-num text-sm text-neutral-950"
              />
            </label>
          )}
          <label className="text-xs text-neutral-600">
            Comisión canal/tarjeta (%)
            <input
              type="number"
              step="0.1"
              value={commissionPct}
              onChange={(e) => setCommissionPct(e.target.value)}
              className="mt-1 w-full px-2.5 py-2 border border-neutral-200 rounded-md font-mono-num text-sm text-neutral-950"
            />
          </label>
          <label className="text-xs text-neutral-600">
            Publicidad por venta (CLP)
            <input
              type="number"
              value={adCost}
              onChange={(e) => setAdCost(e.target.value)}
              className="mt-1 w-full px-2.5 py-2 border border-neutral-200 rounded-md font-mono-num text-sm text-neutral-950"
            />
          </label>
          <label className="text-xs text-neutral-600">
            Packaging / gastos extra
            <input
              type="number"
              value={packagingCost}
              onChange={(e) => setPackagingCost(e.target.value)}
              className="mt-1 w-full px-2.5 py-2 border border-neutral-200 rounded-md font-mono-num text-sm text-neutral-950"
            />
          </label>
        </div>

        <div className="lg:col-span-4 bg-neutral-950 text-white rounded-lg p-4 space-y-2">
          <p className="text-xs text-neutral-400">
            Precio sugerido {units > 1 ? `(Pack x${units})` : '(Unidad)'}
          </p>
          <p className="font-mono-num text-2xl font-bold text-emerald-400">
            {formatCLP(suggestedPrice)}
          </p>
          <div className="pt-2 border-t border-neutral-800 space-y-1 text-xs">
            <div className="flex justify-between text-neutral-300">
              <span>Costo base ({units} u.):</span>
              <span className="font-mono-num">{formatExactCLP(totalBaseCost)}</span>
            </div>
            <div className="flex justify-between text-neutral-300">
              <span>Ganancia neta:</span>
              <span className="font-mono-num text-emerald-400">{formatCLP(netProfit)}</span>
            </div>
            <div className="flex justify-between text-neutral-400">
              <span>Recargo sobre costo:</span>
              <span className="font-mono-num">{formatPercent(actualMarkup)}</span>
            </div>
            <div className="flex justify-between text-neutral-400">
              <span>Margen sobre venta:</span>
              <span className="font-mono-num">{formatPercent(actualMargin)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// PRODUCT CREATE / EDIT MODAL
// =============================================================================
const ProductFormModal: React.FC<{
  data: WorkspaceData;
  product: Product | null;
  onClose: () => void;
  apiFetch: <T = any>(url: string, options?: RequestInit) => Promise<T>;
  onSaved: (msg: string) => Promise<void>;
  onError: (msg: string) => void;
}> = ({ data, product, onClose, apiFetch, onSaved, onError }) => {
  const defaultProfit = data.settings?.targetProfitPerUnit ?? 10000;

  const [sku, setSku] = useState(product?.sku || '');
  const [name, setName] = useState(product?.name || '');
  const [category, setCategory] = useState(product?.category || 'Calzas');
  const [brand, setBrand] = useState(product?.brand || '');
  const [model, setModel] = useState(product?.model || '');
  const [description, setDescription] = useState(product?.description || '');
  const [supplierId, setSupplierId] = useState<string>(product?.supplierId ? String(product.supplierId) : '');
  const [purchaseDate, setPurchaseDate] = useState(product?.purchaseDate || todayChileISO());
  const [purchasePrice, setPurchasePrice] = useState(String(product?.purchasePrice ?? 5703));
  const [salePrice, setSalePrice] = useState(String(product?.salePrice ?? 5703 + defaultProfit));
  const [location, setLocation] = useState(product?.location || 'Bodega Antofagasta');
  const [mainPhoto, setMainPhoto] = useState(product?.mainPhoto || '');
  const [galleryPhotos, setGalleryPhotos] = useState<string[]>(product?.galleryPhotos || []);
  const [isPack, setIsPack] = useState(product?.isPack || false);
  const [packUnits, setPackUnits] = useState(String(product?.packUnits || 2));
  const [allowSingleUnitSale, setAllowSingleUnitSale] = useState(product?.allowSingleUnitSale ?? true);
  const [packComposition, setPackComposition] = useState(product?.packComposition || '');
  const [singleUnitSalePrice, setSingleUnitSalePrice] = useState(
    String(product?.singleUnitSalePrice || ''),
  );
  const [isActive, setIsActive] = useState(product?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  const [variants, setVariants] = useState<
    Array<{
      id?: number;
      color: string;
      size: string;
      stock: number;
      minStock: number;
      unitCost: number;
    }>
  >(
    product?.variants?.length
      ? product.variants.map((v) => ({
          id: v.id,
          color: v.color,
          size: v.size,
          stock: v.stock,
          minStock: v.minStock,
          unitCost: v.unitCost,
        }))
      : [
          { color: 'Negro', size: 'S', stock: 0, minStock: 2, unitCost: 5703 },
          { color: 'Negro', size: 'M', stock: 0, minStock: 2, unitCost: 5703 },
          { color: 'Negro', size: 'L', stock: 0, minStock: 2, unitCost: 5703 },
        ],
  );

  const packCount = isPack ? Math.max(2, Number(packUnits) || 2) : 1;
  const parsedPurchase = Number(purchasePrice) || 0;
  const computedUnitCost = parsedPurchase / packCount;

  const applySuggestedPrice = () => {
    const suggestedTotal = Math.round(parsedPurchase + defaultProfit * packCount);
    setSalePrice(String(suggestedTotal));
    if (isPack) {
      setSingleUnitSalePrice(String(Math.round(computedUnitCost + defaultProfit)));
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, isMain: boolean) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      for (const file of Array.from(files)) {
        const dataUrl = await compressImageToDataUrl(file);
        if (isMain) {
          setMainPhoto(dataUrl);
          if (!galleryPhotos.includes(dataUrl)) {
            setGalleryPhotos((prev) => [dataUrl, ...prev]);
          }
        } else {
          setGalleryPhotos((prev) => [...prev, dataUrl]);
          if (!mainPhoto) setMainPhoto(dataUrl);
        }
      }
    } catch (err: any) {
      onError(err.message || 'No se pudo cargar la fotografía.');
    } finally {
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return onError('Ingresa el nombre del producto.');
    if (variants.length === 0) return onError('Agrega al menos una variante de color y talla.');

    setSaving(true);
    try {
      const payload = {
        sku: sku.trim() || undefined,
        name: name.trim(),
        category,
        brand,
        model,
        description,
        supplierId: supplierId ? Number(supplierId) : null,
        purchaseDate,
        purchasePrice: parsedPurchase,
        salePrice: Number(salePrice) || 0,
        location,
        mainPhoto,
        galleryPhotos,
        isPack,
        packUnits: packCount,
        allowSingleUnitSale,
        packComposition,
        singleUnitSalePrice: isPack
          ? Number(singleUnitSalePrice) || Math.round((Number(salePrice) || 0) / packCount)
          : Number(salePrice) || 0,
        isActive,
        isExample: product?.isExample ?? false,
        variants: variants.map((v) => ({
          id: v.id,
          color: v.color.trim() || 'Estándar',
          size: v.size.trim() || 'Única',
          stock: Math.max(0, Math.round(Number(v.stock) || 0)),
          minStock: Math.max(0, Math.round(Number(v.minStock) || 0)),
          unitCost: computedUnitCost,
        })),
      };

      if (product) {
        await apiFetch(`/api/products/${product.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        await onSaved(`Producto "${name}" actualizado correctamente.`);
      } else {
        await apiFetch('/api/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        await onSaved(`Producto "${name}" registrado en PostgreSQL.`);
      }
    } catch (err: any) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-neutral-200 rounded-lg max-w-4xl w-full max-h-[92vh] overflow-y-auto p-6 space-y-6"
      >
        <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
          <div>
            <h3 className="text-lg font-semibold text-neutral-950">
              {product ? 'Editar producto' : 'Registrar nuevo producto'}
            </h3>
            <p className="text-xs text-neutral-500">
              Configura precios, fotografías, modalidad pack y stock por talla y color.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Basic Info */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="text-xs text-neutral-700 sm:col-span-2">
            Nombre del producto *
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Calza Seamless Sculpt High Waist"
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
            />
          </label>
          <label className="text-xs text-neutral-700">
            Código SKU (auto si vacío)
            <input
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="DUNA-CLZ-001"
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
            />
          </label>

          <label className="text-xs text-neutral-700">
            Categoría
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm bg-white"
            >
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-neutral-700">
            Marca
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="SHEIN Sports, Velisys..."
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
            />
          </label>
          <label className="text-xs text-neutral-700">
            Modelo
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Seamless High Waist"
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
            />
          </label>

          <label className="text-xs text-neutral-700">
            Proveedor
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm bg-white"
            >
              <option value="">Sin proveedor asignado</option>
              {data.suppliers.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-neutral-700">
            Fecha de compra
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
            />
          </label>
          <label className="text-xs text-neutral-700">
            Ubicación física
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
            />
          </label>
        </div>

        {/* Pack Configuration & Pricing */}
        <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-neutral-900 cursor-pointer">
              <input
                type="checkbox"
                checked={isPack}
                onChange={(e) => setIsPack(e.target.checked)}
                className="w-4 h-4 accent-emerald-600"
              />
              <span>Este producto se compra / vende como Pack (ej: Pack de 2 calzas)</span>
            </label>
            <button
              type="button"
              onClick={applySuggestedPrice}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
            >
              Aplicar precio sugerido (+{formatCLP(defaultProfit)} por prenda)
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label className="text-xs text-neutral-700">
              {isPack ? 'Precio compra del Pack (CLP)' : 'Precio de compra (CLP)'}
              <input
                type="number"
                step="0.01"
                min={0}
                required
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num bg-white"
              />
            </label>
            <label className="text-xs text-neutral-700">
              {isPack ? 'Precio venta Pack completo (CLP)' : 'Precio de venta (CLP)'}
              <input
                type="number"
                min={0}
                required
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num bg-white"
              />
            </label>
            {isPack && (
              <>
                <label className="text-xs text-neutral-700">
                  Prendas por pack
                  <input
                    type="number"
                    min={2}
                    value={packUnits}
                    onChange={(e) => setPackUnits(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num bg-white"
                  />
                </label>
                <label className="text-xs text-neutral-700">
                  Precio venta 1 prenda suelta
                  <input
                    type="number"
                    min={0}
                    value={singleUnitSalePrice}
                    onChange={(e) => setSingleUnitSalePrice(e.target.value)}
                    placeholder={String(Math.round(computedUnitCost + defaultProfit))}
                    className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num bg-white"
                  />
                </label>
              </>
            )}
          </div>

          {isPack && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <label className="text-xs text-neutral-700">
                Composición física del pack
                <input
                  type="text"
                  value={packComposition}
                  onChange={(e) => setPackComposition(e.target.value)}
                  placeholder="Ej: 1 calza negra + 1 calza grafito"
                  className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm bg-white"
                />
              </label>
              <div className="flex flex-col justify-center text-xs text-neutral-600">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowSingleUnitSale}
                    onChange={(e) => setAllowSingleUnitSale(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600"
                  />
                  <span>Permitir vender unidades sueltas sin duplicar inventario</span>
                </label>
                <p className="mt-1 text-[11px] text-emerald-700 font-mono-num">
                  Costo exacto interno por prenda: {formatExactCLP(computedUnitCost)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Photos Upload & Gallery */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-neutral-900">
              Fotografía principal y galería
            </span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-neutral-200 bg-white hover:bg-neutral-50 cursor-pointer">
                <ImagePlus className="w-3.5 h-3.5 text-emerald-700" />
                <span>Subir foto principal</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handlePhotoUpload(e, true)}
                  className="hidden"
                />
              </label>
              <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-neutral-200 bg-white hover:bg-neutral-50 cursor-pointer">
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar a galería</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => handlePhotoUpload(e, false)}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {mainPhoto && (
              <div className="relative w-24 h-24 rounded-md overflow-hidden border-2 border-emerald-600">
                <ProductImage src={mainPhoto} alt="Principal" className="w-full h-full" />
                <button
                  type="button"
                  onClick={() => setMainPhoto('')}
                  className="absolute top-1 right-1 bg-black/70 text-white rounded p-0.5 cursor-pointer"
                  title="Quitar foto principal"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            {galleryPhotos
              .filter((g) => g !== mainPhoto)
              .map((g, i) => (
                <div key={i} className="relative w-20 h-20 rounded-md overflow-hidden border border-neutral-200">
                  <ProductImage src={g} alt={`Galería ${i + 1}`} className="w-full h-full" />
                  <button
                    type="button"
                    onClick={() => setMainPhoto(g)}
                    className="absolute bottom-0 inset-x-0 bg-black/65 text-white text-[10px] py-0.5 text-center cursor-pointer"
                  >
                    Principal
                  </button>
                  <button
                    type="button"
                    onClick={() => setGalleryPhotos((prev) => prev.filter((x) => x !== g))}
                    className="absolute top-1 right-1 bg-black/70 text-white rounded p-0.5 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
            <span>Fotos rápidas de estudio:</span>
            {STUDIO_PRESET_PHOTOS.map((sp) => (
              <button
                key={sp.url}
                type="button"
                onClick={() => {
                  setMainPhoto(sp.url);
                  if (!galleryPhotos.includes(sp.url)) setGalleryPhotos((prev) => [...prev, sp.url]);
                }}
                className="underline hover:text-neutral-950 cursor-pointer"
              >
                {sp.label}
              </button>
            ))}
          </div>
        </div>

        {/* Independent Variants (Color + Size) */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-semibold text-neutral-950">
                Variantes independientes (Color y Talla)
              </h4>
              <p className="text-[11px] text-neutral-500">
                {isPack
                  ? 'Ingresa stock en prendas físicas (ej: 2 packs x 2 calzas = 4 prendas).'
                  : 'Cada talla y color controla su stock de forma independiente.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setVariants((prev) => [
                  ...prev,
                  {
                    color: prev[prev.length - 1]?.color || 'Negro',
                    size: 'XL',
                    stock: 0,
                    minStock: 2,
                    unitCost: computedUnitCost,
                  },
                ])
              }
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-neutral-200 hover:bg-neutral-50 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Agregar variante</span>
            </button>
          </div>

          <div className="border border-neutral-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600">
                <tr>
                  <th className="py-2 px-3">Color</th>
                  <th className="py-2 px-3">Talla</th>
                  <th className="py-2 px-3">Stock físico (prendas)</th>
                  <th className="py-2 px-3">Stock mínimo</th>
                  <th className="py-2 px-3 text-right">Quitar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {variants.map((v, idx) => (
                  <tr key={idx}>
                    <td className="p-2">
                      <input
                        type="text"
                        required
                        value={v.color}
                        onChange={(e) =>
                          setVariants((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, color: e.target.value } : row)),
                          )
                        }
                        className="w-full px-2.5 py-1.5 border border-neutral-200 rounded text-xs"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        required
                        value={v.size}
                        onChange={(e) =>
                          setVariants((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, size: e.target.value } : row)),
                          )
                        }
                        className="w-24 px-2.5 py-1.5 border border-neutral-200 rounded text-xs"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min={0}
                        value={v.stock}
                        onChange={(e) =>
                          setVariants((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, stock: Math.max(0, Number(e.target.value) || 0) } : row,
                            ),
                          )
                        }
                        className="w-28 px-2.5 py-1.5 border border-neutral-200 rounded text-xs font-mono-num"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min={0}
                        value={v.minStock}
                        onChange={(e) =>
                          setVariants((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, minStock: Math.max(0, Number(e.target.value) || 0) } : row,
                            ),
                          )
                        }
                        className="w-24 px-2.5 py-1.5 border border-neutral-200 rounded text-xs font-mono-num"
                      />
                    </td>
                    <td className="p-2 text-right">
                      {variants.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setVariants((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-neutral-400 hover:text-red-700 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <label className="block text-xs text-neutral-700">
          Descripción
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detalles de tela, calce, compresión o notas internas..."
            className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
          />
        </label>

        <div className="flex items-center justify-between pt-4 border-t border-neutral-200">
          <label className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 accent-emerald-600"
            />
            <span>Producto activo en catálogo</span>
          </label>
          <div className="flex items-center gap-2">
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
              className="px-5 py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-60"
            >
              {saving ? 'Guardando...' : product ? 'Guardar cambios' : 'Registrar producto'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
