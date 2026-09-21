import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import MarkdownContent from '@/components/MarkdownContent.vue'
import { parseMarkdownBlocks, parseMarkdownInline, toSafeHref } from '@/utils/markdown'

describe('markdown utils', () => {
	it('should parse headings, lists and paragraphs', () => {
		const blocks = parseMarkdownBlocks('## 標題\n\n- 一\n- 二\n\n段落\n接續')
		expect(blocks).toEqual([
			{ type: 'heading', level: 2, text: '標題' },
			{ type: 'list', ordered: false, items: ['一', '二'] },
			{ type: 'paragraph', text: '段落 接續' },
		])
	})

	it('should parse inline strong, code and safe links', () => {
		expect(parseMarkdownInline('請看 **重點** 與 `code`，[說明](https://example.com)')).toEqual([
			{ type: 'text', text: '請看 ' },
			{ type: 'strong', text: '重點' },
			{ type: 'text', text: ' 與 ' },
			{ type: 'code', text: 'code' },
			{ type: 'text', text: '，' },
			{ type: 'link', text: '說明', href: 'https://example.com/' },
		])
	})

	it('should keep unsafe link protocols as plain text', () => {
		expect(toSafeHref('javascript:alert(1)')).toBeNull()
		expect(parseMarkdownInline('[點我](javascript:alert(1))')[0].type).toBe('text')
	})
})

describe('MarkdownContent', () => {
	it('should render html-like input as text instead of markup', () => {
		const wrapper = mount(MarkdownContent, { props: { content: '<img src=x onerror=alert(1)> **粗體**' } })
		expect(wrapper.find('img').exists()).toBe(false)
		expect(wrapper.find('strong').text()).toBe('粗體')
		expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>')
	})
})
