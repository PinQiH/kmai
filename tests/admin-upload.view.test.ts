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

async function selectFile(view: VueWrapper, file: File): Promise<void> {
	const input = view.get('[data-testid="document-file-input"]')
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
})
