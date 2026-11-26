export const CHILE_TIMEZONE = 'America/Santiago';

/**
 * Formats a numeric value in Chilean Pesos (CLP) with zero decimals for display.
 * Internal calculations remain full-precision floating point numbers.
 */
export function formatCLP(value: number | null | undefined): string {
  const safe = Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0;
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safe);
}

/**
 * Formats an exact internal unit cost (showing decimals only when needed, e.g. $6.017,50).
 */
export function formatExactCLP(value: number | null | undefined): string {
  const num = Number.isFinite(Number(value)) ? Number(value) : 0;
  const hasFraction = Math.abs(num - Math.round(num)) > 0.004;
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(num);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  const num = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `${num.toFixed(digits).replace('.', ',')}%`;
}

/**
 * Returns today's date in YYYY-MM-DD in America/Santiago timezone.
 */
export function todayChileISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CHILE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Formats a YYYY-MM-DD date string or ISO timestamp to Chilean DD/MM/AAAA.
 */
export function formatDateCL(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const ymd = dateStr.slice(0, 10);
  const parts = ymd.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: CHILE_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

export function formatDateTimeCL(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return formatDateCL(dateStr);
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: CHILE_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function getMonthKey(dateStr: string): string {
  return (dateStr || '').slice(0, 7); // YYYY-MM
}

export function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-');
  if (!y || !m) return monthKey;
  const names = [
    'Ene',
    'Feb',
    'Mar',
    'Abr',
    'May',
    'Jun',
    'Jul',
    'Ago',
    'Sep',
    'Oct',
    'Nov',
    'Dic',
  ];
  const idx = Number(m) - 1;
  return `${names[idx] ?? m} ${y}`;
}

export const SALE_CHANNELS = [
  'Instagram',
  'WhatsApp',
  'Falabella Marketplace',
  'Mercado Libre',
  'Tienda física',
  'Página web',
  'Otro',
] as const;

export const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Tarjeta', 'Otro'] as const;

export const PRODUCT_CATEGORIES = [
  'Calzas',
  'Packs',
  'Tops',
  'Conjuntos',
  'Poleras',
  'Shorts',
  'Accesorios',
] as const;

export const FIXED_EXPENSE_CATEGORIES = [
  'Internet',
  'Arriendo',
  'Software',
  'Servicios',
  'Otros gastos recurrentes',
] as const;

export const VARIABLE_EXPENSE_CATEGORIES = [
  'Bolsas',
  'Stickers',
  'Tarjetas',
  'Publicidad',
  'Comisiones',
  'Embalaje',
  'Transporte',
  'Despachos',
  'Otros costos por venta',
] as const;
