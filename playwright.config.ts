import { chromium, defineConfig, devices } from '@playwright/test'

export default defineConfig({
	testDir: './e2e',
	globalSetup: './e2e/global-setup.ts',
	use: {
		baseURL: 'http://127.0.0.1:4175/kmai/',
		launchOptions: {
			executablePath: chromium.executablePath(),
		},
		trace: 'retain-on-failure',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
})
