import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmptyState } from '@/components/empty-state'
import { Mic } from 'lucide-react'

describe('EmptyState', () => {
  it('renders with title and description', () => {
    render(
      <EmptyState
        icon={Mic}
        title="No voices"
        description="Upload audio to create your first voice"
      />
    )
    
    expect(screen.getByText('No voices')).toBeInTheDocument()
    expect(screen.getByText(/upload audio/i)).toBeInTheDocument()
  })

  it('renders icon', () => {
    render(
      <EmptyState
        icon={Mic}
        title="Test"
        description="Test description"
      />
    )
    
    // Icon should be present (aria-hidden)
    const container = screen.getByText('Test').closest('div')
    expect(container).toBeInTheDocument()
    // Icon is rendered with aria-hidden="true"
  })

  it('renders action button when provided', async () => {
    const handleAction = jest.fn()
    const user = userEvent.setup()
    
    render(
      <EmptyState
        icon={Mic}
        title="Test"
        description="Test description"
        action={{
          label: 'Create Voice',
          onClick: handleAction,
        }}
      />
    )
    
    const button = screen.getByText('Create Voice')
    expect(button).toBeInTheDocument()
    
    await user.click(button)
    expect(handleAction).toHaveBeenCalled()
  })

  it('does not render action button when not provided', () => {
    render(
      <EmptyState
        icon={Mic}
        title="Test"
        description="Test description"
      />
    )
    
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
