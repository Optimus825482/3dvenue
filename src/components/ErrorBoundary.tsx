import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("3D Viewer error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="error-boundary">
            <div className="error-boundary-icon">⚠️</div>
            <h3>3D Görüntüleyici Hatası</h3>
            <p>
              WebGL veya 3D render sırasında bir hata oluştu. Tarayıcınızın
              WebGL destekleyip desteklemediğini kontrol edin.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Tekrar Dene
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
