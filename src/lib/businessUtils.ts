import { Factura, Abono, Categoria } from '../types';

export const UMBRAL_DETRACCION_PEN = 700;
export const UMBRAL_DETRACCION_USD = 212;

// FIX #10 (rendimiento/UX): loops síncronos grandes (p. ej. sugerirFactura corriendo
// sobre cientos de abonos pendientes x miles de facturas) bloquean el hilo principal
// del navegador. Si tardan más de unos pocos segundos corridos, Chrome muestra el
// diálogo "la página no responde" — no es un bug de memoria ni de red, es que el
// hilo nunca tiene chance de repintar ni de atender eventos mientras el loop corre.
//
// Esta función procesa el arreglo en lotes pequeños y, entre lote y lote, cede el
// control al navegador con un `setTimeout(0)`. El trabajo total es el mismo (no
// optimiza el algoritmo en sí), pero fragmentado así el navegador nunca ve un
// bloqueo de más de un puñado de milisegundos consecutivos, así que no se congela
// ni dispara el diálogo de "no responde".
export async function procesarEnLotes<T>(
  items: T[],
  procesarItem: (item: T) => void,
  tamLote = 50
): Promise<void> {
  for (let i = 0; i < items.length; i += tamLote) {
    const lote = items.slice(i, i + tamLote);
    lote.forEach(procesarItem);
    // Cede el hilo principal: deja que el navegador pinte/responda antes del siguiente lote
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

export function esSerieDetraccion(numFactura: string): boolean {
  const s = String(numFactura || '').toUpperCase();
  return s.startsWith('F201') || s.startsWith('F301');
}

export function requiereDetraccionPEN(f: { factura: string; saldo_original?: number; saldo: number; moneda: 'PEN' | 'USD' | string }): boolean {
  if (!esSerieDetraccion(f.factura)) return false;
  const umbral = f.moneda === 'USD' ? UMBRAL_DETRACCION_USD : UMBRAL_DETRACCION_PEN;
  const saldoBase = f.saldo_original !== undefined ? f.saldo_original : parseFloat(String(f.saldo || 0));
  return saldoBase > umbral;
}

export function esAbonoDetraccionBN(p: { descripcion?: string }): boolean {
  return /^DETRACCION BN/i.test(p.descripcion || '');
}

export function norm(s: string | null | undefined): string {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

// FIX #7 (rendimiento): sugerirFactura se llama una vez POR CADA abono pendiente,
// y en cada llamada recalculaba norm(f.razon_social) desde cero para cada factura
// candidata (mayúsculas + regex). Con ~500 abonos pendientes x ~1500 facturas, eso
// son cientos de miles de normalizaciones de texto repetidas e innecesarias — la
// razón social de una factura no cambia entre una llamada y la siguiente dentro de
// la misma carga. Esta función cachea el resultado directamente en el objeto factura
// (con un campo oculto), calculándolo una sola vez la primera vez que se necesita.
function rsNormOf(f: any): string {
  if (f.__rsNorm === undefined) {
    f.__rsNorm = norm(f.razon_social);
  }
  return f.__rsNorm;
}

export function diasHasta(fecha: string | Date | null): number | null {
  if (!fecha) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  let str = String(fecha).trim().split(' ')[0].split('T')[0];
  let f: Date;
  const mLatino = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mLatino) {
    f = new Date(parseInt(mLatino[3]), parseInt(mLatino[2]) - 1, parseInt(mLatino[1]));
  } else {
    const mISO = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (mISO) {
      f = new Date(parseInt(mISO[1]), parseInt(mISO[2]) - 1, parseInt(mISO[3]));
    } else {
      f = new Date(str);
    }
  }
  if (!f || isNaN(f.getTime())) return null;
  f.setHours(0, 0, 0, 0);
  return Math.round((f.getTime() - hoy.getTime()) / 86400000);
}

export function fmtFecha(v: any): string | null {
  if (!v) return null;
  if (typeof v === 'number') {
    const d = new Date((v - 25569) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string') {
    const s = v.trim();
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const m2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
    if (m2) return `20${m2[3]}-${m2[1].padStart(2, '0')}-${m2[2].padStart(2, '0')}`;
    return s.slice(0, 10);
  }
  return null;
}

export function fmtMonto(n: number | string, moneda?: string): string {
  const num = typeof n === 'string' ? parseFloat(n) || 0 : n;
  const simbolo = moneda === 'USD' ? 'US$ ' : 'S/ ';
  return simbolo + num.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function extractNumFact(s: string): string | null {
  let m = s.match(/F\d+[-\s]?0*(\d{4,})/i);
  if (m) return m[1];
  m = s.match(/(?<![0-9])(0*(\d{5,}))/);
  if (m) return m[2];
  return null;
}

const PALABRAS_GENERICAS_EMPRESA = new Set([
  'INGENIERIA', 'INGENIEROS', 'INGENIERO', 'CONSTRUCCION', 'CONSTRUCCIONES', 'CONSTRUCTORA', 'CONSTRUCTOR',
  'CONTRATISTA', 'CONTRATISTAS', 'GENERAL', 'GENERALES', 'SERVICIO', 'SERVICIOS', 'EMPRESA', 'EMPRESAS',
  'CORPORACION', 'GRUPO', 'PERU', 'PERUANA', 'PERUANO', 'SOCIEDAD', 'ANONIMA', 'CERRADA', 'ABIERTA', 'LIMITADA',
  'RESPONSABILIDAD', 'PROYECTO', 'PROYECTOS', 'OBRA', 'OBRAS', 'INMOBILIARIA', 'INMOBILIARIO', 'INVERSIONES',
  'INVERSION', 'COMERCIAL', 'INDUSTRIAL', 'NACIONAL', 'INTERNACIONAL', 'ASOCIADOS', 'CONSULTORES', 'CONSULTORIA',
  'ARQUITECTOS', 'ARQUITECTURA', 'COMPANIA', 'TRADING', 'IMPORT', 'EXPORT', 'MULTISERVICIOS', 'SOLUCIONES',
  // 🚨 NUEVAS INCLUSIONES CRÍTICAS:
  'SAC', 'SRL', 'EIRL', 'SAA', 'SA', 'E.I.R.L', 'S.A.C', 'S.R.L', 'S.A'
]);

export function sugerirFactura(pago: Partial<Abono>, facturas: Factura[]): { factura: string; razon: string; motivo: string; confianza: 'alta' | 'media' } | null {
  const desc = norm(pago.descripcion);
  const ref2 = norm(pago.referencia2);
  const ord = norm(pago.ordenante);
  const monto = parseFloat(String(pago.monto || 0));
  const monedaPago = pago.moneda === 'USD' ? 'USD' : 'PEN';
  const esBN = esAbonoDetraccionBN({ descripcion: pago.descripcion });

  const disponibles = facturas.filter(f => {
    if (f.saldo <= 0.01) return false;
    const mismaMoneda = (f.moneda === 'USD' ? 'USD' : 'PEN') === monedaPago;
    const excepcionDetraccion = esBN && f.moneda === 'USD' && requiereDetraccionPEN(f);
    return mismaMoneda || excepcionDetraccion;
  });

  // 1. Número de factura en referencia2 con prefijo F
  let m = (pago.referencia2 || '').match(/F\d+-?0*(\d{4,})/i);
  if (m) {
    const nd = m[1];
    const f = disponibles.find(x => x.factura.includes(nd));
    if (f) return { factura: f.factura, razon: f.razon_social, motivo: 'N° factura en referencia', confianza: 'alta' };
  }

  // 2. Número de factura extraído de descripción
  const nd = extractNumFact(pago.descripcion || '');
  if (nd) {
    const f = disponibles.find(x => x.factura.includes(nd));
    if (f) return { factura: f.factura, razon: f.razon_social, motivo: 'N° factura en descripción', confianza: 'alta' };
  }

  // 3. Número de factura extraído de referencia2
  const nr = extractNumFact(pago.referencia2 || '');
  if (nr) {
    const f = disponibles.find(x => x.factura.includes(nr));
    if (f) return { factura: f.factura, razon: f.razon_social, motivo: 'N° factura en referencia', confianza: 'alta' };
  }

  // 4. Match de Voucher BCP (Últimos 4 dígitos + Relleno de Ceros en Glosa)
  const opNumeros = String(pago.operacion || '').replace(/\D/g, '');
  if (opNumeros.length >= 4 && monto > 0) {
    const ultimos4 = opNumeros.slice(-4);
    const fPorVoucher = disponibles.find(f => {
      if (Math.abs(f.saldo - monto) >= 0.01 || !f.glosa) return false;
      let textoGlosa = String(f.glosa).trim();
      if (!isNaN(Number(textoGlosa)) && textoGlosa.length > 0 && textoGlosa.length < 4) {
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

  // 5. Coincidencia por Importe Exacto + Palabras Claves de Razón Social
  const facturasMontoExacto = disponibles.filter(f => Math.abs(f.saldo - monto) < 0.01);
  const palabrasBusqueda = (ord + ' ' + desc + ' ' + ref2).split(' ').filter(w => w.length > 3 && !PALABRAS_GENERICAS_EMPRESA.has(w));

  if (facturasMontoExacto.length > 0 && palabrasBusqueda.length > 0) {
    let best: Factura | null = null;
    let bestScore = 0;
    for (const f of facturasMontoExacto) {
      const rs = rsNormOf(f);
      let score = 0;
      const ordWords = ord.split(' ').filter(w => w.length > 2 && !PALABRAS_GENERICAS_EMPRESA.has(w));
      for (const w of ordWords) {
        if (rs.includes(w)) score += (w.length * 2);
      }
      const descWords = (desc + ' ' + ref2).split(' ').filter(w => w.length > 3 && !PALABRAS_GENERICAS_EMPRESA.has(w));
      for (const w of descWords) {
        if (rs.includes(w)) score += w.length;
      }
      if (score > bestScore) {
        bestScore = score;
        best = f;
      }
    }
    if (best && bestScore >= 4) {
      return { factura: (best as Factura).factura, razon: (best as Factura).razon_social, motivo: 'Importe exacto y coincidencia de cliente', confianza: 'alta' };
    }
  }

  // 6. Por Ordenante del Cliente
  if (ord && ord.length > 3) {
    const ordWords = ord.split(' ').filter(w => w.length > 2 && !PALABRAS_GENERICAS_EMPRESA.has(w));
    
    // Solo evaluar si quedaron palabras reales que no sean genéricas
    if (ordWords.length > 0) { 
      let facturasDelCliente: Factura[] = [];
      
      for (const f of disponibles) {
        const rs = (f as any).razon_social_norm || norm(f.razon_social);
        
        // Coincidencia fuerte: el nombre de uno contiene al otro por completo
        if (rs.includes(ord) || ord.includes(rs)) {
          facturasDelCliente.push(f);
          continue;
        }
        
        // Coincidencia por palabras individuales
        let coincidencias = 0;
        for (const w of ordWords) {
          if (rs.includes(w)) coincidencias++;
        }
        
        // REGLA ESTRICTA: Exigir al menos el 50% de coincidencias de las palabras clave
        // Ej: Si el cliente tiene 2 palabras clave, debe coincidir al menos 1. Si tiene 4, deben coincidir 2.
        const umbralMinimo = Math.max(1, Math.ceil(ordWords.length * 0.5));
        
        if (coincidencias >= umbralMinimo) {
          facturasDelCliente.push(f);
        }
      }
      
      if (facturasDelCliente.length > 0) {
        facturasDelCliente.sort((a, b) => a.fecha_doc.localeCompare(b.fecha_doc));
        const pagables = facturasDelCliente.filter(f => f.saldo <= monto);
        
        if (pagables.length > 0) {
          return { factura: pagables[0].factura, razon: pagables[0].razon_social, motivo: 'Ordenante detectado — Factura más antigua', confianza: 'media' };
        }
        
        // BLOQUEO DE ABSURDOS: Solo sugerimos "Abono parcial" si el abono representa 
        // al menos el 5% del saldo de la factura. Esto evita cruzar S/ 7.20 con S/ 1,880.00
        const facturaParaParcial = facturasDelCliente[0];
        if (monto >= (facturaParaParcial.saldo * 0.05)) {
          return { factura: facturaParaParcial.factura, razon: facturaParaParcial.razon_social, motivo: 'Abono parcial de cliente detectado', confianza: 'media' };
        }
      }
    }
  }
  // 7. Similitud de texto en disponibles generales
  const candsGeneral = disponibles.filter(f => f.saldo <= monto);
  if (palabrasBusqueda.length > 0 && candsGeneral.length > 0) {
    let best: Factura | null = null;
    let bestScore = 0;
    let bestPalabrasUsadas = 0;
    for (const f of candsGeneral) {
      const rs = rsNormOf(f);
      let score = 0;
      let palabrasUsadas = 0;
      for (const w of palabrasBusqueda) {
        if (rs.includes(w)) {
          score += w.length;
          palabrasUsadas++;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = f;
        bestPalabrasUsadas = palabrasUsadas;
      }
    }
    if (best && bestScore >= 8 && bestPalabrasUsadas >= 1) {
      const emp = rsNormOf(best as Factura);
      const elegida = disponibles.filter(f => rsNormOf(f) === emp).sort((a, b) => a.fecha_doc.localeCompare(b.fecha_doc))[0] || best;
      return { factura: elegida.factura, razon: elegida.razon_social, motivo: 'Similitud de texto — factura más antigua', confianza: 'media' };
    }
  }

  return null;
}

export function sugerirCategoria(egreso: { descripcion: string; referencia2?: string }, categorias: Categoria[]): Categoria | null {
  const texto = ((egreso.descripcion || '') + ' ' + (egreso.referencia2 || '')).toLowerCase();
  let bestCat: Categoria | null = null;
  let bestScore = 0;
  for (const cat of categorias) {
    if (!cat.palabras_clave) continue;
    const kws = cat.palabras_clave.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    let score = 0;
    for (const kw of kws) {
      if (kw && texto.includes(kw)) score += kw.length;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCat = cat;
    }
  }
  return bestScore >= 3 ? bestCat : null;
}
