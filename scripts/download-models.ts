#!/usr/bin/env tsx
/**
 * Download Piper TTS models for offline TTS
 * Models are downloaded from Hugging Face
 */

import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import { pipeline } from 'stream/promises'

const MODELS_DIR = path.join(process.cwd(), 'models', 'piper')
const MODELS = [
  {
    name: 'en_US-amy-medium',
    url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx',
    size: 45 * 1024 * 1024, // ~45MB
  },
  {
    name: 'en_US-lessac-medium',
    url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx',
    size: 45 * 1024 * 1024,
  },
  {
    name: 'en_GB-alan-medium',
    url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/medium/en_GB-alan-medium.onnx',
    size: 45 * 1024 * 1024,
  },
]

async function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        return downloadFile(response.headers.location!, dest).then(resolve).catch(reject)
      }
      
      if (response.statusCode !== 200) {
        file.close()
        fs.unlinkSync(dest)
        reject(new Error(`Failed to download: ${response.statusCode}`))
        return
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10)
      let downloaded = 0

      response.on('data', (chunk) => {
        downloaded += chunk.length
        const percent = ((downloaded / totalSize) * 100).toFixed(1)
        process.stdout.write(`\rDownloading: ${percent}%`)
      })

      response.pipe(file)
      
      file.on('finish', () => {
        file.close()
        console.log(`\n✓ Downloaded: ${path.basename(dest)}`)
        resolve()
      })
    }).on('error', (err) => {
      file.close()
      fs.unlinkSync(dest)
      reject(err)
    })
  })
}

async function main() {
  console.log('🎙️  Downloading Piper TTS models...\n')

  // Create models directory
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true })
  }

  for (const model of MODELS) {
    const destPath = path.join(MODELS_DIR, `${model.name}.onnx`)
    
    // Skip if already exists
    if (fs.existsSync(destPath)) {
      const stats = fs.statSync(destPath)
      if (stats.size > model.size * 0.9) {
        console.log(`⏭️  Skipping ${model.name} (already exists)`)
        continue
      }
    }

    console.log(`📥 Downloading ${model.name}...`)
    try {
      await downloadFile(model.url, destPath)
    } catch (error) {
      console.error(`❌ Failed to download ${model.name}:`, error)
      process.exit(1)
    }
  }

  console.log('\n✅ All models downloaded successfully!')
  console.log(`📁 Models location: ${MODELS_DIR}`)
}

main().catch(console.error)
