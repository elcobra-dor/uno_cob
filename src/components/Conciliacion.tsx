import React, { useState, useMemo } from 'react';
import { Abono, Factura } from '../types';
import { fmtMonto, requiereDetraccionPEN, esAbonoDetraccionBN, norm } from '../lib/businessUtils';
import { Search, Trash2, Check, Archive, Sparkles } from 'lucide-react';

export default function Conciliacion({ abonos, facturas, onConfirmar, onQuitar, onArchivar, onEliminar, onAgregarLinea, onQuitarLinea, onCambiarLinea, onToggleDetraccion, stats }) {
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'pendiente' | 'confirmado' | 'inter'>('pendiente');
  const [filtroMonto, setFiltroMonto] = useState<string>('todos');
  const [filtroMoneda, setFiltroMoneda] = useState<string>('todos');
  const [busca, setBusca] = useState<string>('');
  const [verTodas, setVerTodas] = useState(false);

  const montosUnicos = useMemo(() => [...new Set(abonos.map(p => p.monto))].sort((a, b) => a - b), [abonos]);

  const abonosFiltrados = useMemo(() => {
    const buscaNorm = norm(busca);
    return abonos.filter(p => {
      if (filtroEstado === 'pendiente' && p.estado === 'confirmado') return false;
      if (filtroEstado === 'confirmado' && p.estado !== 'confirmado') return false;
      if (filtroEstado === 'inter' && !p.ordenante) return false;
      if (filtroMonto !== 'todos' && p.monto !== parseFloat(filtroMonto)) return false;
      const pMon = p.moneda === 'USD' ? 'USD' : 'PEN';
      if (filtroMoneda !== 'todos' && pMon !== filtroMoneda) return false;
      if (buscaNorm) {
        const textToSearch = norm(`${p.descripcion} ${p.operacion} ${p.ordenante || ''} ${(p.facturas || []).map(f => `${f.factura} ${f.razon}`).join(' ')}`);
        if (!textToSearch.includes(buscaNorm)) return false;
      }
      return true;
    });
  }, [abonos, filtroEstado, filtroMonto, filtroMoneda, busca]);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm"><div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Total abonos</div><div className="font-mono text-2xl font-bold text-slate-900">{stats.total}</div></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm border-t-4 border-t-emerald-500"><div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Confirmados</div><div className="font-mono text-2xl font-bold text-emerald-600">{stats.confirmados}</div></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm border-t-4 border-t-amber-500"><div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Pendientes</div><div className="font-mono text-2xl font-bold text-amber-600">{stats.pendientes}</div></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm border-t-4 border-t-capeco-blue"><div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Progreso</div><div className="font-mono text-2xl font-bold text-capeco-blue">{stats.progreso}%</div></div>
      </div>

      {/* Toolbar con Filtros y Modo Vista */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap gap-4 items-center">
        <button onClick={() => setVerTodas(!verTodas)} className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all ${verTodas ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-capeco-blue border-capeco-blue text-white'}`}>
            {verTodas ? '🔍 Ver Todas (Sin Filtro)' : '🎯 Francotirador Activo'}
        </button>
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as any)} className="bg-slate-50 border border-slate-200 text-xs rounded-xl px-3 py-2">
          <option value="todos">Todos</option><option value="pendiente">Pendientes</option><option value="confirmado">Confirmados</option>
        </select>
        <select value={filtroMonto} onChange={(e) => setFiltroMonto(e.target.value)} className="bg-slate-50 border border-slate-200 text-xs rounded-xl px-3 py-2">
          <option value="todos">Todos los montos</option>
          {montosUnicos.map(m => <option key={m} value={m}>{fmtMonto(m)}</option>)}
        </select>
        <input type="text" placeholder="Buscar..." value={busca} onChange={(e) => setBusca(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs w-48" />
      </div>

      {/* List */}
      <div className="space-y-4">
        {abonosFiltrados.map((p) => {
            const isConfirmed = p.estado === 'confirmado';
            const pMoneda = p.moneda === 'USD' ? 'USD' : 'PEN';
            const esBN = esAbonoDetraccionBN(p);
            
            const CUOTAS_ESTANDAR = [1980, 1270, 910, 530, 500, 410, 860];
            const esPagoEstandar = CUOTAS_ESTANDAR.includes(p.monto);

            const facturasOpciones = facturas
              .filter(f => {
                if (f.saldo <= 0.01) return false;
                const mismaMoneda = (f.moneda === 'USD' ? 'USD' : 'PEN') === pMoneda;
                const excepcionDetraccion = esBN && f.moneda === 'USD' && requiereDetraccionPEN(f);
                if (!mismaMoneda && !excepcionDetraccion) return false;
                if (!verTodas && esPagoEstandar && f.saldo !== p.monto) return false;
                return true;
              })
              .sort((a, b) => (a.razon_social || '').localeCompare(b.razon_social || ''));

            return (
              <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm border-l-4 border-l-slate-300">
                <div className="flex justify-between items-center mb-4">
                    <div className="text-sm font-bold">{p.descripcion}</div>
                    <div className="font-mono font-bold">{fmtMonto(p.monto, p.moneda)}</div>
                </div>
                <div className="space-y-2">
                    {p.facturas?.map((item, idx) => (
                        <select key={idx} value={item.factura} onChange={(e) => onCambiarLinea(p.id, idx, e.target.value)} className="w-full bg-slate-50 border p-2 text-xs rounded-lg">
                            <option value="">— Seleccionar factura —</option>
                            {facturasOpciones.map(f => (
                                <option key={f.factura} value={f.factura}>{f.razon_social} - {f.factura} - {f.saldo}</option>
                            ))}
                        </select>
                    ))}
                </div>
                <button onClick={() => onAgregarLinea(p.id)} className="mt-2 text-xs text-blue-600 font-bold">+ Agregar Factura</button>
              </div>
            );
        })}
      </div>
    </div>
  );
}
