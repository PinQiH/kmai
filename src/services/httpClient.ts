import { router } from '@/router'
import { useAppStore } from '@/stores/app'
import { pinia } from '@/stores'

/*
 * > 後端 API 呼叫
 * @ 目前所有資料仍來自 mocks，這裡先備妥共用設定；repository 串接時改呼叫 request()。
 * !! 逾時、401 導回登入與錯誤訊息一律收斂在這裡，避免每個 repository 各寫一套。
 */

// @ 未設定時走同網域的 /api，方便開發環境以 vite proxy 代理
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'
const DEFAULT_TIMEOUT_MS = 15_000

export class HttpError extends Error {
	constructor(
		/** HTTP 狀態碼；連線失敗或逾時為 0。 */
		readonly status: number,
		message: string,
		/** 後端回傳的錯誤內容，供呼叫端判斷細節。 */
		readonly payload?: unknown,
	) {
		super(message)
		this.name = 'HttpError'
	}
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
	/** 會以 JSON 送出；需要送 FormData 時改用 body。 */
	json?: unknown
	body?: BodyInit | null
	timeoutMs?: number
}

function buildUrl(path: string): string {
	if (/^https?:\/\//.test(path)) return path
	return `${BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

/** 401 代表登入已失效：清掉登入狀態並導回登入頁，保留原本要去的位置。 */
function handleUnauthorized(): void {
	const appStore = useAppStore(pinia)
	if (!appStore.isAuthenticated) return
	appStore.logout()
	const redirect = router.currentRoute.value.fullPath
	void router.replace({ name: 'login', query: redirect === '/' ? {} : { redirect } })
}

/**
 * 呼叫後端 API 並解析 JSON。
 * @param path API 路徑；不以 http 開頭時會接在 base URL 後面。
 * @param options fetch 選項；json 會自動序列化並帶上 Content-Type。
 * @returns 解析後的回應內容；204 等無內容時為 undefined。
 * @throws HttpError 狀態碼非 2xx、逾時或連線失敗時。
 */
export async function request<TResponse>(path: string, options: RequestOptions = {}): Promise<TResponse> {
	const { json, timeoutMs = DEFAULT_TIMEOUT_MS, headers, ...rest } = options
	const controller = new AbortController()
	const timer = window.setTimeout(() => controller.abort(), timeoutMs)

	let response: Response
	try {
		response = await fetch(buildUrl(path), {
			...rest,
			signal: controller.signal,
			credentials: 'include',
			headers: {
				Accept: 'application/json',
				...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
				...headers,
			},
			body: json === undefined ? rest.body : JSON.stringify(json),
		})
	} catch (cause) {
		const isTimeout = cause instanceof DOMException && cause.name === 'AbortError'
		throw new HttpError(0, isTimeout ? '伺服器回應逾時，請稍後再試。' : '無法連線到伺服器，請檢查網路後再試。')
	} finally {
		window.clearTimeout(timer)
	}

	if (response.status === 401) {
		handleUnauthorized()
		throw new HttpError(401, '登入已失效，請重新登入。')
	}

	const payload = response.status === 204 ? undefined : await response.json().catch(() => undefined)
	if (!response.ok) {
		const message = typeof payload === 'object' && payload !== null && 'message' in payload
			? String((payload as { message: unknown }).message)
			: '伺服器處理失敗，請稍後再試。'
		throw new HttpError(response.status, message, payload)
	}

	return payload as TResponse
}
