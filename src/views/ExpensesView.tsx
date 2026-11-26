import React, { useEffect, useMemo, useState } from 'react';
import { Plus, CheckCircle2, Trash2, FileDown, Repeat, X } from 'lucide-react';
import type { Expense, WorkspaceData } from '../types.ts';
import {
  FIXED_EXPENSE_CATEGORIES,
  formatCLP,
  formatDateCL,
  PAYMENT_METHODS,
  todayChileISO,
  VARIABLE_EXPENSE_CATEGORIES,
} from '../lib/format.ts';
import { exportExpensesExcel } from '../lib/exports.ts';
import { ConfirmModal } from '../components/ConfirmModal.tsx';

interface ExpensesViewProps {
  data: WorkspaceData;
  includeExamples: boolean;
  initialAction?: string;
  onClearAction: () => void;
  apiFetch: <T = any>(url: string, options?: RequestInit) => Promise<T>;
  onRefresh: () => Promise<void>;
  notify: (type: 'success' | 'warning' | 'error', message: string) => void;
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  data,
  includeExamples,
  initialAction,
  onClearAction,
  apiFetch,
  onRefresh,
  notify,
}) => {
  const [tab, setTab] = useState<'all' | 'fijo' | 'variable'>('all');
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);

  const [expenseType, setExpenseType] = useState<'fijo' | 'variable'>('variable');
  const [category, setCategory] = useState<string>(VARIABLE_EXPENSE_CATEGORIES[0]);
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayChileISO());
  const [dueDate, setDueDate] = useState(todayChileISO());
  const [paymentMethod, setPaymentMethod] = useState<string>('Transferencia');
  const [accountId, setAccountId] = useState(
    String(data.accounts.find((a) => a.isDefault)?.id || data.accounts[0]?.id || ''),
  );
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDay, setRecurringDay] = useState('5');
  const [confirmPaidNow, setConfirmPaidNow] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialAction === 'new') {
      setShowForm(true);
      onClearAction();
    }
  }, [initialAction, onClearAction]);

  const handleTypeSwitch = (t: 'fijo' | 'variable') => {
    setExpenseType(t);
    setCategory(t === 'fijo' ? FIXED_EXPENSE_CATEGORIES[0] : VARIABLE_EXPENSE_CATEGORIES[0]);
  };

  const visibleExpenses = useMemo(
    () =>
      data.expenses.filter((e) => {
        if (!includeExamples && e.isExample) return false;
        if (tab !== 'all' && e.expenseType !== tab) return false;
        return true;
      }),
    [data.expenses, includeExamples, tab],
  );

  const totals = useMemo(() => {
    const fixedPaid = data.expenses
      .filter((e) => (includeExamples || !e.isExample) && e.expenseType === 'fijo' && e.status === 'pagado')
      .reduce((s, e) => s + e.amount, 0);
    const varPaid = data.expenses
      .filter((e) => (includeExamples || !e.isExample) && e.expenseType === 'variable' && e.status === 'pagado')
      .reduce((s, e) => s + e.amount, 0);
    const pending = data.expenses
      .filter((e) => (includeExamples || !e.isExample) && e.status === 'pendiente')
      .reduce((s, e) => s + e.amount, 0);
    return { fixedPaid, varPaid, pending };
  }, [data.expenses, includeExamples]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(amount);
    if (!num || num <= 0) return notify('warning', 'Ingresa un monto válido.');
    setSaving(true);
    try {
      await apiFetch('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({
          date,
          dueDate: dueDate || date,
          expenseType,
          category,
          concept,
          amount: num,
          paymentMethod,
          accountId: accountId ? Number(accountId) : null,
          isRecurring,
          recurringDay: isRecurring ? Number(recurringDay) || 1 : null,
          confirmPaidNow,
          notes,
        }),
      });
      notify(
        'success',
        confirmPaidNow
          ? 'Gasto registrado como pagado y descontado de caja.'
          : 'Gasto registrado como pendiente de pago (no descontado de caja hasta confirmar).',
      );
      setConcept('');
      setAmount('');
      setNotes('');
      setConfirmPaidNow(false);
      setShowForm(false);
      await onRefresh();
    } catch (err: any) {
      notify('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePayExpense = async (exp: Expense) => {
    try {
      await apiFetch(`/api/expenses/${exp.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({ paidDate: todayChileISO() }),
      });
      notify('success', `Pago confirmado de "${exp.concept}". Descontado de caja.`);
      await onRefresh();
    } catch (err: any) {
      notify('error', err.message);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const exp = deleteTarget;
    setDeleteTarget(null);
    try {
      await apiFetch(`/api/expenses/${exp.id}`, { method: 'DELETE' });
      notify('success', 'Gasto eliminado.');
      await onRefresh();
    } catch (err: any) {
      notify('error', err.message);
    }
  };

  return (
    <div className="space-y-5">
      {/* KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-neutral-200 rounded-lg p-4">
          <p className="text-xs text-neutral-500">Gastos fijos pagados</p>
          <p className="font-mono-num text-xl font-semibold text-neutral-950 mt-1">
            {formatCLP(totals.fixedPaid)}
          </p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-lg p-4">
          <p className="text-xs text-neutral-500">Gastos variables pagados</p>
          <p className="font-mono-num text-xl font-semibold text-neutral-950 mt-1">
            {formatCLP(totals.varPaid)}
          </p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-lg p-4">
          <p className="text-xs text-neutral-500">Gastos pendientes por pagar</p>
          <p className="font-mono-num text-xl font-semibold text-amber-700 mt-1">
            {formatCLP(totals.pending)}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center p-1 bg-neutral-100 rounded-lg border border-neutral-200">
          <button
            type="button"
            onClick={() => setTab('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
              tab === 'all' ? 'bg-white text-neutral-950 shadow-xs' : 'text-neutral-600'
            }`}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => setTab('fijo')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
              tab === 'fijo' ? 'bg-white text-neutral-950 shadow-xs' : 'text-neutral-600'
            }`}
          >
            Gastos fijos
          </button>
          <button
            type="button"
            onClick={() => setTab('variable')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
              tab === 'variable' ? 'bg-white text-neutral-950 shadow-xs' : 'text-neutral-600'
            }`}
          >
            Gastos variables
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportExpensesExcel(data, includeExamples)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800 cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Exportar Excel</span>
          </button>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{showForm ? 'Cerrar formulario' : 'Registrar gasto'}</span>
          </button>
        </div>
      </div>

      {/* New Expense Form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white border border-neutral-200 rounded-lg p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-neutral-950">Nuevo gasto fijo o variable</h3>
              <p className="text-xs text-neutral-500">
                Por seguridad financiera, un gasto queda pendiente hasta que confirmes su pago real.
              </p>
            </div>
            <button type="button" onClick={() => setShowForm(false)} className="text-neutral-400">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleTypeSwitch('fijo')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md border cursor-pointer ${
                expenseType === 'fijo'
                  ? 'bg-neutral-950 text-white border-neutral-950'
                  : 'bg-white text-neutral-700 border-neutral-200'
              }`}
            >
              Gasto fijo (recurrente)
            </button>
            <button
              type="button"
              onClick={() => handleTypeSwitch('variable')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md border cursor-pointer ${
                expenseType === 'variable'
                  ? 'bg-neutral-950 text-white border-neutral-950'
                  : 'bg-white text-neutral-700 border-neutral-200'
              }`}
            >
              Gasto variable (por venta / operativo)
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="text-xs text-neutral-700">
              Categoría
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm bg-white"
              >
                {(expenseType === 'fijo' ? FIXED_EXPENSE_CATEGORIES : VARIABLE_EXPENSE_CATEGORIES).map(
                  (c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ),
                )}
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
                  expenseType === 'fijo'
                    ? 'Ej: Plan Internet mensual, Shopify, Arriendo bodega'
                    : 'Ej: 100 bolsas packaging DUNA, Campaña Instagram Ads'
                }
                className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
              />
            </label>

            <label className="text-xs text-neutral-700">
              Monto (CLP) *
              <input
                type="number"
                min={1}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
              />
            </label>

            <label className="text-xs text-neutral-700">
              Fecha registro
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
              />
            </label>

            <label className="text-xs text-neutral-700">
              Fecha vencimiento
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
              />
            </label>

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

            <label className="text-xs text-neutral-700">
              Cuenta de salida
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
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-1 text-xs text-neutral-800">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="w-4 h-4 accent-emerald-600"
              />
              <span>Gasto recurrente mensual</span>
            </label>
            {isRecurring && (
              <label className="flex items-center gap-2">
                <span>Día vencimiento:</span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={recurringDay}
                  onChange={(e) => setRecurringDay(e.target.value)}
                  className="w-16 px-2 py-1 border border-neutral-200 rounded font-mono-num"
                />
              </label>
            )}
            <label className="flex items-center gap-2 cursor-pointer font-medium text-emerald-800">
              <input
                type="checkbox"
                checked={confirmPaidNow}
                onChange={(e) => setConfirmPaidNow(e.target.checked)}
                className="w-4 h-4 accent-emerald-600"
              />
              <span>Confirmar que ya fue pagado ahora (descontar de caja)</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-xs rounded-lg border border-neutral-200 text-neutral-700 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
            >
              {saving ? 'Guardando...' : 'Guardar gasto'}
            </button>
          </div>
        </form>
      )}

      {/* Expenses Table */}
      <div className="bg-white border border-neutral-200 rounded-lg overflow-x-auto">
        {visibleExpenses.length === 0 ? (
          <div className="p-12 text-center text-xs text-neutral-500">
            No hay gastos registrados en esta vista.
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
                <th className="py-3 px-4 font-medium">Fecha / Venc.</th>
                <th className="py-3 px-3 font-medium">Tipo / Categoría</th>
                <th className="py-3 px-3 font-medium">Concepto</th>
                <th className="py-3 px-3 font-medium">Estado</th>
                <th className="py-3 px-3 font-medium text-right">Monto</th>
                <th className="py-3 px-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {visibleExpenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-neutral-50/70">
                  <td className="py-2.5 px-4 font-mono-num whitespace-nowrap">
                    <p className="text-neutral-900">{formatDateCL(exp.date)}</p>
                    {exp.dueDate && exp.dueDate !== exp.date && (
                      <p className="text-[11px] text-neutral-500">Vence: {formatDateCL(exp.dueDate)}</p>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <p className="font-medium text-neutral-900">{exp.category}</p>
                    <p className="text-[11px] text-neutral-500 flex items-center gap-1">
                      <span>{exp.expenseType === 'fijo' ? 'Gasto fijo' : 'Gasto variable'}</span>
                      {exp.isRecurring && (
                        <>
                          <span>·</span>
                          <Repeat className="w-3 h-3 inline text-emerald-700" />
                          <span>Día {exp.recurringDay || 1}</span>
                        </>
                      )}
                    </p>
                  </td>
                  <td className="py-2.5 px-3 text-neutral-800">{exp.concept}</td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {exp.status === 'pagado' ? (
                      <span className="text-emerald-700 font-medium">
                        Pagado ({formatDateCL(exp.paidDate)})
                      </span>
                    ) : (
                      <span className="text-amber-700 font-medium">Pendiente de pago</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono-num font-semibold text-neutral-950">
                    {formatCLP(exp.amount)}
                  </td>
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-2.5">
                      {exp.status === 'pendiente' && (
                        <button
                          type="button"
                          onClick={() => handlePayExpense(exp)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Confirmar pago</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(exp)}
                        className="text-neutral-400 hover:text-red-700 cursor-pointer"
                        title="Eliminar gasto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Eliminar gasto"
        description={`¿Eliminar "${deleteTarget?.concept || ''}" y su movimiento de caja asociado si corresponde?`}
        confirmLabel="Eliminar"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
