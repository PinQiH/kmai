import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { describe, expect, it } from 'vitest'

import DocumentCard from '@/components/DocumentCard.vue'
import type { KnowledgeDocument } from '@/types'

const document: KnowledgeDocument = {
	id: 'doc-test',
	title: '測試文件',
	summary: '確認文件卡片能載入 Vuetify 與狀態元件。',
	department: '資訊部',
	category: '測試',
	tags: ['Vue'],
	updatedAt: '2026-08-14',
	version: '1.0',
	status: '已發布',
	visibility: '全公司',
	owner: '測試人員',
}

describe('DocumentCard', () => {
	it('should render Vuetify card and local status component', () => {
		const vuetify = createVuetify({ components, directives })
		const wrapper = mount(DocumentCard, {
			props: { document, showStatus: true },
			global: {
				plugins: [vuetify],
				stubs: { RouterLink: true },
			},
		})

		expect(wrapper.find('.v-card').exists()).toBe(true)
		expect(wrapper.text()).toContain('測試文件')
		expect(wrapper.text()).toContain('已發布')
	})
})
