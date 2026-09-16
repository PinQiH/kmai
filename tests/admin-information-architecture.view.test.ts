import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'

import AdminMonitoringView from '@/views/admin/AdminMonitoringView.vue'
import AdminNotificationsView from '@/views/admin/AdminNotificationsView.vue'
import AdminProcessingView from '@/views/admin/AdminProcessingView.vue'

globalThis.ResizeObserver = class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
} as typeof ResizeObserver

Object.defineProperty(globalThis, 'visualViewport', {
	configurable: true,
	value: {
		addEventListener: () => undefined,
		height: 768,
		offsetLeft: 0,
		offsetTop: 0,
		removeEventListener: () => undefined,
		width: 1024,
	} satisfies Partial<VisualViewport>,
})

function createTestVuetify() {
	return createVuetify({ components, directives })
}

async function mountAdminView(component: object, path: string, routes: Array<{ path: string; component: object }>) {
	const pinia = createPinia()
	setActivePinia(pinia)
	const router = createRouter({ history: createMemoryHistory(), routes })
	await router.push(path)
	await router.isReady()
	const wrapper = mount(
		{
			components: { AdminView: component },
			template: '<VApp><AdminView /></VApp>',
		},
		{ global: { plugins: [pinia, createTestVuetify(), router] } },
	)
	await flushPromises()
	return { wrapper, router }
}

describe('admin information architecture', () => {
	it('should position document processing around attention, all jobs and global strategy', async () => {
		const { wrapper } = await mountAdminView(AdminProcessingView, '/admin/processing', [
			{ path: '/admin/processing', component: AdminProcessingView },
			{ path: '/admin/documents/:id/manage', component: { template: '<div />' } },
		])
		const tabLabels = wrapper.findAll('[role="tab"]').map((tab) => tab.text())

		expect(wrapper.text()).toContain('文件處理')
		expect(tabLabels.some((label) => label.includes('需要處理'))).toBe(true)
		expect(tabLabels).toContain('全部工作')
		expect(tabLabels).toContain('處理策略')
		expect(wrapper.text()).toContain('這裡只顯示失敗、部分附件失敗、等待過久，或策略已變更待重新處理的工作')
		expect(wrapper.text()).not.toContain('新增切塊')
	})

	it('should open the all-jobs tab when the upload flow links in with a tab query', async () => {
		const { wrapper } = await mountAdminView(AdminProcessingView, '/admin/processing?tab=all', [
			{ path: '/admin/processing', component: AdminProcessingView },
			{ path: '/admin/documents/:id/manage', component: { template: '<div />' } },
		])

		const selectedTab = wrapper.findAll('[role="tab"]').find((tab) => tab.classes().includes('v-tab--selected'))

		expect(selectedTab?.text()).toBe('全部工作')
		expect(wrapper.text()).not.toContain('這裡只顯示失敗、部分附件失敗、等待過久，或策略已變更待重新處理的工作')
	})

	it('should show and clear the document filter when linked from document details', async () => {
		const { wrapper, router } = await mountAdminView(AdminProcessingView, '/admin/processing?tab=all&documentId=doc-003', [
			{ path: '/admin/processing', component: AdminProcessingView },
			{ path: '/admin/documents/:id/manage', component: { template: '<div />' } },
		])
		const filterChip = wrapper.get('[data-testid="processing-document-filter-doc-003"]')

		expect(filterChip.text()).toContain('文件：客戶資料存取與分享規範')
		await filterChip.get('.v-chip__close').trigger('click')
		await vi.waitFor(() => expect(router.currentRoute.value.query.documentId).toBeUndefined())
		expect(wrapper.find('[data-testid="processing-document-filter-doc-003"]').exists()).toBe(false)
	})

	it('should keep operational monitoring focused on detection and leave delivery to notifications', async () => {
		const { wrapper } = await mountAdminView(AdminMonitoringView, '/admin/monitoring', [
			{ path: '/admin/monitoring', component: AdminMonitoringView },
		])
		const tabLabels = wrapper.findAll('[role="tab"]').map((tab) => tab.text())

		// 順序＝現在怎麼了 → 要處理什麼 → 怎麼判定 → 診斷 → 細節；VWindowItem 需同序，否則切換動畫方向會相反
		expect(tabLabels).toEqual(['系統概況', '目前告警', '告警規則', '服務指標', '日誌查詢'])
		expect(wrapper.text()).not.toContain('通知設定')
		expect(wrapper.text()).not.toContain('SMTP 主機')
		// 回答品質屬於知識管理員的閉環，放在回饋與問題頁
		expect(wrapper.text()).not.toContain('回答滿意度')
	})

	it('should keep SMTP settings separate from per-rule notification channels', async () => {
		const { wrapper } = await mountAdminView(AdminNotificationsView, '/admin/notifications?tab=delivery', [
			{ path: '/admin/notifications', component: AdminNotificationsView },
			{ path: '/admin/monitoring', component: { template: '<div />' } },
		])
		const tabLabels = wrapper.findAll('[role="tab"]').map((tab) => tab.text())

		expect(tabLabels).toEqual(['發送紀錄', '自動通知', 'SMTP 設定'])
		expect(wrapper.text()).not.toContain('Email 收件人群組')
		expect(wrapper.text()).toContain('Email 寄件設定')
		expect(wrapper.text()).toContain('SMTP 主機')
		expect(wrapper.text()).toContain('告警解除時也寄信通知')
	})

	it('should show configurable delivery channels on every automatic rule', async () => {
		const { wrapper } = await mountAdminView(AdminNotificationsView, '/admin/notifications?tab=rules', [
			{ path: '/admin/notifications', component: AdminNotificationsView },
			{ path: '/admin/monitoring', component: { template: '<div />' } },
		])

		// 告警通知已併入自動通知，規則同時涵蓋文件事件與系統告警
		expect(wrapper.text()).toContain('系統事件發生時通知誰、走哪些管道，包含營運監控的系統告警')
		expect(wrapper.text()).toContain('站內小鈴鐺')
		await wrapper.findAll('button').find((button) => button.text() === '編輯')?.trigger('click')
		await flushPromises()

		const dialogText = document.querySelector('.v-dialog')?.textContent ?? ''
		expect(dialogText).toContain('通知管道')
		expect(dialogText).toContain('站內小鈴鐺')
		expect(dialogText).toContain('Email')

		const triggerEventSelect = wrapper
			.findAllComponents({ name: 'VSelect' })
			.find((select) => select.props('label') === '觸發事件')
		const triggerEventItems = triggerEventSelect?.props('items') as Array<{ title: string; value: string }> | undefined
		expect(triggerEventItems).toEqual(expect.arrayContaining([
			{ title: '系統告警：告警觸發', value: 'system-alert-triggered' },
			{ title: '系統告警：告警解除', value: 'system-alert-resolved' },
			{ title: '系統事件：維護通知', value: 'system-maintenance' },
		]))
	})
})
