import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'Erro inesperado na aplicação.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let readableMessage = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed?.error) {
          readableMessage = `Operação ${parsed.operationType || ''} em ${parsed.path || 'banco de dados'}: ${parsed.error}`;
        }
      } catch {
        // plain string message
      }

      return (
        <div className="min-h-screen bg-[#0B0D12] text-[#F5F7FA] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-[#141821] border border-[#252B36] rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h2 className="text-base font-semibold text-[#F5F7FA]">
                Ocorreu um erro ao processar a solicitação
              </h2>
            </div>
            <p className="text-sm text-[#929BAA] leading-relaxed break-words">
              {readableMessage}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#19C37D] text-[#0B0D12] text-sm font-semibold hover:bg-[#16AE6F] transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Recarregar aplicação
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
