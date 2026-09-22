<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { getProcessingStageName, processingStages } from '@/repositories/documents.repository'
import { planBatchReprocess, runBatchReprocess, type BatchStartStage, type BatchVersionScope } from '@/repositories/documents.repository'

interface ComponentProps {
	documentIds: string[]
}

const props = defineProps<ComponentProps>()
const isOpen = defineModel<boolean>({ default: false })
const emit = defineEmits<{
	/** 已排入重新處理，帶回給使用者看的訊息。 */
	done: [message: string]
}>()

const startStage = ref<BatchStartStage>('auto')
const versionScope = ref<BatchVersionScope>('all')

watch(isOpen, (open) => {
	if (!open) return
	startStage.value = 'auto'
	versionScope.value = 'all'
})

// @ 問答與檢索會用到歷史版本，預設全部版本一起重跑，避免新舊版本的處理結果不一致
const versionScopeItems = [
	{ title: '所有版本（含歷史版本）（建議）', value: 'all', props: { subtitle: '問答與檢索會用到歷史版本，各版本維持同一套策略的結果' } },
	{ title: '只有有效版本與待發布的新版本', value: 'active', props: { subtitle: '較省資源，但歷史版本會維持舊策略的結果，策略待套用標記也不會清除' } },
]

const stageItems = [
	{ title: '自動（依各文件狀況決定）', value: 'auto', props: { subtitle: '失敗的從失敗步驟、策略已變更的從最早變更步驟，其餘從頭重跑' } },
	...processingStages.map((stage, index) => ({ title: `${index + 1}. ${stage.name}`, value: stage.id })),
]

const plan = computed(() => (isOpen.value ? planBatchReprocess(props.documentIds, startStage.value, versionScope.value) : []))
// @ 會實際執行的項目：重跑既有工作，或替沒有紀錄的版本建立工作
const queuedItems = computed(() => plan.value.filter((item) => item.status === 'ready' || item.status === 'create'))
const createItems = computed(() => plan.value.filter((item) => item.status === 'create'))
const runningItems = computed(() => plan.value.filter((item) => item.status === 'running'))
const archivedDocumentCount = computed(() => new Set(plan.value.filter((item) => item.status === 'archived').map((item) => item.documentId)).size)
const queuedDocumentCount = computed(() => new Set(queuedItems.value.map((item) => item.documentId)).size)
const pendingCount = computed(() => new Set(queuedItems.value.filter((item) => item.hasPendingStrategy).map((item) => item.documentId)).size)
const overwriteItems = computed(() => queuedItems.value.filter((item) => item.overwritesChunks))

function confirm(): void {
	const documentCount = queuedDocumentCount.value
	const queued = runBatchReprocess(plan.value)
	const skipped = plan.value.length - queued
	emit('done', `已將 ${documentCount} 份文件、共 ${queued} 個版本排入重新處理${skipped ? `，略過 ${skipped} 個版本` : ''}；尚未執行後端處理。`)
	isOpen.value = false
}
</script>

<template>
	<VDialog v-model="isOpen" max-width="620" scrollable>
		<VCard>
			<VCardTitle class="pa-6 pb-2">批次重新處理 {{ documentIds.length }} 份文件</VCardTitle>
			<VCardText class="pa-6 pt-2">
				<p class="text-body-2 mb-4">
					依各文件目前生效的策略重跑整份文件（主文件＋附件）。
				</p>
				<VSelect
					v-model="versionScope"
					:items="versionScopeItems"
					label="處理哪些版本"
					density="comfortable"
					data-testid="batch-version-scope"
				/>
				<VSelect
					v-model="startStage"
					:items="stageItems"
					label="從哪一步開始"
					density="comfortable"
					data-testid="batch-reprocess-stage"
				/>

				<ul class="plan-summary" data-testid="batch-reprocess-summary">
					<li>
						<strong>{{ queuedDocumentCount }}</strong> 份文件、共 <strong>{{ queuedItems.length }}</strong> 個版本會重新處理<template v-if="pendingCount">，其中 {{ pendingCount }} 份有策略變更待套用</template>
					</li>
					<li v-if="createItems.length"><strong>{{ createItems.length }}</strong> 個版本沒有處理紀錄，會建立新的處理工作並從頭處理</li>
					<li v-if="runningItems.length"><strong>{{ runningItems.length }}</strong> 個版本已在佇列或處理中，將略過</li>
					<li v-if="archivedDocumentCount"><strong>{{ archivedDocumentCount }}</strong> 份已下架，將略過</li>
				</ul>

				<VAlert v-if="overwriteItems.length" type="error" variant="tonal" density="compact" class="mb-3">
					{{ overwriteItems.length }} 份文件有人工修改過的切塊，從「切段」或更早的步驟重跑會覆蓋那些修改：{{ overwriteItems.map((item) => item.title).join('、') }}
				</VAlert>

				<details class="plan-details">
					<summary>查看每個版本的處理方式</summary>
					<ul>
						<li v-for="item in plan" :key="`${item.documentId}-${item.version}`" :class="`is-${item.status}`">
							<span class="plan-title">{{ item.title }} · v{{ item.version }} <span class="plan-role">{{ item.versionRole }}</span></span>
							<span class="plan-action">
								<template v-if="item.status === 'ready'">從「{{ getProcessingStageName(item.fromStage) }}」開始</template>
								<template v-else-if="item.status === 'create'">建立處理工作</template>
								<template v-else-if="item.status === 'running'">略過：處理中</template>
								<template v-else>略過：已下架</template>
							</span>
						</li>
					</ul>
				</details>
			</VCardText>
			<VCardActions class="pa-5">
				<VSpacer />
				<VBtn @click="isOpen = false">取消</VBtn>
				<VBtn color="primary" variant="flat" :disabled="!queuedItems.length" data-testid="batch-reprocess-confirm" @click="confirm">
					重新處理 {{ queuedItems.length }} 個版本
				</VBtn>
			</VCardActions>
		</VCard>
	</VDialog>
</template>

<style scoped>
.plan-summary {
	display: grid;
	gap: 4px;
	margin: 0 0 var(--space-md);
	padding-left: 1.2rem;
	font-size: 0.86rem;
}

.plan-details summary {
	color: rgb(var(--v-theme-primary));
	font-size: 0.84rem;
	cursor: pointer;
}

.plan-details ul {
	display: grid;
	margin: var(--space-sm) 0 0;
	padding: 0;
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-sm);
	list-style: none;
}

.plan-details li {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: var(--space-sm);
	padding: 6px var(--space-md);
	font-size: 0.8rem;
}

.plan-details li + li {
	border-top: 1px solid rgb(var(--v-theme-outline));
}

.plan-role {
	margin-left: 4px;
	color: var(--ink-muted);
	font-size: 0.72rem;
}

.plan-details li:not(.is-ready):not(.is-create) {
	color: var(--ink-muted);
}

.plan-action {
	white-space: nowrap;
}
</style>
