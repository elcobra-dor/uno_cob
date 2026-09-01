import React, { useMemo, useState } from 'react';
import { VentaCulqi, Factura, LoteCulqi, CandidatoLoteCulqi } from '../types';
import { fmtMonto } from '../lib/businessUtils';
import { CreditCard, Layers, Check, Sparkles, Package } from 'lucide-react';

interface ConciliacionCulqiProps {
  ventasCulqi: VentaCulqi[];
  facturas: Factura[];
  lotesCulqi: LoteCulqi[];
  candidatosLote: CandidatoLoteCulqi[];
  onAsignarFactura: (id_transaccion: string, factura: string) => Promise<void>;
  onCrearLote: (candidato: CandidatoLoteCulqi) => Promise<void>;
}

export default function ConciliacionCulqi({
  ventasCulqi,
  facturas,
  lotesCulqi,
  candidatosLote,
  onAsignarFactura,
  onCrearLote
}: ConciliacionCulqiProps) {
  const [tab, setTab] = useState<'match' | 'lotes'>('match');

  const facturasOrdenadas = useMemo(
    () => facturas.filter(f => f.saldo > 0.01).sort((a, b) => (a.razon_social || '').localeCompare(b.razon_social || '')),
    [facturas]
  );

  // Solo 'aprobada' y 'abonada' son candidatas a conciliar; 'rechazada' se descarta
  const ventasElegibles = useMemo(
    () => ventasCulqi.filter(v => v.estado === 'aprobada' || v.estado === 'abonada'),
    [ventasCulqi]
  );

  const pendientes = ventasElegibles.filter(v => v.estadoMatch !== 'confirmado');
  const confirmadas = ventasElegibles.filter(v => v.estadoMatch === 'confirmado');
  const sinLote = confirmadas.filter(v => !v.lote_culqi);

  const candidatosConMonto = candidatosLote.filter(c => c.ventas.length > 0);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Ventas sin factura</div>
          <div className="font-mono text-2xl font-bold text-amber-600">{pendientes.length}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Conciliadas, sin lote</div>
          <div className="font-mono text-2xl font-bold text-[#7A1B29]">{sinLote.length}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Lotes creados</div>
          <div className="font-mono text-2xl font-bold text-emerald-600">{lotesCulqi.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setTab('match')}
          className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
            tab === 'match' ? 'border-[#7A1B29] text-[#7A1B29]' : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Venta ↔ Factura ({pendientes.length})
        </button>
        <button
          onClick={() => setTab('lotes')}
          className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
            tab === 'lotes' ? 'border-[#7A1B29] text-[#7A1B29]' : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Lotes ({candidatosConMonto.length} sugeridos)
        </button>
      </div>

      {tab === 'match' && (
        <div className="space-y-3">
          {pendientes.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-400">
              No hay ventas pendientes de vincular con una factura.
            </div>
          ) : (
            pendientes.map(v => {
              // 🎯 LÓGICA FRANCOTIRADOR: Filtrar facturas que coinciden exactamente con el importe (tolerancia de 5 céntimos)
              const facturasFrancotirador = facturasOrdenadas.filter(
                f => Math.abs(f.saldo - v.venta_final) <= 0.05
              );

              return (
                <div key={v.id_transaccion} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col sm:flex-row gap-3 sm:items-center hover:border-emerald-100 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{v.descripcion || '(Sin descripción)'}</div>
                    <div className="text-[10px] font-mono text-slate-400 mt-1">
                      {v.fecha} · {v.nombres} {v.apellidos} · {v.id_transaccion}
                      <span className={`ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold ${v.estado === 'abonada' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {v.estado.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div className="font-mono text-sm font-bold text-slate-900 whitespace-nowrap">
                    {fmtMonto(v.venta_final, 'PEN')}
                  </div>
                  <select
                    value={v.factura || ''}
                    onChange={(e) => onAsignarFactura(v.id_transaccion, e.target.value)}
                    className={`border text-xs font-medium rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#7A1B29] cursor-pointer max-w-full sm:max-w-xs transition-colors ${
                      facturasFrancotirador.length > 0 
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                        : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  >
                    <option value="">
                      {facturasFrancotirador.length === 0 
                        ? '⚠️ Sin match exacto (Ver todas)' 
                        : '🎯 Seleccionar match exacto'}
                    </option>
                    
                    {/* Si el francotirador encuentra match, SOLO muestra esas para no saturar. 
                        Si no encuentra nada, muestra todas por si hay que hacer un abono parcial. */}
                    {facturasFrancotirador.length > 0 
                      ? facturasFrancotirador.map(f => (
                          <option key={f.factura} value={f.factura}>
                            {(f.razon_social || '').slice(0, 32)} — {f.factura} — {fmtMonto(f.saldo, f.moneda)}
                          </option>
                        ))
                      : facturasOrdenadas.map(f => (
                          <option key={f.factura} value={f.factura}>
                            {(f.razon_social || '').slice(0, 32)} — {f.factura} — {fmtMonto(f.saldo, f.moneda)}
                          </option>
                        ))
                    }
                  </select>
                </div>
              );
            })
          )}

          {confirmadas.length > 0 && (
            <div className="pt-2">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Ya vinculadas</h4>
              {confirmadas.map(v => (
                <div key={v.id_transaccion} className="flex items-center gap-3 px-4 py-2.5 bg-emerald-50/40 border border-emerald-100 rounded-xl mb-1.5 text-xs">
                  <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  <span className="flex-1 truncate text-slate-700">{v.descripcion}</span>
                  <span className="font-mono text-slate-500">{v.factura}</span>
                  <span className="font-mono font-semibold text-slate-900">{fmtMonto(v.venta_final, 'PEN')}</span>
                  {v.lote_culqi && (
                    <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 text-[9px] font-bold font-mono">{v.lote_culqi}</span>
                  )}
                  <button
                    onClick={() => onAsignarFactura(v.id_transaccion, '')}
                    className="text-slate-300 hover:text-red-500 transition-all cursor-pointer"
                    title="Quitar vínculo"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'lotes' && (
        <div className="space-y-6">
          <div>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              Candidatos sugeridos (ventas agrupadas por día de transacción)
            </h4>
            {candidatosConMonto.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-400">
                No hay ventas conciliadas pendientes de agrupar en un lote.
              </div>
            ) : (
              <div className="space-y-3">
                {candidatosConMonto.map(c => (
                  <div key={c.fechaVenta} className={`bg-white rounded-2xl border p-4 shadow-sm ${c.abonoBanco ? 'border-emerald-200' : 'border-slate-200'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <div>
                        <div className="text-xs font-bold text-slate-800 font-mono">Ventas del {c.fechaVenta}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{c.ventas.length} venta(s) · Suma S/ {c.montoTotal.toFixed(2)}</div>
                      </div>
                      {c.abonoBanco ? (
                        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 text-[11px]">
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="font-semibold text-emerald-700">Match con banco: OP {c.abonoBanco.operacion} — {c.abonoBanco.fecha} — {fmtMonto(c.abonoBanco.monto, c.abonoBanco.moneda)}</span>
                        </div>
                      ) : (
                        <div className="text-[11px] text-amber-600 font-medium">Sin depósito bancario identificado aún (puede liquidar más adelante)</div>
                      )}
                      <button
                        onClick={() => onCrearLote(c)}
                        className="px-4 py-2 rounded-xl bg-[#7A1B29] text-white text-[11px] font-semibold hover:bg-[#5a141e] transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        Crear Lote
                      </button>
                    </div>
                    <div className="space-y-1">
                      {c.ventas.map(v => (
                        <div key={v.id_transaccion} className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
                          <span className="flex-1 truncate">{v.descripcion} — {v.factura}</span>
                          <span>{fmtMonto(v.monto_abono, 'PEN')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" />
              Lotes ya creados
            </h4>
            {lotesCulqi.length === 0 ? (
              <div className="text-xs text-slate-400 px-1">Aún no se ha creado ningún lote.</div>
            ) : (
              <div className="space-y-1.5">
                {lotesCulqi
                  .slice()
                  .sort((a, b) => b.correlativo.localeCompare(a.correlativo))
                  .map(l => (
                    <div key={l.correlativo} className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border border-slate-150 rounded-xl text-xs">
                      <CreditCard className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span className="font-mono font-bold text-slate-800">{l.correlativo}</span>
                      <span className="flex-1 text-slate-500">{l.cantidad_ventas} venta(s)</span>
                      <span className="font-mono font-semibold text-slate-900">S/ {l.monto_total.toFixed(2)}</span>
                      {l.operacion_banco ? (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[9px] font-bold">OP {l.operacion_banco}</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[9px] font-bold">SIN VINCULAR</span>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
