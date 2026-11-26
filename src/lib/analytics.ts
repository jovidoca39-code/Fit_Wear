import type { WorkspaceData } from '../types.ts';
import { formatMonthLabel, getMonthKey, todayChileISO } from './format.ts';

export interface AnalyticsFilter {
  startDate: string;
  endDate: string;
  productId: string; // 'all' or numeric string
  category: string; // 'all' or category name
  supplierId: string; // 'all' or numeric string
  includeExamples: boolean;
}

export interface DashboardMetrics {
  initialCapital: number;
  additionalCapital: number;
  ownerWithdrawals: number;
  cashAvailable: number;
  accountBalances: Array<{ id: number; name: string; type: string; balance: number }>;
  inventoryCostValue: number;
  inventoryRetailValue: number;
  salesToday: number;
  salesWeek: number;
  salesMonth: number;
  netSalesPeriod: number;
  collectedRevenuePeriod: number;
  purchasesTotalPeriod: number;
  fixedExpensesPaidPeriod: number;
  variableExpensesPaidPeriod: number;
  salesDirectCostsPeriod: number;
  operatingExpensesPeriod: number;
  cogsPeriod: number;
  grossProfitPeriod: number;
  operatingProfitPeriod: number;
  otherIncomePeriod: number;
  estimatedNetResultPeriod: number;
  grossMarginPct: number;
  operatingMarginPct: number;
  roiPct: number;
  unitsSoldPeriod: number;
  totalUnitsInStock: number;
  reservedUnits: number;
  lowStockVariantsCount: number;
  outOfStockVariantsCount: number;
  accountsReceivable: number;
  accountsPayable: number;
  availableToReinvest: number;
  recoveredCapitalFromSales: number;
  accumulatedProfitsAllTime: number;
  // Cash flow summary
  cashOpeningBalance: number;
  cashInflowsPeriod: number;
  cashOutflowsPeriod: number;
  cashClosingBalance: number;
}

export function computeAnalytics(data: WorkspaceData, filter: AnalyticsFilter) {
  const today = todayChileISO();
  const todayDate = new Date(`${today}T12:00:00`);
  const sevenDaysAgoDate = new Date(todayDate);
  sevenDaysAgoDate.setDate(sevenDaysAgoDate.getDate() - 6);
  const sevenDaysAgo = sevenDaysAgoDate.toISOString().slice(0, 10);
  const currentMonthPrefix = today.slice(0, 7);

  const productMap = new Map(data.products.map((p) => [p.id, p]));

  const matchesProductFilter = (productId: number) => {
    const prod = productMap.get(productId);
    if (!prod) return false;
    if (!filter.includeExamples && prod.isExample) return false;
    if (filter.productId !== 'all' && String(prod.id) !== filter.productId) return false;
    if (filter.category !== 'all' && prod.category !== filter.category) return false;
    if (filter.supplierId !== 'all' && String(prod.supplierId ?? '') !== filter.supplierId)
      return false;
    return true;
  };

  const inDateRange = (dateStr: string) => {
    const d = (dateStr || '').slice(0, 10);
    if (filter.startDate && d < filter.startDate) return false;
    if (filter.endDate && d > filter.endDate) return false;
    return true;
  };

  // Filtered products
  const visibleProducts = data.products.filter((p) => {
    if (!filter.includeExamples && p.isExample) return false;
    if (filter.productId !== 'all' && String(p.id) !== filter.productId) return false;
    if (filter.category !== 'all' && p.category !== filter.category) return false;
    if (filter.supplierId !== 'all' && String(p.supplierId ?? '') !== filter.supplierId) return false;
    return true;
  });

  let inventoryCostValue = 0;
  let inventoryRetailValue = 0;
  let totalUnitsInStock = 0;
  let reservedUnits = 0;
  let lowStockVariantsCount = 0;
  let outOfStockVariantsCount = 0;

  for (const prod of visibleProducts) {
    if (!prod.isActive) continue;
    const unitRetail = prod.isPack
      ? prod.singleUnitSalePrice || prod.salePrice / Math.max(1, prod.packUnits)
      : prod.salePrice;
    for (const v of prod.variants) {
      totalUnitsInStock += v.stock;
      reservedUnits += v.reservedStock;
      inventoryCostValue += v.stock * v.unitCost;
      inventoryRetailValue += v.stock * (v.salePriceOverride ?? unitRetail);
      const avail = v.stock - v.reservedStock;
      if (avail <= 0) {
        outOfStockVariantsCount++;
      } else if (avail <= v.minStock) {
        lowStockVariantsCount++;
      }
    }
  }

  // Account balances (all-time real ledger)
  const validTransactionsAll = data.transactions.filter(
    (t) => filter.includeExamples || !t.isExample,
  );

  const accountBalances = data.accounts.map((acc) => {
    let bal = acc.initialBalance;
    for (const t of validTransactionsAll) {
      if (t.direction === 'ingreso' && t.accountId === acc.id) {
        bal += t.amount;
      } else if (t.direction === 'egreso' && t.accountId === acc.id) {
        bal -= t.amount;
      } else if (t.direction === 'transferencia') {
        if (t.accountId === acc.id) bal -= t.amount;
        if (t.targetAccountId === acc.id) bal += t.amount;
      }
    }
    return { id: acc.id, name: acc.name, type: acc.type, balance: bal };
  });

  const cashAvailable = accountBalances.reduce((s, a) => s + a.balance, 0);

  // Cash flow for selected period
  const totalInitialAccountBalances = data.accounts.reduce((s, a) => s + a.initialBalance, 0);
  let cashOpeningBalance = totalInitialAccountBalances;
  let cashInflowsPeriod = 0;
  let cashOutflowsPeriod = 0;

  for (const t of validTransactionsAll) {
    if (t.direction === 'transferencia') continue;
    const d = (t.date || '').slice(0, 10);
    if (filter.startDate && d < filter.startDate) {
      if (t.direction === 'ingreso') cashOpeningBalance += t.amount;
      if (t.direction === 'egreso') cashOpeningBalance -= t.amount;
    } else if (inDateRange(d)) {
      if (t.direction === 'ingreso') cashInflowsPeriod += t.amount;
      if (t.direction === 'egreso') cashOutflowsPeriod += t.amount;
    }
  }
  const cashClosingBalance = cashOpeningBalance + cashInflowsPeriod - cashOutflowsPeriod;

  // Capital tracking (all time)
  const initialCapital = data.settings?.initialCapital ?? 116724;
  const additionalCapital = validTransactionsAll
    .filter((t) => t.classification === 'aporte_capital')
    .reduce((s, t) => s + t.amount, 0);
  const ownerWithdrawals = validTransactionsAll
    .filter((t) => t.classification === 'retiro_propietario')
    .reduce((s, t) => s + t.amount, 0);

  // Sales metrics
  const hasItemLevelFilter =
    filter.productId !== 'all' || filter.category !== 'all' || filter.supplierId !== 'all';

  const activeSalesAll = data.sales.filter(
    (s) =>
      (filter.includeExamples || !s.isExample) &&
      s.paymentStatus !== 'cancelado' &&
      s.paymentStatus !== 'devuelto',
  );

  // Helper to get sale revenue/cogs respecting product/category/supplier filters
  const evaluateSale = (s: (typeof activeSalesAll)[number]) => {
    if (!hasItemLevelFilter) {
      const units = s.items.reduce((a, i) => a + Math.max(0, i.physicalUnitsDeducted - i.returnedQuantity), 0);
      return {
        revenue: s.total,
        cogs: s.totalCogs,
        directCosts: s.commission + s.shippingCost + s.otherCost,
        units,
        matched: true,
      };
    }
    const matchingItems = s.items.filter((i) => matchesProductFilter(i.productId));
    if (matchingItems.length === 0) {
      return { revenue: 0, cogs: 0, directCosts: 0, units: 0, matched: false };
    }
    const ratio =
      s.subtotal > 0
        ? matchingItems.reduce((a, i) => a + i.lineSubtotal, 0) / s.subtotal
        : 1;
    const revenue = matchingItems.reduce((a, i) => a + i.lineSubtotal, 0) - s.discount * ratio;
    const cogs = matchingItems.reduce((a, i) => a + i.lineCogs, 0);
    const directCosts = (s.commission + s.shippingCost + s.otherCost) * ratio;
    const units = matchingItems.reduce(
      (a, i) => a + Math.max(0, i.physicalUnitsDeducted - i.returnedQuantity),
      0,
    );
    return { revenue, cogs, directCosts, units, matched: true };
  };

  let salesToday = 0;
  let salesWeek = 0;
  let salesMonth = 0;
  let netSalesPeriod = 0;
  let cogsPeriod = 0;
  let salesDirectCostsPeriod = 0;
  let unitsSoldPeriod = 0;
  let recoveredCapitalFromSales = 0;
  let accumulatedGrossProfitAllTime = 0;
  let accumulatedSaleDirectCostsAllTime = 0;

  // For charts
  const dailyMap = new Map<string, { date: string; ventas: number; utilidad: number }>();
  const monthlyMap = new Map<
    string,
    {
      month: string;
      label: string;
      ventas: number;
      ingresos: number;
      egresos: number;
      utilidad: number;
      cogs: number;
      gastos: number;
    }
  >();
  const productSalesMap = new Map<
    string,
    { name: string; revenue: number; units: number; profit: number; cogs: number }
  >();
  const channelSalesMap = new Map<string, { channel: string; revenue: number; count: number }>();

  const ensureMonth = (mKey: string) => {
    if (!monthlyMap.has(mKey)) {
      monthlyMap.set(mKey, {
        month: mKey,
        label: formatMonthLabel(mKey),
        ventas: 0,
        ingresos: 0,
        egresos: 0,
        utilidad: 0,
        cogs: 0,
        gastos: 0,
      });
    }
    return monthlyMap.get(mKey)!;
  };

  for (const s of activeSalesAll) {
    const ev = evaluateSale(s);
    if (!ev.matched) continue;
    const d = s.saleDate.slice(0, 10);

    // Count confirmed sales (pagado or parcial) in realized sales & profit; pending sales are Accounts Receivable
    const isRealized = s.paymentStatus === 'pagado' || s.paymentStatus === 'parcial';

    if (isRealized) {
      recoveredCapitalFromSales += ev.cogs;
      accumulatedGrossProfitAllTime += ev.revenue - ev.cogs;
      accumulatedSaleDirectCostsAllTime += ev.directCosts;

      if (d === today) salesToday += ev.revenue;
      if (d >= sevenDaysAgo && d <= today) salesWeek += ev.revenue;
      if (d.startsWith(currentMonthPrefix)) salesMonth += ev.revenue;

      if (inDateRange(d)) {
        netSalesPeriod += ev.revenue;
        cogsPeriod += ev.cogs;
        salesDirectCostsPeriod += ev.directCosts;
        unitsSoldPeriod += ev.units;

        const dayEntry = dailyMap.get(d) || { date: d, ventas: 0, utilidad: 0 };
        dayEntry.ventas += ev.revenue;
        dayEntry.utilidad += ev.revenue - ev.cogs - ev.directCosts;
        dailyMap.set(d, dayEntry);

        const mEntry = ensureMonth(getMonthKey(d));
        mEntry.ventas += ev.revenue;
        mEntry.cogs += ev.cogs;
        mEntry.utilidad += ev.revenue - ev.cogs - ev.directCosts;

        const ch = channelSalesMap.get(s.channel) || { channel: s.channel, revenue: 0, count: 0 };
        ch.revenue += ev.revenue;
        ch.count += 1;
        channelSalesMap.set(s.channel, ch);

        for (const item of s.items) {
          if (hasItemLevelFilter && !matchesProductFilter(item.productId)) continue;
          const prev = productSalesMap.get(item.productName) || {
            name: item.productName,
            revenue: 0,
            units: 0,
            profit: 0,
            cogs: 0,
          };
          prev.revenue += item.lineSubtotal;
          prev.units += Math.max(0, item.physicalUnitsDeducted - item.returnedQuantity);
          prev.cogs += item.lineCogs;
          prev.profit += item.lineSubtotal - item.lineCogs;
          productSalesMap.set(item.productName, prev);
        }
      }
    }
  }

  // Accounts Receivable (pending or partially paid sales)
  const accountsReceivable = activeSalesAll
    .filter((s) => s.paymentStatus === 'pendiente' || s.paymentStatus === 'parcial')
    .reduce((acc, s) => acc + Math.max(0, s.total - s.amountPaid), 0);

  // Purchases
  const visiblePurchases = data.purchaseOrders.filter(
    (po) =>
      (filter.includeExamples || !po.isExample) &&
      po.status !== 'cancelado' &&
      (filter.supplierId === 'all' || String(po.supplierId ?? '') === filter.supplierId),
  );
  const purchasesTotalPeriod = visiblePurchases
    .filter((po) => inDateRange(po.orderDate))
    .reduce((acc, po) => acc + po.total, 0);

  const unpaidPurchases = visiblePurchases
    .filter((po) => !po.isPaid)
    .reduce((acc, po) => acc + po.total, 0);

  // Expenses (fixed & variable)
  const visibleExpenses = data.expenses.filter((e) => filter.includeExamples || !e.isExample);
  const unpaidExpenses = visibleExpenses
    .filter((e) => e.status === 'pendiente')
    .reduce((acc, e) => acc + e.amount, 0);
  const accountsPayable = unpaidPurchases + unpaidExpenses;

  // Transactions in period for income/expense charts and exact accounting (never double counting!)
  const periodTx = validTransactionsAll.filter((t) => inDateRange(t.date));

  const collectedRevenuePeriod = periodTx
    .filter((t) => t.classification === 'cobro_venta')
    .reduce((s, t) => s + t.amount, 0);

  const fixedExpensesPaidPeriod = periodTx
    .filter((t) => t.classification === 'gasto_fijo')
    .reduce((s, t) => s + t.amount, 0);

  const variableExpensesPaidPeriod = periodTx
    .filter((t) => t.classification === 'gasto_variable' || t.classification === 'otro_egreso')
    .reduce((s, t) => s + t.amount, 0);

  // Other income (non-sale, non-capital contribution!)
  const otherIncomePeriod = periodTx
    .filter((t) => t.classification === 'otro_ingreso')
    .reduce((s, t) => s + t.amount, 0);

  const operatingExpensesPeriod =
    fixedExpensesPaidPeriod + variableExpensesPaidPeriod + salesDirectCostsPeriod;

  const grossProfitPeriod = netSalesPeriod - cogsPeriod;
  const operatingProfitPeriod = grossProfitPeriod - operatingExpensesPeriod;
  // IMPORTANT: aporte_capital is NEVER added to estimatedNetResultPeriod!
  const estimatedNetResultPeriod = operatingProfitPeriod + otherIncomePeriod;

  const grossMarginPct = netSalesPeriod > 0 ? (grossProfitPeriod / netSalesPeriod) * 100 : 0;
  const operatingMarginPct = netSalesPeriod > 0 ? (operatingProfitPeriod / netSalesPeriod) * 100 : 0;
  const totalInvestedCapital = initialCapital + additionalCapital;
  const roiPct = totalInvestedCapital > 0 ? (estimatedNetResultPeriod / totalInvestedCapital) * 100 : 0;

  // All-time operating expenses & accumulated net profit
  const allTimeOpEx = validTransactionsAll
    .filter(
      (t) =>
        t.classification === 'gasto_fijo' ||
        t.classification === 'gasto_variable' ||
        t.classification === 'otro_egreso',
    )
    .reduce((s, t) => s + t.amount, 0);
  const allTimeOtherIncome = validTransactionsAll
    .filter((t) => t.classification === 'otro_ingreso')
    .reduce((s, t) => s + t.amount, 0);
  const accumulatedProfitsAllTime =
    accumulatedGrossProfitAllTime - accumulatedSaleDirectCostsAllTime - allTimeOpEx + allTimeOtherIncome;

  const reinvestPct = data.settings?.reinvestmentPercent ?? 70;
  const availableToReinvest = Math.max(0, (cashAvailable - accountsPayable) * (reinvestPct / 100));

  // Populate monthly inflows/outflows & expense distribution
  const expenseDistMap = new Map<string, number>();
  for (const t of periodTx) {
    if (t.direction === 'transferencia') continue;
    const mEntry = ensureMonth(getMonthKey(t.date));
    if (t.direction === 'ingreso') mEntry.ingresos += t.amount;
    if (t.direction === 'egreso') mEntry.egresos += t.amount;
    if (
      t.classification === 'gasto_fijo' ||
      t.classification === 'gasto_variable' ||
      t.classification === 'otro_egreso'
    ) {
      mEntry.gastos += t.amount;
      mEntry.utilidad -= t.amount;
      expenseDistMap.set(t.category, (expenseDistMap.get(t.category) || 0) + t.amount);
    }
  }
  if (salesDirectCostsPeriod > 0) {
    expenseDistMap.set(
      'Comisiones y despachos de venta',
      (expenseDistMap.get('Comisiones y despachos de venta') || 0) + salesDirectCostsPeriod,
    );
  }

  // Capital evolution over months
  const sortedMonths = Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month));
  if (sortedMonths.length === 0) {
    sortedMonths.push({
      month: currentMonthPrefix,
      label: formatMonthLabel(currentMonthPrefix),
      ventas: 0,
      ingresos: 0,
      egresos: 0,
      utilidad: 0,
      cogs: 0,
      gastos: 0,
    });
  }

  let runningEquity = initialCapital;
  const capitalEvolution = sortedMonths.map((m) => {
    const capAdded = validTransactionsAll
      .filter((t) => t.classification === 'aporte_capital' && getMonthKey(t.date) === m.month)
      .reduce((s, t) => s + t.amount, 0);
    const withdrawn = validTransactionsAll
      .filter((t) => t.classification === 'retiro_propietario' && getMonthKey(t.date) === m.month)
      .reduce((s, t) => s + t.amount, 0);
    runningEquity += capAdded - withdrawn + m.utilidad;
    return {
      month: m.label,
      capital: Math.round(runningEquity),
      utilidad: Math.round(m.utilidad),
      rentabilidadPct: totalInvestedCapital > 0 ? Number(((m.utilidad / totalInvestedCapital) * 100).toFixed(1)) : 0,
    };
  });

  const metrics: DashboardMetrics = {
    initialCapital,
    additionalCapital,
    ownerWithdrawals,
    cashAvailable,
    accountBalances,
    inventoryCostValue,
    inventoryRetailValue,
    salesToday,
    salesWeek,
    salesMonth,
    netSalesPeriod,
    collectedRevenuePeriod,
    purchasesTotalPeriod,
    fixedExpensesPaidPeriod,
    variableExpensesPaidPeriod,
    salesDirectCostsPeriod,
    operatingExpensesPeriod,
    cogsPeriod,
    grossProfitPeriod,
    operatingProfitPeriod,
    otherIncomePeriod,
    estimatedNetResultPeriod,
    grossMarginPct,
    operatingMarginPct,
    roiPct,
    unitsSoldPeriod,
    totalUnitsInStock,
    reservedUnits,
    lowStockVariantsCount,
    outOfStockVariantsCount,
    accountsReceivable,
    accountsPayable,
    availableToReinvest,
    recoveredCapitalFromSales,
    accumulatedProfitsAllTime,
    cashOpeningBalance,
    cashInflowsPeriod,
    cashOutflowsPeriod,
    cashClosingBalance,
  };

  return {
    metrics,
    charts: {
      dailySales: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
      monthlySeries: sortedMonths,
      salesByProduct: Array.from(productSalesMap.values()).sort((a, b) => b.revenue - a.revenue),
      topSellingUnits: Array.from(productSalesMap.values()).sort((a, b) => b.units - a.units),
      salesByChannel: Array.from(channelSalesMap.values()).sort((a, b) => b.revenue - a.revenue),
      expenseDistribution: Array.from(expenseDistMap.entries())
        .map(([name, value]) => ({ name, value: Math.round(value) }))
        .sort((a, b) => b.value - a.value),
      capitalEvolution,
    },
  };
}

export interface ReinvestmentProjectionPoint {
  month: number;
  label: string;
  conservative20: number;
  moderate35: number;
  ambitious50: number;
}

/**
 * Simulates 12-month capital growth under 20%, 35%, and 50% net return per cycle,
 * taking into account sales cycle duration + restock lead time and reinvestment %.
 */
export function simulateReinvestmentGrowth(
  startingCapital: number,
  reinvestmentPercent: number,
  salesCycleDays: number,
  restockLeadDays: number,
): ReinvestmentProjectionPoint[] {
  const totalCycleDays = Math.max(7, salesCycleDays + restockLeadDays);
  const cyclesPerMonth = 30 / totalCycleDays;
  const reinvestRatio = Math.max(0, Math.min(1, reinvestmentPercent / 100));

  const projectAtRate = (ratePerCycle: number, months: number) => {
    const cycles = months * cyclesPerMonth;
    const effectiveGrowthPerCycle = 1 + ratePerCycle * reinvestRatio;
    return Math.round(startingCapital * Math.pow(effectiveGrowthPerCycle, cycles));
  };

  const points: ReinvestmentProjectionPoint[] = [];
  for (let m = 0; m <= 12; m++) {
    points.push({
      month: m,
      label: m === 0 ? 'Inicio' : `Mes ${m}`,
      conservative20: projectAtRate(0.2, m),
      moderate35: projectAtRate(0.35, m),
      ambitious50: projectAtRate(0.5, m),
    });
  }
  return points;
}
