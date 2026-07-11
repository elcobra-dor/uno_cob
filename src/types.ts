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
