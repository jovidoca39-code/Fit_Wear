import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type { Product } from '../types.ts';

export interface ParsedImportVariant {
  color: string;
  size: string;
  stock: number;
  minStock: number;
  unitCost: number;
}

export interface ParsedImportProduct {
  id: string;
  sku: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  description: string;
  supplierName: string;
  purchaseDate: string;
  purchasePrice: number;
  salePrice: number;
  singleUnitSalePrice: number;
  isPack: boolean;
  packUnits: number;
  packComposition: string;
  location: string;
  mainPhoto: string;
  galleryPhotos: string[];
  isActive: boolean;
  variants: ParsedImportVariant[];
  // Preview metadata
  isDuplicate: boolean;
  existingProductId: number | null;
  existingProductName: string | null;
  imageSource: 'base64' | 'zip_folder' | 'url' | 'none';
  selected: boolean;
  warnings: string[];
}

export interface BulkImportParseResult {
  fileName: string;
  fileType: 'zip' | 'json' | 'csv' | 'excel';
  detectedSources: string[];
  products: ParsedImportProduct[];
  totalImagesMatched: number;
  warnings: string[];
}

const MAX_ZIP_BYTES = 60 * 1024 * 1024; // 60 MB
const MAX_REGULAR_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_ZIP_ENTRIES = 600;
const MAX_SINGLE_IMAGE_BYTES = 12 * 1024 * 1024; // 12 MB before compression

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

function normalizeKey(key: string): string {
  return String(key || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizePath(p: string): string {
  return String(p || '')
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .trim()
    .toLowerCase();
}

function getBaseName(p: string): string {
  const clean = normalizePath(p);
  const parts = clean.split('/');
  return parts[parts.length - 1] || '';
}

function getStem(p: string): string {
  const base = getBaseName(p);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

function slugifyToken(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseClpNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;
  if (typeof value === 'object' && 'result' in (value as any)) {
    return parseClpNumber((value as any).result);
  }
  let s = String(value).trim();
  if (!s) return 0;
  s = s.replace(/\$/g, '').replace(/clp/gi, '').replace(/\s+/g, '');

  // Handle Chilean thousands separator e.g. "12.035" or "12.035,50" or "1.234.567"
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasDot && hasComma) {
    // e.g. 12.035,50 -> 12035.50 (if comma is after last dot)
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // US format 12,035.50
      s = s.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    // e.g. 6017,50 -> 6017.50 OR 12,500 -> 12500
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3) {
      s = parts.join('');
    } else {
      s = s.replace(',', '.');
    }
  } else if (hasDot && !hasComma) {
    // If every dot-separated tail group has 3 digits (e.g. 12.035 or 1.250.000), treat dots as thousands
    const parts = s.split('.');
    if (parts.length > 1 && parts.slice(1).every((p) => /^\d{3}$/.test(p))) {
      s = parts.join('');
    }
  }

  const num = Number(s);
  return Number.isFinite(num) ? num : 0;
}

function parseBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  const s = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return s === 'si' || s === 'true' || s === '1' || s === 'yes' || s === 'pack';
}

function detectBase64ImageDataUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Reject SVG or script payloads explicitly
  if (/^data:image\/svg/i.test(trimmed) || /^javascript:/i.test(trimmed)) {
    return null;
  }

  if (/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(trimmed)) {
    return trimmed;
  }

  // Detect raw base64 image without data URI prefix using magic bytes
  const compact = trimmed.replace(/\s+/g, '');
  if (compact.length > 100 && /^[A-Za-z0-9+/=]+$/.test(compact)) {
    if (compact.startsWith('/9j/')) return `data:image/jpeg;base64,${compact}`;
    if (compact.startsWith('iVBORw0KGgo')) return `data:image/png;base64,${compact}`;
    if (compact.startsWith('UklGR')) return `data:image/webp;base64,${compact}`;
    if (compact.startsWith('R0lGOD')) return `data:image/gif;base64,${compact}`;
  }
  return null;
}

function isSafeHttpOrLocalImage(raw: string): boolean {
  const trimmed = raw.trim();
  return (
    trimmed.startsWith('/src/assets/images/') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://')
  );
}

export async function compressImageSourceToDataUrl(source: Blob | string): Promise<string> {
  let srcUrl = '';
  let revokeObjectUrl = false;

  if (typeof source === 'string') {
    if (isSafeHttpOrLocalImage(source)) return source.trim();
    const validDataUrl = detectBase64ImageDataUrl(source);
    if (!validDataUrl) return '';
    srcUrl = validDataUrl;
  } else {
    if (source.size > MAX_SINGLE_IMAGE_BYTES) {
      throw new Error('Una imagen supera el tamaño máximo de 12 MB.');
    }
    srcUrl = URL.createObjectURL(source);
    revokeObjectUrl = true;
  }

  try {
    return await new Promise<string>((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const maxSide = 900;
          let { width, height } = img;
          if (!width || !height) {
            resolve(typeof source === 'string' ? srcUrl : '');
            return;
          }
          if (width > maxSide || height > maxSide) {
            const ratio = Math.min(maxSide / width, maxSide / height);
            width = Math.max(1, Math.round(width * ratio));
            height = Math.max(1, Math.round(height * ratio));
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(typeof source === 'string' ? srcUrl : '');
            return;
          }
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        } catch {
          resolve(typeof source === 'string' ? srcUrl : '');
        }
      };
      img.onerror = () => resolve('');
      img.src = srcUrl;
    });
  } finally {
    if (revokeObjectUrl) {
      URL.revokeObjectURL(srcUrl);
    }
  }
}

/**
 * RFC-4180 compliant CSV parser handling quoted values, commas/semicolons, newlines and UTF-8 BOM.
 */
function parseCsvProper(rawText: string): Record<string, string>[] {
  const text = rawText.replace(/^\uFEFF/, '');
  if (!text.trim()) return [];

  // Detect delimiter from first line outside quotes
  const firstLineEnd = text.search(/\r?\n/);
  const headerSample = firstLineEnd >= 0 ? text.slice(0, firstLineEnd) : text;
  const commaCount = (headerSample.match(/,/g) || []).length;
  const semiCount = (headerSample.match(/;/g) || []).length;
  const tabCount = (headerSample.match(/\t/g) || []).length;
  const delimiter =
    semiCount > commaCount && semiCount >= tabCount
      ? ';'
      : tabCount > commaCount && tabCount > semiCount
        ? '\t'
        : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(field.trim());
        field = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim().length > 0));
  if (nonEmpty.length < 2) return [];

  const headers = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((vals) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = vals[idx] ?? '';
    });
    return obj;
  });
}

async function parseExcelBuffer(buf: ArrayBuffer): Promise<Record<string, any>[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const headers: string[] = [];
  const rawRows: Record<string, any>[] = [];

  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) {
      row.eachCell((cell, col) => {
        headers[col] = String(cell.text || cell.value || '').trim();
      });
    } else {
      const obj: Record<string, any> = {};
      let hasAny = false;
      row.eachCell((cell, col) => {
        const key = headers[col];
        if (!key) return;
        let val: any = cell.value;
        if (val && typeof val === 'object') {
          if ('result' in val) val = val.result;
          else if ('richText' in val && Array.isArray(val.richText)) {
            val = val.richText.map((r: any) => r.text || '').join('');
          } else if ('text' in val) {
            val = val.text;
          }
        }
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          hasAny = true;
        }
        obj[key] = val ?? '';
      });
      if (hasAny) rawRows.push(obj);
    }
  });
  return rawRows;
}

function getField(record: Record<string, any>, exactAliases: string[], partialAliases: string[] = []): any {
  const entries = Object.entries(record).map(([k, v]) => [normalizeKey(k), v] as const);
  for (const alias of exactAliases) {
    const found = entries.find(([nk]) => nk === alias);
    if (found && found[1] !== undefined && found[1] !== null && String(found[1]).trim() !== '') {
      return found[1];
    }
  }
  for (const alias of partialAliases) {
    const found = entries.find(([nk]) => nk.includes(alias));
    if (found && found[1] !== undefined && found[1] !== null && String(found[1]).trim() !== '') {
      return found[1];
    }
  }
  return undefined;
}

interface IntermediateItem {
  sku: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  description: string;
  supplierName: string;
  purchaseDate: string;
  purchasePrice: number;
  salePrice: number;
  singleUnitSalePrice: number;
  isPack: boolean;
  packUnits: number;
  packComposition: string;
  location: string;
  isActive: boolean;
  variants: Array<{ color: string; size: string; stock: number; minStock: number; unitCost: number }>;
  imageRefs: string[]; // filenames, paths, URLs, or base64 strings
  base64Images: string[];
}

function extractImageRefsFromRecord(rec: Record<string, any>): {
  base64Images: string[];
  imageRefs: string[];
} {
  const base64Images: string[] = [];
  const imageRefs: string[] = [];

  const pushCandidate = (val: unknown) => {
    if (!val) return;
    if (Array.isArray(val)) {
      for (const entry of val) pushCandidate(entry);
      return;
    }
    if (typeof val === 'object') {
      const obj = val as Record<string, any>;
      pushCandidate(obj.base64 || obj.data || obj.dataUrl || obj.url || obj.src || obj.file || obj.path || obj.filename);
      return;
    }
    const str = String(val).trim();
    if (!str) return;

    const b64 = detectBase64ImageDataUrl(str);
    if (b64) {
      if (!base64Images.includes(b64)) base64Images.push(b64);
      return;
    }

    // Multiple comma or semicolon separated image filenames/URLs
    if (!str.startsWith('data:') && (str.includes(';') || (str.includes(',') && !str.startsWith('http')))) {
      const parts = str
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const p of parts) {
        if (!imageRefs.includes(p)) imageRefs.push(p);
      }
      return;
    }

    if (!imageRefs.includes(str)) imageRefs.push(str);
  };

  for (const [k, v] of Object.entries(rec)) {
    const nk = normalizeKey(k);
    if (
      nk.includes('imagen') ||
      nk.includes('image') ||
      nk.includes('foto') ||
      nk.includes('photo') ||
      nk.includes('base64') ||
      nk.includes('galeria') ||
      nk.includes('gallery') ||
      nk === 'img' ||
      nk === 'thumbnail' ||
      nk === 'archivo_foto' ||
      nk === 'archivo_imagen'
    ) {
      pushCandidate(v);
    }
  }

  return { base64Images, imageRefs };
}

function extractVariantsFromRecord(
  rec: Record<string, any>,
  defaultColor: string,
  defaultUnitCost: number,
  defaultMinStock: number,
): Array<{ color: string; size: string; stock: number; minStock: number; unitCost: number }> {
  const variants: Array<{ color: string; size: string; stock: number; minStock: number; unitCost: number }> = [];

  // 1. Nested variants / variantes array
  const nestedVariants = getField(rec, ['variantes', 'variants', 'combinaciones']);
  if (Array.isArray(nestedVariants) && nestedVariants.length > 0) {
    for (const v of nestedVariants) {
      if (!v || typeof v !== 'object') continue;
      const color = String(getField(v, ['color', 'tono'], ['color']) || defaultColor).trim() || defaultColor;
      const size = String(getField(v, ['talla', 'size', 'medida'], ['talla', 'size']) || 'M')
        .trim()
        .toUpperCase();
      const stock = Math.max(0, Math.round(parseClpNumber(getField(v, ['stock', 'cantidad', 'qty', 'unidades'], ['stock', 'cant']))));
      const minStock = Math.max(
        0,
        Math.round(parseClpNumber(getField(v, ['stock_minimo', 'min_stock', 'minimo'], ['min']) ?? defaultMinStock)),
      );
      const uCost = parseClpNumber(getField(v, ['costo_unitario', 'unit_cost', 'costo', 'cost'], ['costo', 'cost']));
      variants.push({
        color,
        size,
        stock,
        minStock,
        unitCost: uCost > 0 ? uCost : defaultUnitCost,
      });
    }
    if (variants.length > 0) return variants;
  }

  // 2. Nested tallas / sizes object (e.g. { S: 2, M: 3, L: 1 }) or array
  const nestedSizes = getField(rec, ['tallas', 'sizes', 'stock_por_talla', 'stock_tallas', 'stockbysize']);
  if (nestedSizes && typeof nestedSizes === 'object' && !Array.isArray(nestedSizes)) {
    for (const [szKey, szVal] of Object.entries(nestedSizes)) {
      const sz = szKey.trim().toUpperCase();
      if (!sz) continue;
      const stock =
        typeof szVal === 'object' && szVal !== null
          ? Math.max(0, Math.round(parseClpNumber((szVal as any).stock ?? (szVal as any).cantidad ?? (szVal as any).qty)))
          : Math.max(0, Math.round(parseClpNumber(szVal)));
      variants.push({
        color: defaultColor,
        size: sz,
        stock,
        minStock: defaultMinStock,
        unitCost: defaultUnitCost,
      });
    }
    if (variants.length > 0) return variants;
  } else if (Array.isArray(nestedSizes) && nestedSizes.length > 0) {
    for (const entry of nestedSizes) {
      if (typeof entry === 'string') {
        variants.push({
          color: defaultColor,
          size: entry.trim().toUpperCase(),
          stock: Math.max(0, Math.round(parseClpNumber(getField(rec, ['stock', 'cantidad', 'qty'])))),
          minStock: defaultMinStock,
          unitCost: defaultUnitCost,
        });
      } else if (entry && typeof entry === 'object') {
        const sz = String(getField(entry, ['talla', 'size', 'nombre', 'name']) || 'M')
          .trim()
          .toUpperCase();
        const stock = Math.max(0, Math.round(parseClpNumber(getField(entry, ['stock', 'cantidad', 'qty', 'unidades']))));
        const col = String(getField(entry, ['color']) || defaultColor).trim() || defaultColor;
        variants.push({
          color: col,
          size: sz,
          stock,
          minStock: defaultMinStock,
          unitCost: defaultUnitCost,
        });
      }
    }
    if (variants.length > 0) return variants;
  }

  // 3. Dedicated size columns in flat CSV/Excel/JSON rows (e.g. stock_s, talla_s, S, M, L, XL)
  const sizeColumnDefs: Array<{ size: string; keys: string[] }> = [
    { size: 'XS', keys: ['stock_xs', 'talla_xs', 'cantidad_xs', 'xs'] },
    { size: 'S', keys: ['stock_s', 'talla_s', 'cantidad_s', 's'] },
    { size: 'M', keys: ['stock_m', 'talla_m', 'cantidad_m', 'm'] },
    { size: 'L', keys: ['stock_l', 'talla_l', 'cantidad_l', 'l'] },
    { size: 'XL', keys: ['stock_xl', 'talla_xl', 'cantidad_xl', 'xl'] },
    { size: 'XXL', keys: ['stock_xxl', 'talla_xxl', 'cantidad_xxl', 'xxl'] },
  ];

  const normalizedKeys = new Set(Object.keys(rec).map(normalizeKey));
  const hasDedicatedSizeCols = sizeColumnDefs.some((def) =>
    def.keys.some((k) => normalizedKeys.has(k)),
  );

  if (hasDedicatedSizeCols) {
    for (const def of sizeColumnDefs) {
      const hasCol = def.keys.some((k) => normalizedKeys.has(k));
      if (!hasCol) continue;
      const val = getField(rec, def.keys);
      const stock = Math.max(0, Math.round(parseClpNumber(val)));
      variants.push({
        color: defaultColor,
        size: def.size,
        stock,
        minStock: defaultMinStock,
        unitCost: defaultUnitCost,
      });
    }
    if (variants.length > 0) return variants;
  }

  // 4. Single size/stock per row (standard flat format)
  const rawSize = String(getField(rec, ['talla', 'size', 'medida'], ['talla', 'size']) || '').trim();
  const rawStock = Math.max(
    0,
    Math.round(
      parseClpNumber(
        getField(rec, ['stock', 'cantidad', 'qty', 'unidades', 'stock_disponible', 'stock_fisico'], ['stock', 'cantidad', 'qty']),
      ),
    ),
  );

  if (rawSize && /[,/|]/.test(rawSize)) {
    const sizes = rawSize
      .split(/[,/|]/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const perSizeStock = sizes.length > 0 ? Math.floor(rawStock / sizes.length) : rawStock;
    sizes.forEach((sz, idx) => {
      const remainder = idx === 0 ? rawStock - perSizeStock * sizes.length : 0;
      variants.push({
        color: defaultColor,
        size: sz,
        stock: perSizeStock + remainder,
        minStock: defaultMinStock,
        unitCost: defaultUnitCost,
      });
    });
    return variants;
  }

  variants.push({
    color: defaultColor,
    size: (rawSize || 'M').toUpperCase(),
    stock: rawStock,
    minStock: defaultMinStock,
    unitCost: defaultUnitCost,
  });
  return variants;
}

function recordToIntermediate(rec: Record<string, any>): IntermediateItem | null {
  const sku = String(
    getField(rec, ['sku', 'codigo', 'codigo_sku', 'cod', 'referencia', 'ref'], ['sku', 'codigo']) || '',
  ).trim();
  const name = String(
    getField(rec, ['nombre', 'producto', 'nombre_producto', 'name', 'title', 'titulo', 'articulo'], ['nombre', 'producto', 'name']) || '',
  ).trim();

  if (!name && !sku) return null;

  const category =
    String(getField(rec, ['categoria', 'category', 'tipo'], ['categoria', 'category']) || 'Calzas').trim() ||
    'Calzas';
  const brand = String(getField(rec, ['marca', 'brand'], ['marca', 'brand']) || '').trim();
  const model = String(getField(rec, ['modelo', 'model'], ['modelo', 'model']) || '').trim();
  const description = String(
    getField(rec, ['descripcion', 'description', 'detalle', 'notas', 'observaciones'], ['descrip', 'detalle']) || '',
  ).trim();
  const supplierName = String(
    getField(rec, ['proveedor', 'supplier', 'vendor'], ['proveedor', 'supplier']) || '',
  ).trim();
  const purchaseDate = String(
    getField(rec, ['fecha_compra', 'purchase_date', 'fecha'], ['fecha_compra']) || '',
  ).trim();
  const location =
    String(getField(rec, ['ubicacion', 'location', 'bodega'], ['ubicacion', 'location']) || 'Bodega Antofagasta').trim() ||
    'Bodega Antofagasta';
  const defaultColor =
    String(getField(rec, ['color', 'tono', 'colour'], ['color']) || 'Negro').trim() || 'Negro';

  const packUnitsRaw = parseClpNumber(
    getField(rec, ['unidades_pack', 'pack_units', 'prendas_pack'], ['unidades_pack', 'pack_units']),
  );
  const isPackFlag = parseBool(getField(rec, ['es_pack', 'is_pack', 'pack']));
  const isPack = isPackFlag || packUnitsRaw > 1;
  const packUnits = isPack ? Math.max(2, Math.round(packUnitsRaw || 2)) : 1;
  const packComposition = String(
    getField(rec, ['composicion_pack', 'pack_composition', 'composicion'], ['composicion']) || '',
  ).trim();

  const rawUnitCost = parseClpNumber(
    getField(
      rec,
      ['costo_unitario', 'unit_cost', 'costo_unidad', 'costo_por_unidad'],
      ['costo_unit', 'unit_cost'],
    ),
  );
  const rawPurchasePrice = parseClpNumber(
    getField(
      rec,
      ['precio_compra', 'purchase_price', 'costo', 'cost', 'compra', 'costo_pack'],
      ['compra', 'costo', 'cost'],
    ),
  );
  const purchasePrice =
    rawPurchasePrice > 0 ? rawPurchasePrice : rawUnitCost > 0 ? rawUnitCost * packUnits : 0;
  const effectiveUnitCost =
    rawUnitCost > 0 ? rawUnitCost : purchasePrice > 0 ? purchasePrice / packUnits : 0;

  const salePrice = parseClpNumber(
    getField(
      rec,
      ['precio_venta', 'sale_price', 'precio', 'venta', 'price', 'pvp', 'valor_venta'],
      ['precio_venta', 'sale_price', 'venta', 'precio', 'price'],
    ),
  );
  const singleUnitSalePrice = parseClpNumber(
    getField(rec, ['precio_unitario', 'single_unit_sale_price', 'precio_suelta'], ['single_unit']),
  );
  const minStock = Math.max(
    0,
    Math.round(
      parseClpNumber(getField(rec, ['stock_minimo', 'min_stock', 'minimo'], ['min_stock', 'minimo']) ?? 2),
    ),
  );

  const activeField = getField(rec, ['activo', 'is_active', 'estado']);
  const isActive =
    activeField === undefined
      ? true
      : String(activeField).toLowerCase() !== 'inactivo' &&
        String(activeField).toLowerCase() !== 'false' &&
        String(activeField) !== '0';

  const variants = extractVariantsFromRecord(rec, defaultColor, effectiveUnitCost, minStock);
  const { base64Images, imageRefs } = extractImageRefsFromRecord(rec);

  return {
    sku,
    name: name || sku,
    category,
    brand,
    model,
    description,
    supplierName,
    purchaseDate,
    purchasePrice,
    salePrice,
    singleUnitSalePrice: isPack
      ? singleUnitSalePrice || Math.round(salePrice / packUnits)
      : salePrice,
    isPack,
    packUnits,
    packComposition,
    location,
    isActive,
    variants,
    imageRefs,
    base64Images,
  };
}

function extractJsonCatalogAndImageMap(jsonVal: unknown): {
  records: Record<string, any>[];
  imageMap: Map<string, string[]>; // normalized sku/filename/stem -> base64 image(s)
} {
  const records: Record<string, any>[] = [];
  const imageMap = new Map<string, string[]>();

  const registerMapImage = (rawKey: string, val: unknown) => {
    const addB64 = (b64: string) => {
      const variantsOfKey = Array.from(
        new Set([
          normalizePath(rawKey),
          getBaseName(rawKey),
          getStem(rawKey),
          rawKey.trim().toLowerCase(),
        ].filter(Boolean)),
      );
      for (const k of variantsOfKey) {
        const list = imageMap.get(k) || [];
        if (!list.includes(b64)) list.push(b64);
        imageMap.set(k, list);
      }
    };

    if (typeof val === 'string') {
      const b64 = detectBase64ImageDataUrl(val);
      if (b64) addB64(b64);
    } else if (Array.isArray(val)) {
      for (const entry of val) {
        if (typeof entry === 'string') {
          const b64 = detectBase64ImageDataUrl(entry);
          if (b64) addB64(b64);
        } else if (entry && typeof entry === 'object') {
          const s = (entry as any).base64 || (entry as any).data || (entry as any).image || (entry as any).imagen;
          if (typeof s === 'string') {
            const b64 = detectBase64ImageDataUrl(s);
            if (b64) addB64(b64);
          }
        }
      }
    } else if (val && typeof val === 'object') {
      const obj = val as Record<string, any>;
      const s =
        obj.base64 ||
        obj.imagen_base64 ||
        obj.image_base64 ||
        obj.foto_base64 ||
        obj.data ||
        obj.dataUrl ||
        obj.mainPhoto ||
        obj.imagen ||
        obj.image;
      if (typeof s === 'string') {
        const b64 = detectBase64ImageDataUrl(s);
        if (b64) addB64(b64);
      }
    }
  };

  if (Array.isArray(jsonVal)) {
    for (const item of jsonVal) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const rec = item as Record<string, any>;
        // Check if this entry is purely an image mapping entry like { sku: '...', imagen_base64: '...' } or { filename: '...', base64: '...' }
        const hasNameOrPrice =
          Boolean(getField(rec, ['nombre', 'producto', 'name', 'title'])) ||
          parseClpNumber(getField(rec, ['precio_venta', 'precio', 'costo', 'precio_compra', 'stock', 'cantidad'])) > 0 ||
          Boolean(getField(rec, ['variantes', 'variants', 'tallas', 'sizes']));
        const imgInfo = extractImageRefsFromRecord(rec);
        const skuOrFile = String(
          getField(rec, ['sku', 'codigo', 'filename', 'archivo', 'nombre_archivo', 'file', 'id']) || '',
        ).trim();

        if (skuOrFile && imgInfo.base64Images.length > 0) {
          registerMapImage(skuOrFile, imgInfo.base64Images);
        }
        if (hasNameOrPrice) {
          records.push(rec);
        }
      }
    }
    return { records, imageMap };
  }

  if (jsonVal && typeof jsonVal === 'object') {
    const obj = jsonVal as Record<string, any>;

    // Check known array container properties
    const arrayKey = ['products', 'productos', 'items', 'inventario', 'catalogo', 'data', 'rows'].find(
      (k) => Array.isArray(obj[k]),
    );
    if (arrayKey) {
      const nested = extractJsonCatalogAndImageMap(obj[arrayKey]);
      records.push(...nested.records);
      for (const [k, v] of nested.imageMap.entries()) {
        imageMap.set(k, v);
      }
    }

    // Check known image-map properties inside wrapper object
    for (const imgDictKey of ['images', 'imagenes', 'fotos', 'photos', 'imagesBase64', 'imagenes_base64']) {
      const dict = obj[imgDictKey];
      if (dict && typeof dict === 'object' && !Array.isArray(dict)) {
        for (const [k, v] of Object.entries(dict)) {
          registerMapImage(k, v);
        }
      } else if (Array.isArray(dict)) {
        const nested = extractJsonCatalogAndImageMap(dict);
        for (const [k, v] of nested.imageMap.entries()) {
          imageMap.set(k, v);
        }
      }
    }

    // Check if the root object itself is a dictionary of { [skuOrFilename]: base64String }
    if (!arrayKey) {
      let base64EntriesCount = 0;
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string' && detectBase64ImageDataUrl(v)) {
          registerMapImage(k, v);
          base64EntriesCount++;
        } else if (v && typeof v === 'object' && !Array.isArray(v)) {
          const maybeB64 = extractImageRefsFromRecord(v as Record<string, any>).base64Images;
          if (maybeB64.length > 0) {
            registerMapImage(k, maybeB64);
            base64EntriesCount++;
          }
        }
      }
      // Or single product object
      if (base64EntriesCount === 0 && getField(obj, ['nombre', 'producto', 'name', 'sku'])) {
        records.push(obj);
      }
    }
  }

  return { records, imageMap };
}

function mergeIntermediateItems(
  primaryItems: IntermediateItem[],
  secondaryItems: IntermediateItem[],
  sameSourceMerge: boolean,
): IntermediateItem[] {
  const map = new Map<string, IntermediateItem>();

  const keyFor = (item: IntermediateItem) => {
    if (item.sku.trim()) return `sku::${item.sku.trim().toLowerCase()}`;
    const firstColor = item.variants[0]?.color || 'estandar';
    return `name::${item.name.trim().toLowerCase()}::${firstColor.trim().toLowerCase()}`;
  };

  const upsert = (item: IntermediateItem, sumDuplicateVariants: boolean) => {
    const key = keyFor(item);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        ...item,
        variants: item.variants.map((v) => ({ ...v })),
        imageRefs: [...item.imageRefs],
        base64Images: [...item.base64Images],
      });
      return;
    }

    // Merge metadata preferring non-empty values
    if (!existing.sku && item.sku) existing.sku = item.sku;
    if ((!existing.name || existing.name === existing.sku) && item.name) existing.name = item.name;
    if (existing.category === 'Calzas' && item.category && item.category !== 'Calzas') {
      existing.category = item.category;
    }
    if (!existing.brand && item.brand) existing.brand = item.brand;
    if (!existing.model && item.model) existing.model = item.model;
    if (!existing.description && item.description) existing.description = item.description;
    if (!existing.supplierName && item.supplierName) existing.supplierName = item.supplierName;
    if (!existing.purchaseDate && item.purchaseDate) existing.purchaseDate = item.purchaseDate;
    if (existing.purchasePrice <= 0 && item.purchasePrice > 0) existing.purchasePrice = item.purchasePrice;
    if (existing.salePrice <= 0 && item.salePrice > 0) existing.salePrice = item.salePrice;
    if (existing.singleUnitSalePrice <= 0 && item.singleUnitSalePrice > 0) {
      existing.singleUnitSalePrice = item.singleUnitSalePrice;
    }
    if (!existing.isPack && item.isPack) {
      existing.isPack = true;
      existing.packUnits = item.packUnits;
    }
    if (!existing.packComposition && item.packComposition) {
      existing.packComposition = item.packComposition;
    }

    for (const b64 of item.base64Images) {
      if (!existing.base64Images.includes(b64)) existing.base64Images.push(b64);
    }
    for (const ref of item.imageRefs) {
      if (!existing.imageRefs.includes(ref)) existing.imageRefs.push(ref);
    }

    // Merge variants carefully without double-counting across CSV + JSON representations of the same ZIP
    for (const v of item.variants) {
      const match = existing.variants.find(
        (ev) =>
          ev.color.trim().toLowerCase() === v.color.trim().toLowerCase() &&
          ev.size.trim().toLowerCase() === v.size.trim().toLowerCase(),
      );
      if (match) {
        if (sumDuplicateVariants) {
          match.stock += v.stock;
        } else if (match.stock === 0 && v.stock > 0) {
          match.stock = v.stock;
        }
        if (match.unitCost <= 0 && v.unitCost > 0) match.unitCost = v.unitCost;
      } else {
        existing.variants.push({ ...v });
      }
    }
  };

  for (const item of primaryItems) upsert(item, sameSourceMerge);
  // Secondary source (e.g. JSON accompanying CSV inside a ZIP) enriches without doubling existing variant stock
  for (const item of secondaryItems) upsert(item, false);

  return Array.from(map.values());
}

export async function parseBulkInventoryFile(
  file: File,
  existingProducts: Product[],
  defaultTargetProfit = 10000,
): Promise<BulkImportParseResult> {
  const lowerName = file.name.toLowerCase();
  const isZip = lowerName.endsWith('.zip');
  const isJson = lowerName.endsWith('.json');
  const isCsv = lowerName.endsWith('.csv');
  const isExcel = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls');

  if (!isZip && !isJson && !isCsv && !isExcel) {
    throw new Error('Formato no compatible. Sube un archivo ZIP, JSON, CSV o Excel (.xlsx).');
  }

  if (isZip && file.size > MAX_ZIP_BYTES) {
    throw new Error('El archivo ZIP supera el tamaño máximo permitido (60 MB).');
  }
  if (!isZip && file.size > MAX_REGULAR_BYTES) {
    throw new Error('El archivo supera el tamaño máximo permitido (25 MB).');
  }

  const detectedSources: string[] = [];
  const globalWarnings: string[] = [];

  let csvItems: IntermediateItem[] = [];
  let jsonItems: IntermediateItem[] = [];
  let excelItems: IntermediateItem[] = [];
  const jsonImageMap = new Map<string, string[]>();

  // ZIP folder images indexed by path, basename, stem
  interface ZipPhotoEntry {
    path: string;
    baseName: string;
    stem: string;
    slugStem: string;
    file: JSZip.JSZipObject;
  }
  const zipPhotos: ZipPhotoEntry[] = [];
  const zipPhotoByPath = new Map<string, ZipPhotoEntry>();
  const zipPhotoByBase = new Map<string, ZipPhotoEntry>();
  const zipPhotoByStem = new Map<string, ZipPhotoEntry[]>();

  if (isCsv) {
    const text = await file.text();
    const rows = parseCsvProper(text);
    csvItems = rows.map(recordToIntermediate).filter((x): x is IntermediateItem => x !== null);
    detectedSources.push(`CSV (${rows.length} filas)`);
  } else if (isExcel) {
    const buf = await file.arrayBuffer();
    const rows = await parseExcelBuffer(buf);
    excelItems = rows.map(recordToIntermediate).filter((x): x is IntermediateItem => x !== null);
    detectedSources.push(`Excel (${rows.length} filas)`);
  } else if (isJson) {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('El archivo JSON tiene errores de sintaxis.');
    }
    const { records, imageMap } = extractJsonCatalogAndImageMap(parsed);
    jsonItems = records.map(recordToIntermediate).filter((x): x is IntermediateItem => x !== null);
    for (const [k, v] of imageMap.entries()) jsonImageMap.set(k, v);
    detectedSources.push(`JSON (${records.length} registros)`);
  } else if (isZip) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entries = Object.values(zip.files).filter((entry) => {
      if (entry.dir) return false;
      const p = normalizePath(entry.name);
      if (!p || p.includes('..') || p.startsWith('__macosx/') || getBaseName(p).startsWith('._')) {
        return false;
      }
      return true;
    });

    if (entries.length > MAX_ZIP_ENTRIES) {
      globalWarnings.push(
        `El ZIP contiene ${entries.length} archivos; se procesaron los primeros ${MAX_ZIP_ENTRIES}.`,
      );
    }

    const boundedEntries = entries.slice(0, MAX_ZIP_ENTRIES);
    let csvFileCount = 0;
    let jsonFileCount = 0;
    let excelFileCount = 0;

    for (const entry of boundedEntries) {
      const p = normalizePath(entry.name);
      const ext = p.includes('.') ? p.slice(p.lastIndexOf('.') + 1) : '';

      if (ext === 'csv') {
        const text = await entry.async('string');
        const rows = parseCsvProper(text);
        const parsedRows = rows
          .map(recordToIntermediate)
          .filter((x): x is IntermediateItem => x !== null);
        csvItems.push(...parsedRows);
        csvFileCount++;
      } else if (ext === 'json') {
        try {
          const text = await entry.async('string');
          const parsed = JSON.parse(text);
          const { records, imageMap } = extractJsonCatalogAndImageMap(parsed);
          const parsedRecs = records
            .map(recordToIntermediate)
            .filter((x): x is IntermediateItem => x !== null);
          jsonItems.push(...parsedRecs);
          for (const [k, v] of imageMap.entries()) {
            const cur = jsonImageMap.get(k) || [];
            for (const b64 of v) {
              if (!cur.includes(b64)) cur.push(b64);
            }
            jsonImageMap.set(k, cur);
          }
          jsonFileCount++;
        } catch {
          globalWarnings.push(`No se pudo leer el JSON "${entry.name}" dentro del ZIP.`);
        }
      } else if (ext === 'xlsx' || ext === 'xls') {
        try {
          const buf = await entry.async('arraybuffer');
          const rows = await parseExcelBuffer(buf);
          const parsedRows = rows
            .map(recordToIntermediate)
            .filter((x): x is IntermediateItem => x !== null);
          excelItems.push(...parsedRows);
          excelFileCount++;
        } catch {
          globalWarnings.push(`No se pudo leer el Excel "${entry.name}" dentro del ZIP.`);
        }
      } else if (IMAGE_EXTENSIONS.has(ext)) {
        const baseName = getBaseName(p);
        const stem = getStem(p);
        const photoEntry: ZipPhotoEntry = {
          path: p,
          baseName,
          stem,
          slugStem: slugifyToken(stem),
          file: entry,
        };
        zipPhotos.push(photoEntry);
        zipPhotoByPath.set(p, photoEntry);
        zipPhotoByBase.set(baseName, photoEntry);
        const stemList = zipPhotoByStem.get(stem) || [];
        stemList.push(photoEntry);
        zipPhotoByStem.set(stem, stemList);
      }
    }

    if (csvFileCount > 0) detectedSources.push(`${csvFileCount} CSV`);
    if (jsonFileCount > 0) detectedSources.push(`${jsonFileCount} JSON`);
    if (excelFileCount > 0) detectedSources.push(`${excelFileCount} Excel`);
    if (zipPhotos.length > 0) detectedSources.push(`${zipPhotos.length} fotos en carpeta`);
  }

  // Merge all tabular + JSON product sources cleanly without double-counting
  let mergedItems: IntermediateItem[] = [];
  if (csvItems.length > 0 && jsonItems.length > 0) {
    // Primary: CSV rows (sum intra-CSV duplicate variant rows), enriched by JSON (images + metadata)
    const groupedCsv = mergeIntermediateItems(csvItems, [], true);
    const groupedJson = mergeIntermediateItems(jsonItems, [], true);
    mergedItems = mergeIntermediateItems(groupedCsv, groupedJson, false);
  } else if (excelItems.length > 0) {
    const groupedExcel = mergeIntermediateItems(excelItems, [], true);
    const groupedJson = mergeIntermediateItems(jsonItems, [], true);
    mergedItems = mergeIntermediateItems(groupedExcel, groupedJson, false);
  } else if (csvItems.length > 0) {
    mergedItems = mergeIntermediateItems(csvItems, [], true);
  } else if (jsonItems.length > 0) {
    mergedItems = mergeIntermediateItems(jsonItems, [], true);
  }

  if (mergedItems.length === 0) {
    throw new Error(
      'No se encontraron productos válidos en el archivo. Verifica que existan columnas o campos de Nombre y SKU.',
    );
  }

  // Cache compressed ZIP photos so repeated references compress once
  const compressedZipCache = new Map<string, string>();
  const readZipPhoto = async (entry: ZipPhotoEntry): Promise<string> => {
    const cached = compressedZipCache.get(entry.path);
    if (cached !== undefined) return cached;
    try {
      const blob = await entry.file.async('blob');
      const dataUrl = await compressImageSourceToDataUrl(blob);
      compressedZipCache.set(entry.path, dataUrl);
      return dataUrl;
    } catch {
      compressedZipCache.set(entry.path, '');
      return '';
    }
  };

  const existingBySku = new Map(existingProducts.map((p) => [p.sku.trim().toLowerCase(), p]));

  const finalProducts: ParsedImportProduct[] = [];
  let totalImagesMatched = 0;

  for (let idx = 0; idx < mergedItems.length; idx++) {
    const item = mergedItems[idx];
    const warnings: string[] = [];

    // Generate deterministic SKU if empty
    const sku =
      item.sku.trim() ||
      `DUNA-${slugifyToken(item.category).slice(0, 3).toUpperCase() || 'FIT'}-${slugifyToken(item.name).slice(0, 4).toUpperCase() || 'PRD'}-${String(idx + 1).padStart(3, '0')}`;
    const skuLower = sku.toLowerCase();
    const skuSlug = slugifyToken(sku);
    const nameSlug = slugifyToken(item.name);

    const resolvedGallery: string[] = [];
    let imageSource: ParsedImportProduct['imageSource'] = 'none';

    const addUniquePhoto = (url: string, src: ParsedImportProduct['imageSource']) => {
      if (!url) return;
      if (!resolvedGallery.includes(url)) {
        resolvedGallery.push(url);
        if (imageSource === 'none') imageSource = src;
      }
    };

    // 1. Direct Base64 images embedded in JSON product record
    for (const rawB64 of item.base64Images) {
      const compressed = await compressImageSourceToDataUrl(rawB64);
      addUniquePhoto(compressed, 'base64');
    }

    // 2. JSON image dictionary lookup by SKU or imageRef
    const mapBySku = jsonImageMap.get(skuLower) || jsonImageMap.get(skuSlug);
    if (mapBySku) {
      for (const rawB64 of mapBySku) {
        const compressed = await compressImageSourceToDataUrl(rawB64);
        addUniquePhoto(compressed, 'base64');
      }
    }

    // 3. Explicit imageRefs (filenames, relative paths, URLs) from CSV/JSON
    for (const ref of item.imageRefs) {
      const normRef = normalizePath(ref);
      const refBase = getBaseName(ref);
      const refStem = getStem(ref);

      // Check JSON imageMap first
      const mapped =
        jsonImageMap.get(normRef) || jsonImageMap.get(refBase) || jsonImageMap.get(refStem);
      if (mapped) {
        for (const rawB64 of mapped) {
          const compressed = await compressImageSourceToDataUrl(rawB64);
          addUniquePhoto(compressed, 'base64');
        }
      }

      // Check ZIP folder photos
      const zipMatch =
        zipPhotoByPath.get(normRef) ||
        zipPhotoByBase.get(refBase) ||
        zipPhotoByStem.get(refStem)?.[0];
      if (zipMatch) {
        const compressed = await readZipPhoto(zipMatch);
        addUniquePhoto(compressed, 'zip_folder');
      } else if (isSafeHttpOrLocalImage(ref)) {
        addUniquePhoto(ref.trim(), 'url');
      }
    }

    // 4. Auto-match ZIP folder photos by SKU (exact or prefix like SKU_1, SKU-2) or product name slug
    if (zipPhotos.length > 0) {
      const skuMatches = zipPhotos.filter(
        (zp) =>
          zp.stem === skuLower ||
          zp.slugStem === skuSlug ||
          zp.stem.startsWith(`${skuLower}_`) ||
          zp.stem.startsWith(`${skuLower}-`) ||
          zp.slugStem.startsWith(`${skuSlug}-`),
      );
      skuMatches.sort((a, b) => a.baseName.localeCompare(b.baseName));
      for (const zm of skuMatches.slice(0, 6)) {
        const compressed = await readZipPhoto(zm);
        addUniquePhoto(compressed, 'zip_folder');
      }

      if (resolvedGallery.length === 0 && nameSlug.length >= 4) {
        const nameMatches = zipPhotos.filter(
          (zp) => zp.slugStem === nameSlug || zp.slugStem.startsWith(`${nameSlug}-`),
        );
        for (const nm of nameMatches.slice(0, 4)) {
          const compressed = await readZipPhoto(nm);
          addUniquePhoto(compressed, 'zip_folder');
        }
      }
    }

    if (resolvedGallery.length > 0) totalImagesMatched++;

    // Ensure sale price fallback warning
    const resolvedSalePrice =
      item.salePrice > 0
        ? item.salePrice
        : Math.round(item.purchasePrice + defaultTargetProfit * item.packUnits);
    if (item.salePrice <= 0) {
      warnings.push('Sin precio de venta en archivo; se sugiere con tu meta de ganancia.');
    }

    const existingProd = existingBySku.get(skuLower) || null;

    finalProducts.push({
      id: `${idx}-${sku}`,
      sku,
      name: item.name,
      category: item.category,
      brand: item.brand,
      model: item.model,
      description: item.description,
      supplierName: item.supplierName,
      purchaseDate: item.purchaseDate,
      purchasePrice: item.purchasePrice,
      salePrice: resolvedSalePrice,
      singleUnitSalePrice: item.isPack
        ? item.singleUnitSalePrice || Math.round(resolvedSalePrice / Math.max(1, item.packUnits))
        : resolvedSalePrice,
      isPack: item.isPack,
      packUnits: item.packUnits,
      packComposition: item.packComposition,
      location: item.location,
      mainPhoto: resolvedGallery[0] || '',
      galleryPhotos: resolvedGallery.slice(0, 10),
      isActive: item.isActive,
      variants: item.variants,
      isDuplicate: Boolean(existingProd),
      existingProductId: existingProd?.id ?? null,
      existingProductName: existingProd?.name ?? null,
      imageSource,
      selected: true,
      warnings,
    });
  }

  return {
    fileName: file.name,
    fileType: isZip ? 'zip' : isJson ? 'json' : isCsv ? 'csv' : 'excel',
    detectedSources,
    products: finalProducts,
    totalImagesMatched,
    warnings: globalWarnings,
  };
}
