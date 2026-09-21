<script setup lang="ts">
import { computed, ref } from 'vue'

import DocumentStrategyEditor from '@/components/DocumentStrategyEditor.vue'
import { fileTypeGroups, fileTypeOverrideEnabled } from '@/mocks/documentStrategies'

// > 處理策略分頁：全域 + 各檔案類型
const strategyScope = ref<string>('global')

const strategyScopes = computed(() => [
	{ id: 'global', name: '全域預設', description: '沒有其他設定時使用', isCustom: true },
	...fileTypeGroups.map((group) => ({ id: group.id, name: group.name, description: group.description, isCustom: Boolean(fileTypeOverrideEnabled[group.id]) })),
])
const strategyFileTypeId = computed(() => (strategyScope.value === 'global' ? undefined : strategyScope.value))
</script>

<template>
	<div class="strategy-panel">
		<p class="strategy-hint">
			優先順序：<strong>文件</strong>（在文件詳情設定）＞ <strong>檔案類型</strong> ＞ <strong>全域預設</strong>。
			沒有對應檔案類型的檔案，直接使用全域預設。改完某個檔案類型後，可回到「全部文件」分頁用檔案類型篩出文件批次重新處理。
		</p>
		<div class="strategy-layout">
			<nav class="scope-nav" aria-label="策略層級">
				<button
					v-for="scopeItem in strategyScopes"
					:key="scopeItem.id"
					type="button"
					class="scope-item"
					:class="{ 'is-active': strategyScope === scopeItem.id }"
					:aria-current="strategyScope === scopeItem.id ? 'true' : undefined"
					:data-testid="`strategy-scope-${scopeItem.id}`"
					@click="strategyScope = scopeItem.id"
				>
					<span class="scope-name">{{ scopeItem.name }}</span>
					<span class="scope-state">{{ scopeItem.id === 'global' ? scopeItem.description : scopeItem.isCustom ? '已自訂' : '沿用全域' }}</span>
				</button>
			</nav>
			<VCard class="surface-border pa-6">
				<DocumentStrategyEditor :key="strategyScope" :file-type-id="strategyFileTypeId" />
			</VCard>
		</div>
	</div>
</template>

<style scoped>
.strategy-hint {
	margin: 0 0 var(--space-md);
	color: var(--ink-muted);
	font-size: 0.82rem;
	line-height: 1.6;
}

.strategy-layout {
	display: grid;
	grid-template-columns: 220px minmax(0, 1fr);
	align-items: start;
	gap: var(--space-md);
}

.scope-nav {
	display: grid;
	gap: 2px;
	padding: 4px;
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-sm);
}

.scope-item {
	display: grid;
	gap: 1px;
	padding: 8px 10px;
	border-radius: 6px;
	color: inherit;
	text-align: left;
	cursor: pointer;
}

.scope-item:hover {
	background: rgb(var(--v-theme-on-surface) / 5%);
}

.scope-item:focus-visible {
	outline: 2px solid rgb(var(--v-theme-primary));
	outline-offset: 1px;
}

.scope-item.is-active {
	background: rgb(var(--v-theme-primary) / 10%);
	color: rgb(var(--v-theme-primary));
}

.scope-name {
	font-size: 0.86rem;
	font-weight: 600;
}

.scope-state {
	color: var(--ink-muted);
	font-size: 0.72rem;
}

@media (max-width: 760px) {
	.strategy-layout {
		grid-template-columns: minmax(0, 1fr);
	}

	.scope-nav {
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
	}
}
</style>
