import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { parseAnswerSegments, useConversationStore } from '../src/stores/conversation'

describe('conversation store', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `message-${Math.random()}`) })
	})

	it('should default to a specific Syscom library source instead of all-company knowledge', () => {
		const store = useConversationStore()

		expect(store.selectedKnowledgeSourceId).toBe('policy')
		expect(store.selectedScope).toBe('公司制度')
	})

	it('should apply answer style and LLM settings with readable labels', () => {
		const store = useConversationStore()

		expect(store.answerStyleLabel).toBe('標準')
		expect(store.selectedAnswerModelId).toBe('gpt-4.1-mini')
		expect(store.answerModelShortLabel).toBe('gpt-4.1-mini')

		store.applyAnswerSettings({ answerStyleId: 'step-by-step', answerModelId: 'llama3.1:8b' })

		expect(store.selectedAnswerStyleId).toBe('step-by-step')
		expect(store.selectedAnswerModelId).toBe('llama3.1:8b')
		expect(store.answerStyleLabel).toBe('步驟式')
		expect(store.answerModelLabel).toBe('llama3.1:8b')
	})

	it('should apply knowledge source web-search defaults and allow an override', () => {
		const store = useConversationStore()

		store.selectKnowledgeSource({ id: 'notebook-1', name: '市場筆記', defaultWebSearchEnabled: true })
		expect(store.isWebSearchEnabled).toBe(true)
		expect(store.webSearchSettingSource).toBe('default')

		store.setWebSearchEnabled(false)
		expect(store.isWebSearchEnabled).toBe(false)
		expect(store.webSearchSettingSource).toBe('override')
		store.syncSelectedSourceDefault({ id: 'notebook-1', defaultWebSearchEnabled: false })
		expect(store.isWebSearchEnabled).toBe(false)

		store.resetWebSearchToDefault()
		expect(store.isWebSearchEnabled).toBe(false)
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

	it('should skip retrieval citations and web search in model-only mode', async () => {
		vi.useFakeTimers()
		const store = useConversationStore()
		store.selectKnowledgeSource({ id: 'model', name: '模型一般知識', defaultWebSearchEnabled: false })
		store.setWebSearchEnabled(true)
		const request = store.askQuestion('新進同仁第一週要完成哪些事情？')

		expect(store.canUseWebSearch).toBe(false)
		expect(store.isWebSearchEnabled).toBe(false)
		expect(store.thinkingStages.map((stage) => stage.id)).toEqual(['parse', 'generate'])

		await vi.runAllTimersAsync()
		await request

		expect(store.messages[1]?.citations).toEqual([])
		expect(store.messages[1]?.content).not.toMatch(/\[\d+\]/)
		expect(store.messages[1]?.trace?.retrievedCount).toBe(0)
		vi.useRealTimers()
	})

	it('should mark every thinking stage as done after answering', async () => {
		vi.useFakeTimers()
		const store = useConversationStore()
		const request = store.askQuestion('住宿費用上限是多少？')

		expect(store.thinkingStages.map((stage) => stage.id)).toEqual(['parse', 'retrieve', 'compare', 'generate'])
		expect(store.thinkingStages[0]?.status).toBe('active')

		await vi.runAllTimersAsync()
		await request

		expect(store.thinkingStages.every((stage) => stage.status === 'done')).toBe(true)
		expect(store.retrievedCount).toBeGreaterThan(0)
		vi.useRealTimers()
	})

	it('should stream the answer and settle with the full content', async () => {
		vi.useFakeTimers()
		const store = useConversationStore()
		const request = store.askQuestion('新進同仁第一週要完成哪些事情？')

		await vi.advanceTimersByTimeAsync(1500)
		const streamingMessage = store.streamingMessage

		expect(streamingMessage).not.toBeNull()
		expect(streamingMessage?.content.length).toBeGreaterThan(0)
		expect(streamingMessage?.citations).toBeUndefined()

		await vi.runAllTimersAsync()
		await request

		expect(store.streamingMessage).toBeNull()
		expect(store.messages[1]?.isStreaming).toBe(false)
		expect(store.messages[1]?.content).toContain('新進同仁第一週')
		vi.useRealTimers()
	})

	it('should reset thinking state when the conversation is cleared', () => {
		const store = useConversationStore()
		store.retrievedCount = 1284
		store.thinkingStages = [{ id: 'parse', label: '解析問題', detail: '', status: 'done', elapsedMs: 200 }]

		store.clearConversation()

		expect(store.thinkingStages).toHaveLength(0)
		expect(store.retrievedCount).toBe(0)
	})

	it('should attach a reviewable trace to the finished answer', async () => {
		vi.useFakeTimers()
		const store = useConversationStore()
		const request = store.askQuestion('住宿費用上限是多少？')

		await vi.runAllTimersAsync()
		await request

		const trace = store.messages[1]?.trace

		expect(trace).toBeDefined()
		expect(trace?.citationCount).toBe(2)
		expect(trace?.stages).toHaveLength(4)
		expect(trace?.stages.every((stage) => stage.status === 'done')).toBe(true)
		vi.useRealTimers()
	})

	it('should create a history entry for a brand new conversation', async () => {
		vi.useFakeTimers()
		const store = useConversationStore()
		const originalCount = store.conversations.length
		const request = store.askQuestion('住宿費用上限是多少？')

		await vi.runAllTimersAsync()
		await request

		expect(store.conversations).toHaveLength(originalCount + 1)
		expect(store.conversations[0]?.title).toBe('住宿費用上限是多少？')
		expect(store.activeConversationId).toBe(store.conversations[0]?.id)
		expect(store.conversationMessagesById[store.conversations[0]!.id]).toEqual(store.messages)
		vi.useRealTimers()
	})

	it('should load saved messages without asking again when conversation history is opened', () => {
		const store = useConversationStore()
		const target = store.conversations.find((conversation) => conversation.id === 'conv-004')!
		const originalUpdatedAt = target.updatedAt
		const askQuestionSpy = vi.spyOn(store, 'askQuestion')

		store.openConversation(target.id)

		expect(askQuestionSpy).not.toHaveBeenCalled()
		expect(store.activeConversationId).toBe(target.id)
		expect(store.messages).toHaveLength(target.messageCount)
		expect(store.messages[0]?.content).toBe(target.title)
		expect(store.messages.at(-1)?.content).toBe('有，3.2 版要求在出差結束後十個工作天內完成核銷 [1]。')
		expect(store.messages.filter((message) => message.role === 'assistant').every((message) => message.trace)).toBe(true)
		expect(store.isResponding).toBe(false)
		expect(store.thinkingStages).toHaveLength(0)
		expect(target.updatedAt).toBe(originalUpdatedAt)
	})

	it('should reopen a newly created conversation with saved retrieval stages without asking again', async () => {
		vi.useFakeTimers()
		const store = useConversationStore()
		const request = store.askQuestion('住宿費用上限是多少？')

		await vi.runAllTimersAsync()
		await request

		const conversationId = store.activeConversationId!
		const savedAnswer = store.messages.find((message) => message.role === 'assistant')!
		expect(savedAnswer.trace).toBeDefined()
		store.startNewConversation()
		const askQuestionSpy = vi.spyOn(store, 'askQuestion')

		store.openConversation(conversationId)

		const reopenedAnswer = store.messages.find((message) => message.role === 'assistant')!
		expect(askQuestionSpy).not.toHaveBeenCalled()
		expect(store.messages).toHaveLength(2)
		expect(reopenedAnswer.content).toBe(savedAnswer.content)
		expect(reopenedAnswer.citations).toEqual(savedAnswer.citations)
		expect(reopenedAnswer.citations).not.toBe(savedAnswer.citations)
		expect(reopenedAnswer.trace).toEqual(savedAnswer.trace)
		expect(reopenedAnswer.trace).not.toBe(savedAnswer.trace)
		expect(store.thinkingStages).toHaveLength(0)
		vi.useRealTimers()
	})

	it('should keep saved message history aligned with every conversation summary', () => {
		const store = useConversationStore()

		for (const conversation of store.conversations) {
			const savedMessages = store.conversationMessagesById[conversation.id]

			expect(savedMessages).toHaveLength(conversation.messageCount)
			expect(savedMessages?.[0]).toMatchObject({ role: 'user', content: conversation.title })
			const hasMatchingPreview = savedMessages?.some((message) => {
				if (message.role !== 'assistant') return false
				const answerWithoutCitationMarkers = message.content.replace(/\s*\[\d+\]\s*/g, '')
				return answerWithoutCitationMarkers === conversation.previewAnswer
			})
			expect(hasMatchingPreview, `history preview mismatch: ${conversation.id}`).toBe(true)
			expect(savedMessages?.filter((message) => message.role === 'assistant').every((message) => message.trace)).toBe(true)
			expect(savedMessages?.filter((message) => message.role === 'assistant').every((message) => message.trace?.stages.every((stage) => stage.status === 'done'))).toBe(true)

			for (const message of savedMessages?.filter((item) => item.role === 'assistant') ?? []) {
				const citationIndexes = parseAnswerSegments({ content: message.content })
					.filter((segment) => segment.type === 'citation')
					.map((segment) => segment.index)
				const messageCitations = message.citations ?? []
				const documentCount = new Set(messageCitations.map((citation) => citation.documentId)).size

				expect(citationIndexes).toEqual(messageCitations.map((_, index) => index + 1))
				expect(message.trace?.citationCount).toBe(messageCitations.length)
				expect(message.trace?.documentCount).toBe(documentCount)
			}
		}
	})

	it('should reset the active conversation when a new one starts', () => {
		const store = useConversationStore()
		store.messages.push({ id: '1', role: 'user', content: '測試', createdAt: '2026-08-17' })
		store.activeConversationId = 'conv-001'

		store.startNewConversation()

		expect(store.messages).toHaveLength(0)
		expect(store.activeConversationId).toBeNull()
	})

	it('should filter history by keyword and archive flag', () => {
		const store = useConversationStore()

		expect(store.filteredConversations.every((conversation) => !conversation.isArchived)).toBe(true)

		store.onlyArchived = true

		expect(store.filteredConversations.every((conversation) => conversation.isArchived)).toBe(true)

		store.onlyArchived = false
		store.historyKeyword = '住宿'

		// @ 關鍵字同時比對標題與回答預覽，因此命中數可能多於標題相符的筆數
		expect(store.filteredConversations.length).toBeGreaterThan(0)
		expect(
			store.filteredConversations.every(
				(conversation) => conversation.title.includes('住宿') || conversation.previewAnswer.includes('住宿'),
			),
		).toBe(true)

		store.historyKeyword = '不存在的關鍵字'

		expect(store.filteredConversations).toHaveLength(0)
	})

	it('should list pinned conversations before the rest', () => {
		const store = useConversationStore()

		expect(store.pinnedConversations.length).toBeGreaterThan(0)
		expect(store.pinnedConversations.every((conversation) => conversation.isPinned)).toBe(true)
		expect(store.unpinnedConversations.every((conversation) => !conversation.isPinned)).toBe(true)

		// @ 釘選的一定排在未釘選的前面
		const firstUnpinnedIndex = store.filteredConversations.findIndex((conversation) => !conversation.isPinned)
		const lastPinnedIndex = store.filteredConversations.map((conversation) => conversation.isPinned).lastIndexOf(true)

		expect(lastPinnedIndex).toBeLessThan(firstUnpinnedIndex)
	})

	it('should toggle the pinned flag of a conversation', () => {
		const store = useConversationStore()
		const target = store.conversations.find((conversation) => !conversation.isPinned)

		store.togglePin(target!.id)

		expect(store.conversations.find((conversation) => conversation.id === target!.id)?.isPinned).toBe(true)
	})

	it('should rename a conversation and ignore blank titles', () => {
		const store = useConversationStore()
		const target = store.conversations[0]

		store.renameConversation({ conversationId: target.id, title: '  差旅住宿與核銷期限  ' })

		expect(store.conversations[0]?.title).toBe('差旅住宿與核銷期限')

		store.renameConversation({ conversationId: target.id, title: '   ' })

		expect(store.conversations[0]?.title).toBe('差旅住宿與核銷期限')
	})

	it('should search conversations across archived state with pinned first', () => {
		const store = useConversationStore()

		const results = store.searchConversations('住宿')

		expect(results.length).toBeGreaterThan(0)
		expect(results[0]?.isPinned).toBe(true)

		expect(store.searchConversations('不存在的關鍵字')).toHaveLength(0)
	})

	it('should toggle the archive flag of a conversation', () => {
		const store = useConversationStore()
		const target = store.conversations[0]

		store.toggleArchive(target.id)

		expect(store.conversations[0]?.isArchived).toBe(true)
	})

	it('should clear the current conversation', () => {
		const store = useConversationStore()
		store.messages.push({ id: '1', role: 'user', content: '測試', createdAt: '2026-08-14' })

		store.clearConversation()

		expect(store.messages).toHaveLength(0)
	})
})

describe('parseAnswerSegments', () => {
	it('should split inline citation markers into separate segments', () => {
		const segments = parseAnswerSegments({ content: '依規定 [1]，上限為 3,000 元 [2]。' })

		expect(segments).toEqual([
			{ type: 'text', value: '依規定 ' },
			{ type: 'citation', index: 1 },
			{ type: 'text', value: '，上限為 3,000 元 ' },
			{ type: 'citation', index: 2 },
			{ type: 'text', value: '。' },
		])
	})

	it('should return a single text segment when no marker exists', () => {
		const segments = parseAnswerSegments({ content: '沒有任何引用標記。' })

		expect(segments).toEqual([{ type: 'text', value: '沒有任何引用標記。' }])
	})

	it('should not treat script-like text as markup', () => {
		const segments = parseAnswerSegments({ content: '<script>alert(1)</script> [1]' })

		expect(segments[0]).toEqual({ type: 'text', value: '<script>alert(1)</script> ' })
		expect(segments[1]).toEqual({ type: 'citation', index: 1 })
	})
})
