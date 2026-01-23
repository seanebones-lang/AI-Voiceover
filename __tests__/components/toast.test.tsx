import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useToast, ToastContainer } from '@/components/toast'

// Test component that uses the hook
function TestComponent() {
  const { success, error, info, warning, ToastContainer: Container } = useToast()
  
  return (
    <div>
      <button onClick={() => success('Success message')}>Show Success</button>
      <button onClick={() => error('Error message')}>Show Error</button>
      <button onClick={() => info('Info message')}>Show Info</button>
      <button onClick={() => warning('Warning message')}>Show Warning</button>
      <Container />
    </div>
  )
}

describe('Toast System', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  it('displays success toast', async () => {
    const user = userEvent.setup({ delay: null })
    render(<TestComponent />)
    
    const button = screen.getByText('Show Success')
    await user.click(button)
    
    expect(screen.getByText('Success message')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive')
  })

  it('displays error toast', async () => {
    const user = userEvent.setup({ delay: null })
    render(<TestComponent />)
    
    const button = screen.getByText('Show Error')
    await user.click(button)
    
    expect(screen.getByText('Error message')).toBeInTheDocument()
  })

  it('auto-dismisses toast after duration', async () => {
    const user = userEvent.setup({ delay: null })
    render(<TestComponent />)
    
    const button = screen.getByText('Show Success')
    await user.click(button)
    
    expect(screen.getByText('Success message')).toBeInTheDocument()
    
    // Fast-forward time
    jest.advanceTimersByTime(5000)
    
    await waitFor(() => {
      expect(screen.queryByText('Success message')).not.toBeInTheDocument()
    })
  })

  it('allows manual dismissal', async () => {
    const user = userEvent.setup({ delay: null })
    render(<TestComponent />)
    
    const button = screen.getByText('Show Success')
    await user.click(button)
    
    const closeButton = screen.getByLabelText('Close notification')
    await user.click(closeButton)
    
    expect(screen.queryByText('Success message')).not.toBeInTheDocument()
  })

  it('displays multiple toasts', async () => {
    const user = userEvent.setup({ delay: null })
    render(<TestComponent />)
    
    await user.click(screen.getByText('Show Success'))
    await user.click(screen.getByText('Show Error'))
    
    expect(screen.getByText('Success message')).toBeInTheDocument()
    expect(screen.getByText('Error message')).toBeInTheDocument()
  })
})
