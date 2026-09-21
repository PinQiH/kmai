import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
	base: '/kmai/',
	plugins: [vue()],
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
		},
	},
	test: {
		environment: 'jsdom',
		include: ['tests/**/*.{test,spec}.ts'],
		// @ 掛載 Vuetify 版面的測試在多 worker 併行時容易超過預設 5 秒；
		//    同時限制 worker 數，避免核心數多的機器互相搶資源反而更慢
		testTimeout: 20_000,
		hookTimeout: 20_000,
		poolOptions: {
			threads: { maxThreads: 8 },
		},
		coverage: {
			all: true,
			include: ['src/**/*.{ts,vue}'],
			exclude: [
				'src/env.d.ts',
				'src/main.ts',
				'src/mocks/**',
				'src/types/**',
			],
			reporter: ['text', 'json-summary'],
			thresholds: {
				branches: 80,
				functions: 50,
				lines: 85,
				statements: 85,
			},
		},
		server: {
			deps: {
				inline: ['vuetify'],
			},
		},
	},
})
