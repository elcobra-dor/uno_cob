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
  Plus, 
  Trash2, 
  Check, 
  AlertTriangle, 
  Info,
  DollarSign,
  HelpCircle,
  Archive,
  ArrowRight,
  Sparkles,
  Tag
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

  // Dropdown of unique amounts
  const montosUnicos = useMemo(() => {
    const montos = abonos.map(p => p.monto);
    return [...new Set(montos)].sort((a, b) => a - b);
  }, [abonos]);

  // Filtering logic
  const abonosFiltrados = useMemo(() => {
    const buscaNorm = norm(busca);
    return abonos.filter(p => {
      // Estado filter
      if (filtroEstado === 'pendiente' && p.estado === 'confirmado') return false;
      if (filtroEstado === 'confirmado' && p.estado !== 'confirmado') return false;
      if (filtroEstado === 'inter' && !p.ordenante) return false;

      // Monto filter
      if (filtroMonto !== 'todos' && p.monto !== parseFloat(filtroMonto)) return false;

      // Moneda filter
      const pMon = p.moneda === 'USD' ? 'USD' : 'PEN';
      if (filtroMoneda !== 'todos' && pMon !== filtroMoneda) return false;

      // Buscador text filter
      if (buscaNorm) {
        const textToSearch = norm(
          `${p.descripcion} ${p.operacion} ${p.ordenante || ''} ${(p.facturas || []).map(f => `${f.factura} ${f.razon}`).join(' ')}`
        );
        if (!textToSearch.includes(buscaNorm)) return false;
      }

      return true;
    });
  }, [abonos, filtroEstado, filtroMonto, filtroMoneda, busca]);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Total abonos</div>
          <div className="font-mono text-2xl font-bold text-slate-900">{stats.total}</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm border-t-4 border-t-emerald-500">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Confirmados</div>
          <div className="font-mono text-2xl font-bold text-emerald-600">{stats.confirmados}</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm border-t-4 border-t-amber-500">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Pendientes</div>
          <div className="font-mono text-2xl font-bold text-amber-600">{stats.pendientes}</div>
          <div className="text-[11px] text-slate-500 font-mono mt-1 leading-tight">
            S/ {stats.montoPendPEN.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
            {stats.montoPendUSD > 0 && ` · US$ ${stats.montoPendUSD.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm border-t-4 border-t-capeco-blue">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Progreso</div>
          <div className="font-mono text-2xl font-bold text-capeco-blue">{stats.progreso}%</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div 
          className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
          style={{ width: `${stats.progreso}%` }}
        />
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estado</span>
            <select 
              value={filtroEstado} 
              onChange={(e) => setFiltroEstado(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-xl px-3 py-2 focus:outline-none focus:border-capeco-blue focus:bg-white cursor-pointer"
            >
              <option value="todos">Todos</option>
              <option value="pendiente">Pendientes</option>
              <option value="confirmado">Confirmados</option>
              <option value="inter">Interbancarios</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Montos</span>
            <select 
              value={filtroMonto} 
              onChange={(e) => setFiltroMonto(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-xl px-3 py-2 max-w-[180px] focus:outline-none focus:border-capeco-blue focus:bg-white cursor-pointer"
            >
              <option value="todos">Todos los montos</option>
              {montosUnicos.map(m => (
                <option key={m} value={m}>{fmtMonto(m)}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Moneda</span>
            <select 
              value={filtroMoneda} 
              onChange={(e) => setFiltroMoneda(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-xl px-3 py-2 focus:outline-none focus:border-capeco-blue focus:bg-white cursor-pointer"
            >
              <option value="todos">Todas</option>
              <option value="PEN">Soles (S/)</option>
              <option value="USD">Dólares (US$)</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Buscar</span>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar concepto, OP, empresa o monto..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-sans text-xs text-slate-800 placeholder-slate-400 w-full sm:w-64 focus:outline-none focus:border-capeco-blue focus:bg-white transition-all"
            />
          </div>
        </div>
      </div>

      {/* Count Label */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">
          {abonosFiltrados.length} abono{abonosFiltrados.length !== 1 ? 's' : ''} mostrado{abonosFiltrados.length !== 1 ? 's' : ''}
        </h3>
      </div>

      {/* List */}
      <div className="space-y-4">
        {abonosFiltrados.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center flex flex-col items-center justify-center">
            <Search className="w-10 h-10 text-slate-300 mb-3" />
            <div className="text-sm font-semibold text-slate-700">Sin resultados</div>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Prueba a cambiar tus filtros de estado, moneda o la palabra de búsqueda.
            </p>
          </div>
        ) : (
          abonosFiltrados.map((p) => {
            const isConfirmed = p.estado === 'confirmado';
            const isSuggested = p.estado === 'sugerida';
            const isManual = p.estado === 'manual';

            // Card border classes
            let cardClass = 'border-l-slate-300';
            let badgeClass = 'bg-slate-100 text-slate-500';
            let badgeLabel = 'SIN ASIGNAR';

            if (isConfirmed) {
              cardClass = 'border-l-emerald-500';
              badgeClass = 'bg-emerald-50 text-emerald-700 border border-emerald-100';
              badgeLabel = 'CONFIRMADO';
            } else if (isManual) {
              cardClass = 'border-l-blue-500';
              badgeClass = 'bg-blue-50 text-capeco-blue border border-blue-100';
              badgeLabel = 'MANUAL';
            } else if (isSuggested) {
              if (p.confianza === 'alta') {
                cardClass = 'border-l-emerald-500';
                badgeClass = 'bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold';
                badgeLabel = 'SUGERIDO ✓';
              } else {
                cardClass = 'border-l-amber-500';
                badgeClass = 'bg-amber-50 text-amber-700 border border-amber-100';
                badgeLabel = 'SUGERIDO ~';
              }
            }

            const pMoneda = p.moneda === 'USD' ? 'USD' : 'PEN';
            const esBN = esAbonoDetraccionBN(p);
            const esNoOperativo = p.facturas?.[0]?.factura === 'NO_OPERATIVO';

            // --- CEREBRO PREDICTIVO: FRANCOTIRADOR + ORDENAMIENTO ---
            const CUOTAS_ESTANDAR = [1980, 1270, 910, 530, 500, 410, 860];
            const esPagoEstandar = CUOTAS_ESTANDAR.includes(p.monto);

            const facturasOpciones = facturas
              .filter(f => {
                if (f.saldo <= 0.01) return false;
                const mismaMoneda = (f.moneda === 'USD' ? 'USD' : 'PEN') === pMoneda;
                const excepcionDetraccion = esBN && f.moneda === 'USD' && requiereDetraccionPEN(f);
                if (!mismaMoneda && !excepcionDetraccion) return false;

                // Capa 1: Filtro Francotirador (Si el abono es cuota estándar, ocultamos las demás)
                if (esPagoEstandar && f.saldo !== p.monto) {
                  return false;
                }
                
                return true;
              })
              .sort((a, b) => {
                // Capa 3: Ordenamiento en Cascada
                // 1. Alfabético por Razón Social
                const ordenNombre = (a.razon_social || '').localeCompare(b.razon_social || '');
                if (ordenNombre !== 0) return ordenNombre;

                // 2. Cronológico (Deuda más antigua primero)
                const fechaA = new Date(a.fecha_doc || 0).getTime();
                const fechaB = new Date(b.fecha_doc || 0).getTime();
                if (fechaA !== fechaB) return fechaA - fechaB;

                // 3. Correlativo
                return (a.factura || '').localeCompare(b.factura || '');
              });

            // Find selected invoice in state for detracción warning
            const facturaElegida = p.facturas?.length > 0 
              ? facturas.find(f => f.factura === p.facturas[0].factura)
              : undefined;

            const necesitaAceptarDetraccion = esBN && facturaElegida && requiereDetraccionPEN(facturaElegida) && 
              parseFloat(String(p.monto)) !== parseFloat(String(facturaElegida.saldo_original || facturaElegida.saldo));

            const hayAsignacion = p.facturas?.some(f => f.factura);
            const habilitarConfirmar = hayAsignacion && (!necesitaAceptarDetraccion || p.detraccionAceptada);

            return (
              <div 
                key={p.id}
                className={`bg-white rounded-2xl border border-slate-200 p-5 shadow-sm border-l-4 transition-all hover:shadow-md ${cardClass}`}
              >
                {/* Header Information */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate leading-snug" title={p.descripcion}>
                      {p.descripcion || '(Sin descripción)'}
                    </div>
                    {p.ordenante && (
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 mt-1 rounded bg-blue-50 text-[10px] font-semibold text-capeco-blue font-mono">
                        <span>↳ Ordenante: {p.ordenante}</span>
                      </div>
                    )}
                    <div className="text-[10px] font-mono text-slate-400 mt-1 leading-normal">
                      {p.fecha} · OP {p.operacion}
                      {p.referencia2 && p.referencia2 !== 'Referencia Beneficiari' && p.referencia2.length > 3 && ` · Ref: ${p.referencia2}`}
                    </div>
                  </div>

                  <div className="text-left sm:text-right flex-shrink-0 flex sm:flex-col items-start sm:items-end justify-between sm:justify-start gap-2">
                    <div className="font-mono text-lg font-bold text-slate-900 flex items-center gap-1.5 leading-none">
                      {fmtMonto(p.monto, p.moneda)}
                      {pMoneda === 'USD' && (
                        <span className="text-[9px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-mono font-semibold border border-purple-100">
                          USD
                        </span>
                      )}
                    </div>
                    <span className={`text-[9px] font-mono font-bold tracking-wider px-2 py-0.5 rounded ${badgeClass}`}>
                      {badgeLabel}
                    </span>
                  </div>
                </div>

                {/* Sub-Rows - Invoices */}
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  {esNoOperativo ? (
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-semibold text-slate-600 flex items-center gap-2">
                      <Archive className="w-4 h-4 text-slate-400" />
                      <span>Clasificado como No Operativo (Ingreso): </span>
                      <span className="text-slate-950 font-mono italic">{p.facturas[0].razon}</span>
                    </div>
                  ) : (
                    p.facturas.map((item, idx) => {
                      return (
                        <div key={idx} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                          <select
                            value={item.factura}
                            onChange={(e) => onCambiarLinea(p.id, idx, e.target.value)}
                            disabled={isConfirmed}
                            className="flex-1 bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 rounded-xl px-3 py-2.5 focus:outline-none focus:border-capeco-blue focus:bg-white cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed max-w-full"
                          >
                            <option value="">— Seleccionar factura —</option>
                            {facturasOpciones.map(f => {
                              const esExcepcion = esBN && f.moneda === 'USD' && requiereDetraccionPEN(f);
                              const esDetNormal = !esExcepcion && requiereDetraccionPEN(f);
                              const marca = esExcepcion ? '⚠ ' : (esDetNormal ? '🧾 ' : '');
                              const originalMonto = f.saldo_original !== undefined ? f.saldo_original : f.saldo;
                              let labelMonto = fmtMonto(originalMonto, f.moneda);
                              
                              if (f.saldo < originalMonto && f.saldo > 0 && f.factura !== item.factura) {
                                labelMonto += ` (Resta ${fmtMonto(f.saldo, f.moneda)})`;
                              }

                              // Capa 2: Traductor de fecha a Etiqueta de Mes
                              let etiquetaMes = '';
                              if (f.fecha_doc) {
                                const partes = f.fecha_doc.split('-');
                                if (partes.length >= 2) {
                                  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                                  etiquetaMes = `[${meses[parseInt(partes[1]) - 1]}-${partes[0]}] `;
                                }
                              }

                              return (
                                <option key={f.factura} value={f.factura}>
                                  {etiquetaMes}{marca}{f.razon_social.slice(0, 32)} — {f.factura} — {labelMonto}
                                </option>
                              );
                            })}
                          </select>

                          {!isConfirmed && (
                            <button
                              onClick={() => onQuitarLinea(p.id, idx)}
                              className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-100 hover:bg-red-50 active:transform active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                              title="Remover factura de este abono"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Detracción SUNAT Warning checkbox */}
                {necesitaAceptarDetraccion && !isConfirmed && (
                  <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-3.5 mt-3 flex items-start gap-3">
                    <input
                      type="checkbox"
                      id={`detraccion-${p.id}`}
                      checked={p.detraccionAceptada || false}
                      onChange={(e) => onToggleDetraccion(p.id, e.target.checked)}
                      className="mt-0.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer w-4 h-4"
                    />
                    <label htmlFor={`detraccion-${p.id}`} className="text-[11px] font-medium text-amber-800 leading-normal select-none cursor-pointer">
                      <strong>🧾 Conciliación de Detracción SUNAT:</strong> El monto del abono no coincide exactamente con el saldo total. Esto es normal en detracciones (10-12% + redondeos o TC). Activa esta casilla para validar y habilitar la confirmación.
                    </label>
                  </div>
                )}

                {/* Bottom Actions */}
                <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-slate-100">
                  {!isConfirmed && !esNoOperativo && (
                    <button
                      onClick={() => onAgregarLinea(p.id)}
                      className="px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:text-slate-800 hover:border-slate-500 font-mono text-[11px] font-medium transition-all cursor-pointer"
                    >
                      + Agregar factura
                    </button>
                  )}

                  {!isConfirmed && !hayAsignacion && (
                    <button
                      onClick={() => onArchivar(p.id)}
                      className="px-3 py-1.5 rounded-lg border border-dashed border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 font-mono text-[11px] font-medium transition-all cursor-pointer"
                    >
                      🗂️ Otros Ingresos
                    </button>
                  )}

                  {!isConfirmed && hayAsignacion && (
                    <button
                      onClick={() => onConfirmar(p.id)}
                      disabled={!habilitarConfirmar}
                      className={`px-4 py-1.5 rounded-lg font-mono text-[11px] font-semibold tracking-wide flex items-center gap-1 transition-all cursor-pointer ${
                        habilitarConfirmar 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-500 hover:text-white hover:border-emerald-500' 
                          : 'bg-slate-50 text-slate-300 border border-slate-200 cursor-not-allowed opacity-50'
                      }`}
                      title={!habilitarConfirmar ? "Debes marcar el check de detracción o rellenar una factura válida" : "Confirmar conciliación"}
                    >
                      <Check className="w-3.5 h-3.5" />
                      Confirmar
                    </button>
                  )}

                  {hayAsignacion && (
                    <button
                      onClick={() => onQuitar(p.id)}
                      className="px-4 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 font-mono text-[11px] font-medium transition-all cursor-pointer"
                    >
                      ✕ Quitar Asignación
                    </button>
                  )}

                  <button
                    onClick={() => onEliminar(p.id)}
                    className="ml-auto p-1.5 rounded-lg border border-slate-150 text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-all cursor-pointer"
                    title="Eliminar abono permanentemente"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {p.motivo && !isConfirmed && (
                  <div className="mt-3 bg-blue-50/50 border border-blue-100 rounded-xl px-3 py-2 text-[10px] font-mono text-capeco-blue flex items-center gap-1.5 leading-none">
                    <Sparkles className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    <span>Sugerencia: {p.motivo}</span>
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
