import React, { useMemo, useState } from 'react';

interface ReportesProps {
  facturas: any[];
  abonos: any[];
  datosComerciales?: any[];
  catalogo?: any[];
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function Reportes({ facturas = [], datosComerciales = [], catalogo = [] }: ReportesProps) {
  const [filtroAnoPago, setFiltroAnoPago] = useState<number>(2026);
  
  // =========================================================
  // 1. CREAR DICCIONARIOS DE BÚSQUEDA RÁPIDA (EL PUENTE)
  // =========================================================
  
  // A. Diccionario de Catálogo: Busca un "Producto" y devuelve su "Rubro y GG"
  const diccCatalogo = useMemo(() => {
    const mapa: { [producto: string]: { rubro: string, gg: string } } = {};
    catalogo.forEach(row => {
      if (row.producto) {
        mapa[row.producto] = { rubro: row.rubro, gg: row.gg };
      }
    });
    return mapa;
  }, [catalogo]);

  // B. Diccionario Comercial: Busca un "Número de Factura" y devuelve el "Producto"
  const diccComercial = useMemo(() => {
    const mapa: { [idFactura: string]: string } = {};
    datosComerciales.forEach(row => {
      // OJO: Cambia 'serie_doc' y 'num_doc' por los nombres reales de tus columnas en el Excel Comercial
      const idFact = `${row.serie_doc}-${row.num_doc}`; 
      if (row.producto) {
        mapa[idFact] = row.producto;
      }
    });
    return mapa;
  }, [datosComerciales]);

  // =========================================================
  // 2. PROCESAR EL DINERO REAL DE LA TABLA 'FACTURAS'
  // =========================================================
  
  const datosProcesados = useMemo(() => {
    const macro: { [ano: number]: { facturacion: number, cobranza: number, cxc: number } } = {};
    const matriz: { [rubro: string]: { [mes: string]: number, total: number } } = {};
    const totalesMes: { [mes: string]: number } = {};
    let granTotalMatriz = 0;

    facturas.forEach(fac => {
      // 1. Identificar Factura
      const anoEmision = fac.fecha_doc ? new Date(fac.fecha_doc).getFullYear() : 2025;
      const mesCobranza = fac.fecha_doc ? MESES[new Date(fac.fecha_doc).getMonth()] : 'Enero'; // Ideal usar fecha de pago si existe
      
      // OJO: Asegúrate que estos coincidan con tu tabla 'facturas' oficial
      const idFact = `${fac.serie_doc}-${fac.num_doc}`; 
      
      // 2. Extraer Dinero Real (Contable)
      const facturadoReal = Number(fac.total || 0);
      const cxcReal = Number(fac.saldo || 0);
      const cobranzaReal = facturadoReal - cxcReal; // Lo que ya se pagó

      // 3. Buscar Rubro a través del puente
      const producto = diccComercial[idFact];
      const infoCatalogo = producto ? diccCatalogo[producto] : null;
      const rubroFinal = infoCatalogo?.rubro || 'Sin Rubro Asignado';

      // --- ALIMENTAR TABLA 1 (MACRO) ---
      if (!macro[anoEmision]) macro[anoEmision] = { facturacion: 0, cobranza: 0, cxc: 0 };
      macro[anoEmision].facturacion += facturadoReal;
      macro[anoEmision].cobranza += cobranzaReal;
      macro[anoEmision].cxc += cxcReal;

      // --- ALIMENTAR TABLA 2 (MATRIZ POR RUBRO) ---
      // Si quieres que el filtro funcione por año de cobro o emisión, lo validamos aquí
      if (anoEmision === filtroAnoPago) {
        if (!matriz[rubroFinal]) matriz[rubroFinal] = { total: 0 };
        matriz[rubroFinal][mesCobranza] = (matriz[rubroFinal][mesCobranza] || 0) + cobranzaReal;
        matriz[rubroFinal].total += cobranzaReal;
        
        totalesMes[mesCobranza] = (totalesMes[mesCobranza] || 0) + cobranzaReal;
        granTotalMatriz += cobranzaReal;
      }
    });

    return { 
      macro: Object.entries(macro).sort(([a], [b]) => Number(b) - Number(a)).map(([ano, totales]) => ({ ano, ...totales })), 
      matriz, 
      totalesMes, 
      granTotalMatriz 
    };
  }, [facturas, diccComercial, diccCatalogo, filtroAnoPago]);

  // =========================================================
  // 3. RENDERIZADO VISUAL
  // =========================================================
  const fmtM = (num: number) => (num / 1000000).toFixed(1) + 'Mllns';
  const fmtK = (num: number) => (num / 1000).toFixed(0) + 'K';
  const fmtComas = (num: number) => Math.round(num).toLocaleString('en-US');

  return (
    <div className="space-y-8 font-sans">
      
      {/* --- RENDER: MODELO 1 MACRO --- */}
      <div className="max-w-xl bg-white shadow-sm border border-slate-300">
        <div className="p-3 bg-slate-100 border-b border-slate-300 font-bold text-slate-800 text-sm">
          Resumen Oficial (Dinero real cruzado por Catálogo)
        </div>
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
            {datosProcesados.macro.map((row, idx) => (
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
          <label className="text-sm font-semibold text-slate-700">Año Contable:</label>
          <select 
            value={filtroAnoPago} 
            onChange={(e) => setFiltroAnoPago(Number(e.target.value))}
            className="border border-slate-300 rounded p-1 text-sm bg-white"
          >
            <option value={2025}>2025</option>
            <option value={2026}>2026</option>
          </select>
          <span className="text-sm font-semibold ml-4 text-slate-700">Valores de: <span className="font-bold">Facturas Reales</span></span>
        </div>

        <table className="w-full text-right text-xs border-collapse">
          <thead>
            <tr className="bg-[#b90000] text-white font-bold">
              <th className="py-2 px-3 border border-slate-400 text-left">Rubro Comercial</th>
              {MESES.slice(0, 6).map(mes => (
                <th key={mes} className="py-2 px-3 border border-slate-400">{mes}</th>
              ))}
              <th className="py-2 px-3 border border-slate-400">Total general</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(datosProcesados.matriz)
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
            
            {/* TOTALES GENERALES */}
            <tr className="bg-[#b90000] text-white font-bold text-sm">
              <td className="py-2 px-3 border border-slate-400 text-left">Total general</td>
              {MESES.slice(0, 6).map(mes => (
                <td key={mes} className="py-2 px-3 border border-slate-400">
                  {datosProcesados.totalesMes[mes] ? fmtComas(datosProcesados.totalesMes[mes]) : ''}
                </td>
              ))}
              <td className="py-2 px-3 border border-slate-400">
                {fmtComas(datosProcesados.granTotalMatriz)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
