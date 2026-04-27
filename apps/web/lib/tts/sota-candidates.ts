export interface SotaCandidate {
  id: string
  name: string
  strengths: string[]
  tradeoffs: string[]
  gpuRequired: boolean
  integrationShape: 'python-service' | 'hosted-api'
}

export const SOTA_CLONE_CANDIDATES: SotaCandidate[] = [
  {
    id: 'xtts_v2_current',
    name: 'Coqui XTTS v2 (current stack)',
    strengths: ['Already integrated', 'Multi-language', 'Low migration risk'],
    tradeoffs: ['Clone quality can flatten on noisy references', 'CPU latency can be high'],
    gpuRequired: false,
    integrationShape: 'python-service',
  },
  {
    id: 'cosyvoice2',
    name: 'CosyVoice 2',
    strengths: ['Strong expressive control', 'Good multilingual quality'],
    tradeoffs: ['Migration effort from current XTTS API', 'Higher VRAM demand'],
    gpuRequired: true,
    integrationShape: 'python-service',
  },
  {
    id: 'fish_speech',
    name: 'Fish Speech',
    strengths: ['High naturalness on strong references', 'Community momentum'],
    tradeoffs: ['Operational complexity', 'Heavier runtime and model weights'],
    gpuRequired: true,
    integrationShape: 'python-service',
  },
  {
    id: 'elevenlabs_hosted',
    name: 'ElevenLabs hosted API',
    strengths: ['Top-tier voice quality', 'Minimal infra to operate'],
    tradeoffs: ['Per-character cost', 'Vendor lock-in and external dependency'],
    gpuRequired: false,
    integrationShape: 'hosted-api',
  },
]

