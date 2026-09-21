import { ref, shallowRef, type Ref, type ShallowRef } from 'vue'

/*
 * > 非同步資料的三態
 * @ 頁面共用：載入中、錯誤（含重試）與資料本身，並自動忽略過期的請求結果。
 * @ 錯誤訊息預設取 Error.message（httpClient 已整理為可直接顯示的句子），
 *   需要頁面專屬說法時用 errorMessage 覆寫。
 */

export interface AsyncDataOptions<TData> {
	/** 尚未載入完成前顯示的值。 */
	initialValue: TData
	/** 是否在建立時立即載入；需要等條件成立時設為 false。 */
	immediate?: boolean
	/** 自訂錯誤訊息；省略時使用錯誤本身的訊息。 */
	errorMessage?: (error: unknown) => string
}

export interface AsyncData<TData> {
	data: ShallowRef<TData>
	isLoading: Ref<boolean>
	errorMessage: Ref<string>
	/** 重新載入；重複呼叫時只採用最後一次的結果。 */
	reload: () => Promise<void>
}

function describeError(error: unknown): string {
	if (error instanceof Error && error.message) return error.message
	return '載入失敗，請稍後再試。'
}

/**
 * 載入非同步資料並維護三態。
 * @param loader 取得資料的函式。
 * @param options 初始值與載入時機。
 * @returns 資料、載入中、錯誤訊息與重新載入。
 */
export function useAsyncData<TData>(loader: () => Promise<TData>, options: AsyncDataOptions<TData>): AsyncData<TData> {
	const data = shallowRef(options.initialValue) as ShallowRef<TData>
	const isLoading = ref(false)
	const errorMessage = ref('')
	let latestRequestId = 0

	async function reload(): Promise<void> {
		const requestId = ++latestRequestId
		isLoading.value = true
		errorMessage.value = ''
		try {
			const result = await loader()
			// @ 期間又發過新的請求，舊結果直接丟掉，避免畫面跳回舊資料
			if (requestId !== latestRequestId) return
			data.value = result
		} catch (error) {
			if (requestId !== latestRequestId) return
			errorMessage.value = options.errorMessage?.(error) ?? describeError(error)
		} finally {
			if (requestId === latestRequestId) isLoading.value = false
		}
	}

	if (options.immediate !== false) void reload()

	return { data, isLoading, errorMessage, reload }
}
