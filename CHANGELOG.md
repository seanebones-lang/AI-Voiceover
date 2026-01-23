# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive testing infrastructure (Jest + React Testing Library)
- 17 test files with 90+ test cases
- Web Vitals tracking for performance monitoring
- Error boundaries for graceful error handling
- Toast notification system
- Custom hooks (useVoices, useAudioContext)
- Shared constants for emotions and voice effects
- Reusable components (EmotionPicker, VoiceSettings, FileUploadZone)
- Security headers in middleware
- Performance optimizations (React.memo, useMemo, useCallback)
- Code splitting with next/dynamic
- Accessibility improvements (ARIA labels, keyboard navigation)

### Changed
- Updated to Next.js 15
- Migrated to React 18
- Enhanced TypeScript type safety
- Improved component organization
- Optimized bundle size
- Enhanced security (removed hardcoded secrets)

### Fixed
- Memory leaks in AudioContext
- Test environment configuration
- Security vulnerabilities (exposed API keys)
- Performance bottlenecks
- Accessibility issues

## [2.0.0] - 2026-01-22

### Added
- Next.js 15 with App Router
- TypeScript strict mode
- TTS v2 service integration
- Voice cloning with XTTS v2
- Emotion presets (8 emotions)
- Voice effects (reverb, echo, robot, etc.)
- WebSocket streaming support
- Batch processing
- Multi-speaker conversations
- SSML support
- Rate limiting with Upstash Redis
- NextAuth v5 with Google OAuth
- C2PA watermarking
- Consent modals
- Railway deployment support
- Docker containerization

### Changed
- Migrated from Express to Next.js
- Updated to React 18
- Enhanced TypeScript usage
- Improved error handling
- Better security practices

### Fixed
- Audio playback issues
- Memory management
- Error handling
- Security vulnerabilities

## [1.0.0] - 2024-01-15

### Added
- Initial release
- ElevenLabs TTS integration
- Voice cloning
- Multi-format export (MP3, WAV, OGG, FLAC, M4A)
- Batch processing
- Emotion presets
- Analytics dashboard
- Audio caching
- Webhook support
- Stripe integration (optional)

---

## Version History

- **v2.0.0** - Next.js migration, TTS v2, enhanced features
- **v1.0.0** - Initial release with ElevenLabs integration

## Migration Guides

- See `MIGRATION_GUIDE.md` for upgrading from v1.0.0 to v2.0.0
