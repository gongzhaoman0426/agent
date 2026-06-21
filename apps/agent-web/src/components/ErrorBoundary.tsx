import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/ui/components/button';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('应用渲染异常:', error, info.componentStack);
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-xl font-semibold text-foreground">页面出现错误</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {this.state.error?.message || '应用发生了未预期的错误，请刷新页面重试。'}
          </p>
          <Button onClick={this.handleReload}>刷新页面</Button>
        </div>
      );
    }

    return this.props.children;
  }
}
