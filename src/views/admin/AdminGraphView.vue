<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import FilterSearchField from '@/components/FilterSearchField.vue'
import GraphEntityDrawer from '@/components/GraphEntityDrawer.vue'
import GraphRebuildDialog from '@/components/GraphRebuildDialog.vue'
import PageHeader from '@/components/PageHeader.vue'
import { useToastStore } from '@/stores/toast'
import StatusChip from '@/components/StatusChip.vue'
import { GRAPH_CLUSTERS_BY_KNOWLEDGE_SOURCE, GRAPH_NODE_TYPES, type GraphNodeType } from '@/mocks/graph'
import {
	BUILD_MODE_LABELS,
	BUILD_STATUS_COLORS,
	BUILD_STATUS_LABELS,
	SUMMARY_STATUS_COLORS,
	SUMMARY_STATUS_LABELS,
	advanceRebuild,
	cancelRebuild,
	completeResummarize,
	decideCandidate,
	getCandidatesForScope,
	getDegreeMap,
	getEntity,
	getLastSucceededJob,
	getLiveEdges,
	getOrphanEntities,
	getRetiredOnlyEntities,
	getRunningJob,
	getScopeCommunities,
	getScopeEntities,
	getUnappliedDecisions,
	graphAdminState,
	jobCoversScope,
	requestResummarize,
	startRebuild,
	swapCandidatePrimary,
	type BuildMode,
	type BuildStatus,
	type GraphEntity,
	type GraphScope,
	type MergeCandidate,
	type SummaryStatus,
} from '@/mocks/graphAdmin'
import { workspaceDocuments } from '@/mocks/documentWorkspace'
import { getCompanyKnowledgeSourceById } from '@/utils/knowledgeSources'

type GraphTab = 'health' | 'entities' | 'review' | 'communities' | 'builds'
type EntityFilter = 'all' | 'orphan' | 'retired' | 'hidden'
type CommunityFilter = SummaryStatus | 'all'
type ReviewFilter = 'pending' | 'decided' | 'all'

// TODO(api-integration): 操作者應取自登入身分
const CURRENT_ACTOR = '目前帳號'
const graphTabs: GraphTab[] = ['health', 'entities', 'review', 'communities', 'builds']
const scopeIds = Object.keys(GRAPH_CLUSTERS_BY_KNOWLEDGE_SOURCE) as Exclude<GraphScope, 'all'>[]
const scopeOptions: Array<{ title: string; value: GraphScope }> = [
	{ title: '全部知識主題', value: 'all' },
	...scopeIds.map((id) => ({ title: getCompanyKnowledgeSourceById(id)?.name ?? id, value: id })),
]
const entityHeaders = [
	{ title: '實體', key: 'label' },
	{ title: '類型', key: 'type', width: 100 },
	{ title: '主題', key: 'cluster', width: 130 },
	// @ 不用 align: 'end'：Vuetify 會把靠右欄位的排序箭頭放到文字左側，與其他欄不一致
	{ title: '關係', key: 'degree', width: 120 },
	{ title: '來源文件', key: 'documentCount', width: 140 },
]
const buildHeaders = [
	{ title: '開始時間', key: 'startedAt', width: 150 },
	{ title: '範圍與方式', key: 'scope', sortable: false },
	{ title: '狀態', key: 'status', width: 240, sortable: false },
	{ title: '結果', key: 'result', sortable: false },
	{ title: '觸發', key: 'triggeredBy', width: 100 },
]

const route = useRoute()
const router = useRouter()

// > 範圍與分頁都寫進網址，其他頁面可直接連到「某主題的合併覆核」
const scope = ref<GraphScope>('all')
const activeTab = ref<GraphTab>('health')
const entityDocumentId = ref('')
watch(() => route.query, (query) => {
	const nextScope = scopeOptions.find((option) => option.value === query.scope)?.value
	const nextTab = graphTabs.find((tab) => tab === query.tab)
	scope.value = nextScope ?? 'all'
	if (nextTab) activeTab.value = nextTab
	// @ 文件詳細頁連過來時帶 documentId，只列出這份文件抽出的實體
	entityDocumentId.value = typeof query.documentId === 'string' ? query.documentId : ''
}, { immediate: true })
watch([scope, activeTab], ([nextScope, nextTab]) => {
	const query = { ...route.query, scope: nextScope === 'all' ? undefined : nextScope, tab: nextTab === 'health' ? undefined : nextTab }
	if (query.scope !== route.query.scope || query.tab !== route.query.tab) router.replace({ query })
})

const toastStore = useToastStore()
function notify(text: string, tone: 'success' | 'error' | 'warning' | 'info' = 'success'): void {
	toastStore.show(text, tone)
}
const errorMessage = ref('')
const scopeLabel = computed(() => scopeOptions.find((option) => option.value === scope.value)?.title ?? '')

// > 規模與健康狀態
const scopeEntities = computed(() => getScopeEntities(scope.value))
const liveEntities = computed(() => scopeEntities.value.filter((entity) => entity.status !== 'hidden' && entity.status !== 'merged'))
const degreeMap = computed(() => getDegreeMap())
const scopeEdgeCount = computed(() => {
	const ids = new Set(liveEntities.value.map((entity) => entity.id))
	return getLiveEdges().filter((edge) => ids.has(edge.from) || ids.has(edge.to)).length
})
const scopeClusters = computed(() => new Set(scopeEntities.value.map((entity) => entity.cluster)))
const scopeDocuments = computed(() => workspaceDocuments.filter((document) => scope.value === 'all' || document.knowledgeSourceId === scope.value))
const coveredDocumentIds = computed(() => new Set(liveEntities.value.flatMap((entity) => entity.documentIds)))
const uncoveredDocuments = computed(() => scopeDocuments.value.filter((document) => !coveredDocumentIds.value.has(document.id) && document.status !== '已下架'))
const orphans = computed(() => getOrphanEntities(scope.value))
const candidates = computed(() => getCandidatesForScope(scope.value))
const pendingCandidates = computed(() => candidates.value.filter((candidate) => candidate.decision === 'pending'))
const unappliedDecisions = computed(() => getUnappliedDecisions(scope.value))
const communities = computed(() => getScopeCommunities(scope.value))
const troubledCommunities = computed(() => communities.value.filter((community) => community.summaryStatus === 'failed' || community.summaryStatus === 'stale'))
const scopeJobs = computed(() => graphAdminState.jobs.filter((job) => jobCoversScope(job, scope.value)))
const runningJob = computed(() => getRunningJob())
const lastSucceeded = computed(() => getLastSucceededJob(scope.value))
const latestJob = computed(() => scopeJobs.value.find((job) => job.status !== 'running'))
const retiredEntities = computed(() => getRetiredOnlyEntities(scope.value))

interface HealthItem { id: string; title: string; description: string; count: number; tone: 'error' | 'warning' | 'info'; action: string; run: () => void }
const healthItems = computed<HealthItem[]>(() => [
	{ id: 'build', title: '最近一次重建失敗', description: latestJob.value?.error ?? '', count: latestJob.value?.status === 'failed' ? 1 : 0, tone: 'error' as const, action: '查看紀錄', run: () => { activeTab.value = 'builds' } },
	{ id: 'review', title: '待覆核的合併建議', description: '系統認為可能是同一件事、但沒有把握的名稱。未處理前，同一件事會在圖上分成兩個節點。', count: pendingCandidates.value.length, tone: 'warning' as const, action: '開始覆核', run: () => { activeTab.value = 'review'; reviewFilter.value = 'pending' } },
	{ id: 'applied', title: '覆核決定尚未套用', description: '合併決定要經過完整重建才會反映到圖譜與問答。', count: unappliedDecisions.value.length, tone: 'info' as const, action: '排入完整重建', run: () => openRebuild('full') },
	{ id: 'orphan', title: '孤立實體', description: '沒有任何關係的實體，通常是擷取雜訊，問答時也無法帶出相關知識。', count: orphans.value.length, tone: 'warning' as const, action: '檢視實體', run: () => { activeTab.value = 'entities'; entityFilter.value = 'orphan' } },
	{ id: 'retired-source', title: '來源文件全部下架的實體', description: '這些實體的每一份來源文件都已下架，卻仍出現在前台圖譜與問答中；下一次重建（快速或完整）會移除。只有部分來源下架的實體仍有其他文件支撐，不會列在這裡。', count: retiredEntities.value.length, tone: 'warning' as const, action: '檢視實體', run: () => { activeTab.value = 'entities'; clearEntityFilters(); entityFilter.value = 'retired' } },
	{ id: 'community', title: '主題摘要失敗或過期', description: '摘要會顯示在前台圖譜與問答的主題說明。', count: troubledCommunities.value.length, tone: 'warning' as const, action: '查看社群', run: () => { activeTab.value = 'communities'; communityFilter.value = 'all' } },
	{ id: 'coverage', title: '尚未納入圖譜的文件', description: uncoveredDocuments.value.map((document) => `${document.title}（${document.status}）`).join('、'), count: uncoveredDocuments.value.length, tone: 'info' as const, action: '查看這些文件的處理', run: () => router.push({ path: '/admin/processing', query: { tab: 'all', documentId: uncoveredDocuments.value.map((document) => document.id) } }) },
].filter((item) => item.count > 0))

// > 實體清單
const entitySearch = ref('')
const entityType = ref<GraphNodeType | 'all'>('all')
const entityFilter = ref<EntityFilter>('all')
// @ 已隱藏的實體只在篩選「已隱藏」時列出，避免誤以為它們還在圖上；已合併的永遠不列出，搜尋舊名稱會找到主要實體的別名
const drawerEntityId = ref<string | null>(null)
const entityTypeOptions = [{ title: '全部類型', value: 'all' as const }, ...GRAPH_NODE_TYPES.map((type) => ({ title: type, value: type }))]
const entityFilterOptions = computed(() => [
	{ title: '全部實體', value: 'all' as const },
	{ title: `孤立實體（${orphans.value.length}）`, value: 'orphan' as const },
	{ title: `來源全部下架（${retiredEntities.value.length}）`, value: 'retired' as const },
	{ title: `已隱藏（${hiddenEntityCount.value}）`, value: 'hidden' as const },
])
const entityRows = computed(() => {
	const keyword = entitySearch.value?.trim().toLocaleLowerCase('zh-TW') ?? ''
	const orphanIds = new Set(orphans.value.map((entity) => entity.id))
	const retiredIds = new Set(retiredEntities.value.map((entity) => entity.id))
	return scopeEntities.value
		.filter((entity) => {
			if (entityDocumentId.value && !entity.documentIds.includes(entityDocumentId.value)) return false
			if (entityType.value !== 'all' && entity.type !== entityType.value) return false
			if (entityFilter.value === 'orphan' && !orphanIds.has(entity.id)) return false
			if (entityFilter.value === 'retired' && !retiredIds.has(entity.id)) return false
			if (entity.status === 'merged' || (entity.status === 'hidden') !== (entityFilter.value === 'hidden')) return false
			return !keyword || [entity.label, ...entity.aliases].join(' ').toLocaleLowerCase('zh-TW').includes(keyword)
		})
		.map((entity) => ({ ...entity, degree: degreeMap.value.get(entity.id) ?? 0, documentCount: entity.documentIds.length, isOrphan: orphanIds.has(entity.id) }))
})
const listedEntityCount = computed(() => scopeEntities.value.filter((entity) => entity.status === 'active').length)
const hiddenEntityCount = computed(() => scopeEntities.value.filter((entity) => entity.status === 'hidden').length)
const hasEntityFilter = computed(() => Boolean(entitySearch.value?.trim()) || entityType.value !== 'all' || entityFilter.value !== 'all' || Boolean(entityDocumentId.value))
const entityDocumentTitle = computed(() => workspaceDocuments.find((document) => document.id === entityDocumentId.value)?.title ?? entityDocumentId.value)

function clearDocumentFilter(): void {
	entityDocumentId.value = ''
	if (route.query.documentId) router.replace({ query: { ...route.query, documentId: undefined } })
}

function clearEntityFilters(): void {
	entitySearch.value = ''
	entityType.value = 'all'
	entityFilter.value = 'all'
	clearDocumentFilter()
}

function openEntity(id: string): void {
	drawerEntityId.value = id
}


// > 合併覆核
const reviewFilter = ref<ReviewFilter>('pending')
const reviewRows = computed(() => candidates.value.filter((candidate) => reviewFilter.value === 'all' || (reviewFilter.value === 'pending') === (candidate.decision === 'pending')))

function entityOf(id: string): GraphEntity {
	return getEntity(id)!
}

function decide(candidate: MergeCandidate, decision: MergeCandidate['decision']): void {
	decideCandidate(candidate.id, decision, CURRENT_ACTOR)
	const primary = entityOf(candidate.primaryId).label
	const duplicate = entityOf(candidate.duplicateId).label
	notify(decision === 'merge'
		? `已記錄：「${duplicate}」將合併到「${primary}」，完整重建後生效。`
		: decision === 'reject'
			? `已記錄：「${duplicate}」與「${primary}」保持獨立，之後不再建議合併。`
			: `已撤回「${duplicate}」的決定。`)
}

function confidenceTone(value: number): string {
	return value >= 0.8 ? 'success' : value >= 0.6 ? 'warning' : 'error'
}

// > 主題社群
const timers = new Set<number>()
const communityFilter = ref<CommunityFilter>('all')
const communityFilterOptions = computed(() => [
	{ value: 'all' as const, title: '全部', count: communities.value.length },
	...(['failed', 'stale', 'processing', 'ready'] as SummaryStatus[]).map((status) => ({ value: status, title: SUMMARY_STATUS_LABELS[status], count: communities.value.filter((community) => community.summaryStatus === status).length })),
])
const visibleCommunities = computed(() => communities.value.filter((community) => communityFilter.value === 'all' || community.summaryStatus === communityFilter.value))

function communityMembers(cluster: string): GraphEntity[] {
	return scopeEntities.value
		.filter((entity) => entity.cluster === cluster && entity.status !== 'hidden' && entity.status !== 'merged')
		.sort((a, b) => (degreeMap.value.get(b.id) ?? 0) - (degreeMap.value.get(a.id) ?? 0))
}

function communityDocumentCount(cluster: string): number {
	return new Set(communityMembers(cluster).flatMap((entity) => entity.documentIds)).size
}

function resummarize(id: string, cluster: string): void {
	requestResummarize(id)
	notify(`已排入「${cluster}」的摘要重新產生，只會影響這個主題。`)
	// @ 假資料：模擬背景工作延遲
	const timer = window.setTimeout(() => { completeResummarize(id); timers.delete(timer) }, 2400)
	timers.add(timer)
}

// > 重建
const rebuildOpen = ref(false)
const rebuildInitialMode = ref<BuildMode>('quick')
let buildTimer: number | undefined

function openRebuild(mode: BuildMode): void {
	rebuildInitialMode.value = mode
	rebuildOpen.value = true
}

function runBuildTimer(): void {
	window.clearInterval(buildTimer)
	const job = runningJob.value
	if (!job) return
	// @ 假資料：以計時器推進進度；接後端後改為 SSE 推送
	buildTimer = window.setInterval(() => {
		advanceRebuild(job.id, job.mode === 'full' ? 4 : 10)
		if (job.status === 'running') return
		window.clearInterval(buildTimer)
		if (job.status === 'succeeded') notify(`${BUILD_MODE_LABELS[job.mode]}完成：${job.result!.nodes} 個實體、${job.result!.edges} 條關係${job.result!.merged ? `，合併 ${job.result!.merged} 組名稱` : ''}。`)
	}, 700)
}

function confirmRebuild(targetScope: GraphScope, mode: BuildMode): void {
	const result = startRebuild(targetScope, mode, CURRENT_ACTOR)
	if (typeof result === 'string') {
		errorMessage.value = result
		return
	}
	rebuildOpen.value = false
	errorMessage.value = ''
	runBuildTimer()
}

function stopRebuild(): void {
	if (!runningJob.value) return
	cancelRebuild(runningJob.value.id)
	window.clearInterval(buildTimer)
	notify('已取消重建，圖譜維持上一次成功的版本。', 'info')
}

// 離開頁面再回來時，未完成的模擬工作要接著跑
runBuildTimer()

onBeforeUnmount(() => {
	window.clearInterval(buildTimer)
	timers.forEach((timer) => window.clearTimeout(timer))
})

function scopeName(value: GraphScope): string {
	return scopeOptions.find((option) => option.value === value)?.title ?? value
}
</script>

<template>
	<div class="page-shell">
		<PageHeader eyebrow="知識關聯" title="圖譜管理" description="覆核系統從文件擷取出的實體與關係，處理重複名稱與雜訊，並在需要時重建圖譜。這裡的修正會反映到前台知識圖譜與問答的圖譜擴充。">
			<template #actions>
				<VSelect v-model="scope" :items="scopeOptions" label="知識主題" density="compact" hide-details class="scope-select" data-testid="graph-scope" />
				<VBtn color="primary" prepend-icon="mdi-graph-outline" :disabled="Boolean(runningJob)" data-testid="graph-rebuild" @click="openRebuild(unappliedDecisions.length ? 'full' : 'quick')">重建圖譜</VBtn>
			</template>
		</PageHeader>

		<div v-if="runningJob" class="build-banner" role="status" data-testid="graph-build-banner">
			<div class="build-banner-text">
				<strong>{{ BUILD_MODE_LABELS[runningJob.mode] }}中 · {{ scopeName(runningJob.scope) }}</strong>
				<span>{{ runningJob.stage }} · {{ runningJob.progress }}% · 期間前台圖譜維持上一個版本</span>
			</div>
			<VProgressLinear :model-value="runningJob.progress" color="primary" rounded height="6" class="build-progress" :aria-label="`重建進度 ${runningJob.progress}%`" />
			<VBtn variant="text" size="small" @click="stopRebuild">取消重建</VBtn>
		</div>
		<VAlert v-else-if="unappliedDecisions.length" type="info" variant="tonal" density="compact" class="mb-5">
			{{ unappliedDecisions.length }} 項合併覆核決定尚未套用，完整重建後才會生效。
			<template #append><VBtn variant="text" size="small" @click="openRebuild('full')">排入完整重建</VBtn></template>
		</VAlert>
		<VAlert v-if="errorMessage" type="error" variant="tonal" density="compact" closable class="mb-5" @click:close="errorMessage = ''">{{ errorMessage }}</VAlert>

		<dl class="metric-row" :aria-label="`${scopeLabel}圖譜規模`">
			<div><dt>實體</dt><dd>{{ liveEntities.length }}</dd><span>另有 {{ scopeEntities.length - liveEntities.length }} 個已隱藏或合併</span></div>
			<div><dt>關係</dt><dd>{{ scopeEdgeCount }}</dd><span>{{ scopeClusters.size }} 個主題社群</span></div>
			<div><dt>來源文件</dt><dd>{{ coveredDocumentIds.size }}<small> / {{ scopeDocuments.length }}</small></dd><span>已納入圖譜 / 範圍內文件</span></div>
			<div><dt>最近成功重建</dt><dd class="is-text">{{ lastSucceeded?.finishedAt ?? '尚未建立' }}</dd><span v-if="lastSucceeded">{{ BUILD_MODE_LABELS[lastSucceeded.mode] }} · {{ lastSucceeded.triggeredBy }}</span></div>
		</dl>

		<VTabs v-model="activeTab" color="primary" show-arrows class="mb-5">
			<VTab value="health">健康檢查<VChip v-if="healthItems.length" size="x-small" color="warning" variant="tonal" class="ms-2">{{ healthItems.length }}</VChip></VTab>
			<VTab value="entities">實體</VTab>
			<VTab value="review">合併覆核<VChip v-if="pendingCandidates.length" size="x-small" color="warning" variant="tonal" class="ms-2">{{ pendingCandidates.length }}</VChip></VTab>
			<VTab value="communities">主題社群</VTab>
			<VTab value="builds">重建紀錄</VTab>
		</VTabs>

		<VWindow v-model="activeTab" class="graph-window">
			<VWindowItem value="health">
				<div v-if="!healthItems.length" class="empty-state" role="status">
					<VIcon icon="mdi-check-circle-outline" color="success" size="32" />
					<strong>「{{ scopeLabel }}」的圖譜狀態良好</strong>
					<span>沒有待覆核的名稱、孤立實體或失敗的工作。</span>
				</div>
				<ul v-else class="health-list" data-testid="graph-health">
					<li v-for="item in healthItems" :key="item.id" class="health-item" :class="`is-${item.tone}`">
						<span class="health-count">{{ item.count }}</span>
						<div class="health-text">
							<strong>{{ item.title }}</strong>
							<span>{{ item.description }}</span>
						</div>
						<VBtn variant="outlined" size="small" :disabled="item.id === 'applied' && Boolean(runningJob)" @click="item.run">{{ item.action }}</VBtn>
					</li>
				</ul>
			</VWindowItem>

			<VWindowItem value="entities">
				<div class="toolbar">
					<FilterSearchField v-model="entitySearch" density="compact" placeholder="搜尋名稱或別名" aria-label="搜尋實體" class="toolbar-search" data-testid="entity-search" />
					<VSelect v-model="entityType" :items="entityTypeOptions" density="compact" hide-details aria-label="類型" class="toolbar-select" />
					<VSelect v-model="entityFilter" :items="entityFilterOptions" density="compact" hide-details aria-label="需處理的實體" class="toolbar-select" data-testid="entity-filter" />
				</div>
				<VChip v-if="entityDocumentId" closable size="small" prepend-icon="mdi-file-document-outline" class="mb-2" data-testid="entity-document-filter" @click:close="clearDocumentFilter">來源文件：{{ entityDocumentTitle }}</VChip>
				<p class="result-count" aria-live="polite">
					{{ hasEntityFilter ? `符合 ${entityRows.length} / ${listedEntityCount} 個實體` : `共 ${listedEntityCount} 個實體` }}
					<button v-if="hasEntityFilter" type="button" class="link-button" @click="clearEntityFilters">清除條件</button>
				</p>
				<VCard class="surface-border overflow-hidden">
					<div class="table-scroll">
						<VDataTable
							:headers="entityHeaders"
							:items="entityRows"
							item-value="id"
							hover
							:items-per-page="15"
							:sort-by="[{ key: 'degree', order: 'desc' }]"
							no-data-text="找不到符合條件的實體"
							data-testid="entity-table"
							@click:row="(_event: Event, { item }: { item: { id: string } }) => openEntity(item.id)"
						>
							<template #item.label="{ item }">
								<div class="py-2">
									<span class="entity-title">
										<button type="button" class="entity-name" @click.stop="openEntity(item.id)">{{ item.label }}</button>
										<span v-if="item.manuallyEdited" class="entity-tag" title="名稱、類型或別名經人工修改，重建時保留">人工修正</span>
										<span v-if="item.status === 'hidden'" class="entity-tag is-hidden">已隱藏</span>
									</span>
									<p v-if="item.aliases.length" class="cell-sub">別名：{{ item.aliases.join('、') }}</p>
									<p v-if="item.isOrphan" class="cell-sub text-warning">孤立：沒有任何關係</p>
								</div>
							</template>
						</VDataTable>
					</div>
				</VCard>
			</VWindowItem>

			<VWindowItem value="review">
				<div class="toolbar">
					<p class="toolbar-note">系統對下列名稱是否為同一件事沒有把握。決定會先記錄下來，<strong>完整重建</strong>時才套用。</p>
					<VSpacer />
					<VBtnToggle v-model="reviewFilter" mandatory density="compact" variant="outlined" divided color="primary" aria-label="顯示範圍">
						<VBtn value="pending">待決定 {{ pendingCandidates.length }}</VBtn>
						<VBtn value="decided">已決定 {{ candidates.length - pendingCandidates.length }}</VBtn>
						<VBtn value="all">全部</VBtn>
					</VBtnToggle>
				</div>
				<div v-if="!reviewRows.length" class="empty-state" role="status">
					<VIcon icon="mdi-check-circle-outline" color="success" size="32" />
					<strong>{{ reviewFilter === 'pending' ? '沒有待決定的合併建議' : '沒有符合的項目' }}</strong>
					<span>重建圖譜時若發現新的相似名稱，會出現在這裡。</span>
				</div>
				<ul v-else class="review-list" data-testid="review-list">
					<li v-for="candidate in reviewRows" :key="candidate.id" class="review-item" :data-testid="`review-${candidate.id}`">
						<div class="review-pair">
							<div class="review-entity">
								<span class="review-role">主要名稱</span>
								<button type="button" class="entity-name" @click="openEntity(candidate.primaryId)">{{ entityOf(candidate.primaryId).label }}</button>
								<span class="cell-sub">{{ entityOf(candidate.primaryId).type }} · {{ degreeMap.get(candidate.primaryId) ?? 0 }} 條關係 · {{ entityOf(candidate.primaryId).documentIds.length }} 份文件</span>
							</div>
							<VBtn icon="mdi-swap-horizontal" variant="text" size="small" :disabled="candidate.applied" :aria-label="`改以「${entityOf(candidate.duplicateId).label}」為主要名稱`" title="對調主要名稱" @click="swapCandidatePrimary(candidate.id)" />
							<div class="review-entity">
								<span class="review-role">可能重複</span>
								<button type="button" class="entity-name" @click="openEntity(candidate.duplicateId)">{{ entityOf(candidate.duplicateId).label }}</button>
								<span class="cell-sub">{{ entityOf(candidate.duplicateId).type }} · {{ degreeMap.get(candidate.duplicateId) ?? 0 }} 條關係 · {{ entityOf(candidate.duplicateId).documentIds.length }} 份文件</span>
							</div>
						</div>
						<div class="review-evidence">
							<span class="confidence" :class="`text-${confidenceTone(candidate.confidence)}`">系統把握度 {{ Math.round(candidate.confidence * 100) }}%</span>
							<p>{{ candidate.reason }}</p>
						</div>
						<div class="review-actions">
							<template v-if="candidate.decision === 'pending'">
								<VBtn variant="flat" color="primary" size="small" :data-testid="`merge-${candidate.id}`" @click="decide(candidate, 'merge')">是同一個，合併</VBtn>
								<VBtn variant="outlined" size="small" @click="decide(candidate, 'reject')">不是同一個</VBtn>
							</template>
							<template v-else>
								<span class="decision-note">
									<VIcon :icon="candidate.decision === 'merge' ? 'mdi-call-merge' : 'mdi-call-split'" size="16" />
									{{ candidate.decision === 'merge' ? '合併' : '保持獨立' }} · {{ candidate.decidedBy }} · {{ candidate.decidedAt }}
									<template v-if="candidate.applied"> · 已於重建套用</template>
									<template v-else> · 待完整重建</template>
								</span>
								<VBtn v-if="!candidate.applied" variant="text" size="small" @click="decide(candidate, 'pending')">撤回</VBtn>
							</template>
						</div>
					</li>
				</ul>
			</VWindowItem>

			<VWindowItem value="communities">
				<div class="toolbar mb-4">
					<p class="toolbar-note">系統把經常一起出現的實體歸成主題，並產生摘要；摘要會出現在前台圖譜與問答的主題說明。</p>
					<VSpacer />
					<VBtnToggle v-model="communityFilter" mandatory density="compact" variant="outlined" divided color="primary" aria-label="依摘要狀態篩選" data-testid="community-filter">
						<VBtn v-for="option in communityFilterOptions" :key="option.value" :value="option.value" :disabled="option.value !== 'all' && !option.count">{{ option.title }} {{ option.count }}</VBtn>
					</VBtnToggle>
				</div>
				<div v-if="!visibleCommunities.length" class="empty-state" role="status">
					<strong>沒有符合狀態的主題</strong>
					<button type="button" class="link-button" @click="communityFilter = 'all'">顯示全部主題</button>
				</div>
				<div v-else class="community-grid">
					<article v-for="community in visibleCommunities":key="community.id" class="community-card" :data-testid="`community-${community.id}`">
						<header class="community-head">
							<h3>{{ community.cluster }}</h3>
							<StatusChip :status="community.summaryStatus" :color="SUMMARY_STATUS_COLORS[community.summaryStatus]" :label="SUMMARY_STATUS_LABELS[community.summaryStatus]" />
						</header>
						<p class="cell-sub">{{ communityMembers(community.cluster).length }} 個實體 · {{ communityDocumentCount(community.cluster) }} 份文件 · 更新於 {{ community.updatedAt }}</p>
						<p v-if="community.summaryStatus === 'failed'" class="community-summary text-error">{{ community.summaryError }}</p>
						<p v-else class="community-summary">{{ community.summary || '尚未產生摘要。' }}</p>
						<p v-if="community.summaryStatus === 'stale'" class="cell-sub text-warning">主題成員在上次摘要後有變動，摘要可能已不完整。</p>
						<ul v-if="community.keyPoints.length" class="key-points">
							<li v-for="point in community.keyPoints" :key="point">{{ point }}</li>
						</ul>
						<div class="member-chips">
							<button v-for="member in communityMembers(community.cluster).slice(0, 8)" :key="member.id" type="button" class="member-chip" @click="openEntity(member.id)">{{ member.label }}</button>
							<span v-if="communityMembers(community.cluster).length > 8" class="cell-sub">等 {{ communityMembers(community.cluster).length }} 個</span>
						</div>
						<footer class="community-foot">
							<VBtn variant="outlined" size="small" prepend-icon="mdi-refresh" :loading="community.summaryStatus === 'processing'" :disabled="community.summaryStatus === 'processing'" @click="resummarize(community.id, community.cluster)">重新產生摘要</VBtn>
						</footer>
					</article>
				</div>
			</VWindowItem>

			<VWindowItem value="builds">
				<VCard class="surface-border overflow-hidden">
					<div class="table-scroll">
						<VDataTable :headers="buildHeaders" :items="scopeJobs" item-value="id" :items-per-page="10" no-data-text="這個範圍還沒有重建紀錄" data-testid="build-table">
							<template #item.scope="{ item }">
								<div class="py-2">
									<p class="font-weight-medium">{{ scopeName(item.scope) }}</p>
									<p class="cell-sub">{{ BUILD_MODE_LABELS[item.mode] }} · {{ item.documentCount }} 份文件</p>
								</div>
							</template>
							<template #item.status="{ item }">
								<div class="py-2">
									<StatusChip :status="item.status" :color="BUILD_STATUS_COLORS[item.status]" :label="BUILD_STATUS_LABELS[item.status]" />
									<VProgressLinear v-if="item.status === 'running'" :model-value="item.progress" color="primary" rounded height="4" class="mt-2" />
									<p class="cell-sub">{{ item.status === 'succeeded' ? `完成於 ${item.finishedAt}` : item.stage }}</p>
								</div>
							</template>
							<template #item.result="{ item }">
								<span v-if="item.result" class="cell-sub">{{ item.result.nodes }} 個實體 · {{ item.result.edges }} 條關係<template v-if="item.result.merged"> · 合併 {{ item.result.merged }} 組</template></span>
								<span v-else-if="item.error" class="cell-sub text-error">{{ item.error }}</span>
								<span v-else class="cell-sub">—</span>
							</template>
						</VDataTable>
					</div>
				</VCard>
			</VWindowItem>
		</VWindow>

		<GraphEntityDrawer :entity-id="drawerEntityId" @close="drawerEntityId = null" @select="openEntity" @saved="notify" />
		<GraphRebuildDialog v-model="rebuildOpen" :scope="scope" :scope-options="scopeOptions" :initial-mode="rebuildInitialMode" @confirm="confirmRebuild" />
	</div>
</template>

<style scoped>
.graph-window { overflow: visible; }
.scope-select { min-width: 200px; }

.build-banner {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: center;
	gap: var(--space-sm) var(--space-md);
	margin-bottom: var(--space-lg);
	padding: 12px var(--space-md);
	border: 1px solid rgb(var(--v-theme-primary) / 35%);
	border-radius: var(--radius-sm);
	background: rgb(var(--v-theme-primary) / 6%);
}

.build-banner-text { display: grid; gap: 2px; font-size: 0.86rem; }
.build-banner-text span { color: var(--ink-muted); font-variant-numeric: tabular-nums; }
.build-progress { grid-column: 1 / -1; grid-row: 2; }

.metric-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-md); margin: 0 0 var(--space-lg); }
.metric-row > div { display: grid; gap: 2px; padding: var(--space-md); border: 1px solid rgb(var(--v-theme-outline)); border-radius: var(--radius-md); background: rgb(var(--v-theme-surface)); }
.metric-row dt { color: var(--ink-muted); font-size: 0.8rem; }
.metric-row dd { margin: 0; font-size: 1.6rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.3; }
.metric-row dd small { color: var(--ink-muted); font-size: 0.9rem; font-weight: 500; }
.metric-row dd.is-text { font-size: 1.05rem; line-height: 2; }
.metric-row span { color: var(--ink-muted); font-size: 0.76rem; }

.empty-state { display: grid; justify-items: center; gap: var(--space-xs); padding: var(--space-2xl) var(--space-md); border: 1px dashed rgb(var(--v-theme-outline)); border-radius: var(--radius-md); color: var(--ink-muted); text-align: center; }
.empty-state strong { color: var(--ink-strong, inherit); }

.health-list { display: grid; gap: var(--space-sm); margin: 0; padding: 0; list-style: none; }
.health-item { display: flex; align-items: center; gap: var(--space-md); padding: var(--space-md); border: 1px solid rgb(var(--v-theme-outline)); border-left-width: 4px; border-radius: var(--radius-sm); background: rgb(var(--v-theme-surface)); }
.health-item.is-error { border-left-color: rgb(var(--v-theme-error)); }
.health-item.is-warning { border-left-color: rgb(var(--v-theme-warning)); }
.health-item.is-info { border-left-color: rgb(var(--v-theme-info)); }
.health-count { min-width: 2ch; font-size: 1.4rem; font-weight: 700; font-variant-numeric: tabular-nums; text-align: center; }
.health-text { display: grid; flex: 1; gap: 2px; font-size: 0.88rem; }
.health-text span { color: var(--ink-muted); font-size: 0.82rem; }

.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-sm); margin-bottom: var(--space-sm); }
.toolbar-search { max-width: 300px; min-width: 200px; }
.toolbar-select { max-width: 180px; min-width: 150px; }
.toolbar-note { max-width: 62ch; margin: 0; color: var(--ink-muted); font-size: 0.86rem; }
.result-count { display: flex; align-items: center; gap: var(--space-sm); margin: 0 0 var(--space-sm); color: var(--ink-muted); font-size: 0.8rem; }

.link-button { color: rgb(var(--v-theme-primary)); font-size: 0.8rem; text-decoration: underline; text-underline-offset: 2px; }
.entity-name { color: inherit; font-weight: 600; text-align: left; }
.entity-name:hover { color: rgb(var(--v-theme-primary)); text-decoration: underline; text-underline-offset: 2px; }
.link-button:focus-visible, .entity-name:focus-visible, .member-chip:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.entity-title { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.entity-tag { padding: 0 6px; border: 1px solid rgb(var(--v-theme-outline)); border-radius: 4px; color: var(--ink-muted); font-size: 0.72rem; line-height: 1.5; }
.entity-tag.is-hidden { border-color: rgb(var(--v-theme-warning) / 50%); color: rgb(var(--v-theme-warning)); }
.cell-sub { margin: 0; color: var(--ink-muted); font-size: 0.78rem; }
.table-scroll { overflow-x: auto; }
.table-scroll :deep(table) { min-width: 720px; }
.table-scroll :deep(tbody tr) { cursor: pointer; }

.review-list { display: grid; gap: var(--space-sm); margin: var(--space-sm) 0 0; padding: 0; list-style: none; }
.review-item { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) auto; align-items: center; gap: var(--space-md); padding: var(--space-md); border: 1px solid rgb(var(--v-theme-outline)); border-radius: var(--radius-sm); background: rgb(var(--v-theme-surface)); }
.review-pair { display: flex; align-items: center; gap: var(--space-xs); }
.review-entity { display: grid; flex: 1; gap: 1px; min-width: 0; }
.review-role { color: var(--ink-muted); font-size: 0.72rem; }
.review-evidence { display: grid; gap: 2px; font-size: 0.82rem; }
.review-evidence p { margin: 0; color: var(--ink-muted); }
.confidence { font-weight: 600; font-variant-numeric: tabular-nums; }
.review-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: var(--space-sm); }
.decision-note { display: inline-flex; align-items: center; gap: 4px; color: var(--ink-muted); font-size: 0.8rem; }

.community-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-md); }
.community-card { display: flex; flex-direction: column; gap: var(--space-xs); padding: var(--space-md); border: 1px solid rgb(var(--v-theme-outline)); border-radius: var(--radius-md); background: rgb(var(--v-theme-surface)); }
.community-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); }
.community-head h3 { margin: 0; font-size: 1rem; }
.community-summary { margin: var(--space-xs) 0 0; font-size: 0.88rem; line-height: 1.6; }
.key-points { margin: 0; padding-left: 1.2em; color: var(--ink-muted); font-size: 0.82rem; }
.member-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: var(--space-xs); }
.member-chip { padding: 2px 10px; border: 1px solid rgb(var(--v-theme-outline)); border-radius: 999px; color: inherit; font-size: 0.78rem; }
.member-chip:hover { border-color: rgb(var(--v-theme-primary)); color: rgb(var(--v-theme-primary)); }
.community-foot { margin-top: auto; padding-top: var(--space-sm); }

@media (max-width: 960px) {
	.metric-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.review-item { grid-template-columns: minmax(0, 1fr); }
	.review-actions { justify-content: flex-start; }
}

@media (max-width: 600px) {
	.metric-row { grid-template-columns: minmax(0, 1fr); }
	.health-item { flex-wrap: wrap; }
	.toolbar-search, .toolbar-select { max-width: none; flex: 1 1 100%; }
	.scope-select { min-width: 0; flex: 1 1 100%; }
}
</style>
