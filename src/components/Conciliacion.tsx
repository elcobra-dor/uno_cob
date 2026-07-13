import React, { useState, useMemo } from 'react';
import { Abono, Factura } from '../types';
import { 
  fmtMonto, 
  requiereDetraccionPEN, 
  esAbonoDetraccionBN,
  norm 
} from '../lib/businessUtils';
import { 
  Search, 
  Trash2, 
  Check, 
  Archive, 
  Sparkles
} from 'lucide-react';

interface ConciliacionProps {
  abonos: Abono[];
  facturas: Factura[];
  onConfirmar: (id: number) => Promise<void>;
  onQuitar: (id: number) => Promise<void>;
  onArchivar: (id: number) => Promise<void>;
  onEliminar: (id: number) => Promise<void>;
  onAgregarLinea: (id: number) => void;
  onQuitarLinea: (id: number, idx: number) => void;
  onCambiarLinea: (id: number, idx: number, val: string) => void;
  onToggleDetraccion: (id: number, checked: boolean) => void;
  stats: {
    total: number;
    confirmados: number;
    pendientes: number;
    progreso: number;
    montoPendPEN: number;
    montoPendUSD: number;
  };
}

export default function Conciliacion({
  abonos,
  facturas,
  onConfirmar,
  onQuitar,
  onArchivar,
  onEliminar,
  onAgregarLinea,
  onQuitarLinea,
  onCambiarLinea,
  onToggleDetraccion,
  stats
}: ConciliacionProps) {
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'pendiente' | 'confirmado' | 'inter'>('pendiente');
  const [filtroMonto, setFiltroMonto] = useState<string>('todos');
  const [filtroMoneda, setFiltroMoneda] = useState<string>('todos');
  const [busca, setBusca] = useState<string>('');
  
  // ESTADO PARA EL MODO FLEXIBLE
  const [verTodas, setVerTodas] = useState(false);

  const montosUnicos = useMemo(() => {
    const montos = abonos.map(p => p.monto);
    return [...new Set(montos)].sort((a, b) => a - b);
  }, [abonos]);

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
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm"><div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Total abonos</div><div className="font-mono text-2xl font-bold text-slate-900">{stats.total}</div></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm border-t-4 border-t-emerald-500"><div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Confirmados</div><div className="font-mono text-2xl font-bold text-emerald-600">{stats.confirmados}</div></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm border-t-4 border-t-amber-500"><div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Pendientes</div><div className="font-mono text-2xl font-bold text-amber-600">{stats.pendientes}</div><div className="text-[11px] text-slate-500 font-mono mt-1 leading-tight">S/ {stats.montoPendPEN.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</div></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm border-t-4 border-t-capeco-blue"><div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Progreso</div><div className="font-mono text-2xl font-bold text-capeco-blue">{stats.progreso}%</div></div>
      </div>

      {/* Toolbar con BOTÓN DE VISTA FLEXIBLE */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Modo Vista</span>
            <button 
                onClick={() => setVerTodas(!verTodas)}
                className={`px-3 py-2 text-[11px] font-bold rounded-xl border transition-all ${verTodas ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-capeco-blue border-capeco-blue text-white'}`}
            >
                {verTodas ? '🔍 Ver Todas (Sin Filtro)' : '🎯 Francotirador Activo'}
            </button>
          </div>
          {/* (Mantén tus otros Selects de estado, monto y moneda aquí...) */}
        </div>
      </div>

      <div className="space-y-4">
        {abonosFiltrados.map((p) => {
            const isConfirmed = p.estado === 'confirmado';
            const pMoneda = p.moneda === 'USD' ? 'USD' : 'PEN';
            const esBN = esAbonoDetraccionBN(p);
            
            // LÓGICA DE FILTRADO CON MODO FLEXIBLE
            const CUOTAS_ESTANDAR = [1980, 1270, 910, 530, 500, 410, 860];
            const esPagoEstandar = CUOTAS_ESTANDAR.includes(p.monto);

            const facturasOpciones = facturas
              .filter(f => {
                if (f.saldo <= 0.01) return false;
                const mismaMoneda = (f.moneda === 'USD' ? 'USD' : 'PEN') === pMoneda;
                const excepcionDetraccion = esBN && f.moneda === 'USD' && requiereDetraccionPEN(f);
                if (!mismaMoneda && !excepcionDetraccion) return false;

                // Solo filtramos si el modo Francotirador está activo
                if (!verTodas && esPagoEstandar && f.saldo !== p.monto) return false;
                
                return true;
              })
              .sort((a, b) => {
                const ordenNombre = (a.razon_social || '').localeCompare(b.razon_social || '');
                if (ordenNombre !== 0) return ordenNombre;
                const fechaA = new Date(a.fecha_doc || 0).getTime();
                const fechaB = new Date(b.fecha_doc || 0).getTime();
                return fechaA - fechaB;
              });

            // ... (El resto de tu renderizado, el return con el JSX de la tarjeta, los selectores, etc.)
            // Asegúrate de copiar desde el return original de tu archivo lo que sigue aquí abajo...
            
            return (
              <div key={p.id}>
                 {/* ... (Tu contenido anterior de la tarjeta) */}
              </div>
            );
        })}
      </div>
    </div>
  );
}
