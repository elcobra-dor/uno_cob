import React, { useState, useMemo } from 'react';
import { Factura, ClienteCobranza, NivelMora, RecordatorioEnvio } from '../types';
import { 
  agruparClientesCobranza, 
  generarEmailRecordatorio, 
  guardarContacto, 
  guardarRecordatorioEnHistorial, 
  cargarContactosGuardados, 
  cargarHistorialRecordatorios,
  CUENTAS_BANCARIAS_CAPECO
} from '../lib/cobranzasUtils';
import { fmtMonto, diasHasta } from '../lib/businessUtils';
import { 
  Send, 
  Mail, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  Search, 
  Filter, 
  Copy, 
  ExternalLink, 
  Edit3, 
  History, 
  Settings, 
  Sparkles, 
  X, 
  Eye, 
  Check, 
  RefreshCw,
  Users,
  Building2,
  Calendar,
  Layers,
  ChevronDown
} from 'lucide-react';

interface CobranzasProps {
  facturas: Factura[];
  showToast: (text: string, type: 'green' | 'amber' | '') => void;
  clienteSeleccionadoInicial?: string | null;
}

export default function Cobranzas({ facturas, showToast, clienteSeleccionadoInicial }: CobranzasProps) {
  // Contactos e Historial de localStorage
  const [contactosMap, setContactosMap] = useState(cargarContactosGuardados);
  const [historial, setHistorial] = useState<RecordatorioEnvio[]>(cargarHistorialRecordatorios);

  // Filtros
  const [filtroMora, setFiltroMora] = useState<string>('todos');
  const [busca, setBusca] = useState<string>(clienteSeleccionadoInicial || '');
  const [filtroEnvio, setFiltroEnvio] = useState<'todos' | 'sin_enviar' | 'enviados'>('todos');

  // Selección múltiple para envíos en lote
  const [seleccionados, setSeleccionados] = useState<Record<string, boolean>>({});

  // Modal de vista previa / edición individual
  const [clienteModal, setClienteModal] = useState<ClienteCobranza | null>(null);
  const [tonoSeleccionado, setTonoSeleccionado] = useState<'estandar' | 'preventivo' | 'urgente'>('estandar');
  const [correoDestino, setCorreoDestino] = useState<string>('');
  const [correoCC, setCorreoCC] = useState<string>('cobranzas@capeco.org');
  const [notasCustom, setNotasCustom] = useState<string>('');
  const [tabModal, setTabModal] = useState<'preview' | 'codigo' | 'texto'>('preview');
  const [isSendingSingle, setIsSendingSingle] = useState<boolean>(false);

  // Modal de edición de contacto
  const [editandoContactoRuc, setEditandoContactoRuc] = useState<string | null>(null);
  const [formContacto, setFormContacto] = useState({ correo: '', correo_secundario: '', contacto_nombre: '', telefono: '' });

  // Modal de Envío Masivo
  const [isBulkModalOpen, setIsBulkModalOpen] = useState<boolean>(false);
  const [isBulkSending, setIsBulkSending] = useState<boolean>(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; logs: string[] }>({ current: 0, total: 0, logs: [] });

  // Pestaña activa principal: 'clientes' o 'historial'
  const [vistaActiva, setVistaActiva] = useState<'clientes' | 'historial'>('clientes');

  // Agrupación de facturas en clientes de cobranza
  const clientes = useMemo(() => {
    return agruparClientesCobranza(facturas, contactosMap, historial);
  }, [facturas, contactosMap, historial]);

  // KPIs
  const stats = useMemo(() => {
    let totalPEN = 0;
    let totalUSD = 0;
    let criticos = 0;
    let medios = 0;
    let leves = 0;
    let preventivos = 0;

    clientes.forEach(c => {
      totalPEN += c.totalPEN;
      totalUSD += c.totalUSD;
      if (c.nivelMora === 'critico') criticos++;
      else if (c.nivelMora === 'medio') medios++;
      else if (c.nivelMora === 'leve') leves++;
      else preventivos++;
    });

    const enviosHoy = historial.filter(h => {
      const fecha = new Date(h.fechaEnvio);
      const hoy = new Date();
      return fecha.toDateString() === hoy.toDateString();
    }).length;

    return {
      totalClientes: clientes.length,
      totalPEN,
      totalUSD,
      criticos,
      medios,
      leves,
      preventivos,
      enviosHoy,
      totalHistorico: historial.length
    };
  }, [clientes, historial]);

  // Filtrado de clientes
  const clientesFiltrados = useMemo(() => {
    const q = busca.toLowerCase().trim();
    return clientes.filter(c => {
      if (filtroMora !== 'todos' && c.nivelMora !== filtroMora) return false;

      if (filtroEnvio === 'sin_enviar' && c.totalRecordatoriosEnviados > 0) return false;
      if (filtroEnvio === 'enviados' && c.totalRecordatoriosEnviados === 0) return false;

      if (q) {
        const matchName = c.razon_social.toLowerCase().includes(q);
        const matchRuc = c.ruc.toLowerCase().includes(q);
        const matchEmail = c.correo.toLowerCase().includes(q);
        const matchFactura = c.facturas.some(f => f.factura.toLowerCase().includes(q));
        if (!matchName && !matchRuc && !matchEmail && !matchFactura) return false;
      }

      return true;
    });
  }, [clientes, filtroMora, filtroEnvio, busca]);

  // Abrir modal individual
  const handleAbrirModal = (c: ClienteCobranza) => {
    setClienteModal(c);
    setCorreoDestino(c.correo);
    setCorreoCC(c.correo_secundario || 'cobranzas@capeco.org');
    setTonoSeleccionado(c.nivelMora === 'critico' ? 'urgente' : c.nivelMora === 'preventivo' ? 'preventivo' : 'estandar');
    setNotasCustom('');
    setTabModal('preview');
  };

  // Generación en caliente del email del cliente actual
  const emailActual = useMemo(() => {
    if (!clienteModal) return null;
    return generarEmailRecordatorio(
      { ...clienteModal, correo: correoDestino, correo_secundario: correoCC },
      { tono: tonoSeleccionado, notasPersonalizadas: notasCustom }
    );
  }, [clienteModal, correoDestino, correoCC, tonoSeleccionado, notasCustom]);

  // Enviar correo individual
  const handleEnviarIndividual = async () => {
    if (!clienteModal || !emailActual) return;
    setIsSendingSingle(true);

    // Simulación de despacho con delay para realismo
    await new Promise(r => setTimeout(r, 900));

    const nuevoRecordatorio: RecordatorioEnvio = {
      id: `REC-${Date.now()}`,
      ruc: clienteModal.ruc,
      razon_social: clienteModal.razon_social,
      destinatario: correoDestino,
      correo_secundario: correoCC,
      asunto: emailActual.asunto,
      cuerpoHtml: emailActual.cuerpoHtml,
      cuerpoTexto: emailActual.cuerpoTexto,
      facturas: clienteModal.facturas.map(f => f.factura),
      montoPEN: clienteModal.totalPEN,
      montoUSD: clienteModal.totalUSD,
      nivelMora: clienteModal.nivelMora,
      fechaEnvio: new Date().toISOString(),
      estado: 'enviado',
      metodo: 'manual'
    };

    guardarRecordatorioEnHistorial(nuevoRecordatorio);
    setHistorial(cargarHistorialRecordatorios());

    // Guardar correo si fue modificado
    if (correoDestino !== clienteModal.correo || correoCC !== clienteModal.correo_secundario) {
      guardarContacto(clienteModal.ruc, { correo: correoDestino, correo_secundario: correoCC });
      setContactosMap(cargarContactosGuardados());
    }

    setIsSendingSingle(false);
    setClienteModal(null);
    showToast(`✅ Recordatorio enviado exitosamente a ${correoDestino}`, 'green');
  };

  // Copiar plantilla de correo
  const handleCopiarTexto = () => {
    if (!emailActual) return;
    navigator.clipboard.writeText(emailActual.cuerpoTexto);
    showToast('Copiado al portapapeles en texto plano', 'green');
  };

  // Abrir en cliente de correo local (mailto:)
  const handleAbrirMailto = () => {
    if (!clienteModal || !emailActual) return;
    const to = encodeURIComponent(correoDestino);
    const cc = correoCC ? `&cc=${encodeURIComponent(correoCC)}` : '';
    const subject = encodeURIComponent(emailActual.asunto);
    const body = encodeURIComponent(emailActual.cuerpoTexto);
    window.location.href = `mailto:${to}?subject=${subject}${cc}&body=${body}`;

    const nuevoRecordatorio: RecordatorioEnvio = {
      id: `REC-${Date.now()}`,
      ruc: clienteModal.ruc,
      razon_social: clienteModal.razon_social,
      destinatario: correoDestino,
      correo_secundario: correoCC,
      asunto: emailActual.asunto,
      cuerpoHtml: emailActual.cuerpoHtml,
      cuerpoTexto: emailActual.cuerpoTexto,
      facturas: clienteModal.facturas.map(f => f.factura),
      montoPEN: clienteModal.totalPEN,
      montoUSD: clienteModal.totalUSD,
      nivelMora: clienteModal.nivelMora,
      fechaEnvio: new Date().toISOString(),
      estado: 'enviado',
      metodo: 'mailto'
    };
    guardarRecordatorioEnHistorial(nuevoRecordatorio);
    setHistorial(cargarHistorialRecordatorios());
  };

  // Selección masiva
  const handleToggleSelectAll = () => {
    const todosSeleccionados = clientesFiltrados.every(c => seleccionados[c.ruc]);
    const nuevo: Record<string, boolean> = {};
    if (!todosSeleccionados) {
      clientesFiltrados.forEach(c => {
        nuevo[c.ruc] = true;
      });
    }
    setSeleccionados(nuevo);
  };

  const totalSeleccionados = useMemo(() => {
    return Object.values(seleccionados).filter(Boolean).length;
  }, [seleccionados]);

  // Ejecutar Envío Masivo
  const handleEjecutarEnvioMasivo = async () => {
    const clientesAEnviar = clientesFiltrados.filter(c => seleccionados[c.ruc] || totalSeleccionados === 0);
    if (!clientesAEnviar.length) {
      alert('No hay clientes seleccionados para enviar recordatorios.');
      return;
    }

    setIsBulkSending(true);
    setBulkProgress({ current: 0, total: clientesAEnviar.length, logs: [] });

    for (let i = 0; i < clientesAEnviar.length; i++) {
      const c = clientesAEnviar[i];
      const mail = generarEmailRecordatorio(c);

      // Simular delay suave por correo
      await new Promise(r => setTimeout(r, 450));

      const recordatorio: RecordatorioEnvio = {
        id: `REC-BULK-${Date.now()}-${i}`,
        ruc: c.ruc,
        razon_social: c.razon_social,
        destinatario: c.correo,
        correo_secundario: c.correo_secundario || 'cobranzas@capeco.org',
        asunto: mail.asunto,
        cuerpoHtml: mail.cuerpoHtml,
        cuerpoTexto: mail.cuerpoTexto,
        facturas: c.facturas.map(f => f.factura),
        montoPEN: c.totalPEN,
        montoUSD: c.totalUSD,
        nivelMora: c.nivelMora,
        fechaEnvio: new Date().toISOString(),
        estado: 'enviado',
        metodo: 'automatico'
      };

      guardarRecordatorioEnHistorial(recordatorio);

      setBulkProgress(prev => ({
        current: i + 1,
        total: clientesAEnviar.length,
        logs: [
          `✓ Enviado a ${c.razon_social.slice(0, 24)}... (${c.correo}) - ${c.facturas.length} docs`,
          ...prev.logs
        ]
      }));
    }

    setHistorial(cargarHistorialRecordatorios());
    setIsBulkSending(false);
    showToast(`✅ Se enviaron ${clientesAEnviar.length} recordatorios de cobranza exitosamente`, 'green');
    setTimeout(() => {
      setIsBulkModalOpen(false);
      setSeleccionados({});
    }, 1200);
  };

  // Guardar contacto modificado desde la tabla
  const handleGuardarContactoModal = (ruc: string) => {
    guardarContacto(ruc, formContacto);
    setContactosMap(cargarContactosGuardados());
    setEditandoContactoRuc(null);
    showToast('Contacto actualizado correctamente', 'green');
  };

  const badgeMora = (nivel: NivelMora) => {
    switch (nivel) {
      case 'critico':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-red-100 text-red-700 border border-red-200">🔴 +30d Crítico</span>;
      case 'medio':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">🟠 15-30d Vencida</span>;
      case 'leve':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-yellow-100 text-yellow-800 border border-yellow-200">🟡 1-14d Vencida</span>;
      case 'preventivo':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-sky-100 text-sky-800 border border-sky-200">🔵 Próximo a vencer</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Institucional BAZVAC / CAPECO Cobranzas */}
      <div className="bg-gradient-to-r from-[#7A1B29] to-[#922233] rounded-2xl text-white p-6 shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-white/10 rounded-xl backdrop-blur-sm">
              <Send className="w-6 h-6 text-rose-200" />
            </span>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight font-['Montserrat']">
                Centro de Cobranzas y Recordatorios Automáticos
              </h1>
              <p className="text-rose-100 text-xs sm:text-sm font-['Lato']">
                Cámara Peruana de la Construcción • Automatización de notificaciones de cobranza por email para facturas vencidas y por vencer
              </p>
            </div>
          </div>
        </div>

        {/* Acciones principales de cabecera */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setVistaActiva(vistaActiva === 'clientes' ? 'historial' : 'clientes')}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all flex items-center gap-2 cursor-pointer"
          >
            <History className="w-4 h-4" />
            {vistaActiva === 'clientes' ? `Ver Historial de Envíos (${historial.length})` : 'Volver a Clientes'}
          </button>

          <button
            onClick={() => setIsBulkModalOpen(true)}
            disabled={clientesFiltrados.length === 0}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-white text-[#7A1B29] hover:bg-rose-50 shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-[#7A1B29]" />
            Envío Masivo Automático
            {totalSeleccionados > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-[#7A1B29] text-white text-[10px]">
                {totalSeleccionados}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Cartera */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cartera Pendiente</span>
            <div className="p-2 rounded-xl bg-rose-50 text-[#7A1B29]">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 font-mono text-xl font-extrabold text-slate-900">
            S/ {stats.totalPEN.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
          </div>
          {stats.totalUSD > 0 && (
            <div className="text-xs font-mono text-slate-500 mt-0.5">
              + US$ {stats.totalUSD.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
            </div>
          )}
          <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            <span>{stats.totalClientes} asociados / empresas con saldo</span>
          </div>
        </div>

        {/* Facturas Críticas */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm border-t-4 border-t-red-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mora Crítica (+30d)</span>
            <div className="p-2 rounded-xl bg-red-50 text-red-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 font-mono text-2xl font-extrabold text-red-600">
            {stats.criticos} <span className="text-sm font-normal text-slate-400 font-sans">clientes</span>
          </div>
          <div className="text-[11px] text-red-700/80 mt-2 font-medium">
            Prioridad máxima para requerimiento formal
          </div>
        </div>

        {/* Facturas Medias y Leves */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm border-t-4 border-t-amber-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mora Regular (1-30d)</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 font-mono text-2xl font-extrabold text-amber-600">
            {stats.medios + stats.leves} <span className="text-sm font-normal text-slate-400 font-sans">clientes</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            {stats.medios} medio (15-30d) • {stats.leves} leve (1-14d)
          </div>
        </div>

        {/* Despacho & Notificaciones */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm border-t-4 border-t-emerald-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Recordatorios Enviados</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 font-mono text-2xl font-extrabold text-emerald-700">
            {stats.enviosHoy} <span className="text-sm font-normal text-slate-400 font-sans">hoy</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-2">
            {stats.totalHistorico} recordatorios registrados en total
          </div>
        </div>
      </div>

      {/* VISTA: CLIENTES DE COBRANZA */}
      {vistaActiva === 'clientes' && (
        <div className="space-y-4">
          {/* Barra de Filtros y Búsqueda */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Búsqueda */}
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar empresa, RUC, factura o email..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 w-full focus:outline-none focus:border-rose-400 focus:bg-white transition-all"
                />
              </div>

              {/* Filtro por nivel de mora */}
              <select
                value={filtroMora}
                onChange={(e) => setFiltroMora(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none focus:border-rose-400 cursor-pointer"
              >
                <option value="todos">Todos los niveles de mora</option>
                <option value="critico">🔴 Crítico (+30 días)</option>
                <option value="medio">🟠 Medio (15 - 30 días)</option>
                <option value="leve">🟡 Leve (1 - 14 días)</option>
                <option value="preventivo">🔵 Preventivo (por vencer)</option>
              </select>

              {/* Filtro por estado de envío */}
              <select
                value={filtroEnvio}
                onChange={(e) => setFiltroEnvio(e.target.value as any)}
                className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none focus:border-rose-400 cursor-pointer"
              >
                <option value="todos">Todos los estados de envío</option>
                <option value="sin_enviar">Pendientes de notificación</option>
                <option value="enviados">Ya notificados previamente</option>
              </select>
            </div>

            {/* Contador y Selector masivo */}
            <div className="flex items-center gap-3 self-end md:self-auto">
              <span className="text-xs text-slate-500">
                Mostrando <strong className="text-slate-800">{clientesFiltrados.length}</strong> de {clientes.length} empresas
              </span>
              <button
                onClick={handleToggleSelectAll}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
              >
                {clientesFiltrados.every(c => seleccionados[c.ruc]) ? 'Deseleccionar todo' : 'Seleccionar todo'}
              </button>
            </div>
          </div>

          {/* Tabla de Clientes para Cobranza */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                    <th className="px-4 py-3.5 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={clientesFiltrados.length > 0 && clientesFiltrados.every(c => seleccionados[c.ruc])}
                        onChange={handleToggleSelectAll}
                        className="rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                      />
                    </th>
                    <th className="px-4 py-3.5">Empresa / Asociado</th>
                    <th className="px-4 py-3.5">Contacto & Email</th>
                    <th className="px-4 py-3.5">Mora / Estado</th>
                    <th className="px-4 py-3.5">Documentos Pendientes</th>
                    <th className="px-4 py-3.5 text-right">Saldo Deuda</th>
                    <th className="px-4 py-3.5">Último Aviso</th>
                    <th className="px-4 py-3.5 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {clientesFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center">
                          <Mail className="w-10 h-10 text-slate-200 mb-2" />
                          <div className="text-sm font-semibold text-slate-700">No se encontraron clientes con los filtros aplicados</div>
                          <p className="text-xs text-slate-400 mt-1">Prueba quitando filtros o términos de búsqueda.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    clientesFiltrados.map((c) => {
                      const isChecked = !!seleccionados[c.ruc];
                      const isEditando = editandoContactoRuc === c.ruc;

                      return (
                        <tr 
                          key={c.ruc || c.razon_social} 
                          className={`hover:bg-slate-50/60 transition-colors ${isChecked ? 'bg-rose-50/30' : ''}`}
                        >
                          {/* Checkbox */}
                          <td className="px-4 py-4 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => setSeleccionados(prev => ({ ...prev, [c.ruc]: !prev[c.ruc] }))}
                              className="rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                            />
                          </td>

                          {/* Empresa */}
                          <td className="px-4 py-4">
                            <div className="font-semibold text-slate-900 leading-tight">
                              {c.razon_social}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                              RUC: {c.ruc || 'S/N'}
                            </div>
                          </td>

                          {/* Contacto & Email editable */}
                          <td className="px-4 py-4">
                            {isEditando ? (
                              <div className="space-y-1.5 min-w-[220px]">
                                <input
                                  type="email"
                                  value={formContacto.correo}
                                  onChange={(e) => setFormContacto({ ...formContacto, correo: e.target.value })}
                                  placeholder="correo@empresa.com"
                                  className="w-full text-xs px-2 py-1 border border-slate-300 rounded focus:border-rose-500 outline-none"
                                />
                                <input
                                  type="text"
                                  value={formContacto.contacto_nombre}
                                  onChange={(e) => setFormContacto({ ...formContacto, contacto_nombre: e.target.value })}
                                  placeholder="Nombre de contacto (opcional)"
                                  className="w-full text-xs px-2 py-1 border border-slate-300 rounded focus:border-rose-500 outline-none"
                                />
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => handleGuardarContactoModal(c.ruc)}
                                    className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-bold hover:bg-emerald-700 cursor-pointer"
                                  >
                                    Guardar
                                  </button>
                                  <button
                                    onClick={() => setEditandoContactoRuc(null)}
                                    className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-[10px] hover:bg-slate-300 cursor-pointer"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="group relative flex items-center gap-1.5">
                                <div className="space-y-0.5">
                                  <div className="text-slate-800 font-medium flex items-center gap-1">
                                    <Mail className="w-3 h-3 text-slate-400" />
                                    <span>{c.correo}</span>
                                  </div>
                                  {c.contacto_nombre && (
                                    <div className="text-[10px] text-slate-400">
                                      Attn: {c.contacto_nombre}
                                    </div>
                                  )}
                                </div>
                                <button
                                  onClick={() => {
                                    setEditandoContactoRuc(c.ruc);
                                    setFormContacto({
                                      correo: c.correo,
                                      correo_secundario: c.correo_secundario || '',
                                      contacto_nombre: c.contacto_nombre || '',
                                      telefono: c.telefono || ''
                                    });
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-700 transition-opacity cursor-pointer"
                                  title="Editar correo y contacto"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </td>

                          {/* Mora / Estado */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="space-y-1">
                              {badgeMora(c.nivelMora)}
                              <div className="text-[10px] text-slate-500 font-mono">
                                {c.diasMaxAtraso > 0 ? `Máx. ${c.diasMaxAtraso} días atraso` : 'Dentro de plazo'}
                              </div>
                            </div>
                          </td>

                          {/* Facturas */}
                          <td className="px-4 py-4">
                            <div className="text-slate-700 font-medium">
                              {c.facturas.length} {c.facturas.length === 1 ? 'factura' : 'facturas'}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5 max-w-[200px] truncate" title={c.facturas.map(f => f.factura).join(', ')}>
                              {c.facturas.map(f => f.factura).slice(0, 3).join(', ')}
                              {c.facturas.length > 3 && ` +${c.facturas.length - 3}`}
                            </div>
                          </td>

                          {/* Saldo Deuda */}
                          <td className="px-4 py-4 text-right whitespace-nowrap font-mono">
                            {c.totalPEN > 0 && (
                              <div className="text-sm font-bold text-slate-900">
                                S/ {c.totalPEN.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                              </div>
                            )}
                            {c.totalUSD > 0 && (
                              <div className="text-xs font-semibold text-slate-600">
                                US$ {c.totalUSD.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                              </div>
                            )}
                          </td>

                          {/* Último Aviso */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            {c.ultimoRecordatorio ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                                  <Check className="w-3 h-3" /> Enviado
                                </span>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {new Date(c.ultimoRecordatorio).toLocaleDateString('es-PE')}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">
                                Sin notificar
                              </span>
                            )}
                          </td>

                          {/* Acciones */}
                          <td className="px-4 py-4 text-center whitespace-nowrap">
                            <button
                              onClick={() => handleAbrirModal(c)}
                              className="px-3 py-1.5 rounded-xl bg-[#7A1B29] text-white hover:bg-[#8e2131] text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 mx-auto cursor-pointer"
                              title="Ver plantilla, previsualizar correo y enviar recordatorio"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>Notificar</span>
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
      )}

      {/* VISTA: HISTORIAL DE ENVÍOS */}
      {vistaActiva === 'historial' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 font-['Montserrat'] flex items-center gap-2">
                <History className="w-5 h-5 text-[#7A1B29]" />
                Historial de Recordatorios de Cobranza Enviados
              </h2>
              <p className="text-xs text-slate-500">
                Auditoría completa de mensajes despachados, fecha, destinatario y facturas notificadas
              </p>
            </div>
            <button
              onClick={() => setVistaActiva('clientes')}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer"
            >
              Volver a Clientes
            </button>
          </div>

          {historial.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Mail className="w-10 h-10 mx-auto text-slate-200 mb-2" />
              <div className="font-semibold text-slate-700">No hay recordatorios enviados aún</div>
              <p className="text-xs text-slate-400 mt-1">Los envíos individuales y masivos quedarán registrados aquí automáticamente.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                    <th className="px-4 py-3">Fecha y Hora</th>
                    <th className="px-4 py-3">Cliente / Asociado</th>
                    <th className="px-4 py-3">Destinatario</th>
                    <th className="px-4 py-3">Nivel Mora</th>
                    <th className="px-4 py-3">Docs Notificados</th>
                    <th className="px-4 py-3 text-right">Monto Deuda</th>
                    <th className="px-4 py-3 text-center">Método</th>
                    <th className="px-4 py-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historial.map(h => (
                    <tr key={h.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-600">
                        {new Date(h.fechaEnvio).toLocaleString('es-PE')}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {h.razon_social}
                        <div className="text-[10px] text-slate-400 font-mono">RUC: {h.ruc}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700">
                        {h.destinatario}
                        {h.correo_secundario && <div className="text-[10px] text-slate-400">CC: {h.correo_secundario}</div>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {badgeMora(h.nivelMora)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px]">
                          {h.facturas.length} docs
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">
                        {h.montoPEN > 0 && `S/ ${h.montoPEN.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`}
                        {h.montoUSD > 0 && ` US$ ${h.montoUSD.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          {h.metodo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                          <Check className="w-3 h-3" /> Enviado
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL: VISTA PREVIA Y ENVÍO INDIVIDUAL DE CORREO */}
      {clienteModal && emailActual && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            
            {/* Header del Modal */}
            <div className="bg-[#7A1B29] text-white p-5 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-rose-200">
                  Emisor Oficial • Cámara Peruana de la Construcción
                </div>
                <h3 className="text-lg font-bold font-['Montserrat'] mt-0.5">
                  Recordatorio de Cobranza: {clienteModal.razon_social}
                </h3>
              </div>
              <button
                onClick={() => setClienteModal(null)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Configuración Rápida de Envío */}
            <div className="p-5 border-b border-slate-100 bg-slate-50 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              {/* Para / To */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Destinatario Principal (Para:)
                </label>
                <input
                  type="email"
                  value={correoDestino}
                  onChange={(e) => setCorreoDestino(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-rose-400"
                />
              </div>

              {/* Con copia / CC */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Con Copia (CC:):
                </label>
                <input
                  type="text"
                  value={correoCC}
                  onChange={(e) => setCorreoCC(e.target.value)}
                  placeholder="cobranzas@capeco.org"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-rose-400"
                />
              </div>

              {/* Tono del mensaje */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Tono del Comunicado:
                </label>
                <select
                  value={tonoSeleccionado}
                  onChange={(e) => setTonoSeleccionado(e.target.value as any)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-semibold focus:outline-none focus:border-rose-400 cursor-pointer"
                >
                  <option value="preventivo">🔵 Preventivo (Vencimiento próximo / Amistoso)</option>
                  <option value="estandar">🟠 Estándar (Recordatorio de saldo vencido)</option>
                  <option value="urgente">🔴 Urgente (Requerimiento de regularización en mora)</option>
                </select>
              </div>

              {/* Nota Adicional Opcional */}
              <div className="md:col-span-3">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Instrucción o Nota Especial (opcional, se incluirá destacada en el correo):
                </label>
                <input
                  type="text"
                  placeholder="Ej: Recuerde adjuntar el comprobante de pago de la detracción del Banco de la Nación para proceder con el descargo..."
                  value={notasCustom}
                  onChange={(e) => setNotasCustom(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-rose-400"
                />
              </div>
            </div>

            {/* Pestañas de Previsualización */}
            <div className="px-5 pt-3 border-b border-slate-200 bg-white flex items-center justify-between">
              <div className="flex gap-2">
                <button
                  onClick={() => setTabModal('preview')}
                  className={`px-3 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                    tabModal === 'preview' 
                      ? 'border-[#7A1B29] text-[#7A1B29]' 
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5 inline mr-1.5" />
                  Vista Previa Email
                </button>
                <button
                  onClick={() => setTabModal('texto')}
                  className={`px-3 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                    tabModal === 'texto' 
                      ? 'border-[#7A1B29] text-[#7A1B29]' 
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Texto Plano
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopiarTexto}
                  className="px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                  title="Copiar texto del correo al portapapeles"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copiar Texto
                </button>
                <button
                  onClick={handleAbrirMailto}
                  className="px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                  title="Abrir directamente en tu cliente de correo (Outlook, Gmail, etc.)"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Abrir en Outlook/Gmail
                </button>
              </div>
            </div>

            {/* Asunto visible */}
            <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 text-xs text-slate-700 font-mono">
              <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px] font-sans mr-2">Asunto:</span>
              {emailActual.asunto}
            </div>

            {/* Cuerpo del Mensaje en el Modal */}
            <div className="flex-1 overflow-y-auto p-5 bg-slate-100/70">
              {tabModal === 'preview' ? (
                <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden max-w-[700px] mx-auto">
                  <div 
                    dangerouslySetInnerHTML={{ __html: emailActual.cuerpoHtml }} 
                    className="email-render-preview"
                  />
                </div>
              ) : (
                <pre className="p-4 bg-slate-900 text-slate-100 rounded-xl font-mono text-xs whitespace-pre-wrap leading-relaxed overflow-x-auto">
                  {emailActual.cuerpoTexto}
                </pre>
              )}
            </div>

            {/* Footer de Acciones del Modal */}
            <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between">
              <div className="text-xs text-slate-400">
                Se notificará un total de <strong className="text-slate-800">{clienteModal.facturas.length} comprobantes</strong>.
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setClienteModal(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  Cerrar
                </button>

                <button
                  onClick={handleEnviarIndividual}
                  disabled={isSendingSingle}
                  className="px-6 py-2 rounded-xl text-xs font-bold bg-[#7A1B29] hover:bg-[#8e2131] text-white shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSendingSingle ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Enviando email...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Enviar Recordatorio por Email
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: ENVÍO MASIVO AUTOMÁTICO */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-[#7A1B29] text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 text-rose-200" />
                <h3 className="text-base font-bold font-['Montserrat']">
                  Ejecutar Envío Masivo de Recordatorios
                </h3>
              </div>
              {!isBulkSending && (
                <button
                  onClick={() => setIsBulkModalOpen(false)}
                  className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Esta acción generará y enviará los recordatorios automáticos de cobranza a todas las empresas seleccionadas, calculando automáticamente su nivel de mora, agrupando sus facturas vencidas y adjuntando las cuentas bancarias oficiales de CAPECO.
              </p>

              <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 text-xs space-y-2">
                <div className="flex justify-between text-slate-700">
                  <span>Empresas destinatarias:</span>
                  <strong className="text-rose-900 font-bold font-mono">
                    {totalSeleccionados > 0 ? totalSeleccionados : clientesFiltrados.length} empresas
                  </strong>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>Cuentas por cobrar involucradas:</span>
                  <strong className="text-rose-900 font-bold font-mono">
                    S/ {clientesFiltrados.reduce((acc, c) => acc + (seleccionados[c.ruc] || totalSeleccionados === 0 ? c.totalPEN : 0), 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                  </strong>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>Remitente oficial:</span>
                  <span className="font-mono text-slate-600">tesoreria@capeco.org</span>
                </div>
              </div>

              {isBulkSending && (
                <div className="space-y-3 pt-2">
                  <div className="flex justify-between text-xs font-semibold text-slate-700">
                    <span>Enviando correos...</span>
                    <span>{bulkProgress.current} de {bulkProgress.total}</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-[#7A1B29] h-full transition-all duration-300"
                      style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                    />
                  </div>
                  <div className="max-h-36 overflow-y-auto bg-slate-900 rounded-xl p-3 font-mono text-[11px] text-emerald-400 space-y-1">
                    {bulkProgress.logs.map((log, i) => (
                      <div key={i}>{log}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setIsBulkModalOpen(false)}
                disabled={isBulkSending}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-all cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleEjecutarEnvioMasivo}
                disabled={isBulkSending || clientesFiltrados.length === 0}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#7A1B29] hover:bg-[#8e2131] text-white shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isBulkSending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Procesando envíos...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Confirmar e Iniciar Envíos Masivos
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
