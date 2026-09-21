import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { describe, expect, it } from 'vitest'

import CitationSourcePanel from '@/components/CitationSourcePanel.vue'
import type { Citation } from '@/types'

const citation: Citation = {
	id: 'cite-1',
	chunkId: 'doc-001-chunk-0042',
	documentId: 'doc-001',
	title: '員工差旅與費用報支辦法',
	section: '4.2 住宿費用',
	excerpt: '國內住宿每晚以新台幣 3,000 元為原則。',
	confidence: 0.94,
}

describe('CitationSourcePanel', () => {
	it('should show chunk evidence, full document content and document detail action', () => {
		const wrapper = mount(CitationSourcePanel, {
			props: { citation },
			global: {
				plugins: [createVuetify({ components, directives })],
				stubs: { RouterLink: true },
			},
		})

		expect(wrapper.text()).toContain('被引用的 CHUNK')
		expect(wrapper.text()).toContain('doc-001-chunk-0042')
		expect(wrapper.text()).toContain('文件全文')
		expect(wrapper.text()).toContain('出差前應完成申請並取得主管核准')
		expect(wrapper.text()).toContain('前往文件詳情')
		expect(wrapper.findComponent({ name: 'VBtn' }).props('to')).toBe('/documents/doc-001')
	})

	it('should emit close when the close control is clicked', async () => {
		const wrapper = mount(CitationSourcePanel, {
			props: { citation },
			global: { stubs: { VBtn: true, VIcon: true } },
		})

		await wrapper.get('button[aria-label="關閉資料來源"]').trigger('click')

		expect(wrapper.emitted('close')).toHaveLength(1)
	})

	it('should trap keyboard focus when rendered as a modal overlay', async () => {
		const wrapper = mount(CitationSourcePanel, {
			attachTo: document.body,
			props: { citation, isModal: true },
			global: {
				stubs: {
					VBtn: { template: '<a href="/documents/doc-001"><slot /></a>' },
					VIcon: true,
				},
			},
		})
		const panel = wrapper.get('.source-panel')
		const closeButton = wrapper.get('.source-panel-close')
		const detailLink = wrapper.get('a[href="/documents/doc-001"]')
		await nextTick()

		expect(panel.attributes('role')).toBe('dialog')
		expect(panel.attributes('aria-modal')).toBe('true')

		closeButton.element.focus()
		await panel.trigger('keydown', { key: 'Tab', shiftKey: true })
		expect(document.activeElement).toBe(detailLink.element)

		detailLink.element.focus()
		await panel.trigger('keydown', { key: 'Tab' })
		expect(document.activeElement).toBe(closeButton.element)

		wrapper.unmount()
	})
})
