<script setup lang="ts">
import { ref } from 'vue'

import MarkdownContent from '@/components/MarkdownContent.vue'

interface Props {
	label: string
	rows?: number
	counter?: number
	errorMessages?: string
	/** 預覽時的標題層級起點，與顯示端一致。 */
	headingOffset?: number
}

withDefaults(defineProps<Props>(), { rows: 8, counter: undefined, errorMessages: undefined, headingOffset: 2 })
const model = defineModel<string>({ required: true })
const mode = ref<'write' | 'preview'>('write')
</script>

<template>
	<div class="markdown-editor">
		<div class="editor-bar">
			<span class="editor-label">{{ label }}</span>
			<VBtnToggle v-model="mode" mandatory density="compact" variant="text" color="primary" :aria-label="`${label}編輯模式`">
				<VBtn value="write" size="small">撰寫</VBtn>
				<VBtn value="preview" size="small">預覽</VBtn>
			</VBtnToggle>
		</div>
		<VTextarea
			v-if="mode === 'write'"
			v-model="model"
			:aria-label="label"
			:rows="rows"
			auto-grow
			:counter="counter"
			:error-messages="errorMessages"
			class="editor-input"
			hint="支援 Markdown：# 標題、- 清單、1. 編號、**粗體**、`程式碼`、[文字](https://網址)、> 引言；空一行分段。"
			persistent-hint
		/>
		<div v-else class="editor-preview" :style="{ minHeight: `${rows * 1.75 + 1.5}rem` }">
			<MarkdownContent v-if="model.trim()" :content="model" :heading-offset="headingOffset" />
			<p v-else class="editor-empty">尚未輸入內容。</p>
			<p v-if="errorMessages" class="editor-error" role="alert">{{ errorMessages }}</p>
		</div>
	</div>
</template>

<style scoped>
.editor-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
.editor-label { font-size: 0.8125rem; font-weight: 600; color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)); }
.editor-input :deep(textarea) { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; font-size: 0.875rem; line-height: 1.7; }
.editor-preview { padding: 16px; border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); border-radius: 8px; background: rgb(var(--v-theme-background)); margin-bottom: 22px; }
.editor-empty { color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)); margin: 0; }
.editor-error { color: rgb(var(--v-theme-error)); font-size: 0.8125rem; margin: 8px 0 0; }
</style>
