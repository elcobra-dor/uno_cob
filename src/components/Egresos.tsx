import React, { useState, useMemo } from 'react';
import { Egreso, Categoria } from '../types';
import { fmtMonto, sugerirCategoria, norm } from '../lib/businessUtils';
import { Search, ArrowUpRight, Check, Trash2, HelpCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface EgresosProps {
  egresos: Egreso[];
  categorias: Categoria[];
  onConfirmarEgreso: (id: string) => Promise<void>;
  onCambiarCategoriaEgreso: (id: string, catId: string) => void;
  onEliminarEgreso: (id: string) => Promise<void>;
  onExportarEgresos: () => void;
  stats: {
    total: number;
    clasificados: number;
    sinClasificar: number;
    montoPEN: number;
    montoUSD: number;
    progreso: number;
  };
}

export default function Egresos({
  egresos,
  categorias,
  onConfirmarEgreso,
  onCambiarCategoriaEgreso,
  onEliminarEgreso,
  onExportarEgresos,
  stats
}: EgresosProps) {
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'pendiente' | 'confirmado'>('pendiente');
  const [filtroCat, setFiltroCat] = useState<string>('todos');
  const [busca, setBusca] = useState<string>('');

  // 1. Unique categories names for dropdown filtering
  const gruposPresupuesto = useMemo(() => {
    const nombres = categorias.map(c => c.grupo);
    return [...new Set(nombres)].sort();
  }, [categorias]);

  // 2. Filter Egresos
  const egresosFiltrados = useMemo(() => {
    const buscaNorm = norm(busca);
    return egresos.filter(e => {
      // Estado check
      if (filtroEstado === 'pendiente' && e.estado === 'confirmado') return false;
      if (filtroEstado === 'confirmado' && e.estado !== 'confirmado') return false;

      // Categoria check
      if (filtroCat !== 'todos' && e.categoria_nombre && !e.categoria_nombre.includes(filtroCat)) return false;

      // Search term
      if (buscaNorm) {
        const textToSearch = norm(`${e.descripcion} ${e.referencia2} ${e.categoria_nombre || ''} ${e.operacion}`);
        if (!textToSearch.includes(buscaNorm)) return false;
      }

      return true;
    });
  }, [egresos, filtroEstado, filtroCat, busca]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Total Egresos</div>
          <div className="font-mono text-2xl font-bold text-slate-900">{stats.total}</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm border-t-4 border-t-emerald-500">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Clasificados</div>
          <div className="font-mono text-2xl font-bold text-emerald-600">{stats.clasificados}</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm border-t-4 border-t-amber-500">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Sin clasificar</div>
          <div className="font-mono text-2xl font-bold text-amber-600">{stats.sinClasificar}</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm border-t-4 border-t-red-500">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Total Egresado</div>
          <div className="font-mono text-lg font-bold text-red-600 leading-tight">
            S/ {stats.montoPEN.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
            {stats.montoUSD > 0 && (
              <>
                <br />
                <span className="text-xs font-normal text-slate-500">
                  US$ {stats.montoUSD.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div 
          className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
          style={{ width: `${stats.progreso}%` }}
        />
      </div>

      {/* Filter toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estado</span>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-xl px-3 py-2 focus:outline-none focus:border-capeco-blue focus:bg-white cursor-pointer"
            >
              <option value="todos">Todos</option>
              <option value="pendiente">Sin clasificar</option>
              <option value="confirmado">Clasificados</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Categoría</span>
            <select
              value={filtroCat}
              onChange={(e) => setFiltroCat(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-xl px-3 py-2 max-w-[200px] focus:outline-none focus:border-capeco-blue focus:bg-white cursor-pointer"
            >
              <option value="todos">Todas las categorías</option>
              {gruposPresupuesto.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 w-full sm:w-auto">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Buscar por Texto</span>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar descripción, referencia..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-sans text-xs text-slate-800 placeholder-slate-400 w-full sm:w-64 focus:outline-none focus:border-capeco-blue focus:bg-white transition-all"
              />
            </div>
          </div>
        </div>

        <button
          onClick={onExportarEgresos}
          className="bg-slate-50 text-slate-700 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold hover:bg-slate-100 transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm md:self-end"
        >
          <ArrowUpRight className="w-4 h-4 text-slate-400" />
          Exportar CSV ↓
        </button>
      </div>

      {/* Egresos List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">
            {egresosFiltrados.length} egreso{egresosFiltrados.length !== 1 ? 's' : ''} mostrado{egresosFiltrados.length !== 1 ? 's' : ''}
          </h3>
        </div>

        {egresosFiltrados.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center flex flex-col items-center justify-center">
            <AlertCircle className="w-10 h-10 text-slate-300 mb-2" />
            <div className="text-sm font-semibold text-slate-700">No se encontraron egresos</div>
            <p className="text-xs text-slate-400 mt-1">Prueba a limpiar tus filtros o a escribir otra palabra clave.</p>
          </div>
        ) : (
          egresosFiltrados.map((e) => {
            const sug = e.estado === 'pendiente' ? sugerirCategoria(e, categorias) : null;
            const catNombre = e.categoria_nombre || (sug ? `${sug.grupo}${sug.subgrupo ? ` / ${sug.subgrupo}` : ''}` : '');
            
            const isConfirmed = e.estado === 'confirmado';
            
            let cardClass = 'border-l-slate-300';
            let badgeClass = 'bg-slate-100 text-slate-400';
            let badgeLabel = 'SIN CLASIFICAR';

            if (isConfirmed) {
              cardClass = 'border-l-emerald-500';
              badgeClass = 'bg-emerald-50 text-emerald-700 border border-emerald-100';
              badgeLabel = 'CLASIFICADO';
            } else if (sug) {
              cardClass = 'border-l-amber-500';
              badgeClass = 'bg-amber-50 text-amber-700 border border-amber-100';
              badgeLabel = 'SUGERIDO ~';
            }

            // Categories Group by Grupo
            const distinctGrupos = [...new Set(categorias.map(c => c.grupo))].sort();

            return (
              <div 
                key={e.id}
                className={`bg-white rounded-2xl border border-slate-200 p-5 shadow-sm border-l-4 transition-all hover:shadow-md ${cardClass}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate leading-snug">
                      {e.descripcion || '(Sin descripción)'}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 mt-1 leading-normal">
                      {e.fecha} · OP {e.operacion}
                      {e.referencia2 && ` · Ref: ${e.referencia2}`}
                    </div>
                  </div>

                  <div className="text-left sm:text-right flex-shrink-0 flex sm:flex-col items-start sm:items-end justify-between sm:justify-start gap-2">
                    <div className="font-mono text-lg font-bold text-red-600 flex items-center gap-1.5 leading-none">
                      -{fmtMonto(e.monto, e.moneda)}
                    </div>
                    <span className={`text-[9px] font-mono font-bold tracking-wider px-2 py-0.5 rounded ${badgeClass}`}>
                      {badgeLabel}
                    </span>
                  </div>
                </div>

                {/* Categories Assignment Row */}
                <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-slate-100 items-stretch sm:items-center">
                  <select
                    value={e.categoria_id || (sug && e.estado === 'pendiente' ? sug.id : '')}
                    onChange={(evt) => onCambiarCategoriaEgreso(e.id, evt.target.value)}
                    disabled={isConfirmed}
                    className="flex-1 bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 rounded-xl px-3 py-2 focus:outline-none focus:border-capeco-blue focus:bg-white cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="">— Seleccionar categoría —</option>
                    {distinctGrupos.map(g => {
                      const subs = categorias.filter(c => c.grupo === g);
                      return (
                        <optgroup key={g} label={g}>
                          {subs.map(c => {
                            const val = c.id;
                            const label = c.subgrupo ? `${c.grupo} / ${c.subgrupo}` : c.grupo;
                            return (
                              <option key={c.id} value={val}>{label}</option>
                            );
                          })}
                        </optgroup>
                      );
                    })}
                  </select>

                  {!isConfirmed && (
                    <button
                      onClick={() => {
                        // LA MAGIA OCURRE AQUÍ: Si hay sugerencia y no hiciste clic, la pre-cargamos para el cerebro
                        if (!e.categoria_id && sug) {
                          onCambiarCategoriaEgreso(e.id, sug.id);
                          e.categoria_id = sug.id;
                          e.categoria_nombre = `${sug.grupo}${sug.subgrupo ? ` / ${sug.subgrupo}` : ''}`;
                        }
                        onConfirmarEgreso(e.id);
                      }}
                      disabled={!e.categoria_id && !sug}
                      className={`px-4 py-2 rounded-xl text-xs font-semibold font-mono tracking-wide flex items-center justify-center gap-1 cursor-pointer transition-all ${
                        (e.categoria_id || sug) 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-150 hover:bg-emerald-500 hover:text-white hover:border-emerald-500' 
                          : 'bg-slate-50 text-slate-300 border border-slate-250 cursor-not-allowed opacity-50'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      Confirmar
                    </button>
                  )}

                  <button
                    onClick={() => onEliminarEgreso(e.id)}
                    className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-100 hover:bg-red-50 active:transform active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                    title="Eliminar egreso permanentemente"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {sug && !isConfirmed && (
                  <div className="mt-3 bg-blue-50/50 border border-blue-100 rounded-xl px-3 py-2 text-[10px] font-mono text-capeco-blue flex items-center gap-1.5 leading-none">
                    <RefreshCw className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 animate-spin-slow" />
                    <span>Sugerido automáticamente: {sug.grupo}{sug.subgrupo ? ` / ${sug.subgrupo}` : ''}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
