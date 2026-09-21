import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import { describe, expect, it } from 'vitest'

import FilterSearchField from '@/components/FilterSearchField.vue'

function mountField(props: Record<string, unknown>, attrs: Record<string, unknown> = {}) {
	return mount(FilterSearchField, { props: { modelValue: '', ...props }, attrs, global: { plugins: [createVuetify({ components })] } })
}

describe('FilterSearchField', () => {
	it('should emit the typed keyword', async () => {
		const wrapper = mountField({ label: '搜尋角色' })

		await wrapper.get('input').setValue('審核')

		expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['審核'])
	})

	it('should emit an empty string instead of null when cleared', async () => {
		const wrapper = mountField({ modelValue: '審核', label: '搜尋角色' })

		await wrapper.get('.v-field__clearable .v-icon').trigger('click')

		expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
	})

	it('should fall back to the placeholder for the accessible name', () => {
		const wrapper = mountField({ placeholder: '搜尋名稱或別名' })

		expect(wrapper.get('input').attributes('aria-label')).toBe('搜尋名稱或別名')
	})

	it('should prefer an explicit aria label and pass other attributes through', () => {
		const wrapper = mountField({ placeholder: '搜尋問題', ariaLabel: '搜尋待處理案件' }, { density: 'compact', 'data-testid': 'queue-search' })

		expect(wrapper.get('input').attributes('aria-label')).toBe('搜尋待處理案件')
		expect(wrapper.classes()).toContain('v-input--density-compact')
		expect(wrapper.attributes('data-testid')).toBe('queue-search')
	})

	it('should treat a null model value as empty', () => {
		const wrapper = mountField({ modelValue: null, label: '搜尋' })

		expect((wrapper.get('input').element as HTMLInputElement).value).toBe('')
	})
})
