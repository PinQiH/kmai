<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import DocumentVersionContent from '@/components/DocumentVersionContent.vue'
import { getDocumentVersionDetail } from '@/repositories/documents.repository'
import { documentChunks, getAttachmentSections, getChunkKey, saveDocumentChunks } from '@/repositories/documents.repository'
import { getDocumentProcessingRecord } from '@/repositories/documents.repository'
import { useToastStore } from '@/stores/toast'
import type { DocumentContentSection, DocumentProcessingFile, DocumentVersionEntry, KnowledgeDocument } from '@/types'

const props = defineProps<{ document: KnowledgeDocument; version: DocumentVersionEntry }>()
/** 目前查看的檔案代號；undefined 代表主文件。 */
const fileId = defineModel<string | undefined>('fileId', { default: undefined })

const chunks = ref<DocumentContentSection[]>([])
const dirty = ref(false)
const toastStore = useToastStore()
const error = ref('')

// > 檔案清單：主文件＋附件，各自有切塊狀態
const record = computed(() => getDocumentProcessingRecord(props.document.id, props.version.version))
const files = computed(() => record.value?.files ?? [])
const attachments = computed(() => files.value.filter((file) => file.role === '附件'))
const selectedFile = computed(() => files.value.find((file) => file.id === fileId.value && file.role === '附件'))
const isAttachment = computed(() => Boolean(selectedFile.value))
// @ 主文件的切塊沿用「文件:版本」鍵，附件才加檔案代號，舊資料不受影響
const storageFileId = computed(() => selectedFile.value?.id)
const key = computed(() => getChunkKey(props.document.id, props.version.version, storageFileId.value))

type ChunkAvailability = { ready: true } | { ready: false; reason: string }

function getChunkStep(file: DocumentProcessingFile | undefined) {
	return (file?.steps ?? record.value?.steps)?.find((step) => step.id === 'chunk')
}

/** 判斷某檔案是否已經切塊；沒有處理紀錄的舊文件視為已有切塊。 */
function getAvailability(file: DocumentProcessingFile | undefined): ChunkAvailability {
	if (!record.value) return { ready: true }
	const step = getChunkStep(file)
	if (!step || step.state === '已完成') return { ready: true }
	const steps = file?.steps ?? record.value.steps
	const failed = steps.find((item) => item.state === '失敗')
	if (failed) return { ready: false, reason: `「${failed.name}」失敗，尚未產生切塊。${file?.note ?? failed.detail}` }
	if (step.state === '未執行') return { ready: false, reason: '處理已取消，沒有產生切塊。' }
	const current = steps.find((item) => item.state === '進行中') ?? steps.find((item) => item.state === '等待中')
	return { ready: false, reason: `切塊尚未產生，目前進行到「${current?.name ?? '等待處理'}」。` }
}

function getSourceSections(file: DocumentProcessingFile | undefined): DocumentContentSection[] {
	if (file) return getAttachmentSections(file.id, file.name)
	return getDocumentVersionDetail({ documentId: props.document.id, version: props.version.version, versionSummary: props.version.summary }).sections
}

function getSavedChunks(file: DocumentProcessingFile | undefined) {
	return documentChunks[getChunkKey(props.document.id, props.version.version, file?.id)]
}

/** 檔案切換列上的切塊狀態摘要。 */
function getChunkSummary(file: DocumentProcessingFile): { label: string; tone: 'ready' | 'edited' | 'pending' | 'blocked' } {
	const target = file.role === '附件' ? file : undefined
	const availability = getAvailability(target)
	if (!availability.ready) return file.state === '失敗' ? { label: '無法切塊', tone: 'blocked' } : { label: '尚未切塊', tone: 'pending' }
	const saved = getSavedChunks(target)
	const count = saved?.chunks.length ?? getSourceSections(target).length
	return saved?.needsReprocessing ? { label: `${count} 個切塊 · 已修改待重跑`, tone: 'edited' } : { label: `${count} 個切塊`, tone: 'ready' }
}

const availability = computed(() => getAvailability(selectedFile.value))
const sourceSections = computed(() => getSourceSections(selectedFile.value))

function reset(): void {
	const saved = documentChunks[key.value]
	const sections = saved?.chunks ?? sourceSections.value
	chunks.value = sections.map((section, index) => ({ ...section, heading: `切塊 ${index + 1}` }))
	dirty.value = false
	error.value = ''
}
watch(key, reset, { immediate: true })

// @ 有未儲存的切塊時先確認，避免切換檔案時默默丟掉修改
const pendingSwitch = ref<DocumentProcessingFile | null>(null)

function applyFile(file: DocumentProcessingFile): void {
	fileId.value = file.role === '附件' ? file.id : undefined
}

function selectFile(file: DocumentProcessingFile): void {
	if (isSelected(file)) return
	if (dirty.value) {
		pendingSwitch.value = file
		return
	}
	applyFile(file)
}

function confirmSwitch(): void {
	if (pendingSwitch.value) applyFile(pendingSwitch.value)
	pendingSwitch.value = null
}

function isSelected(file: DocumentProcessingFile): boolean {
	return file.role === '附件' ? file.id === fileId.value : !isAttachment.value
}

function addChunk(): void {
	// @ 切塊沒有自己的標題，heading 只當內部標記用，顯示一律用序號。
	chunks.value.push({ id: crypto.randomUUID(), heading: `切塊 ${chunks.value.length + 1}`, body: '' })
	dirty.value = true
}
function save(): void {
	try {
		saveDocumentChunks(props.document.id, props.version.version, chunks.value, storageFileId.value)
		dirty.value = false
		error.value = ''
		toastStore.show(`${isAttachment.value ? '附件' : ''}切塊已儲存；向量化、索引、圖譜、摘要與品質診斷需要重新處理。原文保持不變。`)
	} catch (cause) { error.value = cause instanceof Error ? cause.message : '無法儲存切塊。' }
}

// @ 供父層離開保護判斷
defineExpose({ isDirty: dirty })
</script>

<template>
	<section>
		<VAlert type="info" variant="tonal" class="mb-4">左側為原文，右側為可編輯的切塊。切塊沒有標題，只以序號與內容識別；主文件與每個附件各自切塊。</VAlert>

		<div v-if="attachments.length" class="file-switcher" role="tablist" aria-label="選擇要查看切塊的檔案">
			<button
				v-for="file in files"
				:key="file.id"
				type="button"
				role="tab"
				class="file-tab"
				:class="{ 'is-selected': isSelected(file) }"
				:aria-selected="isSelected(file)"
				:data-testid="`chunk-file-${file.id}`"
				@click="selectFile(file)"
			>
				<span class="file-tab-role">{{ file.role }}</span>
				<span class="file-tab-name" :title="file.name">{{ file.name }}</span>
				<span class="file-tab-state" :class="`is-${getChunkSummary(file).tone}`">{{ getChunkSummary(file).label }}</span>
			</button>
		</div>

		<VAlert v-if="!availability.ready" type="warning" variant="tonal" class="mb-4" data-testid="chunk-unavailable">
			{{ availability.reason }}
			<p class="text-body-2 mt-1">可到「處理進度」分頁查看詳細步驟，或重新處理這個檔案。</p>
		</VAlert>
		<template v-else>
			<VAlert v-if="documentChunks[key]?.needsReprocessing" type="warning" variant="tonal" class="mb-4">切塊已修改，下游五個階段待重新處理。</VAlert>
			<div class="chunk-compare">
				<div class="compare-pane">
					<h2 class="text-h6 mb-4">{{ isAttachment ? `附件原文：${selectedFile?.name}` : '原文件' }}</h2>
					<DocumentVersionContent v-if="!isAttachment" :document="document" :version="version" />
					<template v-else>
						<p v-for="section in sourceSections" :key="section.id" class="source-paragraph">{{ section.body }}</p>
					</template>
				</div>
				<div class="compare-pane"><h2 class="text-h6 mb-4">切塊（{{ chunks.length }}）</h2>
					<VAlert v-if="!chunks.length" type="info" variant="tonal">尚未抽取文字；請先查看原始檔案，或手動新增切塊。</VAlert>
					<div v-for="(chunk, index) in chunks" :key="chunk.id" class="mb-5">
						<div class="d-flex align-center"><strong>切塊 {{ index + 1 }} · {{ chunk.body.length }} 字元</strong><VSpacer /><VBtn variant="text" size="small" :aria-label="`刪除切塊 ${index + 1}`" @click="chunks.splice(index, 1); dirty = true">刪除</VBtn></div>
						<VTextarea v-model="chunk.body" :label="`切塊 ${index + 1} 內容`" class="mt-2" auto-grow rows="5" @update:model-value="dirty = true" />
					</div>
					<VBtn variant="outlined" @click="addChunk">新增切塊</VBtn>
				</div>
			</div>
			<VAlert v-if="error" type="error" variant="tonal" class="mt-4">{{ error }}</VAlert>
			<div class="d-flex ga-3 mt-4"><VBtn color="primary" :disabled="!dirty" @click="save">儲存切塊</VBtn><VBtn variant="text" :disabled="!dirty" @click="reset">放棄變更</VBtn><span v-if="dirty" role="status">有尚未儲存的切塊變更</span></div>
		</template>

		<VDialog :model-value="Boolean(pendingSwitch)" max-width="440" @update:model-value="pendingSwitch = null">
			<VCard>
				<VCardTitle class="pa-6 pb-2">放棄未儲存的切塊？</VCardTitle>
				<VCardText class="pa-6 pt-2">目前檔案的切塊有尚未儲存的變更，切換到「{{ pendingSwitch?.name }}」會放棄這些變更。</VCardText>
				<VCardActions class="pa-5">
					<VSpacer />
					<VBtn @click="pendingSwitch = null">返回編輯</VBtn>
					<VBtn color="error" @click="confirmSwitch">放棄並切換</VBtn>
				</VCardActions>
			</VCard>
		</VDialog>
	</section>
</template>

<style scoped>
.chunk-compare { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
.compare-pane { min-width: 0; max-height: 70vh; overflow: auto; padding: 16px; border: 1px solid rgb(var(--v-theme-outline)); border-radius: 8px; }
.source-paragraph { margin: 0 0 12px; font-size: 0.9rem; line-height: 1.8; white-space: pre-wrap; }

.file-switcher {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	gap: 8px;
	margin-bottom: 16px;
}

.file-tab {
	display: grid;
	gap: 2px;
	padding: 8px 12px;
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: 8px;
	background: rgb(var(--v-theme-surface));
	color: inherit;
	text-align: left;
	cursor: pointer;
}

.file-tab:hover { background: rgb(var(--v-theme-on-surface) / 4%); }
.file-tab:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 1px; }
.file-tab.is-selected { border-color: rgb(var(--v-theme-primary)); background: rgb(var(--v-theme-primary) / 8%); }
.file-tab-role { color: var(--ink-muted); font-size: 0.72rem; }
.file-tab-name { overflow: hidden; font-size: 0.86rem; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.file-tab-state { font-size: 0.74rem; }
.file-tab-state.is-ready { color: rgb(var(--v-theme-success)); }
.file-tab-state.is-edited { color: rgb(var(--v-theme-warning)); }
.file-tab-state.is-pending { color: var(--ink-muted); }
.file-tab-state.is-blocked { color: rgb(var(--v-theme-error)); }

@media (max-width: 900px) { .chunk-compare { grid-template-columns: 1fr; } .compare-pane { max-height: none; } }
</style>
