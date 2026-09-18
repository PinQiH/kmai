import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AuditRecordsPanel from '@/components/AuditRecordsPanel.vue'
import SystemEventsPanel from '@/components/SystemEventsPanel.vue'
import { useAssistantAuditStore } from '@/stores/assistantAudit'
import * as csv from '@/utils/csv'

globalThis.ResizeObserver = class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
} as typeof ResizeObserver

vi.mock('@/utils/csv', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/utils/csv')>()),
	downloadCsvFile: vi.fn(),
}))

async function mountPanel(component: typeof SystemEventsPanel | typeof AuditRecordsPanel): Promise<VueWrapper> {
	const pinia = createPinia()
	setActivePinia(pinia)
	const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
	await router.push('/admin/logs')
	const wrapper = mount(component, { global: { plugins: [pinia, router, createVuetify({ components, directives })] } })
	await flushPromises()
	return wrapper
}

function countText(wrapper: VueWrapper): string {
	return wrapper.get('.records-toolbar p').text()
}

describe('SystemEventsPanel', () => {
	beforeEach(() => {
		vi.mocked(csv.downloadCsvFile).mockClear()
	})

	it('should filter events and offer a reset when nothing matches', async () => {
		const wrapper = await mountPanel(SystemEventsPanel)
		expect(wrapper.find('[data-testid="system-event-table"]').exists()).toBe(true)

		await wrapper.get('input').setValue('完全不會出現的關鍵字')
		expect(countText(wrapper)).toBe('共 0 筆符合條件')
		expect(wrapper.text()).toContain('找不到符合條件的系統事件')

		await wrapper.findAll('button').find((button) => button.text() === '清除所有篩選')!.trigger('click')
		expect(wrapper.find('[data-testid="system-event-table"]').exists()).toBe(true)
	})

	it('should export the filtered events and record the export in the audit trail', async () => {
		const wrapper = await mountPanel(SystemEventsPanel)
		const total = Number(countText(wrapper).match(/\d+/)![0])

		await wrapper.get('[data-testid="export-system-events"]').trigger('click')

		expect(csv.downloadCsvFile).toHaveBeenCalledWith(expect.stringMatching(/^system-events-\d{8}-\d{4}\.csv$/), expect.stringContaining('"時間","類別","事件"'))
		expect(useAssistantAuditStore().inspectionRecords[0]).toMatchObject({ operationScope: 'system_event.export' })
		expect(useAssistantAuditStore().inspectionRecords[0]?.summary).toContain(`${total} 筆`)
	})
})

describe('AuditRecordsPanel', () => {
	beforeEach(() => {
		vi.mocked(csv.downloadCsvFile).mockClear()
	})

	it('should show a filtered empty state with a reset action', async () => {
		const wrapper = await mountPanel(AuditRecordsPanel)

		await wrapper.get('input').setValue('完全不會出現的關鍵字')

		expect(wrapper.text()).toContain('找不到符合條件的操作稽核')
		await wrapper.findAll('button').find((button) => button.text() === '清除篩選')!.trigger('click')
		expect(wrapper.find('[data-testid="audit-record-table"]').exists()).toBe(true)
	})

	it('should export audit rows without question content', async () => {
		const wrapper = await mountPanel(AuditRecordsPanel)

		await wrapper.get('[data-testid="export-audit-records"]').trigger('click')

		const [, content] = vi.mocked(csv.downloadCsvFile).mock.calls[0]!
		expect(content.split('\r\n')[0]).toBe('"操作時間","操作者","帳號","來源 IP","操作項目","操作代碼","操作對象","對象代碼","結果","Request ID"')
		expect(useAssistantAuditStore().inspectionRecords[0]).toMatchObject({ operationScope: 'audit_record.export' })
	})
})
