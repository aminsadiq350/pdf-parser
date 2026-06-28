#!/usr/bin/env node
/**
 * Group H: one-off icon generator. Reads public/icons/source.svg and emits:
 *   - icon-192.png            (Android install)
 *   - icon-512.png            (PWA install dialog / splash)
 *   - icon-512-maskable.png   (10% safe-zone padding for adaptive icons)
 *
 * Run on demand with `npm run icons`. Not wired into the build because the
 * source rarely changes and we don't want sharp on the critical path.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const iconsDir = resolve(here, '..', 'public', 'icons')

async function main() {
  const svg = await readFile(resolve(iconsDir, 'source.svg'))

  // Standard variants — render the SVG directly at the target dimensions.
  await sharp(svg).resize(192, 192).png().toFile(resolve(iconsDir, 'icon-192.png'))
  console.log('wrote icon-192.png')
  await sharp(svg).resize(512, 512).png().toFile(resolve(iconsDir, 'icon-512.png'))
  console.log('wrote icon-512.png')

  // Maskable: 10% safe zone all around. Render to ~410x410 and composite
  // onto a 512x512 indigo background so the centre stays safe even when
  // Android crops to a circle / squircle.
  const innerSize = 410
  const inner = await sharp(svg).resize(innerSize, innerSize).png().toBuffer()
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: '#4f46e5',
    },
  })
    .composite([
      {
        input: inner,
        top: Math.round((512 - innerSize) / 2),
        left: Math.round((512 - innerSize) / 2),
      },
    ])
    .png()
    .toFile(resolve(iconsDir, 'icon-512-maskable.png'))
  console.log('wrote icon-512-maskable.png')

  // Copy source as favicon for completeness — already committed but allow
  // regeneration to keep the two files in sync.
  await writeFile(resolve(iconsDir, 'favicon.svg'), svg)
  console.log('synced favicon.svg from source')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
