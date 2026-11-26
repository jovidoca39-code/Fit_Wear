import React, { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Boxes,
  ShoppingBag,
  Truck,
  ArrowLeftRight,
  Receipt,
  Users,
  Scale,
  FileBarChart2,
  Settings,
  Menu,
  X,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import type { NavSection, WorkspaceData } from './types.ts';
import { LoginView } from './components/LoginView.tsx';
import { ToastContainer, type ToastMessage } from './components/Toast.tsx';
import { DashboardView } from './views/DashboardView.tsx';
import { InventoryView } from './views/InventoryView.tsx';
import { SalesView } from './views/SalesView.tsx';
import { PurchasesView } from './views/PurchasesView.tsx';
import { CashflowView } from './views/CashflowView.tsx';
import { ExpensesView } from './views/ExpensesView.tsx';
import { SuppliersView } from './views/SuppliersView.tsx';
import { AccountingView } from './views/AccountingView.tsx';
import { ReportsView } from './views/ReportsView.tsx';
import { SettingsView } from './views/SettingsView.tsx';

const NAV_ITEMS: Array<{ id: NavSection; label: string; icon: React.ComponentType<any> }> = [
  { id: 'dashboard', label: 'Inicio / Dashboard', icon: LayoutDashboard },
  { id: 'inventory', label: 'Inventario', icon: Boxes },
  { id: 'sales', label: 'Ventas', icon: ShoppingBag },
  { id: 'purchases', label: 'Compras y reposiciones', icon: Truck },
  { id: 'cashflow', label: 'Ingresos y egresos', icon: ArrowLeftRight },
  { id: 'expenses', label: 'Gastos fijos y variables', icon: Receipt },
  { id: 'suppliers', label: 'Proveedores', icon: Users },
  { id: 'accounting', label: 'Contabilidad', icon: Scale },
  { id: 'reports', label: 'Reportes', icon: FileBarChart2 },
  { id: 'settings', label: 'Configuración', icon: Settings },
];

const WorkspaceShell: React.FC = () => {
  const { user, loading, logout, apiFetch } = useAuth();
  const [section, setSection] = useState<NavSection>('dashboard');
  const [pendingAction, setPendingAction] = useState<string | undefined>(undefined);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [includeExamples, setIncludeExamples] = useState(true);

  const [data, setData] = useState<WorkspaceData | null>(null);
  const [fetching, setFetching] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = useCallback((type: ToastMessage['type'], message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const refreshData = useCallback(async () => {
    if (!user) return;
    setFetching(true);
    setLoadError(null);
    try {
      const snapshot = await apiFetch<WorkspaceData>('/api/bootstrap');
      setData(snapshot);
    } catch (err: any) {
      setLoadError(err.message || 'No se pudieron cargar los datos del servidor.');
    } finally {
      setFetching(false);
    }
  }, [user, apiFetch]);

  useEffect(() => {
    if (user) {
      refreshData();
    } else {
      setData(null);
    }
  }, [user, refreshData]);

  const handleNavigate = useCallback((next: NavSection, action?: string) => {
    setSection(next);
    setPendingAction(action);
    setMobileNavOpen(false);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="font-display text-lg font-bold tracking-tight text-neutral-950">
            DUNA ACTIVE
          </p>
          <p className="text-xs text-neutral-500">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  const currentNav = NAV_ITEMS.find((n) => n.id === section) || NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-neutral-50 flex">
      {/* Desktop Obsidian Left Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-neutral-950 text-white border-r border-neutral-900 no-print">
        <div className="px-6 py-5 border-b border-neutral-900">
          <p className="font-display text-base font-extrabold tracking-tight text-white">
            {data?.settings?.businessName || 'DUNA ACTIVE'}
          </p>
          <p className="text-[11px] text-neutral-400 mt-0.5">
            {data?.settings?.city || 'Antofagasta, Chile'} · CLP
          </p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer text-left ${
                  active
                    ? 'bg-emerald-600 text-white'
                    : 'text-neutral-300 hover:bg-neutral-900 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-neutral-900 text-xs">
          <p className="text-neutral-300 truncate font-medium">{user.displayName || 'Administrador'}</p>
          <p className="text-[11px] text-neutral-500 truncate">{user.email}</p>
          <button
            type="button"
            onClick={logout}
            className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs cursor-pointer transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-72 max-w-[82vw] bg-neutral-950 text-white flex flex-col h-full">
            <div className="px-5 py-4 border-b border-neutral-900 flex items-center justify-between">
              <span className="font-display font-bold text-sm">
                {data?.settings?.businessName || 'DUNA ACTIVE'}
              </span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-1 text-neutral-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavigate(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium cursor-pointer text-left ${
                      active ? 'bg-emerald-600 text-white' : 'text-neutral-300 hover:bg-neutral-900'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-neutral-900">
              <button
                type="button"
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-neutral-900 text-neutral-200 text-xs"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Cerrar sesión</span>
              </button>
            </div>
          </div>
          <div
            className="flex-1 bg-black/50"
            onClick={() => setMobileNavOpen(false)}
          />
        </div>
      )}

      {/* Main Content Viewport */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Clean Top Bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-neutral-200 px-4 sm:px-6 h-14 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 -ml-2 text-neutral-700 hover:text-neutral-950 cursor-pointer"
              aria-label="Abrir menú"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-display text-base sm:text-lg font-bold text-neutral-950 truncate">
              {currentNav.label}
            </h1>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={refreshData}
              disabled={fetching}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-neutral-200 text-xs text-neutral-700 hover:bg-neutral-50 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${fetching ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Actualizar</span>
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('sales', 'new')}
              className="px-3.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer whitespace-nowrap"
            >
              + Nueva venta
            </button>
          </div>
        </header>

        {/* Main Body */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {loadError && (
            <div className="mb-5 p-4 rounded-lg bg-red-50 border border-red-200 flex items-center justify-between gap-3 text-xs text-red-800">
              <span>{loadError}</span>
              <button
                type="button"
                onClick={refreshData}
                className="px-3 py-1.5 rounded bg-red-700 text-white font-medium cursor-pointer shrink-0"
              >
                Reintentar
              </button>
            </div>
          )}

          {!data ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="h-28 rounded-lg bg-neutral-200/70 animate-pulse" />
                ))}
              </div>
              <div className="h-64 rounded-lg bg-neutral-200/70 animate-pulse" />
            </div>
          ) : (
            <>
              {section === 'dashboard' && (
                <DashboardView
                  data={data}
                  includeExamples={includeExamples}
                  onToggleExamples={setIncludeExamples}
                  onNavigate={handleNavigate}
                />
              )}
              {section === 'inventory' && (
                <InventoryView
                  data={data}
                  includeExamples={includeExamples}
                  initialAction={pendingAction}
                  onClearAction={() => setPendingAction(undefined)}
                  apiFetch={apiFetch}
                  onRefresh={refreshData}
                  notify={notify}
                />
              )}
              {section === 'sales' && (
                <SalesView
                  data={data}
                  includeExamples={includeExamples}
                  initialAction={pendingAction}
                  onClearAction={() => setPendingAction(undefined)}
                  apiFetch={apiFetch}
                  onRefresh={refreshData}
                  notify={notify}
                />
              )}
              {section === 'purchases' && (
                <PurchasesView
                  data={data}
                  includeExamples={includeExamples}
                  initialAction={pendingAction}
                  onClearAction={() => setPendingAction(undefined)}
                  apiFetch={apiFetch}
                  onRefresh={refreshData}
                  notify={notify}
                />
              )}
              {section === 'cashflow' && (
                <CashflowView
                  data={data}
                  includeExamples={includeExamples}
                  apiFetch={apiFetch}
                  onRefresh={refreshData}
                  notify={notify}
                />
              )}
              {section === 'expenses' && (
                <ExpensesView
                  data={data}
                  includeExamples={includeExamples}
                  initialAction={pendingAction}
                  onClearAction={() => setPendingAction(undefined)}
                  apiFetch={apiFetch}
                  onRefresh={refreshData}
                  notify={notify}
                />
              )}
              {section === 'suppliers' && (
                <SuppliersView
                  data={data}
                  apiFetch={apiFetch}
                  onRefresh={refreshData}
                  notify={notify}
                />
              )}
              {section === 'accounting' && (
                <AccountingView data={data} includeExamples={includeExamples} />
              )}
              {section === 'reports' && (
                <ReportsView data={data} includeExamples={includeExamples} />
              )}
              {section === 'settings' && (
                <SettingsView
                  data={data}
                  apiFetch={apiFetch}
                  onRefresh={refreshData}
                  notify={notify}
                />
              )}
            </>
          )}
        </main>
      </div>

      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <WorkspaceShell />
    </AuthProvider>
  );
}
