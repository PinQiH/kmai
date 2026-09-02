<script setup lang="ts">
import { computed, useId } from 'vue'

import type { DocumentContentSection, DocumentSource } from '@/types'

interface Props {
	source: DocumentSource
	title: string
	sections?: DocumentContentSection[]
	showHeader?: boolean
	showSourceContent?: boolean
}

type MarkdownBlock =
	| { type: 'code'; language: string; text: string }
	| { type: 'heading'; level: 1 | 2 | 3; text: string }
	| { type: 'list'; ordered: boolean; items: string[] }
	| { type: 'paragraph'; text: string }
	| { type: 'quote'; text: string }

const props = withDefaults(defineProps<Props>(), {
	sections: () => [],
	showHeader: true,
	showSourceContent: true,
})

const titleId = `document-source-preview-${useId()}`
const citationHeadingId = `${titleId}-citations`
const sectionsHeadingId = `${titleId}-sections`

const sourceLabel = computed(() => {
	switch (props.source.type) {
		case 'file':
			return '上傳檔案'
		case 'text':
			return props.source.format === 'markdown' ? 'Markdown 文字' : '純文字'
		case 'url':
			return '網址快照'
		case 'ai-answer':
			return 'AI 回答'
	}
})

const safeSourceUrl = computed(() => {
	if (props.source.type !== 'url') return null

	try {
		const parsedUrl = new URL(props.source.url)
		if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return null
		return parsedUrl.toString()
	} catch {
		return null
	}
})

const capturedAtLabel = computed(() => {
	if (props.source.type !== 'url') return ''
	const capturedAt = new Date(props.source.capturedAt)
	if (Number.isNaN(capturedAt.getTime())) return props.source.capturedAt

	return new Intl.DateTimeFormat('zh-TW', {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(capturedAt)
})

const markdownBlocks = computed<MarkdownBlock[]>(() => {
	if (props.source.type !== 'text' || props.source.format !== 'markdown') return []
	return parseMarkdownBlocks(props.source.content)
})

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
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
			blocks.push({
				type: 'code',
				language: fenceMatch[1].trim(),
				text: codeLines.join('\n'),
			})
			continue
		}

		const headingMatch = line.match(/^(#{1,3})\s+(.+)$/)
		if (headingMatch) {
			blocks.push({
				type: 'heading',
				level: headingMatch[1].length as 1 | 2 | 3,
				text: headingMatch[2].trim(),
			})
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
				const itemMatch = isOrdered
					? lines[index].match(/^\d+[.)]\s+(.+)$/)
					: lines[index].match(/^[-*+]\s+(.+)$/)
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
</script>

<template>
	<article class="source-preview surface-border" :aria-labelledby="showHeader ? titleId : undefined" :aria-label="showHeader ? undefined : `${title}來源預覽`" data-testid="document-source-preview">
		<header v-if="showHeader" class="source-preview-header">
			<div class="source-heading">
				<span class="source-type" data-testid="source-type-label">{{ sourceLabel }}</span>
				<h2 :id="titleId">{{ title }}</h2>
			</div>
		</header>

		<template v-if="showSourceContent">
			<section v-if="source.type === 'file'" class="source-body" data-testid="file-source-preview" aria-label="檔案預覽">
				<dl class="source-metadata">
					<div>
						<dt>檔案名稱</dt>
						<dd>{{ source.fileName }}</dd>
					</div>
					<div>
						<dt>副檔名</dt>
						<dd>{{ source.extension || '未提供' }}</dd>
					</div>
					<div>
						<dt>內容類型</dt>
						<dd>{{ source.mimeType || '未提供' }}</dd>
					</div>
				</dl>
				<div v-if="source.previewText?.trim()" class="reading-surface source-copy">{{ source.previewText }}</div>
				<p v-if="source.previewText?.trim() && source.previewTruncated" class="preview-note" role="status">檔案較大，目前僅顯示前 64 KB 內容。</p>
				<p v-else-if="!source.previewText?.trim() && !sections.length" class="preview-empty" role="status">此檔案尚無可顯示的文字預覽，仍可查看檔案資訊。</p>
			</section>

			<section v-else-if="source.type === 'text'" class="source-body" data-testid="text-source-preview" aria-label="文字預覽">
				<div v-if="!source.content.trim()" class="preview-empty" role="status">此筆文字內容目前是空白的。</div>
				<div v-else-if="source.format === 'plain-text'" class="reading-surface source-copy">{{ source.content }}</div>
				<div v-else class="reading-surface markdown-preview" data-testid="markdown-preview">
					<template v-for="(block, index) in markdownBlocks" :key="`${block.type}-${index}`">
						<component
							:is="`h${block.level + 2}`"
							v-if="block.type === 'heading'"
							class="markdown-heading"
						>
							{{ block.text }}
						</component>
						<blockquote v-else-if="block.type === 'quote'">{{ block.text }}</blockquote>
						<pre v-else-if="block.type === 'code'"><code :data-language="block.language || undefined">{{ block.text }}</code></pre>
						<component :is="block.ordered ? 'ol' : 'ul'" v-else-if="block.type === 'list'">
							<li v-for="(item, itemIndex) in block.items" :key="`${item}-${itemIndex}`">{{ item }}</li>
						</component>
						<p v-else>{{ block.text }}</p>
					</template>
				</div>
			</section>

			<section v-else-if="source.type === 'url'" class="source-body" data-testid="url-source-preview" aria-label="網址快照預覽">
				<dl class="source-metadata">
					<div>
						<dt>來源網站</dt>
						<dd>{{ source.domain }}</dd>
					</div>
					<div>
						<dt>擷取時間</dt>
						<dd><time :datetime="source.capturedAt">{{ capturedAtLabel }}</time></dd>
					</div>
				</dl>
				<p class="source-url">
					<strong>原始網址</strong>
					<a v-if="safeSourceUrl" :href="safeSourceUrl" target="_blank" rel="noopener noreferrer">{{ source.url }}</a>
					<span v-else data-testid="unsafe-source-url">{{ source.url }}</span>
				</p>
				<div v-if="source.snapshot.trim()" class="reading-surface source-copy">{{ source.snapshot }}</div>
				<p v-else class="preview-empty" role="status">此網址尚未產生內容快照。</p>
			</section>

			<section v-else class="source-body ai-answer-preview" data-testid="ai-answer-source-preview" aria-label="AI 回答預覽">
				<div class="question-block">
					<strong>原始問題</strong>
					<p>{{ source.question }}</p>
				</div>
				<div class="reading-surface source-copy">{{ source.content }}</div>
				<section v-if="source.citations.length" class="citation-section" :aria-labelledby="citationHeadingId">
					<h3 :id="citationHeadingId">引用來源</h3>
					<ol class="citation-list">
						<li v-for="citation in source.citations" :key="citation.id">
							<strong>{{ citation.title }}</strong>
							<span>{{ citation.section }}</span>
							<p>{{ citation.excerpt }}</p>
						</li>
					</ol>
				</section>
			</section>
		</template>

		<section v-if="sections.length" class="document-sections" :aria-labelledby="sectionsHeadingId" data-testid="document-content-sections">
			<h3 :id="sectionsHeadingId">文件內容</h3>
			<section v-for="section in sections" :key="section.id" class="document-section">
				<h4>{{ section.heading }}</h4>
				<p>{{ section.body }}</p>
			</section>
		</section>
	</article>
</template>

<style scoped>
.source-preview {
	overflow: hidden;
	border-radius: var(--radius-md);
	background: rgb(var(--v-theme-surface));
	color: var(--ink-strong);
}

.source-preview-header {
	padding: var(--space-lg) var(--space-xl);
	border-bottom: 1px solid rgb(var(--v-theme-outline));
}

.source-heading {
	display: grid;
	gap: var(--space-xs);
}

.source-heading h2 {
	margin: 0;
	font-size: clamp(1.1rem, 2vw, 1.35rem);
	font-weight: 700;
	line-height: 1.4;
	overflow-wrap: anywhere;
}

.source-type {
	width: fit-content;
	padding: 3px 10px;
	border-radius: 999px;
	background: rgb(var(--v-theme-primary) / 10%);
	color: rgb(var(--v-theme-primary));
	font-size: 0.75rem;
	font-weight: 700;
	letter-spacing: 0.02em;
}

.source-body,
.document-sections {
	padding: var(--space-xl);
}

.source-metadata {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
	gap: var(--space-sm);
	margin: 0 0 var(--space-lg);
}

.source-metadata > div {
	min-width: 0;
	padding: var(--space-sm) var(--space-md);
	border-radius: var(--radius-sm);
	background: rgb(var(--v-theme-surface-variant));
}

.source-metadata dt {
	margin-bottom: 2px;
	color: var(--ink-muted);
	font-size: 0.72rem;
}

.source-metadata dd {
	margin: 0;
	font-size: 0.86rem;
	font-weight: 600;
	overflow-wrap: anywhere;
}

.reading-surface {
	padding: clamp(var(--space-md), 3vw, var(--space-xl));
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-sm);
	background: color-mix(in srgb, rgb(var(--v-theme-surface-variant)) 36%, rgb(var(--v-theme-surface)));
}

.source-copy,
.question-block p,
.document-section p,
.citation-list p {
	margin: 0;
	line-height: 1.75;
	overflow-wrap: anywhere;
	white-space: pre-wrap;
}

.preview-empty {
	margin: 0;
	padding: var(--space-lg);
	border: 1px dashed rgb(var(--v-theme-outline));
	border-radius: var(--radius-sm);
	color: var(--ink-muted);
	text-align: center;
}

.preview-note {
	margin: calc(var(--space-sm) * -1) 0 0;
	color: var(--ink-muted);
	font-size: 0.82rem;
}

.source-url {
	display: grid;
	gap: var(--space-xs);
	margin: 0 0 var(--space-lg);
	font-size: 0.86rem;
}

.source-url a,
.source-url span {
	color: rgb(var(--v-theme-primary));
	overflow-wrap: anywhere;
}

.source-url a:focus-visible {
	border-radius: 2px;
	outline: 2px solid rgb(var(--v-theme-primary));
	outline-offset: 3px;
}

.markdown-preview {
	display: grid;
	gap: var(--space-md);
	line-height: 1.75;
}

.markdown-preview :is(h3, h4, h5),
.markdown-preview p,
.markdown-preview blockquote,
.markdown-preview :is(ul, ol),
.markdown-preview pre {
	margin: 0;
}

.markdown-preview h3 {
	font-size: 1.22rem;
}

.markdown-preview h4 {
	font-size: 1.08rem;
}

.markdown-preview h5 {
	font-size: 1rem;
}

.markdown-preview :is(ul, ol) {
	display: grid;
	gap: var(--space-xs);
	padding-left: 1.4rem;
}

.markdown-preview blockquote {
	padding-left: var(--space-md);
	border-left: 3px solid rgb(var(--v-theme-primary));
	color: var(--ink-muted);
	white-space: pre-wrap;
}

.markdown-preview pre {
	padding: var(--space-md);
	overflow-x: auto;
	border-radius: var(--radius-sm);
	background: rgb(var(--v-theme-on-surface) / 7%);
	font-family: var(--font-mono, monospace);
	font-size: 0.85rem;
	line-height: 1.6;
}

.question-block {
	margin-bottom: var(--space-lg);
	padding: var(--space-md);
	border-left: 3px solid rgb(var(--v-theme-primary));
	background: rgb(var(--v-theme-primary) / 7%);
}

.question-block strong {
	display: block;
	margin-bottom: var(--space-xs);
	color: rgb(var(--v-theme-primary));
	font-size: 0.78rem;
}

.citation-section {
	margin-top: var(--space-xl);
}

.citation-section h3,
.document-sections > h3 {
	margin: 0 0 var(--space-md);
	font-size: 1rem;
}

.citation-list {
	display: grid;
	gap: var(--space-sm);
	margin: 0;
	padding-left: 1.5rem;
}

.citation-list li {
	padding: var(--space-md);
	border-radius: var(--radius-sm);
	background: rgb(var(--v-theme-surface-variant));
}

.citation-list strong,
.citation-list span {
	display: block;
}

.citation-list span {
	margin-block: 2px var(--space-xs);
	color: var(--ink-muted);
	font-size: 0.78rem;
}

.citation-list p {
	font-size: 0.86rem;
}

.document-sections {
	border-top: 1px solid rgb(var(--v-theme-outline));
}

.document-section + .document-section {
	margin-top: var(--space-xl);
}

.document-section h4 {
	margin: 0 0 var(--space-sm);
	font-size: 1.05rem;
}

@media (max-width: 600px) {
	.source-preview-header,
	.source-body,
	.document-sections {
		padding: var(--space-md);
	}

	.source-metadata {
		grid-template-columns: 1fr;
	}

	.reading-surface {
		padding: var(--space-md);
	}
}
</style>
