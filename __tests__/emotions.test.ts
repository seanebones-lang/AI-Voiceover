import { describe, it, expect } from '@jest/globals'
import { synthesizeTTS } from '../lib/tts_v2/xtts'

describe('Emotions & Style', () => {
  it('synthesizeTTS directs to XTTS service', async () => {
    await expect(
      synthesizeTTS('test', Buffer.from('sample'), { emotion: 'happy' })
    ).rejects.toThrow('XTTS')
  })

  it('synthesizeTTS rejects with options', async () => {
    await expect(
      synthesizeTTS('test', Buffer.from('sample'), { speed: 1.5, pitch: 1.1 })
    ).rejects.toThrow()
  })
})