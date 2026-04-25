import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmotionPicker } from '@/components/emotion-picker'
import { EMOTIONS } from '@/lib/constants/emotions'

describe('EmotionPicker', () => {
  it('renders all emotion buttons', () => {
    render(
      <EmotionPicker 
        selectedEmotion="neutral" 
        onEmotionChange={jest.fn()} 
      />
    )
    
    EMOTIONS.forEach(emotion => {
      expect(screen.getByLabelText(new RegExp(emotion.label, 'i'))).toBeInTheDocument()
    })
  })

  it('shows selected emotion with correct styling', () => {
    render(
      <EmotionPicker 
        selectedEmotion="happy" 
        onEmotionChange={jest.fn()} 
      />
    )
    
    const happyButton = screen.getByLabelText(/happy/i)
    expect(happyButton).toHaveAttribute('aria-pressed', 'true')
  })

  it('calls onEmotionChange when emotion is clicked', async () => {
    const handleChange = jest.fn()
    const user = userEvent.setup()
    
    render(
      <EmotionPicker 
        selectedEmotion="neutral" 
        onEmotionChange={handleChange} 
      />
    )
    
    const happyButton = screen.getByLabelText(/happy/i)
    await user.click(happyButton)
    
    expect(handleChange).toHaveBeenCalledWith('happy')
  })

  it('supports keyboard navigation', async () => {
    const handleChange = jest.fn()
    const user = userEvent.setup()
    
    render(
      <EmotionPicker 
        selectedEmotion="neutral" 
        onEmotionChange={handleChange} 
      />
    )
    
    const happyButton = screen.getByLabelText(/happy/i)
    happyButton.focus()
    await user.keyboard('{Enter}')
    
    expect(handleChange).toHaveBeenCalledWith('happy')
  })

  it('has proper ARIA attributes', () => {
    render(
      <EmotionPicker 
        selectedEmotion="neutral" 
        onEmotionChange={jest.fn()} 
      />
    )
    
    const group = screen.getByRole('group')
    expect(group).toBeInTheDocument()
    expect(group).toHaveAttribute('aria-label')
  })
})
