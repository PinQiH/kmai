import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useAsyncData } from '@/composables/useAsyncData'

function deferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (reason: unknown) => void
	const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
	return { promise, resolve, reject }
}

describe('useAsyncData', () => {
	it('should expose the initial value while loading and the data afterwards', async () => {
		const pending = deferred<string[]>()
		const state = useAsyncData(() => pending.promise, { initialValue: [] as string[] })

		expect(state.isLoading.value).toBe(true)
		expect(state.data.value).toEqual([])

		pending.resolve(['文件 A'])
		await nextTick()

		expect(state.isLoading.value).toBe(false)
		expect(state.data.value).toEqual(['文件 A'])
		expect(state.errorMessage.value).toBe('')
	})

	it('should keep the error message and allow retrying', async () => {
		const loader = vi.fn()
			.mockRejectedValueOnce(new Error('伺服器處理失敗，請稍後再試。'))
			.mockResolvedValueOnce(['文件 A'])
		const state = useAsyncData(loader, { initialValue: [] as string[] })
		await vi.waitFor(() => expect(state.isLoading.value).toBe(false))

		expect(state.errorMessage.value).toBe('伺服器處理失敗，請稍後再試。')

		await state.reload()

		expect(state.errorMessage.value).toBe('')
		expect(state.data.value).toEqual(['文件 A'])
	})

	it('should use the custom error message when given', async () => {
		const state = useAsyncData(() => Promise.reject(new Error('原始訊息')), {
			initialValue: null,
			errorMessage: () => '目前無法載入文件清單。',
		})

		await vi.waitFor(() => expect(state.errorMessage.value).toBe('目前無法載入文件清單。'))
	})

	it('should fall back to a generic message for errors without one', async () => {
		const state = useAsyncData(() => Promise.reject('壞掉了'), { initialValue: null })

		await vi.waitFor(() => expect(state.errorMessage.value).toBe('載入失敗，請稍後再試。'))
	})

	it('should not load until asked when immediate is off', async () => {
		const loader = vi.fn().mockResolvedValue('內容')
		const state = useAsyncData(loader, { initialValue: '', immediate: false })

		expect(loader).not.toHaveBeenCalled()
		expect(state.isLoading.value).toBe(false)

		await state.reload()

		expect(state.data.value).toBe('內容')
	})

	it('should ignore a stale response that arrives after a newer one', async () => {
		const first = deferred<string>()
		const second = deferred<string>()
		const loader = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
		const state = useAsyncData(loader, { initialValue: '', immediate: false })

		void state.reload()
		void state.reload()
		second.resolve('新結果')
		await nextTick()
		first.resolve('舊結果')
		await nextTick()

		expect(state.data.value).toBe('新結果')
		expect(state.isLoading.value).toBe(false)
	})
})
