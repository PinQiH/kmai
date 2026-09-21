import { describe, expect, it, vi } from 'vitest'

import { getDocumentById, searchDocuments } from '../src/repositories/knowledge.repository'

describe('knowledge repository', () => {
	it('should return published documents when query is empty', async () => {
		vi.useFakeTimers()
		const request = searchDocuments('')
		await vi.runAllTimersAsync()
		const results = await request

		expect(results.length).toBeGreaterThan(0)
		expect(results.every((document) => document.status === '已發布')).toBe(true)
		vi.useRealTimers()
	})

	it('should match document tags when query is provided', async () => {
		vi.useFakeTimers()
		const request = searchDocuments('差旅')
		await vi.runAllTimersAsync()
		const results = await request

		expect(results).toHaveLength(1)
		expect(results[0]?.title).toContain('差旅')
		vi.useRealTimers()
	})

	it('should return undefined when document does not exist', async () => {
		vi.useFakeTimers()
		const request = getDocumentById('missing-document')
		await vi.runAllTimersAsync()

		await expect(request).resolves.toBeUndefined()
		vi.useRealTimers()
	})

	it('should return a defensive copy of source metadata', async () => {
		vi.useFakeTimers()
		const firstRequest = getDocumentById('doc-002')
		await vi.runAllTimersAsync()
		const firstDocument = await firstRequest
		expect(firstDocument?.source.type).toBe('text')
		if (firstDocument?.source.type === 'text') firstDocument.source.content = '外部修改'

		const secondRequest = getDocumentById('doc-002')
		await vi.runAllTimersAsync()
		const secondDocument = await secondRequest
		expect(secondDocument?.source.type === 'text' ? secondDocument.source.content : '').not.toBe('外部修改')
		vi.useRealTimers()
	})

	it('should hide unpublished or restricted documents from employees', async () => {
		vi.useFakeTimers()
		const searchRequest = searchDocuments('客戶資料')
		const detailRequest = getDocumentById('doc-003')
		await vi.runAllTimersAsync()

		await expect(searchRequest).resolves.toHaveLength(0)
		await expect(detailRequest).resolves.toBeUndefined()
		vi.useRealTimers()
	})
})
