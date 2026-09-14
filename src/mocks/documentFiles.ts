import { reactive, markRaw } from 'vue'
import type { DocumentContentSection, UserDocumentSource } from '@/types'

export interface VersionFiles {
	isUploaded?: boolean
	source: UserDocumentSource
	file?: File
	attachments: File[]
	sections: DocumentContentSection[]
}

export const versionFiles = reactive<Record<string, Record<string, VersionFiles>>>({})

export async function prepareVersionFiles(source: UserDocumentSource, file?: File, attachments: File[] = []): Promise<VersionFiles> {
	let content = source.type === 'text' ? source.content : source.type === 'url' ? source.snapshot : ''
	if (file && /\.(txt|md|csv)$/i.test(file.name)) content = await file.text()
	return {
		isUploaded: true,
		source, file: file ? markRaw(file) : undefined,
		attachments: attachments.map((item) => markRaw(item)),
		sections: content ? [{ id: 'source-content', heading: '文件內容', body: content }] : [],
	}
}

export function downloadFile(file: Blob, name: string): void {
	const url = URL.createObjectURL(file)
	const link = document.createElement('a')
	link.href = url
	link.download = name
	link.click()
	window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
