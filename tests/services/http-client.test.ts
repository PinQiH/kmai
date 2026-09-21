import { setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from '@/router'
import { pinia } from '@/stores'
import { useAppStore } from '@/stores/app'
import { HttpError, request } from '@/services/httpClient'

function jsonResponse(body: unknown, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
	} as Response
}

describe('httpClient', () => {
	beforeEach(() => {
		setActivePinia(pinia)
		vi.stubGlobal('fetch', vi.fn())
	})

	afterEach(() => {
		vi.unstubAllGlobals()
		vi.restoreAllMocks()
	})

	it('should call the api base url and return the parsed payload', async () => {
		vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: 'doc-1' }))

		const result = await request<{ id: string }>('/documents/doc-1')

		expect(result).toEqual({ id: 'doc-1' })
		const [url, init] = vi.mocked(fetch).mock.calls[0]!
		expect(url).toBe('/api/documents/doc-1')
		expect((init as RequestInit).credentials).toBe('include')
	})

	it('should send json payloads with the matching content type', async () => {
		vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }))

		await request('/documents', { method: 'POST', json: { title: '差旅辦法' } })

		const [, init] = vi.mocked(fetch).mock.calls[0]!
		expect((init as RequestInit).body).toBe(JSON.stringify({ title: '差旅辦法' }))
		expect((init as RequestInit).headers).toMatchObject({ 'Content-Type': 'application/json' })
	})

	it('should return undefined for an empty response', async () => {
		vi.mocked(fetch).mockResolvedValue({ ok: true, status: 204 } as Response)

		await expect(request('/documents/doc-1', { method: 'DELETE' })).resolves.toBeUndefined()
	})

	it('should raise the message returned by the server', async () => {
		vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: '文件不存在。' }, 404))

		await expect(request('/documents/missing')).rejects.toMatchObject({ status: 404, message: '文件不存在。' })
	})

	it('should fall back to a generic message when the server sends none', async () => {
		vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 500))

		await expect(request('/documents')).rejects.toMatchObject({ status: 500, message: '伺服器處理失敗，請稍後再試。' })
	})

	it('should report connection failures and timeouts as status 0', async () => {
		vi.mocked(fetch).mockRejectedValueOnce(new TypeError('network down'))
		await expect(request('/documents')).rejects.toMatchObject({ status: 0, message: '無法連線到伺服器，請檢查網路後再試。' })

		vi.mocked(fetch).mockRejectedValueOnce(new DOMException('aborted', 'AbortError'))
		await expect(request('/documents')).rejects.toMatchObject({ status: 0, message: '伺服器回應逾時，請稍後再試。' })
	})

	it('should sign the user out and keep the target page when the session expired', async () => {
		const appStore = useAppStore(pinia)
		appStore.isAuthenticated = true
		await router.push('/admin/documents')
		vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 401))

		await expect(request('/admin/documents')).rejects.toBeInstanceOf(HttpError)

		expect(appStore.isAuthenticated).toBe(false)
		// @ 導回登入是非同步的，等路由切換完成
		await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))
		expect(router.currentRoute.value.query.redirect).toBe('/admin/documents')
	})
})
