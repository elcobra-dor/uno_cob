import { Factura, ClienteCobranza, NivelMora, RecordatorioEnvio } from '../types';
import { diasHasta, norm } from './businessUtils';

export const CUENTAS_BANCARIAS_CAPECO = {
  banco1: {
    nombre: 'Banco de Crédito del Perú (BCP)',
    monedaPEN: 'Cta. Cte. Soles: 193-1156821-0-28',
    cciPEN: 'CCI: 002-193-001156821028-14',
    monedaUSD: 'Cta. Cte. Dólares: 193-1156844-1-31',
    cciUSD: 'CCI: 002-193-001156844131-15',
  },
  banco2: {
    nombre: 'BBVA Perú',
    monedaPEN: 'Cta. Cte. Soles: 0011-0175-0100025812',
    cciPEN: 'CCI: 011-175-000100025812-74',
  },
  detracciones: {
    nombre: 'Banco de la Nación (Cta. Detracciones SUNAT)',
    cuenta: '00-000-845112 (A nombre de Cámara Peruana de la Construcción)',
  },
  contactoCobranzas: {
    email: 'tesoreria@capeco.org',
    emailCobranzas: 'cobranzas@capeco.org',
    telefono: '(01) 230-0500 Anexo 124',
    empresa: 'Cámara Peruana de la Construcción - CAPECO',
  }
};

const STORAGE_CONTACTOS_KEY = 'capeco_contactos_cobranza';
const STORAGE_HISTORIAL_KEY = 'capeco_historial_recordatorios';

export interface ContactoInfo {
  correo: string;
  correo_secundario?: string;
  contacto_nombre?: string;
  telefono?: string;
}

export function cargarContactosGuardados(): Record<string, ContactoInfo> {
  try {
    const raw = localStorage.getItem(STORAGE_CONTACTOS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function guardarContacto(ruc: string, data: Partial<ContactoInfo>) {
  const actuales = cargarContactosGuardados();
  actuales[ruc] = {
    ...actuales[ruc],
    ...data,
    correo: data.correo || actuales[ruc]?.correo || ''
  };
  try {
    localStorage.setItem(STORAGE_CONTACTOS_KEY, JSON.stringify(actuales));
  } catch (e) {
    console.error('Error guardando contacto en localStorage', e);
  }
}

export function cargarHistorialRecordatorios(): RecordatorioEnvio[] {
  try {
    const raw = localStorage.getItem(STORAGE_HISTORIAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function guardarRecordatorioEnHistorial(recordatorio: RecordatorioEnvio) {
  const lista = cargarHistorialRecordatorios();
  lista.unshift(recordatorio);
  // Mantener últimos 200 envíos
  const recortada = lista.slice(0, 200);
  try {
    localStorage.setItem(STORAGE_HISTORIAL_KEY, JSON.stringify(recortada));
  } catch (e) {
    console.error('Error guardando historial de recordatorios', e);
  }
}

// Genera un correo predeterminado sugerido a partir de la razón social o dominio
export function sugerirEmail(razonSocial: string, ruc: string): string {
  const clean = norm(razonSocial).replace(/[^a-z0-9]/g, '');
  const prefix = clean.slice(0, 10);
  if (prefix) {
    return `contabilidad@${prefix}.com.pe`;
  }
  return `finanzas@empresa${ruc.slice(0, 6)}.pe`;
}

export function agruparClientesCobranza(
  facturas: Factura[],
  contactosMap: Record<string, ContactoInfo>,
  historial: RecordatorioEnvio[]
): ClienteCobranza[] {
  const agrupado: Record<string, {
    ruc: string;
    razon_social: string;
    facturas: Factura[];
    totalPEN: number;
    totalUSD: number;
    diasMaxAtraso: number;
  }> = {};

  // Solo facturas con saldo positivo mayor a 0.05
  facturas.filter(f => f.saldo > 0.05).forEach(f => {
    const rucKey = f.ruc && f.ruc.trim() !== '' ? f.ruc.trim() : `S_RUC_${norm(f.razon_social).slice(0, 15)}`;
    if (!agrupado[rucKey]) {
      agrupado[rucKey] = {
        ruc: f.ruc || '',
        razon_social: f.razon_social || 'Cliente Sin Razón Social',
        facturas: [],
        totalPEN: 0,
        totalUSD: 0,
        diasMaxAtraso: -9999,
      };
    }

    agrupado[rucKey].facturas.push(f);
    if (f.moneda === 'USD') {
      agrupado[rucKey].totalUSD += f.saldo;
    } else {
      agrupado[rucKey].totalPEN += f.saldo;
    }

    const d = diasHasta(f.fecha_ven);
    if (d !== null) {
      // Si d < 0, está atrasado en |d| días
      const atraso = d < 0 ? Math.abs(d) : -d;
      if (atraso > agrupado[rucKey].diasMaxAtraso) {
        agrupado[rucKey].diasMaxAtraso = atraso;
      }
    }
  });

  const historialPorRuc: Record<string, { ultimo?: string; count: number }> = {};
  historial.forEach(h => {
    if (!historialPorRuc[h.ruc]) {
      historialPorRuc[h.ruc] = { ultimo: h.fechaEnvio, count: 0 };
    }
    historialPorRuc[h.ruc].count++;
  });

  return Object.values(agrupado).map(c => {
    // Determinar nivel de mora
    let nivelMora: NivelMora = 'preventivo';
    if (c.diasMaxAtraso > 30) {
      nivelMora = 'critico';
    } else if (c.diasMaxAtraso >= 15) {
      nivelMora = 'medio';
    } else if (c.diasMaxAtraso >= 1) {
      nivelMora = 'leve';
    } else {
      nivelMora = 'preventivo';
    }

    const contacto: Partial<ContactoInfo> = contactosMap[c.ruc] || {};
    const correo = contacto.correo || sugerirEmail(c.razon_social, c.ruc);

    const hist = historialPorRuc[c.ruc];

    return {
      ruc: c.ruc,
      razon_social: c.razon_social,
      correo,
      correo_secundario: contacto.correo_secundario,
      contacto_nombre: contacto.contacto_nombre,
      telefono: contacto.telefono,
      facturas: c.facturas.sort((a, b) => (a.fecha_ven || '').localeCompare(b.fecha_ven || '')),
      totalPEN: c.totalPEN,
      totalUSD: c.totalUSD,
      diasMaxAtraso: c.diasMaxAtraso > -9999 ? c.diasMaxAtraso : 0,
      nivelMora,
      ultimoRecordatorio: hist?.ultimo,
      totalRecordatoriosEnviados: hist?.count || 0
    };
  }).sort((a, b) => {
    // Ordenar primero las de mayor mora y mayor deuda
    const pesoNivel = { critico: 4, medio: 3, leve: 2, preventivo: 1 };
    if (pesoNivel[b.nivelMora] !== pesoNivel[a.nivelMora]) {
      return pesoNivel[b.nivelMora] - pesoNivel[a.nivelMora];
    }
    return (b.totalPEN + b.totalUSD * 3.75) - (a.totalPEN + a.totalUSD * 3.75);
  });
}

export function generarEmailRecordatorio(
  cliente: ClienteCobranza,
  opciones?: {
    tono?: 'estandar' | 'preventivo' | 'urgente';
    notasPersonalizadas?: string;
  }
): { asunto: string; cuerpoHtml: string; cuerpoTexto: string } {
  const tono = opciones?.tono || (cliente.nivelMora === 'critico' ? 'urgente' : cliente.nivelMora === 'preventivo' ? 'preventivo' : 'estandar');
  const nombreDestino = cliente.contacto_nombre ? cliente.contacto_nombre : cliente.razon_social;

  let asunto = '';
  let intro = '';
  let badgeTexto = '';
  let badgeColor = '#b90000';

  if (tono === 'preventivo') {
    asunto = `CAPECO - Recordatorio preventivo de vencimiento: Facturas pendientes (${cliente.razon_social})`;
    badgeTexto = 'RECORDATORIO PREVENTIVO';
    badgeColor = '#0284c7';
    intro = `Esperamos que se encuentre bien. Nos comunicamos de parte de la <strong>Cámara Peruana de la Construcción (CAPECO)</strong> para recordarle amablemente las facturas próximas a vencer o con saldo pendiente a la fecha.`;
  } else if (tono === 'urgente') {
    asunto = `[URGENTE] CAPECO - Requerimiento de regularización por facturas vencidas: ${cliente.razon_social} (RUC: ${cliente.ruc})`;
    badgeTexto = 'AVISO FORMAL DE MORA - REGULARIZACIÓN URGENTE';
    badgeColor = '#b90000';
    intro = `Por medio de la presente, la <strong>Cámara Peruana de la Construcción (CAPECO)</strong> solicita la pronta regularización de las facturas que presentan a la fecha un atraso significativo en sus fechas de vencimiento pactadas.`;
  } else {
    asunto = `CAPECO - Estado de cuenta y recordatorio de cobranza: ${cliente.razon_social}`;
    badgeTexto = 'ESTADO DE CUENTA - SALDOS PENDIENTES';
    badgeColor = '#d97706';
    intro = `Nos ponemos en contacto desde la Gerencia de Administración y Finanzas de la <strong>Cámara Peruana de la Construcción (CAPECO)</strong> para remitirle el detalle consolidado de sus documentos tributarios pendientes de pago a la fecha.`;
  }

  // Generar tabla de facturas en HTML
  const filasHtml = cliente.facturas.map(f => {
    const d = diasHasta(f.fecha_ven);
    let estadoDias = '';
    let colorDias = '#475569';
    if (d !== null && d < 0) {
      estadoDias = `${Math.abs(d)} días vencida`;
      colorDias = '#dc2626';
    } else if (d !== null && d <= 7) {
      estadoDias = `Vence en ${d} días`;
      colorDias = '#d97706';
    } else if (d !== null) {
      estadoDias = `Vigente (${d}d)`;
      colorDias = '#16a34a';
    } else {
      estadoDias = '—';
    }

    const montoFmt = f.moneda === 'USD' 
      ? `US$ ${f.saldo.toLocaleString('es-PE', { minimumFractionDigits: 2 })}` 
      : `S/ ${f.saldo.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;

    return `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 12px; font-weight: 600; font-family: monospace; color: #0f172a;">${f.factura}</td>
        <td style="padding: 10px 12px; color: #475569; font-size: 13px;">${f.fecha_doc || '—'}</td>
        <td style="padding: 10px 12px; color: #475569; font-size: 13px;">${f.fecha_ven || '—'}</td>
        <td style="padding: 10px 12px; font-weight: 600; font-size: 13px; color: ${colorDias};">${estadoDias}</td>
        <td style="padding: 10px 12px; text-align: right; font-weight: 700; font-family: monospace; color: #0f172a;">${montoFmt}</td>
      </tr>
    `;
  }).join('');

  // Filas en texto plano para clientes de correo sin HTML
  const filasTexto = cliente.facturas.map(f => {
    const d = diasHasta(f.fecha_ven);
    const mora = (d !== null && d < 0) ? `(${Math.abs(d)} días vencida)` : '';
    const moneda = f.moneda === 'USD' ? 'US$' : 'S/';
    return `  * ${f.factura} | F.Ven: ${f.fecha_ven || '—'} | Saldo: ${moneda} ${f.saldo.toFixed(2)} ${mora}`;
  }).join('\n');

  const hoy = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' });

  const totalSolesFmt = cliente.totalPEN > 0 ? `S/ ${cliente.totalPEN.toLocaleString('es-PE', { minimumFractionDigits: 2 })}` : null;
  const totalDolaresFmt = cliente.totalUSD > 0 ? `US$ ${cliente.totalUSD.toLocaleString('es-PE', { minimumFractionDigits: 2 })}` : null;
  const totalDeudaTexto = [totalSolesFmt, totalDolaresFmt].filter(Boolean).join(' y ');

  const notasHtml = opciones?.notasPersonalizadas 
    ? `<div style="background-color: #f8fafc; border-left: 4px solid #7A1B29; padding: 12px 16px; margin: 18px 0; font-size: 13px; color: #334155;"><strong>Nota adicional de cobranzas:</strong><br/>${opciones.notasPersonalizadas}</div>` 
    : '';

  const cuerpoHtml = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${asunto}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f1f5f9; color: #1e293b; line-height: 1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f1f5f9; padding: 25px 10px;">
    <tr>
      <td align="center">
        <!-- Container -->
        <table role="presentation" width="100%" style="max-width: 650px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;" cellspacing="0" cellpadding="0" border="0">
          
          <!-- Header Institucional CAPECO -->
          <tr>
            <td style="background-color: #7A1B29; padding: 24px 30px; text-align: left;">
              <table width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <div style="color: #ffffff; font-size: 20px; font-weight: 800; letter-spacing: 0.5px;">CÁMARA PERUANA DE LA CONSTRUCCIÓN</div>
                    <div style="color: #fecdd3; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 4px;">Gerencia de Administración y Cobranzas</div>
                  </td>
                  <td align="right" style="vertical-align: middle;">
                    <span style="display: inline-block; background-color: rgba(255,255,255,0.15); color: #ffffff; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.5px;">${hoy}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Alerta de Categoría -->
          <tr>
            <td style="background-color: #f8fafc; border-bottom: 2px solid ${badgeColor}; padding: 12px 30px;">
              <span style="font-size: 11px; font-weight: 800; color: ${badgeColor}; letter-spacing: 1px;">
                ● ${badgeTexto}
              </span>
            </td>
          </tr>

          <!-- Contenido Principal -->
          <tr>
            <td style="padding: 28px 30px;">
              <p style="font-size: 15px; margin-top: 0;">Estimados señores de <strong>${cliente.razon_social}</strong>${cliente.contacto_nombre ? ` (Atención: ${cliente.contacto_nombre})` : ''}:</p>
              
              <p style="font-size: 14px; color: #334155;">${intro}</p>

              <!-- Resumen Deuda Box -->
              <div style="background-color: #fff1f2; border: 1px solid #ffe4e6; border-radius: 8px; padding: 14px 18px; margin: 20px 0;">
                <table width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td>
                      <div style="font-size: 12px; color: #9f1239; font-weight: 600; text-transform: uppercase;">Saldo Consolidado Pendiente:</div>
                      <div style="font-size: 22px; color: #881337; font-weight: 800; margin-top: 4px;">${totalDeudaTexto}</div>
                    </td>
                    <td align="right">
                      <div style="font-size: 12px; color: #9f1239;">Documentos por pagar:</div>
                      <div style="font-size: 18px; color: #881337; font-weight: 700;">${cliente.facturas.length} ${cliente.facturas.length === 1 ? 'Factura' : 'Facturas'}</div>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Detalle de Facturas -->
              <p style="font-size: 13px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                Detalle de comprobantes pendientes de pago:
              </p>
              
              <div style="border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; margin-bottom: 22px;">
                <table width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse; font-size: 13px;">
                  <thead>
                    <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0; text-align: left;">
                      <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Factura</th>
                      <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Emisión</th>
                      <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Vencimiento</th>
                      <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Estado</th>
                      <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; text-align: right;">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${filasHtml}
                  </tbody>
                </table>
              </div>

              ${notasHtml}

              <!-- Canales de Pago Oficiales -->
              <div style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; padding: 18px 20px; margin: 24px 0;">
                <div style="font-size: 13px; font-weight: 800; color: #1e293b; text-transform: uppercase; margin-bottom: 12px;">
                  🏛️ Cuentas Bancarias Oficiales para Pago:
                </div>
                
                <div style="font-size: 12px; color: #334155; margin-bottom: 8px;">
                  <strong>${CUENTAS_BANCARIAS_CAPECO.banco1.nombre}:</strong><br/>
                  • ${CUENTAS_BANCARIAS_CAPECO.banco1.monedaPEN} | ${CUENTAS_BANCARIAS_CAPECO.banco1.cciPEN}<br/>
                  • ${CUENTAS_BANCARIAS_CAPECO.banco1.monedaUSD} | ${CUENTAS_BANCARIAS_CAPECO.banco1.cciUSD}
                </div>

                <div style="font-size: 12px; color: #334155; margin-bottom: 8px;">
                  <strong>${CUENTAS_BANCARIAS_CAPECO.banco2.nombre}:</strong><br/>
                  • ${CUENTAS_BANCARIAS_CAPECO.banco2.monedaPEN} | ${CUENTAS_BANCARIAS_CAPECO.banco2.cciPEN}
                </div>

                <div style="font-size: 12px; color: #334155;">
                  <strong>${CUENTAS_BANCARIAS_CAPECO.detracciones.nombre}:</strong><br/>
                  • Cuenta: ${CUENTAS_BANCARIAS_CAPECO.detracciones.cuenta}
                </div>
              </div>

              <!-- Instrucciones de reporte -->
              <p style="font-size: 13px; color: #475569; background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 10px 14px; margin: 20px 0;">
                Una vez realizado el abono o transferencia, por favor remita su constancia o comprobante de pago al correo 
                <a href="mailto:${CUENTAS_BANCARIAS_CAPECO.contactoCobranzas.email}" style="color: #1d4ed8; font-weight: 700; text-decoration: underline;">
                  ${CUENTAS_BANCARIAS_CAPECO.contactoCobranzas.email}
                </a> o 
                <a href="mailto:${CUENTAS_BANCARIAS_CAPECO.contactoCobranzas.emailCobranzas}" style="color: #1d4ed8; font-weight: 700; text-decoration: underline;">
                  ${CUENTAS_BANCARIAS_CAPECO.contactoCobranzas.emailCobranzas}
                </a>, 
                indicando su número de <strong>RUC (${cliente.ruc || 'S/N'})</strong> y las facturas canceladas para su debida conciliación y descargo contable.
              </p>

              <p style="font-size: 12px; color: #64748b; margin-top: 20px;">
                <em>* Si usted ya realizó la cancelación de estos comprobantes en las últimas 24 a 48 horas, por favor haga caso omiso a este mensaje y remítanos su constancia para conciliarla a la brevedad.</em>
              </p>

              <p style="font-size: 13px; color: #334155; margin-top: 25px;">
                Atentamente,<br/>
                <strong>Área de Tesorería y Cobranzas</strong><br/>
                ${CUENTAS_BANCARIAS_CAPECO.contactoCobranzas.empresa}<br/>
                Teléfono: ${CUENTAS_BANCARIAS_CAPECO.contactoCobranzas.telefono}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f1f5f9; padding: 16px 30px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
              Mensaje automático generado por el Sistema de Cobranzas y Conciliación BAZVAC para CAPECO.<br/>
              © ${new Date().getFullYear()} Cámara Peruana de la Construcción. Todos los derechos reservados.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const cuerpoTexto = `
CÁMARA PERUANA DE LA CONSTRUCCIÓN - CAPECO
GERENCIA DE ADMINISTRACIÓN Y COBRANZAS
Fecha: ${hoy}

Estimados señores de ${cliente.razon_social}${cliente.contacto_nombre ? ` (Atención: ${cliente.contacto_nombre})` : ''}:

${intro.replace(/<[^>]+>/g, '')}

============================================================
RESUMEN DE SALDO PENDIENTE: ${totalDeudaTexto}
Total Comprobantes Pendientes: ${cliente.facturas.length}
============================================================

DETALLE DE FACTURAS:
${filasTexto}

${opciones?.notasPersonalizadas ? `\nNOTA ADICIONAL:\n${opciones.notasPersonalizadas}\n` : ''}

CUENTAS BANCARIAS PARA PAGO:
* BCP Soles: ${CUENTAS_BANCARIAS_CAPECO.banco1.monedaPEN} | ${CUENTAS_BANCARIAS_CAPECO.banco1.cciPEN}
* BCP Dólares: ${CUENTAS_BANCARIAS_CAPECO.banco1.monedaUSD} | ${CUENTAS_BANCARIAS_CAPECO.banco1.cciUSD}
* BBVA Soles: ${CUENTAS_BANCARIAS_CAPECO.banco2.monedaPEN} | ${CUENTAS_BANCARIAS_CAPECO.banco2.cciPEN}
* Banco de la Nación (Detracciones SUNAT): ${CUENTAS_BANCARIAS_CAPECO.detracciones.cuenta}

Una vez efectuado el abono, por favor enviar constancia a ${CUENTAS_BANCARIAS_CAPECO.contactoCobranzas.email} o ${CUENTAS_BANCARIAS_CAPECO.contactoCobranzas.emailCobranzas} indicando su RUC y número de factura.

Atentamente,
Área de Tesorería y Cobranzas
${CUENTAS_BANCARIAS_CAPECO.contactoCobranzas.empresa}
Teléfono: ${CUENTAS_BANCARIAS_CAPECO.contactoCobranzas.telefono}
  `.trim();

  return { asunto, cuerpoHtml, cuerpoTexto };
}
