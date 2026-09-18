<script setup lang="ts">
import { computed } from 'vue'

import { getDocumentGraphSummary } from '@/mocks/graphAdmin'

// > 文件在知識圖譜中的摘要：抽出的實體數、關係數與待覆核數，並連到圖譜管理

interface ComponentProps {
	documentId: string
}

const props = defineProps<ComponentProps>()

// @ 只預覽前幾個實體，完整清單到圖譜管理查看
const ENTITY_PREVIEW_COUNT = 8

const summary = computed(() => getDocumentGraphSummary(props.documentId))
</script>

<template>
	<VCard class="surface-border pa-6" data-testid="detail-graph-summary">
		<p class="text-subtitle-1 font-weight-medium mb-2">知識圖譜</p>
		<template v-if="summary.entities.length">
			<p class="tab-note mb-3">
				這份文件抽出 {{ summary.entities.length }} 個實體、{{ summary.relationCount }} 條相關關係。
				<template v-if="summary.pendingReviewCount">其中 {{ summary.pendingReviewCount }} 個實體有待覆核的合併建議。</template>
			</p>
			<div class="d-flex flex-wrap ga-2 mb-4">
				<VChip v-for="entity in summary.entities.slice(0, ENTITY_PREVIEW_COUNT)" :key="entity.id" size="small" variant="tonal">{{ entity.label }}</VChip>
				<VChip v-if="summary.entities.length > ENTITY_PREVIEW_COUNT" size="small" variant="text">還有 {{ summary.entities.length - ENTITY_PREVIEW_COUNT }} 個</VChip>
			</div>
		</template>
		<p v-else class="tab-note mb-3">尚未納入知識圖譜。文件處理完成後，下一次圖譜重建才會出現。</p>
		<VBtn
			variant="text"
			prepend-icon="mdi-graph-outline"
			:to="{ path: '/admin/graph', query: { tab: 'entities', documentId } }"
		>
			在圖譜管理查看
		</VBtn>
	</VCard>
</template>

<style scoped>
.tab-note {
	color: var(--ink-muted);
	font-size: 0.82rem;
	line-height: 1.6;
}
</style>
