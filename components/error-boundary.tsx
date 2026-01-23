'use client'

/**
 * Error Boundary Component
 * Catches React component errors and displays a fallback UI
 */
import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  private errorContainerRef = React.createRef<HTMLDivElement>()

  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
    }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    
    // Log to error tracking service (e.g., Sentry)
    if (typeof window !== 'undefined' && (window as any).Sentry) {
      ;(window as any).Sentry.captureException(error, {
        contexts: {
          react: {
            componentStack: errorInfo.componentStack,
          },
        },
      })
    }
  }

  componentDidUpdate(prevProps: Props, prevState: State) {
    // Focus management: when error state changes to true, focus the error container
    if (this.state.hasError && !prevState.hasError && this.errorContainerRef.current) {
      // Use setTimeout to ensure DOM is updated
      setTimeout(() => {
        if (this.errorContainerRef.current) {
          this.errorContainerRef.current.focus()
        }
      }, 0)
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
    })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div 
          className="min-h-screen flex items-center justify-center bg-slate-950 p-4"
          role="alertdialog"
          aria-labelledby="error-title"
          aria-describedby="error-description"
          aria-modal="false"
        >
          <div 
            ref={this.errorContainerRef}
            className="max-w-md w-full p-6 rounded-lg bg-slate-900 border border-slate-800"
            tabIndex={-1}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-full bg-red-500/20" aria-hidden="true">
                <AlertCircle className="h-6 w-6 text-red-400" />
              </div>
              <h2 id="error-title" className="text-xl font-semibold text-white">
                Something went wrong
              </h2>
            </div>
            
            <p id="error-description" className="text-slate-300 mb-4">
              An unexpected error occurred. Please try refreshing the page or use the Try Again button to retry.
            </p>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mb-4 p-3 rounded bg-slate-800/50 border border-slate-700">
                <summary className="text-sm text-slate-200 cursor-pointer mb-2">
                  Error Details (Development Only)
                </summary>
                <pre className="text-xs text-red-300 overflow-auto" aria-label="Error stack trace">
                  {this.state.error.toString()}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
            
            <div className="flex gap-3" role="group" aria-label="Error recovery actions">
              <Button
                onClick={this.handleReset}
                className="flex-1 bg-purple-600 hover:bg-purple-500"
                aria-label="Try again to reload the application"
              >
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                Try Again
              </Button>
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
                className="flex-1 border-slate-700 text-slate-200 hover:bg-slate-800"
                aria-label="Refresh the entire page"
              >
                Refresh Page
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
