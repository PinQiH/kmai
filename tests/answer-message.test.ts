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
})
