import React, { useMemo, useRef, useState } from 'react';
import {
  Upload,
  FileArchive,
  FileSpreadsheet,
  FileJson,
  X,
  CheckCircle2,
  AlertTriangle,
  Image as ImageIcon,
  Download,
  Loader2,
} from 'lucide-react';
import type { Product } from '../types.ts';
import {
  parseBulkInventoryFile,
  type BulkImportParseResult,
  type ParsedImportProduct,
} from '../lib/bulkImport.ts';
import { formatCLP, formatExactCLP, formatPercent } from '../lib/format.ts';
import { downloadImportTemplateExcel } from '../lib/exports.ts';
import { ProductImage } from './ProductImage.tsx';

interface BulkImportModalProps {
  existingProducts: Product[];
  defaultTargetProfit: number;
  apiFetch: <T = any>(url: string, options?: RequestInit) => Promise<T>;
  onClose: () => void;
  onCompleted: (summary: string) => Promise<void>;
  onError: (msg: string) => void;
}

type DuplicateStrategy = 'skip' | 'update_add' | 'update_replace';

export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  existingProducts,
  defaultTargetProfit,
  apiFetch,
  onClose,
  onCompleted,
  onError,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<BulkImportParseResult | null>(null);
  const [items, setItems] = useState<ParsedImportProduct[]>([]);
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('skip');
  const [importing, setImporting] = useState(false);
  const [progressText, setProgressText] = useState('');

  const processFile = async (file: File) => {
    setParsing(true);
    setParseResult(null);
    setItems([]);
    try {
      const result = await parseBulkInventoryFile(file, existingProducts, defaultTargetProfit);
      setParseResult(result);
      setItems(result.products);
    } catch (err: any) {
      onError(err.message || 'No se pudo analizar el archivo.');
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void processFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void processFile(f);
  };

  const stats = useMemo(() => {
    const selected = items.filter((i) => i.selected);
    const newCount = selected.filter((i) => !i.isDuplicate).length;
    const dupCount = selected.filter((i) => i.isDuplicate).length;
    const totalUnits = selected.reduce(
      (sum, p) => sum + p.variants.reduce((s, v) => s + v.stock, 0),
      0,
    );
    const withPhotos = selected.filter((p) => Boolean(p.mainPhoto)).length;
    const actionable = duplicateStrategy === 'skip' ? newCount : selected.length;
    return { total: items.length, selectedCount: selected.length, newCount, dupCount, totalUnits, withPhotos, actionable };
  }, [items, duplicateStrategy]);

  const toggleItem = (id: string) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, selected: !it.selected } : it)));
  };

  const selectAll = (checked: boolean) => {
    setItems((prev) => prev.map((it) => ({ ...it, selected: checked })));
  };

  const selectOnlyNew = () => {
    setItems((prev) => prev.map((it) => ({ ...it, selected: !it.isDuplicate })));
  };

  const handleConfirmImport = async () => {
    const toImport = items.filter(
      (it) => it.selected && (duplicateStrategy !== 'skip' || !it.isDuplicate),
    );
    if (toImport.length === 0) {
      onError('No hay productos seleccionados para importar con la configuración actual.');
      return;
    }

    setImporting(true);
    try {
      // Send in chunks of 12 products so base64 images stay well within request limits
      const BATCH_SIZE = 12;
      let totalCreated = 0;
      let totalUpdated = 0;
      let totalSkipped = 0;
      let totalVariants = 0;

      for (let i = 0; i < toImport.length; i += BATCH_SIZE) {
        const chunk = toImport.slice(i, i + BATCH_SIZE);
        setProgressText(
          `Guardando lote ${Math.floor(i / BATCH_SIZE) + 1} de ${Math.ceil(toImport.length / BATCH_SIZE)} (${Math.min(i + BATCH_SIZE, toImport.length)}/${toImport.length} productos)...`,
        );

        const payload = {
          duplicateStrategy,
          products: chunk.map((p) => ({
            sku: p.sku,
            name: p.name,
            category: p.category,
            brand: p.brand,
            model: p.model,
            description: p.description,
            supplierName: p.supplierName || undefined,
            purchaseDate: p.purchaseDate || undefined,
            purchasePrice: p.purchasePrice,
            salePrice: p.salePrice,
            singleUnitSalePrice: p.singleUnitSalePrice,
            isPack: p.isPack,
            packUnits: p.packUnits,
            packComposition: p.packComposition,
            location: p.location,
            mainPhoto: p.mainPhoto,
            galleryPhotos: p.galleryPhotos,
            isActive: p.isActive,
            variants: p.variants,
          })),
        };

        const res = await apiFetch('/api/products/import', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        totalCreated += res.importedProducts || 0;
        totalUpdated += res.updatedProducts || 0;
        totalSkipped += res.skippedProducts || 0;
        totalVariants += res.importedVariants || 0;
      }

      const parts: string[] = [];
      if (totalCreated > 0) parts.push(`${totalCreated} nuevo(s)`);
      if (totalUpdated > 0) parts.push(`${totalUpdated} actualizado(s)`);
      if (totalSkipped > 0) parts.push(`${totalSkipped} omitido(s) por SKU`);
      await onCompleted(
        `Importación completada: ${parts.join(', ')} (${totalVariants} variantes guardadas).`,
      );
    } catch (err: any) {
      onError(err.message || 'Ocurrió un error al guardar la importación.');
    } finally {
      setImporting(false);
      setProgressText('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white border border-neutral-200 rounded-xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between gap-4 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-neutral-950">
              Importación masiva de inventario e imágenes
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Compatible con ZIP (CSV + JSON Base64 + carpeta de fotos), JSON, CSV y Excel (.xlsx). Detección automática por SKU.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Dropzone (shown initially or compact when file already loaded) */}
          {!parseResult ? (
            <div className="space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => !parsing && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 sm:p-10 text-center cursor-pointer transition-colors ${
                  dragging
                    ? 'border-emerald-500 bg-emerald-50/50'
                    : 'border-neutral-300 hover:border-neutral-400 bg-neutral-50/60'
                }`}
              >
                {parsing ? (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                    <p className="text-sm font-medium text-neutral-900">
                      Analizando archivo y procesando fotografías...
                    </p>
                    <p className="text-xs text-neutral-500">
                      Extrayendo datos, vinculando imágenes por SKU y verificando duplicados.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-neutral-950 text-white flex items-center justify-center">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-neutral-950">
                        Arrastra tu archivo aquí o haz clic para seleccionarlo
                      </p>
                      <p className="text-xs text-neutral-500 mt-1">
                        Formatos admitidos: <strong>.ZIP</strong>, <strong>.JSON</strong>,{' '}
                        <strong>.CSV</strong> y <strong>.XLSX / .XLS</strong>
                      </p>
                    </div>
                    <button
                      type="button"
                      className="mt-1 px-4 py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                    >
                      Seleccionar archivo
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 rounded-lg border border-neutral-200 bg-white space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-neutral-900">
                    <FileArchive className="w-4 h-4 text-emerald-600" />
                    <span>Paquete ZIP completo</span>
                  </div>
                  <p className="text-neutral-500 leading-relaxed">
                    Lee automáticamente el CSV, el JSON con imágenes en Base64 y la carpeta de fotografías del ZIP sin duplicar stock.
                  </p>
                </div>
                <div className="p-3.5 rounded-lg border border-neutral-200 bg-white space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-neutral-900">
                    <FileJson className="w-4 h-4 text-emerald-600" />
                    <span>JSON con imágenes Base64</span>
                  </div>
                  <p className="text-neutral-500 leading-relaxed">
                    Admite arreglos de productos, tallas S/M/L anidadas e imágenes en Base64, guardándolas de forma permanente.
                  </p>
                </div>
                <div className="p-3.5 rounded-lg border border-neutral-200 bg-white space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-neutral-900">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>CSV y Excel (.xlsx)</span>
                  </div>
                  <p className="text-neutral-500 leading-relaxed">
                    Compatible con una fila por talla o columnas separadas (S, M, L). Identifica duplicados mediante el SKU.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-neutral-500">
                  ¿Necesitas un formato base para Excel?
                </span>
                <button
                  type="button"
                  onClick={downloadImportTemplateExcel}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-800 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar plantilla Excel</span>
                </button>
              </div>
            </div>
          ) : (
            /* Preview Step */
            <div className="space-y-4">
              {/* File banner + change file */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg bg-neutral-50 border border-neutral-200">
                <div className="text-xs space-y-0.5">
                  <p className="font-semibold text-neutral-950">
                    Archivo cargado: {parseResult.fileName}
                  </p>
                  <p className="text-neutral-500">
                    Contenido detectado: {parseResult.detectedSources.join(' · ')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-neutral-200 bg-white hover:bg-neutral-100 text-neutral-800 cursor-pointer"
                >
                  Cambiar archivo
                </button>
              </div>

              {parseResult.warnings.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                  {parseResult.warnings.map((w, i) => (
                    <p key={i} className="flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                      <span>{w}</span>
                    </p>
                  ))}
                </div>
              )}

              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                <div className="p-3 rounded-lg border border-neutral-200 bg-white">
                  <p className="text-neutral-500">Detectados</p>
                  <p className="font-mono-num text-lg font-bold text-neutral-950 mt-0.5">
                    {stats.total}
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-neutral-200 bg-white">
                  <p className="text-neutral-500">Productos nuevos</p>
                  <p className="font-mono-num text-lg font-bold text-emerald-700 mt-0.5">
                    {stats.newCount}
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-neutral-200 bg-white">
                  <p className="text-neutral-500">SKU existentes</p>
                  <p className="font-mono-num text-lg font-bold text-amber-700 mt-0.5">
                    {stats.dupCount}
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-neutral-200 bg-white">
                  <p className="text-neutral-500">Con fotografía</p>
                  <p className="font-mono-num text-lg font-bold text-neutral-950 mt-0.5">
                    {stats.withPhotos}
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-neutral-200 bg-white col-span-2 sm:col-span-1">
                  <p className="text-neutral-500">Prendas totales</p>
                  <p className="font-mono-num text-lg font-bold text-neutral-950 mt-0.5">
                    {stats.totalUnits} u.
                  </p>
                </div>
              </div>

              {/* Duplicate SKU Strategy + Selection Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium text-neutral-700">Si un SKU ya existe:</span>
                  <div className="flex items-center p-0.5 bg-neutral-100 rounded-lg border border-neutral-200">
                    <button
                      type="button"
                      onClick={() => setDuplicateStrategy('skip')}
                      className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                        duplicateStrategy === 'skip'
                          ? 'bg-white text-neutral-950 font-medium shadow-xs'
                          : 'text-neutral-600'
                      }`}
                    >
                      Omitir duplicado
                    </button>
                    <button
                      type="button"
                      onClick={() => setDuplicateStrategy('update_add')}
                      className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                        duplicateStrategy === 'update_add'
                          ? 'bg-white text-neutral-950 font-medium shadow-xs'
                          : 'text-neutral-600'
                      }`}
                    >
                      Sumar stock y actualizar
                    </button>
                    <button
                      type="button"
                      onClick={() => setDuplicateStrategy('update_replace')}
                      className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                        duplicateStrategy === 'update_replace'
                          ? 'bg-white text-neutral-950 font-medium shadow-xs'
                          : 'text-neutral-600'
                      }`}
                    >
                      Reemplazar stock
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => selectAll(true)}
                    className="text-neutral-600 hover:text-neutral-950 underline cursor-pointer"
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={selectOnlyNew}
                    className="text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
                  >
                    Solo nuevos
                  </button>
                  <button
                    type="button"
                    onClick={() => selectAll(false)}
                    className="text-neutral-500 hover:text-neutral-900 underline cursor-pointer"
                  >
                    Ninguno
                  </button>
                </div>
              </div>

              {/* Preview Table */}
              <div className="border border-neutral-200 rounded-lg overflow-x-auto max-h-[380px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-neutral-50 border-b border-neutral-200 text-neutral-600">
                    <tr>
                      <th className="py-2.5 px-3 w-8"></th>
                      <th className="py-2.5 px-3 font-medium">Producto y foto</th>
                      <th className="py-2.5 px-3 font-medium">Color / Tallas</th>
                      <th className="py-2.5 px-3 font-medium text-right">Total</th>
                      <th className="py-2.5 px-3 font-medium text-right">Costo/u</th>
                      <th className="py-2.5 px-3 font-medium text-right">Venta</th>
                      <th className="py-2.5 px-3 font-medium text-right">Margen</th>
                      <th className="py-2.5 px-3 font-medium">Estado SKU</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {items.map((p) => {
                      const totalStock = p.variants.reduce((s, v) => s + v.stock, 0);
                      const colors = Array.from(new Set(p.variants.map((v) => v.color))).join(', ');
                      const unitCost = p.purchasePrice / Math.max(1, p.packUnits);
                      const unitSale = p.isPack ? p.singleUnitSalePrice : p.salePrice;
                      const marginPct =
                        unitSale > 0 ? ((unitSale - unitCost) / unitSale) * 100 : 0;
                      const willSkip = p.isDuplicate && duplicateStrategy === 'skip';

                      return (
                        <tr
                          key={p.id}
                          className={`${
                            willSkip || !p.selected ? 'opacity-55 bg-neutral-50/60' : 'bg-white'
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <input
                              type="checkbox"
                              checked={p.selected}
                              onChange={() => toggleItem(p.id)}
                              className="w-4 h-4 accent-emerald-600 cursor-pointer"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2.5">
                              <ProductImage
                                src={p.mainPhoto}
                                alt={p.name}
                                className="w-11 h-11 rounded-md shrink-0"
                              />
                              <div className="min-w-0">
                                <p className="font-semibold text-neutral-950 truncate max-w-[200px]">
                                  {p.name}
                                </p>
                                <p className="text-[11px] text-neutral-500 font-mono-num">
                                  {p.sku}
                                  {p.galleryPhotos.length > 0 && (
                                    <span className="ml-1.5 text-emerald-700 font-sans">
                                      · {p.galleryPhotos.length} foto
                                      {p.galleryPhotos.length > 1 ? 's' : ''} (
                                      {p.imageSource === 'base64'
                                        ? 'Base64'
                                        : p.imageSource === 'zip_folder'
                                          ? 'Carpeta ZIP'
                                          : 'URL'}
                                      )
                                    </span>
                                  )}
                                  {p.galleryPhotos.length === 0 && (
                                    <span className="ml-1.5 text-neutral-400 font-sans">· Sin foto</span>
                                  )}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <p className="text-neutral-800 font-medium">{colors}</p>
                            <p className="text-[11px] text-neutral-500 font-mono-num mt-0.5">
                              {p.variants.map((v) => `${v.size}: ${v.stock}`).join(' · ')}
                            </p>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-num font-semibold text-neutral-950">
                            {totalStock} u.
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-num text-neutral-700">
                            {formatExactCLP(unitCost)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-num text-neutral-950 font-medium">
                            {formatCLP(p.salePrice)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-num text-emerald-700 font-medium">
                            {formatPercent(marginPct, 0)}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {p.isDuplicate ? (
                              <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>
                                  {duplicateStrategy === 'skip' ? 'SKU existente (se omite)' : 'SKU existente (actualiza)'}
                                </span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Nuevo</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.json,.csv,.xlsx,.xls"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-neutral-200 bg-neutral-50/70 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-neutral-600 flex items-center gap-2">
            {importing ? (
              <>
                <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                <span>{progressText || 'Guardando inventario e imágenes...'}</span>
              </>
            ) : parseResult ? (
              <>
                <ImageIcon className="w-3.5 h-3.5 text-neutral-400" />
                <span>
                  Se procesarán <strong>{stats.actionable}</strong> producto(s) con guardado permanente en base de datos.
                </span>
              </>
            ) : (
              <span>Puedes previsualizar todos los productos y fotos antes de confirmar.</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={importing}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            {parseResult && (
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={importing || stats.actionable === 0}
                className="px-5 py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-50"
              >
                {importing
                  ? 'Importando...'
                  : `Confirmar importación (${stats.actionable})`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
