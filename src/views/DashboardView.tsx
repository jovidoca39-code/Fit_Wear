import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  Plus,
  ShoppingBag,
  Truck,
  Receipt,
  TrendingUp,
  Boxes,
  AlertTriangle,
  Filter,
} from 'lucide-react';
import type { NavSection, WorkspaceData } from '../types.ts';
import { computeAnalytics, type AnalyticsFilter } from '../lib/analytics.ts';
import { formatCLP, formatDateCL, formatPercent, PRODUCT_CATEGORIES } from '../lib/format.ts';

interface DashboardViewProps {
  data: WorkspaceData;
  includeExamples: boolean;
  onToggleExamples: (v: boolean) => void;
  onNavigate: (section: NavSection, action?: string) => void;
}

const CHART_COLORS = ['#059669', '#0a0a0a', '#525252', '#10b981', '#a3a3a3', '#047857'];

export const DashboardView: React.FC<DashboardViewProps> = ({
  data,
  includeExamples,
  onToggleExamples,
  onNavigate,
}) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [productId, setProductId] = useState('all');
  const [category, setCategory] = useState('all');
  const [supplierId, setSupplierId] = useState('all');
  const [salesGranularity, setSalesGranularity] = useState<'dia' | 'mes'>('mes');

  const filter: AnalyticsFilter = useMemo(
    () => ({
      startDate,
      endDate,
      productId,
      category,
      supplierId,
      includeExamples,
    }),
    [startDate, endDate, productId, category, supplierId, includeExamples],
  );

  const { metrics, charts } = useMemo(() => computeAnalytics(data, filter), [data, filter]);

  const lowStockList = useMemo(() => {
    const rows: Array<{ product: string; variant: string; avail: number; min: number }> = [];
    for (const p of data.products) {
      if (!p.isActive || (!includeExamples && p.isExample)) continue;
      for (const v of p.variants) {
        const avail = Math.max(0, v.stock - v.reservedStock);
        if (avail <= v.minStock) {
          rows.push({
            product: p.name,
            variant: `${v.color} / ${v.size}`,
            avail,
            min: v.minStock,
          });
        }
      }
    }
    return rows.slice(0, 6);
  }, [data.products, includeExamples]);

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setProductId('all');
    setCategory('all');
    setSupplierId('all');
  };

  const hasFilters =
    Boolean(startDate || endDate) ||
    productId !== 'all' ||
    category !== 'all' ||
    supplierId !== 'all';

  return (
    <div className="space-y-6">
      {/* Quick Actions Strip (Section 16) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <button
          type="button"
          onClick={() => onNavigate('sales', 'new')}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
        >
          <ShoppingBag className="w-4 h-4 shrink-0" />
          <span>Nueva venta</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('inventory', 'new')}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-neutral-950 hover:bg-neutral-800 text-white text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>Agregar producto</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('purchases', 'new')}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-white hover:bg-neutral-100 text-neutral-900 border border-neutral-200 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
        >
          <Truck className="w-4 h-4 shrink-0 text-neutral-600" />
          <span>Reponer stock</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('expenses', 'new')}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-white hover:bg-neutral-100 text-neutral-900 border border-neutral-200 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
        >
          <Receipt className="w-4 h-4 shrink-0 text-neutral-600" />
          <span>Registrar gasto</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('accounting')}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-white hover:bg-neutral-100 text-neutral-900 border border-neutral-200 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
        >
          <TrendingUp className="w-4 h-4 shrink-0 text-emerald-700" />
          <span>Consultar ganancias</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('inventory')}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-white hover:bg-neutral-100 text-neutral-900 border border-neutral-200 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
        >
          <Boxes className="w-4 h-4 shrink-0 text-neutral-600" />
          <span>Ver inventario</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white border border-neutral-200 rounded-lg p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 mr-1 pb-2">
            <Filter className="w-3.5 h-3.5" />
            <span>Filtros</span>
          </div>
          <label className="flex flex-col gap-1 text-xs text-neutral-600">
            <span>Desde</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1.5 border border-neutral-200 rounded-md text-xs bg-white text-neutral-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-600">
            <span>Hasta</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1.5 border border-neutral-200 rounded-md text-xs bg-white text-neutral-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-600 min-w-[150px]">
            <span>Producto</span>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="px-2.5 py-1.5 border border-neutral-200 rounded-md text-xs bg-white text-neutral-900"
            >
              <option value="all">Todos los productos</option>
              {data.products.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name} {p.isExample ? '(Ejemplo)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-600 min-w-[130px]">
            <span>Categoría</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-2.5 py-1.5 border border-neutral-200 rounded-md text-xs bg-white text-neutral-900"
            >
              <option value="all">Todas</option>
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-600 min-w-[140px]">
            <span>Proveedor</span>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="px-2.5 py-1.5 border border-neutral-200 rounded-md text-xs bg-white text-neutral-900"
            >
              <option value="all">Todos</option>
              {data.suppliers.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center p-0.5 bg-neutral-100 rounded-md border border-neutral-200">
              <button
                type="button"
                onClick={() => onToggleExamples(false)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  !includeExamples ? 'bg-white text-neutral-950 shadow-xs' : 'text-neutral-600'
                }`}
              >
                Solo reales
              </button>
              <button
                type="button"
                onClick={() => onToggleExamples(true)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  includeExamples ? 'bg-white text-neutral-950 shadow-xs' : 'text-neutral-600'
                }`}
              >
                Incluir ejemplos
              </button>
            </div>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="px-2.5 py-1.5 text-xs text-neutral-600 hover:text-neutral-950 underline cursor-pointer"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Primary Hero KPIs — 4 Key Pillars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-neutral-950 text-white rounded-lg p-5 border border-neutral-900">
          <p className="text-xs text-neutral-400">Dinero disponible en caja</p>
          <p className="font-mono-num text-2xl font-semibold mt-1.5 text-white">
            {formatCLP(metrics.cashAvailable)}
          </p>
          <p className="text-xs text-emerald-400 mt-2 font-mono-num">
            Reinvertible: {formatCLP(metrics.availableToReinvest)}
          </p>
        </div>

        <div className="bg-white rounded-lg p-5 border border-neutral-200">
          <p className="text-xs text-neutral-500">Valor del inventario al costo</p>
          <p className="font-mono-num text-2xl font-semibold mt-1.5 text-neutral-950">
            {formatCLP(metrics.inventoryCostValue)}
          </p>
          <p className="text-xs text-neutral-500 mt-2 font-mono-num">
            {metrics.totalUnitsInStock} prendas · Venta est. {formatCLP(metrics.inventoryRetailValue)}
          </p>
        </div>

        <div className="bg-white rounded-lg p-5 border border-neutral-200">
          <p className="text-xs text-neutral-500">Ventas del período (netas)</p>
          <p className="font-mono-num text-2xl font-semibold mt-1.5 text-neutral-950">
            {formatCLP(metrics.netSalesPeriod)}
          </p>
          <p className="text-xs text-neutral-500 mt-2 font-mono-num">
            Hoy {formatCLP(metrics.salesToday)} · Semana {formatCLP(metrics.salesWeek)}
          </p>
        </div>

        <div className="bg-white rounded-lg p-5 border border-neutral-200">
          <p className="text-xs text-neutral-500">Utilidad operativa / Margen</p>
          <p
            className={`font-mono-num text-2xl font-semibold mt-1.5 ${
              metrics.operatingProfitPeriod >= 0 ? 'text-emerald-700' : 'text-red-700'
            }`}
          >
            {formatCLP(metrics.operatingProfitPeriod)}
          </p>
          <p className="text-xs text-neutral-500 mt-2 font-mono-num">
            Margen bruto {formatPercent(metrics.grossMarginPct)} · ROI {formatPercent(metrics.roiPct)}
          </p>
        </div>
      </div>

      {/* Complete Financial & Operational Indicator Matrix (All 20 Requested KPIs) */}
      <div className="bg-white border border-neutral-200 rounded-lg divide-y divide-neutral-200">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-neutral-200">
          <KpiCell label="Capital inicial" value={formatCLP(metrics.initialCapital)} />
          <KpiCell label="Capital aportado posterior" value={formatCLP(metrics.additionalCapital)} />
          <KpiCell label="Ventas del mes actual" value={formatCLP(metrics.salesMonth)} />
          <KpiCell label="Ingresos cobrados (ventas)" value={formatCLP(metrics.collectedRevenuePeriod)} accent="emerald" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-neutral-200">
          <KpiCell label="Compras realizadas" value={formatCLP(metrics.purchasesTotalPeriod)} />
          <KpiCell label="Costo mercadería vendida (COGS)" value={formatCLP(metrics.cogsPeriod)} />
          <KpiCell label="Utilidad bruta" value={formatCLP(metrics.grossProfitPeriod)} accent="emerald" />
          <KpiCell label="Resultado neto estimado" value={formatCLP(metrics.estimatedNetResultPeriod)} accent={metrics.estimatedNetResultPeriod >= 0 ? 'emerald' : 'red'} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-neutral-200">
          <KpiCell label="Gastos fijos pagados" value={formatCLP(metrics.fixedExpensesPaidPeriod)} />
          <KpiCell label="Gastos variables y directos" value={formatCLP(metrics.variableExpensesPaidPeriod + metrics.salesDirectCostsPeriod)} />
          <KpiCell label="Cuentas por cobrar" value={formatCLP(metrics.accountsReceivable)} accent={metrics.accountsReceivable > 0 ? 'amber' : undefined} />
          <KpiCell label="Cuentas por pagar" value={formatCLP(metrics.accountsPayable)} accent={metrics.accountsPayable > 0 ? 'amber' : undefined} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-neutral-200">
          <KpiCell label="Prendas vendidas" value={`${metrics.unitsSoldPeriod} u.`} />
          <KpiCell label="Unidades en stock (disponibles)" value={`${Math.max(0, metrics.totalUnitsInStock - metrics.reservedUnits)} u.`} sub={metrics.reservedUnits > 0 ? `${metrics.reservedUnits} reservadas` : undefined} />
          <KpiCell label="Variantes con stock bajo" value={String(metrics.lowStockVariantsCount)} accent={metrics.lowStockVariantsCount > 0 ? 'amber' : undefined} />
          <KpiCell label="Variantes sin stock" value={String(metrics.outOfStockVariantsCount)} accent={metrics.outOfStockVariantsCount > 0 ? 'red' : undefined} />
        </div>
      </div>

      {/* Low Stock Alert Strip (if any) */}
      {lowStockList.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-lg p-4">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <h3 className="text-sm font-semibold text-neutral-900">
                Alertas de reposición de stock
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('purchases', 'new')}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800 cursor-pointer whitespace-nowrap"
            >
              Crear orden de compra →
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-xs">
            {lowStockList.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between py-1.5 border-b border-neutral-100 last:border-b-0"
              >
                <span className="text-neutral-800 truncate pr-2">
                  {item.product} <span className="text-neutral-400">· {item.variant}</span>
                </span>
                <span
                  className={`font-mono-num font-semibold shrink-0 ${
                    item.avail === 0 ? 'text-red-700' : 'text-amber-700'
                  }`}
                >
                  {item.avail} / mín {item.min}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interactive Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Ventas por día o mes */}
        <div className="bg-white border border-neutral-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-neutral-950">Ventas y utilidad</h3>
              <p className="text-xs text-neutral-500">Evolución de ventas confirmadas en CLP</p>
            </div>
            <div className="flex items-center p-0.5 bg-neutral-100 rounded-md border border-neutral-200">
              <button
                type="button"
                onClick={() => setSalesGranularity('dia')}
                className={`px-2.5 py-1 text-xs rounded cursor-pointer ${
                  salesGranularity === 'dia' ? 'bg-white text-neutral-950 font-medium' : 'text-neutral-600'
                }`}
              >
                Por día
              </button>
              <button
                type="button"
                onClick={() => setSalesGranularity('mes')}
                className={`px-2.5 py-1 text-xs rounded cursor-pointer ${
                  salesGranularity === 'mes' ? 'bg-white text-neutral-950 font-medium' : 'text-neutral-600'
                }`}
              >
                Por mes
              </button>
            </div>
          </div>
          <div className="h-64">
            {salesGranularity === 'dia' && charts.dailySales.length === 0 ? (
              <EmptyChart label="Registra tu primera venta para visualizar la serie diaria." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={
                    salesGranularity === 'dia'
                      ? charts.dailySales.map((d) => ({
                          label: formatDateCL(d.date),
                          ventas: Math.round(d.ventas),
                          utilidad: Math.round(d.utilidad),
                        }))
                      : charts.monthlySeries.map((m) => ({
                          label: m.label,
                          ventas: Math.round(m.ventas),
                          utilidad: Math.round(m.utilidad),
                        }))
                  }
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#525252' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#525252' }} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v: any) => formatCLP(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="ventas" name="Ventas" fill="#0a0a0a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="utilidad" name="Utilidad est." fill="#059669" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Evolución de ingresos y egresos */}
        <div className="bg-white border border-neutral-200 rounded-lg p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-neutral-950">Ingresos vs. Egresos</h3>
            <p className="text-xs text-neutral-500">Flujo mensual real de entradas y salidas de caja</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={charts.monthlySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#525252' }} />
                <YAxis tick={{ fontSize: 11, fill: '#525252' }} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: any) => formatCLP(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="ingresos" name="Ingresos" stroke="#059669" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="egresos" name="Egresos" stroke="#0a0a0a" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Evolución del capital y rentabilidad mensual */}
        <div className="bg-white border border-neutral-200 rounded-lg p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-neutral-950">
              Evolución del capital del negocio
            </h3>
            <p className="text-xs text-neutral-500">
              Capital inicial + aportes + utilidades acumuladas - retiros
            </p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts.capitalEvolution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#525252' }} />
                <YAxis tick={{ fontSize: 11, fill: '#525252' }} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: any) => formatCLP(Number(v))} />
                <Area
                  type="monotone"
                  dataKey="capital"
                  name="Patrimonio / Capital"
                  stroke="#059669"
                  fill="#d1fae5"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Ventas por producto / Distribución de gastos */}
        <div className="bg-white border border-neutral-200 rounded-lg p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-neutral-950">
              Productos más vendidos y distribución de gastos
            </h3>
            <p className="text-xs text-neutral-500">
              Comparativa de ventas por producto y estructura de egresos operativos
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-64">
            <div className="h-full">
              <p className="text-[11px] font-medium text-neutral-500 mb-1">Top productos (CLP)</p>
              {charts.salesByProduct.length === 0 ? (
                <EmptyChart label="Sin ventas registradas aún." />
              ) : (
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={charts.salesByProduct.slice(0, 5)} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={92} tick={{ fontSize: 10, fill: '#404040' }} />
                    <Tooltip formatter={(v: any) => formatCLP(Number(v))} />
                    <Bar dataKey="revenue" name="Ventas" fill="#059669" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="h-full">
              <p className="text-[11px] font-medium text-neutral-500 mb-1">Distribución de gastos</p>
              {charts.expenseDistribution.length === 0 ? (
                <EmptyChart label="Sin gastos pagados en el período." />
              ) : (
                <ResponsiveContainer width="100%" height="90%">
                  <PieChart>
                    <Pie
                      data={charts.expenseDistribution}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={66}
                      paddingAngle={2}
                    >
                      {charts.expenseDistribution.map((_, idx) => (
                        <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => formatCLP(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const KpiCell: React.FC<{
  label: string;
  value: string;
  sub?: string;
  accent?: 'emerald' | 'amber' | 'red';
}> = ({ label, value, sub, accent }) => {
  const color =
    accent === 'emerald'
      ? 'text-emerald-700'
      : accent === 'amber'
        ? 'text-amber-700'
        : accent === 'red'
          ? 'text-red-700'
          : 'text-neutral-950';

  return (
    <div className="px-4 py-3.5">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`font-mono-num text-base font-semibold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-neutral-400 mt-0.5">{sub}</p>}
    </div>
  );
};

const EmptyChart: React.FC<{ label: string }> = ({ label }) => (
  <div className="h-full flex items-center justify-center text-center px-4 text-xs text-neutral-400 bg-neutral-50 rounded-md border border-dashed border-neutral-200">
    {label}
  </div>
);
