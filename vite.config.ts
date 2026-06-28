import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
	plugins: [
		vue(),
		viteStaticCopy({
			targets: [
				{
					src: 'node_modules/pdfjs-dist/standard_fonts/*',
					dest: 'standard-fonts',
				},
			],
		}),
		// Group H: PWA + offline shell. Workbox precaches the app shell and
		// PDF.js worker; runtime-caches PDF.js standard fonts and Tesseract
		// CDN assets.
		VitePWA({
			registerType: 'autoUpdate',
			injectRegister: false,
			includeAssets: [
				'icons/favicon.svg',
				'icons/icon-192.png',
				'icons/icon-512.png',
				'icons/icon-512-maskable.png',
			],
			manifest: {
				name: 'Notebook',
				short_name: 'Notebook',
				description: 'Read PDFs, chat with their contents, fully on-device.',
				theme_color: '#4f46e5',
				background_color: '#ffffff',
				display: 'standalone',
				scope: '/',
				start_url: '/',
				icons: [
					{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
					{
						src: '/icons/icon-512-maskable.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable',
					},
				],
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,woff2,ttf,json,svg,png}'],
				// PDF.js worker is ~1.1MB; the default 2MiB precache ceiling
				// would skip it.
				maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
				// Skip the heavy lazy chunks from the precache — they're loaded
				// on demand and runtime-cached on first network use.
				globIgnores: ['**/cl100k_base-*.js', '**/index-*.js.map'],
				runtimeCaching: [
					{
						// PDF.js standard fonts served from public/standard-fonts/
						urlPattern: /\/standard-fonts\//,
						handler: 'CacheFirst',
						options: {
							cacheName: 'pdfjs-standard-fonts',
							expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 },
						},
					},
					{
						// Tesseract.js fetches its core + traineddata from unpkg.
						urlPattern:
							/^https:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net)\/.*tesseract/i,
						handler: 'CacheFirst',
						options: {
							cacheName: 'tesseract-cdn',
							expiration: { maxAgeSeconds: 60 * 60 * 24 * 30 },
							cacheableResponse: { statuses: [0, 200] },
						},
					},
				],
			},
			devOptions: {
				enabled: false,
			},
		}),
	],
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
		},
	},
	server: { port: 5173, open: false },
	build: {
		sourcemap: true,
		target: 'es2022',
		// Raise the warning limit to cover:
		//   • cl100k_base (974KB) — lazy-loaded tokenizer vocab, doesn't affect initial bundle
		//   • pdf.worker.min (1.08MB) — copied as a worker asset, not loaded on main thread
		chunkSizeWarningLimit: 1100,
		rollupOptions: {
			onwarn(warning, warn) {
				// pdfjs-dist@3 uses eval internally for worker bootstrapping — nothing we
				// can do until we upgrade to pdfjs@5+.  Suppress to keep build output clean.
				if (warning.code === 'EVAL' && warning.id?.includes('pdfjs-dist')) return
				warn(warning)
			},
			output: {
				// Split heavy vendor libs out of index.js so each chunk stays under 500KB.
				manualChunks: {
					'vendor-katex': ['katex'],
					'vendor-db': ['dexie'],
					'vendor-md': ['marked', 'dompurify'],
					'vendor-search': ['minisearch'],
				},
			},
		},
	},
	test: {
		globals: true,
		environment: 'jsdom',
		setupFiles: ['./tests/setup.ts'],
		coverage: { reporter: ['text', 'html'] },
	},
})
