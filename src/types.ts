export interface Factura {
  factura: string;
  razon_social: string;
  fecha_doc: string;
  fecha_ven: string;
  saldo: number;
  saldo_original?: number;
  mes: number;
  moneda: 'PEN' | 'USD';
  glosa: string;
  tipo_cambio: number;
  ruc: string;
  cuenta_contable: string;
  rubro?: string;
}

export interface AbonoLineaFactura {
  factura: string;
  razon: string;
}

export interface Abono {
  id: number;
  operacion: string;
  fecha: string;
  descripcion: string;
  glosa?: string;
  referencia2: string;
  ordenante?: string;
  moneda: 'PEN' | 'USD' | string;
  monto: number;
  estado: 'pendiente' | 'confirmado' | 'manual' | 'sugerida';
  facturas: AbonoLineaFactura[];
  motivo?: string;
  confianza?: 'alta' | 'media' | 'baja' | '';
  detraccionAceptada?: boolean;
  comisionAceptada?: boolean;
  montoComision?: number;
}

export interface Conciliacion {
  operacion: string;
  factura: string;
  razon: string;
  importe_factura: number;
  estado: string;
  motivo?: string;
  confianza?: string;
}

export interface Egreso {
  id: string;
  operacion: string;
  fecha: string;
  descripcion: string;
  referencia2: string;
  moneda: 'PEN' | 'USD' | string;
  monto: number;
  estado: 'pendiente' | 'confirmado';
  categoria_id?: string;
  categoria_nombre?: string;
}

export interface Categoria {
  id: string;
  grupo: string;
  subgrupo: string | null;
  palabras_clave: string | null;
  activo: boolean;
  orden: number;
}

// ----------------------------------------------------------------------
// Cobranzas y Recordatorios de Facturas Vencidas
// ----------------------------------------------------------------------

export type NivelMora = 'preventivo' | 'leve' | 'medio' | 'critico';

export interface ClienteCobranza {
  ruc: string;
  razon_social: string;
  correo: string;
  correo_secundario?: string;
  contacto_nombre?: string;
  telefono?: string;
  facturas: Factura[];
  totalPEN: number;
  totalUSD: number;
  diasMaxAtraso: number;
  nivelMora: NivelMora;
  ultimoRecordatorio?: string; // ISO date
  totalRecordatoriosEnviados: number;
}

export interface RecordatorioEnvio {
  id: string;
  ruc: string;
  razon_social: string;
  destinatario: string;
  correo_secundario?: string;
  asunto: string;
  cuerpoHtml: string;
  cuerpoTexto: string;
  facturas: string[]; // lista de nros de factura
  montoPEN: number;
  montoUSD: number;
  nivelMora: NivelMora;
  fechaEnvio: string; // ISO string
  estado: 'enviado' | 'pendiente' | 'error';
  metodo: 'automatico' | 'manual' | 'mailto';
}


export interface VentaCulqi {
  id_transaccion: string;
  fecha: string;
  hora?: string;
  nombres?: string;
  apellidos?: string;
  correo?: string;
  monto_venta: number;
  venta_final: number;
  comision_total: number;
  monto_abono: number;
  estado: 'aprobada' | 'abonada' | 'rechazada' | string;
  categoria_estado?: string;
  descripcion?: string;
  codigo_referencia?: string;
  codigo_autorizacion?: string;
  // Campos calculados al cargar (join con conciliaciones_culqi), no existen en la tabla ventas_culqi:
  factura?: string;
  razon?: string;
  lote_culqi?: string | null;
  estadoMatch: 'pendiente' | 'sugerida' | 'manual' | 'confirmado';
  motivo?: string;
  confianza?: string;
}

export interface LoteCulqi {
  correlativo: string;
  fecha_creacion: string;
  monto_total: number;
  cantidad_ventas: number;
  operacion_banco?: string | null;
  notas?: string;
}

export interface CandidatoLoteCulqi {
  fechaVenta: string;
  ventas: VentaCulqi[];
  montoTotal: number;
  abonoBanco?: Abono;
}
