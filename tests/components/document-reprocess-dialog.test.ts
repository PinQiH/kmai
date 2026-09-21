import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { defineComponent, h, ref } from 'vue'
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

type ProcessingMock = typeof import('@/mocks/documentProcessing')

// NOTE: 處理紀錄是模組層級的 reactive 狀態，每個測試重新載入模組避免互相污染
async function mountDialog(documentId: string, initialScope?: string): Promise<{ wrapper: VueWrapper; processing: ProcessingMock; done: ReturnType<typeof vi.fn> }> {
	vi.resetModules()
	const processing = await import('@/mocks/documentProcessing')
	const { default: DocumentReprocessDialog } = await import('@/components/DocumentReprocessDialog.vue')
	const record = processing.getDocumentProcessingRecord(documentId)
	const done = vi.fn()
	const isOpen = ref(false)
	// @ 對話框只在「開啟」時計算預設值，所以先掛載再打開
	const Host = defineComponent({
		render: () => h(DocumentReprocessDialog, {
			modelValue: isOpen.value,
			'onUpdate:modelValue': (value: boolean) => { isOpen.value = value },
			record,
			title: '測試文件',
			initialScope,
			onDone: done,
		}),
	})
	const wrapper = mount(Host, { attachTo: document.body, global: { plugins: [createVuetify({ components, directives })] } })
	isOpen.value = true
	await flushPromises()
	return { wrapper, processing, done }
}

function dialogText(): string {
	return document.querySelector('.v-overlay--active .v-card')?.textContent ?? ''
}

function selectedValue(testId: string): string {
	return document.querySelector(`[data-testid="${testId}"] .v-select__selection-text`)?.textContent?.trim() ?? ''
}

describe('DocumentReprocessDialog', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
	})

	it('should offer every scope when the document has attachments', async () => {
		await mountDialog('doc-001')

		expect(dialogText()).toContain('重新處理「測試文件」')
		expect(selectedValue('reprocess-scope')).toBe('整份文件（主文件＋2 個附件）')
		expect(document.querySelector('[data-testid="reprocess-from-stage"]')).not.toBeNull()
	})

	it('should hide the scope selector when the document has no attachments', async () => {
		await mountDialog('doc-002')

		expect(document.querySelector('[data-testid="reprocess-scope"]')).toBeNull()
		expect(dialogText()).toContain('所有步驟都會重跑。')
	})

	it('should honour the initial attachment scope', async () => {
		await mountDialog('doc-001', 'doc-001-att-1')

		expect(selectedValue('reprocess-scope')).toBe('附件：國內出差申請單.docx')
	})

	it('should fall back to the whole document for an unknown initial scope', async () => {
		await mountDialog('doc-001', 'not-a-file')

		expect(selectedValue('reprocess-scope')).toBe('整份文件（主文件＋2 個附件）')
	})

	it('should queue the job and report back when confirmed', async () => {
		const { processing, done } = await mountDialog('doc-002')

		document.querySelector<HTMLButtonElement>('[data-testid="reprocess-confirm"]')!.click()
		await flushPromises()

		expect(done).toHaveBeenCalledOnce()
		expect(done.mock.calls[0]![0]).toContain('「測試文件」')
		expect(done.mock.calls[0]![0]).toContain('重新排入示範佇列')
		expect(processing.getDocumentProcessingRecord('doc-002')!.reviewNote).toContain('已排入重新處理')
	})

	it('should close without queuing anything when cancelled', async () => {
		const { processing, done } = await mountDialog('doc-002')
		const before = processing.getDocumentProcessingRecord('doc-002')!.reviewNote

		const cancel = [...document.querySelectorAll<HTMLButtonElement>('.v-overlay--active button')].find((button) => button.textContent?.trim() === '取消')
		cancel!.click()
		await flushPromises()

		expect(done).not.toHaveBeenCalled()
		expect(processing.getDocumentProcessingRecord('doc-002')!.reviewNote).toBe(before)
	})
})
