import { AlertTriangle, RefreshCw } from 'lucide-react'
import type { ErrorInfo, ReactNode } from 'react'
import { Component } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import i18n from '@/i18n'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Global error boundary.
 *
 * Without this, a single runtime error in any page blanks the entire app
 * (React unmounts the whole tree on an uncaught error). This boundary
 * catches the error, shows a recoverable fallback UI with the error
 * message, and offers a "Reset" button to re-render the subtree without
 * a full page reload.
 *
 * Wrap the router (or individual route elements) in <ErrorBoundary>.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack)
    } else {
      // 生产脱敏（TD-SEC-012）：不输出完整 error 对象（ApiError.body 可能含敏感响应）与 componentStack
      const status = 'status' in error ? (error as { status: number }).status : ''
      console.error(
        '[ErrorBoundary] Uncaught error:',
        error.name,
        error.message.slice(0, 200),
        status,
      )
    }
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="flex items-center justify-center min-h-screen p-6">
          <Card className="max-w-lg w-full border-destructive/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5" />
                {i18n.t('error.boundary.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {i18n.t('error.boundary.description')}
              </p>
              <pre className="text-xs font-mono bg-muted/50 rounded-lg p-3 overflow-auto max-h-40 border border-border">
                {this.state.error.message}
                {import.meta.env.DEV && this.state.error.stack
                  ? `\n\n${this.state.error.stack}`
                  : ''}
              </pre>
              <div className="flex gap-2">
                <Button onClick={this.reset} variant="default" size="sm">
                  <RefreshCw className="w-4 h-4 mr-1" />
                  {i18n.t('error.boundary.reset')}
                </Button>
                <Button onClick={() => window.location.reload()} variant="outline" size="sm">
                  {i18n.t('error.boundary.reload')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }
    return this.props.children
  }
}
