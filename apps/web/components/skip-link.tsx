'use client'

/**
 * SkipLink Component
 * Provides keyboard users with a way to skip to main content
 */
import React from 'react'

export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-purple-600 focus:text-white focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
    >
      Skip to main content
    </a>
  )
}
