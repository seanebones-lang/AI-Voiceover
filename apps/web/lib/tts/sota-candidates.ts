export interface SotaCandidate {
  id: string
  name: string
  strengths: string[]
  tradeoffs: string[]
  gpuRequired: boolean
  /** All candidates are self-hosted; nothing here is a hosted third-party API. */
  integrationShape: 'python-service'
  license: string
}

/** Engines in use (current) and self-hosted alternatives worth evaluating for cloned voices. */
export const SOTA_CLONE_CANDIDATES: SotaCandidate[] = [
  {
    id: 'xtts_v2_current',
    name: 'Coqui XTTS v2 via coqui-tts (current: cloned + studio voices)',
    strengths: ['Already integrated', '17 languages', 'Cached speaker latents; zero-shot from 6+ s of audio'],
    tradeoffs: ['CPU latency is 1-3x real time', 'Non-commercial model license'],
    gpuRequired: false,
    integrationShape: 'python-service',
    license: 'Coqui Public Model License (non-commercial)',
  },
  {
    id: 'kokoro_current',
    name: 'Kokoro-82M (current: stock voices)',
    strengths: ['Very fast on CPU', 'High naturalness for its size', 'Inline phoneme control'],
    tradeoffs: ['No voice cloning', 'No German or Korean voices'],
    gpuRequired: false,
    integrationShape: 'python-service',
    license: 'Apache-2.0',
  },
  {
    id: 'chatterbox',
    name: 'Chatterbox (Resemble AI)',
    strengths: ['Zero-shot cloning with emotion exaggeration control', 'Permissive license'],
    tradeoffs: ['Strongest in English; multilingual model is newer', 'Benefits from a GPU'],
    gpuRequired: false,
    integrationShape: 'python-service',
    license: 'MIT',
  },
  {
    id: 'cosyvoice',
    name: 'CosyVoice 2',
    strengths: ['Strong expressive control', 'Good multilingual quality', 'Streaming'],
    tradeoffs: ['Migration effort from the XTTS API', 'Higher VRAM demand'],
    gpuRequired: true,
    integrationShape: 'python-service',
    license: 'Apache-2.0',
  },
  {
    id: 'f5_tts',
    name: 'F5-TTS',
    strengths: ['High naturalness and prosody from short references'],
    tradeoffs: ['Released weights are non-commercial', 'GPU recommended'],
    gpuRequired: true,
    integrationShape: 'python-service',
    license: 'CC-BY-NC-4.0 (weights)',
  },
]
