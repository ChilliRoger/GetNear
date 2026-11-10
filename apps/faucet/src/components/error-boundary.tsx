"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn("[ErrorBoundary caught error]:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.fallbackComponent) {
        return this.fallbackComponent;
      }
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center p-6 text-zinc-500 text-xs">
          <span>Component temporarily unavailable</span>
        </div>
      );
    }

    return this.props.children;
  }

  private get fallbackComponent(): ReactNode {
    return this.props.fallback;
  }
}

