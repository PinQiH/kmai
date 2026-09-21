import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import DocumentSourcePreview from '@/components/DocumentSourcePreview.vue'
import type { DocumentSource } from '@/types'

function mountPreview(source: DocumentSource, title = '測試文件') {
	return mount(DocumentSourcePreview, {
		props: { source, title },
	})
}

describe('DocumentSourcePreview', () => {
	it('should show file metadata and preview text when a file preview is available', () => {
		const wrapper = mountPreview({
			type: 'file',
			fileName: 'employee-guide.pdf',
			mimeType: 'application/pdf',
			extension: 'pdf',
			previewText: '這是檔案解析後的文字內容。',
		})

		const preview = wrapper.get('[data-testid="file-source-preview"]')
		expect(wrapper.get('[data-testid="source-type-label"]').text()).toBe('上傳檔案')
		expect(preview.text()).toContain('employee-guide.pdf')
		expect(preview.text()).toContain('application/pdf')
		expect(preview.text()).toContain('這是檔案解析後的文字內容。')
	})

	it('should show a clear fallback when a file does not have preview text', () => {
		const wrapper = mountPreview({
			type: 'file',
			fileName: 'budget.xlsx',
			mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			extension: 'xlsx',
		})

		expect(wrapper.get('[role="status"]').text()).toContain('尚無可顯示的文字預覽')
	})

	it('should label a truncated file preview', () => {
		const wrapper = mountPreview({
			type: 'file',
			fileName: 'large-notes.txt',
			mimeType: 'text/plain',
			extension: 'txt',
			previewText: '前段內容',
			previewTruncated: true,
		})

		expect(wrapper.get('[role="status"]').text()).toContain('僅顯示前 64 KB')
		expect(wrapper.text()).not.toContain('尚無可顯示的文字預覽')
	})

	it('should preserve plain-text line breaks without treating the content as markup', () => {
		const wrapper = mountPreview({
			type: 'text',
			format: 'plain-text',
			content: '第一行\n<strong>第二行</strong>',
		})

		const preview = wrapper.get('[data-testid="text-source-preview"]')
		expect(wrapper.get('[data-testid="source-type-label"]').text()).toBe('純文字')
		expect(preview.text()).toContain('<strong>第二行</strong>')
		expect(preview.find('strong').exists()).toBe(false)
	})

	it('should render common Markdown blocks as text without injecting user HTML', () => {
		const wrapper = mountPreview({
			type: 'text',
			format: 'markdown',
			content: [
				'# 操作說明',
				'',
				'- 第一項',
				'- <script>window.hacked = true</script>',
				'',
				'> 重要提醒',
				'',
				'```ts',
				'const enabled = true',
				'```',
			].join('\n'),
		})

		const preview = wrapper.get('[data-testid="markdown-preview"]')
		expect(preview.get('h3').text()).toBe('操作說明')
		expect(preview.findAll('li')).toHaveLength(2)
		expect(preview.get('blockquote').text()).toBe('重要提醒')
		expect(preview.get('code').text()).toContain('const enabled = true')
		expect(preview.text()).toContain('<script>window.hacked = true</script>')
		expect(preview.find('script').exists()).toBe(false)
	})

	it('should render an http source as an external link with capture metadata and snapshot', () => {
		const wrapper = mountPreview({
			type: 'url',
			url: 'https://example.com/guide?lang=zh-TW',
			domain: 'example.com',
			capturedAt: '2026-09-02T08:30:00+08:00',
			snapshot: '網址擷取後的內容快照。',
		})

		const link = wrapper.get<HTMLAnchorElement>('[data-testid="url-source-preview"] a')
		expect(link.attributes('href')).toBe('https://example.com/guide?lang=zh-TW')
		expect(link.attributes('target')).toBe('_blank')
		expect(link.attributes('rel')).toBe('noopener noreferrer')
		expect(wrapper.text()).toContain('example.com')
		expect(wrapper.text()).toContain('網址擷取後的內容快照。')
	})

	it('should not create a link when the source URL uses an unsafe protocol', () => {
		const wrapper = mountPreview({
			type: 'url',
			url: 'javascript:alert(1)',
			domain: '不安全來源',
			capturedAt: 'invalid-date',
			snapshot: '',
		})

		expect(wrapper.find('a').exists()).toBe(false)
		expect(wrapper.get('[data-testid="unsafe-source-url"]').text()).toBe('javascript:alert(1)')
		expect(wrapper.get('[role="status"]').text()).toContain('尚未產生內容快照')
	})

	it('should show an AI answer, citations, and optional knowledge document sections', () => {
		const wrapper = mount(DocumentSourcePreview, {
			props: {
				title: 'AI 回答筆記',
				source: {
					type: 'ai-answer',
					answerId: 'answer-1',
					question: '公司的請假規範是什麼？',
					content: '請假前應先完成代理人安排。',
					citations: [{
						id: 'citation-1',
						documentId: 'document-1',
						title: '員工請假辦法',
						section: '第三條',
						excerpt: '申請人應指定職務代理人。',
						confidence: 0.96,
					}],
				},
				sections: [{
					id: 'section-1',
					heading: '補充說明',
					body: '此區塊可供知識庫詳情頁顯示整理後的文件內容。',
				}],
			},
		})

		expect(wrapper.get('[data-testid="ai-answer-source-preview"]').text()).toContain('公司的請假規範是什麼？')
		expect(wrapper.text()).toContain('員工請假辦法')
		expect(wrapper.text()).toContain('申請人應指定職務代理人。')
		expect(wrapper.get('[data-testid="document-content-sections"]').text()).toContain('補充說明')
	})

	it('should hide current source content when showing version-only sections', () => {
		const wrapper = mount(DocumentSourcePreview, {
			props: {
				title: '歷史版本',
				showSourceContent: false,
				source: { type: 'text', format: 'markdown', content: '# 最新版內容' },
				sections: [{ id: 'old', heading: '舊版內容', body: '這是舊版本快照。' }],
			},
		})

		expect(wrapper.find('[data-testid="markdown-preview"]').exists()).toBe(false)
		expect(wrapper.text()).not.toContain('最新版內容')
		expect(wrapper.get('[data-testid="document-content-sections"]').text()).toContain('這是舊版本快照。')
	})
})
