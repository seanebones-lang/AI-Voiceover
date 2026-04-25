// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'
import { TextDecoder, TextEncoder } from 'node:util'
import { ReadableStream, TransformStream, WritableStream } from 'node:stream/web'
import { MessageChannel, MessagePort } from 'node:worker_threads'

if (!global.TextEncoder) global.TextEncoder = TextEncoder
if (!global.TextDecoder) global.TextDecoder = TextDecoder
if (!global.ReadableStream) global.ReadableStream = ReadableStream
if (!global.WritableStream) global.WritableStream = WritableStream
if (!global.TransformStream) global.TransformStream = TransformStream
if (!global.MessagePort) global.MessagePort = MessagePort
if (!global.MessageChannel) global.MessageChannel = MessageChannel

const {
  fetch: undiciFetch,
  Headers,
  Request,
  Response,
  FormData,
  File,
} = require('undici')

if (!global.fetch) global.fetch = undiciFetch
if (!global.Headers) global.Headers = Headers
if (!global.Request) global.Request = Request
if (!global.Response) global.Response = Response
if (!global.FormData) global.FormData = FormData
if (!global.File) global.File = File

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
    }
  },
  usePathname() {
    return '/'
  },
  useSearchParams() {
    return new URLSearchParams()
  },
}))

// Mock window.matchMedia
if (typeof window !== 'undefined') {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = jest.fn()
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = jest.fn(() => false)
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = jest.fn()
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = jest.fn()
  }

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  })
}

if (!global.ResizeObserver) {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// Mock AudioContext
global.AudioContext = jest.fn().mockImplementation(() => ({
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
}))

// Mock Web Audio API
global.AnalyserNode = jest.fn()

