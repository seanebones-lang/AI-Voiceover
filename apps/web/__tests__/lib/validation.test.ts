import {
  validateTTSRequest,
  validateAudioFile,
  sanitizeText,
  extractClientIP,
  textSchema,
  voiceIdSchema,
  speedSchema,
  volumeSchema,
} from '@/lib/validation'

describe('Validation Library', () => {
  describe('validateTTSRequest', () => {
    it('should validate a correct TTS request', () => {
      const request = {
        text: 'Hello world',
        voice_id: 'test-voice-123',
        language: 'en',
        speed: 1.0,
        volume: 0.8,
      }
      
      const result = validateTTSRequest(request)
      
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.text).toBe('Hello world')
      expect(result.data?.voice_id).toBe('test-voice-123')
    })

    it('should reject empty text', () => {
      const request = {
        text: '',
        voice_id: 'test-voice',
      }
      
      const result = validateTTSRequest(request)
      
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should reject text over 5000 characters', () => {
      const request = {
        text: 'a'.repeat(5001),
        voice_id: 'test-voice',
      }
      
      const result = validateTTSRequest(request)
      
      expect(result.success).toBe(false)
    })

    it('should reject invalid voice_id', () => {
      const request = {
        text: 'Hello',
        voice_id: 'invalid voice id!',
      }
      
      const result = validateTTSRequest(request)
      
      expect(result.success).toBe(false)
    })

    it('should sanitize text input', () => {
      const request = {
        text: '  Hello   world  \n\t',
        voice_id: 'test-voice',
      }
      
      const result = validateTTSRequest(request)
      
      expect(result.success).toBe(true)
      expect(result.data?.text).toBe('Hello world')
    })

    it('should reject malicious script tags', () => {
      const request = {
        text: '<script>alert("xss")</script>',
        voice_id: 'test-voice',
      }
      
      const result = validateTTSRequest(request)
      
      expect(result.success).toBe(false)
    })

    it('should validate speed bounds', () => {
      const validRequest = {
        text: 'Hello',
        voice_id: 'test-voice',
        speed: 1.5,
      }
      
      const invalidRequest = {
        text: 'Hello',
        voice_id: 'test-voice',
        speed: 3.0, // Too high
      }
      
      expect(validateTTSRequest(validRequest).success).toBe(true)
      expect(validateTTSRequest(invalidRequest).success).toBe(false)
    })
  })

  describe('validateAudioFile', () => {
    it('should validate a correct audio file', () => {
      const file = new File(['audio content'], 'test.wav', { type: 'audio/wav' })
      Object.defineProperty(file, 'size', { value: 1024 * 1024 }) // 1MB
      
      const result = validateAudioFile(file)
      
      expect(result.valid).toBe(true)
    })

    it('should reject files over 50MB', () => {
      const file = new File(['audio content'], 'test.wav', { type: 'audio/wav' })
      Object.defineProperty(file, 'size', { value: 51 * 1024 * 1024 }) // 51MB
      
      const result = validateAudioFile(file)
      
      expect(result.valid).toBe(false)
      expect(result.error).toContain('50MB')
    })

    it('should reject files under 1KB', () => {
      const file = new File(['a'], 'test.wav', { type: 'audio/wav' })
      Object.defineProperty(file, 'size', { value: 500 }) // 500 bytes
      
      const result = validateAudioFile(file)
      
      expect(result.valid).toBe(false)
    })

    it('should accept valid MIME types', () => {
      const validTypes = ['audio/wav', 'audio/mpeg', 'audio/flac', 'audio/ogg']
      
      validTypes.forEach(type => {
        const file = new File(['content'], 'test', { type })
        Object.defineProperty(file, 'size', { value: 1024 * 1024 })
        
        const result = validateAudioFile(file)
        expect(result.valid).toBe(true)
      })
    })

    it('should validate by extension if MIME type is missing', () => {
      const file = new File(['content'], 'test.wav', { type: '' })
      Object.defineProperty(file, 'size', { value: 1024 * 1024 })
      
      const result = validateAudioFile(file)
      
      expect(result.valid).toBe(true)
    })
  })

  describe('sanitizeText', () => {
    it('should trim whitespace', () => {
      expect(sanitizeText('  hello  ')).toBe('hello')
    })

    it('should normalize multiple spaces', () => {
      expect(sanitizeText('hello    world')).toBe('hello world')
    })

    it('should remove control characters', () => {
      expect(sanitizeText('hello\x00world')).toBe('helloworld')
    })

    it('should keep paragraph breaks but collapse runs of blank lines', () => {
      expect(sanitizeText('One.  \r\n\r\n\n\n  Two.\nThree.')).toBe('One.\n\nTwo.\nThree.')
    })
  })

  describe('extractClientIP', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const headers = new Headers()
      headers.set('x-forwarded-for', '192.168.1.1, 10.0.0.1')
      
      // Create a mock request object
      const request = {
        headers,
        get: (name: string) => headers.get(name),
      } as any
      
      const ip = extractClientIP(request)
      
      expect(ip).toBe('192.168.1.1')
    })

    it('should prioritize cf-connecting-ip', () => {
      const headers = new Headers()
      headers.set('cf-connecting-ip', '1.2.3.4')
      headers.set('x-forwarded-for', '192.168.1.1')
      
      const request = {
        headers,
        get: (name: string) => headers.get(name),
      } as any
      
      const ip = extractClientIP(request)
      
      expect(ip).toBe('1.2.3.4')
    })

    it('should fallback to localhost for invalid IPs', () => {
      const headers = new Headers()
      headers.set('x-forwarded-for', 'invalid-ip')
      
      const request = {
        headers,
        get: (name: string) => headers.get(name),
      } as any
      
      const ip = extractClientIP(request)
      
      expect(ip).toBe('127.0.0.1')
    })
  })

  describe('Schema validation', () => {
    it('textSchema should validate text', () => {
      expect(() => textSchema.parse('Hello')).not.toThrow()
      expect(() => textSchema.parse('')).toThrow()
      expect(() => textSchema.parse('a'.repeat(5001))).toThrow()
    })

    it('voiceIdSchema should validate voice IDs', () => {
      expect(() => voiceIdSchema.parse('voice-123')).not.toThrow()
      expect(() => voiceIdSchema.parse('voice_123')).not.toThrow()
      expect(() => voiceIdSchema.parse('voice 123')).toThrow()
      expect(() => voiceIdSchema.parse('')).toThrow()
    })

    it('speedSchema should validate speed values', () => {
      expect(() => speedSchema.parse(1.0)).not.toThrow()
      expect(() => speedSchema.parse(0.5)).not.toThrow()
      expect(() => speedSchema.parse(2.0)).not.toThrow()
      expect(() => speedSchema.parse(0.4)).toThrow()
      expect(() => speedSchema.parse(2.1)).toThrow()
    })

    it('volumeSchema should validate volume values', () => {
      expect(() => volumeSchema.parse(0.0)).not.toThrow()
      expect(() => volumeSchema.parse(1.0)).not.toThrow()
      expect(() => volumeSchema.parse(0.5)).not.toThrow()
      expect(() => volumeSchema.parse(-0.1)).toThrow()
      expect(() => volumeSchema.parse(1.1)).toThrow()
    })
  })
})
