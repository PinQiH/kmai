import { flushPromises, mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ConfirmDialog from '@/components/ConfirmDialog.vue'

globalThis.ResizeObserver = class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
} as typeof ResizeObserver

Object.defineProperty(globalThis, 'visualViewport', {
	configurable: true,
	value: { addEventListener: vi.fn(), removeEventListener: vi.fn(), width: 1024, height: 768, scale: 1 },
})

async function mountDialog(props: Record<string, unknown> = {}, slots: Record<string, () => unknown> = {}) {
	const isOpen = ref(true)
	const onConfirm = vi.fn()
	const Host = defineComponent({
		render: () => h(ConfirmDialog, {
			modelValue: isOpen.value,
			'onUpdate:modelValue': (value: boolean) => { isOpen.value = value },
			onConfirm,
			title: '刪除規則？',
			...props,
		}, slots),
	})
	mount(Host, { attachTo: document.body, global: { plugins: [createVuetify({ components, directives })] } })
	await flushPromises()
	return { isOpen, onConfirm }
}

const card = (): HTMLElement => document.querySelector<HTMLElement>('.v-overlay--active .v-card')!
const button = (testId: string): HTMLButtonElement | null => document.querySelector(`[data-testid="${testId}"]`)

describe('ConfirmDialog', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
	})

	it('should show the title, description and default labels', async () => {
		await mountDialog({ description: '刪除後無法復原。' })

		expect(card().textContent).toContain('刪除規則？')
		expect(card().textContent).toContain('刪除後無法復原。')
		expect(button('confirm-dialog-cancel')?.textContent?.trim()).toBe('返回')
		expect(button('confirm-dialog-confirm')?.textContent?.trim()).toBe('確認刪除')
	})

	it('should emit confirm without closing by itself', async () => {
		const { isOpen, onConfirm } = await mountDialog()

		button('confirm-dialog-confirm')!.click()

		expect(onConfirm).toHaveBeenCalledOnce()
		expect(isOpen.value).toBe(true)
	})

	it('should close when cancelled', async () => {
		const { isOpen, onConfirm } = await mountDialog()

		button('confirm-dialog-cancel')!.click()

		expect(isOpen.value).toBe(false)
		expect(onConfirm).not.toHaveBeenCalled()
	})

	it('should disable or hide the confirm button', async () => {
		await mountDialog({ confirmDisabled: true })
		expect(button('confirm-dialog-confirm')?.disabled).toBe(true)

		document.body.innerHTML = ''
		await mountDialog({ hideConfirm: true }, { 'extra-actions': () => h('button', { class: 'extra' }, '前往設定') })
		expect(button('confirm-dialog-confirm')).toBeNull()
		expect(card().querySelector('.extra')?.textContent).toBe('前往設定')
	})

	it('should render custom body content from the default slot', async () => {
		await mountDialog({ description: '不會顯示' }, { default: () => h('ul', { class: 'blockers' }, [h('li', '用途「生成回答」')]) })

		expect(card().querySelector('.blockers')?.textContent).toBe('用途「生成回答」')
		expect(card().textContent).not.toContain('不會顯示')
	})
})
