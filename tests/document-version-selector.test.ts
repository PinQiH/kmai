import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { describe, expect, it } from 'vitest'

import DocumentVersionSelector from '@/components/DocumentVersionSelector.vue'
import type { DocumentVersionEntry } from '@/types'

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

function createVersions(count = 20): DocumentVersionEntry[] {
	return Array.from({ length: count }, (_, index) => {
		const versionNumber = count - index
		return {
			version: `${versionNumber}.0`,
			date: `2026-01-${String(versionNumber).padStart(2, '0')}`,
			author: index % 2 === 0 ? '張雅雯' : '王大明',
			summary: `第 ${versionNumber}.0 版調整內容與適用範圍。`,
			changes: [`更新第 ${versionNumber}.0 版內容`],
			isCurrent: index === 0,
		}
	})
}

function mountSelector({
	modelValue = '20.0',
	versions = createVersions(),
}: {
	modelValue?: string
	versions?: DocumentVersionEntry[]
} = {}) {
	return mount(DocumentVersionSelector, {
		props: { modelValue, versions },
		global: {
			plugins: [createVuetify({ components, directives })],
		},
	})
}

describe('DocumentVersionSelector', () => {
	it('should keep twenty versions compact before history is expanded', () => {
		const wrapper = mountSelector()

		expect(wrapper.text()).toContain('1 / 20')
		expect(wrapper.get('[data-testid="version-newer"]').attributes('disabled')).toBeDefined()
		expect(wrapper.get('[data-testid="version-older"]').attributes('disabled')).toBeUndefined()
		expect(wrapper.find('.version-history').exists()).toBe(false)
		expect(wrapper.get('[data-testid="version-history-toggle"]').attributes('aria-expanded')).toBe('false')
	})

	it('should emit adjacent versions without moving beyond the available range', async () => {
		const wrapper = mountSelector({ modelValue: '19.0' })

		await wrapper.get('[data-testid="version-newer"]').trigger('click')
		await wrapper.get('[data-testid="version-older"]').trigger('click')

		expect(wrapper.emitted('update:modelValue')).toEqual([['20.0'], ['18.0']])

		await wrapper.setProps({ modelValue: '1.0' })
		expect(wrapper.get('[data-testid="version-older"]').attributes('disabled')).toBeDefined()
	})

	it('should progressively reveal a twenty-version history and select a row', async () => {
		const wrapper = mountSelector()

		await wrapper.get('[data-testid="version-history-toggle"]').trigger('click')
		expect(wrapper.findAll('.version-history-row')).toHaveLength(5)
		expect(wrapper.get('[data-testid="version-history-toggle"]').attributes('aria-expanded')).toBe('true')

		await wrapper.get('[data-testid="version-history-more"]').trigger('click')
		expect(wrapper.findAll('.version-history-row')).toHaveLength(20)
		expect(wrapper.get('[data-testid="version-history-more"]').text()).toContain('收合較舊版本')

		await wrapper.get('[data-testid="version-history-10.0"]').trigger('click')
		expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['10.0'])

		await wrapper.get('[data-testid="version-history-more"]').trigger('click')
		expect(wrapper.findAll('.version-history-row')).toHaveLength(5)
	})

	it('should connect labels and disclosure controls to unique targets', async () => {
		const wrapper = mountSelector()
		const label = wrapper.get('.version-field label')
		const input = wrapper.get('.version-field input')
		const historyToggle = wrapper.get('[data-testid="version-history-toggle"]')

		expect(label.attributes('for')).toBe(input.attributes('id'))
		await historyToggle.trigger('click')
		expect(wrapper.get(`#${historyToggle.attributes('aria-controls')}`).exists()).toBe(true)

		const moreToggle = wrapper.get('[data-testid="version-history-more"]')
		expect(wrapper.get(`#${moreToggle.attributes('aria-controls')}`).exists()).toBe(true)
		expect(wrapper.get('.version-step-actions').attributes('role')).toBe('group')
	})

	it('should emit a version selected from the primary autocomplete', async () => {
		const wrapper = mountSelector()
		const autocomplete = wrapper.findComponent(components.VAutocomplete)

		autocomplete.vm.$emit('update:modelValue', '19.0')
		await wrapper.vm.$nextTick()

		expect(wrapper.emitted('update:modelValue')).toEqual([['19.0']])
	})

	it('should place the current version first when incoming versions are unordered', async () => {
		const versions = [
			{ ...createVersions(3)[2], version: '1.0', date: '2025-01-01', isCurrent: false },
			{ ...createVersions(3)[0], version: '3.0', date: '2026-01-03', isCurrent: true },
			{ ...createVersions(3)[1], version: '2.0', date: '2026-01-02', isCurrent: false },
		]
		const wrapper = mountSelector({ modelValue: '3.0', versions })

		await wrapper.get('[data-testid="version-history-toggle"]').trigger('click')
		const versionRows = wrapper.findAll('.version-history-row')

		expect(wrapper.text()).toContain('1 / 3')
		expect(versionRows.map((row) => row.text())).toEqual([
			expect.stringContaining('第 3.0 版'),
			expect.stringContaining('第 2.0 版'),
			expect.stringContaining('第 1.0 版'),
		])
	})

	it('should show an empty state when no versions are available', () => {
		const wrapper = mountSelector({ modelValue: '', versions: [] })

		expect(wrapper.text()).toContain('尚無可供閱讀的版本紀錄')
		expect(wrapper.find('[data-testid="version-select"]').exists()).toBe(false)
	})
})
