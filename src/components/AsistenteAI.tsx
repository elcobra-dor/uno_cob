import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Abono, Factura } from '../types';
import { 
  fmtMonto, 
  fmtFecha 
} from '../lib/businessUtils';
import { 
  Sparkles, 
  Key, 
  HelpCircle, 
  RefreshCw, 
  Check, 
  AlertTriangle, 
  Lightbulb, 
  ArrowRight,
  Info,
  CheckCircle,
  BrainCircuit,
  MessageSquare,
  Bot
} from 'lucide-react';

interface AsistenteAIProps {
  abonos: Abono[];
  facturas: Factura[];
  onCambiarLinea: (id: number, idx: number, val: string) => void;
  showToast: (text: string, type: 'green' | 'amber' | '') => void;
}

interface SugerenciaAI {
  operacion: string;
  factura: string;
  motivo: string;
  confianza: 'alta' | 'media';
  cliente: string;
  monto: number;
}

export default function AsistenteAI({
  abonos,
  facturas,
  onCambiarLinea,
  showToast
}: AsistenteAIProps) {
  const [apiKey, setApiKey] = useState<string>('');
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [sugerencias, setSugerencias] = useState<SugerenciaAI[]>([]);
  const [selectedSugs, setSelectedSugs] = useState<{ [key: string]: boolean }>({});
  
  // Chatbot states
  const [prompt, setPrompt] = useState<string>('');
  const [chatLog, setChatLog] = useState<{ sender: 'user' | 'ai'; text: string; time: string }[]>([
    { 
      sender: 'ai', 
      text: '¡Hola! Soy tu Asistente de Inteligencia Artificial Gemini. Puedo ayudarte a analizar los movimientos bancarios pendientes, descifrar glosas confusas y recomendar conciliaciones basadas en patrones semánticos complejos (como abreviaturas de empresas, variaciones ortográficas o detracciones). ¿En qué puedo ayudarte hoy?',
      time: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);

  // Load API Key from localStorage or environment on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('capeco_gemini_key') || '';
    if (savedKey) {
      setApiKey(savedKey);
      setIsSaved(true);
    } else {
      // Fallback to environment variable if configured
      const envKey = ((import.meta as any).env?.VITE_GEMINI_API_KEY as string) || '';
      if (envKey) {
        setApiKey(envKey);
        setIsSaved(true);
        localStorage.setItem('capeco_gemini_key', envKey);
      }
    }
  }, []);

  const handleSaveKey = () => {
    const cleanKey = apiKey.trim();
    if (!cleanKey) {
      alert('Por favor ingresa una clave API válida.');
      return;
    }
    localStorage.setItem('capeco_gemini_key', cleanKey);
    setIsSaved(true);
    showToast('🔑 API Key guardada de forma segura en tu navegador', 'green');
  };

  const handleClearKey = () => {
    if (confirm('¿Deseas remover la API Key actual?')) {
      localStorage.removeItem('capeco_gemini_key');
      setApiKey('');
      setIsSaved(false);
      setSugerencias([]);
      showToast('API Key removida', '');
    }
  };

  // Run Gemini model to detect matches
  const analizarConciliacionesConAI = async () => {
    if (!apiKey) {
      alert('Primero debes configurar y guardar tu API Key de Google AI Studio.');
      return;
    }

    const pendientes = abonos.filter(a => a.estado === 'pendiente');
    const facturasAbiertas = facturas.filter(f => f.saldo > 0.01);

    if (pendientes.length === 0) {
      alert('No hay abonos bancarios en estado "Pendiente" para analizar.');
      return;
    }
    if (facturasAbiertas.length === 0) {
      alert('No hay facturas con saldo abierto en el sistema.');
      return;
    }

    setIsScanning(true);
    try {
      const ai = new GoogleGenAI({ apiKey: apiKey });

      // Build simplified list for the model to minimize token size and keep costs free/low
      const abonosPrompt = pendientes.map(a => ({
        operacion: a.operacion,
        monto: a.monto,
        moneda: a.moneda,
        descripcion: a.descripcion,
        referencia: a.referencia2,
        ordenante: a.ordenante || ''
      }));

      const facturasPrompt = facturasAbiertas.map(f => ({
        factura: f.factura,
        ruc: f.ruc,
        cliente: f.razon_social,
        monto_abierto: f.saldo,
        moneda: f.moneda,
        glosa: f.glosa || ''
      }));

      const instructions = `
        Eres un analista financiero experto de la Cámara Peruana de la Construcción (CAPECO).
        Tu tarea es correlacionar depósitos bancarios pendientes con facturas de clientes abiertas.

        REGLAS DE NEGOCIO IMPORTANTES:
        1. Las empresas constructoras suelen usar abreviaturas en el banco. Por ejemplo:
           "CONSTRUCTORA INMOBILIARIA A&B S.A.C." puede aparecer como "CONST INM AB" o "A Y B INGENIERIA".
           Analiza semánticamente el nombre del "ordenante" o la "descripcion" con el "cliente" de la factura.
        2. En las facturas de la serie "F201" o "F301", si el importe supera 700 soles, se aplica una DETRACCIÓN del 10% o 12% que se deposita de forma independiente en la cuenta del Banco de la Nación. El abono bancario correspondiente dirá "DETRACCION BN" o similar. El monto del abono será aproximadamente el 10% o 12% del total de la factura.
        3. A veces los clientes pagan exactamente el saldo de una factura. Si encuentras importes que coinciden exactamente y los nombres son similares, la confianza es ALTA.
        4. Si el nombre coincide de manera muy clara pero el importe es ligeramente menor (por diferencias de tipo de cambio, comisiones bancarias de traslado interbancario de S/ 4.00 o S/ 7.00, o retenciones), sugiérelo con confianza MEDIA y explícalo en el motivo.

        DATOS DISPONIBLES:
        - ABONOS PENDIENTES EN EL BANCO: ${JSON.stringify(abonosPrompt)}
        - FACTURAS ABIERTAS: ${JSON.stringify(facturasPrompt)}

        RESPONDE ÚNICAMENTE CON UN ARREGLO JSON válido, con el siguiente formato, sin bloques de código markdown, sin explicaciones antes o después:
        [
          {
            "operacion": "NÚMERO_DE_OPERACIÓN_DEL_ABONO",
            "factura": "NÚMERO_DE_LA_FACTURA_RECOMENDADA",
            "motivo": "Explicación breve de por qué coinciden (abreviatura detectada, detracción del 10%, importe exacto, etc.)",
            "confianza": "alta" o "media"
          }
        ]
        Si no encuentras ningún cruce plausible, devuelve un arreglo vacío [].
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: instructions,
        config: {
          responseMimeType: "application/json"
        }
      });

      const responseText = response.text || '[]';
      const result = JSON.parse(responseText.trim());

      if (Array.isArray(result)) {
        // Hydrate suggestions with amounts and names
        const hydrated: SugerenciaAI[] = [];
        const initialSelected: { [key: string]: boolean } = {};

        result.forEach((item: any) => {
          const abonoObj = pendientes.find(a => a.operacion === item.operacion);
          const factObj = facturasAbiertas.find(f => f.factura === item.factura);

          if (abonoObj && factObj) {
            hydrated.push({
              operacion: item.operacion,
              factura: item.factura,
              motivo: item.motivo,
              confianza: item.confianza === 'alta' ? 'alta' : 'media',
              cliente: factObj.razon_social,
              monto: abonoObj.monto
            });
            initialSelected[item.operacion] = true; // Selected by default
          }
        });

        setSugerencias(hydrated);
        setSelectedSugs(initialSelected);

        if (hydrated.length > 0) {
          showToast(`Gemini detectó ${hydrated.length} posibles conciliaciones inteligentes`, 'green');
        } else {
          showToast('Gemini analizó los datos pero no encontró cruces lógicos adicionales.', '');
        }
      } else {
        throw new Error('Formato de respuesta inválido de la IA.');
      }
    } catch (err: any) {
      console.error(err);
      alert(`Error al invocar a Gemini: ${err.message || err}`);
    } finally {
      setIsScanning(false);
    }
  };

  // Toggle selection
  const handleToggleSug = (operacion: string) => {
    setSelectedSugs(prev => ({
      ...prev,
      [operacion]: !prev[operacion]
    }));
  };

  // Apply suggestions back to local state inputs
  const aplicarSugerenciasSeleccionadas = () => {
    const seleccionadas = sugerencias.filter(s => selectedSugs[s.operacion]);
    if (seleccionadas.length === 0) {
      alert('No has seleccionado ninguna sugerencia para aplicar.');
      return;
    }

    let aplicadas = 0;
    seleccionadas.forEach(sug => {
      // Find the corresponding abono id
      const abono = abonos.find(a => a.operacion === sug.operacion);
      if (abono) {
        // Change line value in App state
        onCambiarLinea(abono.id, 0, sug.factura);
        
        // Also inject dynamic suggestion motives
        abono.motivo = sug.motivo;
        abono.confianza = sug.confianza;
        abono.estado = 'sugerida';
        
        aplicadas++;
      }
    });

    showToast(`Se aplicaron ${aplicadas} sugerencias. Por favor revísalas en la pestaña "Conciliación" y confírmalas.`, 'green');
    // Clear list
    setSugerencias([]);
  };

  // Interactive Chat function
  const handleSendChatMessage = async () => {
    const query = prompt.trim();
    if (!query) return;
    if (!apiKey) {
      alert('Debes configurar tu API Key de Google AI Studio para chatear con Gemini.');
      return;
    }

    const newLog = [
      ...chatLog,
      {
        sender: 'user' as const,
        text: query,
        time: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
      }
    ];

    setChatLog(newLog);
    setPrompt('');
    setIsChatLoading(true);

    try {
      const pendingAbonos = abonos.filter(a => a.estado === 'pendiente');
      const openInvoices = facturas.filter(f => f.saldo > 0.01);
      const confirmedAbonos = abonos.filter(a => a.estado === 'confirmado');

      // Setup concise context for the chatbot
      const financialContext = {
        total_abonos_pendientes: pendingAbonos.length,
        monto_pendiente_soles: pendingAbonos.filter(a => a.moneda !== 'USD').reduce((sum, a) => sum + a.monto, 0),
        monto_pendiente_dolares: pendingAbonos.filter(a => a.moneda === 'USD').reduce((sum, a) => sum + a.monto, 0),
        total_facturas_abiertas: openInvoices.length,
        monto_facturas_abierto: openInvoices.reduce((sum, f) => sum + f.saldo, 0),
        conciliaciones_realizadas: confirmedAbonos.length,
        algunas_facturas_abiertas: openInvoices.slice(0, 8).map(f => ({ f: f.factura, c: f.razon_social, s: f.saldo, m: f.moneda })),
        algunos_abonos_pendientes: pendingAbonos.slice(0, 8).map(a => ({ op: a.operacion, m: a.monto, desc: a.descripcion, ord: a.ordenante }))
      };

      const systemPrompt = `
        Eres el asistente inteligente oficial de CAPECO (Cámara Peruana de la Construcción) para la conciliación bancaria.
        Respondes de forma clara, profesional, amable y en español de Perú.
        
        Aquí tienes el contexto en vivo de la base de datos de CAPECO:
        ${JSON.stringify(financialContext)}

        Responde a la consulta del usuario de manera detallada pero concisa. Puedes recomendar facturas para conciliar, resumir los montos pendientes, explicar conceptos tributarios (como detracciones SUNAT o retenciones en Perú), o dar sugerencias operativas.
        Consulta del usuario: "${query}"
      `;

      const ai = new GoogleGenAI({ apiKey: apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: systemPrompt
      });

      const aiResponseText = response.text || 'No obtuve respuesta del modelo.';

      setChatLog(prev => [
        ...prev,
        {
          sender: 'ai',
          text: aiResponseText,
          time: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err: any) {
      console.error(err);
      setChatLog(prev => [
        ...prev,
        {
          sender: 'ai',
          text: `⚠️ Ocurrió un error al procesar tu consulta con Gemini: ${err.message || err}`,
          time: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Visual Header */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
        {/* Decorative ambient background */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-indigo-500/20 to-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 left-1/3 w-60 h-60 bg-capeco-blue/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-400/20 text-xs font-semibold text-indigo-300">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Inteligencia Artificial de Google</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight font-sans">
              Asistente de Conciliación Inteligente
            </h2>
            <p className="text-sm text-slate-300 font-medium leading-relaxed">
              Prueba la potencia de los modelos de Gemini en Google AI Studio para automatizar cruces complejos de cuentas por cobrar sin costo alguno.
            </p>
          </div>
          <div className="flex-shrink-0">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 text-center flex flex-col items-center">
              <BrainCircuit className="w-10 h-10 text-indigo-400 mb-1.5 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 font-mono">Motor Activo</span>
              <span className="text-xs font-semibold text-white mt-0.5">Gemini 2.5 Flash</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Config key & AI Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: API Key Setup & Guide (lg:col-span-4) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* API Key Configuration Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Key className="w-5 h-5 text-indigo-500" />
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono">
                Configuración de API Key
              </h3>
            </div>

            {isSaved ? (
              <div className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-start gap-2.5">
                  <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-emerald-950">Gemini API Key Activa</div>
                    <p className="text-[11px] text-emerald-700 mt-0.5 leading-normal">
                      Tu clave de Google AI Studio está configurada localmente y lista para usarse.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 justify-between">
                  <span className="text-[11px] text-slate-400 font-mono">••••••••••••••••</span>
                  <button
                    onClick={handleClearKey}
                    className="text-[11px] font-semibold text-red-500 hover:text-red-700 hover:underline cursor-pointer"
                  >
                    Remover Clave
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                <p className="text-[11px] text-slate-500 leading-normal">
                  Ingresa tu clave de API para activar las funciones inteligentes. Ésta se almacena únicamente en tu navegador para máxima privacidad.
                </p>

                <div className="space-y-1.5">
                  <input
                    type="password"
                    placeholder="AIzaSy..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                  />
                </div>

                <button
                  onClick={handleSaveKey}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md active:transform active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  Guardar API Key
                </button>
              </div>
            )}
          </div>

          {/* Guide Card (Zero Cost) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <HelpCircle className="w-5 h-5 text-indigo-500" />
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono">
                ¿Es gratis?
              </h3>
            </div>

            <div className="space-y-3 text-[11px] text-slate-500 leading-normal">
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                <p className="text-indigo-950 font-medium">
                  Sí, la capa de desarrollo (Free Tier) de Google AI Studio es <strong>100% gratuita</strong>.
                </p>
              </div>

              <p>
                Permite hasta 15 solicitudes por minuto y 1,500 por día, lo cual es más que suficiente para conciliar miles de transacciones de uso personal o de tu organización sin costo alguno.
              </p>

              <div className="pt-2">
                <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-2 font-mono">Pasos para obtener tu API Key:</h4>
                <ol className="space-y-1.5 list-decimal pl-4">
                  <li>Ingresa a <a href="https://aistudio.google.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-semibold hover:underline">aistudio.google.com</a> con tu cuenta de Gmail.</li>
                  <li>Haz clic en el botón azul <strong>"Get API key"</strong> en la esquina superior izquierda.</li>
                  <li>Selecciona <strong>"Create API Key"</strong>.</li>
                  <li>Copia la clave generada (comienza con <code>AIzaSy</code>) y pégala arriba.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: AI Scanner & Interactive Chat (lg:col-span-8) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* AI Scanner Section */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <BrainCircuit className="w-5 h-5 text-indigo-500" />
                <div>
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono">
                    Escáner de Conciliación Semántica
                  </h3>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">Analiza abonos y sugiere cruces automáticamente</p>
                </div>
              </div>

              <button
                onClick={analizarConciliacionesConAI}
                disabled={isScanning || !apiKey}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {isScanning ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Analizando con Gemini...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Escanear Abonos Pendientes
                  </>
                )}
              </button>
            </div>

            {sugerencias.length > 0 ? (
              <div className="space-y-4">
                <div className="text-xs font-semibold text-slate-600 flex items-center justify-between">
                  <span>Gemini propone las siguientes conciliaciones:</span>
                  <span className="text-[10px] font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                    {sugerencias.length} sugerencias encontradas
                  </span>
                </div>

                <div className="border border-slate-150 rounded-2xl overflow-hidden divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                  {sugerencias.map((sug, i) => {
                    const isSelected = selectedSugs[sug.operacion] || false;
                    return (
                      <div 
                        key={i} 
                        className={`p-4 flex items-start gap-3 transition-colors ${isSelected ? 'bg-indigo-50/10' : 'bg-white'}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSug(sug.operacion)}
                          className="mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4"
                        />
                        <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-12 gap-2">
                          <div className="md:col-span-4">
                            <div className="text-xs font-bold text-slate-950 font-mono truncate">OP {sug.operacion}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">Monto: {fmtMonto(sug.monto)}</div>
                          </div>
                          
                          <div className="md:col-span-5">
                            <div className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                              <ArrowRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                              <span className="truncate">{sug.cliente}</span>
                            </div>
                            <div className="text-[10px] font-mono text-indigo-600 mt-0.5 font-semibold">Factura {sug.factura}</div>
                          </div>

                          <div className="md:col-span-3 text-right">
                            <span className={`inline-flex px-1.5 py-0.5 text-[9px] font-mono font-bold rounded ${
                              sug.confianza === 'alta' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                            }`}>
                              CONF. {sug.confianza.toUpperCase()}
                            </span>
                          </div>

                          <div className="md:col-span-12 mt-1 text-[11px] bg-slate-50 border border-slate-100 rounded-lg p-2 text-slate-600 leading-normal italic">
                            💡 {sug.motivo}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => setSugerencias([])}
                    className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-600 transition-all cursor-pointer"
                  >
                    Descartar Todo
                  </button>
                  <button
                    onClick={aplicarSugerenciasSeleccionadas}
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md active:transform active:scale-[0.98] transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Aplicar Sugerencias Seleccionadas
                  </button>
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-slate-200 rounded-2xl p-8 text-center flex flex-col items-center justify-center">
                <Sparkles className="w-8 h-8 text-indigo-400/80 mb-2.5" />
                <div className="text-xs font-bold text-slate-700">Listo para escanear</div>
                <p className="text-[11px] text-slate-400 mt-1 max-w-sm leading-relaxed">
                  Haz clic en el botón "Escanear Abonos Pendientes" para enviar tu lista de depósitos y facturas pendientes a Gemini. Sugeriremos asociaciones complejas al instante.
                </p>
              </div>
            )}
          </div>

          {/* Interactive Live Chat with Financial Data */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Bot className="w-5 h-5 text-indigo-500" />
              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono">
                  Consulta Interactiva de Datos (Chat)
                </h3>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Pregúntale a Gemini sobre tus facturas y abonos actuales</p>
              </div>
            </div>

            {/* Chat Log Window */}
            <div className="border border-slate-150 bg-slate-50/50 rounded-2xl p-4 h-[250px] overflow-y-auto space-y-4">
              {chatLog.map((msg, i) => {
                const isAI = msg.sender === 'ai';
                return (
                  <div key={i} className={`flex gap-2.5 ${isAI ? 'justify-start' : 'justify-end'}`}>
                    {isAI && (
                      <div className="w-7 h-7 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-4 h-4 text-indigo-600" />
                      </div>
                    )}
                    <div className="max-w-[80%] flex flex-col">
                      <div className={`rounded-2xl px-3.5 py-2.5 text-xs font-medium leading-relaxed shadow-sm ${
                        isAI 
                          ? 'bg-white border border-slate-200 text-slate-800 rounded-tl-none' 
                          : 'bg-indigo-600 text-white rounded-tr-none'
                      }`}>
                        <div className="whitespace-pre-wrap">{msg.text}</div>
                      </div>
                      <span className="text-[9px] text-slate-400 mt-1 self-end pr-1 font-mono">{msg.time}</span>
                    </div>
                  </div>
                );
              })}
              {isChatLoading && (
                <div className="flex gap-2.5 justify-start">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center flex-shrink-0 animate-pulse">
                    <Bot className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="bg-white border border-slate-200 text-slate-800 rounded-2xl px-3.5 py-2.5 text-xs font-medium shadow-sm flex items-center gap-1.5 rounded-tl-none">
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                    <span>Gemini está procesando tus datos...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Chat Input */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Escribe tu consulta (Ej: ¿Qué facturas de más de S/ 10,000 están pendientes? o haz una sugerencia de conciliación)..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendChatMessage();
                }}
                disabled={isChatLoading || !apiKey}
                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-sans text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all disabled:opacity-50"
              />
              <button
                onClick={handleSendChatMessage}
                disabled={isChatLoading || !apiKey || !prompt.trim()}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md active:transform active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                Enviar
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
