import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VoiceSelect } from '@/components/voice-select'

const mockVoices = [
  { voice_id: 'voice-1', name: 'Voice One', language: 'en', source: 'system' },
  { voice_id: 'voice-2', name: 'Voice Two', language: 'es', source: 'system' },
  { voice_id: 'voice-3', name: 'Cloned Voice', language: 'en', source: 'cloned' },
]

describe('VoiceSelect', () => {
  it('renders with placeholder when no value', () => {
    render(<VoiceSelect voices={mockVoices} value="" onChange={jest.fn()} />)
    
    expect(screen.getByText('Select a voice...')).toBeInTheDocument()
  })

  it('displays currently selected voice', () => {
    render(<VoiceSelect voices={mockVoices} value="voice-1" onChange={jest.fn()} />)
    
    expect(screen.getByText(/Voice One/)).toBeInTheDocument()
  })

  it('calls onChange when voice is selected', async () => {
    const handleChange = jest.fn()
    const user = userEvent.setup()
    
    render(<VoiceSelect voices={mockVoices} value="voice-1" onChange={handleChange} />)
    
    const trigger = screen.getByRole('combobox')
    await user.click(trigger)
    
    const option = screen.getByText(/Voice Two/)
    await user.click(option)
    
    expect(handleChange).toHaveBeenCalledWith('voice-2')
  })

  it('has proper accessibility attributes', () => {
    render(<VoiceSelect voices={mockVoices} value="voice-1" onChange={jest.fn()} />)
    
    const select = screen.getByRole('combobox')
    expect(select).toBeInTheDocument()
  })
})
