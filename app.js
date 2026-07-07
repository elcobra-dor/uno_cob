// ─── SUPABASE ────────────────────────────────────────────────────────────────
const SUPA_URL = 'https://olfbhboheiewqugmiqvy.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sZmJoYm9oZWlld3F1Z21pcXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDM3MjQsImV4cCI6MjA5NTIxOTcyNH0.-7wMmoT1AnPtLiNiEnqbZifksXOOUZF8Eg-pZG8J_mE';
const { createClient } = supabase;
const db = createClient(SUPA_URL, SUPA_KEY);

// ─── ESTADO GLOBAL ───────────────────────────────────────────────────────────
let FACTURAS  = [];
let PAGOS     = [];
let INTER_MAP = {};
let BD_MAP    = {};
let EGRESOS = [];
let CATEGORIAS = [];

// ─── UTILS Y SEGURIDAD ───────────────────────────────────────────────────────
function escaparHTML(texto) {
  if (!texto) return '';
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

const buscarFacturasDebounced = debounce(renderFacturas, 300);
const buscarConciliacionDebounced = debounce(render, 300);
const buscarEgresosDebounced = debounce(renderEgresos, 300);

function norm(s){ return (s||'').toUpperCase().replace(/[^A-Z0-9]/g,' ').replace(/\s+/g,' ').trim(); }
function toast(msg, tipo=''){
  const t=document.getElementById('toast');
  t.textContent=msg; t.className='toast show'+(tipo?' '+tipo:'');
  setTimeout(()=>t.className='toast',3000);
}
function fmtFecha(v){
  if(!v) return null;
  if(typeof v==='number'){ const d=new Date((v-25569)*86400000); return d.toISOString().slice(0,10); }
  if(v instanceof Date) return v.toISOString().slice(0,10);
  if(typeof v==='string'){
    const s=v.trim();
    const m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if(m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    const m2=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
    if(m2) return `20${m2[3]}-${m2[1].padStart(2,'0')}-${m2[2].padStart(2,'0')}`;
    return s.slice(0,10);
  }
  return null;
}
function leerExcel(file){ return new Promise(res=>{ const r=new FileReader(); r.onload=e=>res(XLSX.read(e.target.result,{type:'binary'})); r.readAsBinaryString(file); }); }
function fmtMonto(n, moneda){
  const simbolo = (moneda==='USD') ? 'US$ ' : 'S/ ';
  return simbolo+parseFloat(n||0).toLocaleString('es-PE',{minimumFractionDigits:2});
}

// Reglas de detracción SUNAT
const UMBRAL_DETRACCION_PEN = 700;
const UMBRAL_DETRACCION_USD = 212;
function esSerieDetraccion(numFactura){
  const s = String(numFactura||'').toUpperCase();
  return s.startsWith('F201') || s.startsWith('F301');
}
function requiereDetraccionPEN(f){
  if(!esSerieDetraccion(f.factura)) return false;
  const umbral = (f.moneda==='USD') ? UMBRAL_DETRACCION_USD : UMBRAL_DETRACCION_PEN;
  const saldoBase = f.saldo_original !== undefined ? f.saldo_original : parseFloat(f.saldo||0);
  return saldoBase > umbral;
}
function esAbonoDetraccionBN(p){
  return /^DETRACCION BN/i.test(p.descripcion||'');
}
function diasHasta(fecha){
  if(!fecha) return null;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  let str = String(fecha).trim().split(' ')[0].split('T')[0];
  let f;
  const mLatino = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(mLatino) {
    f = new Date(parseInt(mLatino[3]), parseInt(mLatino[2]) - 1, parseInt(mLatino[1]));
  } else {
    const mISO = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if(mISO) {
      f = new Date(parseInt(mISO[1]), parseInt(mISO[2]) - 1, parseInt(mISO[3]));
    } else {
      f = new Date(str);
    }
  }
  if(!f || isNaN(f.getTime())) return null;
  f.setHours(0,0,0,0);
  return Math.round((f - hoy) / 86400000); 
}

// ─── NUEVO MOTOR DE SALDOS DINÁMICOS ─────────────────────────────────────────
function recalcularSaldos() {
  // 1. Restauramos todas las facturas a su saldo original
  FACTURAS.forEach(f => {
    if (f.saldo_original === undefined) f.saldo_original = parseFloat(f.saldo) || 0;
    f.saldo = f.saldo_original;
  });
  
  // 2. Restamos matemáticamente todos los cobros asignados
  PAGOS.forEach(p => {
    if ((p.estado === 'confirmado' || p.estado === 'manual' || p.estado === 'sugerida') && p.facturas) {
      let disponible = parseFloat(p.monto) || 0;
      p.facturas.forEach(linea => {
        if (!linea.factura) return;
        const f = FACTURAS.find(x => x.factura === linea.factura);
        if (f && disponible > 0) {
          const cobro = Math.min(disponible, f.saldo);
          f.saldo -= cobro;
          disponible -= cobro;
        }
      });
    }
  });

  // 3. Redondeo técnico para evitar decimales infinitos
  FACTURAS.forEach(f => { f.saldo = Math.round(f.saldo * 100) / 100; });
}

// ─── NAVEGACIÓN ──────────────────────────────────────────────────────────────
function showPage(page, el){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const pg = document.getElementById('page-'+page);
  if(pg) pg.classList.add('active');
  if(el) el.classList.add('active');
  else if(event&&event.currentTarget) event.currentTarget.classList.add('active');
  
  const titles = {
    conciliacion:'Conciliación bancaria',
    facturas:'Facturas pendientes',
    egresos:'Egresos',
    categorias:'Administrar Categorías',
    reportes:'Reportes Estadísticos y Alertas'
  };
  
  document.getElementById('topbar-title').textContent = titles[page]||page;
  if(page==='facturas') renderFacturas();
  if(page==='egresos') renderEgresos();
  if(page==='categorias') renderCategorias();
  if(page==='reportes') renderReportes(); 
}
function showUpload(){ document.getElementById('modal-upload').classList.add('show'); }
function hideUpload(){ document.getElementById('modal-upload').classList.remove('show'); }

// ─── CONEXIÓN BD ─────────────────────────────────────────────────────────────
async function init(){
  try{
    const {data,error} = await db.from('facturas').select('*', { count: 'exact', head: true });
    if(error) throw error;
    document.getElementById('db-status').textContent='🟢 Base de datos OK';
    await cargarDesdeBD();
    await cargarEgresosBD();
  }catch(e){
    document.getElementById('db-status').textContent='🔴 Sin conexión';
    toast('Error de conexión: '+e.message,'');
    console.error("Detalle del error:", e);
  }
}

async function cargarDesdeBD(){
  const {data:fdata} = await db.from('facturas').select('*').order('fecha_doc');
  FACTURAS = fdata||[];
  
  // Guardamos el saldo original ni bien llegan de la BD
  FACTURAS.forEach(f => { f.saldo_original = parseFloat(f.saldo) || 0; });

  const {data:bdata} = await db.from('abonos').select('*').order('fecha');
  const abonos = bdata||[];

  const {data:cdata} = await db.from('conciliaciones').select('*');
  const concMap = {};
  (cdata||[]).forEach(c=>{
    if(!concMap[c.operacion]) concMap[c.operacion]=[];
    concMap[c.operacion].push({factura:c.factura, razon:c.razon, importe_factura:c.importe_factura});
  });

  PAGOS = abonos.map((b,i)=>({
    ...b, id:i,
    estado: concMap[b.operacion] ? 'confirmado' : 'pendiente',
    facturas: concMap[b.operacion] || [{factura:'',razon:''}],
    motivo: concMap[b.operacion] ? 'Guardado' : '',
    confianza: ''
  }));

  // Disparamos el primer cálculo de saldos antes de las sugerencias
  recalcularSaldos();

  PAGOS.forEach(p=>{
    if(p.estado==='pendiente'){
      const sug=sugerirFactura(p);
      if(sug){ 
        p.facturas=[{factura:sug.factura,razon:sug.razon}]; 
        p.motivo=sug.motivo; p.confianza=sug.confianza; p.estado='sugerida'; 
        recalcularSaldos(); // Recalculamos para que el saldo sugerido no se repita
      }
    }
  });

  poblarFiltroMontos();
  actualizarStats();
  render();
  renderFacturas();
  toast('Datos cargados desde la base de datos','green');
}

// ─── CARGA DE ARCHIVOS ───────────────────────────────────────────────────────
async function cargarFacturas(input){
  if (!input.files || input.files.length === 0) return;
  const wb = await leerExcel(input.files[0]);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {defval:''});
  if (!rows.length) { alert('El archivo seleccionado está vacío.'); return; }
  
  const headers = Object.keys(rows[0]);
  const esContable = headers.includes('SALDO_S') && headers.includes('SERIE') && headers.includes('NUMERO');
  const esComercial = headers.includes('SERIE_DOC') && headers.includes('NUMERO_DOC');
  
  function limpiarDocNum(serie, numero) {
    const s = String(serie || '').trim().replace(/^0+/, '');
    const n = String(numero || '').trim().replace(/^0+/, '');
    return s && n ? `${s}-${n}` : null;
  }

  // --- NUEVO: ATRAPADOR MULTI-FORMATO ---
  function atraparGlosa(r) {
    return String(r['GLOSA'] || r['Glosa'] || r['glosa'] || r['DESCRIPCION'] || r['Descripcion'] || r['descripcion'] || '').trim();
  }
  
  let nuevas = [];
  
  if (esContable) {
    const resumenContable = {};
    rows.forEach(r => {
      const codFactura = limpiarDocNum(r['SERIE'], r['NUMERO']);
      if (!codFactura) return;
      const monedaDoc = String(r['M_REG'] || 'S').trim().toUpperCase();
      const esDolares = (monedaDoc === 'D' || monedaDoc === 'USD');
      const saldoFila = esDolares ? parseFloat(r['SALDO_USD'] || 0) : parseFloat(r['SALDO_S'] || 0);
      
      if (!resumenContable[codFactura] || saldoFila < resumenContable[codFactura].saldo) {
        resumenContable[codFactura] = {
          factura: codFactura, razon_social: String(r['RAZON_SOCIAL'] || '').trim(),
          fecha_doc: fmtFecha(r['FECHA_DOC']), fecha_ven: fmtFecha(r['FECHA_VEN']),
          saldo: saldoFila, mes: parseInt(r['MES']) || 0, moneda: esDolares ? 'USD' : 'PEN',
          glosa: atraparGlosa(r) // <--- USAMOS EL ATRAPADOR AQUÍ
        };
      }
    });
    nuevas = Object.values(resumenContable).filter(f => f.saldo > 0);
    const { error } = await db.from('facturas').upsert(nuevas, { onConflict: 'factura' });
    if (error) { toast('Error BD: ' + error.message, ''); return; }
    toast(nuevas.length + ' facturas procesadas (Contable)', 'green');
    
  } else if (esComercial) {
    const resumenComercial = {};
    rows.forEach(r => {
      const codFactura = limpiarDocNum(r['SERIE_DOC'], r['NUMERO_DOC']);
      if (!codFactura) return;
      const totalFila = parseFloat(r['TOTAL'] || 0);
      const monedaRaw = String(r['MONEDA'] || r['M_REG'] || r['TIPO_MONEDA'] || 'S').trim().toUpperCase();
      const esDolaresFila = (monedaRaw === 'D' || monedaRaw === 'USD' || monedaRaw === 'DOLARES');
      
      if (!resumenComercial[codFactura]) {
        resumenComercial[codFactura] = {
          factura: codFactura, razon_social: String(r['RAZON_SOCIAL'] || '').trim(),
          fecha_doc: fmtFecha(r['FECHA_DOC']), saldo: 0, mes: parseInt(r['MES']) || 0, moneda: esDolaresFila ? 'USD' : 'PEN',
          glosa: atraparGlosa(r) // <--- Y AQUÍ TAMBIÉN
        };
      }
      resumenComercial[codFactura].saldo += totalFila;
    });
    nuevas = Object.values(resumenComercial).filter(f => f.saldo > 0);
    const { error } = await db.from('facturas').upsert(nuevas, { onConflict: 'factura' });
    if (error) { toast('Error BD: ' + error.message, ''); return; }
    toast(nuevas.length + ' facturas procesadas (Comercial)', 'green');
  } else { alert('Archivo no reconocido.'); return; }
  
  await cargarDesdeBD();
}
async function cargarBancos(input){
  const wb = await leerExcel(input.files[0]);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json(ws, {header: 1, defval: ''});

  if (!rawData.length) { alert('El archivo está vacío.'); return; }

  let esDolares = false, esNacion = false, esInterbank = false, esScotiabank = false, esBbva = false;
  let headerIdx = -1, monedaBanco = 'PEN';

  for(let i = 0; i < Math.min(rawData.length, 25); i++){
    const filaTexto = rawData[i].join(' ').toUpperCase();
    if(filaTexto.includes('DÓLARES') || filaTexto.includes('DOLARES') || filaTexto.includes('USD') || filaTexto.includes('US$') || filaTexto.includes('CCME') || filaTexto.includes('IMPORTES EN: USD')) { esDolares = true; monedaBanco = 'USD'; }
    if(filaTexto.includes('CARGO') && filaTexto.includes('ABONO') && filaTexto.includes('RUC') && filaTexto.includes('OFICINA') && !filaTexto.includes('F. OPERACIÓN')) { esNacion = true; headerIdx = i; break; }
    if(filaTexto.includes('FECHA DE OPERACIÓN') && filaTexto.includes('NRO. DE OPERACIÓN') && filaTexto.includes('CARGO') && filaTexto.includes('ABONO')) { esInterbank = true; headerIdx = i; break; }
    if(filaTexto.includes('FECHA') && filaTexto.includes('MOVIMIENTO') && filaTexto.includes('IMPORTE') && filaTexto.includes('REFERENCIA') && filaTexto.includes('CDR')) { esScotiabank = true; headerIdx = i; break; }
    if(filaTexto.includes('F. OPERACIÓN') && filaTexto.includes('CONCEPTO') && filaTexto.includes('IMPORTE') && filaTexto.includes('OFICINA')) { esBbva = true; headerIdx = i; break; }
    if((filaTexto.includes('MONTO') || filaTexto.includes('IMPORTE')) && filaTexto.includes('OPERACI') && !esBbva && !esInterbank) { headerIdx = i; break; }
  }

  if(headerIdx === -1) { alert('No se detectaron las cabeceras del banco.'); return; }

  const nuevos = []; const egresosRaw = [];
  function limpiarMonto(texto) { let limpio = String(texto || '').replace(/[S\/\$\s,]/g, '').trim(); return parseFloat(limpio) || 0; }

  if(esBbva) {
    const headers = rawData[headerIdx].map(h => String(h).trim().toUpperCase());
    const colFecha = headers.findIndex(h => h.includes('F. OPERACI'));
    const colDoc = headers.findIndex(h => h.includes('Nº. DOC') || h.includes('N. DOC') || h.includes('NRO. DOC') || h.includes('DOC.'));
    const colConcepto = headers.findIndex(h => h.includes('CONCEPTO'));
    const colImporte = headers.findIndex(h => h === 'IMPORTE');
    for(let i = headerIdx + 1; i < rawData.length; i++) {
      const r = rawData[i]; if(!r || r.length === 0) continue;
      let fechaVal = String(r[colFecha] || '').trim();
      if(!fechaVal || fechaVal.toUpperCase().includes('SALDO')) continue;
      const montoVal = limpiarMonto(r[colImporte]); if(montoVal === 0) continue;
      let opVal = String(r[colDoc] || '').trim(); if(!opVal || opVal === '-') opVal = 'BBVA-' + fechaVal.replace(/\//g, '') + '-' + i;
      const obj = { operacion: opVal, fecha: fmtFecha(fechaVal), descripcion: String(r[colConcepto] || '').trim(), moneda: monedaBanco };
      if(montoVal > 0) nuevos.push({...obj, monto: montoVal}); else egresosRaw.push({...obj, monto: Math.abs(montoVal), estado: 'pendiente'});
    }
  } else if(esScotiabank) {
    const headers = rawData[headerIdx].map(h => String(h).trim().toUpperCase());
    const colFecha = headers.findIndex(h => h === 'FECHA');
    const colMov = headers.findIndex(h => h === 'MOVIMIENTO');
    const colImporte = headers.findIndex(h => h === 'IMPORTE');
    const colRef = headers.findIndex(h => h === 'REFERENCIA');
    for(let i = headerIdx + 1; i < rawData.length; i++) {
      const r = rawData[i]; if(!r || r.length === 0) continue;
      const montoVal = limpiarMonto(r[colImporte]); let opVal = String(r[colRef] || '').trim(); const fechaVal = String(r[colFecha] || '').trim();
      if(!fechaVal || montoVal === 0) continue; if(!opVal) opVal = 'SCO-' + fechaVal.replace(/\//g, '') + '-' + i;
      const obj = { operacion: opVal, fecha: fmtFecha(fechaVal), descripcion: String(r[colMov] || '').trim(), moneda: monedaBanco };
      if(montoVal > 0) nuevos.push({...obj, monto: montoVal}); else egresosRaw.push({...obj, monto: Math.abs(montoVal), estado: 'pendiente'});
    }
  } else if(esInterbank) {
    const headers = rawData[headerIdx].map(h => String(h).trim().toUpperCase());
    const colFecha = headers.findIndex(h => h.includes('FECHA DE OPERACI'));
    const colOp = headers.findIndex(h => h.includes('NRO. DE OPERACI'));
    const colMov = headers.findIndex(h => h === 'MOVIMIENTO');
    const colDesc = headers.findIndex(h => h === 'DESCRIPCIÓN' || h === 'DESCRIPCION');
    const colCargo = headers.findIndex(h => h === 'CARGO');
    const colAbono = headers.findIndex(h => h === 'ABONO');
    for(let i = headerIdx + 1; i < rawData.length; i++) {
      const r = rawData[i]; if(!r || r.length === 0) continue;
      let montoAbono = limpiarMonto(r[colAbono]); let montoCargo = Math.abs(limpiarMonto(r[colCargo]));
      let opVal = String(r[colOp] || '').trim(); let fechaVal = String(r[colFecha] || '').trim();
      if(!fechaVal || (montoAbono === 0 && montoCargo === 0)) continue;
      if (opVal === '-' || opVal === '') opVal = 'INT-' + fechaVal.replace(/\//g, '') + '-' + i;
      const glosaCompleta = [String(r[colMov] || '').trim(), String(r[colDesc] || '').trim()].filter(Boolean).join(' - ');
      const obj = { operacion: opVal, fecha: fmtFecha(fechaVal), descripcion: glosaCompleta, moneda: monedaBanco };
      if(montoAbono > 0) nuevos.push({...obj, monto: montoAbono}); else if (montoCargo > 0) egresosRaw.push({...obj, monto: montoCargo, estado: 'pendiente'});
    }
  } else if(esNacion) {
    const headers = rawData[headerIdx].map(h => String(h).trim().toUpperCase());
    const colFecha = headers.findIndex(h => h === 'FECHA');
    const colDoc = headers.findIndex(h => h === 'DOCUMENTO');
    const colRuc = headers.findIndex(h => h === 'RUC');
    const colTrans = headers.findIndex(h => h === 'TRANS.');
    const colCargo = headers.findIndex(h => h === 'CARGO');
    const colAbono = headers.findIndex(h => h === 'ABONO');
    for(let i = headerIdx + 1; i < rawData.length; i++) {
      const r = rawData[i]; if(!r || r.length === 0) continue;
      let montoAbono = limpiarMonto(r[colAbono]); let montoCargo = limpiarMonto(r[colCargo]); let opVal = String(r[colDoc] || '').trim();
      if(!opVal || (montoAbono === 0 && montoCargo === 0)) continue;
      let fRaw = String(r[colFecha] || '').replace(/\./g, '-'); const rucVal = String(r[colRuc] || '').trim();
      const obj = { operacion: opVal, fecha: fmtFecha(fRaw), descripcion: `DETRACCION BN - ${String(r[colTrans] || '').trim()} - RUC: ${rucVal}`, referencia2: rucVal, moneda: 'PEN' };
      if(montoAbono > 0) nuevos.push({...obj, monto: montoAbono}); else if (montoCargo > 0) egresosRaw.push({...obj, monto: montoCargo, estado: 'pendiente'});
    }
  } else {
    const headers = rawData[headerIdx].map(h => String(h).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim());
    const colFecha = headers.findIndex(h => /^fecha$/.test(h) || h.includes('fecha valuta'));
    const colDesc = headers.findIndex(h => h.includes('descripci') || h.includes('glosa'));
    const colMonto = headers.findIndex(h => /^monto$/.test(h) || h.includes('importe'));
    const colOp = headers.findIndex(h => h.includes('operaci') && (h.includes('n.m') || h.includes('nro') || h.includes('numero')));
    const colRef2 = headers.findIndex(h => h.includes('referencia2'));
    const colFactura = headers.findIndex(h => h === 'factura');
    const colEstado = headers.findIndex(h => h === 'estado');
    const colOrd = headers.findIndex(h => h === 'ordenante');
    const colMoneda = headers.findIndex(h => h === 'moneda' || h.includes('moneda'));
    const opIndex = colOp !== -1 ? colOp : headers.findIndex(h => h.includes('operaci'));
    let contPEN=0, contUSD=0;

    for(let i = headerIdx + 1; i < rawData.length; i++) {
      const r = rawData[i]; if(!r || r.length === 0) continue;
      const valorFactura = colFactura !== -1 ? String(r[colFactura] || '').trim().toUpperCase() : '';
      const valorEstado = colEstado !== -1 ? String(r[colEstado] || '').trim().toUpperCase() : '';
      if (valorFactura === 'FDC' || valorFactura.includes('FDC') || valorEstado.includes('FDC')) continue;
      
      const montoVal = limpiarMonto(r[colMonto]); const opVal = String(r[opIndex] || '').trim();
      if(!opVal || montoVal === 0) continue;
      const ordVal = colOrd !== -1 ? String(r[colOrd] || '').trim() : '';

      let monedaFila = monedaBanco;
      if(colMoneda !== -1){
        const txtMoneda = String(r[colMoneda] || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
        monedaFila = (txtMoneda.includes('DOLAR') || txtMoneda.includes('USD')) ? 'USD' : 'PEN';
      }
      if(monedaFila==='USD') contUSD++; else contPEN++;

      const obj = {
        operacion: opVal, fecha: fmtFecha(r[colFecha] || ''), descripcion: colDesc !== -1 ? String(r[colDesc]).trim() : '',
        referencia2: colRef2 !== -1 ? String(r[colRef2]).trim() : '', ordenante: ordVal, moneda: monedaFila
      };

      if(montoVal > 0) nuevos.push({...obj, monto: montoVal}); 
      else { obj.monto = Math.abs(montoVal); obj.estado = 'pendiente'; const { ordenante, ...objEgreso } = obj; egresosRaw.push(objEgreso); }
    }
    if(colMoneda !== -1){ monedaBanco = contUSD>0 ? (contPEN>0 ? `${contPEN} PEN / ${contUSD} USD` : 'USD') : 'PEN'; }
  }

  const {error} = await db.from('abonos').upsert(nuevos,{onConflict:'operacion',ignoreDuplicates:true});
  if(error){ toast('Error: ' + error.message, ''); return; }
  if(egresosRaw.length){
    const {error:ee} = await db.from('egresos').upsert(egresosRaw,{onConflict:'operacion',ignoreDuplicates:true});
    if(ee) toast('Advertencia egresos: ' + ee.message, '');
    else toast('Procesado con éxito', 'green');
  } else toast('Operaciones cargadas correctamente', 'green');
  
  document.getElementById('slot-bancos').classList.add('loaded');
  document.getElementById('status-bancos').textContent = nuevos.length + ' ing. · ' + egresosRaw.length + ' egr. (' + monedaBanco + ')';
}

async function cargarInter(input){
  const wb = await leerExcel(input.files[0]);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, {header: 1, defval: ''});
  let headerIdx = -1, colOpKey = '', colOrdKey = '';

  for (let i = 0; i < Math.min(data.length, 25); i++) {
    const filaArr = data[i].map(c => String(c).trim().toUpperCase());
    let opMatch = filaArr.find(c => c.includes('NÚMERO - OPERACIÓN') || c.includes('NRO') || c.includes('NUMERO'));
    if (!opMatch) opMatch = filaArr.find(c => c.includes('OPERACI') && !c.includes('TIPO'));
    const ordMatch = filaArr.find(c => c.includes('ORDENANTE') || c.includes('BENEFICIARIO') || c.includes('CLIENTE') || c.includes('NOMBRE'));
    if (opMatch && ordMatch) { headerIdx = i; colOpKey = opMatch; colOrdKey = ordMatch; break; }
  }

  if (headerIdx === -1) { alert('No se detectaron columnas de Operación y Ordenante.'); return; }
  const headers = data[headerIdx].map(c => String(c).trim().toUpperCase());
  const opIdx = headers.indexOf(colOpKey); const cbOrdIdx = headers.indexOf(colOrdKey);
    
  for (let i = headerIdx + 1; i < data.length; i++) {
      const row = data[i]; if (!row || row.length <= Math.max(opIdx, cbOrdIdx)) continue;
      const op = String(row[opIdx] || '').trim().replace(/^0+/, ''); const ord = String(row[cbOrdIdx] || '').trim();
      if (op) INTER_MAP[op] = ord;
  }
  document.getElementById('slot-inter').classList.add('loaded');
  document.getElementById('status-inter').textContent = Object.keys(INTER_MAP).length + ' registros';
  toast('Interbancarios cargados', 'green');
}

async function cargarBD(input){
  const wb=await leerExcel(input.files[0]);
  const sheetName=wb.SheetNames.find(s=>/^BD$/i.test(s))||wb.SheetNames[0];
  const ws=wb.Sheets[sheetName];
  const rows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});
  const keys=rows.length?Object.keys(rows[0]):[];
  const colOpBD=keys.find(k=>/^op$/i.test(k))||keys[30];
  const colGlosa=keys.find(k=>/^glosa/i.test(k))||keys[47];
  rows.forEach(r=>{
    const op=String(r[colOpBD]||'').trim().replace(/^0+/,'');
    if(op) BD_MAP[op]={...r, glosa:r[colGlosa]||''};
  });
  document.getElementById('slot-bd').classList.add('loaded');
  document.getElementById('status-bd').textContent=Object.keys(BD_MAP).length+' registros';
  toast('BD cargado','green');
}

async function procesarYCerrar(){
  await cargarDesdeBD();
  await cargarEgresosBD();
  PAGOS.forEach(p=>{ 
    const opClean = String(p.operacion).trim().replace(/^0+/,'');
    const ord = INTER_MAP[opClean]; 
    if(ord) p.ordenante = ord; 
  });
  recalcularSaldos();
  render();
  renderEgresos();
  hideUpload();
}

// ─── SUGERENCIA ──────────────────────────────────────────────────────────────
function extractNumFact(s){
  let m=s.match(/F\d+[-\s]?0*(\d{4,})/i); if(m) return m[1];
  m=s.match(/(?<![0-9])(0*(\d{5,}))/); if(m) return m[2];
  return null;
}

const PALABRAS_GENERICAS_EMPRESA = new Set([
  'INGENIERIA','INGENIEROS','INGENIERO','CONSTRUCCION','CONSTRUCCIONES','CONSTRUCTORA','CONSTRUCTOR',
  'CONTRATISTA','CONTRATISTAS','GENERAL','GENERALES','SERVICIO','SERVICIOS','EMPRESA','EMPRESAS',
  'CORPORACION','GRUPO','PERU','PERUANA','PERUANO','SOCIEDAD','ANONIMA','CERRADA','ABIERTA','LIMITADA',
  'RESPONSABILIDAD','PROYECTO','PROYECTOS','OBRA','OBRAS','INMOBILIARIA','INMOBILIARIO','INVERSIONES',
  'INVERSION','COMERCIAL','INDUSTRIAL','NACIONAL','INTERNACIONAL','ASOCIADOS','CONSULTORES','CONSULTORIA',
  'ARQUITECTOS','ARQUITECTURA','COMPANIA','TRADING','IMPORT','EXPORT','MULTISERVICIOS','SOLUCIONES'
]);

function sugerirFactura(pago){
  const desc=norm(pago.descripcion); const ref2=norm(pago.referencia2||''); const ord=norm(pago.ordenante||'');
  const monto=parseFloat(pago.monto) || 0;
  const monedaPago = (pago.moneda==='USD') ? 'USD' : 'PEN';
  const esBN = esAbonoDetraccionBN(pago);
  
  const disponibles = FACTURAS.filter(f=>{
    if (f.saldo <= 0.01) return false;
    const mismaMoneda=((f.moneda==='USD')?'USD':'PEN')===monedaPago;
    const excepcionDetraccion=esBN && f.moneda==='USD' && requiereDetraccionPEN(f);
    return mismaMoneda||excepcionDetraccion;
  });

  let m=(pago.referencia2||'').match(/F\d+-?0*(\d{4,})/i);
  if(m){ const nd=m[1]; const f=disponibles.find(x=>x.factura.includes(nd)); if(f) return {factura:f.factura,razon:f.razon_social,motivo:'N° factura en referencia',confianza:'alta'}; }
  const nd=extractNumFact(pago.descripcion);
  if(nd){ const f=disponibles.find(x=>x.factura.includes(nd)); if(f) return {factura:f.factura,razon:f.razon_social,motivo:'N° factura en descripción',confianza:'alta'}; }
  const nr=extractNumFact(pago.referencia2||'');
  if(nr){ const f=disponibles.find(x=>x.factura.includes(nr)); if(f) return {factura:f.factura,razon:f.razon_social,motivo:'N° factura en referencia',confianza:'alta'}; }

  // --- NUEVO: FRANCOTIRADOR DE VOUCHER BCP (Últimos 4 dígitos + Relleno de Ceros) ---
  const opNumeros = String(pago.operacion).replace(/\D/g, ''); 
  if (opNumeros.length >= 4 && monto > 0) {
      const ultimos4 = opNumeros.slice(-4); 
      
      const fPorVoucher = disponibles.find(f => {
          if (Math.abs(f.saldo - monto) >= 0.01 || !f.glosa) return false;
          let textoGlosa = String(f.glosa).trim();
          if (!isNaN(textoGlosa) && textoGlosa.length > 0 && textoGlosa.length < 4) {
              textoGlosa = textoGlosa.padStart(4, '0');
          }
          return textoGlosa.includes(ultimos4);
      });
      
      if (fPorVoucher) {
          return {
              factura: fPorVoucher.factura, 
              razon: fPorVoucher.razon_social, 
              motivo: `Match de Voucher: Terminación ${ultimos4} en Glosa`, 
              confianza: 'alta'
          };
      }
  }
  // -----------------------------------------------------------------------------------

  const facturasMontoExacto = disponibles.filter(f => Math.abs(f.saldo - monto) < 0.01);
  const palabrasBusqueda = (ord + ' ' + desc + ' ' + ref2).split(' ').filter(w => w.length > 3 && !PALABRAS_GENERICAS_EMPRESA.has(w));

  if (facturasMontoExacto.length > 0 && palabrasBusqueda.length > 0) {
    let best = null, bestScore = 0;
    for (const f of facturasMontoExacto) {
        const rs = norm(f.razon_social); let score = 0;
        const ordWords = ord.split(' ').filter(w => w.length > 2 && !PALABRAS_GENERICAS_EMPRESA.has(w));
        for (const w of ordWords) { if (rs.includes(w)) score += (w.length * 2); }
        const descWords = (desc + ' ' + ref2).split(' ').filter(w => w.length > 3 && !PALABRAS_GENERICAS_EMPRESA.has(w));
        for (const w of descWords) { if (rs.includes(w)) score += w.length; }
        if (score > bestScore) { bestScore = score; best = f; }
    }
    if (best && bestScore >= 4) return {factura:best.factura, razon:best.razon_social, motivo:'Importe exacto y coincidencia segura', confianza:'alta'};
  }

  if (ord && ord.length > 3) {
      const ordWords = ord.split(' ').filter(w => w.length > 2 && !PALABRAS_GENERICAS_EMPRESA.has(w));
      let facturasDelCliente = [];
      for (const f of disponibles) {
          const rs = norm(f.razon_social); let coincidencias = 0;
          for (const w of ordWords) { if (rs.includes(w)) coincidencias++; }
          if (coincidencias > 0 || rs.includes(ord) || ord.includes(rs)) facturasDelCliente.push(f);
      }
      if (facturasDelCliente.length > 0) {
          facturasDelCliente.sort((a,b) => a.fecha_doc.localeCompare(b.fecha_doc));
          const pagables = facturasDelCliente.filter(f => f.saldo <= monto);
          if (pagables.length > 0) return {factura:pagables[0].factura, razon:pagables[0].razon_social, motivo:'Ordenante detectado — Factura más antigua', confianza:'media'};
          return {factura:facturasDelCliente[0].factura, razon:facturasDelCliente[0].razon_social, motivo:'Abono parcial de cliente detectado', confianza:'media'};
      }
  }

  const candsGeneral = disponibles.filter(f => f.saldo <= monto);
  if (palabrasBusqueda.length > 0 && candsGeneral.length > 0) {
      let best = null, bestScore = 0, bestPalabrasUsadas = 0;
      for (const f of candsGeneral) {
          const rs = norm(f.razon_social); let score = 0, palabrasUsadas = 0;
          for (const w of palabrasBusqueda) if (rs.includes(w)) { score += w.length; palabrasUsadas++; }
          if (score > bestScore) { bestScore = score; best = f; bestPalabrasUsadas = palabrasUsadas; }
      }
      if (best && bestScore >= 8 && bestPalabrasUsadas >= 1) {
          const emp = norm(best.razon_social);
          const elegida = disponibles.filter(f => norm(f.razon_social) === emp).sort((a,b) => a.fecha_doc.localeCompare(b.fecha_doc))[0] || best;
          return {factura:elegida.factura, razon:elegida.razon_social, motivo:'Similitud de texto — más antigua', confianza:'media'};
      }
  }
  return null;
}
// ─── ACCIONES ────────────────────────────────────────────────────────────────
function migrarFacturas(){ PAGOS.forEach(p=>{ if(!p.facturas) p.facturas=p.facturaAsignada?[{factura:p.facturaAsignada,razon:p.razonAsignada||''}]:[{factura:'',razon:''}]; }); }

async function confirmar(id){
  const p=PAGOS.find(x=>x.id===id);
  if(!p||!p.facturas.some(f=>f.factura)) return;
  const rows=p.facturas.filter(f=>f.factura).map(f=>({
    operacion:String(p.operacion), factura:f.factura, razon:f.razon||'',
    importe_factura:FACTURAS.find(x=>x.factura===f.factura)?.saldo_original||p.monto,
    estado:'confirmado', motivo:p.motivo||'', confianza:p.confianza||''
  }));
  const {error}=await db.from('conciliaciones').upsert(rows,{onConflict:'operacion,factura'});
  if(error){ toast('Error guardando: '+error.message,''); return; }
  p.estado='confirmado'; recalcularSaldos(); actualizarStats(); render(); toast('Confirmado y guardado ✓','green');
}

async function quitar(id){
  const p=PAGOS.find(x=>x.id===id);
  if(!p) return;
  await db.from('conciliaciones').delete().eq('operacion',String(p.operacion));
  p.estado='pendiente'; p.facturas=[{factura:'',razon:''}]; p.motivo=''; p.confianza='';
  recalcularSaldos(); actualizarStats(); render(); toast('Asignación eliminada','');
}

async function eliminarAbono(id){
  const p=PAGOS.find(x=>x.id===id);
  if(!p) return;
  if(!confirm(`¿Eliminar permanentemente el abono\nOP ${p.operacion} — ${p.descripcion}?\n\nEsta acción no se puede deshacer.`)) return;
  await db.from('conciliaciones').delete().eq('operacion',String(p.operacion));
  const {error}=await db.from('abonos').delete().eq('operacion',String(p.operacion));
  if(error){ toast('Error al eliminar: '+error.message,''); return; }
  PAGOS.splice(PAGOS.findIndex(x=>x.id===id),1);
  recalcularSaldos(); actualizarStats(); render(); toast('Abono eliminado ✓','');
}

function agregarLinea(id){ const p=PAGOS.find(x=>x.id===id); if(p){p.facturas.push({factura:'',razon:''});render();} }
function quitarLinea(id,idx){ const p=PAGOS.find(x=>x.id===id); if(!p) return; if(p.facturas.length<=1){p.facturas=[{factura:'',razon:''}];}else{p.facturas.splice(idx,1);} p.estado=p.facturas.some(f=>f.factura)?'manual':'pendiente'; recalcularSaldos(); actualizarStats(); render(); }
function cambiarLinea(id,idx,val){ const p=PAGOS.find(x=>x.id===id); if(!p) return; const f=FACTURAS.find(x=>x.factura===val); p.facturas[idx]={factura:val,razon:f?f.razon_social:''}; p.estado=val?'manual':'pendiente'; p.motivo='Asignación manual'; p.confianza=''; p.detraccionAceptada=false; recalcularSaldos(); actualizarStats(); render(); }
function toggleDetraccionAceptada(id,checked){ const p=PAGOS.find(x=>x.id===id); if(!p) return; p.detraccionAceptada=checked; render(); }

// ─── STATS ───────────────────────────────────────────────────────────────────
function actualizarStats(){
  const conf=PAGOS.filter(p=>p.estado==='confirmado').length;
  const pend=PAGOS.filter(p=>p.estado!=='confirmado').length;
  const pct=PAGOS.length?Math.round(conf/PAGOS.length*100):0;
  document.getElementById('st-total').textContent=PAGOS.length;
  document.getElementById('st-conf').textContent=conf;
  document.getElementById('st-pend').textContent=pend;
  document.getElementById('st-pct').textContent=pct+'%';
  document.getElementById('prog').style.width=pct+'%';
  document.getElementById('stats-mini').textContent=conf+'/'+PAGOS.length+' confirmados';
}

function poblarFiltroMontos(){
  const montos=[...new Set(PAGOS.map(p=>p.monto))].sort((a,b)=>a-b);
  const sel=document.getElementById('fil-monto');
  sel.innerHTML='<option value="todos">Todos los montos</option>';
  montos.forEach(m=>{ const o=document.createElement('option'); o.value=m; o.textContent=fmtMonto(m); sel.appendChild(o); });
}

// ─── RENDER CONCILIACION ─────────────────────────────────────────────────────
function render(){
  migrarFacturas();
  const fil=document.getElementById('fil-estado').value;
  const filM=document.getElementById('fil-monto').value;
  const filMon=document.getElementById('fil-moneda')?document.getElementById('fil-moneda').value:'todos';
  const busca=norm(document.getElementById('fil-busca').value);
  let lista=PAGOS.filter(p=>{
    if(fil==='pendiente'&&p.estado==='confirmado') return false;
    if(fil==='confirmado'&&p.estado!=='confirmado') return false;
    if(fil==='inter'&&!p.ordenante) return false;
    if(filM!=='todos'&&p.monto!==parseFloat(filM)) return false;
    if(filMon!=='todos'&&((p.moneda==='USD')?'USD':'PEN')!==filMon) return false;
    if(busca){ const t=norm(p.descripcion+' '+p.operacion+' '+(p.facturas||[]).map(f=>f.factura+' '+f.razon).join(' ')+' '+(p.ordenante||'')); if(!t.includes(busca)) return false; }
    return true;
  });
  document.getElementById('count-label').textContent=lista.length+' abono'+(lista.length!==1?'s':'')+' mostrado'+(lista.length!==1?'s':'');
  if(!lista.length){ document.getElementById('lista').innerHTML='<div class="empty"><span class="empty-icon">🔍</span>Sin resultados para este filtro</div>'; return; }

  document.getElementById('lista').innerHTML=lista.map(p=>{
    const bClass=p.estado==='confirmado'?'badge-confirmed':p.estado==='manual'?'badge-manual':p.confianza==='alta'?'badge-high':p.confianza==='media'?'badge-med':'badge-pend';
    const bLabel=p.estado==='confirmado'?'CONFIRMADO':p.estado==='manual'?'MANUAL':p.confianza==='alta'?'SUGERIDO ✓':p.confianza==='media'?'SUGERIDO ~':'SIN ASIGNAR';
    const cCard=p.estado==='confirmado'?'confirmed':p.estado==='manual'?'manual':p.estado==='sugerida'?'suggested':'pending';
    const ref2ok=p.referencia2&&p.referencia2!=='Referencia Beneficiari'&&p.referencia2.length>3&&!p.referencia2.startsWith('BCP');
    
    const descSegura = escaparHTML(p.descripcion || '(sin descripción)');
    const ordenanteSeguro = p.ordenante ? `<div class="ordenante">↳ ${escaparHTML(p.ordenante)}</div>` : '';
    const ref2Segura = ref2ok ? ' · ' + escaparHTML(p.referencia2) : '';
    const motivoSeguro = p.motivo && p.estado !== 'confirmado' ? `<div class="reason">→ ${escaparHTML(p.motivo)}</div>` : '';

    const hayAsig=(p.facturas||[]).some(f=>f.factura);
    const btnQuit=hayAsig?`<button class="btn btn-remove" onclick="quitar(${p.id})">✕ Quitar</button>`:'';
    const btnDel=`<button class="btn btn-remove" onclick="eliminarAbono(${p.id})" title="Eliminar abono permanentemente" style="margin-left:auto">🗑 Eliminar</button>`;

    const monedaPagoActual = (p.moneda==='USD') ? 'USD' : 'PEN';
    const esBN = esAbonoDetraccionBN(p);
    
    const lineas=(p.facturas||[{factura:'',razon:''}]).map((item,idx)=>{
      const opts=FACTURAS.filter(f=>{
        const mismaMoneda=((f.moneda==='USD')?'USD':'PEN')===monedaPagoActual;
        const excepcionDetraccion=esBN && f.moneda==='USD' && requiereDetraccionPEN(f);
        return mismaMoneda||excepcionDetraccion;
      })
        .filter(f => f.saldo > 0.01 || f.factura === item.factura)
        .sort((a,b)=>a.razon_social.localeCompare(b.razon_social,'es')).map(f=>{
        const sel=item.factura===f.factura?'selected':'';
        const esExcepcion=esBN && f.moneda==='USD' && requiereDetraccionPEN(f);
        const esDetraccionNormal=!esExcepcion && requiereDetraccionPEN(f);
        const marca=esExcepcion?'⚠ USD→revisar — ':(esDetraccionNormal?'🧾 Detracc. — ':'');
        
        let txtMonto = fmtMonto(f.saldo_original !== undefined ? f.saldo_original : f.saldo, f.moneda);
        if (f.saldo < (f.saldo_original||f.saldo) && f.saldo > 0 && f.factura !== item.factura) {
             txtMonto += ` (Resta ${fmtMonto(f.saldo, f.moneda)})`;
        }
        
        return `<option value="${escaparHTML(f.factura)}" ${sel}>${marca}${escaparHTML(f.factura)} — ${txtMonto} — ${escaparHTML(f.razon_social).substring(0,35)}</option>`;
      }).join('');
      
      const btnQL=(p.facturas||[]).length>1||item.factura?`<button class="btn btn-remove" onclick="quitarLinea(${p.id},${idx})">✕</button>`:'';
      return `<div class="factura-row"><select class="factura-select" onchange="cambiarLinea(${p.id},${idx},this.value)"><option value="">— Seleccionar factura —</option>${opts}</select>${btnQL}</div>`;
    }).join('');

    const facturaElegida = (p.facturas||[]).map(item=>FACTURAS.find(f=>f.factura===item.factura)).find(Boolean);
    const necesitaAceptar = esBN && facturaElegida && requiereDetraccionPEN(facturaElegida) && parseFloat(p.monto)!==parseFloat(facturaElegida.saldo_original||facturaElegida.saldo);
    const checkDetraccion = necesitaAceptar ? `<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--amber-text);background:var(--amber-dim);border-radius:6px;padding:6px 10px;width:100%;margin-top:6px">
        <input type="checkbox" ${p.detraccionAceptada?'checked':''} onchange="toggleDetraccionAceptada(${p.id},this.checked)">
        🧾 El monto no coincide con el saldo total — es normal en detracción (10-12% + redondeo/TC). Marcar para habilitar "Confirmar".
      </label>` : '';
    const btnConf=p.estado!=='confirmado'&&hayAsig&&!(necesitaAceptar&&!p.detraccionAceptada)?`<button class="btn btn-confirm" onclick="confirmar(${p.id})">✓ Confirmar</button>`:(p.estado!=='confirmado'&&hayAsig?`<button class="btn" disabled title="Marca el check de detracción para habilitar" style="opacity:.5;cursor:not-allowed">✓ Confirmar</button>`:'');

    return `<div class="card ${cCard}">
      <div class="card-top">
        <div class="card-left">
          <div class="desc">${descSegura}</div>
          ${ordenanteSeguro}
          <div class="meta">${p.fecha||''} · OP ${escaparHTML(String(p.operacion))}${ref2Segura}</div>
        </div>
        <div style="text-align:right">
          <div class="monto">${fmtMonto(p.monto,p.moneda)}${monedaPagoActual==='USD'?' <span class="badge" style="background:var(--purple-dim);color:var(--purple-text)">USD</span>':''}</div>
          <span class="badge ${bClass}">${bLabel}</span>
        </div>
      </div>
      ${lineas}
      ${checkDetraccion}
      <div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap;width:100%">
        <button class="btn" onclick="agregarLinea(${p.id})" style="color:var(--text3);border-style:dashed;font-size:11px">+ agregar factura</button>
        ${btnConf}${btnQuit}${btnDel}
      </div>
      ${motivoSeguro}
    </div>`;
  }).join('');
}

// ─── RENDER FACTURAS ─────────────────────────────────────────────────────────
function renderFacturas(){
  const fil=document.getElementById('ff-estado').value;
  const busca=norm(document.getElementById('ff-busca').value);
  const hoy=new Date(); hoy.setHours(0,0,0,0);

  let lista=FACTURAS.filter(f=>{
    if (f.saldo <= 0.01) return false;
    const dias=diasHasta(f.fecha_ven);
    if(fil==='vencida'&&!(dias!==null&&dias<0)) return false;
    if(fil==='proxima'&&!(dias!==null&&dias>=0&&dias<=7)) return false;
    if(fil==='ok'&&!(dias===null||dias>7)) return false;
    if(busca){ const t=norm(f.factura+' '+f.razon_social); if(!t.includes(busca)) return false; }
    return true;
  });

  const vencidas=FACTURAS.filter(f=>{ const d=diasHasta(f.fecha_ven); return d!==null&&d<0&&f.saldo>0.01; }).length;
  const proximas=FACTURAS.filter(f=>{ const d=diasHasta(f.fecha_ven); return d!==null&&d>=0&&d<=7&&f.saldo>0.01; }).length;
  const saldoPEN=FACTURAS.filter(f=>f.moneda!=='USD').reduce((a,f)=>a+(f.saldo||0),0);
  const saldoUSD=FACTURAS.filter(f=>f.moneda==='USD').reduce((a,f)=>a+(f.saldo||0),0);
  
  document.getElementById('f-total').textContent=lista.length;
  document.getElementById('f-venc').textContent=vencidas;
  document.getElementById('f-prox').textContent=proximas;
  document.getElementById('f-saldo').textContent=saldoUSD>0 ? fmtMonto(saldoPEN,'PEN')+' · '+fmtMonto(saldoUSD,'USD') : fmtMonto(saldoPEN,'PEN');

  if(!lista.length){ document.getElementById('fact-list').innerHTML='<div class="empty"><span class="empty-icon">🧾</span>Sin facturas que mostrar</div>'; return; }

  document.getElementById('fact-list').innerHTML=lista.map(f=>{
    const dias=diasHasta(f.fecha_ven);
    const dotClass=dias===null?'ok':dias<0?'vencida':dias<=7?'proxima':'ok';
    
    let diasLabel = 'Al día';
    let diasColor = 'color: #10b981; font-weight: 500;';
    
    if (dias !== null) {
      if (dias < 0) {
        diasLabel = `⚠️ VENCIDA (${Math.abs(dias)} días de atraso)`;
        diasColor = 'color: #e3000f; font-weight: 600; background: #ffe6e6; padding: 3px 6px; border-radius: 4px;';
      } else if (dias <= 7) {
        diasLabel = `⏱️ Por vencer en ${dias} días`;
        diasColor = 'color: #d97706; font-weight: 600; background: #fef3c7; padding: 3px 6px; border-radius: 4px;';
      } else {
        diasLabel = `Vence en ${dias} días`;
        diasColor = 'color: var(--text3);';
      }
    }

    return `<div class="fact-row">
      <div class="dot ${dotClass}"></div>
      <div style="flex:1;min-width:0">
        <div class="fact-name">${escaparHTML(f.razon_social)||'—'}</div>
        <div class="fact-num">${escaparHTML(f.factura)}</div>
      </div>
      <div class="fact-dates" style="display:flex; flex-direction:column; align-items:flex-end; gap:5px;">
        <div style="font-size:11px;color:var(--text3)">F. Emisión: ${f.fecha_doc||''}</div>
        <div style="font-size:11px;${diasColor}">${diasLabel}</div>
      </div>
      <div class="fact-saldo" style="margin-left:15px;">${fmtMonto(f.saldo,f.moneda)}</div>
    </div>`;
  }).join('');
}

// ─── EXPORTAR ────────────────────────────────────────────────────────────────
function exportarCSV(){
  migrarFacturas();
  const rows=[['Fecha','Descripcion','Ordenante','Moneda','Monto Abono','Operacion - Numero','Factura_Cancelada','Empresa','Importe Factura','Saldo por Asignar','Estado']];
  PAGOS.forEach(p=>{
    const facts=(p.facturas||[]).filter(f=>f.factura);
    const base=[p.fecha,p.descripcion,p.ordenante||'',(p.moneda==='USD'?'USD':'PEN'),p.monto,p.operacion];
    if(!facts.length){ rows.push([...base,'','','',p.monto,p.estado]); }
    else{
      const sumF=facts.reduce((a,f)=>{ const fd=FACTURAS.find(x=>x.factura===f.factura)||{}; return a+parseFloat(fd.saldo_original||fd.saldo||0); },0);
      const saldo=Math.round((p.monto-sumF)*100)/100;
      facts.forEach((f,i)=>{ const fd=FACTURAS.find(x=>x.factura===f.factura)||{}; rows.push([...base,f.factura,f.razon||'',fd.saldo_original||fd.saldo||'',i===facts.length-1&&saldo>0?saldo:'',p.estado]); });
    }
  });
  const csv=rows.map(r=>r.map(v=>'"'+String(v||'').replace(/"/g,"'")+'"').join(',')).join('\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='conciliacion_'+new Date().toISOString().slice(0,10)+'.csv'; a.click();
  toast('CSV exportado ✓','green');
}

function exportarSistema(){
  migrarFacturas();
  const conf=PAGOS.filter(p=>p.estado==='confirmado'||p.estado==='manual');
  if(!conf.length){ toast('No hay abonos confirmados',''); return; }
  const header=['ffechacan D','cdoccan C(2)','csercan C(20)','cnumcan C(20)','ccuecan C(20)','cmoncan C(1)','nimporcan N(15,2)','ntipcam N(10,6)','ccodpago C(3)','ccoddoc C(2)','cserie C(20)','cnumero C(20)','ffechadoc D','ffechaven D','ccodenti C(11)','ccodruc C(15)','crazsoc C(100)','nimportes N(15,2)','nimported N(15,2)','ccodcue C(20)','cglosa C(80)','ccodcos C(9)','ccodcos2 C(9)','nporre N(5,2)','nimpperc N(15,2)','nperdenre N(1)','cserre C(6)','cnumre C(13)','ffecre D'];
  const dataRows=[];
  conf.forEach(p=>{
    const facts=(p.facturas||[]).filter(f=>f.factura);
    const opKey=String(p.operacion).replace(/^0+/,'');
    const bd=BD_MAP[opKey]||BD_MAP[p.operacion]||null;
    const sumF=facts.reduce((a,f)=>{ const fd=FACTURAS.find(x=>x.factura===f.factura)||{}; return a+parseFloat(fd.saldo_original||fd.saldo||0); },0);
    const saldo=Math.round((p.monto-sumF)*100)/100;
    facts.forEach((f,i)=>{
      const fd=FACTURAS.find(x=>x.factura===f.factura)||{};
      const importeFact=fd.saldo_original||fd.saldo||p.monto;
      const fm=f.factura.match(/([A-Z]\d+)-0*(\d+)/);
      const serieF=fm?fm[1]:''; const correlF=fm?fm[2].padStart(8,'0'):'';
      if(bd){ dataRows.push([bd.fecha2,bd.cdoccan,bd.banco3,bd.op,bd.cta,bd.moneda,bd.importe,bd.tc,bd.codpago,bd.tipodoc,bd.serie,bd.correl,bd.fecha5,bd.venc,bd.codid,bd.ruc,bd.razsoc,importeFact,bd.dolares||'',bd.cuenta6,bd.glosa,'','','','','','','','']); }
      else{ dataRows.push([p.fecha,'0','',p.operacion,'','S',p.monto,'','3','1','0000000000000000'+serieF,correlF.padStart(20,'0'),fd.fecha_doc||'',fd.fecha_ven||'','1','',f.razon||'',importeFact,'','',p.descripcion?.substring(0,80)||'','','','','','','','','']); }
      if(i===facts.length-1&&saldo>0){
        const base=bd?[bd.fecha2,bd.cdoccan,bd.banco3,bd.op,bd.cta,bd.moneda,bd.importe,bd.tc,bd.codpago]:[p.fecha,'0','',p.operacion,'','S',p.monto,'','3'];
        dataRows.push([...base,'','','','','','','','SALDO POR ASIGNAR',saldo,'','',bd?bd.glosa:p.descripcion?.substring(0,80)||'','','','','','','','']);
      }
    });
  });
  if(!dataRows.length){ toast('Sin facturas asignadas',''); return; }
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet([header,...dataRows]);
  ws['!cols']=header.map(()=>({wch:22}));
  XLSX.utils.book_append_sheet(wb,ws,'Registro_cobranzas');
  XLSX.writeFile(wb,'Registro_cobranzas_'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'.xlsx');
  toast('Excel sistema exportado ✓ ('+dataRows.length+' filas)','green');
}

function exportarEstado(){
  migrarFacturas();
  const data={};
  PAGOS.filter(p=>p.estado==='confirmado'||p.estado==='manual').forEach(p=>{ data[p.operacion]={estado:p.estado,facturas:p.facturas,motivo:p.motivo,fecha:p.fecha,descripcion:p.descripcion,monto:p.monto}; });
  if(!Object.keys(data).length){ toast('No hay confirmaciones que guardar',''); return; }
  const json=JSON.stringify({version:1,exportado:new Date().toISOString(),confirmaciones:data},null,2);
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([json],{type:'application/json'})); a.download='estado_'+new Date().toISOString().slice(0,10)+'.json'; a.click();
  toast('Estado guardado ✓','green');
}

// ─── EGRESOS ─────────────────────────────────────────────────────────────────
async function cargarEgresosBD(){
  const {data:edata} = await db.from('egresos').select('*').order('fecha');
  EGRESOS = edata||[];
  const {data:cdata} = await db.from('categorias').select('*').eq('activo',true).order('orden');
  CATEGORIAS = cdata||[];
  poblarFiltroCategorias();
  actualizarStatsEgresos();
}

function sugerirCategoria(egreso){
  const texto = ((egreso.descripcion||'') + ' ' + (egreso.referencia2||'')).toLowerCase();
  let bestCat = null, bestScore = 0;
  for(const cat of CATEGORIAS){
    if(!cat.palabras_clave) continue;
    const kws = cat.palabras_clave.split(',').map(k=>k.trim().toLowerCase()).filter(Boolean);
    let score = 0;
    for(const kw of kws){ if(kw && texto.includes(kw)) score += kw.length; }
    if(score > bestScore){ bestScore = score; bestCat = cat; }
  }
  return bestScore >= 3 ? bestCat : null;
}

function poblarFiltroCategorias(){
  const sel = document.getElementById('eg-fil-cat');
  if(!sel) return;
  const grupos = [...new Set(CATEGORIAS.map(c=>c.grupo))];
  sel.innerHTML = '<option value="todos">Todas las categorías</option>';
  grupos.forEach(g=>{ const o=document.createElement('option'); o.value=g; o.textContent=g; sel.appendChild(o); });
}

function actualizarStatsEgresos(){
  const conf = EGRESOS.filter(e=>e.estado==='confirmado').length;
  const pend = EGRESOS.filter(e=>e.estado==='pendiente').length;
  const totalPEN = EGRESOS.filter(e=>e.moneda!=='USD').reduce((a,e)=>a+(parseFloat(e.monto)||0),0);
  const totalUSD = EGRESOS.filter(e=>e.moneda==='USD').reduce((a,e)=>a+(parseFloat(e.monto)||0),0);
  const pct = EGRESOS.length ? Math.round(conf/EGRESOS.length*100) : 0;
  const el = id => document.getElementById(id);
  if(el('eg-total')) el('eg-total').textContent = EGRESOS.length;
  if(el('eg-conf')) el('eg-conf').textContent = conf;
  if(el('eg-pend')) el('eg-pend').textContent = pend;
  if(el('eg-monto')) el('eg-monto').textContent = totalUSD>0 ? fmtMonto(totalPEN,'PEN')+' · '+fmtMonto(totalUSD,'USD') : fmtMonto(totalPEN,'PEN');
  if(el('prog-eg')) el('prog-eg').style.width = pct+'%';
}

function renderEgresos(){
  const fil = document.getElementById('eg-fil-estado')?.value||'todos';
  const filCat = document.getElementById('eg-fil-cat')?.value||'todos';
  const busca = norm(document.getElementById('eg-busca')?.value||'');

  let lista = EGRESOS.filter(e=>{
    if(fil==='pendiente' && e.estado==='confirmado') return false;
    if(fil==='confirmado' && e.estado!=='confirmado') return false;
    if(filCat!=='todos' && e.categoria_nombre && !e.categoria_nombre.includes(filCat)) return false;
    if(busca){
      const t = norm((e.descripcion||'')+' '+(e.referencia2||'')+' '+(e.categoria_nombre||''));
      if(!t.includes(busca)) return false;
    }
    return true;
  });

  document.getElementById('eg-count').textContent = lista.length+' egreso'+(lista.length!==1?'s':'')+' mostrado'+(lista.length!==1?'s':'');

  if(!lista.length){
    document.getElementById('eg-lista').innerHTML='<div class="empty"><span class="empty-icon">📤</span>Sin egresos que mostrar</div>';
    return;
  }

  document.getElementById('eg-lista').innerHTML = lista.map(e=>{
    const sug = e.estado==='pendiente' ? sugerirCategoria(e) : null;
    const catNombre = e.categoria_nombre || (sug ? (sug.grupo+(sug.subgrupo?' / '+sug.subgrupo:'')) : '');
    const bClass = e.estado==='confirmado'?'badge-confirmed':sug?'badge-med':'badge-pend';
    const bLabel = e.estado==='confirmado'?'CLASIFICADO':sug?'SUGERIDO ~':'SIN CLASIFICAR';
    const cCard = e.estado==='confirmado'?'confirmed':sug?'suggested':'pending';

    const grupos = [...new Set(CATEGORIAS.map(c=>c.grupo))];
    const opts = grupos.map(g=>{
      const subs = CATEGORIAS.filter(c=>c.grupo===g);
      const subOpts = subs.map(c=>{
        const val = c.id;
        const label = c.subgrupo ? `${c.grupo} / ${c.subgrupo}` : c.grupo;
        const sel = e.categoria_id===c.id ? 'selected' : (sug&&sug.id===c.id&&e.estado==='pendiente'?'selected':'');
        return `<option value="${val}" ${sel}>${escaparHTML(label)}</option>`;
      }).join('');
      return `<optgroup label="${escaparHTML(g)}">${subOpts}</optgroup>`;
    }).join('');

    const descSegura = escaparHTML(e.descripcion || '(sin descripción)');
    const ref2show = e.referencia2 && e.referencia2.length>2 ? ` · ${escaparHTML(e.referencia2)}` : '';
    const sugerido = sug && e.estado==='pendiente' ? `<div class="reason">→ Sugerido: ${escaparHTML(sug.grupo)}${sug.subgrupo?' / '+escaparHTML(sug.subgrupo):''}</div>` : '';
    const btnConf = e.estado!=='confirmado' ? `<button class="btn btn-confirm" onclick="confirmarEgreso('${e.id}',this)">✓ Confirmar</button>` : '';
    const btnElim = `<button class="btn btn-remove" onclick="eliminarEgreso('${e.id}')" style="margin-left:auto">🗑</button>`;

    return `<div class="card ${cCard}" id="eg-${e.id}">
      <div class="card-top">
        <div class="card-left">
          <div class="desc">${descSegura}</div>
          <div class="meta">${e.fecha||''} · OP ${escaparHTML(String(e.operacion))}${ref2show}</div>
        </div>
        <div style="text-align:right">
          <div class="monto" style="color:var(--red)">-${fmtMonto(e.monto,e.moneda)}</div>
          <span class="badge ${bClass}">${bLabel}</span>
        </div>
      </div>
      <div class="factura-row">
        <select class="factura-select" onchange="cambiarCategoriaEgreso('${e.id}',this.value)" ${e.estado==='confirmado'?'disabled':''}>
          <option value="">— Seleccionar categoría —</option>
          ${opts}
        </select>
        ${btnConf}
        ${btnElim}
      </div>
      ${sugerido}
    </div>`;
  }).join('');
}

async function cambiarCategoriaEgreso(id, catId){
  const e = EGRESOS.find(x=>x.id===id);
  if(!e) return;
  const cat = CATEGORIAS.find(c=>c.id===catId);
  e.categoria_id = catId;
  e.categoria_nombre = cat ? (cat.grupo+(cat.subgrupo?' / '+cat.subgrupo:'')) : '';
  e.estado = catId ? 'pendiente' : 'pendiente';
}

async function confirmarEgreso(id, btn){
  const e = EGRESOS.find(x=>x.id===id);
  if(!e||!e.categoria_id){ toast('Selecciona una categoría primero',''); return; }
  const {error} = await db.from('egresos').update({
    categoria_id: e.categoria_id,
    categoria_nombre: e.categoria_nombre,
    estado: 'confirmado'
  }).eq('id', id);
  if(error){ toast('Error: '+error.message,''); return; }
  e.estado = 'confirmado';
  actualizarStatsEgresos();
  renderEgresos();
  toast('Egreso clasificado ✓','green');
}

async function eliminarEgreso(id){
  if(!confirm('¿Eliminar este egreso permanentemente?')) return;
  const {error} = await db.from('egresos').delete().eq('id', id);
  if(error){ toast('Error: '+error.message,''); return; }
  EGRESOS = EGRESOS.filter(x=>x.id!==id);
  actualizarStatsEgresos();
  renderEgresos();
  toast('Egreso eliminado','');
}

function exportarEgresos(){
  const rows=[['Fecha','Descripcion','Referencia','Monto','Operacion','Categoria','Estado']];
  EGRESOS.forEach(e=>{
    rows.push([e.fecha, '"'+(e.descripcion||'')+'"', '"'+(e.referencia2||'')+'"',
      e.monto, e.operacion, '"'+(e.categoria_nombre||'')+'"', e.estado]);
  });
  const csv=rows.map(r=>r.join(',')).join('\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='egresos_'+new Date().toISOString().slice(0,10)+'.csv'; a.click();
  toast('CSV egresos exportado ✓','green');
}

// ─── CATEGORIAS ───────────────────────────────────────────────────────────────
function renderCategorias(){
  const lista = document.getElementById('cat-lista');
  if(!lista) return;
  if(!CATEGORIAS.length){ lista.innerHTML='<div class="empty"><span class="empty-icon">⚙️</span>Sin categorías cargadas</div>'; return; }

  const grupos = [...new Set(CATEGORIAS.map(c=>c.grupo))];
  lista.innerHTML = grupos.map(g=>{
    const items = CATEGORIAS.filter(c=>c.grupo===g);
    const rows = items.map(c=>`
      <div class="fact-row">
        <div style="flex:1">
          <div class="fact-name">${escaparHTML(c.grupo)}${c.subgrupo?' <span style="color:var(--text3)">/ '+escaparHTML(c.subgrupo)+'</span>':''}</div>
          <div class="fact-num" style="color:var(--text3);font-size:11px">${escaparHTML(c.palabras_clave)||'Sin palabras clave'}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn" onclick="editarCategoria('${c.id}')" style="font-size:11px">✏️ Editar</button>
          <button class="btn btn-remove" onclick="toggleCategoria('${c.id}',${!c.activo})" style="font-size:11px">${c.activo?'Desactivar':'Activar'}</button>
        </div>
      </div>`).join('');
    return `<div style="border-bottom:2px solid var(--border);padding:12px 0 4px;margin-bottom:4px">
      <div style="font-size:11px;font-weight:600;color:var(--text3);letter-spacing:.5px;padding:0 16px 8px;text-transform:uppercase">${escaparHTML(g)}</div>
      ${rows}
    </div>`;
  }).join('');
}

function mostrarFormCategoria(){ document.getElementById('form-categoria').style.display='block'; document.getElementById('cat-edit-id').value=''; document.getElementById('cat-grupo').value=''; document.getElementById('cat-subgrupo').value=''; document.getElementById('cat-keywords').value=''; document.getElementById('form-cat-title').textContent='Nueva categoría'; }
function cancelarFormCategoria(){ document.getElementById('form-categoria').style.display='none'; }

function editarCategoria(id){
  const cat = CATEGORIAS.find(c=>c.id===id);
  if(!cat) return;
  document.getElementById('form-categoria').style.display='block';
  document.getElementById('cat-edit-id').value=id;
  document.getElementById('cat-grupo').value=cat.grupo;
  document.getElementById('cat-subgrupo').value=cat.subgrupo||'';
  document.getElementById('cat-keywords').value=cat.palabras_clave||'';
  document.getElementById('form-cat-title').textContent='Editar categoría';
  document.getElementById('form-categoria').scrollIntoView({behavior:'smooth'});
}

async function guardarCategoria(){
  const id = document.getElementById('cat-edit-id').value;
  const grupo = document.getElementById('cat-grupo').value.trim();
  const subgrupo = document.getElementById('cat-subgrupo').value.trim();
  const keywords = document.getElementById('cat-keywords').value.trim();
  if(!grupo){ toast('El grupo es obligatorio',''); return; }
  const data = {grupo, subgrupo:subgrupo||null, palabras_clave:keywords||null, activo:true};
  let error;
  if(id){
    ({error} = await db.from('categorias').update(data).eq('id',id));
    if(!error){ const i=CATEGORIAS.findIndex(c=>c.id===id); if(i>=0) CATEGORIAS[i]={...CATEGORIAS[i],...data}; }
  } else {
    const {data:nuevo, error:e} = await db.from('categorias').insert({...data,orden:999}).select().single();
    error=e;
    if(!error&&nuevo) CATEGORIAS.push(nuevo);
  }
  if(error){ toast('Error: '+error.message,''); return; }
  cancelarFormCategoria();
  renderCategorias();
  poblarFiltroCategorias();
  toast((id?'Categoría actualizada':'Categoría creada')+' ✓','green');
}

async function toggleCategoria(id, activar){
  const {error} = await db.from('categorias').update({activo:activar}).eq('id',id);
  if(error){ toast('Error: '+error.message,''); return; }
  const cat = CATEGORIAS.find(c=>c.id===id);
  if(cat) cat.activo = activar;
  renderCategorias();
  toast((activar?'Categoría activada':'Categoría desactivada'),'');
}

// ─── LOGIN SEGURO CON SUPABASE ───────────────────────────────────────────────
async function login(){
  const email = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value;
  const err = document.getElementById('login-error');
  const btn = document.querySelector('.login-btn');

  btn.textContent = 'VERIFICANDO...';
  btn.disabled = true;

  const { data, error } = await db.auth.signInWithPassword({
    email: email,
    password: pass
  });

  if (error) {
    err.textContent = 'Correo o contraseña incorrectos';
    err.style.display = 'block';
    document.getElementById('login-pass').value = '';
    document.getElementById('login-pass').focus();
    btn.textContent = 'INGRESAR →';
    btn.disabled = false;
  } else {
    document.getElementById('login-overlay').style.display = 'none';
    err.style.display = 'none';
    init(); 
  }
}

async function checkAuth(){
  const { data: { session } } = await db.auth.getSession();
  
  if (session) {
    document.getElementById('login-overlay').style.display = 'none';
    return true; 
  } else {
    document.getElementById('login-overlay').style.display = 'flex';
    return false;
  }
}

// ─── INIT ────────────────────────────────────────────────────────────────────
checkAuth().then(tieneSesion => {
  if(tieneSesion){
    init();
  }
});
function exportarEstadoCuentaPDF() {
  const busquedaInput = document.getElementById('ff-busca').value.trim();
  
  if (!busquedaInput || busquedaInput.length < 3) {
    alert('Por favor, escribe el nombre del cliente en el buscador para generar su Estado de Cuenta.');
    return;
  }

  const buscaNorm = norm(busquedaInput);
  const facturasCliente = FACTURAS.filter(f => norm(f.razon_social).includes(buscaNorm) || norm(f.factura).includes(buscaNorm));

  if (!facturasCliente.length) {
    alert('No se encontraron facturas pendientes para este cliente.');
    return;
  }

  const clienteNombre = facturasCliente[0].razon_social || 'Cliente';
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

    totalDeuda += parseFloat(f.saldo || 0);
    const montoFormateado = parseFloat(f.saldo || 0).toLocaleString('es-PE', {minimumFractionDigits: 2});

    return `
      <tr>
        <td>${f.fecha_doc || ''}</td>
        <td>${escaparHTML(f.factura)}</td>
        <td style="${colorDias}">${diasTexto}</td>
        <td class="amount right">${montoFormateado}</td>
        <td>SALDO PENDIENTE - POR REGULARIZAR</td>
      </tr>
    `;
  }).join('');

  const hoy = new Date().toLocaleDateString('es-PE');

  const html = `
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <title>Estado de Cuenta - ${escaparHTML(clienteNombre)}</title>
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
        <h2>Estado de cuenta</h2>
      </div>
      <div class="right-area">
        <div class="date">${hoy}</div>
        <img src="https://www.capeco.org/wp-content/uploads/2021/04/logo-capeco.png" class="logo" alt="CAPECO">
      </div>
    </div>
    <div class="red-line"></div>
    
    <div class="client-info">
      <div class="name">${escaparHTML(clienteNombre)}</div>
      <div class="ruc">Detalle de facturas pendientes</div>
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
      <div class="total-value">${parseFloat(totalDeuda).toLocaleString('es-PE', {minimumFractionDigits: 2})}</div>
    </div>

    <script>
      window.onload = function() { setTimeout(() => window.print(), 500); }
    </script>
  </body>
  </html>
  `;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}
// ─── GENERADOR DE REPORTES ESTADÍSTICOS ──────────────────────────────────────
function renderReportes() {
  // 1. LÓGICA: ALERTA PREVENTIVA (3+ FACTURAS VENCIDAS)
  const deudasPorCliente = {};
  
  // Agrupamos solo las facturas que tengan saldo pendiente y estén estrictamente vencidas
  FACTURAS.forEach(f => {
    const dias = diasHasta(f.fecha_ven);
    if (f.saldo > 0 && dias !== null && dias < 0) {
      if (!deudasPorCliente[f.razon_social]) {
        deudasPorCliente[f.razon_social] = { cantidad: 0, totalSaldoPEN: 0, totalSaldoUSD: 0 };
      }
      deudasPorCliente[f.razon_social].cantidad++;
      // Separamos por moneda para no sumar soles con dólares en el total mostrado
      if (f.moneda === 'USD') deudasPorCliente[f.razon_social].totalSaldoUSD += parseFloat(f.saldo || 0);
      else deudasPorCliente[f.razon_social].totalSaldoPEN += parseFloat(f.saldo || 0);
    }
  });

  // Filtramos las empresas que cumplen el criterio de riesgo (3 o más documentos vencidos)
  const asociadosEnRiesgo = Object.keys(deudasPorCliente)
    .map(key => ({ razon_social: key, ...deudasPorCliente[key] }))
    .filter(a => a.cantidad >= 3)
    .sort((a, b) => b.cantidad - a.cantidad);

  // Dibujamos la tabla de alertas preventivas
  const htmlAlertas = asociadosEnRiesgo.length === 0 
    ? '<div class="empty" style="padding:20px 0;"><span class="empty-icon">💚</span>No hay asociados en riesgo de suspensión</div>'
    : `<table style="width:100%; border-collapse:collapse; font-size:12px;">
        <thead>
          <tr style="border-bottom:2px solid var(--red); text-align:left; color:var(--text2);">
            <th style="padding:8px 4px;">Asociado / Razón Social</th>
            <th style="padding:8px 4px; text-align:center;">Docs. Vencidos</th>
            <th style="padding:8px 4px; text-align:right;">Total Pendiente</th>
          </tr>
        </thead>
        <tbody>
          ${asociadosEnRiesgo.map(a => `
            <tr style="border-bottom:1px solid var(--border2);">
              <td style="padding:8px 4px; font-weight:500; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escaparHTML(a.razon_social)}</td>
              <td style="padding:8px 4px; text-align:center;"><span style="background:#ffe6e6; color:#e3000f; padding:2px 8px; border-radius:10px; font-weight:bold;">${a.cantidad} cuotas</span></td>
              <td style="padding:8px 4px; text-align:right; font-weight:600; color:#e3000f;">${a.totalSaldoUSD>0?fmtMonto(a.totalSaldoPEN,'PEN')+' · '+fmtMonto(a.totalSaldoUSD,'USD'):fmtMonto(a.totalSaldoPEN,'PEN')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  document.getElementById('reporte-alertas').innerHTML = htmlAlertas;

  // 1b. ALERTA: facturas F201/F301 >S/700 registradas en USD (posible dato mal cargado,
  // ya que Banco de la Nación nunca acepta la detracción en dólares).
  const inconsistentes = FACTURAS.filter(f=>f.moneda==='USD' && requiereDetraccionPEN(f));
  const htmlIncons = inconsistentes.length === 0
    ? '<div class="empty" style="padding:20px 0;"><span class="empty-icon">✅</span>No se encontraron inconsistencias</div>'
    : `<table style="width:100%; border-collapse:collapse; font-size:12px;">
        <thead>
          <tr style="border-bottom:2px solid var(--amber); text-align:left; color:var(--text2);">
            <th style="padding:8px 4px;">Factura</th>
            <th style="padding:8px 4px;">Empresa</th>
            <th style="padding:8px 4px; text-align:right;">Importe (USD)</th>
          </tr>
        </thead>
        <tbody>
          ${inconsistentes.map(f=>`
            <tr style="border-bottom:1px solid var(--border2);">
              <td style="padding:8px 4px; font-weight:600;">${escaparHTML(f.factura)}</td>
              <td style="padding:8px 4px; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escaparHTML(f.razon_social)}</td>
              <td style="padding:8px 4px; text-align:right; font-weight:600; color:var(--amber-text);">${fmtMonto(f.saldo,'USD')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  document.getElementById('reporte-detraccion-moneda').innerHTML = htmlIncons;


  // 2. LÓGICA: REPORTE DE INGRESOS POR RUBRO (SEGÚN GLOSA BANCARIA)
  // Cada rubro guarda su monto en PEN y en USD por separado: sumar soles con dólares
  // en una sola cifra falsea el total, así que se calculan y muestran de forma independiente.
  function rubrosVacios(){
    return {
      'Cuotas Institucionales / Membresías': {PEN:0,USD:0},
      'Certificaciones y Constancias': {PEN:0,USD:0},
      'Capacitaciones, Cursos y Eventos': {PEN:0,USD:0},
      'Otros Ingresos por Identificar': {PEN:0,USD:0}
    };
  }
  const rubros = rubrosVacios();
  let totalPEN = 0, totalUSD = 0;

  // Clasificamos los abonos que ya se encuentran en estado 'confirmado'
  PAGOS.forEach(p => {
    if (p.estado === 'confirmado' && p.monto > 0) {
      const glosa = (p.descripcion || '').toUpperCase();
      const mon = p.moneda === 'USD' ? 'USD' : 'PEN';
      const monto = parseFloat(p.monto);
      if (mon === 'USD') totalUSD += monto; else totalPEN += monto;

      let key;
      if (glosa.includes('CUOTA') || glosa.includes('MEMBRE') || glosa.includes('APORTE') || glosa.includes('ASOC')) key = 'Cuotas Institucionales / Membresías';
      else if (glosa.includes('CERTIF') || glosa.includes('CONSTANC') || glosa.includes('DERECHO') || glosa.includes('TASA')) key = 'Certificaciones y Constancias';
      else if (glosa.includes('CURSO') || glosa.includes('CAPACIT') || glosa.includes('SEMINARIO') || glosa.includes('FORO') || glosa.includes('CONGRE')) key = 'Capacitaciones, Cursos y Eventos';
      else key = 'Otros Ingresos por Identificar';
      rubros[key][mon] += monto;
    }
  });

  function tablaRubros(moneda, total){
    if (total === 0) return '';
    return `<table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:14px;">
        <thead>
          <tr style="border-bottom:2px solid var(--green); text-align:left; color:var(--text2);">
            <th style="padding:8px 4px;">Línea de Ingreso / Rubro ${moneda==='USD'?'(US$)':'(S/)'}</th>
            <th style="padding:8px 4px; text-align:center;">Participación</th>
            <th style="padding:8px 4px; text-align:right;">Monto Recaudado</th>
          </tr>
        </thead>
        <tbody>
          ${Object.keys(rubros).map(key => {
            const montoRubro = rubros[key][moneda];
            const porcentaje = total > 0 ? Math.round((montoRubro / total) * 100) : 0;
            return `
              <tr style="border-bottom:1px solid var(--border2);">
                <td style="padding:8px 4px; font-weight:500;">${key}</td>
                <td style="padding:8px 4px; text-align:center; color:var(--text3);">${porcentaje}%</td>
                <td style="padding:8px 4px; text-align:right; font-weight:600; color:#10b981;">${fmtMonto(montoRubro,moneda)}</td>
              </tr>
            `;
          }).join('')}
          <tr style="background:var(--bg3); font-weight:bold; border-top:2px solid var(--border);">
            <td style="padding:10px 4px;">TOTAL RECAUDADO MONITOREADO</td>
            <td style="padding:10px 4px; text-align:center;">100%</td>
            <td style="padding:10px 4px; text-align:right; color:var(--text);">${fmtMonto(total,moneda)}</td>
          </tr>
        </tbody>
      </table>`;
  }

  const htmlRubros = (totalPEN === 0 && totalUSD === 0)
    ? '<div class="empty" style="padding:20px 0;"><span class="empty-icon">🪙</span>No hay ingresos conciliados en este período</div>'
    : tablaRubros('PEN', totalPEN) + tablaRubros('USD', totalUSD);
  document.getElementById('reporte-rubros').innerHTML = htmlRubros;
}
// Funcionalidad para ocultar y mostrar el panel lateral
document.addEventListener('DOMContentLoaded', () => {
    const btnToggle = document.getElementById('btn-toggle-menu');
    const sidebar = document.querySelector('.sidebar');
    const main = document.querySelector('.main');

    if(btnToggle && sidebar && main) {
        btnToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            main.classList.toggle('expanded');
            btnToggle.classList.toggle('collapsed');
        });
    }
});
