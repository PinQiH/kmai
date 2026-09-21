import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { defineComponent, h } from 'vue'
import { RouterView, createMemoryHistory, createRouter, type Router } from 'vue-router'
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

type SettingsMock = typeof import('@/mocks/systemSettings')

interface Mounted {
	wrapper: VueWrapper
	settings: SettingsMock
	router: Router
	pinia: Pinia
	toasts: () => string[]
}

// NOTE: 設定是模組層級的 reactive 狀態，每個測試重新載入模組避免互相污染
async function mountView(query = ''): Promise<Mounted> {
	vi.resetModules()
	const settings = await import('@/mocks/systemSettings')
	const { default: AdminSettingsView } = await import('@/views/admin/AdminSettingsView.vue')
	const { useToastStore } = await import('@/stores/toast')
	const pinia = createPinia()
	setActivePinia(pinia)
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ path: '/admin/settings', component: AdminSettingsView, meta: { title: '系統設定' } },
			{ path: '/admin', component: { render: () => h('div', { 'data-testid': 'other-page' }) } },
		],
	})
	await router.push(`/admin/settings${query}`)
	await router.isReady()
	// @ 用 RouterView 掛載，onBeforeRouteLeave 才會生效
	const Host = defineComponent({ render: () => h(RouterView) })
	const wrapper = mount(Host, {
		attachTo: document.body,
		global: { plugins: [pinia, createVuetify({ components, directives }), router] },
	})
	await flushPromises()
	const toastStore = useToastStore()
	return { wrapper, settings, router, pinia, toasts: () => toastStore.items.map((item) => item.title) }
}

function findButton(wrapper: VueWrapper, text: string) {
	const button = wrapper.findAll('button').find((item) => item.text().trim() === text)
	if (!button) throw new Error(`找不到按鈕「${text}」`)
	return button
}

function inputByLabel(wrapper: VueWrapper, label: string) {
	const field = wrapper.findAll('.v-input').find((item) => item.find('label').exists() && item.find('label').text() === label)
	if (!field) throw new Error(`找不到欄位「${label}」`)
	return field.find('input, textarea')
}

async function clickDialogButton(text: string): Promise<void> {
	const button = [...document.querySelectorAll<HTMLButtonElement>('.v-overlay--active .v-card button')].find((item) => item.textContent?.trim() === text)
	if (!button) throw new Error(`對話框內找不到按鈕「${text}」`)
	button.click()
	await flushPromises()
}

describe('AdminSettingsView', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		localStorage.clear()
	})

	it('should publish the brand after editing the system name', async () => {
		const { wrapper, settings, toasts } = await mountView()

		await inputByLabel(wrapper, '系統名稱').setValue('知識平台')
		expect(wrapper.find('[aria-label="品牌預覽"]').text()).toContain('知識平台')

		await wrapper.find('form').trigger('submit')

		expect(settings.settingsState.brand.systemName).toBe('知識平台')
		expect(document.title).toBe('系統設定｜知識平台')
		expect(toasts()[0]).toContain('品牌外觀已發布')
	})

	it('should keep the published brand when the form has errors', async () => {
		const { wrapper, settings, toasts } = await mountView()
		const original = settings.settingsState.brand.systemName

		await inputByLabel(wrapper, '系統名稱').setValue('')
		await wrapper.find('form').trigger('submit')

		expect(settings.settingsState.brand.systemName).toBe(original)
		expect(toasts()).toContain('品牌外觀有欄位需要修正。')
	})

	it('should revert unsaved brand edits', async () => {
		const { wrapper, settings } = await mountView()
		const original = settings.settingsState.brand.systemName

		await inputByLabel(wrapper, '系統名稱').setValue('暫時的名稱')
		await findButton(wrapper, '還原').trigger('click')

		expect((inputByLabel(wrapper, '系統名稱').element as HTMLInputElement).value).toBe(original)
	})

	it('should publish the pending draft and create the next release draft', async () => {
		const { wrapper, settings, toasts } = await mountView('?tab=releases')

		// @ 先發布既有的 0.3.0 草稿，新增版本才會接在後面
		await findButton(wrapper, '發布版本').trigger('click')
		expect(settings.settingsState.releases.find((release) => release.id === 'rel-030')?.status).toBe('published')

		await findButton(wrapper, '新增版本').trigger('click')
		expect((inputByLabel(wrapper, '版本號').element as HTMLInputElement).value).toBe('0.4.0')
		await inputByLabel(wrapper, '摘要').setValue('新增系統設定頁')
		await wrapper.find('form.detail-pane textarea').setValue('- 新增系統設定頁')
		await wrapper.find('form.detail-pane').trigger('submit')

		const draft = settings.settingsState.releases.find((release) => release.version === '0.4.0')
		expect(draft?.status).toBe('draft')
		expect(toasts()).toContain('已建立版本 0.4.0 草稿，發布前使用者看不到。')
	})

	it('should ask before discarding release edits when switching versions', async () => {
		const { wrapper } = await mountView('?tab=releases')

		await inputByLabel(wrapper, '摘要').setValue('尚未儲存的摘要')
		const otherRelease = wrapper.findAll('.item-row').find((row) => row.text().includes('0.2.0'))
		await otherRelease!.trigger('click')
		await flushPromises()

		expect(document.querySelector('.v-overlay--active')?.textContent).toContain('放棄這個版本的修改？')

		await clickDialogButton('放棄並切換')

		expect(wrapper.find('.detail-pane h2').text()).toBe('版本 0.2.0')
	})

	it('should delete a release draft after confirmation', async () => {
		const { wrapper, settings, toasts } = await mountView('?tab=releases')

		await findButton(wrapper, '刪除草稿').trigger('click')
		await flushPromises()
		await clickDialogButton('刪除')

		expect(settings.settingsState.releases.some((release) => release.id === 'rel-030')).toBe(false)
		expect(toasts()).toContain('已刪除版本 0.3.0 草稿。')
	})

	it('should save, discard and publish the privacy policy', async () => {
		const { wrapper, settings, toasts } = await mountView('?tab=privacy')
		const revision = settings.settingsState.privacy.revision
		const editor = wrapper.find('.privacy-pane textarea')

		await editor.setValue('# 隱私權政策\n\n草稿內容')
		await findButton(wrapper, '儲存草稿').trigger('click')
		expect(settings.settingsState.privacyDraft?.content).toBe('# 隱私權政策\n\n草稿內容')

		await findButton(wrapper, '捨棄草稿').trigger('click')
		expect(settings.settingsState.privacyDraft).toBeNull()
		expect(toasts()).toContain('已捨棄草稿，編輯區還原為目前發布內容。')

		await editor.setValue('# 隱私權政策\n\n第二版')
		await findButton(wrapper, '發布').trigger('click')
		await flushPromises()
		await clickDialogButton('發布')

		expect(settings.settingsState.privacy.revision).toBe(revision + 1)
		expect(settings.settingsState.privacy.content).toBe('# 隱私權政策\n\n第二版')
	})

	it('should block navigation while there are unsaved changes until confirmed', async () => {
		const { wrapper, router } = await mountView()

		await inputByLabel(wrapper, '系統名稱').setValue('尚未發布')
		await router.push('/admin')
		await flushPromises()

		expect(router.currentRoute.value.path).toBe('/admin/settings')
		expect(document.querySelector('.v-overlay--active')?.textContent).toContain('有未儲存的設定')

		await clickDialogButton('放棄修改並離開')

		// @ 對話框關閉後才會真正導覽，等路由切換完成
		await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/admin'))
	})

	it('should leave freely when nothing has changed', async () => {
		const { router } = await mountView()

		await router.push('/admin')
		await flushPromises()

		expect(router.currentRoute.value.path).toBe('/admin')
	})
})
