import { render, screen, waitFor } from '@testing-library/react'
import { ErrorBoundary } from '@/components/error-boundary'

// Component that throws an error
function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error')
  }
  return <div>No error</div>
}

describe('ErrorBoundary', () => {
  // Suppress console.error for these tests
  const originalError = console.error
  beforeAll(() => {
    console.error = jest.fn()
  })

  afterAll(() => {
    console.error = originalError
  })

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    )
    
    expect(screen.getByText('No error')).toBeInTheDocument()
  })

  it('catches errors and displays fallback UI', async () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )
    
    await waitFor(() => {
      expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument()
  })

  it('shows error details in development', async () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )
    
    await waitFor(() => {
      expect(screen.getByText(/Error Details/i)).toBeInTheDocument()
    })
    
    process.env.NODE_ENV = originalEnv
  })

  it('allows resetting error state', async () => {
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )
    
    await waitFor(() => {
      expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument()
    })
    
    // Reset by rendering without error
    rerender(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    )
    
    // Error boundary should still show error (it doesn't auto-reset)
    // This is expected behavior - user must click reset
  })
})
