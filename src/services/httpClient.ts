import { router } from '@/router'
import { useAppStore } from '@/stores/app'
import { pinia } from '@/stores'

/*
 * > 後端 API 呼叫
 * @ 對應 kmai/apps/api：Express 掛載於 /api/v2，以 session cookie 驗證，
 *   回應一律為 { success, data, meta, error } 信封格式。
 * !! 逾時、401 導回登入與錯誤訊息一律收斂在這裡，避免每個 repository 各寫一套。
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v2'
const DEFAULT_TIMEOUT_MS = 15_000

/** 後端回應信封；成功時 data 有值，失敗時 error 有值。 */
interface ApiEnvelope<TData> {
	success: boolean
	data: TData | null
	meta?: Record<string, unknown>
	error?: { code: string; message: string; trace_id?: string } | null
}

export class HttpError extends Error {
	constructor(
		/** HTTP 狀態碼；連線失敗或逾時為 0。 */
		readonly status: number,
		message: string,
		/** 後端的錯誤代碼，例如 DOCUMENT_NOT_FOUND；連線層錯誤為空字串。 */
		readonly code = '',
		/** 對應後端日誌的追蹤碼，回報問題時附上。 */
		readonly traceId?: string,
	) {
		super(message)
		this.name = 'HttpError'
	}
}

export type QueryValue = string | number | boolean | undefined | null

export interface RequestOptions extends Omit<RequestInit, 'body'> {
	/** 會以 JSON 送出；需要送 FormData 時改用 body。 */
	json?: unknown
	body?: BodyInit | null
	/** 查詢參數；undefined 與 null 會略過。 */
	query?: Record<string, QueryValue>
	timeoutMs?: number
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
	const base = /^https?:\/\//.test(path) ? path : `${BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
	if (!query) return base
	const search = new URLSearchParams()
	for (const [key, value] of Object.entries(query)) {
		if (value === undefined || value === null) continue
		search.append(key, String(value))
	}
	const queryString = search.toString()
	return queryString ? `${base}${base.includes('?') ? '&' : '?'}${queryString}` : base
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
 * 呼叫後端 API 並取出信封內的 data。
 * @param path API 路徑；不以 http 開頭時會接在 /api/v2 後面。
 * @param options fetch 選項；json 會自動序列化，query 會組成查詢字串。
 * @returns 信封中的 data；204 等無內容時為 undefined。
 * @throws HttpError 狀態碼非 2xx、後端回報失敗、逾時或連線失敗時。
 */
export async function request<TResponse>(path: string, options: RequestOptions = {}): Promise<TResponse> {
	const { json, query, timeoutMs = DEFAULT_TIMEOUT_MS, headers, ...rest } = options
	const controller = new AbortController()
	const timer = window.setTimeout(() => controller.abort(), timeoutMs)

	let response: Response
	try {
		response = await fetch(buildUrl(path, query), {
			...rest,
			signal: controller.signal,
			// @ 後端以 session cookie 驗證，跨來源時也要帶上
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
		throw new HttpError(401, '登入已失效，請重新登入。', 'UNAUTHORIZED')
	}

	const envelope = response.status === 204
		? undefined
		: await response.json().catch(() => undefined) as ApiEnvelope<TResponse> | undefined

	if (!response.ok || envelope?.success === false) {
		const error = envelope?.error
		throw new HttpError(
			response.status,
			error?.message ?? '伺服器處理失敗，請稍後再試。',
			error?.code ?? '',
			error?.trace_id,
		)
	}

	return envelope?.data as TResponse
}
