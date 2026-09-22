<script setup lang="ts">
import DocumentFileActions from '@/components/DocumentFileActions.vue'
import { versionFiles } from '@/repositories/documents.repository'
import type { DocumentVersionEntry } from '@/types'

// > 文件管理詳情的版本紀錄：最新在上，可切換檢視版本、下載該版原始檔，並從這裡上傳新版本

interface ComponentProps {
	documentId: string
	versions: DocumentVersionEntry[]
}

defineProps<ComponentProps>()
/** 目前檢視中的版本號。 */
const selectedVersion = defineModel<string>({ required: true })
const emit = defineEmits<{ upload: [] }>()

function statusColor(entry: DocumentVersionEntry): string {
	if (entry.isCurrent) return 'success'
	return entry.status === '等待處理' ? 'warning' : 'surface-variant'
}
</script>

<template>
	<VCard class="surface-border pa-6">
		<div class="section-head">
			<div>
				<h2 class="section-heading">版本紀錄</h2>
				<p class="tab-note">最新的版本在最上面。處理與審核期間，前台仍顯示目前有效版本。</p>
			</div>
			<VSpacer />
			<VBtn color="primary" prepend-icon="mdi-upload" @click="emit('upload')">上傳新版本</VBtn>
		</div>
		<ol class="version-rows">
			<li
				v-for="entry in versions"
				:key="entry.version"
				class="version-row"
				:class="{ 'is-current': entry.isCurrent, 'is-viewing': entry.version === selectedVersion }"
			>
				<div class="version-mark">
					<span class="version-number">{{ entry.version }}</span>
					<span class="version-date">{{ entry.date }}</span>
				</div>
				<div class="version-main">
					<div class="version-line">
						<VChip size="x-small" variant="flat" :color="statusColor(entry)">
							{{ entry.isCurrent ? '目前有效版本' : (entry.status ?? '歷史版本') }}
						</VChip>
						<span v-if="entry.version === selectedVersion" class="viewing-tag">檢視中</span>
						<span class="tab-note">{{ entry.author }}</span>
					</div>
					<p class="version-summary">{{ entry.summary || '（沒有版本說明）' }}</p>
					<ul v-if="entry.changes.length" class="version-changes">
						<li v-for="change in entry.changes" :key="change">{{ change }}</li>
					</ul>
				</div>
				<div class="version-actions">
					<VBtn
						:variant="entry.version === selectedVersion ? 'tonal' : 'text'"
						size="small"
						prepend-icon="mdi-text-box-search-outline"
						@click="selectedVersion = entry.version"
					>
						檢視這一版
					</VBtn>
					<DocumentFileActions
						v-if="versionFiles[documentId]?.[entry.version]?.file"
						:file="versionFiles[documentId][entry.version].file!"
						:label="`第 ${entry.version} 版`"
					/>
				</div>
			</li>
		</ol>
	</VCard>
</template>

<style scoped>
.tab-note {
	color: var(--ink-muted);
	font-size: 0.82rem;
	line-height: 1.6;
}

.section-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	gap: var(--space-md);
	margin-bottom: var(--space-lg);
}

.version-rows {
	display: grid;
	gap: var(--space-sm);
	margin: 0;
	padding: 0;
	list-style: none;
}

.version-row {
	display: grid;
	grid-template-columns: 82px minmax(0, 1fr) auto;
	align-items: center;
	gap: var(--space-md);
	padding: var(--space-md);
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-sm);
}

.version-row.is-viewing {
	border-color: rgb(var(--v-theme-primary));
	background: rgb(var(--v-theme-primary) / 5%);
}

.version-mark {
	display: grid;
	gap: 2px;
	text-align: center;
}

.version-number {
	font-size: 1.05rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.version-date {
	color: var(--ink-muted);
	font-size: 0.72rem;
	font-variant-numeric: tabular-nums;
}

.version-main {
	min-width: 0;
}

.version-line {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-sm);
}

.viewing-tag {
	color: rgb(var(--v-theme-primary));
	font-size: 0.74rem;
	font-weight: 700;
}

.version-summary {
	margin-top: 4px;
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.version-changes {
	display: flex;
	flex-wrap: wrap;
	gap: 4px var(--space-md);
	margin: 6px 0 0;
	padding-left: 1.1rem;
	color: var(--ink-muted);
	font-size: 0.78rem;
}

.version-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: flex-end;
	gap: 2px;
}

@media (max-width: 700px) {
	.version-row {
		grid-template-columns: 1fr;
	}

	.version-mark {
		display: flex;
		align-items: baseline;
		gap: var(--space-sm);
		text-align: left;
	}

	.version-actions {
		justify-content: flex-start;
	}
}
</style>
