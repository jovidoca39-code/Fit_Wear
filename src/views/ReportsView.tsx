import React, { useMemo } from 'react';
import { FileSpreadsheet, FileText, Download } from 'lucide-react';
import type { WorkspaceData } from '../types.ts';
import { computeAnalytics } from '../lib/analytics.ts';
import { formatCLP, formatPercent } from '../lib/format.ts';
import {
  exportCashflowExcel,
  exportChannelSalesExcel,
  exportExpensesExcel,
  exportFinancialSummaryPDF,
  exportFullInventoryExcel,
  exportIncomeStatementExcel,
  exportMovementsExcel,
  exportProductProfitabilityExcel,
  exportPurchasesExcel,
  exportSalesExcel,
  exportStockBySizeColorExcel,
  exportSuppliersExcel,
} from '../lib/exports.ts';

interface ReportsViewProps {
  data: WorkspaceData;
  includeExamples: boolean;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ data, includeExamples }) => {
  const { metrics, charts } = useMemo(
    () =>
      computeAnalytics(data, {
        startDate: '',
        endDate: '',
        productId: 'all',
        category: 'all',
        supplierId: 'all',
        includeExamples,
      }),
    [data, includeExamples],
  );

  const reportItems = [
    {
      title: 'Inventario completo',
      desc: 'Todos los productos, variantes, costos unitarios exactos, precios y valorización.',
      format: 'Excel (.xlsx)',
      type: 'excel' as const,
      action: () => exportFullInventoryExcel(data, includeExamples),
    },
    {
      title: 'Stock por talla y color',
      desc: 'Matriz operativa de disponibilidad física, reservas, packs completos y alertas.',
      format: 'Excel (.xlsx)',
      type: 'excel' as const,
      action: () => exportStockBySizeColorExcel(data, includeExamples),
    },
    {
      title: 'Movimientos de inventario',
      desc: 'Kardex histórico completo de entradas, ventas, devoluciones y ajustes.',
      format: 'Excel (.xlsx)',
      type: 'excel' as const,
      action: () => exportMovementsExcel(data, includeExamples),
    },
    {
      title: 'Reporte de ventas',
      desc: 'Listado detallado con canal, medio de pago, COGS, comisiones y ganancia.',
      format: 'Excel (.xlsx)',
      type: 'excel' as const,
      action: () => exportSalesExcel(data, includeExamples),
    },
    {
      title: 'Reporte de compras',
      desc: 'Órdenes de reposición, envíos, impuestos, estado de recepción y pago.',
      format: 'Excel (.xlsx)',
      type: 'excel' as const,
      action: () => exportPurchasesExcel(data, includeExamples),
    },
    {
      title: 'Rentabilidad por producto',
      desc: 'Ventas netas, costo de mercadería, utilidad bruta y margen por prenda.',
      format: 'Excel (.xlsx)',
      type: 'excel' as const,
      action: () => exportProductProfitabilityExcel(charts.salesByProduct),
    },
    {
      title: 'Ventas por canal',
      desc: 'Desempeño comparativo de Instagram, WhatsApp, Marketplace y web.',
      format: 'Excel (.xlsx)',
      type: 'excel' as const,
      action: () => exportChannelSalesExcel(charts.salesByChannel),
    },
    {
      title: 'Gastos mensuales',
      desc: 'Detalle de gastos fijos y variables, vencimientos y confirmaciones de pago.',
      format: 'Excel (.xlsx)',
      type: 'excel' as const,
      action: () => exportExpensesExcel(data, includeExamples),
    },
    {
      title: 'Flujo de caja',
      desc: 'Libro diario de cobros, aportes de capital, egresos y transferencias.',
      format: 'Excel (.xlsx)',
      type: 'excel' as const,
      action: () => exportCashflowExcel(data, includeExamples),
    },
    {
      title: 'Estado de resultados',
      desc: 'Hoja contable de ventas netas, COGS, gastos operativos y resultado neto.',
      format: 'Excel (.xlsx)',
      type: 'excel' as const,
      action: () => exportIncomeStatementExcel(metrics, 'Histórico completo'),
    },
    {
      title: 'Reporte de proveedores',
      desc: 'Directorio completo con mínimos de compra, tiempos de entrega y despachos.',
      format: 'Excel (.xlsx)',
      type: 'excel' as const,
      action: () => exportSuppliersExcel(data),
    },
    {
      title: 'Resumen financiero mensual',
      desc: 'Informe ejecutivo listo para compartir o archivar con EERR, caja y patrimonio.',
      format: 'Documento PDF',
      type: 'pdf' as const,
      action: () => exportFinancialSummaryPDF(data, metrics, 'Resumen Actual'),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {reportItems.map((r) => (
          <div
            key={r.title}
            className="bg-white border border-neutral-200 rounded-lg p-4 flex flex-col justify-between gap-4"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-xs text-neutral-500 font-medium">{r.format}</span>
                {r.type === 'pdf' ? (
                  <FileText className="w-4 h-4 text-emerald-700" />
                ) : (
                  <FileSpreadsheet className="w-4 h-4 text-neutral-700" />
                )}
              </div>
              <h3 className="text-sm font-semibold text-neutral-950">{r.title}</h3>
              <p className="text-xs text-neutral-500 mt-1 leading-relaxed">{r.desc}</p>
            </div>
            <button
              type="button"
              onClick={r.action}
              className={`w-full flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg cursor-pointer transition-colors ${
                r.type === 'pdf'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-neutral-950 hover:bg-neutral-800 text-white'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar {r.type === 'pdf' ? 'PDF' : 'Excel'}</span>
            </button>
          </div>
        ))}
      </div>

      {/* Live Preview: Profitability by Product & Sales by Channel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200">
            <h3 className="text-sm font-semibold text-neutral-950">Rentabilidad por producto</h3>
          </div>
          {charts.salesByProduct.length === 0 ? (
            <p className="p-6 text-xs text-neutral-500 text-center">
              Aún no hay ventas confirmadas para calcular rentabilidad por producto.
            </p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Producto</th>
                  <th className="py-2.5 px-3 font-medium text-right">Unid.</th>
                  <th className="py-2.5 px-3 font-medium text-right">Ventas</th>
                  <th className="py-2.5 px-4 font-medium text-right">Utilidad / Margen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {charts.salesByProduct.map((p) => (
                  <tr key={p.name}>
                    <td className="py-2.5 px-4 font-medium text-neutral-900">{p.name}</td>
                    <td className="py-2.5 px-3 text-right font-mono-num">{p.units}</td>
                    <td className="py-2.5 px-3 text-right font-mono-num">{formatCLP(p.revenue)}</td>
                    <td className="py-2.5 px-4 text-right font-mono-num text-emerald-700 font-semibold">
                      {formatCLP(p.profit)} (
                      {formatPercent(p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0, 0)})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200">
            <h3 className="text-sm font-semibold text-neutral-950">Ventas por canal</h3>
          </div>
          {charts.salesByChannel.length === 0 ? (
            <p className="p-6 text-xs text-neutral-500 text-center">
              Registra ventas para ver el desglose por Instagram, WhatsApp, Marketplace y más.
            </p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Canal</th>
                  <th className="py-2.5 px-3 font-medium text-right">Operaciones</th>
                  <th className="py-2.5 px-3 font-medium text-right">Ticket prom.</th>
                  <th className="py-2.5 px-4 font-medium text-right">Total CLP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {charts.salesByChannel.map((c) => (
                  <tr key={c.channel}>
                    <td className="py-2.5 px-4 font-medium text-neutral-900">{c.channel}</td>
                    <td className="py-2.5 px-3 text-right font-mono-num">{c.count}</td>
                    <td className="py-2.5 px-3 text-right font-mono-num">
                      {formatCLP(c.count > 0 ? c.revenue / c.count : 0)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono-num font-semibold text-neutral-950">
                      {formatCLP(c.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
