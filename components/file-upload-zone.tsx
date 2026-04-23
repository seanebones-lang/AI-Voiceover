'use client'

/**
 * FileUploadZone Component
 * Drag-and-drop zone for uploading audio files with duration validation
 * 
 * @param files - Array of selected files
 * @param onFilesChange - Callback when files change
 * @param maxFiles - Maximum number of files allowed
 */
import React, { useCallback, useState, useEffect } from 'react'
import { Upload, Trash2, Volume2, AlertCircle, Clock } from 'lucide-react'
import { getAudioDuration, validateAudioDuration } from '@/lib/validation'

interface FileWithDuration extends File {
  duration?: number
  durationError?: string
  durationWarning?: string
}

interface FileUploadZoneProps {
  files: File[]
  onFilesChange: (files: File[]) => void
  maxFiles?: number
  'aria-label'?: string
  showDuration?: boolean
  onDurationChange?: (totalDuration: number) => void
}

export const FileUploadZone = React.memo(function FileUploadZone({
  files,
  onFilesChange,
  maxFiles = 5,
  'aria-label': ariaLabel = 'Upload audio files for voice cloning',
  showDuration = true,
  onDurationChange,
}: FileUploadZoneProps) {
  const [filesWithDuration, setFilesWithDuration] = useState<FileWithDuration[]>([])
  const [loadingDurations, setLoadingDurations] = useState<Set<number>>(new Set())

  // Load durations for all files
  useEffect(() => {
    const loadDurations = async () => {
      const selectedFiles = [...files]
      if (selectedFiles.length === 0) {
        setFilesWithDuration([])
        onDurationChange?.(0)
        return
      }
      const filesWithDurations: FileWithDuration[] = []
      const loading = new Set<number>()
      
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]
        const fileWithDuration: FileWithDuration = file
        
        loading.add(i)
        setLoadingDurations(new Set(loading))
        
        try {
          const duration = await getAudioDuration(file)
          fileWithDuration.duration = duration
          
          const validation = validateAudioDuration(duration)
          if (validation.warning) {
            fileWithDuration.durationWarning = validation.warning
          }
          
          filesWithDurations.push(fileWithDuration)
        } catch (error) {
          fileWithDuration.durationError = 'Could not read duration'
          filesWithDurations.push(fileWithDuration)
        }
        
        loading.delete(i)
        setLoadingDurations(new Set(loading))
      }
      
      setFilesWithDuration(filesWithDurations)
      
      // Calculate total duration
      const totalDuration = filesWithDurations.reduce((sum, f) => sum + (f.duration || 0), 0)
      if (onDurationChange) {
        onDurationChange(totalDuration)
      }
    }
    
    loadDurations()
  }, [files, onDurationChange])

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
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        className="border-2 border-dashed border-slate-700 rounded-xl p-8 text-center hover:border-purple-500/50 transition-colors duration-200"
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
        />
        <button
          type="button"
          onClick={() => document.getElementById('audio-upload-input')?.click()}
          className="mt-4 inline-block px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm cursor-pointer hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-slate-950 transition-colors duration-200"
        >
          Browse Files
        </button>
      </div>

      {files.length > 0 && (
        <div className="mt-4 space-y-2" role="list" aria-label="Selected files">
          {files.map((file, i) => {
            const fileWithDuration = filesWithDuration[i] || file
            const isLoading = loadingDurations.has(i)
            const duration = fileWithDuration.duration
            const hasWarning = fileWithDuration.durationWarning
            const hasError = fileWithDuration.durationError
            
            return (
              <div 
                key={i} 
                className={`flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 ${hasWarning ? 'border border-yellow-500/30' : 'border border-transparent'} ${hasError ? 'border border-red-500/30' : ''} transition-colors duration-200`}
                role="listitem"
              >
                <Volume2 className="h-4 w-4 text-purple-400 flex-shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-slate-300 block truncate">
                    {file.name}
                  </span>
                  {showDuration && (
                    <div className="flex items-center gap-2 mt-1">
                      {isLoading ? (
                        <span className="text-xs text-slate-500">Loading duration...</span>
                      ) : duration !== undefined ? (
                        <>
                          <Clock className="h-3 w-3 text-slate-500" aria-hidden="true" />
                          <span className="text-xs text-slate-500">
                            {duration < 60 
                              ? `${duration.toFixed(1)}s`
                              : `${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, '0')}`
                            }
                          </span>
                          {hasWarning && (
                            <span className="text-xs text-yellow-400 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              {fileWithDuration.durationWarning}
                            </span>
                          )}
                        </>
                      ) : hasError ? (
                        <span className="text-xs text-red-400">{fileWithDuration.durationError}</span>
                      ) : null}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">
                    {(file.size / 1024 / 1024).toFixed(1)}MB
                  </span>
                  <button
                    onClick={() => removeFile(i)}
                    className="text-slate-500 hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-red-500/50 rounded p-1"
                    aria-label={`Remove ${file.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
})
