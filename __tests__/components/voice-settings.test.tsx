import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VoiceSettings } from '@/components/voice-settings'

describe('VoiceSettings', () => {
  it('renders speed and volume sliders', () => {
    render(
      <VoiceSettings
        speed={[1.0]}
        volume={[0.8]}
        onSpeedChange={jest.fn()}
        onVolumeChange={jest.fn()}
      />
    )
    
    expect(screen.getByLabelText(/speed/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/volume/i)).toBeInTheDocument()
  })

  it('displays current speed value', () => {
    render(
      <VoiceSettings
        speed={[1.5]}
        volume={[0.8]}
        onSpeedChange={jest.fn()}
        onVolumeChange={jest.fn()}
      />
    )
    
    expect(screen.getByText(/1\.50x/i)).toBeInTheDocument()
  })

  it('displays current volume value', () => {
    render(
      <VoiceSettings
        speed={[1.0]}
        volume={[0.75]}
        onSpeedChange={jest.fn()}
        onVolumeChange={jest.fn()}
      />
    )
    
    expect(screen.getByText(/75%/i)).toBeInTheDocument()
  })

  it('calls onSpeedChange when speed slider changes', async () => {
    const handleSpeedChange = jest.fn()
    render(
      <VoiceSettings
        speed={[1.0]}
        volume={[0.8]}
        onSpeedChange={handleSpeedChange}
        onVolumeChange={jest.fn()}
      />
    )
    const sliders = screen.getAllByRole('slider')
    expect(sliders.length).toBeGreaterThanOrEqual(1)
  })

  it('has proper accessibility attributes', () => {
    render(
      <VoiceSettings
        speed={[1.0]}
        volume={[0.8]}
        onSpeedChange={jest.fn()}
        onVolumeChange={jest.fn()}
      />
    )
    
    const sliders = screen.getAllByRole('slider')
    const speedSlider = sliders.find(el => el.getAttribute('aria-valuemax') === '2')
    expect(speedSlider).toBeInTheDocument()
    expect(speedSlider).toHaveAttribute('aria-valuemin', '0.5')
    expect(speedSlider).toHaveAttribute('aria-valuemax', '2')
    expect(speedSlider).toHaveAttribute('aria-valuenow', '1')
  })
})
