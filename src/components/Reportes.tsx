import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

interface ReportesProps {
  facturas: any[];
  abonos: any[];
  datosComerciales?: any[];
  catalogoComercial?: any[];
}

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function mesKeyYLabel(fechaStr: string | null | undefined): { key: string; label: string; orden: number } | null {
  if (!fechaStr) return null;
  const partes = String(fechaStr).slice(0, 10).split('-');
  if (partes.length < 2) return null;
  const anio = parseInt(partes[0]);
  const mes = parseInt(partes[1]);
  if (!anio || !mes || mes < 1 || mes > 12) return null;
  return { key: `${anio}-${String(mes).padStart(2, '0')}`, label: `${MESES_CORTOS[mes - 1]} ${anio}`, orden: anio * 12 + mes };
}

export default function Reportes({ facturas = [], abonos = [], datosComerciales = [], catalogoComercial = [] }: ReportesProps) {
  const [busca, setBusca] = useState('');
  const [baseFecha, setBaseFecha] = useState<'cobro' | 'emision'>('cobro');
  const [nivel, setNivel] = useState<'tesoreria' | 'producto'>('tesoreria');

  const facturasPorNumero = useMemo(
    () => new Map(facturas.map((f: any) => [f.factura, f])),
    [facturas]
  );

  const catalogoPorProducto = useMemo(() => {
    const map = new Map<string, { tesoreria: string; rubro: string; gg: string }>();
    catalogoComercial.forEach((c: any) => {
      map.set(String(c.producto || '').trim(), {
        tesoreria: c.tesoreria || 'Sin Tesorería Asignada',
        rubro: c.rubro || 'Sin Rubro Asignado',
        gg: c.gg || ''
      });
    });
    return map;
  }, [catalogoComercial]);

  const totalComercialPorFactura = useMemo(() => {
    const map = new Map<string, number>();
    datosComerciales.forEach((row: any) => {
      const id = row.factura;
      if (!id) return;
      map.set(id, (map.get(id) || 0) + Number(row.total || 0));
    });
    return map;
  }, [datosComerciales]);

  // Resolvedor con búsqueda exacta y fallback por código/prefijo
  const resolverCatalogo = (codProd: string, descProd: string) => {
    const prodCode = codProd ? String(codProd).trim() : '';
    const prodDesc = descProd ? String(descProd).trim() : '';
    const productoKey = prodCode && prodDesc ? `${prodCode} - ${prodDesc}` : (prodCode || prodDesc);

    let enCatalogo = productoKey ? catalogoPorProducto.get(productoKey) : undefined;

    if (!enCatalogo && prodCode) {
      for (const [catKey, val] of catalogoPorProducto.entries()) {
        if (catKey.startsWith(prodCode) || (prodCode.length >= 5 && catKey.startsWith(prodCode.slice(0, 5)))) {
          enCatalogo = val;
          break;
        }
      }
    }

    return {
      productoLabel: productoKey || 'Sin Producto Especificado',
      tesoreria: enCatalogo?.tesoreria || 'Sin Tesorería Asignada',
      rubro: enCatalogo?.rubro || 'Sin Rubro Asignado'
    };
  };

  const resumen = useMemo(() => {
    const agrupado: Record<string, Record<string, { facturado: number; cobrado: number; porCobrar: number }>> = {};
    const subtotalesRubro: Record<string, { facturado: number; cobrado: number; porCobrar: number }> = {};
    let granTotalFact = 0, granTotalCob = 0, granTotalCxC = 0;

    datosComerciales.forEach((row: any) => {
      const idFact = row.factura;
      if (!idFact) return;

      const { productoLabel, tesoreria, rubro } = resolverCatalogo(row.cod_prod, row.desc_prod);
      const grupo = nivel === 'tesoreria' ? tesoreria : productoLabel;

      const lineaTotal = Number(row.total || 0);
      const facturaTotalComercial = totalComercialPorFactura.get(idFact) || lineaTotal;
      const facContable = facturasPorNumero.get(idFact);
      const saldoTotalFactura = facContable ? Number((facContable as any).saldo || 0) : 0;

      let cxcLinea = 0;
      if (facturaTotalComercial > 0) {
        cxcLinea = (lineaTotal / facturaTotalComercial) * saldoTotalFactura;
      }
      cxcLinea = Math.min(cxcLinea, lineaTotal);
      const cobradoLinea = lineaTotal - cxcLinea;

      if (!agrupado[rubro]) { agrupado[rubro] = {}; subtotalesRubro[rubro] = { facturado: 0, cobrado: 0, porCobrar: 0 }; }
      if (!agrupado[rubro][grupo]) agrupado[rubro][grupo] = { facturado: 0, cobrado: 0, porCobrar: 0 };

      agrupado[rubro][grupo].facturado += lineaTotal;
      agrupado[rubro][grupo].cobrado += cobradoLinea;
      agrupado[rubro][grupo].porCobrar += cxcLinea;
      subtotalesRubro[rubro].facturado += lineaTotal;
      subtotalesRubro[rubro].cobrado += cobradoLinea;
      subtotalesRubro[rubro].porCobrar += cxcLinea;
      granTotalFact += lineaTotal;
      granTotalCob += cobradoLinea;
      granTotalCxC += cxcLinea;
    });

    return { agrupado, subtotalesRubro, granTotalFact, granTotalCob, granTotalCxC };
  }, [datosComerciales, catalogoPorProducto, totalComercialPorFactura, facturasPorNumero, nivel]);

  const pivote = useMemo(() => {
    const agrupado: Record<string, Record<string, Record<string, number>>> = {};
    const totalesGrupo: Record<string, Record<string, number>> = {};
    const totalesRubro: Record<string, number> = {};
    const mesesSet = new Map<string, { label: string; orden: number }>();
    let granTotal = 0;

    const acumular = (rubro: string, grupo: string, mesKey: string, mesLabel: string, mesOrden: number, monto: number) => {
      if (!monto) return;
      if (!agrupado[rubro]) { agrupado[rubro] = {}; totalesRubro[rubro] = 0; }
      if (!agrupado[rubro][grupo]) { agrupado[rubro][grupo] = {}; }
      if (!totalesGrupo[rubro]) totalesGrupo[rubro] = {};
      if (!totalesGrupo[rubro][grupo]) totalesGrupo[rubro][grupo] = 0;
      agrupado[rubro][grupo][mesKey] = (agrupado[rubro][grupo][mesKey] || 0) + monto;
      totalesGrupo[rubro][grupo] += monto;
      totalesRubro[rubro] += monto;
      granTotal += monto;
      if (!mesesSet.has(mesKey)) mesesSet.set(mesKey, { label: mesLabel, orden: mesOrden });
    };

    if (baseFecha === 'cobro') {
      abonos.forEach((p: any) => {
        if (p.estado !== 'confirmado' || !Array.isArray(p.facturas)) return;
        const m = mesKeyYLabel(p.fecha);
        if (!m) return;

        p.facturas.forEach((linea: any) => {
          const idFact = linea.factura;
          const importeFactura = Number(linea.importe_factura || 0);
          if (!idFact || !importeFactura) return;

          const lineasComerciales = datosComerciales.filter((r: any) => r.factura === idFact);
          const facturaTotalComercial = totalComercialPorFactura.get(idFact) || 0;

          if (lineasComerciales.length === 0 || facturaTotalComercial <= 0) {
            acumular('Sin Rubro Asignado', 'Sin Producto Especificado', m.key, m.label, m.orden, importeFactura);
            return;
          }

          lineasComerciales.forEach((row: any) => {
            const { productoLabel, tesoreria, rubro } = resolverCatalogo(row.cod_prod, row.desc_prod);
            const grupo = nivel === 'tesoreria' ? tesoreria : productoLabel;
            const proporcion = Number(row.total || 0) / facturaTotalComercial;
            acumular(rubro, grupo, m.key, m.label, m.orden, importeFactura * proporcion);
          });
        });
      });
    } else {
      datosComerciales.forEach((row: any) => {
        const idFact = row.factura;
        if (!idFact) return;
        const m = mesKeyYLabel(row.fecha_doc);
        if (!m) return;

        const { productoLabel, tesoreria, rubro } = resolverCatalogo(row.cod_prod, row.desc_prod);
        const grupo = nivel === 'tesoreria' ? tesoreria : productoLabel;

        const lineaTotal = Number(row.total || 0);
        const facturaTotalComercial = totalComercialPorFactura.get(idFact) || lineaTotal;
        const facContable = facturasPorNumero.get(idFact);
        const saldoTotalFactura = facContable ? Number((facContable as any).saldo || 0) : 0;

        let cxcLinea = 0;
        if (facturaTotalComercial > 0) cxcLinea = (lineaTotal / facturaTotalComercial) * saldoTotalFactura;
        cxcLinea = Math.min(cxcLinea, lineaTotal);
        const cobradoLinea = lineaTotal - cxcLinea;

        acumular(rubro, grupo, m.key, m.label, m.orden, cobradoLinea);
      });
    }

    const mesesOrdenados = [...mesesSet.entries()].sort((a, b) => a[1].orden - b[1].orden).map(([key, v]) => ({ key, label: v.label }));

    return { agrupado, totalesGrupo, totalesRubro, mesesOrdenados, granTotal };
  }, [baseFecha, nivel, abonos, datosComerciales, catalogoPorProducto, totalComercialPorFactura, facturasPorNumero]);

  const fmtComas = (num: number) => Math.round(num).toLocaleString('en-US');

  const rubrosResumen = Object.keys(resumen.agrupado)
    .filter(rubro => rubro.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => a.localeCompare(b));

  const rubrosPivote = Object.keys(pivote.agrupado)
    .filter(rubro => rubro.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-6 font-sans">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm border-t-4 border-t-blue-500">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Facturado (Comercial)</div>
          <div className="text-2xl font-black text-slate-800">S/ {fmtComas(resumen.granTotalFact)}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm border-t-4 border-t-emerald-500">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Cobrado (estimado, saldo actual)</div>
          <div className="text-2xl font-black text-emerald-600">S/ {fmtComas(resumen.granTotalCob)}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm border-t-4 border-t-red-500">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Cuentas por Cobrar (Saldo)</div>
          <div className="text-2xl font-black text-red-600">S/ {fmtComas(resumen.granTotalCxC)}</div>
        </div>
      </div>

      <div className="bg-white shadow-sm border border-slate-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-500 uppercase mr-1">Ver por:</span>
          <button onClick={() => setNivel('tesoreria')} className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${nivel === 'tesoreria' ? 'bg-[#b90000] text-white border-[#b90000]' : 'bg-white text-slate-600 border-slate-200'}`}>Tesorería</button>
          <button onClick={() => setNivel('producto')} className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${nivel === 'producto' ? 'bg-[#b90000] text-white border-[#b90000]' : 'bg-white text-slate-600 border-slate-200'}`}>Producto</button>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar rubro..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium w-full sm:w-64 focus:outline-none focus:border-capeco-blue"
          />
        </div>
      </div>

      <div className="bg-white shadow-sm border border-slate-300 rounded-xl overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-300">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Resumen por Rubro y {nivel === 'tesoreria' ? 'Tesorería' : 'Producto'}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse">
            <thead>
              <tr className="bg-[#b90000] text-white">
                <th className="py-2.5 px-4 text-left font-bold border-b border-[#990000]">Clasificación</th>
                <th className="py-2.5 px-4 font-bold border-b border-[#990000]">Facturado</th>
                <th className="py-2.5 px-4 font-bold border-b border-[#990000]">Cobrado</th>
                <th className="py-2.5 px-4 font-bold border-b border-[#990000] bg-[#990000]">Por Cobrar (CxC)</th>
              </tr>
            </thead>
            <tbody>
              {rubrosResumen.length === 0 ? (
                <tr><td colSpan={4} className="py-8 text-center text-slate-400 font-medium">No se encontraron datos para mostrar.</td></tr>
              ) : (
                rubrosResumen.map(rubro => {
                  const grupos = resumen.agrupado[rubro];
                  const subtotales = resumen.subtotalesRubro[rubro];
                  return (
                    <React.Fragment key={rubro}>
                      <tr className="bg-slate-200 border-y border-slate-300">
                        <td className="py-2 px-4 text-left font-black text-slate-800 uppercase">{rubro}</td>
                        <td className="py-2 px-4 font-bold text-slate-800">{fmtComas(subtotales.facturado)}</td>
                        <td className="py-2 px-4 font-bold text-emerald-700">{fmtComas(subtotales.cobrado)}</td>
                        <td className="py-2 px-4 font-bold text-red-700">{fmtComas(subtotales.porCobrar)}</td>
                      </tr>
                      {Object.entries(grupos).sort(([a], [b]) => a.localeCompare(b)).map(([grupo, valores], idx) => (
                        <tr key={grupo} className={`hover:bg-slate-50 transition-colors ${idx !== Object.keys(grupos).length - 1 ? 'border-b border-slate-100' : ''}`}>
                          <td className="py-1.5 px-4 text-left text-slate-600 pl-8 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-slate-300 rounded-full inline-block"></span>{grupo}
                          </td>
                          <td className="py-1.5 px-4 text-slate-700 font-medium">{fmtComas((valores as any).facturado)}</td>
                          <td className="py-1.5 px-4 text-emerald-600 font-medium">{fmtComas((valores as any).cobrado)}</td>
                          <td className="py-1.5 px-4 text-red-500 font-medium">{fmtComas((valores as any).porCobrar)}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white shadow-sm border border-slate-300 rounded-xl overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Cobranzas por Rubro y {nivel === 'tesoreria' ? 'Tesorería' : 'Producto'}</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase mr-1">Fecha base:</span>
            <button onClick={() => setBaseFecha('cobro')} className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${baseFecha === 'cobro' ? 'bg-[#b90000] text-white border-[#b90000]' : 'bg-white text-slate-600 border-slate-200'}`}>Cobro confirmado</button>
            <button onClick={() => setBaseFecha('emision')} className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${baseFecha === 'emision' ? 'bg-[#b90000] text-white border-[#b90000]' : 'bg-white text-slate-600 border-slate-200'}`}>Emisión</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse">
            <thead>
              <tr className="bg-[#b90000] text-white">
                <th className="py-2.5 px-4 text-left font-bold border-b border-[#990000] sticky left-0 bg-[#b90000]">Rubro / {nivel === 'tesoreria' ? 'Tesorería' : 'Producto'}</th>
                {pivote.mesesOrdenados.map(m => (
                  <th key={m.key} className="py-2.5 px-4 font-bold border-b border-[#990000] whitespace-nowrap">{m.label}</th>
                ))}
                <th className="py-2.5 px-4 font-bold border-b border-[#990000] bg-[#990000] whitespace-nowrap">Total general</th>
              </tr>
            </thead>
            <tbody>
              {rubrosPivote.length === 0 ? (
                <tr><td colSpan={pivote.mesesOrdenados.length + 2} className="py-8 text-center text-slate-400 font-medium">No se encontraron datos para mostrar.</td></tr>
              ) : (
                rubrosPivote.map(rubro => {
                  const grupos = pivote.agrupado[rubro];
                  return (
                    <React.Fragment key={rubro}>
                      {Object.keys(grupos).sort((a, b) => a.localeCompare(b)).map(grupo => (
                        <tr key={grupo} className="hover:bg-slate-50 transition-colors border-b border-slate-100">
                          <td className="py-1.5 px-4 text-left text-slate-600 sticky left-0 bg-white">{grupo}</td>
                          {pivote.mesesOrdenados.map(m => (
                            <td key={m.key} className="py-1.5 px-4 text-slate-700">
                              {grupos[grupo][m.key] ? fmtComas(grupos[grupo][m.key]) : ''}
                            </td>
                          ))}
                          <td className="py-1.5 px-4 font-bold text-slate-800">{fmtComas(pivote.totalesGrupo[rubro][grupo])}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-200 border-y border-slate-300">
                        <td className="py-2 px-4 text-left font-black text-slate-800 uppercase sticky left-0 bg-slate-200">Total {rubro}</td>
                        {pivote.mesesOrdenados.map(m => {
                          const totalMes = Object.values(grupos).reduce((acc: number, g: any) => acc + (g[m.key] || 0), 0);
                          return <td key={m.key} className="py-2 px-4 font-bold text-slate-800">{totalMes ? fmtComas(totalMes) : ''}</td>;
                        })}
                        <td className="py-2 px-4 font-bold text-slate-800">{fmtComas(pivote.totalesRubro[rubro])}</td>
                      </tr>
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {rubrosPivote.length > 0 && (
              <tfoot>
                <tr className="bg-[#b90000] text-white">
                  <td className="py-2 px-4 text-left font-black uppercase sticky left-0 bg-[#b90000]">Total general</td>
                  {pivote.mesesOrdenados.map(m => {
                    const totalMes = rubrosPivote.reduce((acc, rubro) => acc + Object.values(pivote.agrupado[rubro]).reduce((a: number, g: any) => a + (g[m.key] || 0), 0), 0);
                    return <td key={m.key} className="py-2 px-4 font-bold">{totalMes ? fmtComas(totalMes) : ''}</td>;
                  })}
                  <td className="py-2 px-4 font-bold bg-[#990000]">{fmtComas(pivote.granTotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
