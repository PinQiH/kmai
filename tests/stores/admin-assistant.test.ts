import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
	ASSISTANT_EXPIRY_WARNING_MS,
	ASSISTANT_IDLE_TIMEOUT_MS,
	ASSISTANT_MOCK_RESPONSE_MS,
	useAdminAssistantStore,
} from '../src/stores/adminAssistant'
import { useAssistantAuditStore } from '../src/stores/assistantAudit'
import { useConversationStore } from '../src/stores/conversation'
import { useNotebooksStore } from '../src/stores/notebooks'
import { sanitizeAuditContent } from '../src/utils/assistantAudit'
import { COMPANY_KNOWLEDGE_SOURCES, MODEL_ONLY_SOURCE } from '../src/utils/knowledgeSources'

describe('admin assistant store', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		let id = 0
		vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `assistant-id-${++id}`) })
	})

	it('should keep admin and employee conversation messages isolated', () => {
		const assistantStore = useAdminAssistantStore()
		const conversationStore = useConversationStore()

		assistantStore.messages.push({
			id: 'assistant-message',
			role: 'user',
			content: '後台問題',
			createdAt: '2026-08-31T08:00:00.000Z',
			requestId: 'request-1',
		})

		expect(conversationStore.messages).toHaveLength(0)
	})

	it('should answer model-only questions without citations or web search', async () => {
		vi.useFakeTimers()
		const store = useAdminAssistantStore()

		store.selectKnowledgeSource(MODEL_ONLY_SOURCE)
		store.setWebSearchEnabled(true)
		const request = store.sendMessage({ question: '如何使用這個頁面？', pageTitle: '文件管理', routePath: '/admin/documents' })
		await vi.advanceTimersByTimeAsync(ASSISTANT_MOCK_RESPONSE_MS)
		await request

		expect(store.isWebSearchEnabled).toBe(false)
		expect(store.messages[1]?.citations).toEqual([])
		vi.useRealTimers()
	})

	it('should preserve source snapshot and audit data after expiring visible state', async () => {
		vi.useFakeTimers()
		const store = useAdminAssistantStore()
		const auditStore = useAssistantAuditStore()
		store.selectKnowledgeSource(COMPANY_KNOWLEDGE_SOURCES[0]!)

		const request = store.sendMessage({ question: '文件怎麼處理？', pageTitle: '文件管理', routePath: '/admin/documents' })
		await vi.advanceTimersByTimeAsync(ASSISTANT_MOCK_RESPONSE_MS)
		await request
		const sessionId = store.activeSessionId
		expect(sessionId).not.toBeNull()

		store.expireSession(Date.now() + ASSISTANT_IDLE_TIMEOUT_MS)

		expect(store.messages).toHaveLength(0)
		expect(store.activeSessionId).toBeNull()
		expect(auditStore.getSessionById(sessionId!)?.status).toBe('expired')
		expect(auditStore.getSessionById(sessionId!)?.messages[0]?.sourceId).toBe('company')
		vi.useRealTimers()
	})

	it('should warn at sixty seconds and restart the deadline when continuing', () => {
		const store = useAdminAssistantStore()
		store.startSession('2026-08-31T08:00:00.000Z')
		const now = Date.parse('2026-08-31T08:10:00.000Z')
		store.expiresAt = now + ASSISTANT_EXPIRY_WARNING_MS

		store.updateExpiryState(now)
		expect(store.isExpiryWarningVisible).toBe(true)

		store.continueSession(now)
		expect(store.isExpiryWarningVisible).toBe(false)
		expect(store.expiresAt).toBe(now + ASSISTANT_IDLE_TIMEOUT_MS)
	})

	it('should cancel a pending response without allowing a late write', async () => {
		vi.useFakeTimers()
		const store = useAdminAssistantStore()
		const auditStore = useAssistantAuditStore()
		const request = store.sendMessage({ question: '通知怎麼設定？', pageTitle: '通知管理', routePath: '/admin/notifications' })
		const sessionId = store.activeSessionId

		store.endSession('leave_admin')
		await vi.advanceTimersByTimeAsync(ASSISTANT_MOCK_RESPONSE_MS)
		await request

		expect(store.messages).toHaveLength(0)
		expect(auditStore.getSessionById(sessionId!)?.status).toBe('cancelled')
		expect(auditStore.getSessionById(sessionId!)?.messages).toHaveLength(1)
		vi.useRealTimers()
	})

	it('should block a notebook that becomes empty after selection', async () => {
		const store = useAdminAssistantStore()
		const notebooksStore = useNotebooksStore()
		const notebook = notebooksStore.notebooks.find((item) => item.id === 'notebook-product')!
		store.selectKnowledgeSource({
			id: notebook.id,
			name: notebook.name,
			description: '個人筆記本 · 1 份文件',
			kind: 'notebook',
			defaultWebSearchEnabled: true,
			supportsWebSearch: true,
			documentCount: 1,
		})
		notebook.documents = []

		await store.sendMessage({ question: '請整理重點', pageTitle: '文件管理', routePath: '/admin/documents' })

		expect(store.messages).toHaveLength(0)
		expect(store.errorMessage).toContain('目前沒有文件')
	})

	it('should restart expiry and mark a failed session when the response rejects', async () => {
		const timeoutSpy = vi.spyOn(window, 'setTimeout').mockImplementation(() => {
			throw new Error('Mock timer failure')
		})
		const store = useAdminAssistantStore()
		const auditStore = useAssistantAuditStore()

		await store.sendMessage({ question: '產生通知範本', pageTitle: '通知管理', routePath: '/admin/notifications' })
		const sessionId = store.activeSessionId!

		expect(store.expiresAt).not.toBeNull()
		expect(store.errorMessage).toContain('暫時無法回答')
		store.endSession('manual_end')
		expect(auditStore.getSessionById(sessionId)?.status).toBe('failed')
		timeoutSpy.mockRestore()
	})
})

describe('assistant audit sanitizer', () => {
	it('should preserve ordinary content and redact explicit secret fields', () => {
		const ordinary = sanitizeAuditContent('請協助產品企劃部調整通知。')
		const secret = sanitizeAuditContent('密碼：example-pass API_KEY=example-key Authorization: Bearer example.token')
		const jsonSecret = sanitizeAuditContent('{"password":"example secret value","api_key":"example-json-key","access_token":"example-json-token"}')

		expect(ordinary.content).toBe('請協助產品企劃部調整通知。')
		expect(ordinary.redactedFields).toEqual([])
		expect(secret.content).not.toContain('example-pass')
		expect(secret.content).not.toContain('example-key')
		expect(secret.content).not.toContain('example.token')
		expect(secret.content).toContain('[已遮蔽機密]')
		expect(secret.redactedFields).toEqual(expect.arrayContaining(['password', 'api-key', 'bearer-token']))
		expect(jsonSecret.content).not.toContain('example secret value')
		expect(jsonSecret.content).not.toContain('example-json-key')
		expect(jsonSecret.content).not.toContain('example-json-token')
		expect(jsonSecret.redactedFields).toEqual(expect.arrayContaining(['password', 'api-key', 'access-token']))
	})
})
