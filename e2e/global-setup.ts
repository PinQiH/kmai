import { build, preview } from 'vite'

/*
 * > E2E 伺服器
 * @ 先建置再以 preview 提供靜態產出，而不是直接跑 dev server：
 *   dev server 會在原始碼變動時重新編譯，測試期間頁面可能載入不及而逾時。
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
	await build({ logLevel: 'warn' })

	const server = await preview({
		preview: {
			host: '127.0.0.1',
			port: 4175,
			strictPort: true,
		},
	})

	return async () => {
		await new Promise<void>((resolve, reject) => {
			server.httpServer.close((error) => (error ? reject(error) : resolve()))
		})
	}
}
