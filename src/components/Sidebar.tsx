import React from 'react';
import { supabase } from '../lib/supabase';
import { 
  ArrowLeftRight, 
  FileSpreadsheet, 
  ArrowUpRight, 
  FolderKey, 
  BarChart3, 
  Download, 
  Database, 
  LogOut,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  RefreshCw
} from 'lucide-react';

interface SidebarProps {
  currentPage: string;
  setCurrentPage: (page: string) => void;
  onExportCSV: () => void;
  onExportSistema: () => void;
  onExportEstado: () => void;
  dbStatus: 'connected' | 'error' | 'connecting';
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  statsMini: string;
}

export default function Sidebar({
  currentPage,
  setCurrentPage,
  onExportCSV,
  onExportSistema,
  onExportEstado,
  dbStatus,
  isCollapsed,
  setIsCollapsed,
  statsMini
}: SidebarProps) {
  
  const handleLogout = async () => {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
      await supabase.auth.signOut();
      window.location.reload();
    }
  };

  const navItems = [
    { id: 'conciliacion', label: 'Conciliación', icon: <ArrowLeftRight className="w-4 h-4" />, section: 'Principal' },
    { id: 'facturas', label: 'Facturas', icon: <FileSpreadsheet className="w-4 h-4" />, section: 'Principal' },
    { id: 'egresos', label: 'Egresos', icon: <ArrowUpRight className="w-4 h-4" />, section: 'Principal' },
    { id: 'categorias', label: 'Categorías', icon: <FolderKey className="w-4 h-4" />, section: 'Principal' },
    { id: 'reportes', label: 'Reportes', icon: <BarChart3 className="w-4 h-4" />, section: 'Principal' },
    { id: 'asistente-ai', label: 'Asistente AI', icon: <Sparkles className="w-4 h-4 text-indigo-500" />, section: 'Principal' },
  ];

  const dbStatusStyles = {
    connected: { color: 'text-emerald-500', label: '🟢 Base de datos OK', bg: 'bg-emerald-50' },
    connecting: { color: 'text-amber-500', label: '🟡 Conectando...', bg: 'bg-amber-50' },
    error: { color: 'text-red-500', label: '🔴 Sin conexión', bg: 'bg-red-50' }
  };

  return (
    <div 
      className={`fixed top-0 left-0 bottom-0 bg-white border-r border-slate-200 flex flex-col z-50 transition-all duration-300 ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Brand Logo Section */}
      <div className={`p-5 border-b border-slate-100 flex items-center justify-between overflow-hidden ${isCollapsed ? 'justify-center' : ''}`}>
        {!isCollapsed && (
          <div>
            <div className="flex items-center gap-3 px-2 py-1">
          {/* Isotipo: Tu Hexágono Guinda */}
          <img src="/icon-192.png" alt="Logo BAZVAC" className="h-10 w-10 object-contain drop-shadow-sm" />
          
          {/* Textos Corporativos */}
          <div className="flex flex-col">
            <span className="font-['Montserrat'] font-extrabold text-[#7A1B29] text-xl tracking-tight leading-none">
              BAZVAC
            </span>
            <span className="font-['Lato'] text-[#2C2C2E] text-[10px] uppercase font-bold tracking-widest mt-1">
              Cobranzas
            </span>
          </div>
        </div>
        )}
        
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`p-1.5 rounded-lg border border-slate-150 bg-slate-50 text-slate-500 hover:text-slate-900 hover:border-slate-300 transition-all cursor-pointer ${
            isCollapsed ? 'mx-auto' : ''
          }`}
          title={isCollapsed ? "Expandir menú" : "Colapsar menú"}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Section */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <div>
          {!isCollapsed && (
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-3 mb-2">
              Principal
            </div>
          )}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentPage(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                    active 
                      ? 'bg-blue-50 text-capeco-blue font-semibold' 
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                  title={isCollapsed ? item.label : undefined}
                >
                  <span className={`flex-shrink-0 ${active ? 'text-capeco-blue' : 'text-slate-400'}`}>
                    {item.icon}
                  </span>
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Exports Group */}
        <div>
          {!isCollapsed && (
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-3 mb-2">
              Exportar
            </div>
          )}
          <div className="space-y-1">
            <button
              onClick={onExportCSV}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all cursor-pointer"
              title={isCollapsed ? "Exportar CSV" : undefined}
            >
              <Download className="w-4 h-4 text-slate-400 flex-shrink-0" />
              {!isCollapsed && <span className="truncate">Exportar CSV</span>}
            </button>
            <button
              onClick={onExportSistema}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-950 transition-all cursor-pointer"
              title={isCollapsed ? "Exportar ERP" : undefined}
            >
              <Sparkles className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              {!isCollapsed && (
                <span className="truncate flex items-center gap-1.5">
                  Exportar Sistema 
                  <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1 rounded font-mono">ERP</span>
                </span>
              )}
            </button>
            <button
              onClick={onExportEstado}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all cursor-pointer"
              title={isCollapsed ? "Guardar Estado" : undefined}
            >
              <Download className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              {!isCollapsed && <span className="truncate">Guardar Estado</span>}
            </button>
          </div>
        </div>
      </div>

      {/* Footer Area */}
      <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-3.5">
        {!isCollapsed && statsMini && (
          <div className="text-xs text-slate-500 font-mono flex items-center gap-1.5 leading-tight px-1.5">
            <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin-slow" />
            <span>{statsMini}</span>
          </div>
        )}

        <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!isCollapsed ? (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${dbStatusStyles[dbStatus].bg} ${dbStatusStyles[dbStatus].color}`}>
              <Database className="w-3.5 h-3.5" />
              <span>{dbStatusStyles[dbStatus].label}</span>
            </div>
          ) : (
            <div 
              className={`p-1.5 rounded-full ${dbStatusStyles[dbStatus].bg} ${dbStatusStyles[dbStatus].color}`}
              title={dbStatusStyles[dbStatus].label}
            >
              <Database className="w-4 h-4" />
            </div>
          )}

          <button
            onClick={handleLogout}
            className={`p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-950 transition-all cursor-pointer ${
              isCollapsed ? 'mx-auto' : ''
            }`}
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
