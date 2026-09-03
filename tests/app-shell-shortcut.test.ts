import { createPinia, setActivePinia } from 'pinia'
import { shallowMount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { afterEach, describe, expect, it } from 'vitest'

import AppShell from '../src/layouts/AppShell.vue'

const ConversationSearchDialogStub = defineComponent({
	name: 'ConversationSearchDialog',
	props: {
		modelValue: {
			type: Boolean,
			required: true,
		},
	},
	template: '<div data-testid="conversation-search-dialog" :data-open="modelValue ? \'true\' : \'false\'" />',
})

async function mountAppShell(): Promise<VueWrapper> {
	const pinia = createPinia()
	setActivePinia(pinia)
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ path: '/', component: { template: '<div>首頁</div>' } },
			{ path: '/ask', component: { template: '<div>AI 問答</div>' } },
			{ path: '/admin', component: { template: '<div>管理後台</div>' }, meta: { admin: true } },
		],
	})
	await router.push('/')
	await router.isReady()

	return shallowMount(AppShell, {
		global: {
			plugins: [pinia, router, createVuetify({ components, directives })],
			stubs: {
				ConversationSearchDialog: ConversationSearchDialogStub,
			},
		},
	})
}

async function pressShortcut(target: EventTarget, init: KeyboardEventInit): Promise<KeyboardEvent> {
	const event = new KeyboardEvent('keydown', {
		bubbles: true,
		cancelable: true,
		...init,
	})
	target.dispatchEvent(event)
	await nextTick()
	return event
}

function isSearchDialogOpen(wrapper: VueWrapper): boolean {
	return wrapper.get('[data-testid="conversation-search-dialog"]').attributes('data-open') === 'true'
}

describe('AppShell search shortcut', () => {
	const wrappers: VueWrapper[] = []

	afterEach(() => {
		wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
		document.body.innerHTML = ''
	})

	it('should open conversation search when slash is pressed outside an editable element', async () => {
		const wrapper = await mountAppShell()
		wrappers.push(wrapper)

		const event = await pressShortcut(window, { key: '/' })

		expect(isSearchDialogOpen(wrapper)).toBe(true)
		expect(event.defaultPrevented).toBe(true)
	})

	it.each([
		['Ctrl', { ctrlKey: true }],
		['Cmd', { metaKey: true }],
	])('should ignore %s plus K so the app only provides the slash shortcut', async (_label, modifier) => {
		const wrapper = await mountAppShell()
		wrappers.push(wrapper)

		const event = await pressShortcut(window, { key: 'k', ...modifier })

		expect(isSearchDialogOpen(wrapper)).toBe(false)
		expect(event.defaultPrevented).toBe(false)
	})

	it('should not take slash away from editable content', async () => {
		const contentEditor = document.createElement('div')
		contentEditor.setAttribute('contenteditable', 'true')

		for (const element of [document.createElement('input'), document.createElement('textarea'), contentEditor]) {
			const wrapper = await mountAppShell()
			wrappers.push(wrapper)
			document.body.appendChild(element)

			const event = await pressShortcut(element, { key: '/' })

			expect(isSearchDialogOpen(wrapper)).toBe(false)
			expect(event.defaultPrevented).toBe(false)
			element.remove()
		}
	})

	it('should ignore shortcuts while an IME composition is active', async () => {
		const wrapper = await mountAppShell()
		wrappers.push(wrapper)

		const event = await pressShortcut(window, { key: '/', isComposing: true })

		expect(isSearchDialogOpen(wrapper)).toBe(false)
		expect(event.defaultPrevented).toBe(false)
	})
})
