import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useConversationStore } from '../src/stores/conversation'

describe('conversation store', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `message-${Math.random()}`) })
	})

	it('should ignore blank questions', async () => {
		const store = useConversationStore()

		await store.askQuestion('   ')

		expect(store.messages).toHaveLength(0)
	})

	it('should append user question and cited answer', async () => {
		vi.useFakeTimers()
		const store = useConversationStore()
		const request = store.askQuestion('住宿費用上限是多少？')

		expect(store.isResponding).toBe(true)
		expect(store.messages[0]?.role).toBe('user')

		await vi.runAllTimersAsync()
		await request

		expect(store.isResponding).toBe(false)
		expect(store.messages[1]?.role).toBe('assistant')
		expect(store.messages[1]?.citations).toHaveLength(2)
		vi.useRealTimers()
	})

	it('should clear the current conversation', () => {
		const store = useConversationStore()
		store.messages.push({ id: '1', role: 'user', content: '測試', createdAt: '2026-08-14' })

		store.clearConversation()

		expect(store.messages).toHaveLength(0)
	})
})
