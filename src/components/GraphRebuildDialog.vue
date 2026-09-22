<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { estimateRebuild, getUnappliedDecisions, type BuildMode, type GraphScope } from '@/repositories/graph.repository'

interface ComponentProps {
	modelValue: boolean
	scope: GraphScope
	scopeOptions: Array<{ title: string; value: GraphScope }>
	/** 開啟時預選的方式；從「覆核決定待套用」進來時會帶 full */
	initialMode?: BuildMode
}

const props = withDefaults(defineProps<ComponentProps>(), { initialMode: 'quick' })
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; confirm: [scope: GraphScope, mode: BuildMode] }>()

const selectedScope = ref<GraphScope>(props.scope)
const mode = ref<BuildMode>(props.initialMode)

// @ 每次開啟都以頁面目前的範圍與建議方式為準，不沿用上次關閉前的選擇
watch(() => props.modelValue, (open) => {
	if (!open) return
	selectedScope.value = props.scope
	mode.value = props.initialMode
})

const estimate = computed(() => estimateRebuild(selectedScope.value, mode.value))
const unapplied = computed(() => getUnappliedDecisions(selectedScope.value).length)
const scopeLabel = computed(() => props.scopeOptions.find((option) => option.value === selectedScope.value)?.title ?? '')

const modeOptions: Array<{ value: BuildMode; title: string; description: string; note: string }> = [
	{ value: 'quick', title: '快速重建', description: '只重新擷取新增與異動文件的實體與關係，保留已確認實體與人工修正。', note: '不會套用合併覆核決定，也不會重新分群或產生摘要。' },
	{ value: 'full', title: '完整重建', description: '重新讀取範圍內全部文件，套用合併覆核決定、重新分群並用 AI 重寫主題摘要。', note: '會使用 AI 模型額度；執行期間前台圖譜維持舊版本，完成後才切換。' },
]
</script>

<template>
	<VDialog :model-value="modelValue" max-width="600" @update:model-value="emit('update:modelValue', $event)">
		<VCard>
			<VCardTitle class="pa-6 pb-2">重建知識圖譜</VCardTitle>
			<VCardText class="pa-6 pt-2">
				<VSelect v-model="selectedScope" :items="scopeOptions" label="重建範圍" data-testid="rebuild-scope" />
				<VRadioGroup v-model="mode" hide-details class="mode-group" aria-label="重建方式">
					<label v-for="option in modeOptions" :key="option.value" class="mode-option" :class="{ 'is-selected': mode === option.value }">
						<VRadio :value="option.value" :data-testid="`rebuild-mode-${option.value}`" />
						<span class="mode-text">
							<strong>{{ option.title }}</strong>
							<span>{{ option.description }}</span>
							<span class="mode-note">{{ option.note }}</span>
						</span>
					</label>
				</VRadioGroup>

				<dl class="estimate" aria-label="預估影響">
					<div><dt>處理文件</dt><dd>{{ estimate.documentCount }} 份</dd></div>
					<div><dt>預估時間</dt><dd>{{ estimate.minutes }}</dd></div>
					<div><dt>套用覆核決定</dt><dd>{{ estimate.decisions }} 項</dd></div>
				</dl>

				<VAlert v-if="mode === 'quick' && unapplied" type="warning" variant="tonal" density="compact" class="mt-4">
					「{{ scopeLabel }}」有 {{ unapplied }} 項合併覆核決定尚未套用，快速重建不會處理它們。
				</VAlert>
			</VCardText>
			<VCardActions class="pa-5">
				<VSpacer />
				<VBtn @click="emit('update:modelValue', false)">取消</VBtn>
				<VBtn color="primary" variant="flat" data-testid="rebuild-confirm" @click="emit('confirm', selectedScope, mode)">
					{{ mode === 'full' ? '排入完整重建' : '開始快速重建' }}
				</VBtn>
			</VCardActions>
		</VCard>
	</VDialog>
</template>

<style scoped>
.mode-group :deep(.v-selection-control-group) { display: grid; gap: var(--space-sm); }

.mode-option {
	display: flex;
	align-items: flex-start;
	gap: var(--space-xs);
	padding: 12px 12px 12px 4px;
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-sm);
	cursor: pointer;
}

.mode-option.is-selected { border-color: rgb(var(--v-theme-primary)); background: rgb(var(--v-theme-primary) / 6%); }
.mode-text { display: grid; gap: 2px; padding-top: 8px; font-size: 0.86rem; }
.mode-text strong { font-size: 0.94rem; }
.mode-note { color: var(--ink-muted); font-size: 0.8rem; }

.estimate { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-sm); margin: var(--space-md) 0 0; }
.estimate div { padding: 10px 12px; border-radius: var(--radius-sm); background: rgb(var(--v-theme-on-surface) / 4%); }
.estimate dt { color: var(--ink-muted); font-size: 0.76rem; }
.estimate dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }

@media (max-width: 520px) { .estimate { grid-template-columns: minmax(0, 1fr); } }
</style>
