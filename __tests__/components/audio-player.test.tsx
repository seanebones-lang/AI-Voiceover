import { render, screen } from '@testing-library/react'
import { AudioPlayer } from '@/components/audio-player'

describe('AudioPlayer', () => {
  it('renders audio element with src', () => {
    render(<AudioPlayer src="/test-audio.wav" />)
    
    const audio = screen.getByRole('application')
    expect(audio).toBeInTheDocument()
    expect(audio).toHaveAttribute('controls')
  })

  it('updates src when prop changes', () => {
    const { rerender } = render(<AudioPlayer src="/audio1.wav" />)
    
    const audio = screen.getByRole('application')
    expect(audio).toHaveAttribute('src', '/audio1.wav')
    
    rerender(<AudioPlayer src="/audio2.wav" />)
    expect(audio).toHaveAttribute('src', '/audio2.wav')
  })

  it('has proper accessibility attributes', () => {
    render(<AudioPlayer src="/test-audio.wav" />)
    
    const audio = screen.getByRole('application')
    expect(audio).toHaveAttribute('preload', 'metadata')
  })
})
