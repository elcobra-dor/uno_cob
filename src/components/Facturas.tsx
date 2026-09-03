import React, { useState, useMemo } from 'react';
import { Factura } from '../types';
import { fmtMonto, diasHasta, norm } from '../lib/businessUtils';
import { Search, AlertTriangle, Clock, Coins, Printer, FileText, Send } from 'lucide-react';

interface FacturasProps {
  facturas: Factura[];
  onIrACobranzas?: (cliente?: string) => void;
  onAjusteRedondeo?: (facturaId: string, saldo: number, moneda: string) => void;
}

export default function Facturas({ facturas, onIrACobranzas, onAjusteRedondeo }: FacturasProps) {
  const [filtroVencimiento, setFiltroVencimiento] = useState<'todos' | 'vencida' | 'proxima' | 'ok'>('todos');
  const [busca, setBusca] = useState('');

  // 1. KPI Stats
  const stats = useMemo(() => {
    const validFacturas = facturas.filter(f => f.saldo > 0.01);
    
    let vencidasCount = 0;
    let proximasCount = 0;
    let saldoPEN = 0;
    let saldoUSD = 0;

    validFacturas.forEach(f => {
      const dias = diasHasta(f.fecha_ven);
      if (dias !== null) {
        if (dias < 0) vencidasCount++;
        else if (dias <= 7) proximasCount++;
      }

      if (f.moneda === 'USD') saldoUSD += f.saldo;
      else saldoPEN += f.saldo;
    });

    return {
      total: validFacturas.length,
      vencidas: vencidasCount,
      proximas: proximasCount,
      saldoPEN,
      saldoUSD
    };
  }, [facturas]);

  // 2. Filtering
  const facturasFiltradas = useMemo(() => {
    const buscaNorm = norm(busca);
    return facturas.filter(f => {
      if (f.saldo <= 0.01) return false;

      // Filter by delay category
      const dias = diasHasta(f.fecha_ven);
      if (filtroVencimiento === 'vencida' && !(dias !== null && dias < 0)) return false;
      if (filtroVencimiento === 'proxima' && !(dias !== null && dias >= 0 && dias <= 7)) return false;
      if (filtroVencimiento === 'ok' && !(dias === null || dias > 7)) return false;

      // Search text
      if (buscaNorm) {
        const textToSearch = norm(`${f.factura} ${f.razon_social} ${f.ruc}`);
        if (!textToSearch.includes(buscaNorm)) return false;
      }

      return true;
    });
  }, [facturas, filtroVencimiento, busca]);

  // 3. Generar Estado de Cuenta PDF (CAPECO Original)
  const handleExportarEstadoCuentaPDF = () => {
    const query = busca.trim();
    if (!query || query.length < 3) {
      alert('Por favor, escribe al menos 3 letras del nombre del cliente en el buscador para generar su Estado de Cuenta.');
      return;
    }

    const buscaNorm = norm(query);
    const facturasCliente = facturas.filter(f => {
      return f.saldo > 0.01 && (norm(f.razon_social).includes(buscaNorm) || norm(f.factura).includes(buscaNorm) || norm(f.ruc).includes(buscaNorm));
    });

    if (!facturasCliente.length) {
      alert('No se encontraron facturas pendientes vigentes para este cliente.');
      return;
    }

    const clienteNombre = facturasCliente[0].razon_social || 'Cliente';
    const clienteRuc = facturasCliente[0].ruc || '';
    let totalDeuda = 0;

    const filasHTML = facturasCliente.map(f => {
      const dias = diasHasta(f.fecha_ven);
      let diasTexto = '-';
      let colorDias = '';
      
      if (dias !== null && dias < 0) {
        diasTexto = Math.abs(dias) + ' días';
        colorDias = 'color: #e3000f; font-weight: bold;';
      } else if (dias !== null) {
        diasTexto = 'Al día';
      }

      totalDeuda += f.saldo;
      const montoFormateado = f.saldo.toLocaleString('es-PE', { minimumFractionDigits: 2 });

      return `
        <tr>
          <td>${f.fecha_doc || ''}</td>
          <td>${f.factura}</td>
          <td style="${colorDias}">${diasTexto}</td>
          <td class="amount right">${montoFormateado}</td>
          <td>SALDO PENDIENTE - POR REGULARIZAR</td>
        </tr>
      `;
    }).join('');

    const hoy = new Date().toLocaleDateString('es-PE');

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Estado de Cuenta - ${clienteNombre}</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #000; max-width: 850px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 10px; }
        .title-area h1 { font-size: 15px; margin: 0; text-transform: uppercase; letter-spacing: 0.5px; font-weight: bold;}
        .title-area h2 { font-size: 22px; color: #555; font-weight: normal; margin: 5px 0 0 0; }
        .right-area { display: flex; align-items: flex-end; gap: 40px; }
        .date { font-weight: bold; font-size: 14px; margin-bottom: 5px; }
        .logo { max-height: 60px; max-width: 120px; object-fit: contain; } 
        .red-line { border-top: 4px solid #e3000f; margin: 0 0 20px 0; }
        .client-info { margin-bottom: 30px; }
        .client-info .name { font-size: 16px; font-weight: bold; text-transform: uppercase; }
        .client-info .ruc { font-size: 13px; margin-top: 4px; color: #333; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 25px;}
        th { border-bottom: 2px solid #e3000f; text-align: left; padding: 8px 5px; color: #14559a; text-transform: uppercase; font-size: 12px;}
        th.right, td.right { text-align: right; }
        td { padding: 8px 5px; border-bottom: 1px solid #eaeaea; }
        td.amount { color: #e3000f; font-weight: bold; }
        .footer { display: flex; justify-content: flex-start; margin-top: 15px; padding-left: 25%; }
        .total-label { background: #b30000; color: white; padding: 8px 15px; font-weight: bold; font-size: 14px; border-right: 1px solid #fff;}
        .total-value { background: #b30000; color: white; padding: 8px 15px; font-weight: bold; font-size: 14px;}
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title-area">
          <h1>Cámara Peruana de la Construcción</h1>
          <h2>Estado de Cuenta</h2>
        </div>
        <div class="right-area">
          <div class="date">${hoy}</div>
          <img src="https://www.capeco.org/wp-content/uploads/2021/04/logo-capeco.png" class="logo" alt="CAPECO">
        </div>
      </div>
      <div class="red-line"></div>
      
      <div class="client-info">
        <div class="name">${clienteNombre}</div>
        <div class="ruc">RUC: ${clienteRuc} | Detalle de facturas pendientes</div>
      </div>

      <table>
        <thead>
          <tr>
            <th>F. Docum.</th>
            <th>Documento</th>
            <th>Atraso</th>
            <th class="right">S/.</th>
            <th>Detalle del producto y pago</th>
          </tr>
        </thead>
        <tbody>
          ${filasHTML}
        </tbody>
      </table>

      <div class="footer">
        <div class="total-label">Total por pagar</div>
        <div class="total-value">S/ ${parseFloat(String(totalDeuda)).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</div>
      </div>

      <script>
        window.onload = function() { setTimeout(() => window.print(), 500); }
      </script>
    </body>
    </html>
    `;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(htmlContent);
      win.document.close();
    } else {
      alert('No se pudo abrir la ventana del PDF. Por favor, habilita las ventanas emergentes (popups) en tu navegador.');
    }
  };

  return (
    <div className="space-y-6">
      {/* KPIs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Total Facturas</div>
            <div className="font-mono text-2xl font-bold text-slate-900">{stats.total}</div>
          </div>
          <div className="p-3 bg-slate-50 text-slate-400 rounded-xl">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex items-center justify-between border-t-4 border-t-red-500">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Vencidas</div>
            <div className="font-mono text-2xl font-bold text-red-600">{stats.vencidas}</div>
          </div>
          <div className="p-3 bg-red-50 text-red-500 rounded-xl">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex items-center justify-between border-t-4 border-t-amber-500">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Por Vencer (7d)</div>
            <div className="font-mono text-2xl font-bold text-amber-500">{stats.proximas}</div>
          </div>
          <div className="p-3 bg-amber-50 text-amber-500 rounded-xl">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex items-center justify-between border-t-4 border-t-capeco-blue">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Saldo Total Pendiente</div>
            <div className="font-mono text-base font-bold text-capeco-blue leading-tight mt-1">
              S/ {stats.saldoPEN.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
              {stats.saldoUSD > 0 && (
                <>
                  <br />
                  <span className="text-xs font-normal text-slate-500">US$ {stats.saldoUSD.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                </>
              )}
            </div>
          </div>
          <div className="p-3 bg-blue-50 text-capeco-blue rounded-xl">
            <Coins className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filters & Search bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Filtrar por Vencimiento</span>
            <select
              value={filtroVencimiento}
              onChange={(e) => setFiltroVencimiento(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-xl px-3 py-2 focus:outline-none focus:border-capeco-blue focus:bg-white cursor-pointer"
            >
              <option value="todos">Todas</option>
              <option value="vencida">Vencidas</option>
              <option value="proxima">Por vencer</option>
              <option value="ok">Al día</option>
            </select>
          </div>

          <div className="flex flex-col gap-1 w-full sm:w-auto">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Buscar por Cliente o RUC</span>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar empresa, factura o RUC..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-sans text-xs text-slate-800 placeholder-slate-400 w-full sm:w-64 focus:outline-none focus:border-capeco-blue focus:bg-white transition-all"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:self-end">
          <button
            onClick={() => onIrACobranzas && onIrACobranzas(busca)}
            className="bg-[#7A1B29] text-white rounded-xl px-4 py-2.5 text-xs font-semibold hover:bg-[#8f2131] transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            title="Ir al módulo de cobranzas y generar recordatorios de facturas vencidas por email"
          >
            <Send className="w-4 h-4" />
            Cobranzas & Email
          </button>

          <button
            onClick={handleExportarEstadoCuentaPDF}
            className="bg-red-50 text-capeco-red border border-red-150 rounded-xl px-4 py-2.5 text-xs font-semibold hover:bg-capeco-red hover:text-white transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            title="Filtra a un cliente en el buscador y descarga su PDF de facturas pendientes con logo CAPECO"
          >
            <Printer className="w-4 h-4" />
            Estado de Cuenta PDF
          </button>
        </div>
      </div>

      {/* Invoices List Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Estado</th>
                <th className="px-6 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Asociado / Razón Social</th>
                <th className="px-6 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Documento</th>
                <th className="px-6 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Fechas</th>
                <th className="px-6 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Vencimiento</th>
                <th className="px-6 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono text-right">Saldo Pendiente</th>
                <th className="px-4 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono text-center">Aviso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {facturasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center">
                      <FileText className="w-10 h-10 text-slate-200 mb-2" />
                      <div className="text-sm font-semibold text-slate-700">No hay facturas pendientes</div>
                      <p className="text-xs text-slate-400 mt-1">Intenta con otros términos de búsqueda o filtros.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                facturasFiltradas.map((f) => {
                  const dias = diasHasta(f.fecha_ven);
                  
                  let dotColorClass = 'bg-emerald-500';
                  let vencimientoLabel = 'Al día';
                  let vencimientoStyleClass = 'text-emerald-600 bg-emerald-50 border border-emerald-100';

                  if (dias !== null) {
                    if (dias < 0) {
                      dotColorClass = 'bg-red-500 animate-pulse';
                      vencimientoLabel = `VENCIDA (${Math.abs(dias)} días atraso)`;
                      vencimientoStyleClass = 'text-red-700 bg-red-50 border border-red-100 font-semibold';
                    } else if (dias <= 7) {
                      dotColorClass = 'bg-amber-500';
                      vencimientoLabel = `Por vencer en ${dias} días`;
                      vencimientoStyleClass = 'text-amber-700 bg-amber-50 border border-amber-100 font-semibold';
                    } else {
                      vencimientoLabel = `Vence en ${dias} días`;
                      vencimientoStyleClass = 'text-slate-500 bg-slate-50 border border-slate-100';
                    }
                  }

                  // Lógica para mostrar el botón de ajuste solo si el saldo es pequeño (S/ 5.00 o menos)
                  const permiteAjuste = onAjusteRedondeo && f.saldo > 0 && f.saldo <= 5;

                  return (
                    <tr key={f.factura} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`w-2.5 h-2.5 rounded-full inline-block ${dotColorClass}`}></span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-semibold text-slate-900 leading-tight">
                          {f.razon_social || '—'}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">RUC: {f.ruc || 'Sin registrar'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-xs font-semibold text-slate-700">
                        {f.factura}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 leading-tight">
                        <div>Doc: {f.fecha_doc || '—'}</div>
                        <div className="mt-0.5 text-[10px]">Ven: {f.fecha_ven || '—'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-[10px] px-2 py-1 rounded-lg ${vencimientoStyleClass}`}>
                          {vencimientoLabel}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-sm font-bold text-slate-900 flex justify-end items-center gap-2">
                        {permiteAjuste && (
                          <button
                            onClick={() => onAjusteRedondeo!(f.factura, f.saldo, f.moneda)}
                            className="bg-red-50 text-red-600 border border-red-200 px-2 py-1 rounded shadow-sm hover:bg-red-600 hover:text-white transition-colors cursor-pointer flex items-center gap-1 text-[10px]"
                            title="Liquidar saldo pendiente como Ajuste por Redondeo (Para céntimos de detracción o tipo de cambio)"
                          >
                            🧹 Ajuste
                          </button>
                        )}
                        <span>{fmtMonto(f.saldo, f.moneda)}</span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() => onIrACobranzas && onIrACobranzas(f.razon_social)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-[#7A1B29] hover:bg-rose-50 transition-colors cursor-pointer"
                          title={`Gestionar recordatorio de cobranza por email para ${f.razon_social}`}
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
