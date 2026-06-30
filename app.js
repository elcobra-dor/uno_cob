async function cargarBancos(input){
  const wb = await leerExcel(input.files[0]);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json(ws, {header: 1, defval: ''});

  if (!rawData.length) { alert('El archivo está vacío.'); return; }

  // 1. ESCÁNER TIPO DE BANCO Y MONEDA (VERSIÓN ANTI-TILDES + LIBRO MAYOR)
  let esLibroMayor = false;
  let esDolares = false;
  let esNacion = false;
  let esInterbank = false;
  let esScotiabank = false;
  let esBbva = false;
  let headerIdx = -1;
  let monedaBanco = 'PEN';

  for(let i = 0; i < Math.min(rawData.length, 25); i++){
    // Limpiamos la fila de tildes para una lectura a prueba de fallos
    const filaTexto = rawData[i].join(' ').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // 🌟 NUEVO RADAR: LIBRO MAYOR CONSOLIDADO
    if(filaTexto.includes('BANCO') && filaTexto.includes('MONEDA') && filaTexto.includes('MONTO') && filaTexto.includes('DESCRIPCION OPERACION')) {
      esLibroMayor = true;
      headerIdx = i;
      break;
    }

    // Detector global de dólares
    if(filaTexto.includes('DOLARES') || filaTexto.includes('USD') || filaTexto.includes('US$') || filaTexto.includes('CCME') || filaTexto.includes('IMPORTES EN: USD')) {
      esDolares = true;
      monedaBanco = 'USD';
    }

    if(filaTexto.includes('CARGO') && filaTexto.includes('ABONO') && filaTexto.includes('RUC') && filaTexto.includes('OFICINA') && !filaTexto.includes('F. OPERACION')) {
      esNacion = true; headerIdx = i; break;
    }
    if(filaTexto.includes('FECHA DE OPERACION') && filaTexto.includes('NRO. DE OPERACION') && filaTexto.includes('CARGO') && filaTexto.includes('ABONO')) {
      esInterbank = true; headerIdx = i; break;
    }
    if(filaTexto.includes('FECHA') && filaTexto.includes('MOVIMIENTO') && filaTexto.includes('IMPORTE') && filaTexto.includes('REFERENCIA') && filaTexto.includes('CDR')) {
      esScotiabank = true; headerIdx = i; break;
    }
    if(filaTexto.includes('F. OPERACION') && filaTexto.includes('CONCEPTO') && filaTexto.includes('IMPORTE') && filaTexto.includes('OFICINA')) {
      esBbva = true; headerIdx = i; break;
    }
    if((filaTexto.includes('MONTO') || filaTexto.includes('IMPORTE')) && filaTexto.includes('OPERACI') && !esBbva && !esInterbank) {
      headerIdx = i; break;
    }
  }

  if(headerIdx === -1) {
    alert('No se detectaron las cabeceras. Asegúrate de subir un archivo contable válido.');
    return;
  }

  const nuevos = [];
  const egresosRaw = [];

  function limpiarMonto(texto) {
    // Quita S/, $, comas y espacios, PERO respeta el signo negativo (-)
    let limpio = String(texto || '').replace(/[S\/\$\s,]/g, '').trim();
    return parseFloat(limpio) || 0;
  }

  // 2. PROCESAMIENTO SEGÚN EL BANCO O FORMATO
  if (esLibroMayor) {
    // --- 🌟 LÓGICA LIBRO MAYOR (TODOS LOS BANCOS EN 1) ---
    const headers = rawData[headerIdx].map(h => String(h).trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
    const colMoneda = headers.indexOf('MONEDA');
    const colFecha = headers.indexOf('FECHA');
    const colDesc = headers.indexOf('DESCRIPCION OPERACION');
    const colGlosa = headers.indexOf('GLOSA');
    const colMonto = headers.indexOf('MONTO');
    const colOp = headers.indexOf('OPERACION - NUMERO');

    for(let i = headerIdx + 1; i < rawData.length; i++) {
      const r = rawData[i];
      if(!r || r.length === 0) continue;

      const montoVal = limpiarMonto(r[colMonto]);
      let fechaVal = String(r[colFecha] || '').trim();

      if(!fechaVal || montoVal === 0) continue;

      let opVal = String(r[colOp] || '').trim();
      if(!opVal || opVal === '-' || opVal === '') opVal = 'LM-' + fechaVal.replace(/\//g, '') + '-' + i;

      const monedaCol = String(r[colMoneda] || '').toUpperCase();
      const esUsd = monedaCol.includes('DOLARES') || monedaCol.includes('USD');
      
      const glosaFinal = [String(r[colDesc] || '').trim(), String(r[colGlosa] || '').trim()].filter(Boolean).join(' - ');

      const obj = {
        operacion: opVal,
        fecha: fmtFecha(fechaVal),
        descripcion: glosaFinal,
        moneda: esUsd ? 'USD' : 'PEN'
      };

      if(montoVal > 0) {
        obj.monto = montoVal;
        nuevos.push(obj);
      } else {
        obj.monto = Math.abs(montoVal);
        obj.estado = 'pendiente';
        egresosRaw.push(obj);
      }
    }
  } else if(esBbva) {
    // --- LÓGICA BBVA ---
    const headers = rawData[headerIdx].map(h => String(h).trim().toUpperCase());
    const colFecha = headers.findIndex(h => h.includes('F. OPERACI'));
    const colDoc = headers.findIndex(h => h.includes('Nº. DOC') || h.includes('N. DOC') || h.includes('NRO. DOC') || h.includes('DOC.'));
    const colConcepto = headers.findIndex(h => h.includes('CONCEPTO'));
    const colImporte = headers.findIndex(h => h === 'IMPORTE');

    for(let i = headerIdx + 1; i < rawData.length; i++) {
      const r = rawData[i];
      if(!r || r.length === 0) continue;

      let fechaVal = String(r[colFecha] || '').trim();
      if(!fechaVal || fechaVal.toUpperCase().includes('SALDO')) continue;

      const montoVal = limpiarMonto(r[colImporte]);
      if(montoVal === 0) continue;

      let opVal = String(r[colDoc] || '').trim();
      if(!opVal || opVal === '-') opVal = 'BBVA-' + fechaVal.replace(/\//g, '') + '-' + i;

      const obj = {
        operacion: opVal,
        fecha: fmtFecha(fechaVal),
        descripcion: String(r[colConcepto] || '').trim(),
        moneda: monedaBanco
      };

      if(montoVal > 0) { obj.monto = montoVal; nuevos.push(obj); } 
      else { obj.monto = Math.abs(montoVal); obj.estado = 'pendiente'; egresosRaw.push(obj); }
    }
  } else if(esScotiabank) {
    // --- LÓGICA SCOTIABANK ---
    const headers = rawData[headerIdx].map(h => String(h).trim().toUpperCase());
    const colFecha = headers.findIndex(h => h === 'FECHA');
    const colMov = headers.findIndex(h => h === 'MOVIMIENTO');
    const colImporte = headers.findIndex(h => h === 'IMPORTE');
    const colRef = headers.findIndex(h => h === 'REFERENCIA');

    for(let i = headerIdx + 1; i < rawData.length; i++) {
      const r = rawData[i];
      if(!r || r.length === 0) continue;

      const montoVal = limpiarMonto(r[colImporte]);
      let opVal = String(r[colRef] || '').trim();
      const fechaVal = String(r[colFecha] || '').trim();

      if(!fechaVal || montoVal === 0) continue;
      if(!opVal) opVal = 'SCO-' + fechaVal.replace(/\//g, '') + '-' + i;

      const obj = {
        operacion: opVal,
        fecha: fmtFecha(fechaVal),
        descripcion: String(r[colMov] || '').trim(),
        moneda: monedaBanco
      };

      if(montoVal > 0) { obj.monto = montoVal; nuevos.push(obj); } 
      else { obj.monto = Math.abs(montoVal); obj.estado = 'pendiente'; egresosRaw.push(obj); }
    }
  } else if(esInterbank) {
    // --- LÓGICA INTERBANK ---
    const headers = rawData[headerIdx].map(h => String(h).trim().toUpperCase());
    const colFecha = headers.findIndex(h => h.includes('FECHA DE OPERACI'));
    const colOp = headers.findIndex(h => h.includes('NRO. DE OPERACI'));
    const colMov = headers.findIndex(h => h === 'MOVIMIENTO');
    const colDesc = headers.findIndex(h => h === 'DESCRIPCIÓN' || h === 'DESCRIPCION');
    const colCargo = headers.findIndex(h => h === 'CARGO');
    const colAbono = headers.findIndex(h => h === 'ABONO');

    for(let i = headerIdx + 1; i < rawData.length; i++) {
      const r = rawData[i];
      if(!r || r.length === 0) continue;

      let montoAbono = limpiarMonto(r[colAbono]);
      let montoCargo = Math.abs(limpiarMonto(r[colCargo]));
      let opVal = String(r[colOp] || '').trim();
      let fechaVal = String(r[colFecha] || '').trim();

      if(!fechaVal || (montoAbono === 0 && montoCargo === 0)) continue;
      if (opVal === '-' || opVal === '') opVal = 'INT-' + fechaVal.replace(/\//g, '') + '-' + i;

      const glosaCompleta = [String(r[colMov] || '').trim(), String(r[colDesc] || '').trim()].filter(Boolean).join(' - ');

      const obj = {
        operacion: opVal,
        fecha: fmtFecha(fechaVal),
        descripcion: glosaCompleta,
        moneda: monedaBanco
      };

      if(montoAbono > 0) { obj.monto = montoAbono; nuevos.push(obj); } 
      else if (montoCargo > 0) { obj.monto = montoCargo; obj.estado = 'pendiente'; egresosRaw.push(obj); }
    }
  } else if(esNacion) {
    // --- LÓGICA BANCO DE LA NACIÓN ---
    const headers = rawData[headerIdx].map(h => String(h).trim().toUpperCase());
    const colFecha = headers.findIndex(h => h === 'FECHA');
    const colDoc = headers.findIndex(h => h === 'DOCUMENTO');
    const colRuc = headers.findIndex(h => h === 'RUC');
    const colTrans = headers.findIndex(h => h === 'TRANS.');
    const colCargo = headers.findIndex(h => h === 'CARGO');
    const colAbono = headers.findIndex(h => h === 'ABONO');

    for(let i = headerIdx + 1; i < rawData.length; i++) {
      const r = rawData[i];
      if(!r || r.length === 0) continue;

      let montoAbono = limpiarMonto(r[colAbono]);
      let montoCargo = limpiarMonto(r[colCargo]);
      let opVal = String(r[colDoc] || '').trim();

      if(!opVal || (montoAbono === 0 && montoCargo === 0)) continue;

      let fRaw = String(r[colFecha] || '').replace(/\./g, '-');
      const rucVal = String(r[colRuc] || '').trim();

      const obj = {
        operacion: opVal,
        fecha: fmtFecha(fRaw),
        descripcion: `DETRACCION BN - ${String(r[colTrans] || '').trim()} - RUC: ${rucVal}`,
        referencia2: rucVal, 
        moneda: 'PEN' 
      };

      if(montoAbono > 0) { obj.monto = montoAbono; nuevos.push(obj); } 
      else if (montoCargo > 0) { obj.monto = montoCargo; obj.estado = 'pendiente'; egresosRaw.push(obj); }
    }
  } else {
    // --- LÓGICA BCP ---
    const headers = rawData[headerIdx].map(h => String(h).trim().toLowerCase());
    const colFecha = headers.findIndex(h => /^fecha$/.test(h) || h.includes('fecha valuta'));
    const colDesc = headers.findIndex(h => h.includes('descripci') || h.includes('glosa'));
    const colMonto = headers.findIndex(h => /^monto$/.test(h) || h.includes('importe'));
    const colOp = headers.findIndex(h => h.includes('operaci') && (h.includes('n.m') || h.includes('nro') || h.includes('número')));
    const colRef2 = headers.findIndex(h => h.includes('referencia2'));

    const opIndex = colOp !== -1 ? colOp : headers.findIndex(h => h.includes('operaci'));

    for(let i = headerIdx + 1; i < rawData.length; i++) {
      const r = rawData[i];
      if(!r || r.length === 0) continue;

      const montoVal = limpiarMonto(r[colMonto]);
      const opVal = String(r[opIndex] || '').trim();

      if(!opVal || montoVal === 0) continue;

      const obj = {
        operacion: opVal,
        fecha: fmtFecha(r[colFecha] || ''),
        descripcion: colDesc !== -1 ? String(r[colDesc]).trim() : '',
        referencia2: colRef2 !== -1 ? String(r[colRef2]).trim() : '',
        moneda: monedaBanco
      };

      if(montoVal > 0) { obj.monto = montoVal; nuevos.push(obj); } 
      else { obj.monto = Math.abs(montoVal); obj.estado = 'pendiente'; egresosRaw.push(obj); }
    }
  }

  // 3. GUARDADO EN BASE DE DATOS
  const {error} = await db.from('abonos').upsert(nuevos,{onConflict:'operacion',ignoreDuplicates:true});
  if(error){ toast('Error: ' + error.message, ''); return; }

  if(egresosRaw.length){
    const {error:ee} = await db.from('egresos').upsert(egresosRaw,{onConflict:'operacion',ignoreDuplicates:true});
    if(ee) toast('Advertencia egresos: ' + ee.message, '');
    else toast('Procesado con éxito (' + (esLibroMayor ? 'LIBRO MAYOR MULTI-BANCO' : (esBbva?'BBVA ':esScotiabank?'SCOTIABANK ':esInterbank?'INTERBANK ':esNacion?'BN ':'BCP ') + monedaBanco) + ')', 'green');
  } else {
    toast('Operaciones cargadas correctamente (' + (esLibroMayor ? 'LIBRO MAYOR' : monedaBanco) + ')', 'green');
  }

  document.getElementById('slot-bancos').classList.add('loaded');
  document.getElementById('status-bancos').textContent = nuevos.length + ' ing. · ' + egresosRaw.length + ' egr.';
}
