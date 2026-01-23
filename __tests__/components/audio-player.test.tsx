import { render, screen } from '@testing-library/react'
import { AudioPlayer } from '@/components/audio-player'

describe('AudioPlayer', () => {
  it('renders audio element with src', () => {
    render(<AudioPlayer src="/test-audio.wav" />)
    
    const audio = document.querySelector('audio')
    expect(audio).toBeInTheDocument()
    expect(audio).toHaveAttribute('controls')
    expect(audio).toHaveAttribute('src', '/test-audio.wav')
  })

  it('updates src when prop changes', () => {
    const { rerender } = render(<AudioPlayer src="/audio1.wav" />)
    
    let audio = document.querySelector('audio')
    expect(audio).toBeInTheDocument()
    expect(audio).toHaveAttribute('src', '/audio1.wav')
    
    rerender(<AudioPlayer src="/audio2.wav" />)
    audio = document.querySelector('audio')
    expect(audio).toHaveAttribute('src', '/audio2.wav')
  })

  it('has proper accessibility attributes', () => {
    render(<AudioPlayer src="/test-audio.wav" />)
    
    // Audio element may not have 'application' role in all browsers
    // Check by querying for audio element directly
    const audio = document.querySelector('audio')
    expect(audio).toBeInTheDocument()
    expect(audio).toHaveAttribute('preload', 'metadata')
    expect(audio).toHaveAttribute('aria-label')
  })
})
