import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AnswerSettingsMenu from '@/components/AnswerSettingsMenu.vue'

const menuStub = {
	name: 'VMenu',
	props: ['modelValue'],
	emits: ['update:modelValue'],
	template: '<div><slot name="activator" :props="{}" /><slot /></div>',
}

function mountMenu() {
	return mount(AnswerSettingsMenu, {
		props: {
			selectedAnswerStyleId: 'balanced',
			selectedAnswerModelId: 'gpt-4.1-mini',
		},
		global: {
			stubs: {
				VBtn: true,
				VCard: { template: '<div><slot /></div>' },
				VIcon: true,
				VMenu: menuStub,
			},
		},
	})
}

describe('AnswerSettingsMenu', () => {
	it('should present answer style and LLM choices when the menu is rendered', () => {
		const wrapper = mountMenu()

		expect(wrapper.text()).toContain('回答設定')
		expect(wrapper.text()).toContain('標準')
		expect(wrapper.text()).toContain('步驟式')
		expect(wrapper.text()).toContain('LLM')
		expect(wrapper.text()).toContain('gpt-4.1-mini')
		expect(wrapper.text()).toContain('llama3.1:8b')
		expect(wrapper.text()).not.toContain('自動選擇')
		expect(wrapper.text()).not.toContain('回答長度')
		expect(wrapper.text()).not.toContain('最多引用數')
	})

	it('should keep choices as drafts when the settings form has not been submitted', async () => {
		const wrapper = mountMenu()
		const menu = wrapper.findComponent({ name: 'VMenu' })
		await menu.vm.$emit('update:modelValue', true)

		await wrapper.get('input[name="answer-style"][value="step-by-step"]').setValue()
		await wrapper.get('input[name="answer-model"][value="llama3.1:8b"]').setValue()

		expect(wrapper.emitted('apply')).toBeUndefined()

		await wrapper.get('form').trigger('submit')

		expect(wrapper.emitted('apply')?.[0]).toEqual([{
			answerStyleId: 'step-by-step',
			answerModelId: 'llama3.1:8b',
		}])
		expect(wrapper.emitted('closed')).toEqual([[]])
		expect(menu.props('modelValue')).toBe(false)
	})

	it('should close without applying when cancel is selected', async () => {
		const wrapper = mountMenu()
		const menu = wrapper.findComponent({ name: 'VMenu' })
		await menu.vm.$emit('update:modelValue', true)

		await wrapper.get('input[name="answer-style"][value="concise"]').setValue()
		await wrapper.get('[data-testid="answer-settings-cancel"]').trigger('click')

		expect(wrapper.emitted('apply')).toBeUndefined()
		expect(wrapper.emitted('closed')).toEqual([[]])
		expect(menu.props('modelValue')).toBe(false)
	})
})
