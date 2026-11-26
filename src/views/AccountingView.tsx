import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { FileDown, Info } from 'lucide-react';
import type { WorkspaceData } from '../types.ts';
import { computeAnalytics, simulateReinvestmentGrowth } from '../lib/analytics.ts';
import { formatCLP, formatPercent, todayChileISO } from '../lib/format.ts';
import { exportFinancialSummaryPDF, exportIncomeStatementExcel } from '../lib/exports.ts';

interface AccountingViewProps {
  data: WorkspaceData;
  includeExamples: boolean;
}

export const AccountingView: React.FC<AccountingViewProps> = ({ data, includeExamples }) => {
  const today = todayChileISO();
  const [periodMode, setPeriodMode] = useState<'all' | 'month' | 'year' | 'custom'>('all');
  const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(today.slice(0, 4));
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Simulator controls (Section 13)
  const [simCapital, setSimCapital] = useState(String(data.settings?.initialCapital ?? 116724));
  const [simReinvestPct, setSimReinvestPct] = useState(
    String(data.settings?.reinvestmentPercent ?? 70),
  );
  const [simSalesDays, setSimSalesDays] = useState('20');
  const [simRestockDays, setSimRestockDays] = useState('14');

  const { startDate, endDate, periodLabel } = useMemo(() => {
    if (periodMode === 'month') {
      return {
        startDate: `${selectedMonth}-01`,
        endDate: `${selectedMonth}-31`,
        periodLabel: `Mes ${selectedMonth}`,
      };
    }
    if (periodMode === 'year') {
      return {
        startDate: `${selectedYear}-01-01`,
        endDate: `${selectedYear}-12-31`,
        periodLabel: `Año ${selectedYear}`,
      };
    }
    if (periodMode === 'custom') {
      return {
        startDate: customStart,
        endDate: customEnd,
        periodLabel: `${customStart || 'Inicio'} a ${customEnd || 'Hoy'}`,
      };
    }
    return { startDate: '', endDate: '', periodLabel: 'Histórico completo' };
  }, [periodMode, selectedMonth, selectedYear, customStart, customEnd]);

  const { metrics } = useMemo(
    () =>
      computeAnalytics(data, {
        startDate,
        endDate,
        productId: 'all',
        category: 'all',
        supplierId: 'all',
        includeExamples,
      }),
    [data, startDate, endDate, includeExamples],
  );

  const simulationData = useMemo(
    () =>
      simulateReinvestmentGrowth(
        Math.max(1000, Number(simCapital) || 116724),
        Math.min(100, Math.max(0, Number(simReinvestPct) || 70)),
        Math.max(1, Number(simSalesDays) || 20),
        Math.max(0, Number(simRestockDays) || 14),
      ),
    [simCapital, simReinvestPct, simSalesDays, simRestockDays],
  );

  const ivaRate = data.settings?.ivaRate ?? 19;
  const estimatedIvaDebito = metrics.netSalesPeriod - metrics.netSalesPeriod / (1 + ivaRate / 100);
  const finalMonthSim = simulationData[simulationData.length - 1];

  return (
    <div className="space-y-6">
      {/* Period Selector & Export */}
      <div className="bg-white border border-neutral-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-1 bg-neutral-100 rounded-lg border border-neutral-200">
            {(
              [
                ['all', 'Todo'],
                ['month', 'Mes'],
                ['year', 'Año'],
                ['custom', 'Personalizado'],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setPeriodMode(k)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  periodMode === k ? 'bg-white text-neutral-950 shadow-xs' : 'text-neutral-600'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          {periodMode === 'month' && (
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-neutral-200 rounded-md"
            />
          )}
          {periodMode === 'year' && (
            <input
              type="number"
              min={2020}
              max={2035}
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-24 px-2.5 py-1.5 text-xs border border-neutral-200 rounded-md font-mono-num"
            />
          )}
          {periodMode === 'custom' && (
            <div className="flex items-center gap-2 text-xs">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2.5 py-1.5 border border-neutral-200 rounded-md"
              />
              <span>a</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2.5 py-1.5 border border-neutral-200 rounded-md"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportIncomeStatementExcel(metrics, periodLabel)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Excel EERR</span>
          </button>
          <button
            type="button"
            onClick={() => exportFinancialSummaryPDF(data, metrics, periodLabel)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-neutral-950 hover:bg-neutral-800 text-white cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Resumen PDF</span>
          </button>
        </div>
      </div>

      {/* Three Core Accounting Statements (Section 10) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 1. Estado de Resultados */}
        <div className="bg-white border border-neutral-200 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-neutral-950">Estado de Resultados</h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Utilidad real basada únicamente en prendas vendidas y su costo exacto.
            </p>
            <div className="mt-4 divide-y divide-neutral-100 text-xs">
              <StatementRow label="Ventas netas" value={formatCLP(metrics.netSalesPeriod)} bold />
              <StatementRow
                label="(-) Costo mercadería vendida (COGS)"
                value={`-${formatCLP(metrics.cogsPeriod)}`}
              />
              <StatementRow
                label="= Utilidad bruta"
                value={`${formatCLP(metrics.grossProfitPeriod)} (${formatPercent(metrics.grossMarginPct)})`}
                bold
                accent="emerald"
              />
              <StatementRow
                label="(-) Gastos fijos pagados"
                value={`-${formatCLP(metrics.fixedExpensesPaidPeriod)}`}
              />
              <StatementRow
                label="(-) Gastos variables pagados"
                value={`-${formatCLP(metrics.variableExpensesPaidPeriod)}`}
              />
              <StatementRow
                label="(-) Comisiones y despachos de venta"
                value={`-${formatCLP(metrics.salesDirectCostsPeriod)}`}
              />
              <StatementRow
                label="= Utilidad operativa"
                value={`${formatCLP(metrics.operatingProfitPeriod)} (${formatPercent(metrics.operatingMarginPct)})`}
                bold
              />
              <StatementRow
                label="(+) Otros ingresos (excl. aportes capital)"
                value={formatCLP(metrics.otherIncomePeriod)}
              />
              <StatementRow
                label="= Resultado neto estimado"
                value={formatCLP(metrics.estimatedNetResultPeriod)}
                bold
                accent={metrics.estimatedNetResultPeriod >= 0 ? 'emerald' : 'red'}
              />
            </div>
          </div>
          <p className="text-[11px] text-neutral-400 mt-4 pt-3 border-t border-neutral-100">
            Los aportes de capital y las compras de stock en bodega no distorsionan la utilidad.
          </p>
        </div>

        {/* 2. Flujo de Caja */}
        <div className="bg-white border border-neutral-200 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-neutral-950">Flujo de Caja</h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Dinero efectivamente ingresado y pagado durante el período.
            </p>
            <div className="mt-4 divide-y divide-neutral-100 text-xs">
              <StatementRow label="Saldo inicial del período" value={formatCLP(metrics.cashOpeningBalance)} />
              <StatementRow
                label="(+) Cobros e ingresos recibidos"
                value={`+${formatCLP(metrics.cashInflowsPeriod)}`}
                accent="emerald"
              />
              <StatementRow
                label="(-) Pagos y egresos realizados"
                value={`-${formatCLP(metrics.cashOutflowsPeriod)}`}
                accent="red"
              />
              <StatementRow
                label="= Saldo final del período"
                value={formatCLP(metrics.cashClosingBalance)}
                bold
              />
              <StatementRow
                label="Saldo actual consolidado en caja"
                value={formatCLP(metrics.cashAvailable)}
                bold
                accent="emerald"
              />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-neutral-100 space-y-1 text-xs">
            <p className="font-medium text-neutral-700">Referencia tributaria Chile ({ivaRate}% IVA)</p>
            <p className="text-[11px] text-neutral-500">
              Documento habitual: {data.settings?.taxDocumentType || 'Boleta Electrónica'}. IVA débito referencial en ventas: <strong className="font-mono-num text-neutral-800">{formatCLP(estimatedIvaDebito)}</strong>.
            </p>
            <p className="text-[10px] text-neutral-400">
              Control interno de gestión; no sustituye contabilidad tributaria formal ante el SII.
            </p>
          </div>
        </div>

        {/* 3. Situación del Negocio & Control de Capital */}
        <div className="bg-white border border-neutral-200 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-neutral-950">
              Situación Patrimonial y Capital
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Fotografía real de activos, obligaciones y capital disponible para reinvertir.
            </p>
            <div className="mt-4 divide-y divide-neutral-100 text-xs">
              <StatementRow label="Dinero disponible en caja" value={formatCLP(metrics.cashAvailable)} bold />
              <StatementRow
                label="Inventario valorizado al costo"
                value={formatCLP(metrics.inventoryCostValue)}
              />
              <StatementRow label="Cuentas por cobrar" value={formatCLP(metrics.accountsReceivable)} />
              <StatementRow
                label="Cuentas por pagar"
                value={`-${formatCLP(metrics.accountsPayable)}`}
                accent={metrics.accountsPayable > 0 ? 'amber' : undefined}
              />
              <StatementRow
                label="Capital inicial + nuevos aportes"
                value={formatCLP(metrics.initialCapital + metrics.additionalCapital)}
              />
              <StatementRow
                label="Capital recuperado por ventas (COGS)"
                value={formatCLP(metrics.recoveredCapitalFromSales)}
              />
              <StatementRow
                label="Ganancias acumuladas históricas"
                value={formatCLP(metrics.accumulatedProfitsAllTime)}
                accent={metrics.accumulatedProfitsAllTime >= 0 ? 'emerald' : 'red'}
              />
              <StatementRow
                label="Retiros del propietario"
                value={formatCLP(metrics.ownerWithdrawals)}
              />
              <StatementRow
                label={`Disponible para reinvertir (${data.settings?.reinvestmentPercent ?? 70}%)`}
                value={formatCLP(metrics.availableToReinvest)}
                bold
                accent="emerald"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section 13: 12-Month Capital & Reinvestment Simulator (Separated from Real Results) */}
      <div className="bg-white border border-neutral-200 rounded-lg p-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-200 pb-4">
          <div>
            <p className="text-xs font-medium text-emerald-700">
              Proyección simulada · Separada de los resultados reales
            </p>
            <h3 className="text-base font-semibold text-neutral-950 mt-0.5">
              Simulador de Reinversión y Crecimiento de Capital a 12 Meses
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Compara escenarios de rentabilidad neta del 20%, 35% y 50% por ciclo considerando rotación de ventas y tiempos de reposición.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setSimCapital(String(Math.round(Math.max(metrics.availableToReinvest, metrics.initialCapital))))
            }
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-neutral-200 hover:bg-neutral-50 cursor-pointer"
          >
            Usar capital disponible actual
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="text-xs text-neutral-700">
            Capital base simulación (CLP)
            <input
              type="number"
              min={1000}
              value={simCapital}
              onChange={(e) => setSimCapital(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
            />
          </label>
          <label className="text-xs text-neutral-700">
            Porcentaje de reinversión (%)
            <input
              type="number"
              min={0}
              max={100}
              value={simReinvestPct}
              onChange={(e) => setSimReinvestPct(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
            />
          </label>
          <label className="text-xs text-neutral-700">
            Duración ciclo de ventas (días)
            <input
              type="number"
              min={1}
              value={simSalesDays}
              onChange={(e) => setSimSalesDays(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
            />
          </label>
          <label className="text-xs text-neutral-700">
            Tiempo de reposición (días)
            <input
              type="number"
              min={0}
              value={simRestockDays}
              onChange={(e) => setSimRestockDays(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
            />
          </label>
        </div>

        {/* Scenario Outcomes at Month 12 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-neutral-50 border border-neutral-200">
            <p className="text-xs text-neutral-500">Escenario conservador · 20% neto / ciclo</p>
            <p className="font-mono-num text-xl font-bold text-neutral-900 mt-1">
              {formatCLP(finalMonthSim?.conservative20 || 0)}
            </p>
            <p className="text-[11px] text-neutral-500 mt-0.5">Capital proyectado al mes 12</p>
          </div>
          <div className="p-4 rounded-lg bg-neutral-50 border border-emerald-200">
            <p className="text-xs text-emerald-800 font-medium">Escenario objetivo · 35% neto / ciclo</p>
            <p className="font-mono-num text-xl font-bold text-emerald-700 mt-1">
              {formatCLP(finalMonthSim?.moderate35 || 0)}
            </p>
            <p className="text-[11px] text-neutral-500 mt-0.5">Capital proyectado al mes 12</p>
          </div>
          <div className="p-4 rounded-lg bg-neutral-950 text-white border border-neutral-900">
            <p className="text-xs text-neutral-400">Escenario acelerado · 50% neto / ciclo</p>
            <p className="font-mono-num text-xl font-bold text-emerald-400 mt-1">
              {formatCLP(finalMonthSim?.ambitious50 || 0)}
            </p>
            <p className="text-[11px] text-neutral-400 mt-0.5">Capital proyectado al mes 12</p>
          </div>
        </div>

        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={simulationData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#525252' }} />
              <YAxis tick={{ fontSize: 11, fill: '#525252' }} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v: any) => formatCLP(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="conservative20" name="20% por ciclo" stroke="#737373" strokeWidth={2} />
              <Line type="monotone" dataKey="moderate35" name="35% por ciclo" stroke="#059669" strokeWidth={2.5} />
              <Line type="monotone" dataKey="ambitious50" name="50% por ciclo" stroke="#0a0a0a" strokeWidth={2.5} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="flex items-start gap-2 text-xs text-neutral-500">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-neutral-400" />
          <span>
            Ciclo total estimado: <strong>{(Number(simSalesDays) || 20) + (Number(simRestockDays) || 14)} días</strong> ({(30 / Math.max(7, (Number(simSalesDays) || 20) + (Number(simRestockDays) || 14))).toFixed(2)} ciclos/mes). Esta simulación es referencial y no modifica tus saldos contables reales.
          </span>
        </div>
      </div>
    </div>
  );
};

const StatementRow: React.FC<{
  label: string;
  value: string;
  bold?: boolean;
  accent?: 'emerald' | 'amber' | 'red';
}> = ({ label, value, bold, accent }) => {
  const valColor =
    accent === 'emerald'
      ? 'text-emerald-700'
      : accent === 'amber'
        ? 'text-amber-700'
        : accent === 'red'
          ? 'text-red-700'
          : 'text-neutral-950';
  return (
    <div className="flex items-center justify-between py-2 gap-2">
      <span className={bold ? 'font-semibold text-neutral-950' : 'text-neutral-600'}>{label}</span>
      <span className={`font-mono-num shrink-0 ${bold ? 'font-semibold' : ''} ${valColor}`}>
        {value}
      </span>
    </div>
  );
};
