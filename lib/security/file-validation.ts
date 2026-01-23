/**
 * Enhanced File Validation
 * Validates file content using magic bytes (file signatures)
 * Prevents MIME type spoofing attacks
 */

// Magic bytes (file signatures) for common audio formats
const MAGIC_BYTES: Record<string, number[][]> = {
  'audio/wav': [
    [0x52, 0x49, 0x46, 0x46], // RIFF
    [0x57, 0x41, 0x56, 0x45], // WAVE (at offset 8)
  ],
  'audio/mpeg': [
    [0xFF, 0xFB], // MP3 with ID3v2
    [0xFF, 0xF3], // MP3
    [0xFF, 0xF2], // MP3
    [0x49, 0x44, 0x33], // ID3v2 tag
  ],
  'audio/flac': [
    [0x66, 0x4C, 0x61, 0x43], // fLaC
  ],
  'audio/ogg': [
    [0x4F, 0x67, 0x67, 0x53], // OggS
  ],
  'audio/webm': [
    [0x1A, 0x45, 0xDF, 0xA3], // WebM
  ],
  'audio/m4a': [
    [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70], // ftyp at offset 4
    [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], // ftyp at offset 4
  ],
}

/**
 * Read first N bytes from a File/Blob
 */
async function readFileHeader(file: File, bytes: number = 12): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      if (e.target?.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(e.target.result))
      } else {
        reject(new Error('Failed to read file header'))
      }
    }
    
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file.slice(0, bytes))
  })
}

/**
 * Check if file header matches expected magic bytes
 */
function matchesMagicBytes(header: Uint8Array, signatures: number[][]): boolean {
  for (const signature of signatures) {
    let matches = true
    
    // Check signature at different offsets
    for (let offset = 0; offset <= Math.min(4, header.length - signature.length); offset++) {
      matches = true
      for (let i = 0; i < signature.length; i++) {
        if (header[offset + i] !== signature[i]) {
          matches = false
          break
        }
      }
      if (matches) {
        return true
      }
    }
  }
  
  return false
}

/**
 * Detect file type from magic bytes
 */
export async function detectFileTypeFromMagicBytes(file: File): Promise<string | null> {
  try {
    const header = await readFileHeader(file, 12)
    
    for (const [mimeType, signatures] of Object.entries(MAGIC_BYTES)) {
      if (matchesMagicBytes(header, signatures)) {
        return mimeType
      }
    }
    
    return null
  } catch (error) {
    console.error('Error detecting file type:', error)
    return null
  }
}

/**
 * Validate file using both MIME type and magic bytes
 * Returns true if file is valid, false otherwise
 */
export async function validateFileWithMagicBytes(
  file: File,
  allowedMimeTypes: string[] = [
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/mpeg',
    'audio/mp3',
    'audio/flac',
    'audio/ogg',
    'audio/webm',
    'audio/m4a',
    'audio/x-m4a',
  ]
): Promise<{ valid: boolean; error?: string; detectedType?: string }> {
  // First check MIME type
  const declaredType = file.type
  
  // Detect actual file type from magic bytes
  const detectedType = await detectFileTypeFromMagicBytes(file)
  
  // If we can't detect type, fall back to MIME type check
  if (!detectedType) {
    if (allowedMimeTypes.includes(declaredType)) {
      return { valid: true, detectedType: declaredType }
    }
    
    // Check extension as last resort
    const validExtensions = ['.wav', '.mp3', '.flac', '.ogg', '.webm', '.m4a']
    const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
    
    if (validExtensions.includes(extension)) {
      return {
        valid: true,
        detectedType: declaredType || 'unknown',
        error: 'Could not verify file type from content. Proceed with caution.',
      }
    }
    
    return { valid: false, error: 'Invalid audio file format' }
  }
  
  // Verify detected type matches declared type (or is in allowed list)
  if (!allowedMimeTypes.includes(detectedType)) {
    return {
      valid: false,
      error: `File type mismatch: detected ${detectedType}, but only ${allowedMimeTypes.join(', ')} are allowed`,
      detectedType,
    }
  }
  
  // If declared type doesn't match detected type, warn but allow if detected type is valid
  if (declaredType && declaredType !== detectedType && !allowedMimeTypes.includes(declaredType)) {
    return {
      valid: true,
      detectedType,
      error: `File type mismatch: declared ${declaredType}, but detected ${detectedType}. Using detected type.`,
    }
  }
  
  return { valid: true, detectedType }
}

/**
 * Sanitize filename to prevent path traversal and other attacks
 */
export function sanitizeFilename(filename: string): string {
  // Remove path components
  const basename = filename.split('/').pop()?.split('\\').pop() || filename
  
  // Remove control characters and special path characters
  return basename
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .replace(/[<>:"|?*]/g, '_') // Replace dangerous characters
    .replace(/^\.+/, '') // Remove leading dots
    .replace(/\.+$/, '') // Remove trailing dots
    .substring(0, 255) // Limit length
}
