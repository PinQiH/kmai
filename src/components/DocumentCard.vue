<script setup lang="ts">
import StatusChip from '@/components/StatusChip.vue'
import type { KnowledgeDocument } from '@/types'

interface ComponentProps {
	document: KnowledgeDocument
	showStatus?: boolean
}

withDefaults(defineProps<ComponentProps>(), { showStatus: false })
</script>

<template>
	<VCard class="document-card surface-border h-100" :to="`/documents/${document.id}`">
		<VCardText class="pa-5">
			<div class="d-flex align-center ga-2 mb-3">
				<span class="text-caption text-medium-emphasis">{{ document.department }}</span>
				<span aria-hidden="true">·</span>
				<span class="text-caption text-medium-emphasis">{{ document.category }}</span>
				<VSpacer />
				<StatusChip v-if="showStatus" :status="document.status" />
			</div>
			<h3 class="section-heading">{{ document.title }}</h3>
			<p class="text-body-2 text-medium-emphasis mt-2">{{ document.summary }}</p>
			<div class="d-flex flex-wrap ga-2 mt-4">
				<VChip v-for="tag in document.tags" :key="tag" size="x-small" variant="tonal">{{ tag }}</VChip>
			</div>
			<p class="text-caption text-medium-emphasis mt-4">更新於 <span class="mono">{{ document.updatedAt }}</span> · 第 <span class="mono">{{ document.version }}</span> 版</p>
		</VCardText>
	</VCard>
</template>

<style scoped>
.document-card {
	transition: border-color var(--motion-base) var(--ease-standard), background-color var(--motion-base) var(--ease-standard);
}

.document-card:hover {
	border-color: rgb(var(--v-theme-primary));
	background: rgba(var(--v-theme-primary), 0.03);
}

</style>
