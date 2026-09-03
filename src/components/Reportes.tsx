import React, { useMemo, useState } from 'react';
import { Search, Calendar, Filter, AlertCircle, Building2, Users } from 'lucide-react';

interface ReportesProps {
  facturas: any[];
  abonos: any[];
  datosComerciales?: any[];
  catalogoComercial?: any[];
}

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_OPCIONES = [
  { value: '01', label: 'Enero' }, { value: '02', label: 'Febrero' },
  { value: '03', label: 'Marzo' }, { value: '04', label: 'Abril' },
  { value: '05', label: 'Mayo' }, { value: '06', label: 'Junio' },
  { value: '07', label: 'Julio' }, { value: '08', label: 'Agosto' },
  { value: '09', label: 'Septiembre' }, { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' }, { value: '12', label: 'Diciembre' }
];

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
  
  // FILTROS GLOBALES
  const [filtroAnio, setFiltroAnio] = useState<string>('todos');
  const [filtroMes, setFiltroMes] = useState<string>('todos');
  const [filtroRubro, setFiltroRubro] = useState<string>('todos');

  // Extraer Años Disponibles automáticamente
  const aniosDisponibles = useMemo(() => {
    const anios = new Set<string>();
    datosComerciales.forEach((d: any) => {
      if (d.fecha_doc && d.fecha_doc.length >= 4) anios.add(d.fecha_doc.substring(0, 4));
    });
    abonos.forEach((a: any) => {
      if (a.fecha && a.fecha.length >= 4) anios.add(a.fecha.substring(0, 4));
    });
    return Array.from(anios).sort().reverse();
  }, [datosComerciales, abonos]);

  // Extraer Rubros Disponibles del Catálogo
  const rubrosDisponibles = useMemo(() => {
    const rubros = new Set<string>();
    catalogoComercial.forEach((c: any) => {
      if (c.rubro) rubros.add(String(c.rubro).trim());
    });
    return Array.from(rubros).sort();
  }, [catalogoComercial]);

  // Filtros de Fechas
  const datosComercialesFiltrados = useMemo(() => {
    return datosComerciales.filter((row: any) => {
      if (!row.fecha_doc) return false;
      const anio = row.fecha_doc.substring(0, 4);
      const mes = row.fecha_doc.substring(5, 7);
      if (filtroAnio !== 'todos' && anio !== filtroAnio) return false;
      if (filtroMes !== 'todos' && mes !== filtroMes) return false;
      return true;
    });
  }, [datosComerciales, filtroAnio, filtroMes]);

  const abonosFiltrados = useMemo(() => {
    return abonos.filter((a: any) => {
      if (!a.fecha) return false;
      const anio = a.fecha.substring(0, 4);
      const mes = a.fecha.substring(5, 7);
      if (filtroAnio !== 'todos' && anio !== filtroAnio) return false;
      if (filtroMes !== 'todos' && mes !== filtroMes) return false;
      return true;
    });
  }, [abonos, filtroAnio, filtroMes]);

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

  // RESUMEN MATEMÁTICO (Aplicando Filtro de Rubro)
  const resumen = useMemo(() => {
    const agrupado: Record<string, Record<string, { facturado: number; cobrado: number; porCobrar: number }>> = {};
    const subtotalesRubro: Record<string, { facturado: number; cobrado: number; porCobrar: number }> = {};
    let granTotalFact = 0, granTotalCob = 0, granTotalCxC = 0;

    const initGroup = (rubro: string, grupo: string) => {
      if (!agrupado[rubro]) { agrupado[rubro] = {}; subtotalesRubro[rubro] = { facturado: 0, cobrado: 0, porCobrar: 0 }; }
      if (!agrupado[rubro][grupo]) agrupado[rubro][grupo] = { facturado: 0, cobrado: 0, porCobrar: 0 };
    };

    datosComercialesFiltrados.forEach((row: any) => {
      const idFact = row.factura;
      if (!idFact) return;

      const { productoLabel, tesoreria, rubro } = resolverCatalogo(row.cod_prod, row.desc_prod);
      if (filtroRubro !== 'todos' && rubro !== filtroRubro) return;

      const grupo = nivel === 'tesoreria' ? tesoreria : productoLabel;
      initGroup(rubro, grupo);

      const lineaTotal = Number(row.total || 0);
      const facturaTotalComercial = totalComercialPorFactura.get(idFact) || lineaTotal;
      const facContable = facturasPorNumero.get(idFact);
      const saldoTotalFactura = facContable ? Number((facContable as any).saldo || 0) : 0;

      let cxcLinea = 0;
      if (facturaTotalComercial > 0) {
        cxcLinea = (lineaTotal / facturaTotalComercial) * saldoTotalFactura;
      }
      cxcLinea = Math.min(cxcLinea, lineaTotal);

      agrupado[rubro][grupo].facturado += lineaTotal;
      agrupado[rubro][grupo].porCobrar += cxcLinea;
      subtotalesRubro[rubro].facturado += lineaTotal;
      subtotalesRubro[rubro].porCobrar += cxcLinea;
      granTotalFact += lineaTotal;
      granTotalCxC += cxcLinea;
    });

    abonosFiltrados.forEach((abono: any) => {
      if (abono.estado !== 'confirmado' || !Array.isArray(abono.facturas)) return;

      abono.facturas.forEach((f: any) => {
        const idFact = f.factura;
        const importeCobrado = Number(f.importe_factura || 0);
        if (!idFact || idFact === 'NO_OPERATIVO' || importeCobrado <= 0) return;

        const lineasComerciales = datosComerciales.filter((r: any) => r.factura === idFact);
        const facturaTotalComercial = totalComercialPorFactura.get(idFact) || 0;

        if (lineasComerciales.length === 0 || facturaTotalComercial <= 0) {
          const r = 'Sin Rubro Asignado';
          if (filtroRubro !== 'todos' && r !== filtroRubro) return;
          const g = 'Sin Producto Especificado';
          initGroup(r, g);
          agrupado[r][g].cobrado += importeCobrado;
          subtotalesRubro[r].cobrado += importeCobrado;
          granTotalCob += importeCobrado;
          return;
        }

        lineasComerciales.forEach((row: any) => {
          const { productoLabel, tesoreria, rubro } = resolverCatalogo(row.cod_prod, row.desc_prod);
          if (filtroRubro !== 'todos' && rubro !== filtroRubro) return;
          
          const grupo = nivel === 'tesoreria' ? tesoreria : productoLabel;
          initGroup(rubro, grupo);

          const proporcion = Number(row.total || 0) / facturaTotalComercial;
          const cobradoLinea = importeCobrado * proporcion;

          agrupado[rubro][grupo].cobrado += cobradoLinea;
          subtotalesRubro[rubro].cobrado += cobradoLinea;
          granTotalCob += cobradoLinea;
        });
      });
    });

    return { agrupado, subtotalesRubro, granTotalFact, granTotalCob, granTotalCxC };
  }, [datosComercialesFiltrados, abonosFiltrados, datosComerciales, catalogoPorProducto, totalComercialPorFactura, facturasPorNumero, nivel, filtroRubro]);

  // CÁLCULO DE DEUDORES (Clientes con CxC)
  const rankingDeudores = useMemo(() => {
    const clientes = new Map<string, { ruc: string; razon_social: string; totalCxC: number; cxcAsociados: number }>();

    datosComercialesFiltrados.forEach((row: any) => {
      const idFact = row.factura;
      if (!idFact) return;

      const { rubro } = resolverCatalogo(row.cod_prod, row.desc_prod);
      if (filtroRubro !== 'todos' && rubro !== filtroRubro) return;

      const lineaTotal = Number(row.total || 0);
      const facturaTotalComercial = totalComercialPorFactura.get(idFact) || lineaTotal;
      const facContable = facturasPorNumero.get(idFact);
      const saldoTotalFactura = facContable ? Number((facContable as any).saldo || 0) : 0;

      let cxcLinea = 0;
      if (facturaTotalComercial > 0) {
        cxcLinea = (lineaTotal / facturaTotalComercial) * saldoTotalFactura;
      }
      cxcLinea = Math.min(cxcLinea, lineaTotal);

      if (cxcLinea > 0.01) {
        const ruc = String(row.ruc || facContable?.ruc || 'SIN_RUC').trim();
        const razon = String(row.razon_social || facContable?.razon_social || 'SIN RAZON SOCIAL').trim();

        if (!clientes.has(ruc)) {
          clientes.set(ruc, { ruc, razon_social: razon, totalCxC: 0, cxcAsociados: 0 });
        }
        
        const cliente = clientes.get(ruc)!;
        cliente.totalCxC += cxcLinea;

        if (rubro.toUpperCase().includes('ASOCIADO')) {
          cliente.cxcAsociados += cxcLinea;
        }
      }
    });

    const todos = Array.from(clientes.values());
    const topGlobal = [...todos].sort((a, b) => b.totalCxC - a.totalCxC).slice(0, 10);
    const topAsociados = [...todos].filter(c => c.cxcAsociados > 0).sort((a, b) => b.cxcAsociados - a.cxcAsociados).slice(0, 5);

    return { topGlobal, topAsociados };
  }, [datosComercialesFiltrados, catalogoPorProducto, totalComercialPorFactura, facturasPorNumero, filtroRubro]);

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
      abonosFiltrados.forEach((p: any) => {
        if (p.estado !== 'confirmado' || !Array.isArray(p.facturas)) return;
        const m = mesKeyYLabel(p.fecha);
        if (!m) return;

        p.facturas.forEach((linea: any) => {
          const idFact = linea.factura;
          const importeFactura = Number(linea.importe_factura || 0);
          if (!idFact || idFact === 'NO_OPERATIVO' || importeFactura <= 0) return;

          const lineasComerciales = datosComerciales.filter((r: any) => r.factura === idFact);
          const facturaTotalComercial = totalComercialPorFactura.get(idFact) || 0;

          if (lineasComerciales.length === 0 || facturaTotalComercial <= 0) {
            if (filtroRubro !== 'todos' && 'Sin Rubro Asignado' !== filtroRubro) return;
            acumular('Sin Rubro Asignado', 'Sin Producto Especificado', m.key, m.label, m.orden, importeFactura);
            return;
          }

          lineasComerciales.forEach((row: any) => {
            const { productoLabel, tesoreria, rubro } = resolverCatalogo(row.cod_prod, row.desc_prod);
            if (filtroRubro !== 'todos' && rubro !== filtroRubro) return;
            
            const grupo = nivel === 'tesoreria' ? tesoreria : productoLabel;
            const proporcion = Number(row.total || 0) / facturaTotalComercial;
            acumular(rubro, grupo, m.key, m.label, m.orden, importeFactura * proporcion);
          });
        });
      });
    } else {
      datosComercialesFiltrados.forEach((row: any) => {
        const idFact = row.factura;
        if (!idFact) return;
        const m = mesKeyYLabel(row.fecha_doc);
        if (!m) return;

        const { productoLabel, tesoreria, rubro } = resolverCatalogo(row.cod_prod, row.desc_prod);
        if (filtroRubro !== 'todos' && rubro !== filtroRubro) return;

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
  }, [baseFecha, nivel, abonosFiltrados, datosComercialesFiltrados, datosComerciales, catalogoPorProducto, totalComercialPorFactura, facturasPorNumero, filtroRubro]);

  const fmtComas = (num: number) => Math.round(num).toLocaleString('en-US');

  const rubrosResumen = Object.keys(resumen.agrupado)
    .filter(rubro => rubro.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => a.localeCompare(b));

  const rubrosPivote = Object.keys(pivote.agrupado)
    .filter(rubro => rubro.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-6 font-sans pb-10">
      {/* TARJETAS PRINCIPALES */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm border-t-4 border-t-blue-500">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Facturado (Emitido)</div>
          <div className="text-2xl font-black text-slate-800">S/ {fmtComas(resumen.granTotalFact)}</div>
          <div className="text-[10px] text-slate-400 mt-1 font-mono">Facturas emitidas en el periodo</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm border-t-4 border-t-emerald-500">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Cobrado (En Bancos)</div>
          <div className="text-2xl font-black text-emerald-600">S/ {fmtComas(resumen.granTotalCob)}</div>
          <div className="text-[10px] text-emerald-600/70 mt-1 font-mono font-medium">Dinero ingresado en el periodo</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm border-t-4 border-t-red-500">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Cuentas por Cobrar</div>
          <div className="text-2xl font-black text-red-600">S/ {fmtComas(resumen.granTotalCxC)}</div>
          <div className="text-[10px] text-slate-400 mt-1 font-mono">Saldo pendiente de emisiones del periodo</div>
        </div>
      </div>

      {/* BARRA DE HERRAMIENTAS Y FILTROS */}
      <div className="bg-white shadow-sm border border-slate-300 rounded-xl p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 mr-4">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-bold text-slate-500 uppercase">Ver por:</span>
            <button onClick={() => setNivel('tesoreria')} className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${nivel === 'tesoreria' ? 'bg-[#b90000] text-white border-[#b90000]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>Tesorería</button>
            <button onClick={() => setNivel('producto')} className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${nivel === 'producto' ? 'bg-[#b90000] text-white border-[#b90000]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>Producto</button>
          </div>

          <div className="w-px h-6 bg-slate-200 hidden sm:block mx-1"></div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Rubro:</span>
            <select
              value={filtroRubro}
              onChange={(e) => setFiltroRubro(e.target.value)}
              className="px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg text-xs font-bold focus:outline-none focus:border-blue-500 cursor-pointer max-w-[200px]"
            >
              <option value="todos">Todos los rubros</option>
              {rubrosDisponibles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="w-px h-6 bg-slate-200 hidden sm:block mx-1"></div>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#b90000]" />
            <select
              value={filtroAnio}
              onChange={(e) => setFiltroAnio(e.target.value)}
              className="px-3 py-1.5 bg-red-50 border border-[#b90000]/30 text-[#b90000] rounded-lg text-xs font-bold focus:outline-none focus:border-[#b90000] cursor-pointer"
            >
              <option value="todos">Año</option>
              {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filtroMes}
              onChange={(e) => setFiltroMes(e.target.value)}
              className="px-3 py-1.5 bg-red-50 border border-[#b90000]/30 text-[#b90000] rounded-lg text-xs font-bold focus:outline-none focus:border-[#b90000] cursor-pointer"
            >
              <option value="todos">Mes</option>
              {MESES_OPCIONES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>

        <div className="relative w-full xl:w-auto">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar en tabla..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium w-full xl:w-64 focus:outline-none focus:border-[#b90000]"
          />
        </div>
      </div>

      {/* SECCIÓN DE ALERTAS Y DEUDORES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Top 10 Deudores Globales */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Top 10 Deudores Generales</h3>
          </div>
          <div className="p-0 flex-1">
            {rankingDeudores.topGlobal.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs font-medium">No hay deudas registradas en este periodo.</div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {rankingDeudores.topGlobal.map((cli, i) => (
                  <li key={cli.ruc} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0 pr-4">
                      <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 truncate" title={cli.razon_social}>{cli.razon_social}</div>
                        <div className="text-[10px] text-slate-400 font-mono">RUC: {cli.ruc}</div>
                      </div>
                    </div>
                    <div className="font-mono text-sm font-bold text-red-600 flex-shrink-0">
                      S/ {fmtComas(cli.totalCxC)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Alerta Roja: Morosidad Asociados */}
        <div className="bg-white rounded-xl border border-rose-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 bg-rose-50 border-b border-rose-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600" />
              <h3 className="text-sm font-bold text-rose-900 uppercase tracking-wide">Alerta: Top 5 Deuda Asociados</h3>
            </div>
            <Users className="w-4 h-4 text-rose-400" />
          </div>
          <div className="p-0 flex-1">
            {rankingDeudores.topAsociados.length === 0 ? (
              <div className="p-8 text-center text-rose-400 text-xs font-medium">Todos los asociados están al día en este periodo. 🎉</div>
            ) : (
              <ul className="divide-y divide-rose-100">
                {rankingDeudores.topAsociados.map((cli, i) => (
                  <li key={cli.ruc} className="p-3 flex items-center justify-between hover:bg-rose-50/50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0 pr-4">
                      <div className="w-6 h-6 rounded-full bg-rose-200 text-rose-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-rose-900 truncate" title={cli.razon_social}>{cli.razon_social}</div>
                        <div className="text-[10px] text-rose-500 font-mono">RUC: {cli.ruc}</div>
                      </div>
                    </div>
                    <div className="font-mono text-sm font-bold text-[#b90000] flex-shrink-0">
                      S/ {fmtComas(cli.cxcAsociados)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

      </div>

      <div className="bg-white shadow-sm border border-slate-300 rounded-xl overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-300 flex justify-between items-center">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Resumen por Rubro y {nivel === 'tesoreria' ? 'Tesorería' : 'Producto'}</h2>
          {(filtroAnio !== 'todos' || filtroMes !== 'todos' || filtroRubro !== 'todos') && (
            <span className="text-[10px] font-bold text-[#b90000] bg-red-100 px-2 py-1 rounded-md">FILTRADO ACTIVO</span>
          )}
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
                <tr><td colSpan={4} className="py-8 text-center text-slate-400 font-medium">No se encontraron datos para mostrar en este periodo.</td></tr>
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
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Evolución de Cobranzas por {nivel === 'tesoreria' ? 'Tesorería' : 'Producto'}</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase mr-1">Base temporal:</span>
            <button onClick={() => setBaseFecha('cobro')} className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${baseFecha === 'cobro' ? 'bg-[#b90000] text-white border-[#b90000]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>Cobro en Banco</button>
            <button onClick={() => setBaseFecha('emision')} className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${baseFecha === 'emision' ? 'bg-[#b90000] text-white border-[#b90000]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>Emisión Factura</button>
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
                <th className="py-2.5 px-4 font-bold border-b border-[#990000] bg-[#990000] whitespace-nowrap">Total periodo</th>
              </tr>
            </thead>
            <tbody>
              {rubrosPivote.length === 0 ? (
                <tr><td colSpan={pivote.mesesOrdenados.length + 2} className="py-8 text-center text-slate-400 font-medium">No se encontraron datos para mostrar en este periodo.</td></tr>
              ) : (
                rubrosPivote.map(rubro => {
                  const grupos = pivote.agrupado[rubro];
                  return (
                    <React.Fragment key={rubro}>
                      {Object.keys(grupos).sort((a, b) => a.localeCompare(b)).map(grupo => (
                        <tr key={grupo} className="hover:bg-slate-50 transition-colors border-b border-slate-100">
                          <td className="py-1.5 px-4 text-left text-slate-600 sticky left-0 bg-white shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">{grupo}</td>
                          {pivote.mesesOrdenados.map(m => (
                            <td key={m.key} className="py-1.5 px-4 text-slate-700">
                              {grupos[grupo][m.key] ? fmtComas(grupos[grupo][m.key]) : ''}
                            </td>
                          ))}
                          <td className="py-1.5 px-4 font-bold text-slate-800 bg-slate-50/50">{fmtComas(pivote.totalesGrupo[rubro][grupo])}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-200 border-y border-slate-300">
                        <td className="py-2 px-4 text-left font-black text-slate-800 uppercase sticky left-0 bg-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Total {rubro}</td>
                        {pivote.mesesOrdenados.map(m => {
                          const totalMes = Object.values(grupos).reduce((acc: number, g: any) => acc + (g[m.key] || 0), 0);
                          return <td key={m.key} className="py-2 px-4 font-bold text-slate-800">{totalMes ? fmtComas(totalMes) : ''}</td>;
                        })}
                        <td className="py-2 px-4 font-bold text-slate-800 bg-slate-200/50">{fmtComas(pivote.totalesRubro[rubro])}</td>
                      </tr>
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {rubrosPivote.length > 0 && (
              <tfoot>
                <tr className="bg-[#b90000] text-white shadow-inner">
                  <td className="py-2.5 px-4 text-left font-black uppercase sticky left-0 bg-[#b90000] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]">Total general</td>
                  {pivote.mesesOrdenados.map(m => {
                    const totalMes = rubrosPivote.reduce((acc, rubro) => acc + Object.values(pivote.agrupado[rubro]).reduce((a: number, g: any) => a + (g[m.key] || 0), 0), 0);
                    return <td key={m.key} className="py-2.5 px-4 font-bold">{totalMes ? fmtComas(totalMes) : ''}</td>;
                  })}
                  <td className="py-2.5 px-4 font-bold bg-[#990000]">{fmtComas(pivote.granTotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
