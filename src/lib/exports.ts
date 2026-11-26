import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Sale, WorkspaceData } from '../types.ts';
import type { DashboardMetrics } from './analytics.ts';
import { formatCLP, formatDateCL, formatExactCLP, formatPercent } from './format.ts';

async function downloadExcelRows(
  rows: Record<string, any>[],
  sheetName: string,
  filename: string,
) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  const dataRows = rows.length > 0 ? rows : [{ Mensaje: 'Sin registros para el período' }];
  const keys = Object.keys(dataRows[0]);

  ws.columns = keys.map((k) => ({
    header: k,
    key: k,
    width: Math.min(36, Math.max(14, k.length + 4)),
  }));

  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0A0A0A' },
  };

  for (const row of dataRows) {
    ws.addRow(row);
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportSheetToExcel(rows: Record<string, any>[], sheetName: string, filename: string) {
  void downloadExcelRows(rows, sheetName, filename);
}

export function exportFullInventoryExcel(data: WorkspaceData, includeExamples: boolean) {
  const supplierMap = new Map(data.suppliers.map((s) => [s.id, s.name]));
  const rows: Record<string, any>[] = [];
  for (const p of data.products) {
    if (!includeExamples && p.isExample) continue;
    for (const v of p.variants) {
      const unitSale = p.isPack
        ? p.singleUnitSalePrice || Math.round(p.salePrice / Math.max(1, p.packUnits))
        : p.salePrice;
      const profitUnit = unitSale - v.unitCost;
      const marginPct = unitSale > 0 ? (profitUnit / unitSale) * 100 : 0;
      rows.push({
        SKU: p.sku,
        'SKU Variante': v.skuVariant,
        Producto: p.name,
        Categoría: p.category,
        Marca: p.brand,
        Modelo: p.model,
        Proveedor: p.supplierId ? supplierMap.get(p.supplierId) || '' : '',
        Tipo: p.isPack ? `Pack (${p.packUnits} u.)` : 'Individual',
        Color: v.color,
        Talla: v.size,
        'Stock Físico (Prendas)': v.stock,
        'Stock Reservado': v.reservedStock,
        'Disponible Venta': Math.max(0, v.stock - v.reservedStock),
        'Stock Mínimo': v.minStock,
        'Costo Unitario Exacto (CLP)': Number(v.unitCost.toFixed(2)),
        'Precio Venta Unitario (CLP)': Math.round(unitSale),
        'Precio Pack (CLP)': p.isPack ? Math.round(p.salePrice) : '',
        'Ganancia Est. x Unidad (CLP)': Math.round(profitUnit),
        'Margen (%)': Number(marginPct.toFixed(1)),
        'Valorización Costo (CLP)': Math.round(v.stock * v.unitCost),
        Ubicación: p.location,
        Estado: p.isActive ? 'Activo' : 'Inactivo',
        Origen: p.isExample ? 'Ejemplo' : 'Real',
      });
    }
  }
  exportSheetToExcel(
    rows,
    'Inventario',
    `DUNA_ACTIVE_Inventario_${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

export function exportStockBySizeColorExcel(data: WorkspaceData, includeExamples: boolean) {
  const rows: Record<string, any>[] = [];
  for (const p of data.products) {
    if (!includeExamples && p.isExample) continue;
    for (const v of p.variants) {
      const avail = Math.max(0, v.stock - v.reservedStock);
      rows.push({
        Producto: p.name,
        Color: v.color,
        Talla: v.size,
        'Prendas en Stock': v.stock,
        'Packs Completos': p.isPack ? Math.floor(avail / Math.max(1, p.packUnits)) : '-',
        Reservadas: v.reservedStock,
        Disponibles: avail,
        'Alerta Stock': avail <= 0 ? 'Sin stock' : avail <= v.minStock ? 'Stock bajo' : 'Normal',
      });
    }
  }
  exportSheetToExcel(rows, 'Stock_Talla_Color', 'DUNA_ACTIVE_Stock_Talla_Color.xlsx');
}

export function exportMovementsExcel(data: WorkspaceData, includeExamples: boolean) {
  const prodMap = new Map(data.products.map((p) => [p.id, p.name]));
  const varMap = new Map(
    data.products.flatMap((p) => p.variants.map((v) => [v.id, `${v.color} / ${v.size}`])),
  );
  const rows = data.movements
    .filter((m) => includeExamples || !m.isExample)
    .map((m) => ({
      Fecha: formatDateCL(m.createdAt),
      Producto: prodMap.get(m.productId) || `#${m.productId}`,
      Variante: varMap.get(m.variantId) || `#${m.variantId}`,
      Tipo: m.movementType,
      Cambio: m.quantityChange,
      'Stock Anterior': m.previousStock,
      'Stock Nuevo': m.newStock,
      'Costo Unit. (CLP)': Number(m.unitCost.toFixed(2)),
      Motivo: m.reason,
      Responsable: m.performedBy,
    }));
  exportSheetToExcel(rows, 'Movimientos', 'DUNA_ACTIVE_Movimientos_Inventario.xlsx');
}

export function exportSalesExcel(data: WorkspaceData, includeExamples: boolean) {
  const rows = data.sales
    .filter((s) => includeExamples || !s.isExample)
    .map((s) => ({
      'N° Venta': s.saleNumber,
      Fecha: formatDateCL(s.saleDate),
      Cliente: s.customerName || 'Cliente mostrador',
      Canal: s.channel,
      'Medio de Pago': s.paymentMethod,
      Estado: s.paymentStatus,
      Prendas: s.items.reduce((a, i) => a + i.physicalUnitsDeducted, 0),
      Subtotal: Math.round(s.subtotal),
      Descuento: Math.round(s.discount),
      Total: Math.round(s.total),
      'Costo Mercadería (COGS)': Math.round(s.totalCogs),
      Comisión: Math.round(s.commission),
      Despacho: Math.round(s.shippingCost),
      'Ganancia Estimada': Math.round(s.estimatedProfit),
      Cobrado: Math.round(s.amountPaid),
      RegistradoPor: s.performedBy,
    }));
  exportSheetToExcel(rows, 'Ventas', 'DUNA_ACTIVE_Ventas.xlsx');
}

export function exportPurchasesExcel(data: WorkspaceData, includeExamples: boolean) {
  const supMap = new Map(data.suppliers.map((s) => [s.id, s.name]));
  const rows = data.purchaseOrders
    .filter((po) => includeExamples || !po.isExample)
    .map((po) => ({
      'N° Orden': po.orderNumber,
      Proveedor: po.supplierId ? supMap.get(po.supplierId) || '' : '',
      'Fecha Pedido': formatDateCL(po.orderDate),
      'Llegada Estimada': formatDateCL(po.estimatedArrival),
      'Fecha Recepción': formatDateCL(po.receivedDate),
      Estado: po.status,
      Pagado: po.isPaid ? 'Sí' : 'No',
      Subtotal: Math.round(po.subtotal),
      Envío: Math.round(po.shippingCost),
      Impuestos: Math.round(po.taxes),
      'Otros Costos': Math.round(po.otherCosts),
      Descuento: Math.round(po.discount),
      Total: Math.round(po.total),
    }));
  exportSheetToExcel(rows, 'Compras', 'DUNA_ACTIVE_Compras.xlsx');
}

export function exportExpensesExcel(data: WorkspaceData, includeExamples: boolean) {
  const rows = data.expenses
    .filter((e) => includeExamples || !e.isExample)
    .map((e) => ({
      Fecha: formatDateCL(e.date),
      Vencimiento: formatDateCL(e.dueDate),
      Tipo: e.expenseType === 'fijo' ? 'Gasto Fijo' : 'Gasto Variable',
      Categoría: e.category,
      Concepto: e.concept,
      Monto: Math.round(e.amount),
      Estado: e.status === 'pagado' ? 'Pagado' : 'Pendiente',
      'Fecha Pago': formatDateCL(e.paidDate),
      Recurrente: e.isRecurring ? 'Sí' : 'No',
      'Medio de Pago': e.paymentMethod,
    }));
  exportSheetToExcel(rows, 'Gastos', 'DUNA_ACTIVE_Gastos.xlsx');
}

export function exportCashflowExcel(data: WorkspaceData, includeExamples: boolean) {
  const accMap = new Map(data.accounts.map((a) => [a.id, a.name]));
  const rows = data.transactions
    .filter((t) => includeExamples || !t.isExample)
    .map((t) => ({
      Fecha: formatDateCL(t.date),
      Dirección: t.direction,
      Clasificación: t.classification,
      Categoría: t.category,
      Concepto: t.concept,
      Monto: Math.round(t.amount),
      'Medio de Pago': t.paymentMethod,
      Cuenta: t.accountId ? accMap.get(t.accountId) || '' : '',
      Origen: t.referenceType,
      Observaciones: t.notes,
    }));
  exportSheetToExcel(rows, 'Flujo_de_Caja', 'DUNA_ACTIVE_Flujo_de_Caja.xlsx');
}

export function exportSuppliersExcel(data: WorkspaceData) {
  const rows = data.suppliers.map((s) => ({
    Proveedor: s.name,
    País: s.country,
    Ciudad: s.city,
    Web: s.website,
    WhatsApp: s.whatsapp,
    Correo: s.email,
    Productos: s.productsSupplied,
    'Pedido Mínimo': s.minOrderQty,
    'Entrega Promedio (días)': s.avgLeadDays,
    'Despacho Est. (CLP)': Math.round(s.shippingCostEstimate),
    Calificación: `${s.rating}/5`,
    Observaciones: s.notes,
  }));
  exportSheetToExcel(rows, 'Proveedores', 'DUNA_ACTIVE_Proveedores.xlsx');
}

export function exportProductProfitabilityExcel(
  salesByProduct: Array<{ name: string; revenue: number; units: number; cogs: number; profit: number }>,
) {
  const rows = salesByProduct.map((p) => ({
    Producto: p.name,
    'Prendas Vendidas': p.units,
    'Ventas Netas (CLP)': Math.round(p.revenue),
    'Costo Mercadería (CLP)': Math.round(p.cogs),
    'Utilidad Bruta (CLP)': Math.round(p.profit),
    'Margen (%)': p.revenue > 0 ? Number(((p.profit / p.revenue) * 100).toFixed(1)) : 0,
  }));
  exportSheetToExcel(rows, 'Rentabilidad_Producto', 'DUNA_ACTIVE_Rentabilidad_Productos.xlsx');
}

export function exportChannelSalesExcel(
  salesByChannel: Array<{ channel: string; revenue: number; count: number }>,
) {
  const rows = salesByChannel.map((c) => ({
    Canal: c.channel,
    'N° Ventas': c.count,
    'Ventas Totales (CLP)': Math.round(c.revenue),
    'Ticket Promedio (CLP)': c.count > 0 ? Math.round(c.revenue / c.count) : 0,
  }));
  exportSheetToExcel(rows, 'Ventas_por_Canal', 'DUNA_ACTIVE_Ventas_por_Canal.xlsx');
}

export function exportIncomeStatementExcel(metrics: DashboardMetrics, periodLabel: string) {
  const rows = [
    { Concepto: `Período: ${periodLabel}`, Monto: '' },
    { Concepto: 'Ventas Netas', Monto: Math.round(metrics.netSalesPeriod) },
    { Concepto: '(-) Costo de Mercadería Vendida (COGS)', Monto: -Math.round(metrics.cogsPeriod) },
    { Concepto: '= Utilidad Bruta', Monto: Math.round(metrics.grossProfitPeriod) },
    { Concepto: '(-) Gastos Fijos Pagados', Monto: -Math.round(metrics.fixedExpensesPaidPeriod) },
    { Concepto: '(-) Gastos Variables Pagados', Monto: -Math.round(metrics.variableExpensesPaidPeriod) },
    { Concepto: '(-) Comisiones y Despachos de Ventas', Monto: -Math.round(metrics.salesDirectCostsPeriod) },
    { Concepto: '= Utilidad Operativa', Monto: Math.round(metrics.operatingProfitPeriod) },
    { Concepto: '(+) Otros Ingresos (no aportes de capital)', Monto: Math.round(metrics.otherIncomePeriod) },
    { Concepto: '= Resultado Neto Estimado', Monto: Math.round(metrics.estimatedNetResultPeriod) },
  ];
  exportSheetToExcel(rows, 'Estado_Resultados', 'DUNA_ACTIVE_Estado_Resultados.xlsx');
}

export function exportSaleReceiptPDF(
  sale: Sale,
  businessName = 'DUNA ACTIVE',
  city = 'Antofagasta, Chile',
) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(businessName.toUpperCase(), 40, 52);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(`${city} · Comprobante de Venta Interno`, 40, 68);

  doc.setTextColor(15, 15, 15);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Comprobante N° ${sale.saleNumber}`, 400, 52);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Fecha: ${formatDateCL(sale.saleDate)}`, 400, 68);

  doc.setDrawColor(225, 225, 225);
  doc.line(40, 84, 555, 84);

  doc.setFontSize(10);
  doc.text(`Cliente: ${sale.customerName || 'Cliente general'}`, 40, 106);
  if (sale.customerPhone) {
    doc.text(`Contacto: ${sale.customerPhone}`, 40, 122);
  }
  doc.text(`Canal: ${sale.channel}`, 320, 106);
  doc.text(`Medio de pago: ${sale.paymentMethod} (${sale.paymentStatus.toUpperCase()})`, 320, 122);

  autoTable(doc, {
    startY: 144,
    head: [['Producto', 'Color / Talla', 'Modalidad', 'Cant.', 'Precio Unit.', 'Subtotal']],
    body: sale.items.map((item) => [
      item.productName,
      `${item.color} / ${item.size}`,
      item.saleMode === 'pack' ? `Pack (${item.physicalUnitsDeducted} u.)` : 'Unidad',
      String(item.quantity),
      formatCLP(item.unitPrice),
      formatCLP(item.lineSubtotal),
    ]),
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [15, 15, 15], textColor: [255, 255, 255] },
    columnStyles: {
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 260;
  const xLabel = 380;
  const xVal = 550;

  doc.setFontSize(10);
  doc.text('Subtotal:', xLabel, finalY + 28);
  doc.text(formatCLP(sale.subtotal), xVal, finalY + 28, { align: 'right' });

  let yOffset = finalY + 44;
  if (sale.discount > 0) {
    doc.text('Descuento:', xLabel, yOffset);
    doc.text(`-${formatCLP(sale.discount)}`, xVal, yOffset, { align: 'right' });
    yOffset += 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('TOTAL:', xLabel, yOffset + 8);
  doc.text(formatCLP(sale.total), xVal, yOffset + 8, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(120, 120, 120);
  doc.text(
    'Documento interno de control comercial. No sustituye boleta o factura electrónica del SII.',
    40,
    yOffset + 48,
  );

  doc.save(`${businessName.replace(/\s+/g, '_')}_Comprobante_${sale.saleNumber}.pdf`);
}

export function exportFinancialSummaryPDF(
  data: WorkspaceData,
  metrics: DashboardMetrics,
  periodLabel: string,
) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const businessName = data.settings?.businessName || 'DUNA ACTIVE';
  const city = data.settings?.city || 'Antofagasta, Chile';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(`${businessName.toUpperCase()} — RESUMEN FINANCIERO`, 40, 50);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(`${city} · Período: ${periodLabel} · Moneda: CLP`, 40, 66);

  doc.setDrawColor(16, 185, 129);
  doc.setLineWidth(1.5);
  doc.line(40, 78, 555, 78);

  doc.setTextColor(15, 15, 15);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('1. Estado de Resultados del Período', 40, 102);

  autoTable(doc, {
    startY: 112,
    head: [['Partida', 'Monto (CLP)']],
    body: [
      ['Ventas netas confirmadas', formatCLP(metrics.netSalesPeriod)],
      ['(-) Costo de mercadería vendida (COGS)', `-${formatCLP(metrics.cogsPeriod)}`],
      ['= Utilidad bruta', `${formatCLP(metrics.grossProfitPeriod)} (${formatPercent(metrics.grossMarginPct)})`],
      ['(-) Gastos fijos pagados', `-${formatCLP(metrics.fixedExpensesPaidPeriod)}`],
      ['(-) Gastos variables pagados', `-${formatCLP(metrics.variableExpensesPaidPeriod)}`],
      ['(-) Comisiones y despachos de venta', `-${formatCLP(metrics.salesDirectCostsPeriod)}`],
      ['= Utilidad operativa', `${formatCLP(metrics.operatingProfitPeriod)} (${formatPercent(metrics.operatingMarginPct)})`],
      ['(+) Otros ingresos (excluye aportes de capital)', formatCLP(metrics.otherIncomePeriod)],
      ['= Resultado neto estimado', formatCLP(metrics.estimatedNetResultPeriod)],
    ],
    styles: { fontSize: 9.5, cellPadding: 6 },
    headStyles: { fillColor: [15, 15, 15], textColor: [255, 255, 255] },
    columnStyles: { 1: { halign: 'right' } },
  });

  const y2 = ((doc as any).lastAutoTable?.finalY || 320) + 26;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('2. Flujo de Caja y Situación Patrimonial', 40, y2);

  autoTable(doc, {
    startY: y2 + 10,
    head: [['Indicador', 'Valor (CLP)']],
    body: [
      ['Saldo inicial de caja del período', formatCLP(metrics.cashOpeningBalance)],
      ['(+) Cobros e ingresos de caja recibidos', formatCLP(metrics.cashInflowsPeriod)],
      ['(-) Pagos y egresos realizados', `-${formatCLP(metrics.cashOutflowsPeriod)}`],
      ['= Dinero disponible actual en caja', formatCLP(metrics.cashAvailable)],
      ['Inventario valorizado al costo real', `${formatCLP(metrics.inventoryCostValue)} (${metrics.totalUnitsInStock} prendas)`],
      ['Cuentas por cobrar (ventas pendientes)', formatCLP(metrics.accountsReceivable)],
      ['Cuentas por pagar (compras y gastos pendientes)', formatCLP(metrics.accountsPayable)],
      ['Capital inicial + aportes posteriores', formatCLP(metrics.initialCapital + metrics.additionalCapital)],
      ['Retiros del propietario', formatCLP(metrics.ownerWithdrawals)],
      ['Disponible estimado para reinvertir', formatCLP(metrics.availableToReinvest)],
    ],
    styles: { fontSize: 9.5, cellPadding: 6 },
    headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255] },
    columnStyles: { 1: { halign: 'right' } },
  });

  const y3 = ((doc as any).lastAutoTable?.finalY || 620) + 24;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(110, 110, 110);
  doc.text(
    `Nota tributaria (Chile): IVA referencial configurado ${data.settings?.ivaRate ?? 19}% (${data.settings?.taxDocumentType ?? 'Boleta Electrónica'}). Este informe es de gestión administrativa y no sustituye contabilidad tributaria oficial ante el SII.`,
    40,
    y3,
    { maxWidth: 515 },
  );

  doc.save(
    `${businessName.replace(/\s+/g, '_')}_Resumen_Financiero_${new Date().toISOString().slice(0, 10)}.pdf`,
  );
}

function parseCsvText(text: string): Record<string, string>[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const splitLine = (line: string) =>
    line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ''));

  const headers = splitLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = splitLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = vals[idx] ?? '';
    });
    return obj;
  });
}

export async function parseInventoryFile(file: File): Promise<
  Array<{
    sku: string;
    name: string;
    category: string;
    brand: string;
    model: string;
    color: string;
    size: string;
    stock: number;
    minStock: number;
    purchasePrice: number;
    salePrice: number;
    isPack: boolean;
    packUnits: number;
    location: string;
  }>
> {
  let rawRows: Record<string, any>[] = [];

  if (file.name.toLowerCase().endsWith('.csv')) {
    const text = await file.text();
    rawRows = parseCsvText(text);
  } else {
    const buf = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const headers: string[] = [];
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) {
        row.eachCell((cell, col) => {
          headers[col] = String(cell.value ?? '').trim();
        });
      } else {
        const obj: Record<string, any> = {};
        row.eachCell((cell, col) => {
          const key = headers[col];
          if (key) obj[key] = cell.value ?? '';
        });
        rawRows.push(obj);
      }
    });
  }

  const pick = (row: Record<string, any>, keys: string[], fallback = '') => {
    for (const k of Object.keys(row)) {
      const norm = k
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
      if (keys.some((target) => norm.includes(target))) {
        return row[k];
      }
    }
    return fallback;
  };

  return rawRows
    .map((r) => {
      const name = String(pick(r, ['nombre', 'producto', 'name'], '')).trim();
      if (!name) return null;
      const isPackVal = String(pick(r, ['pack', 'es_pack'], '')).toLowerCase();
      const packUnits = Math.max(1, Number(pick(r, ['unidades_pack', 'pack_units'], '1')) || 1);
      const isPack = isPackVal === 'si' || isPackVal === 'sí' || isPackVal === 'true' || packUnits > 1;

      return {
        sku: String(pick(r, ['sku', 'codigo'], '')).trim(),
        name,
        category: String(pick(r, ['categoria', 'category'], 'Calzas')).trim() || 'Calzas',
        brand: String(pick(r, ['marca', 'brand'], '')).trim(),
        model: String(pick(r, ['modelo', 'model'], '')).trim(),
        color: String(pick(r, ['color'], 'Negro')).trim() || 'Negro',
        size: String(pick(r, ['talla', 'size'], 'M')).trim() || 'M',
        stock: Math.max(0, Math.round(Number(pick(r, ['stock', 'cantidad', 'qty'], '0')) || 0)),
        minStock: Math.max(0, Math.round(Number(pick(r, ['minimo', 'min_stock'], '2')) || 2)),
        purchasePrice: Math.max(0, Number(pick(r, ['compra', 'costo', 'cost'], '0')) || 0),
        salePrice: Math.max(0, Number(pick(r, ['venta', 'precio', 'sale'], '0')) || 0),
        isPack,
        packUnits: isPack ? Math.max(2, packUnits) : 1,
        location:
          String(pick(r, ['ubicacion', 'location'], 'Bodega Antofagasta')).trim() ||
          'Bodega Antofagasta',
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

export function downloadImportTemplateExcel() {
  const sample = [
    {
      SKU: 'DUNA-CLZ-010',
      Nombre: 'Calza Sculpt Esmeralda',
      Categoria: 'Calzas',
      Marca: 'Duna',
      Modelo: 'High Waist',
      Color: 'Verde Esmeralda',
      Talla: 'S',
      Stock: 4,
      Stock_Minimo: 2,
      Precio_Compra: 5800,
      Precio_Venta: 15800,
      Es_Pack: 'No',
      Unidades_Pack: 1,
      Ubicacion: 'Bodega Antofagasta',
    },
    {
      SKU: 'DUNA-CLZ-010',
      Nombre: 'Calza Sculpt Esmeralda',
      Categoria: 'Calzas',
      Marca: 'Duna',
      Modelo: 'High Waist',
      Color: 'Verde Esmeralda',
      Talla: 'M',
      Stock: 6,
      Stock_Minimo: 2,
      Precio_Compra: 5800,
      Precio_Venta: 15800,
      Es_Pack: 'No',
      Unidades_Pack: 1,
      Ubicacion: 'Bodega Antofagasta',
    },
  ];
  exportSheetToExcel(sample, 'Plantilla_Inventario', 'Plantilla_Importacion_DUNA_ACTIVE.xlsx');
}

export { formatExactCLP };
