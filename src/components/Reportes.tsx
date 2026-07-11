import React, { useMemo } from 'react';
import { Factura, Abono } from '../types';
import { diasHasta, requiereDetraccionPEN, fmtMonto } from '../lib/businessUtils';
import { 
  AlertTriangle, 
  TrendingUp, 
  CheckCircle, 
  Users, 
  HelpCircle, 
  Wallet,
  Activity,
  Award
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

interface ReportesProps {
  facturas: Factura[];
  abonos: Abono[];
}

export default function Reportes({ facturas, abonos }: ReportesProps) {
  
  // 1. LÓGICA: ALERTA PREVENTIVA (3+ FACTURAS VENCIDAS)
  const asociadosEnRiesgo = useMemo(() => {
    const deudasPorCliente: { [key: string]: { cantidad: number; totalSaldoPEN: number; totalSaldoUSD: number; ruc: string } } = {};
    
    facturas.forEach(f => {
      const dias = diasHasta(f.fecha_ven);
      if (f.saldo > 0.01 && dias !== null && dias < 0) {
        if (!deudasPorCliente[f.razon_social]) {
          deudasPorCliente[f.razon_social] = { cantidad: 0, totalSaldoPEN: 0, totalSaldoUSD: 0, ruc: f.ruc || '' };
        }
        deudasPorCliente[f.razon_social].cantidad++;
        if (f.moneda === 'USD') {
          deudasPorCliente[f.razon_social].totalSaldoUSD += f.saldo;
        } else {
          deudasPorCliente[f.razon_social].totalSaldoPEN += f.saldo;
        }
      }
    });

    return Object.keys(deudasPorCliente)
      .map(key => ({ razon_social: key, ...deudasPorCliente[key] }))
      .filter(a => a.cantidad >= 3)
      .sort((a, b) => b.cantidad - a.cantidad);
  }, [facturas]);

  // 1b. ALERTA: facturas F201/F301 >S/700 registradas en USD
  const inconsistentesDetraccion = useMemo(() => {
    return facturas.filter(f => f.saldo > 0.01 && f.moneda === 'USD' && requiereDetraccionPEN(f));
  }, [facturas]);

  // 2. LÓGICA: REPORTE DE INGRESOS POR RUBRO (SEGÚN GLOSA BANCARIA)
  const rubrosData = useMemo(() => {
    const rubros = {
      'Cuotas Institucionales / Membresías': { PEN: 0, USD: 0 },
      'Certificaciones y Constancias': { PEN: 0, USD: 0 },
      'Capacitaciones, Cursos y Eventos': { PEN: 0, USD: 0 },
      'Otros Ingresos por Identificar': { PEN: 0, USD: 0 }
    };

    let totalPEN = 0;
    let totalUSD = 0;

    abonos.forEach(p => {
      if (p.estado === 'confirmado' && p.monto > 0) {
        const glosa = (p.descripcion || '').toUpperCase();
        const mon = p.moneda === 'USD' ? 'USD' : 'PEN';
        const monto = parseFloat(String(p.monto));
        
        if (mon === 'USD') totalUSD += monto;
        else totalPEN += monto;

        let key: keyof typeof rubros;
        if (glosa.includes('CUOTA') || glosa.includes('MEMBRE') || glosa.includes('APORTE') || glosa.includes('ASOC')) {
          key = 'Cuotas Institucionales / Membresías';
        } else if (glosa.includes('CERTIF') || glosa.includes('CONSTANC') || glosa.includes('DERECHO') || glosa.includes('TASA')) {
          key = 'Certificaciones y Constancias';
        } else if (glosa.includes('CURSO') || glosa.includes('CAPACIT') || glosa.includes('SEMINARIO') || glosa.includes('FORO') || glosa.includes('CONGRE')) {
          key = 'Capacitaciones, Cursos y Eventos';
        } else {
          key = 'Otros Ingresos por Identificar';
        }
        rubros[key][mon] += monto;
      }
    });

    // Formatting for charts
    const chartPEN = Object.keys(rubros).map(key => {
      const name = key;
      const val = rubros[key as keyof typeof rubros].PEN;
      const pct = totalPEN > 0 ? Math.round((val / totalPEN) * 100) : 0;
      return { name, value: val, percentage: pct };
    });

    const chartUSD = Object.keys(rubros).map(key => {
      const name = key;
      const val = rubros[key as keyof typeof rubros].USD;
      const pct = totalUSD > 0 ? Math.round((val / totalUSD) * 100) : 0;
      return { name, value: val, percentage: pct };
    });

    return {
      rubrosRaw: rubros,
      totalPEN,
      totalUSD,
      chartPEN,
      chartUSD
    };
  }, [abonos]);

  const COLORS = ['#004b93', '#10b981', '#f59e0b', '#64748b'];

  return (
    <div className="space-y-6">
      
      {/* Risk Alert & Income Rows */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        
        {/* Alerta Preventiva de Suspensión (3+ Facturas Vencidas) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm border-t-4 border-t-red-500">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2 bg-red-50 text-red-500 rounded-xl">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Alerta Preventiva de Suspensión</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Empresas asociadas con 3 o más facturas/cuotas vencidas actualmente.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            {asociadosEnRiesgo.length === 0 ? (
              <div className="p-10 text-center text-slate-400">
                <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <div className="text-xs font-semibold text-slate-700">Sin asociados en riesgo</div>
                <p className="text-[11px] text-slate-400 mt-0.5">Todos los asociados se encuentran al día o con deudas mínimas.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-150">
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Asociado</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono text-center">Docs Vencidos</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono text-right">Total Pendiente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {asociadosEnRiesgo.map((a, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 max-w-[180px] truncate">
                        <div className="font-semibold text-slate-900 leading-tight truncate">{a.razon_social}</div>
                        <div className="text-[9px] text-slate-400 font-mono mt-0.5">RUC: {a.ruc}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-600 border border-red-100">
                          {a.cantidad} cuotas
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-red-600">
                        {a.totalSaldoPEN > 0 && fmtMonto(a.totalSaldoPEN, 'PEN')}
                        {a.totalSaldoUSD > 0 && (
                          <>
                            {a.totalSaldoPEN > 0 && <br />}
                            {fmtMonto(a.totalSaldoUSD, 'USD')}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Recaudación de Ingresos por Rubro */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm border-t-4 border-t-emerald-500">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2 bg-emerald-50 text-emerald-500 rounded-xl">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Recaudación de Ingresos por Rubro</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Análisis de los abonos conciliados de acuerdo a la glosa bancaria.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Chart Container Soles */}
            {rubrosData.totalPEN > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-700 font-mono flex justify-between">
                  <span>Soles (S/.)</span>
                  <span className="text-emerald-600">{fmtMonto(rubrosData.totalPEN, 'PEN')}</span>
                </div>
                <div className="h-[180px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={rubrosData.chartPEN}
                      margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 8 }} interval={0} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 9 }} stroke="#94a3b8" />
                      <Tooltip 
                        contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                        formatter={(value) => [`S/. ${Number(value).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`, 'Recaudado']}
                      />
                      <Bar dataKey="value" fill="#004b93" radius={[4, 4, 0, 0]}>
                        {rubrosData.chartPEN.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Chart Container USD */}
            {rubrosData.totalUSD > 0 && (
              <div className="space-y-2 pt-3 border-t border-slate-100">
                <div className="text-xs font-semibold text-slate-700 font-mono flex justify-between">
                  <span>Dólares (US$)</span>
                  <span className="text-emerald-600">{fmtMonto(rubrosData.totalUSD, 'USD')}</span>
                </div>
                <div className="h-[180px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={rubrosData.chartUSD}
                      margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 8 }} interval={0} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 9 }} stroke="#94a3b8" />
                      <Tooltip 
                        contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                        formatter={(value) => [`US$ ${Number(value).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`, 'Recaudado']}
                      />
                      <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]}>
                        {rubrosData.chartUSD.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {rubrosData.totalPEN === 0 && rubrosData.totalUSD === 0 && (
              <div className="p-10 text-center text-slate-400">
                <Wallet className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <div className="text-xs font-semibold text-slate-700">Sin recaudaciones registradas</div>
                <p className="text-[11px] text-slate-400 mt-0.5">Inicia conciliaciones confirmadas de abonos para nutrir este reporte en tiempo real.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Inconsistent Currency Warnings */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm border-t-4 border-t-amber-500">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 bg-amber-50 text-amber-500 rounded-xl">
            <AlertTriangle className="w-5 h-5 animate-bounce-slow" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">⚠️ Inconsistencias de Detracciones F201/F301</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Facturas de serie F201/F301 registradas con moneda Dólares (USD) superando el umbral. El Banco de la Nación de Perú no permite registrar o cancelar detracciones en dólares.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          {inconsistentesDetraccion.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs">
              💚 No se encontraron facturas con inconsistencias de detracción SUNAT.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-150">
                  <th className="px-4 py-2.5 font-semibold text-slate-500">Factura</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-500">Empresa / Asociado</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-500 text-right">Saldo (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inconsistentesDetraccion.map((f, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-2.5 font-mono font-bold text-amber-700">{f.factura}</td>
                    <td className="px-4 py-2.5 truncate max-w-[250px]">{f.razon_social}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">{fmtMonto(f.saldo, 'USD')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
