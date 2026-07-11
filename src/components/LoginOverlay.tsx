import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Lock, Mail, Loader2, Building2 } from 'lucide-react';

interface LoginOverlayProps {
  onLoginSuccess: () => void;
}

export default function LoginOverlay({ onLoginSuccess }: LoginOverlayProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Por favor, ingresa correo y contraseña.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (signInError) {
        setError('Correo o contraseña incorrectos');
      } else if (data.session) {
        onLoginSuccess();
      }
    } catch (err: any) {
      setError('Error inesperado de red o servidor.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-9999 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full p-8 relative overflow-hidden transition-all transform scale-100">
        
        {/* Decorative Top Accent */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-capeco-blue to-capeco-red"></div>

        <div className="text-center mb-8 mt-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 text-capeco-blue mb-4">
            <Building2 className="w-8 h-8" />
          </div>
          <h1 className="font-mono text-2xl font-bold tracking-tight text-slate-900">CAPECO</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">Cuentas por Cobrar — Acceso Restringido</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Correo Electrónico
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Mail className="w-4 h-4" />
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ejemplo@capeco.org"
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-sans text-sm text-slate-950 placeholder-slate-400 focus:outline-none focus:border-capeco-blue focus:bg-white transition-all"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Contraseña
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-sans text-sm text-slate-950 placeholder-slate-400 focus:outline-none focus:border-capeco-blue focus:bg-white transition-all"
                disabled={loading}
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-capeco-red text-xs font-medium p-3 rounded-xl border border-red-100 leading-snug">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3.5 px-4 bg-capeco-blue text-white rounded-xl font-mono text-sm font-semibold tracking-wider hover:bg-capeco-blue-dark active:transform active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                VERIFICANDO...
              </>
            ) : (
              'INGRESAR →'
            )}
          </button>
        </form>

        <div className="mt-8 text-center border-t border-slate-100 pt-5 text-[11px] text-slate-400 font-mono">
          Cámara Peruana de la Construcción © {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}
