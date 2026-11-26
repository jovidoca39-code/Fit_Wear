import React, { useMemo, useState } from 'react';
import { Plus, Trash2, FileDown, ArrowRightLeft, Wallet, X } from 'lucide-react';
import type { FinancialTransaction, WorkspaceData } from '../types.ts';
import { computeAnalytics } from '../lib/analytics.ts';
import { formatCLP, formatDateCL, PAYMENT_METHODS, todayChileISO } from '../lib/format.ts';
import { exportCashflowExcel } from '../lib/exports.ts';
import { ConfirmModal } from '../components/ConfirmModal.tsx';

interface CashflowViewProps {
  data: WorkspaceData;
  includeExamples: boolean;
  apiFetch: <T = any>(url: string, options?: RequestInit) => Promise<T>;
  onRefresh: () => Promise<void>;
  notify: (type: 'success' | 'warning' | 'error', message: string) => void;
}

const CLASSIFICATION_LABELS: Record<FinancialTransaction['classification'], string> = {
  cobro_venta: 'Cobro de venta',
  aporte_capital: 'Aporte de capital',
  otro_ingreso: 'Otro ingreso',
  pago_proveedor: 'Pago a proveedor',
  gasto_fijo: 'Gasto fijo',
  gasto_variable: 'Gasto variable',
  retiro_propietario: 'Retiro propietario',
  transferencia_cuentas: 'Transferencia entre cuentas',
  otro_egreso: 'Otro egreso',
};

const EGRESO_CATEGORIES = [
  'Pago a proveedores',
  'Despachos',
  'Publicidad',
  'Packaging',
  'Comisiones',
  'Servicios',
  'Gastos administrativos',
  'Impuestos',
  'Retiro del propietario',
  'Otros',
];

export const CashflowView: React.FC<CashflowViewProps> = ({
  data,
  includeExamples,
  apiFetch,
  onRefresh,
  notify,
}) => {
  const [showNewTx, setShowNewTx] = useState(false);
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FinancialTransaction | null>(null);
  const [dirFilter, setDirFilter] = useState<'all' | 'ingreso' | 'egreso' | 'transferencia'>('all');

  // New transaction form state
  const [date, setDate] = useState(todayChileISO());
  const [direction, setDirection] = useState<'ingreso' | 'egreso' | 'transferencia'>('ingreso');
  const [classification, setClassification] =
    useState<FinancialTransaction['classification']>('aporte_capital');
  const [category, setCategory] = useState('Aportes de capital');
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('Transferencia');
  const [accountId, setAccountId] = useState(
    String(data.accounts.find((a) => a.isDefault)?.id || data.accounts[0]?.id || ''),
  );
  const [targetAccountId, setTargetAccountId] = useState(String(data.accounts[1]?.id || ''));
  const [receiptRef, setReceiptRef] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // New account state
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<'banco' | 'efectivo' | 'digital'>('banco');
  const [accBalance, setAccBalance] = useState('0');

  const { metrics } = useMemo(
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

  const accMap = useMemo(() => new Map(data.accounts.map((a) => [a.id, a.name])), [data.accounts]);

  const visibleTx = useMemo(
    () =>
      data.transactions.filter((t) => {
        if (!includeExamples && t.isExample) return false;
        if (dirFilter !== 'all' && t.direction !== dirFilter) return false;
        return true;
      }),
    [data.transactions, includeExamples, dirFilter],
  );

  const handleDirectionChange = (next: 'ingreso' | 'egreso' | 'transferencia') => {
    setDirection(next);
    if (next === 'ingreso') {
      setClassification('aporte_capital');
      setCategory('Aportes de capital');
    } else if (next === 'egreso') {
      setClassification('gasto_variable');
      setCategory('Publicidad');
    } else {
      setClassification('transferencia_cuentas');
      setCategory('Transferencia interna');
    }
  };

  const handleCreateTx = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) return notify('warning', 'Ingresa un monto mayor a 0.');
    setSaving(true);
    try {
      await apiFetch('/api/transactions', {
        method: 'POST',
        body: JSON.stringify({
          date,
          direction,
          classification,
          category,
          concept,
          amount: numAmount,
          paymentMethod,
          accountId: accountId ? Number(accountId) : null,
          targetAccountId: direction === 'transferencia' && targetAccountId ? Number(targetAccountId) : null,
          receiptRef,
          notes,
        }),
      });
      notify(
        'success',
        classification === 'aporte_capital'
          ? 'Aporte de capital registrado en caja (contabilizado como patrimonio, no como utilidad).'
          : 'Movimiento financiero registrado correctamente.',
      );
      setConcept('');
      setAmount('');
      setReceiptRef('');
      setNotes('');
      setShowNewTx(false);
      await onRefresh();
    } catch (err: any) {
      notify('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim()) return;
    try {
      await apiFetch('/api/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: accName.trim(),
          type: accType,
          initialBalance: Number(accBalance) || 0,
        }),
      });
      notify('success', `Cuenta "${accName}" agregada.`);
      setAccName('');
      setAccBalance('0');
      setShowNewAccount(false);
      await onRefresh();
    } catch (err: any) {
      notify('error', err.message);
    }
  };

  const confirmDeleteTx = async () => {
    if (!deleteTarget) return;
    const tx = deleteTarget;
    setDeleteTarget(null);
    try {
      await apiFetch(`/api/transactions/${tx.id}`, { method: 'DELETE' });
      notify('success', 'Movimiento eliminado.');
      await onRefresh();
    } catch (err: any) {
      notify('error', err.message);
    }
  };

  return (
    <div className="space-y-5">
      {/* Account Balances Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-neutral-950 text-white rounded-lg p-4 border border-neutral-900">
          <p className="text-xs text-neutral-400">Saldo total disponible</p>
          <p className="font-mono-num text-2xl font-semibold mt-1 text-emerald-400">
            {formatCLP(metrics.cashAvailable)}
          </p>
          <p className="text-[11px] text-neutral-400 mt-1">Suma de todas tus cuentas</p>
        </div>
        {metrics.accountBalances.map((acc) => (
          <div key={acc.id} className="bg-white rounded-lg p-4 border border-neutral-200">
            <div className="flex items-center justify-between">
              <p className="text-xs text-neutral-500">{acc.name}</p>
              <Wallet className="w-3.5 h-3.5 text-neutral-400" />
            </div>
            <p className="font-mono-num text-xl font-semibold text-neutral-950 mt-1">
              {formatCLP(acc.balance)}
            </p>
            <p className="text-[11px] text-neutral-400 capitalize mt-0.5">{acc.type}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center p-1 bg-neutral-100 rounded-lg border border-neutral-200">
          {(['all', 'ingreso', 'egreso', 'transferencia'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirFilter(d)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer capitalize ${
                dirFilter === d ? 'bg-white text-neutral-950 shadow-xs' : 'text-neutral-600'
              }`}
            >
              {d === 'all' ? 'Todos' : d === 'ingreso' ? 'Ingresos' : d === 'egreso' ? 'Egresos' : 'Transferencias'}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowNewAccount((v) => !v)}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800 cursor-pointer"
          >
            + Nueva cuenta
          </button>
          <button
            type="button"
            onClick={() => exportCashflowExcel(data, includeExamples)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800 cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Exportar Excel</span>
          </button>
          <button
            type="button"
            onClick={() => setShowNewTx((v) => !v)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{showNewTx ? 'Cerrar formulario' : 'Registrar movimiento'}</span>
          </button>
        </div>
      </div>

      {/* New Account Form */}
      {showNewAccount && (
        <form
          onSubmit={handleCreateAccount}
          className="bg-white border border-neutral-200 rounded-lg p-4 flex flex-wrap items-end gap-3"
        >
          <label className="text-xs text-neutral-700 flex-1 min-w-[180px]">
            Nombre de la cuenta
            <input
              type="text"
              required
              value={accName}
              onChange={(e) => setAccName(e.target.value)}
              placeholder="Ej: Cuenta RUT BancoEstado"
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
            />
          </label>
          <label className="text-xs text-neutral-700">
            Tipo
            <select
              value={accType}
              onChange={(e) => setAccType(e.target.value as any)}
              className="mt-1 px-3 py-2 border border-neutral-200 rounded-md text-sm bg-white"
            >
              <option value="banco">Banco</option>
              <option value="efectivo">Efectivo</option>
              <option value="digital">Billetera digital</option>
            </select>
          </label>
          <label className="text-xs text-neutral-700">
            Saldo inicial (CLP)
            <input
              type="number"
              value={accBalance}
              onChange={(e) => setAccBalance(e.target.value)}
              className="mt-1 w-36 px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
            />
          </label>
          <button
            type="submit"
            className="px-4 py-2 text-xs font-medium rounded-md bg-neutral-950 text-white cursor-pointer"
          >
            Guardar cuenta
          </button>
        </form>
      )}

      {/* New Manual Transaction Form */}
      {showNewTx && (
        <form
          onSubmit={handleCreateTx}
          className="bg-white border border-neutral-200 rounded-lg p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-neutral-950">
                Registrar movimiento financiero manual
              </h3>
              <p className="text-xs text-neutral-500">
                Las ventas cobradas, compras pagadas y gastos confirmados se registran automáticamente para evitar duplicidades.
              </p>
            </div>
            <button type="button" onClick={() => setShowNewTx(false)} className="text-neutral-400">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleDirectionChange('ingreso')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md border cursor-pointer ${
                direction === 'ingreso'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-neutral-700 border-neutral-200'
              }`}
            >
              Ingreso / Aporte de capital
            </button>
            <button
              type="button"
              onClick={() => handleDirectionChange('egreso')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md border cursor-pointer ${
                direction === 'egreso'
                  ? 'bg-neutral-950 text-white border-neutral-950'
                  : 'bg-white text-neutral-700 border-neutral-200'
              }`}
            >
              Egreso / Retiro
            </button>
            <button
              type="button"
              onClick={() => handleDirectionChange('transferencia')}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border cursor-pointer ${
                direction === 'transferencia'
                  ? 'bg-neutral-800 text-white border-neutral-800'
                  : 'bg-white text-neutral-700 border-neutral-200'
              }`}
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Transferencia entre cuentas</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="text-xs text-neutral-700">
              Fecha
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
              />
            </label>

            {direction === 'ingreso' && (
              <label className="text-xs text-neutral-700">
                Tipo de ingreso
                <select
                  value={classification}
                  onChange={(e) => {
                    const c = e.target.value as FinancialTransaction['classification'];
                    setClassification(c);
                    setCategory(CLASSIFICATION_LABELS[c]);
                  }}
                  className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm bg-white"
                >
                  <option value="aporte_capital">Aporte de capital (NO cuenta como utilidad)</option>
                  <option value="otro_ingreso">Otro ingreso (reembolso, bonificación)</option>
                  <option value="cobro_venta">Cobro de venta manual</option>
                </select>
              </label>
            )}

            {direction === 'egreso' && (
              <>
                <label className="text-xs text-neutral-700">
                  Naturaleza del egreso
                  <select
                    value={classification}
                    onChange={(e) =>
                      setClassification(e.target.value as FinancialTransaction['classification'])
                    }
                    className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm bg-white"
                  >
                    <option value="gasto_variable">Gasto variable</option>
                    <option value="gasto_fijo">Gasto fijo</option>
                    <option value="pago_proveedor">Pago a proveedor</option>
                    <option value="retiro_propietario">Retiro del propietario</option>
                    <option value="otro_egreso">Otro egreso</option>
                  </select>
                </label>
                <label className="text-xs text-neutral-700">
                  Categoría
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm bg-white"
                  >
                    {EGRESO_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <label className="text-xs text-neutral-700">
              Monto (CLP)
              <input
                type="number"
                min={1}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="50000"
                className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
              />
            </label>

            <label className="text-xs text-neutral-700">
              {direction === 'transferencia' ? 'Cuenta origen' : 'Cuenta'}
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm bg-white"
              >
                {data.accounts.map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>

            {direction === 'transferencia' && (
              <label className="text-xs text-neutral-700">
                Cuenta destino
                <select
                  value={targetAccountId}
                  onChange={(e) => setTargetAccountId(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm bg-white"
                >
                  {data.accounts.map((a) => (
                    <option key={a.id} value={String(a.id)}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="text-xs text-neutral-700">
              Medio de pago
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm bg-white"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs text-neutral-700 sm:col-span-2">
              Concepto *
              <input
                type="text"
                required
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                placeholder={
                  classification === 'aporte_capital'
                    ? 'Ej: Nuevo aporte de capital para reposición SHEIN'
                    : 'Descripción clara del movimiento'
                }
                className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
              />
            </label>

            <label className="text-xs text-neutral-700">
              N° Comprobante / Ref.
              <input
                type="text"
                value={receiptRef}
                onChange={(e) => setReceiptRef(e.target.value)}
                placeholder="Ej: TRF-88412"
                className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
              />
            </label>

            <label className="text-xs text-neutral-700">
              Observaciones
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowNewTx(false)}
              className="px-4 py-2 text-xs rounded-lg border border-neutral-200 text-neutral-700 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
            >
              {saving ? 'Guardando...' : 'Registrar movimiento'}
            </button>
          </div>
        </form>
      )}

      {/* Ledger Table */}
      <div className="bg-white border border-neutral-200 rounded-lg overflow-x-auto">
        {visibleTx.length === 0 ? (
          <div className="p-12 text-center text-xs text-neutral-500">
            No hay movimientos registrados aún. Los cobros de ventas, pagos de compras y gastos pagados aparecerán aquí automáticamente.
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
                <th className="py-3 px-4 font-medium">Fecha</th>
                <th className="py-3 px-3 font-medium">Concepto y categoría</th>
                <th className="py-3 px-3 font-medium">Clasificación contable</th>
                <th className="py-3 px-3 font-medium">Cuenta / Medio</th>
                <th className="py-3 px-3 font-medium text-right">Monto</th>
                <th className="py-3 px-4 font-medium text-right">Origen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {visibleTx.map((tx) => (
                <tr key={tx.id} className="hover:bg-neutral-50/70">
                  <td className="py-2.5 px-4 font-mono-num text-neutral-600 whitespace-nowrap">
                    {formatDateCL(tx.date)}
                  </td>
                  <td className="py-2.5 px-3">
                    <p className="font-medium text-neutral-950">{tx.concept}</p>
                    <p className="text-[11px] text-neutral-500">
                      {tx.category}
                      {tx.receiptRef ? ` · Ref: ${tx.receiptRef}` : ''}
                    </p>
                  </td>
                  <td className="py-2.5 px-3 text-neutral-700">
                    {CLASSIFICATION_LABELS[tx.classification]}
                  </td>
                  <td className="py-2.5 px-3 text-neutral-600">
                    {tx.direction === 'transferencia'
                      ? `${accMap.get(tx.accountId || 0) || ''} → ${accMap.get(tx.targetAccountId || 0) || ''}`
                      : `${accMap.get(tx.accountId || 0) || 'Principal'} · ${tx.paymentMethod}`}
                  </td>
                  <td
                    className={`py-2.5 px-3 text-right font-mono-num font-semibold whitespace-nowrap ${
                      tx.direction === 'ingreso'
                        ? 'text-emerald-700'
                        : tx.direction === 'egreso'
                          ? 'text-red-700'
                          : 'text-neutral-700'
                    }`}
                  >
                    {tx.direction === 'ingreso' ? '+' : tx.direction === 'egreso' ? '-' : ''}
                    {formatCLP(tx.amount)}
                  </td>
                  <td className="py-2.5 px-4 text-right whitespace-nowrap text-neutral-500">
                    {tx.referenceType === 'manual' ? (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(tx)}
                        className="text-neutral-400 hover:text-red-700 cursor-pointer"
                        title="Eliminar movimiento manual"
                      >
                        <Trash2 className="w-3.5 h-3.5 inline" />
                      </button>
                    ) : (
                      <span className="capitalize">Auto ({tx.referenceType})</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Eliminar movimiento"
        description={`¿Eliminar el movimiento manual "${deleteTarget?.concept || ''}"?`}
        confirmLabel="Eliminar"
        onConfirm={confirmDeleteTx}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
