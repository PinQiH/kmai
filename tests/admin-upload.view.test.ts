import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import AdminUploadView from '@/views/admin/AdminUploadView.vue'

globalThis.ResizeObserver = class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
} as typeof ResizeObserver

let wrapper: VueWrapper | null = null

function mountView(): VueWrapper {
	wrapper = mount(AdminUploadView, {
		global: {
			plugins: [createVuetify({ components, directives })],
			stubs: {
				PageHeader: { template: '<header><slot name="actions" /></header>' },
				RouterLink: true,
			},
		},
	})
	return wrapper
}

async function selectFile(view: VueWrapper, file: File, testId = 'document-file-input'): Promise<void> {
	const input = view.get(`[data-testid="${testId}"]`)
	Object.defineProperty(input.element, 'files', {
		configurable: true,
		value: [file],
	})
	await input.trigger('change')
}

beforeEach(() => {
	vi.useFakeTimers()
})

afterEach(() => {
	wrapper?.unmount()
	wrapper = null
	vi.useRealTimers()
})

describe('AdminUploadView', () => {
	it('should reject a file when it exceeds the 50 MB limit', async () => {
		const view = mountView()
		const oversizedFile = new File(['content'], 'oversized.pdf', { type: 'application/pdf' })
		Object.defineProperty(oversizedFile, 'size', { value: 50 * 1024 * 1024 + 1 })

		await selectFile(view, oversizedFile)

		expect(view.get('[data-testid="file-error"]').text()).toContain('oversized.pdf 超過 50 MB')
		expect(view.get('[data-testid="upload-next"]').attributes('disabled')).toBeDefined()
	})

	it('should complete the upload preview when a valid file is confirmed', async () => {
		const view = mountView()
		await selectFile(view, new File(['content'], 'travel-policy.pdf', { type: 'application/pdf' }))

		expect(view.text()).toContain('travel-policy.pdf')
		await view.get('[data-testid="upload-next"]').trigger('click')
		await flushPromises()
		expect(view.text()).toContain('文件資訊')

		await view.get('[data-testid="upload-next"]').trigger('click')
		await flushPromises()
		expect(view.text()).toContain('travel-policy')

		const submitted = view.get('[data-testid="upload-next"]').trigger('click')
		await vi.advanceTimersByTimeAsync(900)
		await submitted

		expect(view.text()).toContain('文件已加入處理佇列')
		expect(view.text()).toContain('查看處理進度')
	})

	it('should clear the sub category when the main category no longer contains it', async () => {
		const view = mountView()
		await selectFile(view, new File(['content'], 'policy.pdf', { type: 'application/pdf' }))
		await view.get('[data-testid="upload-next"]').trigger('click')
		await flushPromises()

		const subCategory = view.findComponent('[data-testid="sub-category"]')
		await subCategory.setValue('差旅與報支')
		expect(subCategory.props('modelValue')).toBe('差旅與報支')

		await view.findComponent('[data-testid="main-category"]').setValue('資訊安全')
		await flushPromises()

		expect(subCategory.props('modelValue')).toBeNull()
	})

	it('should keep a freely typed sub category when the main category changes', async () => {
		const view = mountView()
		await selectFile(view, new File(['content'], 'policy.pdf', { type: 'application/pdf' }))
		await view.get('[data-testid="upload-next"]').trigger('click')
		await flushPromises()

		const subCategory = view.findComponent('[data-testid="sub-category"]')
		await subCategory.setValue('  海外分公司規範  ')
		await flushPromises()
		expect(subCategory.props('modelValue')).toBe('海外分公司規範')

		await view.findComponent('[data-testid="main-category"]').setValue('資訊安全')
		await flushPromises()

		expect(subCategory.props('modelValue')).toBe('海外分公司規範')
	})

	it('should accept values that are absent from the searchable option lists', async () => {
		const view = mountView()
		await selectFile(view, new File(['content'], 'policy.pdf', { type: 'application/pdf' }))
		await view.get('[data-testid="upload-next"]').trigger('click')
		await flushPromises()

		const department = view.findComponent('[data-testid="department-select"]')
		await department.setValue('海外事業處')
		await view.findComponent('[data-testid="main-category"]').setValue('併購專案')
		await flushPromises()

		expect(department.props('modelValue')).toBe('海外事業處')
		expect(view.get('[data-testid="upload-next"]').attributes('disabled')).toBeUndefined()

		await view.get('[data-testid="upload-next"]').trigger('click')
		await flushPromises()
		expect(view.text()).toContain('海外事業處')
		expect(view.text()).toContain('併購專案')
	})

	it('should treat a whitespace-only main category as missing', async () => {
		const view = mountView()
		await selectFile(view, new File(['content'], 'policy.pdf', { type: 'application/pdf' }))
		await view.get('[data-testid="upload-next"]').trigger('click')
		await flushPromises()

		await view.findComponent('[data-testid="main-category"]').setValue('   ')
		await flushPromises()

		expect(view.get('[data-testid="upload-next"]').attributes('disabled')).toBeDefined()
	})

	it('should block the next step until a target is chosen for a scoped visibility', async () => {
		const view = mountView()
		await selectFile(view, new File(['content'], 'policy.pdf', { type: 'application/pdf' }))
		await view.get('[data-testid="upload-next"]').trigger('click')
		await flushPromises()

		await view.findComponent('[data-testid="visibility-select"]').setValue('指定使用者')
		await flushPromises()
		expect(view.get('[data-testid="upload-next"]').attributes('disabled')).toBeDefined()

		await view.findComponent('[data-testid="visibility-users"]').setValue(['user-001'])
		await flushPromises()
		expect(view.get('[data-testid="upload-next"]').attributes('disabled')).toBeUndefined()
	})

	it('should keep manually typed tags as trimmed unique entries', async () => {
		const view = mountView()
		await selectFile(view, new File(['content'], 'policy.pdf', { type: 'application/pdf' }))
		await view.get('[data-testid="upload-next"]').trigger('click')
		await flushPromises()

		const combobox = view.findComponent('[data-testid="tag-combobox"]')
		await combobox.setValue([' 差旅 ', '差旅', '報支'])
		await flushPromises()

		expect(combobox.props('modelValue')).toEqual(['差旅', '報支'])
	})

	it('should list an attachment and allow removing it', async () => {
		const view = mountView()
		await selectFile(view, new File(['content'], 'policy.pdf', { type: 'application/pdf' }))
		await view.get('[data-testid="upload-next"]').trigger('click')
		await flushPromises()

		await selectFile(view, new File(['sheet'], 'expense-form.xlsx'), 'attachment-input')
		expect(view.text()).toContain('expense-form.xlsx')

		await view.get('[aria-label="移除附件 expense-form.xlsx"]').trigger('click')
		await flushPromises()
		expect(view.text()).not.toContain('expense-form.xlsx')
	})
})
