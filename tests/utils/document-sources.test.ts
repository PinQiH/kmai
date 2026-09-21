import { describe, expect, it } from 'vitest'

import {
	canReadFileAsText,
	createUrlSnapshot,
	getDocumentSourceIcon,
	getDocumentSourceLabel,
	getFileExtension,
	parseHttpUrl,
} from '@/utils/documentSources'

describe('documentSources', () => {
	describe('parseHttpUrl', () => {
		it('should return null when value is empty or malformed', () => {
			expect(parseHttpUrl('')).toBeNull()
			expect(parseHttpUrl('not a url')).toBeNull()
		})

		it('should reject unsafe schemes', () => {
			expect(parseHttpUrl('javascript:alert(1)')).toBeNull()
			expect(parseHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
			expect(parseHttpUrl('ftp://example.com/file.txt')).toBeNull()
		})

		it('should normalize valid HTTP and HTTPS URLs', () => {
			expect(parseHttpUrl('  HTTPS://Example.COM/guide?q=vue  ')).toEqual({
				url: 'https://example.com/guide?q=vue',
				domain: 'example.com',
			})
			expect(parseHttpUrl('http://docs.example.com')).toEqual({
				url: 'http://docs.example.com/',
				domain: 'docs.example.com',
			})
		})
	})

	describe('document source presentation', () => {
		it.each([
			['file', '上傳檔案', 'mdi-file-upload-outline'],
			['text', '輸入文字', 'mdi-text-box-outline'],
			['url', '貼上網址', 'mdi-link-variant'],
			['ai-answer', 'AI 回答', 'mdi-message-text-outline'],
		] as const)('should provide a label and icon for %s sources', (type, label, icon) => {
			expect(getDocumentSourceLabel(type)).toBe(label)
			expect(getDocumentSourceIcon(type)).toBe(icon)
		})
	})

	describe('getFileExtension', () => {
		it('should return a lowercase extension from a file name or path', () => {
			expect(getFileExtension('Quarterly.Report.PDF')).toBe('pdf')
			expect(getFileExtension('notes/README.MD')).toBe('md')
		})

		it('should return an empty string when the file has no extension', () => {
			expect(getFileExtension('README')).toBe('')
			expect(getFileExtension('.gitignore')).toBe('')
			expect(getFileExtension('report.')).toBe('')
		})
	})

	describe('canReadFileAsText', () => {
		it('should allow text MIME types and known text extensions', () => {
			expect(canReadFileAsText(new File(['content'], 'notes.txt', { type: 'text/plain' }))).toBe(true)
			expect(canReadFileAsText(new File(['# Title'], 'guide.MD'))).toBe(true)
			expect(canReadFileAsText(new File(['{}'], 'data.bin', { type: 'application/json; charset=utf-8' }))).toBe(true)
		})

		it('should reject binary files', () => {
			expect(canReadFileAsText(new File(['pdf'], 'policy.pdf', { type: 'application/pdf' }))).toBe(false)
			expect(canReadFileAsText(new File(['docx'], 'policy.docx'))).toBe(false)
		})
	})

	describe('createUrlSnapshot', () => {
		it('should identify the title, domain and static preview limitation', () => {
			const snapshot = createUrlSnapshot('Vue 指南', 'vuejs.org')

			expect(snapshot).toContain('「Vue 指南」')
			expect(snapshot).toContain('vuejs.org')
			expect(snapshot).toContain('未即時擷取')
		})

		it('should use safe fallback text when title and domain are empty', () => {
			expect(createUrlSnapshot('', '')).toContain('未知網站')
		})
	})
})
