import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getAdminDocumentsSnapshot } from '@/repositories/admin.repository'
import type { DocumentStatus } from '@/types'
import { getDocumentStatusPriority } from '@/utils/documentLifecycle'
import AdminDocumentDetailView from '@/views/admin/AdminDocumentDetailView.vue'
import AdminDocumentsView from '@/views/admin/AdminDocumentsView.vue'

globalThis.ResizeObserver = class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
} as typeof ResizeObserver

// @ jsdom 沒有 visualViewport，Vuetify 的 overlay 定位策略會直接取用，補上最小可用的替身。
if (!('visualViewport' in window)) {
	Object.defineProperty(window, 'visualViewport', {
		configurable: true,
		value: {
			width: 1280,
			height: 800,
			offsetLeft: 0,
			offsetTop: 0,
			scale: 1,
			addEventListener(): void {},
			removeEventListener(): void {},
		},
	})
}

let wrapper: VueWrapper | null = null

function createTestRouter(): Router {
	return createRouter({
		history: createMemoryHistory(),
		routes: [
			{ path: '/admin/documents', component: AdminDocumentsView },
			{ path: '/:pathMatch(.*)*', component: defineComponent({ template: '<main>fallback</main>' }) },
		],
	})
}

async function mountDocumentsView(): Promise<VueWrapper> {
	const router = createTestRouter()
	await router.push('/admin/documents')
	await router.isReady()

	wrapper = mount(AdminDocumentsView, {
		global: { plugins: [createVuetify({ components, directives }), router] },
		attachTo: window.document.body,
	})
	await flushPromises()
	// @ 文件清單改為非同步載入，等骨架消失代表第一次載入完成
	await vi.waitFor(() => expect(wrapper!.find('.v-skeleton-loader').exists()).toBe(false))
	return wrapper
}

/** 讀出列表目前顯示的文件標題順序。 */
function readVisibleTitles(view: VueWrapper): string[] {
	return view.findAll('.title-button').map((button) => button.text())
}

async function openAdvancedFilters(view: VueWrapper): Promise<void> {
	await view.find('[aria-controls="document-advanced-filters"]').trigger('click')
	await flushPromises()
}

async function selectFilter(view: VueWrapper, testId: string, optionLabel: string): Promise<void> {
	const select = view.findComponent(`[data-testid="${testId}"]`)
	await select.setValue(optionLabel)
	await flushPromises()
}

describe('AdminDocumentsView', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
	})

	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
	})

	it('should order documents so blocked ones come before finished ones', async () => {
		const view = await mountDocumentsView()

		const titles = readVisibleTitles(view)
		const statusByTitle = new Map(getAdminDocumentsSnapshot().map((document) => [document.title, document.status]))
		const priorities = titles.map((title) => getDocumentStatusPriority(statusByTitle.get(title) as DocumentStatus))

		expect(titles.length).toBeGreaterThan(1)
		expect(priorities).toEqual([...priorities].sort((left, right) => left - right))
	})

	it('should narrow the list by main category, sub category and unit', async () => {
		const view = await mountDocumentsView()
		await openAdvancedFilters(view)

		await selectFilter(view, 'filter-main-category', '人事與福利')
		expect(readVisibleTitles(view)).toEqual(['新進同仁到職指南', '年度績效評核常見問題'])

		await selectFilter(view, 'filter-sub-category', '績效考核')
		expect(readVisibleTitles(view)).toEqual(['年度績效評核常見問題'])

		await selectFilter(view, 'filter-department', '財務部')
		expect(view.text()).toContain('找不到符合條件的文件')
	})

	it('should show and filter by the knowledge topic each document belongs to', async () => {
		const view = await mountDocumentsView()

		expect(view.text()).toContain('知識主題／分類')
		expect(view.text()).toContain('資訊安全')

		await openAdvancedFilters(view)
		await selectFilter(view, 'filter-knowledge-topic', '人事流程')

		const titles = readVisibleTitles(view)
		expect(titles.length).toBeGreaterThan(0)
		titles.forEach((title) => {
			const document = getAdminDocumentsSnapshot().find((item) => item.title === title)
			expect(document?.knowledgeSourceId).toBe('benefits')
		})
		expect(view.text()).toContain('知識主題：人事流程')
	})

	it('should reset the sub category when it no longer belongs to the selected main category', async () => {
		const view = await mountDocumentsView()
		await openAdvancedFilters(view)

		await selectFilter(view, 'filter-sub-category', '績效考核')
		await selectFilter(view, 'filter-main-category', '資訊安全')

		expect(view.findComponent('[data-testid="filter-sub-category"]').props('modelValue')).toBe('全部小類別')
		expect(readVisibleTitles(view)).toEqual(['資訊安全教育訓練教材', '客戶資料存取與分享規範'])
	})

	it('should filter by a custom upload date range', async () => {
		const view = await mountDocumentsView()
		await openAdvancedFilters(view)

		await selectFilter(view, 'filter-uploaded-range', '自訂範圍')
		await view.find('[data-testid="filter-uploaded-from"] input').setValue('2026-08-01')
		await view.find('[data-testid="filter-uploaded-to"] input').setValue('2026-08-10')
		await flushPromises()

		expect(readVisibleTitles(view)).toEqual(['客戶資料存取與分享規範', '採購請款標準作業流程'])
		expect(view.text()).toContain('上傳時間：2026-08-01 至 2026-08-10')
	})

	it('should open the preview drawer in place instead of leaving the admin route', async () => {
		const view = await mountDocumentsView()

		await view.findAll('.title-button')[0]!.trigger('click')
		await flushPromises()

		const drawer = view.findComponent({ name: 'DocumentPreviewDrawer' })
		expect(drawer.props('modelValue')).toBe(true)
		expect(view.vm.$route.path).toBe('/admin/documents')
		expect(window.document.body.textContent).toContain('前台預覽')
	})

	it('should keep the list concise while showing visibility and status', async () => {
		const view = await mountDocumentsView()
		expect(view.text()).toContain('可見範圍')
		expect(view.text()).toContain('更新時間')
		expect(view.text()).not.toContain('第 2 / 4 步')
		expect(view.text()).not.toContain('檔案受密碼保護')
	})
})

describe('AdminDocumentDetailView', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
	})

	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
	})

	async function mountDetailView(documentId: string): Promise<VueWrapper> {
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [
				{ path: '/admin/documents/:id/manage', component: AdminDocumentDetailView },
				{ path: '/:pathMatch(.*)*', component: defineComponent({ template: '<main>fallback</main>' }) },
			],
		})
		await router.push(`/admin/documents/${documentId}/manage`)
		await router.isReady()

		wrapper = mount(AdminDocumentDetailView, {
			global: { plugins: [createVuetify({ components, directives }), router] },
			attachTo: window.document.body,
		})
		await flushPromises()
		return wrapper
	}

	it('should show where a pending document sits and what has already been processed', async () => {
		const view = await mountDetailView('doc-003')

		expect(view.text()).toContain('人工審核')
		await view.findAll('button').find((button) => button.text() === '處理進度')!.trigger('click')
		await flushPromises()
		expect(view.text()).toContain('系統處理步驟')
		// 有附件失敗時預設先顯示失敗的附件，切回主文件才看得到主文件步驟
		expect(view.text()).toContain('正在查看：舊版分級說明（掃描）.pdf')
		await view.get('[data-testid="processing-file-doc-003-main"]').trigger('click')
		expect(view.text()).toContain('42 / 42 區塊完成')
		expect(view.text()).toContain('核准並發布')
	})

	it('should preview the document without navigating away from the manage route', async () => {
		const view = await mountDetailView('doc-003')

		await view.findAll('button').find((button) => button.text().includes('預覽文件'))!.trigger('click')
		await flushPromises()

		expect(view.vm.$route.path).toBe('/admin/documents/doc-003/manage')
		expect(window.document.body.textContent).toContain('前台預覽')
	})
})
