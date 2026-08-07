import React, { useMemo, useState } from 'react';

interface FilaComercial {
  proceso: string;
  gg: string;
  rubro: string;
  ano_emision: number;
  ano_pago: number;
  mes_pago: string;
  compromiso_s: number;
  amortizacion_s: number;
  saldo_s: number;
  importe_bruto: number;
}

interface ReportesProps {
  facturas: any[];
  abonos: any[];
  datosComerciales?: FilaComercial[];
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function Reportes({ datosComerciales = [] }: ReportesProps) {
  const [filtroAnoPago, setFiltroAnoPago] = useState<number>(2026);
  
  // =========================================================
  // MODELO 1: RESUMEN MACRO (Facturación vs Cobranza vs CxC)
  // =========================================================
  const reporteMacro = useMemo(() => {
    const agrupado: { [ano: number]: { facturacion: number, cobranza: number, cxc: number } } = {};
    
    datosComerciales.forEach(row => {
      const ano = row.ano_emision;
      if (!ano) return;
      if (!agrupado[ano]) agrupado[ano] = { facturacion: 0, cobranza: 0, cxc: 0 };
      
      agrupado[ano].facturacion += (row.compromiso_s || 0);
      agrupado[ano].cobranza += Math.abs(row.amortizacion_s || 0);
      agrupado[ano].cxc += (row.saldo_s || 0);
    });

    return Object.entries(agrupado)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([ano, totales]) => ({ ano, ...totales }));
  }, [datosComerciales]);

  // =========================================================
  // MODELO 2: MATRIZ DE COBRANZA POR RUBRO
  // =========================================================
  const matrizCobranza = useMemo(() => {
    const dataFiltrada = datosComerciales.filter(r => 
      r.proceso === 'Cobranza' && r.ano_pago === filtroAnoPago
    );

    const matriz: { [rubro: string]: { [mes: string]: number, total: number } } = {};
    const totalesMes: { [mes: string]: number } = {};
    let granTotal = 0;

    dataFiltrada.forEach(row => {
      const rubro = row.rubro || 'Sin Rubro';
      const mes = row.mes_pago;
      const monto = Math.abs(row.importe_bruto || 0);

      if (!matriz[rubro]) matriz[rubro] = { total: 0 };
      
      matriz[rubro][mes] = (matriz[rubro][mes] || 0) + monto;
      matriz[rubro].total += monto;
      
      totalesMes[mes] = (totalesMes[mes] || 0) + monto;
      granTotal += monto;
    });

    return { matriz, totalesMes, granTotal };
  }, [datosComerciales, filtroAnoPago]);

  const fmtM = (num: number) => (num / 1000000).toFixed(1) + 'Mllns';
  const fmtK = (num: number) => (num / 1000).toFixed(0) + 'K';
  const fmtComas = (num: number) => Math.round(num).toLocaleString('en-US');

  return (
    <div className="space-y-8 font-sans">
      
      {/* --- RENDER: MODELO 1 MACRO --- */}
      <div className="max-w-xl bg-white shadow-sm border border-slate-300">
        <table className="w-full text-center text-sm border-collapse">
          <thead>
            <tr className="bg-[#b90000] text-white font-bold text-base">
              <th className="py-2 px-4 border border-slate-400">Año de Emision</th>
              <th className="py-2 px-4 border border-slate-400">Facturacion</th>
              <th className="py-2 px-4 border border-slate-400">Cobranza</th>
              <th className="py-2 px-4 border border-slate-400 bg-[#990000]">CxC</th>
            </tr>
          </thead>
          <tbody>
            {reporteMacro.map((row, idx) => (
              <tr key={row.ano} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <td className="py-2 px-4 border border-slate-300 font-bold text-lg">{row.ano}</td>
                <td className="py-2 px-4 border border-slate-300 text-lg">{fmtM(row.facturacion)}</td>
                <td className="py-2 px-4 border border-slate-300 text-lg">{fmtM(row.cobranza)}</td>
                <td className="py-2 px-4 border border-slate-300 font-bold text-lg">{fmtK(row.cxc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <hr className="border-slate-300" />

      {/* --- RENDER: MODELO 2 MATRIZ COBRANZA --- */}
      <div className="bg-white shadow-sm border border-slate-300 overflow-x-auto">
        <div className="p-4 bg-slate-100 border-b border-slate-300 flex items-center gap-4">
          <label className="text-sm font-semibold text-slate-700">Año de pago:</label>
          <select 
            value={filtroAnoPago} 
            onChange={(e) => setFiltroAnoPago(Number(e.target.value))}
            className="border border-slate-300 rounded p-1 text-sm bg-white"
          >
            <option value={2025}>2025</option>
            <option value={2026}>2026</option>
          </select>
          <span className="text-sm font-semibold ml-4 text-slate-700">Proceso: <span className="font-bold">Cobranza</span></span>
        </div>

        <table className="w-full text-right text-xs border-collapse">
          <thead>
            <tr className="bg-[#b90000] text-white font-bold">
              <th className="py-2 px-3 border border-slate-400 text-left">Rubro</th>
              {MESES.slice(0, 6).map(mes => (
                <th key={mes} className="py-2 px-3 border border-slate-400">{mes}</th>
              ))}
              <th className="py-2 px-3 border border-slate-400">Total general</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(matrizCobranza.matriz)
              .sort(([rubroA], [rubroB]) => rubroA.localeCompare(rubroB))
              .map(([rubro, valores]) => (
                <tr key={rubro} className="hover:bg-slate-50 transition-colors">
                  <td className="py-1.5 px-3 border border-slate-300 text-left font-semibold text-slate-800">{rubro}</td>
                  {MESES.slice(0, 6).map(mes => (
                    <td key={mes} className="py-1.5 px-3 border border-slate-300 text-slate-700">
                      {valores[mes] ? fmtComas(valores[mes]) : ''}
                    </td>
                  ))}
                  <td className="py-1.5 px-3 border border-slate-300 font-bold bg-slate-50 text-slate-900">
                    {fmtComas(valores.total)}
                  </td>
                </tr>
            ))}
            
            {/* TOTALES GENERALES (Pie de tabla) */}
            <tr className="bg-[#b90000] text-white font-bold text-sm">
              <td className="py-2 px-3 border border-slate-400 text-left">Total general</td>
              {MESES.slice(0, 6).map(mes => (
                <td key={mes} className="py-2 px-3 border border-slate-400">
                  {matrizCobranza.totalesMes[mes] ? fmtComas(matrizCobranza.totalesMes[mes]) : ''}
                </td>
              ))}
              <td className="py-2 px-3 border border-slate-400">
                {fmtComas(matrizCobranza.granTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
