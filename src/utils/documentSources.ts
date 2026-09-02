import type { DocumentSourceType } from '@/types'

const documentSourcePresentations: Record<DocumentSourceType, { label: string; icon: string }> = {
	file: {
		label: '上傳檔案',
		icon: 'mdi-file-upload-outline',
	},
	text: {
		label: '輸入文字',
		icon: 'mdi-text-box-outline',
	},
	url: {
		label: '貼上網址',
		icon: 'mdi-link-variant',
	},
	'ai-answer': {
		label: 'AI 回答',
		icon: 'mdi-message-text-outline',
	},
}

const textFileExtensions = new Set([
	'csv',
	'htm',
	'html',
	'json',
	'log',
	'markdown',
	'md',
	'txt',
	'xml',
	'yaml',
	'yml',
])

const textApplicationMimeTypes = new Set([
	'application/json',
	'application/ld+json',
	'application/xml',
	'application/x-yaml',
	'application/yaml',
])

export function parseHttpUrl(value: string): { url: string; domain: string } | null {
	const trimmedValue = value.trim()
	if (!trimmedValue) return null

	try {
		const parsedUrl = new URL(trimmedValue)
		if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return null

		return {
			url: parsedUrl.toString(),
			domain: parsedUrl.hostname,
		}
	} catch {
		return null
	}
}

export function getDocumentSourceLabel(type: DocumentSourceType): string {
	return documentSourcePresentations[type].label
}

export function getDocumentSourceIcon(type: DocumentSourceType): string {
	return documentSourcePresentations[type].icon
}

export function getFileExtension(fileName: string): string {
	const baseName = fileName.trim().split(/[\\/]/).at(-1) ?? ''
	const extensionSeparatorIndex = baseName.lastIndexOf('.')

	if (extensionSeparatorIndex <= 0 || extensionSeparatorIndex === baseName.length - 1) return ''

	return baseName.slice(extensionSeparatorIndex + 1).toLowerCase()
}

export function canReadFileAsText(file: File): boolean {
	const mimeType = file.type.toLowerCase().split(';', 1)[0]?.trim() ?? ''
	if (mimeType.startsWith('text/') || textApplicationMimeTypes.has(mimeType)) return true

	return textFileExtensions.has(getFileExtension(file.name))
}

export function createUrlSnapshot(title: string, domain: string): string {
	const normalizedDomain = domain.trim() || '未知網站'
	const normalizedTitle = title.trim() || normalizedDomain

	return `這是「${normalizedTitle}」的靜態內容快照，來源為 ${normalizedDomain}。目前為前端展示資料，未即時擷取網站內容。`
}
