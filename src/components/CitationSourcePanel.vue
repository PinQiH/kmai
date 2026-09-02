<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import { documentContentById } from '@/mocks/documentContent'
import { documents } from '@/mocks/data'
import type { Citation, DocumentContentSection } from '@/types'

interface ComponentProps {
	citation: Citation
	isModal?: boolean
}

const props = withDefaults(defineProps<ComponentProps>(), { isModal: false })

const emit = defineEmits<{
	close: []
}>()

const closeButton = ref<HTMLButtonElement>()
const panelElement = ref<HTMLElement>()
const sourceDocument = computed(() => documents.find((document) => document.id === props.citation.documentId))
const documentSections = computed<DocumentContentSection[]>(() => documentContentById[props.citation.documentId] ?? [])
const documentMeta = computed(() => {
	const document = sourceDocument.value
	if (!document) return props.citation.section
	return `${document.department} · 第 ${document.version} 版 · ${props.citation.section}`
})

watch(
	() => props.citation.id,
	async () => {
		await nextTick()
		closeButton.value?.focus()
	},
	{ immediate: true },
)

function handleKeydown(event: KeyboardEvent): void {
	if (event.key === 'Escape') {
		emit('close')
		return
	}
	if (event.key !== 'Tab' || !props.isModal || !panelElement.value) return

	const focusableElements = Array.from(
		panelElement.value.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
	)
	const firstElement = focusableElements[0]
	const lastElement = focusableElements[focusableElements.length - 1]
	if (!firstElement || !lastElement) return

	if (event.shiftKey && document.activeElement === firstElement) {
		event.preventDefault()
		lastElement.focus()
		return
	}
	if (!event.shiftKey && document.activeElement === lastElement) {
		event.preventDefault()
		firstElement.focus()
	}
}
</script>

<template>
	<aside
		ref="panelElement"
		class="source-panel"
		:role="isModal ? 'dialog' : undefined"
		:aria-modal="isModal ? 'true' : undefined"
		aria-labelledby="source-panel-title"
		@keydown="handleKeydown"
	>
		<header class="source-panel-header">
			<div class="source-panel-heading">
				<p class="source-panel-label">資料來源</p>
				<h2 id="source-panel-title">{{ citation.title }}</h2>
				<p>{{ documentMeta }}</p>
			</div>
			<button ref="closeButton" type="button" class="source-panel-close" aria-label="關閉資料來源" @click="emit('close')">
				<VIcon icon="mdi-close" size="20" aria-hidden="true" />
			</button>
		</header>

		<div class="source-panel-content">
			<section aria-labelledby="cited-chunk-title" class="source-section">
				<div class="source-section-heading">
					<h3 id="cited-chunk-title">被引用的 CHUNK</h3>
					<code class="chunk-id">{{ citation.chunkId ?? '尚未提供 CHUNK ID' }}</code>
				</div>
				<p class="chunk-section">{{ citation.section }} · 關聯度 <span class="mono">{{ Math.round(citation.confidence * 100) }}%</span></p>
				<blockquote>{{ citation.excerpt }}</blockquote>
			</section>

			<section aria-labelledby="full-document-title" class="source-section">
				<div class="source-section-heading">
					<h3 id="full-document-title">文件全文</h3>
					<span v-if="sourceDocument" class="document-version">第 {{ sourceDocument.version }} 版</span>
				</div>
				<div v-if="documentSections.length > 0" class="full-document">
					<section v-for="section in documentSections" :key="section.id" :id="`source-${section.id}`">
						<h4>{{ section.heading }}</h4>
						<p>{{ section.body }}</p>
					</section>
				</div>
				<div v-else class="source-empty">
					<VIcon icon="mdi-file-eye-outline" size="22" aria-hidden="true" />
					<p>這份來源目前沒有可顯示的全文預覽，仍可前往文件詳情查看最新內容。</p>
				</div>
			</section>
		</div>

		<footer class="source-panel-footer">
			<VBtn color="primary" block append-icon="mdi-arrow-right" :to="`/documents/${citation.documentId}`">
				前往文件詳情
			</VBtn>
		</footer>
	</aside>
</template>

<style scoped>
.source-panel {
	display: flex;
	flex: 0 0 400px;
	flex-direction: column;
	width: 400px;
	min-width: 0;
	height: 100%;
	min-height: 0;
	overflow: hidden;
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-lg);
	background: rgb(var(--v-theme-surface));
}

.source-panel-header {
	display: flex;
	align-items: flex-start;
	gap: var(--space-md);
	padding: var(--space-lg);
	border-bottom: 1px solid rgb(var(--v-theme-outline));
}

.source-panel-heading {
	display: grid;
	gap: var(--space-xs);
	flex: 1 1 auto;
	min-width: 0;
}

.source-panel-label {
	color: rgb(var(--v-theme-primary));
	font-size: 0.78rem;
	font-weight: 700;
}

.source-panel-heading h2 {
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.45;
	overflow-wrap: anywhere;
}

.source-panel-heading > p:last-child {
	color: var(--ink-muted);
	font-size: 0.78rem;
	line-height: 1.5;
}

.source-panel-close {
	display: grid;
	place-items: center;
	flex: 0 0 auto;
	width: 36px;
	height: 36px;
	border: 0;
	border-radius: var(--radius-sm);
	background: none;
	color: var(--ink-muted);
	cursor: pointer;
}

.source-panel-close:hover {
	background: var(--tint-hover);
	color: rgb(var(--v-theme-primary));
}

.source-panel-content {
	display: grid;
	gap: var(--space-xl);
	flex: 1 1 auto;
	min-height: 0;
	overflow-y: auto;
	padding: var(--space-lg);
}

.source-section {
	display: grid;
	gap: var(--space-md);
}

.source-section-heading {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: var(--space-sm);
}

.source-section-heading h3 {
	font-size: 0.98rem;
	font-weight: 700;
}

.chunk-id,
.document-version {
	color: var(--ink-muted);
	font-family: var(--font-mono);
	font-size: 0.68rem;
}

.chunk-id {
	overflow-wrap: anywhere;
	text-align: right;
}

.chunk-section {
	color: var(--ink-muted);
	font-size: 0.78rem;
}

blockquote {
	margin: 0;
	padding: var(--space-md);
	border: 1px solid rgba(var(--v-theme-primary), 0.35);
	border-radius: var(--radius-md);
	background: var(--tint-hover);
	font-size: 0.925rem;
	line-height: 1.75;
}

.full-document {
	display: grid;
	gap: var(--space-lg);
	padding-top: var(--space-xs);
}

.full-document section {
	display: grid;
	gap: var(--space-sm);
}

.full-document h4 {
	font-size: 0.9rem;
	font-weight: 700;
}

.full-document p {
	font-size: 0.875rem;
	line-height: 1.75;
	text-wrap: pretty;
}

.source-empty {
	display: flex;
	align-items: flex-start;
	gap: var(--space-sm);
	padding: var(--space-md);
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-md);
	color: var(--ink-muted);
	font-size: 0.85rem;
	line-height: 1.6;
}

.source-panel-footer {
	padding: var(--space-md) var(--space-lg) var(--space-lg);
	border-top: 1px solid rgb(var(--v-theme-outline));
}
</style>
