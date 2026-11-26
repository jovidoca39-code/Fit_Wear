import React, { useState } from 'react';
import { Save, Download, Trash2, Shield } from 'lucide-react';
import type { WorkspaceData } from '../types.ts';
import { formatDateTimeCL } from '../lib/format.ts';
import { ConfirmModal } from '../components/ConfirmModal.tsx';

interface SettingsViewProps {
  data: WorkspaceData;
  apiFetch: <T = any>(url: string, options?: RequestInit) => Promise<T>;
  onRefresh: () => Promise<void>;
  notify: (type: 'success' | 'warning' | 'error', message: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  data,
  apiFetch,
  onRefresh,
  notify,
}) => {
  const s = data.settings;
  const [businessName, setBusinessName] = useState(s?.businessName || 'DUNA ACTIVE');
  const [city, setCity] = useState(s?.city || 'Antofagasta, Chile');
  const [initialCapital, setInitialCapital] = useState(String(s?.initialCapital ?? 116724));
  const [targetProfitPerUnit, setTargetProfitPerUnit] = useState(
    String(s?.targetProfitPerUnit ?? 10000),
  );
  const [reinvestmentPercent, setReinvestmentPercent] = useState(
    String(s?.reinvestmentPercent ?? 70),
  );
  const [costAllocationMethod, setCostAllocationMethod] = useState<'proportional' | 'equal'>(
    s?.costAllocationMethod || 'proportional',
  );
  const [valuationMethod, setValuationMethod] = useState<'weighted_average' | 'last_cost'>(
    s?.valuationMethod || 'weighted_average',
  );
  const [ivaRate, setIvaRate] = useState(String(s?.ivaRate ?? 19));
  const [taxDocumentType, setTaxDocumentType] = useState(
    s?.taxDocumentType || 'Boleta Electrónica',
  );
  const [rutEmpresa, setRutEmpresa] = useState(s?.rutEmpresa || '');
  const [syncInitialAccount, setSyncInitialAccount] = useState(false);
  const [confirmClearDemo, setConfirmClearDemo] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasExamples = data.products.some((p) => p.isExample);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          businessName,
          city,
          initialCapital: Math.max(0, Number(initialCapital) || 0),
          targetProfitPerUnit: Math.max(0, Number(targetProfitPerUnit) || 0),
          reinvestmentPercent: Math.min(100, Math.max(0, Number(reinvestmentPercent) || 0)),
          costAllocationMethod,
          valuationMethod,
          ivaRate: Math.min(30, Math.max(0, Number(ivaRate) || 19)),
          taxDocumentType,
          rutEmpresa,
          syncInitialAccount,
        }),
      });
      notify('success', 'Configuración guardada en la base de datos.');
      setSyncInitialAccount(false);
      await onRefresh();
    } catch (err: any) {
      notify('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleBackupDownload = async () => {
    try {
      const backup = await apiFetch('/api/backup');
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `DUNA_ACTIVE_Respaldo_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify('success', 'Respaldo completo descargado en JSON.');
    } catch (err: any) {
      notify('error', err.message);
    }
  };

  const handleClearExamples = async () => {
    setConfirmClearDemo(false);
    try {
      await apiFetch('/api/demo/clear', { method: 'POST' });
      notify('success', 'Registros de ejemplo eliminados.');
      await onRefresh();
    } catch (err: any) {
      notify('error', err.message);
    }
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSave}
        className="bg-white border border-neutral-200 rounded-lg p-6 space-y-5"
      >
        <div className="border-b border-neutral-200 pb-3">
          <h3 className="text-base font-semibold text-neutral-950">
            Parámetros generales del negocio
          </h3>
          <p className="text-xs text-neutral-500">
            Moneda fija en Pesos Chilenos (CLP) · Zona horaria America/Santiago.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <label className="text-xs text-neutral-700">
            Nombre del negocio
            <input
              type="text"
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
            />
          </label>
          <label className="text-xs text-neutral-700">
            Ciudad y país
            <input
              type="text"
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
            />
          </label>
          <label className="text-xs text-neutral-700">
            RUT Empresa (opcional)
            <input
              type="text"
              value={rutEmpresa}
              onChange={(e) => setRutEmpresa(e.target.value)}
              placeholder="77.123.456-7"
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
            />
          </label>

          <label className="text-xs text-neutral-700">
            Capital inicial (CLP)
            <input
              type="number"
              min={0}
              value={initialCapital}
              onChange={(e) => setInitialCapital(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
            />
          </label>
          <label className="text-xs text-neutral-700">
            Ganancia objetivo por calza (CLP)
            <input
              type="number"
              min={0}
              value={targetProfitPerUnit}
              onChange={(e) => setTargetProfitPerUnit(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
            />
          </label>
          <label className="text-xs text-neutral-700">
            Porcentaje de reinversión (%)
            <input
              type="number"
              min={0}
              max={100}
              value={reinvestmentPercent}
              onChange={(e) => setReinvestmentPercent(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
            />
          </label>

          <label className="text-xs text-neutral-700">
            Valoración de inventario
            <select
              value={valuationMethod}
              onChange={(e) => setValuationMethod(e.target.value as any)}
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm bg-white"
            >
              <option value="weighted_average">Costo promedio ponderado (Recomendado)</option>
              <option value="last_cost">Último costo de compra</option>
            </select>
          </label>
          <label className="text-xs text-neutral-700">
            Prorrateo costos adicionales en compras
            <select
              value={costAllocationMethod}
              onChange={(e) => setCostAllocationMethod(e.target.value as any)}
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm bg-white"
            >
              <option value="proportional">Proporcional al valor del ítem</option>
              <option value="equal">Equitativo por unidad física</option>
            </select>
          </label>
          <label className="text-xs text-neutral-700">
            IVA referencial (%)
            <input
              type="number"
              min={0}
              max={30}
              value={ivaRate}
              onChange={(e) => setIvaRate(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm font-mono-num"
            />
          </label>
          <label className="text-xs text-neutral-700">
            Documento tributario habitual
            <select
              value={taxDocumentType}
              onChange={(e) => setTaxDocumentType(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm bg-white"
            >
              <option value="Boleta Electrónica">Boleta Electrónica</option>
              <option value="Factura Electrónica">Factura Electrónica</option>
              <option value="Sin inicio de actividades aún">Sin inicio de actividades aún</option>
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer">
          <input
            type="checkbox"
            checked={syncInitialAccount}
            onChange={(e) => setSyncInitialAccount(e.target.checked)}
            className="w-4 h-4 accent-emerald-600"
          />
          <span>Sincronizar también el saldo inicial de la Cuenta Principal con el capital inicial</span>
        </label>

        <div className="flex justify-end pt-3 border-t border-neutral-200">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Guardando...' : 'Guardar configuración'}</span>
          </button>
        </div>
      </form>

      {/* Backups & Demo Data Management */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-neutral-200 rounded-lg p-5 flex flex-col justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-neutral-950">Copia de seguridad (Respaldo)</h3>
            <p className="text-xs text-neutral-500 mt-1">
              Descarga una copia completa en formato JSON de tu inventario, ventas, compras, proveedores y contabilidad almacenados en PostgreSQL.
            </p>
          </div>
          <button
            type="button"
            onClick={handleBackupDownload}
            className="w-fit flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-neutral-950 hover:bg-neutral-800 text-white cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Descargar respaldo JSON</span>
          </button>
        </div>

        <div className="bg-white border border-neutral-200 rounded-lg p-5 flex flex-col justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-neutral-950">Datos de ejemplo iniciales</h3>
            <p className="text-xs text-neutral-500 mt-1">
              {hasExamples
                ? 'Tienes productos de ejemplo cargados (Calza SHEIN Sports Seamless y Pack Velisys). Puedes eliminarlos cuando comiences tu operación real.'
                : 'No hay registros de ejemplo activos en tu inventario. Estás operando 100% con datos reales.'}
            </p>
          </div>
          {hasExamples && (
            <button
              type="button"
              onClick={() => setConfirmClearDemo(true)}
              className="w-fit flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border border-red-200 text-red-700 hover:bg-red-50 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Eliminar productos de ejemplo</span>
            </button>
          )}
        </div>
      </div>

      {/* Audit History */}
      <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-neutral-200 flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-700" />
          <h3 className="text-sm font-semibold text-neutral-950">Historial de modificaciones</h3>
        </div>
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 sticky top-0">
              <tr>
                <th className="py-2.5 px-4 font-medium">Fecha y hora</th>
                <th className="py-2.5 px-3 font-medium">Módulo</th>
                <th className="py-2.5 px-3 font-medium">Detalle</th>
                <th className="py-2.5 px-4 font-medium">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {data.auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-neutral-500">
                    Aún no se registran acciones en la bitácora.
                  </td>
                </tr>
              ) : (
                data.auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2 px-4 font-mono-num text-neutral-500 whitespace-nowrap">
                      {formatDateTimeCL(log.createdAt)}
                    </td>
                    <td className="py-2 px-3 capitalize text-neutral-700">{log.entity}</td>
                    <td className="py-2 px-3 text-neutral-900">{log.summary}</td>
                    <td className="py-2 px-4 text-neutral-500">{log.performedBy}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <ConfirmModal
        open={confirmClearDemo}
        title="Eliminar productos de ejemplo"
        description="Se eliminarán los productos de ejemplo (Calza SHEIN Sports Seamless y Pack Velisys) de tu inventario. Tus movimientos y productos reales permanecerán intactos."
        confirmLabel="Eliminar ejemplos"
        onConfirm={handleClearExamples}
        onCancel={() => setConfirmClearDemo(false)}
      />
    </div>
  );
};
