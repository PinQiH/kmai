import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useConversationStore } from '@/stores/conversation'
import AskView from '@/views/AskView.vue'

describe('AskView favorite navigation', () => {
	let wrapper: VueWrapper | null = null

	beforeEach(() => {
		vi.stubGlobal('ResizeObserver', class ResizeObserverStub {
			observe(): void {}
			unobserve(): void {}
			disconnect(): void {}
		})
		vi.stubGlobal('IntersectionObserver', class IntersectionObserverStub {
			observe(): void {}
			unobserve(): void {}
			disconnect(): void {}
		})
		vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
		vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0)))
		vi.stubGlobal('visualViewport', {
			width: 1280,
			height: 720,
			offsetLeft: 0,
			offsetTop: 0,
			pageLeft: 0,
			pageTop: 0,
			scale: 1,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		})
		HTMLElement.prototype.scrollIntoView = vi.fn()
	})

	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
		document.body.innerHTML = ''
		vi.unstubAllGlobals()
	})

	it('should restore and focus the saved answer without asking the question again', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [
				{ path: '/ask', component: AskView },
				{ path: '/documents/:id', component: { template: '<div />' } },
			],
		})
		router.afterEach(() => {
			window.requestAnimationFrame(() => document.getElementById('main-content')?.focus({ preventScroll: true }))
		})
		await router.push('/ask')
		await router.isReady()
		const conversationStore = useConversationStore()
		const askQuestionSpy = vi.spyOn(conversationStore, 'askQuestion')

		wrapper = mount(
			{ components: { RouterView }, template: '<VApp><VMain id="main-content" tabindex="-1"><RouterView /></VMain></VApp>' },
			{
				attachTo: document.body,
				global: { plugins: [pinia, createVuetify({ components, directives }), router] },
			},
		)
		await router.push('/ask?conversationId=conv-001&messageId=conv-001-message-2')
		await flushPromises()

		const target = wrapper.get('#message-conv-001-message-2')
		expect(askQuestionSpy).not.toHaveBeenCalled()
		expect(conversationStore.activeConversationId).toBe('conv-001')
		expect(wrapper.text()).toContain('國內出差住宿費用上限是多少？')
		expect(target.text()).toContain('國內住宿每晚原則上限為新台幣 3,000 元')
		expect(target.text()).toContain('員工差旅與費用報支辦法')
		expect(target.classes()).toContain('is-targeted')
		await vi.waitFor(() => expect(document.activeElement).toBe(target.element))
	})

	it('should prioritize a favorite deep link over a mixed question query', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [{ path: '/ask', component: AskView }],
		})
		await router.push('/ask')
		await router.isReady()
		const conversationStore = useConversationStore()
		const askQuestionSpy = vi.spyOn(conversationStore, 'askQuestion')
		wrapper = mount(
			{ components: { RouterView }, template: '<VApp><RouterView /></VApp>' },
			{
				attachTo: document.body,
				global: { plugins: [pinia, createVuetify({ components, directives }), router] },
			},
		)

		await router.push('/ask?q=不應重新提問&conversationId=conv-001&messageId=conv-001-message-2')
		await flushPromises()

		expect(askQuestionSpy).not.toHaveBeenCalled()
		expect(conversationStore.activeConversationId).toBe('conv-001')
		expect(wrapper.find('#message-conv-001-message-2').exists()).toBe(true)
	})
})
