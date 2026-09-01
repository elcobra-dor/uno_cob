import React, { useRef, useState } from 'react';
import { 
  X, 
  FileText, 
  Building, 
  RefreshCcw, 
  Database, 
  CheckCircle, 
  FileSpreadsheet, 
  AlertCircle,
  HelpCircle,
  UploadCloud,
  CreditCard
} from 'lucide-react';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCargarFacturas: (file: File) => Promise<void>;
  onCargarBancos: (file: File) => Promise<void>;
  onCargarInter: (file: File) => Promise<void>;
  onCargarBD: (file: File) => Promise<void>;
  onCorregirGlosas: (file: File) => Promise<void>;
  onCargarBackupJSON: (file: File) => Promise<void>;
  onCargarVentasCulqi: (file: File) => Promise<void>;
  procesarYCerrar: () => Promise<void>;
}

export default function UploadModal({
  isOpen,
  onClose,
  onCargarFacturas,
  onCargarBancos,
  onCargarInter,
  onCargarBD,
  onCorregirGlosas,
  onCargarBackupJSON,
  procesarYCerrar
}: UploadModalProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [filesStatus, setFilesStatus] = useState({
    facturas: { loaded: false, label: 'Click o arrastra para seleccionar' },
    bancos: { loaded: false, label: 'Click o arrastra para seleccionar' },
    inter: { loaded: false, label: 'Opcional' },
    bd: { loaded: false, label: 'Opcional' },
    glosas: { loaded: false, label: 'Click para corregir (temporal)' },
    backup: { loaded: false, label: 'Click o arrastra para restaurar copia de seguridad (.json)' },
    culqi: { loaded: false, label: 'Reporte de ventas de Culqi (.xlsx)' }
  });

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'facturas' | 'bancos' | 'inter' | 'bd' | 'glosas' | 'backup' | 'culqi'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(type);
    try {
      if (type === 'facturas') {
        await onCargarFacturas(file);
      } else if (type === 'bancos') {
        await onCargarBancos(file);
      } else if (type === 'inter') {
        await onCargarInter(file);
      } else if (type === 'bd') {
        await onCargarBD(file);
      } else if (type === 'glosas') {
        await onCorregirGlosas(file);
      } else if (type === 'backup') {
        await onCargarBackupJSON(file);
      } else if (type === 'culqi') {
        await onCargarVentasCulqi(file);
      }

      setFilesStatus(prev => ({
        ...prev,
        [type]: { loaded: true, label: file.name }
      }));
    } catch (err: any) {
      alert(`Error al procesar el archivo: ${err.message || err}`);
    } finally {
      setLoading(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (
    e: React.DragEvent,
    type: 'facturas' | 'bancos' | 'inter' | 'bd' | 'glosas' | 'backup' | 'culqi'
  ) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    // Check extension
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (type === 'backup') {
      if (ext !== 'json') {
        alert('Solo se admiten archivos de copia de seguridad JSON (.json)');
        return;
      }
    } else {
      if (ext !== 'xlsx' && ext !== 'xls') {
        alert('Solo se admiten archivos de Excel (.xlsx, .xls)');
        return;
      }
    }

    setLoading(type);
    try {
      if (type === 'facturas') {
        await onCargarFacturas(file);
      } else if (type === 'bancos') {
        await onCargarBancos(file);
      } else if (type === 'inter') {
        await onCargarInter(file);
      } else if (type === 'bd') {
        await onCargarBD(file);
      } else if (type === 'glosas') {
        await onCorregirGlosas(file);
      } else if (type === 'backup') {
        await onCargarBackupJSON(file);
      } else if (type === 'culqi') {
        await onCargarVentasCulqi(file);
      }

      setFilesStatus(prev => ({
        ...prev,
        [type]: { loaded: true, label: file.name }
      }));
    } catch (err: any) {
      alert(`Error al procesar el archivo: ${err.message || err}`);
    } finally {
      setLoading(null);
    }
  };

  const [isProcessing, setIsProcessing] = useState(false);
  const handleProcesar = async () => {
    setIsProcessing(true);
    try {
      await procesarYCerrar();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 border border-slate-100 relative max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Cargar Archivos a la Nube</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Los datos se guardarán de forma permanente. Se omiten automáticamente los duplicados.
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-5 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Facturas */}
            <div 
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'facturas')}
              className={`border-2 border-dashed rounded-xl p-5 text-center flex flex-col items-center justify-center transition-all relative ${
                filesStatus.facturas.loaded 
                  ? 'border-emerald-500 bg-emerald-50/50' 
                  : 'border-slate-200 hover:border-capeco-blue hover:bg-slate-50/50'
              }`}
            >
              <input
                type="file"
                id="inp-facturas-react"
                accept=".xlsx,.xls"
                onChange={(e) => handleFileChange(e, 'facturas')}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                disabled={loading !== null}
              />
              <FileSpreadsheet className={`w-8 h-8 mb-2 ${filesStatus.facturas.loaded ? 'text-emerald-500' : 'text-slate-400'}`} />
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1 font-mono">Facturas pendientes</div>
              <div className={`text-xs font-medium max-w-full truncate px-4 ${filesStatus.facturas.loaded ? 'text-emerald-700' : 'text-slate-400'}`}>
                {loading === 'facturas' ? 'Procesando archivo...' : filesStatus.facturas.label}
              </div>
              {filesStatus.facturas.loaded && (
                <CheckCircle className="w-4 h-4 text-emerald-500 absolute top-3 right-3" />
              )}
            </div>

            {/* Bancos */}
            <div 
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'bancos')}
              className={`border-2 border-dashed rounded-xl p-5 text-center flex flex-col items-center justify-center transition-all relative ${
                filesStatus.bancos.loaded 
                  ? 'border-emerald-500 bg-emerald-50/50' 
                  : 'border-slate-200 hover:border-capeco-blue hover:bg-slate-50/50'
              }`}
            >
              <input
                type="file"
                id="inp-bancos-react"
                accept=".xlsx,.xls"
                onChange={(e) => handleFileChange(e, 'bancos')}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                disabled={loading !== null}
              />
              <Building className={`w-8 h-8 mb-2 ${filesStatus.bancos.loaded ? 'text-emerald-500' : 'text-slate-400'}`} />
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1 font-mono">Abonos / Bancos</div>
              <div className={`text-xs font-medium max-w-full truncate px-4 ${filesStatus.bancos.loaded ? 'text-emerald-700' : 'text-slate-400'}`}>
                {loading === 'bancos' ? 'Procesando archivo...' : filesStatus.bancos.label}
              </div>
              {filesStatus.bancos.loaded && (
                <CheckCircle className="w-4 h-4 text-emerald-500 absolute top-3 right-3" />
              )}
            </div>

            {/* Ventas Culqi */}
            <div 
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'culqi')}
              className={`border-2 border-dashed rounded-xl p-5 text-center flex flex-col items-center justify-center transition-all relative ${
                filesStatus.culqi.loaded 
                  ? 'border-emerald-500 bg-emerald-50/50' 
                  : 'border-slate-200 hover:border-capeco-blue hover:bg-slate-50/50'
              }`}
            >
              <input
                type="file"
                id="inp-culqi-react"
                accept=".xlsx,.xls"
                onChange={(e) => handleFileChange(e, 'culqi')}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                disabled={loading !== null}
              />
              <CreditCard className={`w-8 h-8 mb-2 ${filesStatus.culqi.loaded ? 'text-emerald-500' : 'text-slate-400'}`} />
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1 font-mono">Ventas Culqi</div>
              <div className={`text-xs font-medium max-w-full truncate px-4 ${filesStatus.culqi.loaded ? 'text-emerald-700' : 'text-slate-400'}`}>
                {loading === 'culqi' ? 'Procesando archivo...' : filesStatus.culqi.label}
              </div>
              {filesStatus.culqi.loaded && (
                <CheckCircle className="w-4 h-4 text-emerald-500 absolute top-3 right-3" />
              )}
            </div>

            {/* Interbancarios */}
            <div 
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'inter')}
              className={`border-2 border-dashed rounded-xl p-5 text-center flex flex-col items-center justify-center transition-all relative ${
                filesStatus.inter.loaded 
                  ? 'border-blue-500 bg-blue-50/50' 
                  : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50/50'
              }`}
            >
              <input
                type="file"
                id="inp-inter-react"
                accept=".xlsx,.xls"
                onChange={(e) => handleFileChange(e, 'inter')}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                disabled={loading !== null}
              />
              <RefreshCcw className={`w-8 h-8 mb-2 ${filesStatus.inter.loaded ? 'text-blue-500 animate-spin-slow' : 'text-slate-400'}`} />
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1 font-mono">Interbancarios <span className="text-[10px] text-slate-400 capitalize font-sans">(Opcional)</span></div>
              <div className={`text-xs font-medium max-w-full truncate px-4 ${filesStatus.inter.loaded ? 'text-blue-700' : 'text-slate-400'}`}>
                {loading === 'inter' ? 'Procesando archivo...' : filesStatus.inter.label}
              </div>
              {filesStatus.inter.loaded && (
                <CheckCircle className="w-4 h-4 text-blue-500 absolute top-3 right-3" />
              )}
            </div>

            {/* Banco BD */}
            <div 
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'bd')}
              className={`border-2 border-dashed rounded-xl p-5 text-center flex flex-col items-center justify-center transition-all relative ${
                filesStatus.bd.loaded 
                  ? 'border-blue-500 bg-blue-50/50' 
                  : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50/50'
              }`}
            >
              <input
                type="file"
                id="inp-bd-react"
                accept=".xlsx,.xls"
                onChange={(e) => handleFileChange(e, 'bd')}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                disabled={loading !== null}
              />
              <Database className={`w-8 h-8 mb-2 ${filesStatus.bd.loaded ? 'text-blue-500' : 'text-slate-400'}`} />
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1 font-mono">Libro Mayor / Banco BD <span className="text-[10px] text-slate-400 capitalize font-sans">(Opcional)</span></div>
              <div className={`text-xs font-medium max-w-full truncate px-4 ${filesStatus.bd.loaded ? 'text-blue-700' : 'text-slate-400'}`}>
                {loading === 'bd' ? 'Procesando archivo...' : filesStatus.bd.label}
              </div>
              {filesStatus.bd.loaded && (
                <CheckCircle className="w-4 h-4 text-blue-500 absolute top-3 right-3" />
              )}
            </div>

            {/* Fix Glosas */}
            <div 
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'glosas')}
              className={`border-2 border-dashed rounded-xl p-5 text-center flex flex-col items-center justify-center transition-all relative ${
                filesStatus.glosas.loaded 
                  ? 'border-indigo-500 bg-indigo-50/50' 
                  : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50/50'
              }`}
            >
              <input
                type="file"
                id="inp-glosas-react"
                accept=".xlsx,.xls"
                onChange={(e) => handleFileChange(e, 'glosas')}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                disabled={loading !== null}
              />
              <AlertCircle className={`w-6 h-6 mb-1.5 ${filesStatus.glosas.loaded ? 'text-indigo-500' : 'text-slate-400'}`} />
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1 font-mono">Corrector de Glosas <span className="text-[10px] text-slate-400 capitalize font-sans">(Temporal)</span></div>
              <div className={`text-xs font-medium max-w-full truncate px-4 ${filesStatus.glosas.loaded ? 'text-indigo-700' : 'text-slate-400'}`}>
                {loading === 'glosas' ? 'Corrigiendo glosas...' : filesStatus.glosas.label}
              </div>
              {filesStatus.glosas.loaded && (
                <CheckCircle className="w-4 h-4 text-indigo-500 absolute top-3 right-3" />
              )}
            </div>

            {/* Restore JSON Backup */}
            <div 
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'backup')}
              className={`border-2 border-dashed rounded-xl p-5 text-center flex flex-col items-center justify-center transition-all relative ${
                filesStatus.backup.loaded 
                  ? 'border-amber-500 bg-amber-50/50' 
                  : 'border-slate-200 hover:border-amber-400 hover:bg-slate-50/50'
              }`}
            >
              <input
                type="file"
                id="inp-backup-react"
                accept=".json"
                onChange={(e) => handleFileChange(e, 'backup')}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                disabled={loading !== null}
              />
              <UploadCloud className={`w-6 h-6 mb-1.5 ${filesStatus.backup.loaded ? 'text-amber-500' : 'text-slate-400'}`} />
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1 font-mono">Restaurar Copia de Seguridad <span className="text-[10px] text-slate-400 capitalize font-sans">(JSON)</span></div>
              <div className={`text-xs font-medium max-w-full truncate px-4 ${filesStatus.backup.loaded ? 'text-amber-700' : 'text-slate-400'}`}>
                {loading === 'backup' ? 'Restaurando copia...' : filesStatus.backup.label}
              </div>
              {filesStatus.backup.loaded && (
                <CheckCircle className="w-4 h-4 text-amber-500 absolute top-3 right-3" />
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition-all cursor-pointer"
            disabled={isProcessing}
          >
            Cerrar
          </button>
          
          <button 
            onClick={handleProcesar}
            className="px-6 py-2.5 rounded-xl bg-capeco-blue text-white text-sm font-semibold hover:bg-capeco-blue-dark active:transform active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isProcessing || (!filesStatus.facturas.loaded && !filesStatus.bancos.loaded && !filesStatus.inter.loaded && !filesStatus.bd.loaded && !filesStatus.glosas.loaded && !filesStatus.backup.loaded && !filesStatus.culqi.loaded)}
          >
            {isProcessing ? 'Procesando...' : 'Procesar y Conciliar →'}
          </button>
        </div>
      </div>
    </div>
  );
}
