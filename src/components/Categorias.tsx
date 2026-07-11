import React, { useState, useMemo } from 'react';
import { Categoria } from '../types';
import { Plus, Edit2, ShieldAlert, Check, X, Tag } from 'lucide-react';

interface CategoriasProps {
  categorias: Categoria[];
  onGuardarCategoria: (id: string, data: { grupo: string; subgrupo: string; palabras_clave: string }) => Promise<void>;
  onToggleCategoria: (id: string, activo: boolean) => Promise<void>;
}

export default function Categorias({
  categorias,
  onGuardarCategoria,
  onToggleCategoria
}: CategoriasProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [grupo, setGrupo] = useState('');
  const [subgrupo, setSubgrupo] = useState('');
  const [keywords, setKeywords] = useState('');
  const [saving, setSaving] = useState(false);

  // Group categories by Grupo
  const categoriasAgrupadas = useMemo(() => {
    const grupos: { [key: string]: Categoria[] } = {};
    categorias.forEach(c => {
      if (!grupos[c.grupo]) grupos[c.grupo] = [];
      grupos[c.grupo].push(c);
    });
    return grupos;
  }, [categorias]);

  const handleMostrarForm = (c?: Categoria) => {
    if (c) {
      setEditId(c.id);
      setGrupo(c.grupo);
      setSubgrupo(c.subgrupo || '');
      setKeywords(c.palabras_clave || '');
    } else {
      setEditId('');
      setGrupo('');
      setSubgrupo('');
      setKeywords('');
    }
    setFormOpen(true);
  };

  const handleCancelarForm = () => {
    setFormOpen(false);
    setEditId('');
    setGrupo('');
    setSubgrupo('');
    setKeywords('');
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grupo.trim()) {
      alert('El nombre del grupo es obligatorio.');
      return;
    }

    setSaving(true);
    try {
      await onGuardarCategoria(editId, {
        grupo: grupo.trim(),
        subgrupo: subgrupo.trim(),
        palabras_clave: keywords.trim()
      });
      handleCancelarForm();
    } catch (err: any) {
      alert(`Error al guardar: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Intro */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Categorías del Presupuesto</h2>
          <p className="text-xs text-slate-500 mt-1">
            Administra los grupos, subgrupos y palabras claves asociadas para la clasificación automática inteligente de egresos.
          </p>
        </div>
        <button
          onClick={() => handleMostrarForm()}
          className="bg-capeco-blue text-white rounded-xl px-4 py-2.5 text-xs font-semibold hover:bg-capeco-blue-dark transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm self-start sm:self-center"
        >
          <Plus className="w-4 h-4" />
          Nueva Categoría
        </button>
      </div>

      {/* Form Overlay / Block */}
      {formOpen && (
        <form 
          onSubmit={handleGuardar}
          className="bg-white border border-slate-200 rounded-2xl p-5 shadow-md space-y-4"
        >
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
            {editId ? 'Editar Categoría' : 'Nueva Categoría Presupuestaria'}
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Grupo *</label>
              <input
                type="text"
                placeholder="ej. Gastos de Oficina"
                value={grupo}
                onChange={(e) => setGrupo(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 rounded-xl px-3 py-2.5 focus:outline-none focus:border-capeco-blue focus:bg-white w-full"
                disabled={saving}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Subgrupo (Opcional)</label>
              <input
                type="text"
                placeholder="ej. Energía / Luz"
                value={subgrupo}
                onChange={(e) => setSubgrupo(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 rounded-xl px-3 py-2.5 focus:outline-none focus:border-capeco-blue focus:bg-white w-full"
                disabled={saving}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Palabras Claves (Separadas por Comas)</label>
            <input
              type="text"
              placeholder="ej. luz,enel,electricidad,energia,servicios electricos"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 rounded-xl px-3 py-2.5 focus:outline-none focus:border-capeco-blue focus:bg-white w-full"
              disabled={saving}
            />
            <span className="text-[10px] text-slate-400 font-medium">
              El motor buscará estas palabras dentro de las descripciones bancarias de los egresos para sugerir esta categoría.
            </span>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
            <button
              type="submit"
              disabled={saving}
              className="bg-capeco-blue text-white rounded-xl px-4 py-2 text-xs font-semibold hover:bg-capeco-blue-dark transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar Categoría'}
            </button>
            <button
              type="button"
              onClick={handleCancelarForm}
              disabled={saving}
              className="border border-slate-200 text-slate-600 rounded-xl px-4 py-2 text-xs font-semibold hover:bg-slate-50 transition-all cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Categories Grid List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
        {Object.keys(categoriasAgrupadas).length === 0 ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
            <Tag className="w-10 h-10 text-slate-200 mb-2" />
            <div className="text-sm font-semibold text-slate-700">Sin categorías registradas</div>
            <p className="text-xs text-slate-400 mt-1">Crea tu primera categoría usando el botón de arriba.</p>
          </div>
        ) : (
          Object.keys(categoriasAgrupadas).map(grupoName => {
            const items = categoriasAgrupadas[grupoName];
            return (
              <div key={grupoName} className="p-4 space-y-3 bg-slate-50/20">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono border-b border-slate-100 pb-1.5">
                  {grupoName}
                </div>
                
                <div className="space-y-2.5">
                  {items.map(c => (
                    <div 
                      key={c.id} 
                      className={`bg-white p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm ${
                        c.activo ? 'border-slate-100' : 'border-slate-200 bg-slate-50/50 opacity-60'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                          <span>{c.grupo}</span>
                          {c.subgrupo && (
                            <span className="text-xs font-normal text-slate-400">
                              / {c.subgrupo}
                            </span>
                          )}
                        </div>
                        {c.palabras_clave ? (
                          <div className="text-[11px] font-mono text-slate-500 mt-1 flex flex-wrap gap-1 items-center">
                            <Tag className="w-3 h-3 text-slate-300" />
                            <span>Keywords:</span>
                            {c.palabras_clave.split(',').map((k, idx) => (
                              <span key={idx} className="bg-slate-50 border border-slate-150 px-1.5 py-0.5 rounded text-[10px] text-slate-600 font-medium font-sans">
                                {k.trim()}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[10px] font-mono italic text-slate-400 mt-1">
                            Sin palabras clave asignadas.
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-center">
                        <button
                          onClick={() => handleMostrarForm(c)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:text-slate-900 hover:border-slate-400 transition-all flex items-center gap-1 cursor-pointer bg-white"
                          title="Editar"
                        >
                          <Edit2 className="w-3 h-3" />
                          Editar
                        </button>
                        <button
                          onClick={() => onToggleCategoria(c.id, !c.activo)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all flex items-center gap-1 cursor-pointer ${
                            c.activo 
                              ? 'border-red-150 text-capeco-red bg-red-50/50 hover:bg-capeco-red hover:text-white hover:border-capeco-red' 
                              : 'border-emerald-250 text-emerald-600 bg-emerald-50 hover:bg-emerald-500 hover:text-white hover:border-emerald-500'
                          }`}
                        >
                          {c.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
