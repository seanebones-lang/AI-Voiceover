// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Polyfill Request/Headers/Response for NextRequest in API route tests (Jest does not have these in node/jsdom)
if (typeof global.Request === 'undefined') {
  try {
    const { Request, Headers } = require('undici')
    global.Request = Request
    global.Headers = Headers
  }   catch {
    class MockHeaders {
      constructor(init = {}) { this._headers = typeof init === 'object' && init !== null ? { ...init } : {} }
      get(n) { return this._headers[n.toLowerCase()] ?? null }
      set(n, v) { this._headers[n.toLowerCase()] = String(v) }
      entries() { return Object.entries(this._headers)[Symbol.iterator]() }
    }
    class MockRequest {
      constructor(input, init = {}) {
        this._url = typeof input === 'string' ? input : input.url
        this._method = (init.method || 'GET').toUpperCase()
        this.headers = new MockHeaders(init.headers || {})
        this.body = init.body
      }
      get url() { return this._url }
      get method() { return this._method }
      json() {
        const b = this.body
        return Promise.resolve(typeof b === 'string' ? JSON.parse(b) : {})
      }
    }
    global.Request = MockRequest
    global.Headers = MockHeaders
  }
}
if (typeof global.Response === 'undefined') {
  global.Response = class Response {
    constructor(body, init = {}) {
      this.body = body
      this._jsonData = null
      this.status = init.status ?? 200
      this.headers = (global.Headers && new global.Headers(init.headers)) || {}
    }
    json() {
      return Promise.resolve(
        this._jsonData != null
          ? this._jsonData
          : (typeof this.body === 'string' ? JSON.parse(this.body) : {})
      )
    }
    static json(data, init = {}) {
      const r = new global.Response(JSON.stringify(data), {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
      })
      r._jsonData = data
      return r
    }
  }
}

// JSDOM lacks pointer capture APIs required by Radix Select
if (typeof global.Element !== 'undefined' && !global.Element.prototype.hasPointerCapture) {
  global.Element.prototype.hasPointerCapture = function () { return false }
  global.Element.prototype.setPointerCapture = function () {}
  global.Element.prototype.releasePointerCapture = function () {}
}
// JSDOM lacks scrollIntoView (Radix Select calls it)
if (typeof global.Element !== 'undefined' && typeof global.Element.prototype.scrollIntoView !== 'function') {
  global.Element.prototype.scrollIntoView = function () {}
}
// JSDOM lacks ResizeObserver (Radix Slider uses it)
if (typeof global.ResizeObserver === 'undefined') {
  global.ResizeObserver = class ResizeObserver {
    observe = jest.fn()
    unobserve = jest.fn()
    disconnect = jest.fn()
  }
}

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

// Mock window.matchMedia (only in jsdom)
if (typeof window !== 'undefined') {
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
