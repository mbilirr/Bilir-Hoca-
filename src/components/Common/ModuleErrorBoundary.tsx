import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  moduleName?: string;
  onResetToHome?: () => void;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ModuleErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn(`[ModuleErrorBoundary] Error in module [${this.props.moduleName || 'Unknown'}]:`, error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center shadow-xl space-y-4 my-4 max-w-lg mx-auto animate-in fade-in duration-200">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-bold text-white">
              {this.props.moduleName || 'Modül'} Yüklenirken Geçici Bir Durum Oluştu
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Modül verileri senkronize edilirken bir uyumsuzluk algılandı. Sayfayı yenilemeye gerek kalmadan modülü yeniden başlatabilir veya ana sayfaya dönebilirsiniz.
            </p>
          </div>
          {this.state.error && (
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-rose-400 break-words text-left max-h-24 overflow-y-auto">
              {this.state.error.message || String(this.state.error)}
            </div>
          )}
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md shadow-indigo-600/20"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Modülü Yeniden Başlat</span>
            </button>
            {this.props.onResetToHome && (
              <button
                type="button"
                onClick={this.props.onResetToHome}
                className="flex items-center space-x-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-all cursor-pointer border border-slate-700"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Ana Sayfaya Dön</span>
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
