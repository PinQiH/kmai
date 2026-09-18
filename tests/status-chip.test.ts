import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import { describe, expect, it } from 'vitest'

import StatusChip from '@/components/StatusChip.vue'

function mountChip(props: InstanceType<typeof StatusChip>['$props']) {
	return mount(StatusChip, { props, global: { plugins: [createVuetify({ components })] } })
}

describe('StatusChip', () => {
	it('should colour document statuses by default', () => {
		const wrapper = mountChip({ status: '失敗' })

		expect(wrapper.text()).toBe('失敗')
		expect(wrapper.classes()).toContain('text-error')
	})

	it('should fall back to secondary for unknown statuses', () => {
		expect(mountChip({ status: '未知' }).classes()).toContain('text-secondary')
	})

	it('should use the given colour, label and size', () => {
		const wrapper = mountChip({ status: 'investigating', color: 'info', label: '處理中', size: 'x-small' })

		expect(wrapper.text()).toBe('處理中')
		expect(wrapper.classes()).toContain('text-info')
		expect(wrapper.classes()).toContain('v-chip--size-x-small')
	})
})
