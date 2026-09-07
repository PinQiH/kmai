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
