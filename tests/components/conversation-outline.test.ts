import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ConversationOutline from '@/components/ConversationOutline.vue'

describe('ConversationOutline', () => {
	it('should preview the question and answer when a summary marker receives hover or focus', async () => {
		const wrapper = mount(ConversationOutline, {
			props: {
				items: [{
					id: 'question-1',
					seq: 1,
					text: '差旅費用怎麼申請？',
					summary: '先填寫差旅申請單，再依金額送交主管簽核。',
				}],
				activeId: 'question-1',
			},
			global: {
				stubs: { Teleport: true },
			},
		})

		const marker = wrapper.get('button')
		expect(marker.attributes('aria-label')).toContain('差旅費用怎麼申請？')
		expect(marker.attributes('aria-label')).toContain('回答摘要：先填寫差旅申請單')
		await marker.trigger('mouseenter')
		expect(wrapper.get('[role="tooltip"]').text()).toContain('問題差旅費用怎麼申請？')
		expect(wrapper.get('[role="tooltip"]').text()).toContain('回答先填寫差旅申請單')

		await marker.trigger('click')
		expect(wrapper.emitted('select')).toEqual([['question-1']])
	})
})
