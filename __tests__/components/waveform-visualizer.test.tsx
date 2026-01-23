import { render, screen, waitFor } from '@testing-library/react'
import { WaveformVisualizer } from '@/components/waveform-visualizer'

// Mock useAudioContext hook
jest.mock('@/hooks/useAudioContext', () => ({
  useAudioContext: () => ({
    current: {
      createAnalyser: jest.fn(() => ({
        fftSize: 256,
        frequencyBinCount: 128,
        getByteFrequencyData: jest.fn(),
      })),
      createMediaElementSource: jest.fn(() => ({
        connect: jest.fn(),
      })),
      destination: {},
      close: jest.fn(),
    }),
  }),
}))

describe('WaveformVisualizer', () => {
  beforeEach(() => {
    // Mock Audio
    global.Audio = jest.fn().mockImplementation(() => ({
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      pause: jest.fn(),
      ended: false,
    })) as any
  })

  it('renders waveform container', () => {
    render(<WaveformVisualizer audioUrl="/test-audio.wav" />)
    
    const container = screen.getByLabelText(/audio waveform/i)
    expect(container).toBeInTheDocument()
  })

  it('has proper ARIA attributes', () => {
    render(<WaveformVisualizer audioUrl="/test-audio.wav" />)
    
    const container = screen.getByLabelText(/audio waveform/i)
    expect(container).toHaveAttribute('role', 'img')
    expect(container).toHaveAttribute('aria-label')
  })

  it('handles empty audioUrl gracefully', () => {
    render(<WaveformVisualizer audioUrl="" />)
    
    // Should not crash
    expect(screen.queryByLabelText(/audio waveform/i)).not.toBeInTheDocument()
  })

  it('updates when audioUrl changes', () => {
    const { rerender } = render(<WaveformVisualizer audioUrl="/audio1.wav" />)
    
    rerender(<WaveformVisualizer audioUrl="/audio2.wav" />)
    
    // Component should handle URL change
    expect(global.Audio).toHaveBeenCalled()
  })
})
