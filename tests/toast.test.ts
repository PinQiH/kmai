import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AppToaster from '@/components/AppToaster.vue'
import { MAX_VISIBLE_TOASTS, TOAST_TIMEOUTS, useToastStore } from '@/stores/toast'

describe('useToastStore', () => {
	beforeEach(() => setActivePinia(createPinia()))

	it('1. 新通知放在最上面，並依嚴重度套用預設停留時間', () => {
		const store = useToastStore()
		store.success('已儲存')
		store.error('刪除失敗')
		expect(store.items.map((item) => item.title)).toEqual(['刪除失敗', '已儲存'])
		expect(store.items[0].timeout).toBe(TOAST_TIMEOUTS.error)
		expect(store.items[1].timeout).toBe(4000)
	})

	it('2. 相同內容重複觸發時合併計數並重新計時，不新增一則', () => {
		const store = useToastStore()
		store.success('已儲存')
		store.success('已儲存')
		expect(store.items).toHaveLength(1)
		expect(store.items[0].count).toBe(2)
		expect(store.items[0].revision).toBe(1)
	})

	it('3. 超過上限時優先移除最舊的非錯誤通知，錯誤保留', () => {
		const store = useToastStore()
		store.error('錯誤 A')
		for (let i = 0; i < MAX_VISIBLE_TOASTS; i++) store.success(`成功 ${i}`)
		expect(store.items).toHaveLength(MAX_VISIBLE_TOASTS)
		expect(store.items.some((item) => item.title === '錯誤 A')).toBe(true)
		expect(store.items.some((item) => item.title === '成功 0')).toBe(false)
	})

	it('4. dismiss 只移除指定通知', () => {
		const store = useToastStore()
		const id = store.info('提示')
		store.warning('注意')
		store.dismiss(id)
		expect(store.items.map((item) => item.title)).toEqual(['注意'])
	})
})

describe('AppToaster', () => {
	function mountToaster() {
		const pinia = createPinia()
		setActivePinia(pinia)
		return mount(AppToaster, { global: { plugins: [pinia, createVuetify({ components, directives })] } })
	}

	it('5. 錯誤以 alert 朗讀且沒有倒數線；成功以 status 朗讀並有倒數線', async () => {
		const wrapper = mountToaster()
		const store = useToastStore()
		store.success('已儲存')
		store.error('刪除失敗', { detail: '請稍後再試' })
		await wrapper.vm.$nextTick()
		const toasts = wrapper.findAll('[data-testid="app-toast"]')
		expect(toasts[0].attributes('role')).toBe('alert')
		expect(toasts[0].text()).toContain('請稍後再試')
		expect(toasts[0].find('.toast__timer').exists()).toBe(false)
		expect(toasts[1].attributes('role')).toBe('status')
		expect(toasts[1].find('.toast__timer').exists()).toBe(true)
		wrapper.unmount()
	})

	it('6. 倒數結束、按關閉或行動按鈕都會移除通知', async () => {
		const wrapper = mountToaster()
		const store = useToastStore()
		const undo = vi.fn()
		store.success('已刪除群組', { action: { label: '復原', handler: undo } })
		await wrapper.vm.$nextTick()
		await wrapper.find('.toast__action').trigger('click')
		expect(undo).toHaveBeenCalledOnce()
		expect(store.items).toHaveLength(0)

		store.success('已儲存')
		await wrapper.vm.$nextTick()
		await wrapper.find('.toast__timer').trigger('animationend')
		expect(store.items).toHaveLength(0)

		store.error('失敗')
		await wrapper.vm.$nextTick()
		await wrapper.find('[aria-label="關閉通知"]').trigger('click')
		expect(store.items).toHaveLength(0)
		wrapper.unmount()
	})
})
