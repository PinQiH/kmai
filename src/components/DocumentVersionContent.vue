<script setup lang="ts">
import { computed } from 'vue'
import DocumentSourcePreview from '@/components/DocumentSourcePreview.vue'
import DocumentFileActions from '@/components/DocumentFileActions.vue'
import { getDocumentVersionDetail } from '@/mocks/documentDetails'
import { downloadFile, versionFiles } from '@/mocks/documentFiles'
import type { DocumentVersionEntry, KnowledgeDocument } from '@/types'

const props = defineProps<{ document: KnowledgeDocument; version: DocumentVersionEntry }>()
const files = computed(() => versionFiles[props.document.id]?.[props.version.version])
const detail = computed(() => getDocumentVersionDetail({ documentId: props.document.id, version: props.version.version, versionSummary: props.version.summary }))
const source = computed(() => files.value?.source ?? props.document.source)
function exportText(): void {
	const content = detail.value.sections.map((section) => `${section.heading}\n${section.body}`).join('\n\n')
	downloadFile(new Blob([content], { type: 'text/plain;charset=utf-8' }), `${props.document.title}-v${props.version.version}.txt`)
}
</script>

<template>
	<section class="version-content" aria-label="版本全文">
		<div class="d-flex flex-wrap align-center ga-2 mb-4">
			<strong>第 {{ version.version }} 版全文</strong>
			<VChip size="small">{{ version.isCurrent ? '目前有效版本' : version.status ?? '歷史版本' }}</VChip>
			<VSpacer />
			<DocumentFileActions v-if="files?.file" :file="files.file" label="主要文件" />
			<!-- @ 來源是檔案卻沒有原始檔（示範資料或尚未串接儲存）時，不要偷偷改成下載文字，說清楚原檔不在。 -->
			<VBtn v-else-if="source.type === 'file'" variant="text" size="small" prepend-icon="mdi-download-off-outline" disabled>原始檔案未保存</VBtn>
			<VBtn v-else-if="detail.sections.length" variant="text" size="small" prepend-icon="mdi-download" @click="exportText">下載此版本文字</VBtn>
		</div>
		<p class="mb-4">版本說明：{{ version.summary }}</p>
		<DocumentSourcePreview v-if="detail.sections.length || source.type !== 'file'" :source="source" :title="document.title" :sections="detail.sections" :show-header="false" :show-source-content="files ? detail.sections.length === 0 : Boolean(version.isCurrent)" />
		<VAlert v-else type="info" variant="tonal">尚未取得抽取文字，可使用主要文件的預覽或下載查看原檔。</VAlert>
		<div class="mt-5" aria-label="版本附件">
			<h3 class="text-subtitle-2 mb-2">附件</h3>
			<div v-for="(file, index) in files?.attachments ?? []" :key="`${file.name}-${index}`" class="attachment-line"><span>{{ file.name }}</span><DocumentFileActions :file="file" /></div>
			<p v-if="!files?.attachments.length" class="text-body-2 text-medium-emphasis">此版本沒有可預覽或下載的附件原始檔。</p>
		</div>
	</section>
</template>

<style scoped>
.version-content { min-width: 0; }
.attachment-line { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; overflow-wrap: anywhere; }
</style>
