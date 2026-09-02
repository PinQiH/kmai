import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AnswerMessage from '@/components/AnswerMessage.vue'
import type { Citation, ConversationMessage } from '@/types'

const citation: Citation = {
	id: 'cite-1',
	chunkId: 'doc-001-chunk-0042',
	documentId: 'doc-001',
	title: '員工差旅與費用報支辦法',
	section: '4.2 住宿費用',
	excerpt: '國內住宿每晚以新台幣 3,000 元為原則。',
	confidence: 0.94,
}

const message: ConversationMessage = {
	id: 'answer-1',
	role: 'assistant',
	content: '住宿費用請參考規定 [1]。',
	createdAt: '2026-09-01T09:00:00.000Z',
	citations: [citation],
}

const completedMessage: ConversationMessage = {
	...message,
	trace: {
		documentCount: 1,
		citationCount: 1,
		retrievedCount: 1,
		elapsedMs: 1200,
		stages: [],
	},
}

describe('AnswerMessage', () => {
	beforeEach(() => {
		vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
		HTMLElement.prototype.scrollIntoView = vi.fn()
	})

	afterEach(() => {
		document.body.innerHTML = ''
		vi.unstubAllGlobals()
	})

	it('should expand and focus the matching citation when an inline marker is clicked', async () => {
		const wrapper = mount(AnswerMessage, {
			attachTo: document.body,
			props: { message },
			global: {
				stubs: {
					ThinkingTrace: true,
					VBtn: true,
					VExpandTransition: { template: '<div><slot /></div>' },
					VIcon: true,
				},
			},
		})

		await wrapper.get('.citation-ref').trigger('click')

		const entry = wrapper.get('[data-testid="citation-entry-1"]')
		expect(wrapper.emitted('openCitation')).toBeUndefined()
		expect(entry.classes()).toContain('is-targeted')
		expect(document.activeElement).toBe(entry.element)
		expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'nearest' })

		wrapper.unmount()
	})

	it('should emit citation details only when the expanded citation entry is clicked', async () => {
		const wrapper = mount(AnswerMessage, {
			props: { message },
			global: {
				stubs: {
					ThinkingTrace: true,
					VBtn: true,
					VExpandTransition: { template: '<div><slot /></div>' },
					VIcon: true,
				},
			},
		})

		await wrapper.get('.citation-toggle').trigger('click')
		await wrapper.get('[data-testid="citation-entry-1"]').trigger('click')

		expect(wrapper.emitted('openCitation')?.[0]).toEqual([citation, 'citation-answer-1-cite-1'])
	})

	it('should render selected icons and pressed states when helpful feedback is present', () => {
		const wrapper = mount(AnswerMessage, {
			props: {
				message: {
					...completedMessage,
					feedback: {
						value: 'helpful',
						submittedAt: '2026-09-01T09:01:00.000Z',
					},
				},
			},
			global: {
				stubs: {
					ThinkingTrace: true,
					VBtn: true,
					VExpandTransition: { template: '<div><slot /></div>' },
					VIcon: true,
				},
			},
		})

		const helpfulButton = wrapper.get('[aria-label="這個回答有幫助"]')
		const unhelpfulButton = wrapper.get('[aria-label="這個回答沒有幫助"]')

		expect(helpfulButton.attributes('icon')).toBe('mdi-thumb-up')
		expect(helpfulButton.attributes('color')).toBe('primary')
		expect(helpfulButton.attributes('aria-pressed')).toBe('true')
		expect(unhelpfulButton.attributes('icon')).toBe('mdi-thumb-down-outline')
		expect(unhelpfulButton.attributes('aria-pressed')).toBe('false')
	})

	it('should render the unhelpful icon and pressed state when unhelpful feedback is present', () => {
		const wrapper = mount(AnswerMessage, {
			props: {
				message: {
					...completedMessage,
					feedback: {
						value: 'unhelpful',
						reason: '內容不夠完整',
						submittedAt: '2026-09-01T09:01:00.000Z',
					},
				},
			},
			global: {
				stubs: {
					ThinkingTrace: true,
					VBtn: true,
					VExpandTransition: { template: '<div><slot /></div>' },
					VIcon: true,
				},
			},
		})

		const helpfulButton = wrapper.get('[aria-label="這個回答有幫助"]')
		const unhelpfulButton = wrapper.get('[aria-label="這個回答沒有幫助"]')

		expect(helpfulButton.attributes('icon')).toBe('mdi-thumb-up-outline')
		expect(helpfulButton.attributes('aria-pressed')).toBe('false')
		expect(unhelpfulButton.attributes('icon')).toBe('mdi-thumb-down')
		expect(unhelpfulButton.attributes('color')).toBe('error')
		expect(unhelpfulButton.attributes('aria-pressed')).toBe('true')
	})

	it('should emit feedback values when feedback buttons are clicked', async () => {
		const wrapper = mount(AnswerMessage, {
			props: { message: completedMessage },
			global: {
				stubs: {
					ThinkingTrace: true,
					VBtn: true,
					VExpandTransition: { template: '<div><slot /></div>' },
					VIcon: true,
				},
			},
		})

		await wrapper.get('[aria-label="這個回答有幫助"]').trigger('click')
		await wrapper.get('[aria-label="這個回答沒有幫助"]').trigger('click')

		expect(wrapper.emitted('feedback')).toEqual([[true], [false]])
	})

	it('should emit saveToNotebook when the notebook button is clicked', async () => {
		const wrapper = mount(AnswerMessage, {
			props: { message: completedMessage },
			global: {
				stubs: {
					ThinkingTrace: true,
					VBtn: true,
					VExpandTransition: { template: '<div><slot /></div>' },
					VIcon: true,
				},
			},
		})

		await wrapper.get('[aria-label="將這個回答存入筆記本"]').trigger('click')

		expect(wrapper.emitted('saveToNotebook')).toEqual([[]])
	})
})
