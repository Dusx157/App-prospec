import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Save } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { formatAppError, renderWhatsappTemplate } from '../lib/opportunity';

export function SettingsView() {
  const { user, profile, updateProfileSettings } = useAuth();
  const { showToast } = useToast();

  const [displayName, setDisplayName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [defaultCity, setDefaultCity] = useState('');
  const [defaultState, setDefaultState] = useState('');
  const [whatsappTemplate, setWhatsappTemplate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName || '');
    setCompanyName(profile.companyName || '');
    setDefaultCity(profile.defaultCity || '');
    setDefaultState(profile.defaultState || '');
    setWhatsappTemplate(profile.whatsappTemplate || '');
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfileSettings({
        displayName,
        companyName,
        defaultCity,
        defaultState,
        whatsappTemplate,
      });
      showToast('Configurações salvas no perfil.');
    } catch (err) {
      showToast(formatAppError(err, 'Erro ao salvar configurações.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const insertVariable = (token: string) => {
    setWhatsappTemplate((prev) => `${prev}${prev.endsWith(' ') || !prev ? '' : ' '}${token}`);
  };

  const previewText = renderWhatsappTemplate(whatsappTemplate, {
    empresa: 'Barbearia Central',
    cidade: defaultCity || 'Indaiatuba',
    nota: 4.3,
    avaliacoes: 18,
  });

  return (
    <div className="max-w-3xl space-y-6">
      <form
        onSubmit={handleSave}
        className="bg-[#141821] border border-[#252B36] rounded-2xl p-6 space-y-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]"
      >
        <div>
          <h2 className="text-sm font-semibold text-[#F5F7FA]">
            Perfil operacional e prospecção padrão
          </h2>
          <p className="text-xs text-[#929BAA] mt-0.5">
            Personalize sua operação comercial e os padrões usados pelo Radar de empresas e WhatsApp.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#929BAA] mb-1.5">Seu nome</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D] transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#929BAA] mb-1.5">Nome da empresa / marca</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D] transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#929BAA] mb-1.5">Cidade padrão do Radar</label>
            <input
              type="text"
              value={defaultCity}
              onChange={(e) => setDefaultCity(e.target.value)}
              placeholder="Ex.: Indaiatuba"
              className="w-full h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D] transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#929BAA] mb-1.5">Estado (UF)</label>
            <input
              type="text"
              value={defaultState}
              onChange={(e) => setDefaultState(e.target.value)}
              placeholder="Ex.: SP"
              className="w-full h-10 px-3.5 rounded-xl bg-[#0B0D12] border border-[#252B36] text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D] transition-colors"
            />
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-medium text-[#929BAA]">
              Template padrão de mensagem no WhatsApp
            </label>
            <div className="flex flex-wrap gap-1.5">
              {['{empresa}', '{cidade}', '{nota}', '{avaliacoes}'].map((tok) => (
                <button
                  key={tok}
                  type="button"
                  onClick={() => insertVariable(tok)}
                  className="px-2.5 py-1 rounded-lg bg-[#0B0D12] border border-[#252B36] text-[11px] font-mono text-[#19C37D] hover:border-[#19C37D] active:scale-[0.98] transition-all"
                >
                  {tok}
                </button>
              ))}
            </div>
          </div>
          <textarea
            rows={3}
            value={whatsappTemplate}
            onChange={(e) => setWhatsappTemplate(e.target.value)}
            className="w-full rounded-xl bg-[#0B0D12] border border-[#252B36] p-3.5 text-xs text-[#F5F7FA] focus:outline-none focus:border-[#19C37D] transition-colors"
          />
          <div className="bg-[#0B0D12] border border-[#252B36] rounded-xl p-3.5 space-y-1">
            <div className="text-[11px] font-medium text-[#929BAA]">Pré-visualização:</div>
            <div className="text-xs text-[#F5F7FA] leading-relaxed">{previewText}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#252B36]">
          <span className="text-xs text-[#929BAA]">Conta Google: {user?.email}</span>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#19C37D] text-[#0B0D12] text-xs font-semibold hover:bg-[#16AE6F] active:scale-[0.98] transition-all disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Salvar alterações
          </button>
        </div>
      </form>

      {/* Integrations Read-Only Summary */}
      <div className="bg-[#141821] border border-[#252B36] rounded-2xl p-6 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
        <h2 className="text-sm font-semibold text-[#F5F7FA]">
          Integrações gerenciadas pelo servidor
        </h2>
        <div className="divide-y divide-[#252B36] text-xs">
          <div className="py-3 flex items-center justify-between gap-3">
            <div>
              <div className="font-medium text-[#F5F7FA]">Firebase Auth & Cloud Firestore</div>
              <div className="text-[11px] text-[#929BAA]">
                Autenticação isolada por usuário e persistência em tempo real
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-[#19C37D] font-medium whitespace-nowrap shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Conectado
            </span>
          </div>
          <div className="py-3 flex items-center justify-between gap-3">
            <div>
              <div className="font-medium text-[#F5F7FA]">
                Google Maps Platform & Places API (New)
              </div>
              <div className="text-[11px] text-[#929BAA]">
                Busca por cidade, categoria e raio + mapa interativo e rotas
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-[#19C37D] font-medium whitespace-nowrap shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Ativo
            </span>
          </div>
          <div className="py-3 flex items-center justify-between gap-3">
            <div>
              <div className="font-medium text-[#F5F7FA]">Inteligência Comercial Gemini</div>
              <div className="text-[11px] text-[#929BAA]">
                Análise personalizada via proxy seguro no backend
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-[#19C37D] font-medium whitespace-nowrap shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Ativo
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
