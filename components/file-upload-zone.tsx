'use client'

/**
 * FileUploadZone Component
 * Drag-and-drop zone for uploading audio files
 * 
 * @param files - Array of selected files
 * @param onFilesChange - Callback when files change
 * @param maxFiles - Maximum number of files allowed
 */
import React, { useCallback } from 'react'
import { Upload, Trash2, Volume2 } from 'lucide-react'

interface FileUploadZoneProps {
  files: File[]
  onFilesChange: (files: File[]) => void
  maxFiles?: number
  'aria-label'?: string
}

export const FileUploadZone = React.memo(function FileUploadZone({
  files,
  onFilesChange,
  maxFiles = 5,
  'aria-label': ariaLabel = 'Upload audio files for voice cloning',
}: FileUploadZoneProps) {
  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles) return
    
    const newFiles = Array.from(selectedFiles).filter(f => 
      f.type.startsWith('audio/') || 
      /\.(wav|mp3|ogg|flac|m4a)$/i.test(f.name)
    )
    
    onFilesChange([...files, ...newFiles].slice(0, maxFiles))
  }, [files, onFilesChange, maxFiles])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    handleFileSelect(e.dataTransfer.files)
  }, [handleFileSelect])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      document.getElementById('audio-upload-input')?.click()
    }
  }, [])

  const removeFile = useCallback((index: number) => {
    onFilesChange(files.filter((_, i) => i !== index))
  }, [files, onFilesChange])

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onKeyDown={handleKeyDown}
        className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-purple-500/50 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500/50"
      >
        <Upload className="h-10 w-10 text-slate-500 mx-auto mb-3" aria-hidden="true" />
        <p className="text-slate-400 mb-2">
          Drag & drop audio files here
        </p>
        <p className="text-xs text-slate-500">
          WAV, MP3, OGG, FLAC • 3-30 seconds • Max {maxFiles} files
        </p>
        <input
          id="audio-upload-input"
          type="file"
          accept="audio/*"
          multiple
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
          aria-label="Select audio files"
        />
        <label
          htmlFor="audio-upload-input"
          className="mt-4 inline-block px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm cursor-pointer hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        >
          Browse Files
        </label>
      </div>

      {files.length > 0 && (
        <div className="mt-4 space-y-2" role="list" aria-label="Selected files">
          {files.map((file, i) => (
            <div 
              key={i} 
              className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/50"
              role="listitem"
            >
              <Volume2 className="h-4 w-4 text-purple-400" aria-hidden="true" />
              <span className="text-sm text-slate-300 flex-1 truncate">
                {file.name}
              </span>
              <span className="text-xs text-slate-500">
                {(file.size / 1024 / 1024).toFixed(1)}MB
              </span>
              <button
                onClick={() => removeFile(i)}
                className="text-slate-500 hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-red-500/50 rounded"
                aria-label={`Remove ${file.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})
