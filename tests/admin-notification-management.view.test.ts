import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'

import { useAppStore } from '@/stores/app'
import { useAssistantAuditStore } from '@/stores/assistantAudit'
import { useNotificationsStore } from '@/stores/notifications'
import AdminNotificationsView from '@/views/admin/AdminNotificationsView.vue'
import AdminSystemRecordsView from '@/views/admin/AdminSystemRecordsView.vue'

globalThis.ResizeObserver = class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
} as typeof ResizeObserver

Object.defineProperty(globalThis, 'visualViewport', {
	configurable: true,
	value: {
		addEventListener: vi.fn(),
		dispatchEvent: vi.fn(() => true),
		height: 768,
		offsetLeft: 0,
		offsetTop: 0,
		onresize: null,
		onscroll: null,
		pageLeft: 0,
		pageTop: 0,
		removeEventListener: vi.fn(),
		scale: 1,
		width: 1024,
	} satisfies Partial<VisualViewport>,
})

function createTestVuetify() {
	return createVuetify({ components, directives })
}

describe('admin notification management views', () => {
	it('should expand the linked notification performance inside its record row', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const store = useNotificationsStore()
		const notification = store.notifications[0]
		expect(notification).toBeDefined()

		const router = createRouter({
			history: createMemoryHistory(),
			routes: [
				{ path: '/admin/notifications', component: AdminNotificationsView },
				{ path: '/admin/monitoring', component: { template: '<div />' } },
			],
		})
		await router.push(`/admin/notifications?notificationId=${notification!.id}`)
		await router.isReady()

		const wrapper = mount(AdminNotificationsView, {
			global: { plugins: [pinia, createTestVuetify(), router] },
		})
		await flushPromises()
		await nextTick()

		expect(wrapper.text()).not.toContain('成效分析')
		expect(wrapper.get('[data-testid="notification-performance-row"]').text()).toContain('查看率')
		expect(wrapper.get('[data-testid="notification-performance-row"]').text()).toContain('點擊率')
	})

	it('should present notifications and alerts in the read-only system records table', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [
				{ path: '/admin/logs', component: AdminSystemRecordsView },
				{ path: '/admin/notifications', component: { template: '<div />' } },
				{ path: '/admin/monitoring', component: { template: '<div />' } },
				{ path: '/admin/documents/:id/manage', component: { template: '<div />' } },
				{ path: '/admin/processing', component: { template: '<div />' } },
				{ path: '/admin/access', component: { template: '<div />' } },
				{ path: '/admin/graph', component: { template: '<div />' } },
				{ path: '/ask', component: { template: '<div />' } },
			],
		})
		await router.push('/admin/logs?tab=events')
		await router.isReady()

		const wrapper = mount(
			{
				components: { AdminSystemRecordsView },
				template: '<VApp><AdminSystemRecordsView /></VApp>',
			},
			{ global: { plugins: [pinia, createTestVuetify(), router] } },
		)
		await flushPromises()

		expect(wrapper.get('[data-testid="system-event-table"]').text()).toContain('通知')
		expect(wrapper.get('[data-testid="system-event-table"]').text()).toContain('告警')
		const eventCategories = wrapper
			.findAll('[data-event-category]')
			.map((chip) => chip.attributes('data-event-category'))
		expect(new Set(eventCategories).size).toBeGreaterThanOrEqual(5)
		expect(wrapper.text()).toContain('服務原始日誌請至「營運監控 → 日誌查詢」')
	})

	it('should open a linked question and append a content-safe inspection audit', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [
				{ path: '/admin/logs', component: AdminSystemRecordsView },
				{ path: '/admin/notifications', component: { template: '<div />' } },
				{ path: '/admin/monitoring', component: { template: '<div />' } },
				{ path: '/admin/documents/:id/manage', component: { template: '<div />' } },
				{ path: '/admin/processing', component: { template: '<div />' } },
				{ path: '/admin/access', component: { template: '<div />' } },
				{ path: '/admin/graph', component: { template: '<div />' } },
				{ path: '/ask', component: { template: '<div />' } },
			],
		})
		await router.push('/admin/logs?tab=questions&questionId=question-001')
		await router.isReady()

		const wrapper = mount(
			{
				components: { AdminSystemRecordsView },
				template: '<VApp><AdminSystemRecordsView /></VApp>',
			},
			{ global: { plugins: [pinia, createTestVuetify(), router] } },
		)
		await flushPromises()

		const drawer = wrapper.get('[data-testid="admin-question-drawer"]')
		expect(drawer.text()).toContain('國內出差住宿費用上限是多少？')
		expect(drawer.text()).toContain('Conversation ID')
		await drawer.get('button[aria-label="關閉問答詳情"]').trigger('click')
		await flushPromises()
		await nextTick()
		await flushPromises()
		await nextTick()
		await flushPromises()
		await vi.waitFor(() => expect(router.currentRoute.value.query.questionId).toBeUndefined())

		wrapper.unmount()
		await router.push('/admin/logs?tab=audit')
		const auditWrapper = mount(
			{
				components: { AdminSystemRecordsView },
				template: '<VApp><AdminSystemRecordsView /></VApp>',
			},
			{ global: { plugins: [pinia, createTestVuetify(), router] } },
		)
		await flushPromises()
		const auditTableText = auditWrapper.get('[data-testid="audit-record-table"]').text()
		expect(auditTableText).toContain('ai_question_content.inspect')
		expect(auditTableText).toContain('question-001')
		expect(auditTableText).not.toContain('國內出差住宿費用上限是多少？')
		expect(auditTableText).not.toContain('國內住宿每晚原則上限')
	})

	it('should audit an authorized assistant session inspection without copying conversation content', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const auditStore = useAssistantAuditStore()
		auditStore.startSession({
			sessionId: 'assistant-session-1',
			startedAt: '2026-08-31T08:00:00.000Z',
			userId: 'admin-001',
			userName: '系統管理員',
			department: '資訊部',
			modelLabel: 'Mock GPT',
		})
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [
				{ path: '/admin/logs', component: AdminSystemRecordsView },
				{ path: '/admin/notifications', component: { template: '<div />' } },
				{ path: '/admin/monitoring', component: { template: '<div />' } },
				{ path: '/admin/processing', component: { template: '<div />' } },
			],
		})
		await router.push('/admin/logs?tab=events&assistantSessionId=assistant-session-1')
		await router.isReady()

		const wrapper = mount(
			{
				components: { AdminSystemRecordsView },
				template: '<VApp><AdminSystemRecordsView /></VApp>',
			},
			{ global: { plugins: [pinia, createTestVuetify(), router] } },
		)
		await flushPromises()

		const detail = document.body.querySelector<HTMLElement>('[data-testid="assistant-audit-detail"]')
		expect(detail?.textContent).toContain('assistant-session-1')
		expect(auditStore.inspectionRecords[0]?.operationScope).toBe('admin_assistant_content.inspect')
		expect(auditStore.inspectionRecords[0]?.resourceLabel).toBe('assistant-session-1')
		expect(JSON.stringify(auditStore.inspectionRecords[0])).not.toContain('question')
		expect(JSON.stringify(auditStore.inspectionRecords[0])).not.toContain('answer')
		wrapper.unmount()
	})

	it('should deny an assistant session deep link to a knowledge administrator', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const appStore = useAppStore()
		const auditStore = useAssistantAuditStore()
		appStore.adminRole = 'knowledge-admin'
		auditStore.startSession({
			sessionId: 'assistant-session-1',
			startedAt: '2026-08-31T08:00:00.000Z',
			userId: 'admin-001',
			userName: '知識管理員',
			department: '知識管理部',
			modelLabel: 'Mock GPT',
		})
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [
				{ path: '/admin/logs', component: AdminSystemRecordsView },
				{ path: '/admin/notifications', component: { template: '<div />' } },
				{ path: '/admin/monitoring', component: { template: '<div />' } },
				{ path: '/admin/processing', component: { template: '<div />' } },
			],
		})
		await router.push('/admin/logs?tab=events&assistantSessionId=assistant-session-1')
		await router.isReady()

		const wrapper = mount(
			{
				components: { AdminSystemRecordsView },
				template: '<VApp><AdminSystemRecordsView /></VApp>',
			},
			{ global: { plugins: [pinia, createTestVuetify(), router] } },
		)
		await flushPromises()
		await nextTick()
		await flushPromises()

		expect(wrapper.find('[data-testid="assistant-audit-detail"]').exists()).toBe(false)
		await vi.waitFor(() => expect(router.currentRoute.value.query.assistantSessionId).toBeUndefined())
		expect(auditStore.inspectionRecords).toHaveLength(0)
	})

	it('should deny question content to a knowledge administrator even with a deep link', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const appStore = useAppStore()
		appStore.adminRole = 'knowledge-admin'
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [
				{ path: '/admin/logs', component: AdminSystemRecordsView },
				{ path: '/admin/notifications', component: { template: '<div />' } },
				{ path: '/admin/monitoring', component: { template: '<div />' } },
				{ path: '/admin/documents/:id/manage', component: { template: '<div />' } },
				{ path: '/admin/processing', component: { template: '<div />' } },
				{ path: '/admin/access', component: { template: '<div />' } },
				{ path: '/admin/graph', component: { template: '<div />' } },
				{ path: '/ask', component: { template: '<div />' } },
			],
		})
		await router.push('/admin/logs?tab=questions&questionId=question-001')
		await router.isReady()

		const wrapper = mount(
			{
				components: { AdminSystemRecordsView },
				template: '<VApp><AdminSystemRecordsView /></VApp>',
			},
			{ global: { plugins: [pinia, createTestVuetify(), router] } },
		)
		await flushPromises()
		await nextTick()
		await flushPromises()

		expect(wrapper.findAll('[role="tab"]').some((tab) => tab.text().includes('AI 問答紀錄'))).toBe(false)
		expect(wrapper.get('[data-testid="system-event-table"]').exists()).toBe(true)
		expect(wrapper.get('[data-testid="admin-question-drawer"]').text()).toBe('')
	})

	it('should show a dismissible message instead of opening a missing question', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [{ path: '/admin/logs', component: AdminSystemRecordsView }],
		})
		await router.push('/admin/logs?tab=questions&questionId=missing-question')
		await router.isReady()

		const wrapper = mount(
			{
				components: { AdminSystemRecordsView },
				template: '<VApp><AdminSystemRecordsView /></VApp>',
			},
			{ global: { plugins: [pinia, createTestVuetify(), router] } },
		)
		await flushPromises()

		expect(wrapper.get('[data-testid="system-record-route-message"]').text()).toContain('找不到 Question ID')
		expect(wrapper.get('[data-testid="admin-question-drawer"]').text()).toBe('')
	})
})
