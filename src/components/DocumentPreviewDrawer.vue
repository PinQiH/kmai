<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import DocumentLifecycleTrail from '@/components/DocumentLifecycleTrail.vue'
import DocumentReadingView from '@/components/DocumentReadingView.vue'
import { getWorkspaceVersions } from '@/mocks/documentWorkspace'
import StatePanel from '@/components/StatePanel.vue'
import { getDocumentProcessingRecord } from '@/mocks/documentProcessing'
import { getAdminDocumentById } from '@/repositories/admin.repository'
import type { DocumentVersionEntry } from '@/types'
import { getDocumentLifecycle } from '@/utils/documentLifecycle'

interface ComponentProps {
	modelValue: boolean
	documentId: string | null
}

type PreviewTab = 'content' | 'status'

const props = defineProps<ComponentProps>()
const emit = defineEmits<{ 'update:modelValue': [isOpen: boolean] }>()

const activeTab = ref<PreviewTab>('content')
const selectedVersionNumber = ref('')

const document = computed(() => (props.documentId ? getAdminDocumentById(props.documentId) : undefined))
const processingRecord = computed(() => (props.documentId ? getDocumentProcessingRecord(props.documentId) : undefined))
const lifecycle = computed(() => (document.value ? getDocumentLifecycle(document.value.status) : undefined))

const documentVersions = computed<DocumentVersionEntry[]>(() => document.value ? getWorkspaceVersions(document.value) : [])

const classificationLabel = computed(() => {
	const currentDocument = document.value
	if (!currentDocument) return ''
	return currentDocument.subCategory ? `${currentDocument.category} · ${currentDocument.subCategory}` : currentDocument.category
})

// @ 每次開啟或換文件都回到「目前版本」與內容分頁，避免沿用上一份文件的檢視狀態。
watch(
	() => [props.modelValue, props.documentId] as const,
	([isOpen]) => {
		if (!isOpen) return
		activeTab.value = 'content'
		selectedVersionNumber.value = document.value?.version ?? ''
	},
	{ immediate: true },
)

// @ AI 小幫手的浮動按鈕刻意疊在 overlay 之上（z-index 2401），會壓住抽屜右下角的操作，開啟預覽時先讓它退場。
watch(() => props.modelValue, (isOpen) => {
	window.document.body.classList.toggle('has-preview-drawer', isOpen)
}, { immediate: true })

onBeforeUnmount(() => {
	window.document.body.classList.remove('has-preview-drawer')
})

function close(): void {
	emit('update:modelValue', false)
}
</script>

<template>
	<VDialog
		:model-value="modelValue"
		transition="slide-x-reverse-transition"
		content-class="preview-drawer-content"
		scrollable
		:scrim="true"
		@update:model-value="emit('update:modelValue', $event)"
	>
		<VCard class="preview-drawer" data-testid="document-preview-drawer">
			<template v-if="document">
				<header class="preview-header">
					<div class="preview-heading">
						<div class="preview-meta">
							<span class="preview-role">前台預覽</span>
							<span>{{ classificationLabel }}</span>
							<span aria-hidden="true">·</span>
							<span>{{ document.department }}</span>
						</div>
						<h2 id="document-preview-title">{{ document.title }}</h2>
					</div>
					<VBtn icon="mdi-close" variant="text" aria-label="關閉預覽" @click="close" />
				</header>

				<div class="preview-statusline" :class="`tone-${lifecycle?.tone}`">
					<VIcon :icon="lifecycle?.icon" size="18" aria-hidden="true" />
					<strong>第 {{ lifecycle?.step }} 步 · {{ lifecycle?.stageName }}</strong>
					<span>{{ lifecycle?.headline }}</span>
					<VBtn v-if="activeTab === 'content'" variant="text" size="small" @click="activeTab = 'status'">看處理狀態</VBtn>
				</div>

				<VTabs v-model="activeTab" color="primary" density="comfortable" class="preview-tabs">
					<VTab value="content">文件內容</VTab>
					<VTab value="status">處理與審核狀態</VTab>
				</VTabs>

				<VCardText class="preview-body">
					<VWindow v-model="activeTab">
						<VWindowItem value="content">
							<VAlert
								v-if="document.status !== '已發布'"
								type="info"
								variant="tonal"
								density="compact"
								class="mb-4"
							>
								這份文件目前是「{{ document.status }}」，使用者在知識庫還看不到；以下是發布後會呈現的內容。
							</VAlert>
							<DocumentReadingView
								v-model="selectedVersionNumber"
								:document="document"
								:versions="documentVersions"
								:show-heading="false"
							/>
						</VWindowItem>
						<VWindowItem value="status">
							<DocumentLifecycleTrail :status="document.status" :record="processingRecord" />
							<dl class="preview-facts">
								<div><dt>上傳者</dt><dd>{{ processingRecord?.uploadedBy ?? document.owner }}</dd></div>
								<div><dt>上傳時間</dt><dd>{{ processingRecord?.uploadedAt ?? document.uploadedAt }}</dd></div>
								<div><dt>目前版本</dt><dd>第 {{ document.version }} 版</dd></div>
								<div><dt>可見範圍</dt><dd>{{ document.visibility }}</dd></div>
							</dl>
						</VWindowItem>
					</VWindow>
				</VCardText>

				<VCardActions class="preview-actions">
					<VBtn variant="text" :to="`/admin/documents/${document.id}/manage`" prepend-icon="mdi-pencil-outline" @click="close">管理文件</VBtn>
					<VSpacer />
					<VBtn variant="text" :to="`/documents/${document.id}`" @click="close" append-icon="mdi-open-in-new">在前台開啟</VBtn>
					<VBtn variant="tonal" @click="close">關閉</VBtn>
				</VCardActions>
			</template>
			<StatePanel
				v-else
				class="ma-6"
				icon="mdi-file-alert-outline"
				title="找不到這份文件"
				description="文件可能已被刪除，請關閉預覽後重新整理列表。"
				action-label="關閉預覽"
				@action="close"
			/>
		</VCard>
	</VDialog>
</template>

<style scoped>
.preview-drawer {
	display: flex;
	flex-direction: column;
	height: 100%;
	border-radius: 0;
	background: rgb(var(--v-theme-surface));
}

.preview-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: var(--space-md);
	padding: var(--space-lg) var(--space-lg) var(--space-md);
	border-bottom: 1px solid rgb(var(--v-theme-outline));
}

.preview-meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-xs) var(--space-sm);
	margin-bottom: var(--space-xs);
	color: var(--ink-muted);
	font-size: 0.78rem;
}

.preview-role {
	padding: 2px 8px;
	border-radius: 999px;
	background: rgb(var(--v-theme-primary) / 10%);
	color: rgb(var(--v-theme-primary));
	font-weight: 700;
}

.preview-heading h2 {
	font-size: 1.25rem;
	font-weight: 700;
	line-height: 1.35;
	overflow-wrap: anywhere;
}

.preview-statusline {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-xs) var(--space-sm);
	padding: 10px var(--space-lg);
	background: rgb(var(--v-theme-surface-variant));
	font-size: 0.84rem;
}

.preview-statusline span {
	color: var(--ink-muted);
}

.preview-statusline.tone-warning { background: rgb(var(--v-theme-warning) / 12%); }
.preview-statusline.tone-error { background: rgb(var(--v-theme-error) / 10%); }
.preview-statusline.tone-success { background: rgb(var(--v-theme-success) / 10%); }

.preview-tabs {
	flex: 0 0 auto;
	border-bottom: 1px solid rgb(var(--v-theme-outline));
}

.preview-body {
	flex: 1 1 auto;
	padding: var(--space-lg);
}

.preview-facts {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	gap: var(--space-sm);
	margin: var(--space-md) 0 0;
}

.preview-facts > div {
	padding: var(--space-sm) var(--space-md);
	border-radius: var(--radius-sm);
	background: rgb(var(--v-theme-surface-variant));
}

.preview-facts dt {
	margin-bottom: 2px;
	color: var(--ink-muted);
	font-size: 0.72rem;
}

.preview-facts dd {
	margin: 0;
	font-size: 0.86rem;
	font-weight: 600;
}

.preview-actions {
	flex: 0 0 auto;
	padding: var(--space-sm) var(--space-lg);
	border-top: 1px solid rgb(var(--v-theme-outline));
}

.sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}
</style>

<style>
/* @ VDialog 內容預設置中且自帶寬高限制，需以同等特異度的選擇器改成右側全高抽屜。 */
.v-overlay.v-dialog > .v-overlay__content.preview-drawer-content {
	position: fixed;
	inset-block: 0;
	right: 0;
	width: min(1100px, 100vw);
	max-width: 100vw;
	height: 100%;
	max-height: 100%;
	margin: 0;
	border-radius: 0;
}

body.has-preview-drawer .assistant-launcher {
	display: none;
}
</style>
