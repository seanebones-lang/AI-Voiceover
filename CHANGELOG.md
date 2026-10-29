# Changelog

All notable changes to this project are documented in this file.

## [4.0.0] - 2026-10-29

Every voice now runs on self-hosted models; the app makes no third-party TTS API calls.

### Removed
- xAI Grok voice integration (Eve, Ara, Rex, Sal, Leo), `XAI_API_KEY`, the `tts_xai` health capability and x.ai/OpenAI CSP entries.
- Microsoft Edge TTS for stock voices (`edgeTtsService`, `edge-tts-universal`, Python `edge-tts`).
- Dead code and dependencies: `openai`, `onnxruntime-node` + Piper stub, `ws`, unused `lib/tts-v2` and `xtts-client`.

### Added
- Kokoro-82M (Apache-2.0) stock voices in the voice service; legacy voice IDs keep working. XTTS studio speakers cover German, Korean and French male; new Hindi voices and four multilingual studio voices (34 stock voices total).
- `output_format` (`wav` | `mp3`) on `/api/tts`, `/api/tts-v2` and the voice service; dashboard format picker.
- `[pause]`, `[pause:short|medium|long]` and blank lines render as real silence; `[ipa:word|phonemes]` becomes inline phonemes on Kokoro voices.
- Voice service: `GET /stock-voices`, `GET /voices/{id}`, `PUT /voices/{id}/tuning`, per-engine readiness in `/health`.
- Worker renders queued `tts` jobs for long scripts (split into parts, MP3 result); unsupported job types now fail clearly instead of reporting fake success.
- Model weights are baked into the voice-service images; runtime is forced offline (`HF_HUB_OFFLINE=1`).
- Python unit tests for text/audio helpers (`services/xtts/tests`).

### Changed — cloned voice quality
- Conditioning latents are computed once per voice from all cleaned takes (30 s balanced window instead of the first 10 s of each file) and cached on disk; existing voices migrate automatically on first use.
- Reference cleanup on upload: rumble filter, optional denoise, dead-air trim, long-pause compression, peak normalization; noisy takes are excluded when cleaner ones exist.
- Runaway-generation guard: implausible segment durations are re-sampled with tighter repetition control.
- Language-aware chunking that respects XTTS per-language limits (fixes truncated Chinese/Japanese/Korean output) and splits on CJK punctuation.
- Retuned presets (natural 0.70/4.0, expressive, stable); the dashboard only sends raw sampling values when the advanced panel is open.
- Native XTTS speed control, level-matched seams with fades, tail-artifact removal, loudness normalization to -19 LUFS.
- Benchmarked on LibriSpeech speaker 1272 with Whisper + ECAPA: WER 21% → 3.6%, speaker similarity 0.54 → 0.62, no hallucinated babble on short lines.

### Fixed
- `deep`/`chipmunk` effects assumed 44.1 kHz on 24 kHz audio (deep actually raised pitch); pitch shift now preserves formants (rubberband).
- "Reverb" was a single slapback echo; now a synthetic room impulse response.
- Inference no longer blocks the voice service event loop (health checks and voice listing stay responsive during long jobs).
- Pronunciation overrides are applied in one pass (a rule no longer rewrites another rule's output) and match non-ASCII words.
- Newlines were collapsed before synthesis, so paragraphs ran together.
- Downloads were always named `.mp3` even when the audio was WAV.

## [3.0.0] - 2026-04-24

### Added
- Workspace monorepo structure with `apps/web`, `apps/workers`, and shared packages under `packages/*`.
- New shared packages:
  - `@ai-voiceover/contracts` (typed contracts, RBAC mapping)
  - `@ai-voiceover/db` (Drizzle schema/client)
  - `@ai-voiceover/auth` (Clerk verification + permission helpers)
  - `@ai-voiceover/billing` (Stripe client/webhook + entitlement mapping)
- New API routes in `apps/web`:
  - `/api/webhooks/clerk`
  - `/api/webhooks/stripe`
  - `/api/voice-jobs`
- Clerk auth pages and wiring:
  - `/login`
  - `/sign-up`
- Documentation:
  - `docs/ENTERPRISE_DEFAULTS.md`
  - `docs/MONOREPO.md`
  - `docs/LAUNCH_CHECKLIST.md`

### Changed
- Migrated app layout from root-level Next.js files to `apps/web`.
- Migrated auth from NextAuth route to Clerk-based flow.
- Updated Docker and CI for monorepo/workspace-aware build/test.
- Updated CSP and media playback handling for production audio reliability.
- Improved UI error surfacing for TTS failures (shows `details`, `hint`, `requestId` when available).
- Replaced deprecated Next.js `middleware.ts` convention with `proxy.ts`.

### Fixed
- `Button` now correctly handles `asChild` without leaking invalid DOM props.
- Effects processing path now routes through XTTS sidecar when effects are requested.
- XTTS local runtime setup reliability:
  - dependency compatibility pinning (`TTS`, `transformers`, `torch`, `torchaudio`)
  - writable local `VOICES_DIR` fallback
  - corrected startup verification logic for multi-speaker XTTS
- Cloned voice long-form reliability:
  - adaptive timeout logic in `/api/tts`
  - automatic long-text chunking and server-side WAV stitching in XTTS service

### Breaking
- Project structure changed to monorepo; root-level app/config paths moved under `apps/web`.
- Environment variable requirements changed/expanded for Clerk, Stripe, DB/Redis, and XTTS.
- Legacy auth route `app/api/auth/[...nextauth]/route.ts` removed.
- Root-level `middleware.ts` and `next.config.js` removed in favor of `apps/web/proxy.ts` and `apps/web/next.config.js`.
