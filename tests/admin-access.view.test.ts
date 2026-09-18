import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { defineComponent, h } from 'vue'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.ResizeObserver = class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
} as typeof ResizeObserver

Object.defineProperty(globalThis, 'visualViewport', {
	configurable: true,
	value: { addEventListener: vi.fn(), removeEventListener: vi.fn(), width: 1024, height: 768, scale: 1 },
})

type AccessMock = typeof import('@/mocks/access')

// NOTE: 帳號資料是模組層級的 reactive 狀態，每個測試重新載入模組避免互相污染
async function mountView(query = ''): Promise<{ wrapper: VueWrapper; access: AccessMock; toasts: () => string[] }> {
	vi.resetModules()
	const access = await import('@/mocks/access')
	const { default: AdminAccessView } = await import('@/views/admin/AdminAccessView.vue')
	const { useToastStore } = await import('@/stores/toast')
	const pinia = createPinia()
	setActivePinia(pinia)
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ path: '/admin/access', component: AdminAccessView },
			{ path: '/admin', component: { render: () => h('div') } },
		],
	})
	await router.push(`/admin/access${query}`)
	await router.isReady()
	const Host = defineComponent({ render: () => h(RouterView) })
	const wrapper = mount(Host, {
		attachTo: document.body,
		global: { plugins: [pinia, createVuetify({ components, directives }), router] },
	})
	await flushPromises()
	const toastStore = useToastStore()
	return { wrapper, access, toasts: () => toastStore.items.map((item) => item.title) }
}

function tableRows(wrapper: VueWrapper): string[] {
	return wrapper.findAll('.user-table tbody tr').map((row) => row.text())
}

function dialog(): HTMLElement {
	const card = document.querySelector<HTMLElement>('.v-overlay--active .v-card')
	if (!card) throw new Error('沒有開啟中的對話框')
	return card
}

function dialogInput(label: string): HTMLInputElement {
	const field = [...dialog().querySelectorAll('.v-input')].find((item) => item.querySelector('label')?.textContent?.trim() === label)
	const input = field?.querySelector('input')
	if (!input) throw new Error(`對話框內找不到欄位「${label}」`)
	return input
}

async function typeInto(label: string, value: string): Promise<void> {
	const input = dialogInput(label)
	input.value = value
	input.dispatchEvent(new Event('input'))
	await flushPromises()
}

async function clickDialogButton(text: string): Promise<void> {
	const buttons = [...document.querySelectorAll<HTMLButtonElement>('.v-overlay--active .v-card button')]
	// @ 可能同時有兩層對話框，取最上層（最後出現）的那一顆
	const button = buttons.reverse().find((item) => item.textContent?.trim() === text)
	if (!button) throw new Error(`對話框內找不到按鈕「${text}」`)
	button.click()
	await flushPromises()
}

describe('AdminAccessView', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
	})

	it('should filter users by keyword and show a clear action when nothing matches', async () => {
		const { wrapper, access } = await mountView()

		const search = wrapper.findAll('.filters .v-text-field input')[0]!
		await search.setValue('王小明')
		expect(tableRows(wrapper)).toHaveLength(1)
		expect(tableRows(wrapper)[0]).toContain('王小明')

		await search.setValue('查無此人')
		expect(wrapper.text()).toContain('沒有符合的使用者')

		await wrapper.findAll('button').find((button) => button.text() === '清除篩選')!.trigger('click')
		expect(tableRows(wrapper).length).toBe(Math.min(20, access.accessState.users.length))
	})

	it('should toggle the status filter from the account summary', async () => {
		const { wrapper, access } = await mountView()
		const suspended = access.accessState.users.filter((user) => user.status === 'suspended')
		const summaryButton = wrapper.findAll('.metric-button')[1]!

		await summaryButton.trigger('click')
		expect(summaryButton.attributes('aria-pressed')).toBe('true')
		expect(tableRows(wrapper)).toHaveLength(suspended.length)

		await summaryButton.trigger('click')
		expect(summaryButton.attributes('aria-pressed')).toBe('false')
	})

	it('should reject an invalid new account and keep the editor open', async () => {
		const { wrapper, access } = await mountView()
		const before = access.accessState.users.length

		await wrapper.get('[data-testid="access-create"]').trigger('click')
		await flushPromises()
		await clickDialogButton('建立帳號')

		expect(access.accessState.users).toHaveLength(before)
		expect(dialog().textContent).toContain('新增本機帳號')
	})

	it('should create a local account and show the one-time credential', async () => {
		const { wrapper, access, toasts } = await mountView()
		const writeText = vi.fn().mockResolvedValue(undefined)
		Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })

		await wrapper.get('[data-testid="access-create"]').trigger('click')
		await flushPromises()
		await typeInto('帳號', 'consultant01')
		await typeInto('顯示名稱', '外部顧問')
		await typeInto('Email', 'consultant01@example.com')
		await clickDialogButton('建立帳號')

		expect(access.accessState.users.some((user) => user.account === 'consultant01')).toBe(true)
		expect(toasts()).toContain('已建立帳號 consultant01，首次登入須變更密碼。')
		expect(document.querySelector('[data-testid="credential"]')?.textContent).toContain('consultant01')

		await clickDialogButton('複製')
		expect(writeText).toHaveBeenCalledWith(expect.stringContaining('帳號：consultant01'))

		await clickDialogButton('我已記下，關閉')
		expect(document.querySelector('[data-testid="credential"]')).toBeNull()
	})

	it('should report when the clipboard is unavailable', async () => {
		const { wrapper, toasts } = await mountView()
		Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })

		await wrapper.get('[data-testid="access-create"]').trigger('click')
		await flushPromises()
		await typeInto('帳號', 'consultant02')
		await typeInto('顯示名稱', '外部顧問二')
		await typeInto('Email', 'consultant02@example.com')
		await clickDialogButton('建立帳號')
		await clickDialogButton('複製')

		expect(toasts()).toContain('無法存取剪貼簿，請手動選取複製。')
	})

	it('should update an existing user from the edit button', async () => {
		const { wrapper, access, toasts } = await mountView()

		await wrapper.get('button[aria-label="編輯 王小明"]').trigger('click')
		await flushPromises()
		expect(dialog().textContent).toContain('編輯 王小明')

		const suspendRadio = [...dialog().querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((radio) => radio.value === 'suspended')
		suspendRadio!.click()
		await flushPromises()
		await clickDialogButton('儲存變更')

		expect(access.getUser('user-wang')?.status).toBe('suspended')
		expect(toasts()).toContain('已更新「王小明」。')
	})

	it('should reset a local account password after confirmation', async () => {
		const { wrapper, access, toasts } = await mountView()
		const local = access.accessState.users.find((user) => user.source === 'local' && user.id !== access.CURRENT_USER_ID)
		expect(local).toBeDefined()

		await wrapper.get(`button[aria-label="編輯 ${local!.displayName}"]`).trigger('click')
		await flushPromises()
		await clickDialogButton('重設為臨時密碼')
		await clickDialogButton('重設')

		expect(toasts()).toContain(`已重設「${local!.displayName}」的密碼，下次登入須變更。`)
		expect(document.querySelector('[data-testid="credential"]')?.textContent).toContain(local!.account)
	})
})
