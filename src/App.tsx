import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from './lib/supabase';
import { Factura, Abono, Egreso, Categoria } from './types';
import Sidebar from './components/Sidebar';
import LoginOverlay from './components/LoginOverlay';
import UploadModal from './components/UploadModal';
import Conciliacion from './components/Conciliacion';
import Facturas from './components/Facturas';
import Egresos from './components/Egresos';
import Categorias from './components/Categorias';
import Reportes from './components/Reportes';
import AsistenteAI from './components/AsistenteAI';
import { 
  sugerirFactura, 
  fmtFecha, 
  fmtMonto, 
  requiereDetraccionPEN, 
  esAbonoDetraccionBN 
} from './lib/businessUtils';
import * as XLSX from 'xlsx';
import { 
  Loader2, 
  Building2, 
  Menu, 
  Bell, 
  HelpCircle, 
  CheckCircle, 
  Database,
  RefreshCw,
  Sparkles
} from 'lucide-react';

const TABLA_CUENTAS: { [key: string]: { cta_contable: string; mon: 'S' | 'D' } } = {
  '127': { cta_contable: '104122', mon: 'D' },
  '010': { cta_contable: '104113', mon: 'S' },
  '162': { cta_contable: '104123', mon: 'D' },
  '040': { cta_contable: '104112', mon: 'S' },
  '304': { cta_contable: '104115', mon: 'S' },
  '131': { cta_contable: '104125', mon: 'D' },
  '579': { cta_contable: '104117', mon: 'S' },
  '285': { cta_contable: '104114', mon: 'S' },
  '444': { cta_contable: '104111', mon: 'S' }
};

export default function App() {
  const [currentPage, setCurrentPage] = useState<string>('conciliacion');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [userAuthenticated, setUserAuthenticated] = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [dbStatus, setDbStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [toast, setToast] = useState<{ text: string; type: 'green' | 'amber' | '' } | null>(null);

  // Core Data States
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [abonos, setAbonos] = useState<Abono[]>([]);
  const [egresos, setEgresos] = useState<Egreso[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [interMap, setInterMap] = useState<{ [key: string]: string }>({});
  const [bdMap, setBdMap] = useState<{ [key: string]: any }>({});

  // Helper trigger to show toasts
  const showToast = useCallback((text: string, type: 'green' | 'amber' | '' = '') => {
    setToast({ text, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  }, []);

  // 1. Session Checker
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setUserAuthenticated(true);
          setDbStatus('connected');
        } else {
          setUserAuthenticated(false);
          setDbStatus('error');
        }
      } catch (err) {
        console.error('Session check failed', err);
        setDbStatus('error');
      } finally {
        setLoadingSession(false);
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUserAuthenticated(true);
        setDbStatus('connected');
      } else {
        setUserAuthenticated(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 2. Load Core Data from Supabase
  const cargarDesdeBD = useCallback(async () => {
    if (!userAuthenticated) return;
    setLoadingData(true);
    setDbStatus('connecting');

    try {
      // a. Fetch invoices
      const { data: fdata, error: ferror } = await supabase.from('facturas').select('*').order('fecha_doc');
      if (ferror) throw ferror;
      const facturasCargadas = (fdata || []).map((f: any) => ({
        ...f,
        saldo: parseFloat(f.saldo) || 0,
        saldo_original: parseFloat(f.saldo) || 0,
      }));

      // b. Fetch abonos bank records
      const { data: bdata, error: berror } = await supabase.from('abonos').select('*').order('fecha');
      if (berror) throw berror;
      const abonosCargados = bdata || [];

      // c. Fetch active matches/conciliaciones
      const { data: cdata, error: cerror } = await supabase.from('conciliaciones').select('*');
      if (cerror) throw cerror;

      // Map match records
      const concMap: { [key: string]: { factura: string; razon: string; importe_factura: number }[] } = {};
      (cdata || []).forEach((c: any) => {
        if (!concMap[c.operacion]) concMap[c.operacion] = [];
        concMap[c.operacion].push({
          factura: c.factura,
          razon: c.razon,
          importe_factura: parseFloat(c.importe_factura) || 0
        });
      });

      // Assemble initial list of abonos
      const initialAbonos: Abono[] = abonosCargados.map((b: any, idx: number) => {
        const concItems = concMap[b.operacion];
        return {
          ...b,
          id: idx,
          monto: parseFloat(b.monto) || 0,
          estado: concItems ? 'confirmado' : 'pendiente',
          facturas: concItems || [{ factura: '', razon: '' }],
          motivo: concItems ? 'Guardado' : '',
          confianza: ''
        };
      });

      // Dynamic Balance Reductions Purely calculated in local memory state (avoid mutating)
      const facturasConSaldos = facturasCargadas.map(f => ({ ...f }));
      
      // First, reduce mathematically all confirmed ones to keep exact balance
      initialAbonos.forEach(p => {
        if (p.estado === 'confirmado' && p.facturas) {
          let disponible = p.monto;
          p.facturas.forEach(linea => {
            if (!linea.factura) return;
            const f = facturasConSaldos.find(x => x.factura === linea.factura);
            if (f && disponible > 0) {
              const cobro = Math.min(disponible, f.saldo);
              f.saldo -= cobro;
              disponible -= cobro;
            }
          });
        }
      });

      // Round decimals cleanly
      facturasConSaldos.forEach(f => {
        f.saldo = Math.round(f.saldo * 100) / 100;
      });

      // Apply dynamic suggestions for pending ones
      initialAbonos.forEach(p => {
        if (p.estado === 'pendiente') {
          const sug = sugerirFactura(p, facturasConSaldos);
          if (sug) {
            p.facturas = [{ factura: sug.factura, razon: sug.razon }];
            p.motivo = sug.motivo;
            p.confianza = sug.confianza;
            p.estado = 'sugerida';

            // Discount sug from local available invoice so next payment doesn't target the same invoice
            const f = facturasConSaldos.find(x => x.factura === sug.factura);
            if (f) {
              const cobro = Math.min(p.monto, f.saldo);
              f.saldo = Math.round((f.saldo - cobro) * 100) / 100;
            }
          }
        }
      });

      // d. Fetch egresos records
      const { data: edata, error: eerror } = await supabase.from('egresos').select('*').order('fecha');
      if (eerror) throw eerror;
      const egresosCargados: Egreso[] = (edata || []).map((e: any) => ({
        ...e,
        monto: parseFloat(e.monto) || 0,
      }));

      // e. Fetch categories
      const { data: catData, error: catError } = await supabase.from('categorias').select('*').eq('activo', true).order('orden');
      if (catError) throw catError;

      setFacturas(facturasConSaldos);
      setAbonos(initialAbonos);
      setEgresos(egresosCargados);
      setCategorias(catData || []);
      setDbStatus('connected');
      showToast('Datos sincronizados correctamente', 'green');
    } catch (err: any) {
      console.error(err);
      setDbStatus('error');
      showToast(`Error al cargar datos: ${err.message || err}`, 'amber');
    } finally {
      setLoadingData(false);
    }
  }, [userAuthenticated, showToast]);

  // Load everything on auth success
  useEffect(() => {
    if (userAuthenticated) {
      cargarDesdeBD();
    }
  }, [userAuthenticated, cargarDesdeBD]);

  // 3. Reconciliation Actions
  const handleConfirmar = async (id: number) => {
    const p = abonos.find(x => x.id === id);
    if (!p || !p.facturas.some(f => f.factura)) return;

    try {
      const rows = p.facturas
        .filter(f => f.factura)
        .map(f => {
          const originalFac = facturas.find(x => x.factura === f.factura);
          return {
            operacion: String(p.operacion),
            factura: f.factura,
            razon: f.razon || '',
            importe_factura: originalFac?.saldo_original || p.monto,
            estado: 'confirmado',
            motivo: p.motivo || '',
            confianza: p.confianza || ''
          };
        });

      const { error } = await supabase.from('conciliaciones').upsert(rows, { onConflict: 'operacion,factura' });
      if (error) throw error;

      showToast('Conciliación confirmada e ingresada ✓', 'green');
      await cargarDesdeBD();
    } catch (err: any) {
      alert(`Error al guardar conciliación: ${err.message}`);
    }
  };

  const handleQuitar = async (id: number) => {
    const p = abonos.find(x => x.id === id);
    if (!p) return;

    try {
      const { error } = await supabase.from('conciliaciones').delete().eq('operacion', String(p.operacion));
      if (error) throw error;

      showToast('Asignación cancelada', '');
      await cargarDesdeBD();
    } catch (err: any) {
      alert(`Error al remover conciliación: ${err.message}`);
    }
  };

  const handleArchivar = async (id: number) => {
    const p = abonos.find(x => x.id === id);
    if (!p) return;

    const motivo = prompt("Clasificar abono no operativo (ej: Depósito a plazo, Abono incorrecto, Traspasos):");
    if (!motivo || !motivo.trim()) return;

    try {
      const row = {
        operacion: String(p.operacion),
        factura: 'NO_OPERATIVO',
        razon: motivo.trim(),
        importe_factura: p.monto,
        estado: 'confirmado',
        motivo: 'Clasificación Manual',
        confianza: 'alta'
      };

      const { error } = await supabase.from('conciliaciones').upsert([row], { onConflict: 'operacion,factura' });
      if (error) throw error;

      showToast('Clasificado como No Operativo ✓', 'green');
      await cargarDesdeBD();
    } catch (err: any) {
      alert(`Error al clasificar: ${err.message}`);
    }
  };

  const handleEliminarAbono = async (id: number) => {
    const p = abonos.find(x => x.id === id);
    if (!p) return;

    if (!confirm(`¿Eliminar de forma permanente el abono bancario?\nOP ${p.operacion} — ${p.descripcion}\n\nEsta operación es irreversible.`)) {
      return;
    }

    try {
      await supabase.from('conciliaciones').delete().eq('operacion', String(p.operacion));
      const { error } = await supabase.from('abonos').delete().eq('operacion', String(p.operacion));
      if (error) throw error;

      showToast('Abono eliminado con éxito ✓', 'green');
      await cargarDesdeBD();
    } catch (err: any) {
      alert(`Error al eliminar: ${err.message}`);
    }
  };

  // Multiple Line/Split Invoice Logic in local state
  const handleAgregarLinea = (id: number) => {
    setAbonos(prev => prev.map(p => {
      if (p.id === id) {
        return {
          ...p,
          facturas: [...p.facturas, { factura: '', razon: '' }]
        };
      }
      return p;
    }));
  };

  const handleQuitarLinea = (id: number, idx: number) => {
    setAbonos(prev => prev.map(p => {
      if (p.id === id) {
        const lineas = [...p.facturas];
        if (lineas.length <= 1) {
          lineas[0] = { factura: '', razon: '' };
        } else {
          lineas.splice(idx, 1);
        }
        return {
          ...p,
          facturas: lineas,
          estado: lineas.some(l => l.factura) ? 'manual' : 'pendiente'
        };
      }
      return p;
    }));
  };

  const handleCambiarLinea = (id: number, idx: number, val: string) => {
    setAbonos(prev => prev.map(p => {
      if (p.id === id) {
        const lineas = [...p.facturas];
        const f = facturas.find(x => x.factura === val);
        lineas[idx] = { factura: val, razon: f ? f.razon_social : '' };
        return {
          ...p,
          facturas: lineas,
          estado: val ? 'manual' : 'pendiente',
          motivo: 'Asignación manual',
          confianza: '',
          detraccionAceptada: false
        };
      }
      return p;
    }));
  };

  const handleToggleDetraccion = (id: number, checked: boolean) => {
    setAbonos(prev => prev.map(p => {
      if (p.id === id) {
        return { ...p, detraccionAceptada: checked };
      }
      return p;
    }));
  };

  // 4. Egresos Actions
  const handleCambiarCategoriaEgreso = (id: string, catId: string) => {
    const cat = categorias.find(c => c.id === catId);
    setEgresos(prev => prev.map(e => {
      if (e.id === id) {
        return {
          ...e,
          categoria_id: catId,
          categoria_nombre: cat ? `${cat.grupo}${cat.subgrupo ? ` / ${cat.subgrupo}` : ''}` : ''
        };
      }
      return e;
    }));
  };

  const handleConfirmarEgreso = async (id: string) => {
    const e = egresos.find(x => x.id === id);
    if (!e || !e.categoria_id) {
      alert('Por favor selecciona una categoría presupuestaria antes de confirmar.');
      return;
    }

    try {
      const { error } = await supabase.from('egresos').update({
        categoria_id: e.categoria_id,
        categoria_nombre: e.categoria_nombre,
        estado: 'confirmado'
      }).eq('id', id);

      if (error) throw error;
      showToast('Egreso clasificado correctamente ✓', 'green');
      await cargarDesdeBD();
    } catch (err: any) {
      alert(`Error al registrar clasificación de egreso: ${err.message}`);
    }
  };

  const handleEliminarEgreso = async (id: string) => {
    if (!confirm('¿Eliminar este egreso de la base de datos permanentemente?')) return;

    try {
      const { error } = await supabase.from('egresos').delete().eq('id', id);
      if (error) throw error;
      showToast('Egreso removido ✓', '');
      await cargarDesdeBD();
    } catch (err: any) {
      alert(`Error al eliminar egreso: ${err.message}`);
    }
  };

  // 5. Categorías Presupuestarias Actions
  const handleGuardarCategoria = async (id: string, data: { grupo: string; subgrupo: string; palabras_clave: string }) => {
    const payload = {
      grupo: data.grupo,
      subgrupo: data.subgrupo || null,
      palabras_clave: data.palabras_clave || null,
      activo: true
    };

    try {
      if (id) {
        const { error } = await supabase.from('categorias').update(payload).eq('id', id);
        if (error) throw error;
        showToast('Categoría actualizada ✓', 'green');
      } else {
        const { error } = await supabase.from('categorias').insert({ ...payload, orden: 999 });
        if (error) throw error;
        showToast('Nueva categoría creada ✓', 'green');
      }
      await cargarDesdeBD();
    } catch (err: any) {
      alert(`Error al guardar categoría: ${err.message}`);
    }
  };

  const handleToggleCategoria = async (id: string, activo: boolean) => {
    try {
      const { error } = await supabase.from('categorias').update({ activo }).eq('id', id);
      if (error) throw error;
      showToast(activo ? 'Categoría habilitada' : 'Categoría deshabilitada', 'green');
      await cargarDesdeBD();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  // Helper reader of Excel rows
  const parseExcel = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = e => {
        try {
          const raw = XLSX.read(e.target?.result, { type: 'binary' });
          const wsName = raw.SheetNames[0];
          const ws = raw.Sheets[wsName];
          const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
          resolve(rows);
        } catch (err) {
          reject(err);
        }
      };
      r.onerror = err => reject(err);
      r.readAsBinaryString(file);
    });
  };

  // 6. Excel Uplod Processing
  const handleCargarFacturas = async (file: File) => {
    const rows = await parseExcel(file);
    if (!rows.length) {
      alert('El archivo cargado está vacío.');
      return;
    }

    const headers = Object.keys(rows[0]);
    const esContable = headers.includes('SALDO_S') && headers.includes('SERIE') && headers.includes('NUMERO');
    const esComercial = headers.includes('SERIE_DOC') && headers.includes('NUMERO_DOC');

    const limpiarDocNum = (serie: any, numero: any) => {
      const s = String(serie || '').trim().replace(/^0+/, '');
      const n = String(numero || '').trim().replace(/^0+/, '');
      return s && n ? `${s}-${n}` : null;
    };

    const atraparGlosa = (r: any) => {
      return String(r['GLOSA'] || r['Glosa'] || r['glosa'] || r['DESCRIPCION'] || r['Descripcion'] || '').trim();
    };

    let nuevas: any[] = [];

    if (esContable) {
      const resumenContable: { [key: string]: any } = {};
      rows.forEach(r => {
        const codFactura = limpiarDocNum(r['SERIE'], r['NUMERO']);
        if (!codFactura) return;
        const monedaDoc = String(r['M_REG'] || 'S').trim().toUpperCase();
        const esDolares = (monedaDoc === 'D' || monedaDoc === 'USD');
        const saldoFila = esDolares ? parseFloat(r['SALDO_USD'] || 0) : parseFloat(r['SALDO_S'] || 0);

        if (!resumenContable[codFactura] || saldoFila < resumenContable[codFactura].saldo) {
          resumenContable[codFactura] = {
            factura: codFactura,
            razon_social: String(r['RAZON_SOCIAL'] || '').trim(),
            fecha_doc: fmtFecha(r['FECHA_DOC']),
            fecha_ven: fmtFecha(r['FECHA_VEN']),
            saldo: saldoFila,
            mes: parseInt(r['MES']) || 0,
            moneda: esDolares ? 'USD' : 'PEN',
            glosa: atraparGlosa(r),
            tipo_cambio: parseFloat(r['TIPO_CAMBIO'] || 0),
            ruc: String(r['RUC'] || '').trim(),
            cuenta_contable: String(r['CUENTA'] || '').trim()
          };
        }
      });
      nuevas = Object.values(resumenContable).filter(f => f.saldo > 0);
    } else if (esComercial) {
      const resumenComercial: { [key: string]: any } = {};
      rows.forEach(r => {
        const codFactura = limpiarDocNum(r['SERIE_DOC'], r['NUMERO_DOC']);
        if (!codFactura) return;
        const totalFila = parseFloat(r['TOTAL'] || 0);
        const monedaRaw = String(r['MONEDA'] || r['M_REG'] || r['TIPO_MONEDA'] || 'S').trim().toUpperCase();
        const esDolaresFila = (monedaRaw === 'D' || monedaRaw === 'USD' || monedaRaw === 'DOLARES');

        if (!resumenComercial[codFactura]) {
          resumenComercial[codFactura] = {
            factura: codFactura,
            razon_social: String(r['RAZON_SOCIAL'] || '').trim(),
            fecha_doc: fmtFecha(r['FECHA_DOC']),
            saldo: 0,
            mes: parseInt(r['MES']) || 0,
            moneda: esDolaresFila ? 'USD' : 'PEN',
            glosa: atraparGlosa(r),
            rubro: String(r['DESC_PROD'] || r['COD_PROD'] || '').trim(),
            tipo_cambio: parseFloat(r['TIPO_CAMBIO'] || r['TC'] || 0),
            ruc: String(r['RUC'] || '').trim(),
            cuenta_contable: String(r['CUENTA'] || '').trim()
          };
        }
        resumenComercial[codFactura].saldo += totalFila;
      });
      nuevas = Object.values(resumenComercial).filter(f => f.saldo > 0);
    } else {
      alert('Archivo de facturas no reconocido. Verifica las cabeceras.');
      return;
    }

    const { error } = await supabase.from('facturas').upsert(nuevas, { onConflict: 'factura' });
    if (error) throw error;
    showToast(`Procesadas ${nuevas.length} facturas con éxito.`, 'green');
  };

  const handleCargarBancos = async (file: File) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const raw = XLSX.read(e.target?.result, { type: 'binary' });
          const ws = raw.Sheets[raw.SheetNames[0]];
          const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

          if (!rawData.length) {
            alert('El archivo bancario seleccionado está vacío.');
            resolve();
            return;
          }

          let esDolares = false, esNacion = false, esInterbank = false, esScotiabank = false, esBbva = false;
          let headerIdx = -1, monedaBanco = 'PEN';

          for (let i = 0; i < Math.min(rawData.length, 25); i++) {
            const filaTexto = rawData[i].join(' ').toUpperCase();
            if (filaTexto.includes('DÓLARES') || filaTexto.includes('DOLARES') || filaTexto.includes('USD') || filaTexto.includes('US$') || filaTexto.includes('CCME') || filaTexto.includes('IMPORTES EN: USD')) {
              esDolares = true;
              monedaBanco = 'USD';
            }
            if (filaTexto.includes('CARGO') && filaTexto.includes('ABONO') && filaTexto.includes('RUC') && filaTexto.includes('OFICINA') && !filaTexto.includes('F. OPERACIÓN')) {
              esNacion = true;
              headerIdx = i;
              break;
            }
            if (filaTexto.includes('FECHA DE OPERACIÓN') && filaTexto.includes('NRO. DE OPERACIÓN') && filaTexto.includes('CARGO') && filaTexto.includes('ABONO')) {
              esInterbank = true;
              headerIdx = i;
              break;
            }
            if (filaTexto.includes('FECHA') && filaTexto.includes('MOVIMIENTO') && filaTexto.includes('IMPORTE') && filaTexto.includes('REFERENCIA') && filaTexto.includes('CDR')) {
              esScotiabank = true;
              headerIdx = i;
              break;
            }
            if (filaTexto.includes('F. OPERACIÓN') && filaTexto.includes('CONCEPTO') && filaTexto.includes('IMPORTE') && filaTexto.includes('OFICINA')) {
              esBbva = true;
              headerIdx = i;
              break;
            }
            if ((filaTexto.includes('MONTO') || filaTexto.includes('IMPORTE')) && filaTexto.includes('OPERACI') && !esBbva && !esInterbank) {
              headerIdx = i;
              break;
            }
          }

          if (headerIdx === -1) {
            alert('No se detectó el formato bancario de cabeceras.');
            resolve();
            return;
          }

          const nuevos: any[] = [];
          const egresosRaw: any[] = [];
          const limpiarMonto = (texto: any) => {
            let limpio = String(texto || '').replace(/[S\/\$\s,]/g, '').trim();
            return parseFloat(limpio) || 0;
          };

          if (esBbva) {
            const headers = rawData[headerIdx].map(h => String(h).trim().toUpperCase());
            const colFecha = headers.findIndex(h => h.includes('F. OPERACI'));
            const colDoc = headers.findIndex(h => h.includes('Nº. DOC') || h.includes('N. DOC') || h.includes('NRO. DOC') || h.includes('DOC.'));
            const colConcepto = headers.findIndex(h => h.includes('CONCEPTO'));
            const colImporte = headers.findIndex(h => h === 'IMPORTE');
            
            for (let i = headerIdx + 1; i < rawData.length; i++) {
              const r = rawData[i];
              if (!r || r.length === 0) continue;
              let fechaVal = String(r[colFecha] || '').trim();
              if (!fechaVal || fechaVal.toUpperCase().includes('SALDO')) continue;
              const montoVal = limpiarMonto(r[colImporte]);
              if (montoVal === 0) continue;
              let opVal = String(r[colDoc] || '').trim();
              if (!opVal || opVal === '-') opVal = 'BBVA-' + fechaVal.replace(/\//g, '') + '-' + i;
              const obj = { operacion: opVal, fecha: fmtFecha(fechaVal), descripcion: String(r[colConcepto] || '').trim(), moneda: monedaBanco };
              
              if (montoVal > 0) nuevos.push({ ...obj, monto: montoVal });
              else egresosRaw.push({ ...obj, monto: Math.abs(montoVal), estado: 'pendiente' });
            }
          } else if (esScotiabank) {
            const headers = rawData[headerIdx].map(h => String(h).trim().toUpperCase());
            const colFecha = headers.findIndex(h => h === 'FECHA');
            const colMov = headers.findIndex(h => h === 'MOVIMIENTO');
            const colImporte = headers.findIndex(h => h === 'IMPORTE');
            const colRef = headers.findIndex(h => h === 'REFERENCIA');
            
            for (let i = headerIdx + 1; i < rawData.length; i++) {
              const r = rawData[i];
              if (!r || r.length === 0) continue;
              const montoVal = limpiarMonto(r[colImporte]);
              let opVal = String(r[colRef] || '').trim();
              const fechaVal = String(r[colFecha] || '').trim();
              if (!fechaVal || montoVal === 0) continue;
              if (!opVal) opVal = 'SCO-' + fechaVal.replace(/\//g, '') + '-' + i;
              const obj = { operacion: opVal, fecha: fmtFecha(fechaVal), descripcion: String(r[colMov] || '').trim(), moneda: monedaBanco };
              
              if (montoVal > 0) nuevos.push({ ...obj, monto: montoVal });
              else egresosRaw.push({ ...obj, monto: Math.abs(montoVal), estado: 'pendiente' });
            }
          } else if (esInterbank) {
            const headers = rawData[headerIdx].map(h => String(h).trim().toUpperCase());
            const colFecha = headers.findIndex(h => h.includes('FECHA DE OPERACI'));
            const colOp = headers.findIndex(h => h.includes('NRO. DE OPERACI'));
            const colMov = headers.findIndex(h => h === 'MOVIMIENTO');
            const colDesc = headers.findIndex(h => h === 'DESCRIPCIÓN' || h === 'DESCRIPCION');
            const colCargo = headers.findIndex(h => h === 'CARGO');
            const colAbono = headers.findIndex(h => h === 'ABONO');
            
            for (let i = headerIdx + 1; i < rawData.length; i++) {
              const r = rawData[i];
              if (!r || r.length === 0) continue;
              let montoAbono = limpiarMonto(r[colAbono]);
              let montoCargo = Math.abs(limpiarMonto(r[colCargo]));
              let opVal = String(r[colOp] || '').trim();
              let fechaVal = String(r[colFecha] || '').trim();
              if (!fechaVal || (montoAbono === 0 && montoCargo === 0)) continue;
              if (opVal === '-' || opVal === '') opVal = 'INT-' + fechaVal.replace(/\//g, '') + '-' + i;
              const glosaCompleta = [String(r[colMov] || '').trim(), String(r[colDesc] || '').trim()].filter(Boolean).join(' - ');
              const obj = { operacion: opVal, fecha: fmtFecha(fechaVal), descripcion: glosaCompleta, moneda: monedaBanco };
              
              if (montoAbono > 0) nuevos.push({ ...obj, monto: montoAbono });
              else if (montoCargo > 0) egresosRaw.push({ ...obj, monto: montoCargo, estado: 'pendiente' });
            }
          } else if (esNacion) {
            const headers = rawData[headerIdx].map(h => String(h).trim().toUpperCase());
            const colFecha = headers.findIndex(h => h === 'FECHA');
            const colDoc = headers.findIndex(h => h === 'DOCUMENTO');
            const colRuc = headers.findIndex(h => h === 'RUC');
            const colTrans = headers.findIndex(h => h === 'TRANS.');
            const colCargo = headers.findIndex(h => h === 'CARGO');
            const colAbono = headers.findIndex(h => h === 'ABONO');
            
            for (let i = headerIdx + 1; i < rawData.length; i++) {
              const r = rawData[i];
              if (!r || r.length === 0) continue;
              let montoAbono = limpiarMonto(r[colAbono]);
              let montoCargo = limpiarMonto(r[colCargo]);
              let opVal = String(r[colDoc] || '').trim();
              if (!opVal || (montoAbono === 0 && montoCargo === 0)) continue;
              let fRaw = String(r[colFecha] || '').replace(/\./g, '-');
              const rucVal = String(r[colRuc] || '').trim();
              const obj = { 
                operacion: opVal, 
                fecha: fmtFecha(fRaw), 
                descripcion: `DETRACCION BN - ${String(r[colTrans] || '').trim()} - RUC: ${rucVal}`, 
                referencia2: rucVal, 
                moneda: 'PEN' 
              };
              
              if (montoAbono > 0) nuevos.push({ ...obj, monto: montoAbono });
              else if (montoCargo > 0) egresosRaw.push({ ...obj, monto: montoCargo, estado: 'pendiente' });
            }
          } else {
            // Libro Mayor Genérico
            const headers = rawData[headerIdx].map(h => String(h).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim());
            const colFecha = headers.findIndex(h => /^fecha$/.test(h) || h.includes('fecha valuta'));
            const colDesc = headers.findIndex(h => h.includes('descripci'));
            const colGlosa = headers.findIndex(h => h.includes('glosa'));
            const colMonto = headers.findIndex(h => /^monto$/.test(h) || h.includes('importe'));
            const colOp = headers.findIndex(h => h.includes('operaci') && (h.includes('n.m') || h.includes('nro') || h.includes('numero')));
            const colRef2 = headers.findIndex(h => h.includes('referencia2'));
            const colFactura = headers.findIndex(h => h === 'factura');
            const colEstado = headers.findIndex(h => h === 'estado');
            const colOrd = headers.findIndex(h => h === 'ordenante');
            const colMoneda = headers.findIndex(h => h === 'moneda' || h.includes('moneda'));
            const opIndex = colOp !== -1 ? colOp : headers.findIndex(h => h.includes('operaci'));
            
            let contPEN = 0, contUSD = 0;

            for (let i = headerIdx + 1; i < rawData.length; i++) {
              const r = rawData[i];
              if (!r || r.length === 0) continue;
              const valorFactura = colFactura !== -1 ? String(r[colFactura] || '').trim().toUpperCase() : '';
              const valorEstado = colEstado !== -1 ? String(r[colEstado] || '').trim().toUpperCase() : '';
              if (valorFactura === 'FDC' || valorFactura.includes('FDC') || valorEstado.includes('FDC')) continue;

              const montoVal = limpiarMonto(r[colMonto]);
              const opVal = String(r[opIndex] || '').trim();
              if (!opVal || montoVal === 0) continue;
              const ordVal = colOrd !== -1 ? String(r[colOrd] || '').trim() : '';

              let monedaFila = monedaBanco;
              if (colMoneda !== -1) {
                const txtMoneda = String(r[colMoneda] || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
                monedaFila = (txtMoneda.includes('DOLAR') || txtMoneda.includes('USD')) ? 'USD' : 'PEN';
              }
              if (monedaFila === 'USD') contUSD++; else contPEN++;

              const obj = {
                operacion: opVal,
                fecha: fmtFecha(r[colFecha] || ''),
                descripcion: colDesc !== -1 ? String(r[colDesc]).trim() : '',
                glosa: colGlosa !== -1 ? String(r[colGlosa]).trim() : '',
                referencia2: colRef2 !== -1 ? String(r[colRef2]).trim() : '',
                ordenante: ordVal,
                moneda: monedaFila
              };

              if (montoVal > 0) nuevos.push({ ...obj, monto: montoVal });
              else egresosRaw.push({ operacion: obj.operacion, fecha: obj.fecha, descripcion: obj.descripcion, glosa: obj.glosa, referencia2: obj.referencia2, moneda: obj.moneda, monto: Math.abs(montoVal), estado: 'pendiente' });
            }
          }

          // Inserción en Supabase
          const { error: abonosErr } = await supabase.from('abonos').upsert(nuevos, { onConflict: 'operacion', ignoreDuplicates: true });
          if (abonosErr) throw abonosErr;

          if (egresosRaw.length) {
            const { error: egrErr } = await supabase.from('egresos').upsert(egresosRaw, { onConflict: 'operacion', ignoreDuplicates: true });
            if (egrErr) throw egrErr;
          }

          showToast('Movimientos bancarios cargados', 'green');
          resolve();
        } catch (err: any) {
          reject(err);
        }
      };
      reader.readAsBinaryString(file);
    });
  };

  const handleCargarInter = async (file: File) => {
    const rawData = await parseExcel(file);
    if (!rawData.length) return;

    let headerIdx = -1, colOpKey = '', colOrdKey = '';

    for (let i = 0; i < Math.min(rawData.length, 25); i++) {
      const filaArr = Object.keys(rawData[i]).map(c => String(c).trim().toUpperCase());
      let opMatch = filaArr.find(c => c.includes('NÚMERO - OPERACIÓN') || c.includes('NRO') || c.includes('NUMERO'));
      if (!opMatch) opMatch = filaArr.find(c => c.includes('OPERACI') && !c.includes('TIPO'));
      const ordMatch = filaArr.find(c => c.includes('ORDENANTE') || c.includes('BENEFICIARIO') || c.includes('CLIENTE') || c.includes('NOMBRE'));
      
      if (opMatch && ordMatch) {
        headerIdx = i;
        colOpKey = opMatch;
        colOrdKey = ordMatch;
        break;
      }
    }

    // Process rows
    const localInterMap: { [key: string]: string } = {};
    rawData.forEach((row: any) => {
      const keys = Object.keys(row);
      const opKey = keys.find(k => k.toUpperCase().includes('NÚMERO - OPERACIÓN') || k.toUpperCase().includes('NUMERO') || k.toUpperCase().includes('OPERACION'));
      const ordKey = keys.find(k => k.toUpperCase().includes('ORDENANTE') || k.toUpperCase().includes('BENEFICIARIO') || k.toUpperCase().includes('CLIENTE') || k.toUpperCase().includes('NOMBRE'));
      
      if (opKey && ordKey) {
        const op = String(row[opKey] || '').trim().replace(/^0+/, '');
        const ord = String(row[ordKey] || '').trim();
        if (op) localInterMap[op] = ord;
      }
    });

    setInterMap(localInterMap);
    showToast(`Cargados ${Object.keys(localInterMap).length} interbancarios`, 'green');
  };

  const handleCargarBD = async (file: File) => {
    const rawData = await parseExcel(file);
    const localBdMap: { [key: string]: any } = {};

    rawData.forEach(r => {
      const keys = Object.keys(r);
      const colOpBD = keys.find(k => /^op$/i.test(k)) || keys[30];
      const colGlosa = keys.find(k => /^glosa/i.test(k)) || keys[47];
      if (colOpBD) {
        const op = String(r[colOpBD] || '').trim().replace(/^0+/, '');
        if (op) localBdMap[op] = { ...r, glosa: r[colGlosa] || '' };
      }
    });

    setBdMap(localBdMap);
    showToast(`Cargados ${Object.keys(localBdMap).length} registros del Libro Mayor`, 'green');
  };

  const handleCorregirGlosas = async (file: File) => {
    const rawData = await parseExcel(file);
    if (!rawData.length) return;

    let actualizados = 0;
    for (const r of rawData) {
      const keys = Object.keys(r);
      const opKey = keys.find(k => k.toLowerCase().includes('operaci'));
      const glosaKey = keys.find(k => k.toLowerCase().includes('glosa'));
      
      if (opKey && glosaKey) {
        const opVal = String(r[opKey] || '').trim();
        const glosaVal = String(r[glosaKey] || '').trim();
        if (opVal && glosaVal) {
          const { error } = await supabase.from('abonos').update({ glosa: glosaVal }).eq('operacion', opVal);
          if (!error) actualizados++;
        }
      }
    }

    showToast(`Glosas corregidas: ${actualizados}`, 'green');
    await cargarDesdeBD();
  };

  const handleCargarBackupJSON = async (file: File) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          const backup = JSON.parse(content);
          if (!backup || !backup.confirmaciones) {
            alert('El archivo no tiene el formato de backup de conciliaciones válido.');
            resolve();
            return;
          }

          const ops = Object.keys(backup.confirmaciones);
          if (!ops.length) {
            alert('No hay conciliaciones para restaurar en este backup.');
            resolve();
            return;
          }

          setLoadingData(true);
          let insertadas = 0;
          const totalOps = ops.length;

          // Prepare records for database insertion
          const rowsToInsert: any[] = [];
          for (const operacion of ops) {
            const data = backup.confirmaciones[operacion];
            const facturasList = data.facturas || [];
            
            for (const fItem of facturasList) {
              if (fItem.factura) {
                rowsToInsert.push({
                  operacion: String(operacion),
                  factura: String(fItem.factura),
                  razon: String(fItem.razon || ''),
                  importe_factura: parseFloat(fItem.importe_factura) || parseFloat(data.monto) || 0,
                  estado: 'confirmado',
                  motivo: data.motivo || 'Asignación manual (Restaurado)',
                  confianza: 'alta'
                });
              }
            }
          }

          if (rowsToInsert.length > 0) {
            // Bulk upsert into conciliaciones table
            const { error } = await supabase
              .from('conciliaciones')
              .upsert(rowsToInsert, { onConflict: 'operacion,factura' });
            
            if (error) throw error;
            insertadas = rowsToInsert.length;
          }

          showToast(`Se restauraron ${totalOps} abonos conciliados (${insertadas} cruces) ✓`, 'green');
          await cargarDesdeBD();
          resolve();
        } catch (err: any) {
          alert(`Error al restaurar el backup: ${err.message || err}`);
          reject(err);
        } finally {
          setLoadingData(false);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  };

  const handleProcesarYCerrar = async () => {
    await cargarDesdeBD();
    // Merge interbancarios and ordenantes local state
    if (Object.keys(interMap).length > 0) {
      setAbonos(prev => prev.map(p => {
        const opClean = String(p.operacion).trim().replace(/^0+/, '');
        const ord = interMap[opClean];
        if (ord) return { ...p, ordenante: ord };
        return p;
      }));
    }
  };

  // 7. Data Export Utilities
  const handleExportarCSV = () => {
    const headers = ['Fecha', 'Descripcion', 'Ordenante', 'Moneda', 'Monto Abono', 'Operacion - Numero', 'Factura_Cancelada', 'Empresa', 'Importe Factura', 'Saldo por Asignar', 'Estado'];
    const rows = [headers];

    abonos.forEach(p => {
      const facts = p.facturas.filter(f => f.factura);
      const base = [p.fecha, p.descripcion, p.ordenante || '', p.moneda === 'USD' ? 'USD' : 'PEN', p.monto, p.operacion];
      
      if (!facts.length) {
        rows.push([...base, '', '', '', p.monto, p.estado]);
      } else {
        const sumF = facts.reduce((acc, f) => {
          const fd = facturas.find(x => x.factura === f.factura) || {};
          return acc + parseFloat(String(fd.saldo_original || fd.saldo || 0));
        }, 0);
        const saldo = Math.round((p.monto - sumF) * 100) / 100;
        
        facts.forEach((f, idx) => {
          const fd = facturas.find(x => x.factura === f.factura) || {};
          rows.push([
            ...base, 
            f.factura, 
            f.razon || '', 
            String(fd.saldo_original || fd.saldo || ''), 
            idx === facts.length - 1 && saldo > 0 ? String(saldo) : '', 
            p.estado
          ]);
        });
      }
    });

    const csvContent = "\uFEFF" + rows.map(r => r.map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `conciliacion_capeco_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    showToast('CSV de conciliación exportado ✓', 'green');
  };

  const handleExportarSistema = () => {
    const confirmados = abonos.filter(
      p => (p.estado === 'confirmado' || p.estado === 'manual') && p.facturas && p.facturas.some(f => f.factura && f.factura !== 'NO_OPERATIVO')
    );

    if (confirmados.length === 0) {
      alert("No hay abonos confirmados o cruzados con facturas para exportar.");
      return;
    }

    const datosExportar: any[] = [];

    confirmados.forEach(p => {
      const glosaMayor = String(p.glosa || p.descripcion || '').trim();
      const partesGlosa = glosaMayor.split(/\s+/);
      const bancoTresLetras = partesGlosa[0] ? partesGlosa[0].toUpperCase().substring(0, 3) : '';
      const cuentaTresDigitos = partesGlosa[1] ? partesGlosa[1].substring(0, 3) : '';

      const configCta = TABLA_CUENTAS[cuentaTresDigitos] || {
        cta_contable: 'REVISAR',
        mon: p.moneda === 'USD' ? 'D' : 'S'
      };

      const facturasValidas = p.facturas.filter(f => f.factura && f.factura !== 'NO_OPERATIVO');
      const totalAbono = p.monto;
      let distribuido = facturasValidas.length > 0 ? (totalAbono / facturasValidas.length) : totalAbono;

      facturasValidas.forEach(linea => {
        const fDB = facturas.find(x => x.factura === linea.factura) || {};
        let [serieRaw, correlativoRaw] = (linea.factura || '').split('-');
        const serie = (serieRaw || '').trim().padStart(20, '0');
        const correlativo = (correlativoRaw || '').trim().padStart(20, '0');

        const esBoleta = linea.factura.toUpperCase().startsWith('B');
        const tipoDoc = esBoleta ? '03' : '01';
        const cuenta6_final = fDB.cuenta_contable ? fDB.cuenta_contable : (esBoleta ? '121203' : '121201');

        const impSoles = configCta.mon === 'S' ? distribuido.toFixed(2) : '';
        const impDolares = configCta.mon === 'D' ? distribuido.toFixed(2) : '';

        datosExportar.push({
          'Fecha2': p.fecha || '',
          'cdoccan C(2)': '000',
          'banco3': bancoTresLetras,
          'op': p.operacion || '',
          'Cta banco': configCta.cta_contable,
          'M*': configCta.mon,
          'IMPORTE': impSoles,
          'TC4': fDB.tipo_cambio ? parseFloat(String(fDB.tipo_cambio)).toFixed(4) : '1.0000',
          'Cod pago': '003',
          'tipo doc': tipoDoc,
          'Serie': serie,
          'Correlativo': correlativo,
          'Fecha5': fDB.fecha_doc || '',
          'VENC': fDB.fecha_ven || fDB.fecha_doc || '',
          'cod identificacion': '01',
          'RUC': fDB.ruc || '',
          'razon social': fDB.razon_social || '',
          'Importe documento': (fDB.saldo_original !== undefined ? parseFloat(String(fDB.saldo_original)) : parseFloat(String(fDB.saldo))).toFixed(2),
          'dolares': impDolares,
          'cuenta6': cuenta6_final,
          'GLOSA7': glosaMayor
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(datosExportar);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Export_ERP");
    XLSX.writeFile(wb, `Exportacion_Contable_CAPECO.xlsx`);
    showToast('Planilla ERP descargada ✓', 'green');
  };

  const handleExportarEstadoBackup = () => {
    const data: { [key: string]: any } = {};
    abonos.filter(p => p.estado === 'confirmado' || p.estado === 'manual').forEach(p => {
      data[p.operacion] = {
        estado: p.estado,
        facturas: p.facturas,
        motivo: p.motivo,
        fecha: p.fecha,
        descripcion: p.descripcion,
        monto: p.monto
      };
    });

    if (!Object.keys(data).length) {
      alert('No hay abonos confirmados para respaldar.');
      return;
    }

    const jsonContent = JSON.stringify({ version: 1, exportado: new Date().toISOString(), confirmaciones: data }, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `estado_backup_capeco_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    showToast('Backup JSON guardado ✓', 'green');
  };

  const handleExportarEgresos = () => {
    const headers = ['Fecha', 'Descripcion', 'Referencia', 'Monto', 'Operacion', 'Categoria', 'Estado'];
    const rows = [headers];

    egresos.forEach(e => {
      rows.push([
        e.fecha,
        `"${(e.descripcion || '').replace(/"/g, '""')}"`,
        `"${(e.referencia2 || '').replace(/"/g, '""')}"`,
        String(e.monto),
        e.operacion,
        `"${(e.categoria_nombre || '').replace(/"/g, '""')}"`,
        e.estado
      ]);
    });

    const csvContent = "\uFEFF" + rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `egresos_capeco_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    showToast('CSV de egresos descargado ✓', 'green');
  };

  // 8. Stats Memoized Calculators
  const statsConciliacion = useMemo(() => {
    const conf = abonos.filter(p => p.estado === 'confirmado');
    const pend = abonos.filter(p => p.estado !== 'confirmado');
    const pct = abonos.length ? Math.round(conf.length / abonos.length * 100) : 0;

    let pendPEN = 0;
    let pendUSD = 0;
    pend.forEach(p => {
      const mVal = p.monto;
      if (p.moneda === 'USD') pendUSD += mVal;
      else pendPEN += mVal;
    });

    return {
      total: abonos.length,
      confirmados: conf.length,
      pendientes: pend.length,
      progreso: pct,
      montoPendPEN: pendPEN,
      montoPendUSD: pendUSD
    };
  }, [abonos]);

  const statsEgresos = useMemo(() => {
    const conf = egresos.filter(e => e.estado === 'confirmado').length;
    const pend = egresos.filter(e => e.estado === 'pendiente').length;
    
    let totalPEN = 0;
    let totalUSD = 0;
    
    egresos.forEach(e => {
      if (e.moneda === 'USD') totalUSD += e.monto;
      else totalPEN += e.monto;
    });

    const pct = egresos.length ? Math.round(conf / egresos.length * 100) : 0;

    return {
      total: egresos.length,
      clasificados: conf,
      sinClasificar: pend,
      montoPEN: totalPEN,
      montoUSD: totalUSD,
      progreso: pct
    };
  }, [egresos]);

  const statsMiniMessage = useMemo(() => {
    return `${statsConciliacion.confirmados}/${statsConciliacion.total} confirmados`;
  }, [statsConciliacion]);

  // Loading Session Screen
  if (loadingSession) {
    return (
      <div className="fixed inset-0 bg-slate-50 flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 text-capeco-blue animate-spin mb-4" />
        <h2 className="text-sm font-semibold text-slate-800 font-mono">CAPECO ERP</h2>
        <p className="text-xs text-slate-400 mt-1">Cargando módulos contables de conciliación...</p>
      </div>
    );
  }

  // Not Authenticated
  if (!userAuthenticated) {
    return <LoginOverlay onLoginSuccess={() => setUserAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar Component */}
      <Sidebar 
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        onExportCSV={handleExportarCSV}
        onExportSistema={handleExportarSistema}
        onExportEstado={handleExportarEstadoBackup}
        dbStatus={dbStatus}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        statsMini={statsMiniMessage}
      />

      {/* Main Panel Content Area */}
      <div 
        className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${
          isSidebarCollapsed ? 'ml-16' : 'ml-64'
        }`}
      >
        {/* Top bar sticky area */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-md font-bold text-slate-900 font-mono capitalize">
              {currentPage === 'conciliacion' && 'Conciliación Bancaria'}
              {currentPage === 'facturas' && 'Facturas Pendientes'}
              {currentPage === 'egresos' && 'Clasificación de Egresos'}
              {currentPage === 'categorias' && 'Administrar Categorías Presupuestarias'}
              {currentPage === 'reportes' && 'Reportes Estadísticos y Alertas'}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsUploadOpen(true)}
              className="px-4 py-2 bg-capeco-blue hover:bg-capeco-blue-dark text-white rounded-xl text-xs font-semibold shadow-sm transition-all duration-150 flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Cargar Archivos
            </button>
          </div>
        </header>

        {/* Dynamic page container body */}
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
          {loadingData ? (
            <div className="h-[60vh] flex flex-col items-center justify-center">
              <RefreshCw className="w-8 h-8 text-capeco-blue animate-spin mb-3" />
              <p className="text-xs text-slate-500 font-medium">Sincronizando registros financieros en vivo...</p>
            </div>
          ) : (
            <>
              {currentPage === 'conciliacion' && (
                <Conciliacion 
                  abonos={abonos}
                  facturas={facturas}
                  onConfirmar={handleConfirmar}
                  onQuitar={handleQuitar}
                  onArchivar={handleArchivar}
                  onEliminar={handleEliminarAbono}
                  onAgregarLinea={handleAgregarLinea}
                  onQuitarLinea={handleQuitarLinea}
                  onCambiarLinea={handleCambiarLinea}
                  onToggleDetraccion={handleToggleDetraccion}
                  stats={statsConciliacion}
                />
              )}

              {currentPage === 'facturas' && (
                <Facturas facturas={facturas} />
              )}

              {currentPage === 'egresos' && (
                <Egresos 
                  egresos={egresos}
                  categorias={categorias}
                  onConfirmarEgreso={handleConfirmarEgreso}
                  onCambiarCategoriaEgreso={handleCambiarCategoriaEgreso}
                  onEliminarEgreso={handleEliminarEgreso}
                  onExportarEgresos={handleExportarEgresos}
                  stats={statsEgresos}
                />
              )}

              {currentPage === 'categorias' && (
                <Categorias 
                  categorias={categorias}
                  onGuardarCategoria={handleGuardarCategoria}
                  onToggleCategoria={handleToggleCategoria}
                />
              )}

              {currentPage === 'reportes' && (
                <Reportes facturas={facturas} abonos={abonos} />
              )}

              {currentPage === 'asistente-ai' && (
                <AsistenteAI 
                  abonos={abonos}
                  facturas={facturas}
                  onCambiarLinea={handleCambiarLinea}
                  showToast={showToast}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Upload Modal */}
      <UploadModal 
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onCargarFacturas={handleCargarFacturas}
        onCargarBancos={handleCargarBancos}
        onCargarInter={handleCargarInter}
        onCargarBD={handleCargarBD}
        onCorregirGlosas={handleCorregirGlosas}
        onCargarBackupJSON={handleCargarBackupJSON}
        procesarYCerrar={handleProcesarYCerrar}
      />

      {/* Floating Interactive Toast Alerts */}
      {toast && (
        <div 
          className={`fixed bottom-6 right-6 z-9999 px-5 py-3.5 rounded-2xl shadow-xl flex items-center gap-2.5 border transition-all duration-300 transform translate-y-0 opacity-100 ${
            toast.type === 'green' 
              ? 'bg-emerald-50 border-emerald-150 text-emerald-800' 
              : toast.type === 'amber' 
                ? 'bg-amber-50 border-amber-150 text-amber-800' 
                : 'bg-white border-slate-200 text-slate-800'
          }`}
        >
          <CheckCircle className={`w-4 h-4 ${toast.type === 'green' ? 'text-emerald-500' : 'text-slate-400'}`} />
          <span className="text-xs font-semibold leading-tight font-sans">{toast.text}</span>
        </div>
      )}
    </div>
  );
}
