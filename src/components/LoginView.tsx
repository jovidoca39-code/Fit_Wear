import React from 'react';
import { ArrowRight, ShieldCheck, Layers, BarChart3, PackageCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { ProductImage } from './ProductImage.tsx';

export const LoginView: React.FC = () => {
  const { signInWithGoogle, authError } = useAuth();

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col lg:flex-row">
      {/* Left Brand & Sign-In Panel */}
      <div className="flex-1 flex flex-col justify-between px-6 py-10 sm:px-12 lg:px-20 bg-white border-b lg:border-b-0 lg:border-r border-neutral-200">
        <div>
          <span className="font-display text-lg font-extrabold tracking-tight text-neutral-950">
            DUNA ACTIVE
          </span>
        </div>

        <div className="max-w-md w-full my-12">
          <p className="text-xs font-medium text-emerald-700 mb-3">
            Antofagasta, Chile · Gestión Comercial y Financiera
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-neutral-950 leading-tight mb-4">
            Control total de tu inventario, ventas y rentabilidad.
          </h1>
          <p className="text-sm text-neutral-600 leading-relaxed mb-8">
            Administra variantes por talla y color, packs con costo exacto, compras con recepción
            controlada, caja en pesos chilenos y estados financieros persistentes en base de datos.
          </p>

          <button
            type="button"
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-lg bg-neutral-950 hover:bg-neutral-800 text-white text-sm font-medium transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#FFFFFF"
                d="M21.35 11.1h-9.18v2.98h5.27c-.23 1.48-1.74 4.35-5.27 4.35-3.17 0-5.76-2.62-5.76-5.85s2.59-5.85 5.76-5.85c1.81 0 3.02.77 3.71 1.43l2.53-2.44C16.79 4.2 14.69 3.3 12.17 3.3 7.26 3.3 3.3 7.27 3.3 12.18s3.96 8.88 8.87 8.88c5.12 0 8.51-3.6 8.51-8.67 0-.58-.06-1.02-.15-1.29z"
              />
            </svg>
            <span>Ingresar con cuenta de Google</span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>

          {authError && (
            <p className="mt-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2.5">
              {authError}
            </p>
          )}

          <div className="mt-10 pt-8 border-t border-neutral-200 grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div>
              <Layers className="w-4 h-4 text-emerald-700 mb-2" />
              <p className="text-xs font-semibold text-neutral-900">Stock atómico</p>
              <p className="text-xs text-neutral-500 mt-0.5">
                Descuento y reversión automática por talla y color.
              </p>
            </div>
            <div>
              <BarChart3 className="w-4 h-4 text-emerald-700 mb-2" />
              <p className="text-xs font-semibold text-neutral-900">Finanzas en CLP</p>
              <p className="text-xs text-neutral-500 mt-0.5">
                Utilidad real separada de capital y compras.
              </p>
            </div>
            <div>
              <ShieldCheck className="w-4 h-4 text-emerald-700 mb-2" />
              <p className="text-xs font-semibold text-neutral-900">Acceso seguro</p>
              <p className="text-xs text-neutral-500 mt-0.5">
                Datos persistentes en PostgreSQL con respaldo.
              </p>
            </div>
          </div>
        </div>

        <p className="text-xs text-neutral-400">
          DUNA ACTIVE · Zona horaria America/Santiago · Pesos Chilenos (CLP)
        </p>
      </div>

      {/* Right Visual Showcase Panel */}
      <div className="hidden lg:flex lg:w-[46%] bg-neutral-950 text-white p-14 flex-col justify-between">
        <div className="flex items-center justify-between text-xs text-neutral-400">
          <span>Catálogo Base Inicial</span>
          <span>Antofagasta · Chile</span>
        </div>

        <div className="grid grid-cols-2 gap-4 my-8">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
              <ProductImage
                src="/src/assets/images/calza_shein_burdeos_1795654756488.jpg"
                alt="Calza SHEIN Sports Seamless Burdeos"
                className="w-full h-56"
              />
              <div className="p-3.5">
                <p className="text-xs font-semibold text-white">Calza Seamless Burdeos</p>
                <p className="text-[11px] text-neutral-400 mt-0.5 font-mono-num">
                  Tallas S · M · L · Meta +$10.000
                </p>
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
              <ProductImage
                src="/src/assets/images/top_deportivo_duna_1795654758041.jpg"
                alt="Top Deportivo Duna Negro"
                className="w-full h-40"
              />
            </div>
          </div>
          <div className="space-y-4 pt-8">
            <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
              <ProductImage
                src="/src/assets/images/pack_velisys_calzas_1795654757719.jpg"
                alt="Pack Velisys 2 Calzas"
                className="w-full h-48"
              />
              <div className="p-3.5">
                <p className="text-xs font-semibold text-white">Pack Velisys x2 Calzas</p>
                <p className="text-[11px] text-neutral-400 mt-0.5 font-mono-num">
                  Venta en pack o unidad suelta
                </p>
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
              <ProductImage
                src="/src/assets/images/calza_esmeralda_pro_1795654758695.jpg"
                alt="Calza Sculpt Esmeralda"
                className="w-full h-48"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-6 border-t border-neutral-800 text-xs text-neutral-400">
          <span className="flex items-center gap-2 text-neutral-300">
            <PackageCheck className="w-4 h-4 text-emerald-400" />
            Capital inicial configurado: $116.724 CLP
          </span>
          <span className="font-mono-num text-emerald-400">Ganancia meta $10.000/u</span>
        </div>
      </div>
    </div>
  );
};
