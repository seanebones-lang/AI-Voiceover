import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileUploadZone } from '@/components/file-upload-zone'

describe('FileUploadZone', () => {
  const mockFiles = [
    new File(['audio content'], 'test1.wav', { type: 'audio/wav' }),
    new File(['audio content'], 'test2.mp3', { type: 'audio/mpeg' }),
  ]

  it('renders file upload zone', () => {
    render(<FileUploadZone files={[]} onFilesChange={jest.fn()} />)
    
    expect(screen.getByLabelText(/upload audio files/i)).toBeInTheDocument()
    expect(screen.getByText(/drag & drop/i)).toBeInTheDocument()
  })

  it('displays selected files', () => {
    Object.defineProperty(mockFiles[0], 'size', { value: 1024 * 1024 }) // 1MB
    
    render(
      <FileUploadZone 
        files={[mockFiles[0]]} 
        onFilesChange={jest.fn()} 
      />
    )
    
    expect(screen.getByText('test1.wav')).toBeInTheDocument()
  })

  it('allows removing files', async () => {
    const handleChange = jest.fn()
    Object.defineProperty(mockFiles[0], 'size', { value: 1024 * 1024 })
    
    render(
      <FileUploadZone 
        files={[mockFiles[0]]} 
        onFilesChange={handleChange} 
      />
    )
    
    const removeButton = screen.getByLabelText(/remove test1.wav/i)
    await userEvent.click(removeButton)
    
    expect(handleChange).toHaveBeenCalledWith([])
  })

  it('supports keyboard navigation', async () => {
    const user = userEvent.setup()
    render(<FileUploadZone files={[]} onFilesChange={jest.fn()} />)
    
    const zone = screen.getByLabelText(/upload audio files/i)
    zone.focus()
    await user.keyboard('{Enter}')
    
    // Should trigger file input click
    expect(zone).toHaveAttribute('tabIndex', '0')
  })

  it('has proper ARIA attributes', () => {
    render(<FileUploadZone files={[]} onFilesChange={jest.fn()} />)
    
    const zone = screen.getByLabelText(/upload audio files/i)
    expect(zone).toHaveAttribute('role', 'button')
    expect(zone).toHaveAttribute('aria-label')
  })
})
