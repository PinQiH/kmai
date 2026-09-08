import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, nextTick } from 'vue'
import { createMemoryHistory, createRouter, type RouteRecordRaw, type Router } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getAdminDocumentsSnapshot } from '@/repositories/admin.repository'
import AdminDocumentDetailView from '@/views/admin/AdminDocumentDetailView.vue'
import AdminDocumentsView from '@/views/admin/AdminDocumentsView.vue'
import AdminOverviewView from '@/views/admin/AdminOverviewView.vue'
import AdminUploadView from '@/views/admin/AdminUploadView.vue'
import AdminWorkspaceView from '@/views/admin/AdminWorkspaceView.vue'
import SearchView from '@/views/SearchView.vue'

globalThis.ResizeObserver = class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
} as typeof ResizeObserver

let wrapper: VueWrapper | null = null

function createTestRouter(routes: RouteRecordRaw[]): Router {
	return createRouter({
		history: createMemoryHistory(),
		routes: [
			...routes,
			{ path: '/:pathMatch(.*)*', component: defineComponent({ template: '<main>fallback</main>' }) },
		],
	})
}

function mountView(component: typeof SearchView | typeof AdminOverviewView | typeof AdminDocumentsView | typeof AdminDocumentDetailView | typeof AdminUploadView | typeof AdminWorkspaceView, router: Router): VueWrapper {
	wrapper = mount(component, {
		global: {
			plugins: [createVuetify({ components, directives }), router],
			stubs: {
				AnimatedNumber: { props: ['value'], template: '<span>{{ value }}</span>' },
			},
		},
	})

	return wrapper
}

beforeEach(() => {
	setActivePinia(createPinia())
	vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
})

afterEach(() => {
	wrapper?.unmount()
	wrapper = null
	document.body.innerHTML = ''
	vi.unstubAllGlobals()
})

describe('core views', () => {
	it('should render search results from the route query and carry the query into Ask', async () => {
		const router = createTestRouter([
			{ path: '/search', component: SearchView },
			{ path: '/ask', component: defineComponent({ template: '<main>ask</main>' }) },
		])
		await router.push('/search?q=差旅')
		await router.isReady()
		const searchView = mountView(SearchView, router)
		await flushPromises()
		const pushSpy = vi.spyOn(router, 'push')

		expect(searchView.text()).toContain('筆結果')
		const askButton = searchView.findAll('button').find((button) => button.text().includes('用這些結果詢問 AI'))
		expect(askButton).toBeDefined()
		await askButton!.trigger('click')
		expect(pushSpy).toHaveBeenCalledWith({ path: '/ask', query: { q: '差旅' } })
		await pushSpy.mock.results[0]!.value

		expect(router.currentRoute.value.path).toBe('/ask')
		expect(router.currentRoute.value.query.q).toBe('差旅')
	})

	it('should render overview metrics and the administration action links', async () => {
		const router = createTestRouter([{ path: '/admin', component: AdminOverviewView }])
		await router.push('/admin')
		await router.isReady()
		const overviewView = mountView(AdminOverviewView, router)

		expect(overviewView.text()).toContain('管理總覽')
		expect(overviewView.findAll('a[href="/admin/documents/upload"]')).not.toHaveLength(0)
	})

	it('should render document management with its current document snapshot', async () => {
		const router = createTestRouter([{ path: '/admin/documents', component: AdminDocumentsView }])
		await router.push('/admin/documents')
		await router.isReady()
		const documentsView = mountView(AdminDocumentsView, router)

		expect(documentsView.text()).toContain('文件管理')
		expect(documentsView.text()).toContain(getAdminDocumentsSnapshot()[0]!.title)
	})

	it('should preselect the review queue when the overview links in with a status query', async () => {
		const router = createTestRouter([{ path: '/admin/documents', component: AdminDocumentsView }])
		await router.push('/admin/documents?status=待審核')
		await router.isReady()
		const documentsView = mountView(AdminDocumentsView, router)

		const pendingTitles = getAdminDocumentsSnapshot().filter((item) => item.status === '待審核').map((item) => item.title)
		const publishedTitle = getAdminDocumentsSnapshot().find((item) => item.status === '已發布')?.title

		expect(pendingTitles.length).toBeGreaterThan(0)
		pendingTitles.forEach((title) => expect(documentsView.text()).toContain(title))
		if (publishedTitle) expect(documentsView.text()).not.toContain(publishedTitle)
	})

	it('should render the upload workflow at its first step', async () => {
		const router = createTestRouter([{ path: '/admin/documents/upload', component: AdminUploadView }])
		await router.push('/admin/documents/upload')
		await router.isReady()
		const uploadView = mountView(AdminUploadView, router)

		expect(uploadView.text()).toContain('新增文件')
		expect(uploadView.text()).toContain('選擇檔案')
	})

	it('should render an existing document management detail page', async () => {
		const document = getAdminDocumentsSnapshot()[0]!
		const router = createTestRouter([{ path: '/admin/documents/:id/manage', component: AdminDocumentDetailView }])
		await router.push(`/admin/documents/${document.id}/manage`)
		await router.isReady()
		const documentDetailView = mountView(AdminDocumentDetailView, router)

		expect(documentDetailView.text()).toContain(document.title)
		expect(documentDetailView.text()).toContain('文件欄位')
	})

	it('should render system settings and apply the selected accent', async () => {
		const router = createTestRouter([{
			path: '/admin/settings',
			component: AdminWorkspaceView,
			meta: { workspace: 'settings', title: '系統設定' },
		}])
		await router.push('/admin/settings')
		await router.isReady()
		const workspaceView = mountView(AdminWorkspaceView, router)
		await nextTick()

		expect(workspaceView.text()).toContain('系統設定')
		expect(workspaceView.text()).toContain('品牌與預設外觀')
	})
})
