// > 輕量 Markdown 解析：只輸出結構化區塊與行內片段，由元件以文字節點渲染，不走 v-html
// @ 支援標題（#～###）、段落、清單、引言、程式碼區塊，行內支援 **粗體**、`程式碼`、[連結](https://…)

export type MarkdownInline =
	| { type: 'text'; text: string }
	| { type: 'strong'; text: string }
	| { type: 'code'; text: string }
	| { type: 'link'; text: string; href: string }

export type MarkdownBlock =
	| { type: 'code'; language: string; text: string }
	| { type: 'heading'; level: 1 | 2 | 3; text: string }
	| { type: 'list'; ordered: boolean; items: string[] }
	| { type: 'paragraph'; text: string }
	| { type: 'quote'; text: string }

export function parseMarkdownBlocks(content: string): MarkdownBlock[] {
	const lines = content.replace(/\r\n?/g, '\n').split('\n')
	const blocks: MarkdownBlock[] = []
	let index = 0

	while (index < lines.length) {
		const line = lines[index]
		if (!line.trim()) {
			index += 1
			continue
		}

		const fenceMatch = line.match(/^```\s*([^`]*)$/)
		if (fenceMatch) {
			const codeLines: string[] = []
			index += 1
			while (index < lines.length && !/^```\s*$/.test(lines[index])) {
				codeLines.push(lines[index])
				index += 1
			}
			if (index < lines.length) index += 1
			blocks.push({ type: 'code', language: fenceMatch[1].trim(), text: codeLines.join('\n') })
			continue
		}

		const headingMatch = line.match(/^(#{1,3})\s+(.+)$/)
		if (headingMatch) {
			blocks.push({ type: 'heading', level: headingMatch[1].length as 1 | 2 | 3, text: headingMatch[2].trim() })
			index += 1
			continue
		}

		const quoteMatch = line.match(/^>\s?(.*)$/)
		if (quoteMatch) {
			const quoteLines = [quoteMatch[1]]
			index += 1
			while (index < lines.length) {
				const nextQuote = lines[index].match(/^>\s?(.*)$/)
				if (!nextQuote) break
				quoteLines.push(nextQuote[1])
				index += 1
			}
			blocks.push({ type: 'quote', text: quoteLines.join('\n') })
			continue
		}

		const unorderedMatch = line.match(/^[-*+]\s+(.+)$/)
		const orderedMatch = line.match(/^\d+[.)]\s+(.+)$/)
		if (unorderedMatch || orderedMatch) {
			const isOrdered = Boolean(orderedMatch)
			const items: string[] = []
			while (index < lines.length) {
				const itemMatch = isOrdered ? lines[index].match(/^\d+[.)]\s+(.+)$/) : lines[index].match(/^[-*+]\s+(.+)$/)
				if (!itemMatch) break
				items.push(itemMatch[1].trim())
				index += 1
			}
			blocks.push({ type: 'list', ordered: isOrdered, items })
			continue
		}

		const paragraphLines = [line.trim()]
		index += 1
		while (index < lines.length && lines[index].trim() && !isMarkdownBlockStart(lines[index])) {
			paragraphLines.push(lines[index].trim())
			index += 1
		}
		blocks.push({ type: 'paragraph', text: paragraphLines.join(' ') })
	}

	return blocks
}

function isMarkdownBlockStart(line: string): boolean {
	return /^(?:```|#{1,3}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/.test(line)
}

// !! 連結只接受 http(s) 與 mailto，擋掉 javascript: 等可執行協定
export function toSafeHref(value: string): string | null {
	try {
		const url = new URL(value)
		return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.toString() : null
	} catch {
		return null
	}
}

const INLINE_PATTERN = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g

export function parseMarkdownInline(text: string): MarkdownInline[] {
	const parts: MarkdownInline[] = []
	let cursor = 0
	for (const match of text.matchAll(INLINE_PATTERN)) {
		const start = match.index ?? 0
		if (start > cursor) parts.push({ type: 'text', text: text.slice(cursor, start) })
		if (match[1] !== undefined) parts.push({ type: 'strong', text: match[1] })
		else if (match[2] !== undefined) parts.push({ type: 'code', text: match[2] })
		else {
			const href = toSafeHref(match[4])
			parts.push(href ? { type: 'link', text: match[3], href } : { type: 'text', text: match[0] })
		}
		cursor = start + match[0].length
	}
	if (cursor < text.length) parts.push({ type: 'text', text: text.slice(cursor) })
	return parts
}
