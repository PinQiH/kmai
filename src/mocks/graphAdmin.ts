// > 圖譜管理（後台）的工作階段資料
// @ 實體以 mocks/graph.ts 為基底，再疊上擷取時產生的別名與孤立節點；前台 /graph 仍讀原始那份
// TODO(api-integration): 整組改由後端提供；覆核決定、社群摘要與重建工作都應是伺服器狀態
import { reactive } from 'vue'

import { workspaceDocuments } from '@/mocks/documentWorkspace'
import { GRAPH_CLUSTERS_BY_KNOWLEDGE_SOURCE, graphEdges, graphNodes, type GraphNodeType, type KnowledgeGraphEdge } from '@/mocks/graph'

export type GraphScope = 'all' | keyof typeof GRAPH_CLUSTERS_BY_KNOWLEDGE_SOURCE
/** 內部狀態；介面不顯示狀態欄，合併者不列出、隱藏者需主動開啟才看得到 */
export type EntityStatus = 'active' | 'hidden' | 'merged'
export type MergeDecision = 'pending' | 'merge' | 'reject'
export type BuildMode = 'quick' | 'full'
export type BuildStatus = 'running' | 'succeeded' | 'failed' | 'canceled'
export type SummaryStatus = 'ready' | 'processing' | 'failed' | 'stale'

export interface GraphEntity {
	id: string
	label: string
	type: GraphNodeType
	cluster: string
	aliases: string[]
	documentIds: string[]
	status: EntityStatus
	/** 合併後指向的主要實體 */
	mergedInto?: string
	/** 人工改過名稱／類型／別名，重建時保留 */
	manuallyEdited: boolean
	/** 系統擷取的原始值，供「還原為擷取結果」使用 */
	extracted: { label: string; type: GraphNodeType; aliases: string[] }
	updatedAt: string
}

export interface MergeCandidate {
	id: string
	primaryId: string
	duplicateId: string
	confidence: number
	reason: string
	decision: MergeDecision
	decidedBy?: string
	decidedAt?: string
	/** 決定已在完整重建中套用 */
	applied: boolean
}

export interface GraphCommunity {
	id: string
	cluster: string
	summary: string
	keyPoints: string[]
	summaryStatus: SummaryStatus
	summaryError?: string
	updatedAt: string
}

export interface GraphBuildJob {
	id: string
	scope: GraphScope
	mode: BuildMode
	status: BuildStatus
	progress: number
	stage: string
	startedAt: string
	finishedAt?: string
	triggeredBy: string
	documentCount: number
	result?: { nodes: number; edges: number; merged: number }
	error?: string
}

export const SUMMARY_STATUS_LABELS: Record<SummaryStatus, string> = {
	ready: '摘要已完成',
	processing: '摘要產生中',
	failed: '摘要失敗',
	stale: '摘要待更新',
}

export const SUMMARY_STATUS_COLORS: Record<SummaryStatus, string> = { ready: 'success', processing: 'info', failed: 'error', stale: 'warning' }

export const BUILD_STATUS_LABELS: Record<BuildStatus, string> = {
	running: '執行中',
	succeeded: '完成',
	failed: '失敗',
	canceled: '已取消',
}

export const BUILD_STATUS_COLORS: Record<BuildStatus, string> = { running: 'info', succeeded: 'success', failed: 'error', canceled: 'secondary' }

export const BUILD_MODE_LABELS: Record<BuildMode, string> = { quick: '快速重建', full: '完整重建' }

// @ 重建流程各階段；進度落在哪一段就顯示該段名稱
const BUILD_STAGES: Record<BuildMode, Array<{ until: number; label: string }>> = {
	quick: [
		{ until: 40, label: '讀取異動文件' },
		{ until: 85, label: '擷取實體與關係' },
		{ until: 100, label: '寫入圖譜索引' },
	],
	full: [
		{ until: 25, label: '讀取全部文件' },
		{ until: 55, label: '擷取實體與關係' },
		{ until: 75, label: '套用覆核決定與對齊同義名稱' },
		{ until: 90, label: '重新分群' },
		{ until: 100, label: '產生主題摘要' },
	],
}

const CLUSTER_DOCUMENTS: Record<string, string[]> = {
	差旅與報支: ['doc-001'],
	人事與到職: ['doc-002'],
	績效考核: ['doc-005'],
	資訊安全: ['doc-003'],
	採購與請款: ['doc-004'],
}

// @ 跨文件出現的實體另外指定來源，其餘沿用所屬主題的文件
const NODE_DOCUMENTS: Record<string, string[]> = {
	'n-approver': ['doc-001', 'doc-002', 'doc-004', 'doc-005'],
	'n-finance': ['doc-001', 'doc-004'],
	'n-hr': ['doc-002', 'doc-005'],
	'n-access-request': ['doc-002', 'doc-003'],
	'n-customer-data': ['doc-003'],
	'n-security-policy': ['doc-003'],
	'n-expense-policy': ['doc-001', 'doc-004'],
}

type EntitySeed = Omit<GraphEntity, 'extracted' | 'status' | 'manuallyEdited'> & { status?: EntityStatus }

function toEntity(seed: EntitySeed): GraphEntity {
	return { ...seed, status: seed.status ?? 'active', manuallyEdited: false, extracted: { label: seed.label, type: seed.type, aliases: [...seed.aliases] } }
}

function createEntities(): GraphEntity[] {
	const base = graphNodes.map<EntitySeed>((node) => ({
		...node,
		aliases: [],
		documentIds: [...(NODE_DOCUMENTS[node.id] ?? CLUSTER_DOCUMENTS[node.cluster] ?? [])],
		updatedAt: '2026-09-14 03:10',
	}))
	// > 擷取時產生的別名寫法與孤立節點：前者等待覆核合併，後者是健康檢查要抓的對象
	const extracted: EntitySeed[] = [
		{ id: 'x-expense-reimburse', label: '費用報銷', type: '流程', cluster: '差旅與報支', aliases: [], documentIds: ['doc-001'], updatedAt: '2026-09-14 03:10' },
		{ id: 'x-hr-full', label: '人力資源部', type: '部門', cluster: '人事與到職', aliases: [], documentIds: ['doc-002', 'doc-005'], updatedAt: '2026-09-14 03:10' },
		{ id: 'x-dept-manager', label: '部門主管', type: '角色', cluster: '人事與到職', aliases: [], documentIds: ['doc-002'], updatedAt: '2026-09-14 03:10' },
		{ id: 'x-it-office', label: '資訊處', type: '部門', cluster: '資訊安全', aliases: [], documentIds: ['doc-003'], updatedAt: '2026-09-14 03:10' },
		{ id: 'x-quote-limit', label: '比價門檻', type: '專有名詞', cluster: '採購與請款', aliases: [], documentIds: ['doc-004'], updatedAt: '2026-09-14 03:10' },
		{ id: 'x-probation-review', label: '試用期考核', type: '流程', cluster: '人事與到職', aliases: [], documentIds: ['doc-002'], updatedAt: '2026-09-14 03:10' },
		{ id: 'x-access-card', label: '門禁卡', type: '專有名詞', cluster: '差旅與報支', aliases: [], documentIds: ['doc-008'], updatedAt: '2026-09-13 03:10' },
		{ id: 'x-spec-code', label: '產品規格代碼', type: '專有名詞', cluster: '採購與請款', aliases: [], documentIds: ['doc-004'], updatedAt: '2026-09-14 03:10' },
	]
	return [...base, ...extracted].map(toEntity)
}

function createCandidates(): MergeCandidate[] {
	return [
		{ id: 'mc-01', primaryId: 'n-expense-claim', duplicateId: 'x-expense-reimburse', confidence: 0.91, reason: '兩者都出現在「員工差旅與費用報支辦法」第 4 章，描述同一個送單流程。', decision: 'pending', applied: false },
		{ id: 'mc-02', primaryId: 'n-hr', duplicateId: 'x-hr-full', confidence: 0.88, reason: '「人力資源部」是「人資部」的全稱，兩份文件的承辦窗口相同。', decision: 'pending', applied: false },
		{ id: 'mc-03', primaryId: 'n-approver', duplicateId: 'x-dept-manager', confidence: 0.64, reason: '都負責簽核請假與出差，但「部門主管」在到職指南中也指跨部門主管，可能範圍不同。', decision: 'pending', applied: false },
		{ id: 'mc-04', primaryId: 'n-it', duplicateId: 'x-it-office', confidence: 0.83, reason: '組織改名前後的稱呼；「客戶資料存取與分享規範」兩種寫法並存。', decision: 'pending', applied: false },
		{ id: 'mc-05', primaryId: 'n-quote-threshold', duplicateId: 'x-quote-limit', confidence: 0.79, reason: '同一段條文的簡稱，金額數值一致。', decision: 'pending', applied: false },
		{ id: 'mc-06', primaryId: 'n-probation', duplicateId: 'x-probation-review', confidence: 0.52, reason: '名稱相近，但一個是期間、一個是考核流程，系統沒有把握。', decision: 'pending', applied: false },
	]
}

function createCommunities(): GraphCommunity[] {
	return [
		{ id: 'c-travel', cluster: '差旅與報支', summary: '涵蓋出差申請、住宿與日支費上限，以及費用核銷由財務部承辦的完整流程。', keyPoints: ['出差需事前經直屬主管簽核', '住宿費與日支費依職等設上限', '核銷依簽核層級送財務部'], summaryStatus: 'ready', updatedAt: '2026-09-14 03:10' },
		{ id: 'c-people', cluster: '人事與到職', summary: '到職、請假與離職交接的承辦窗口與代理人規定，並串接權限申請與回收。', keyPoints: ['到職包含權限申請', '請假與離職都要指定代理人', '試用期適用績效考核辦法'], summaryStatus: 'stale', updatedAt: '2026-09-10 03:10' },
		{ id: 'c-security', cluster: '資訊安全', summary: '資料分級與客戶資料的存取規範，權限申請需系統管理員與直屬主管雙重簽核。', keyPoints: ['客戶資料屬最高分級', '權限申請需雙重簽核', '離職時需回收權限'], summaryStatus: 'ready', updatedAt: '2026-09-14 03:10' },
		{ id: 'c-procurement', cluster: '採購與請款', summary: '', keyPoints: [], summaryStatus: 'failed', summaryError: '摘要模型回應逾時（60 秒），請重新產生。', updatedAt: '2026-09-14 03:12' },
		{ id: 'c-review', cluster: '績效考核', summary: '考核週期、績效面談與申覆流程，由人資部承辦申覆。', keyPoints: ['面談由直屬主管主持', '申覆需於期限內提出'], summaryStatus: 'ready', updatedAt: '2026-09-14 03:10' },
	]
}

function createJobs(): GraphBuildJob[] {
	return [
		{ id: 'gb-0914-0310', scope: 'all', mode: 'quick', status: 'succeeded', progress: 100, stage: '完成', startedAt: '2026-09-14 03:10', finishedAt: '2026-09-14 03:12', triggeredBy: '排程', documentCount: 3, result: { nodes: 84, edges: 216, merged: 0 } },
		{ id: 'gb-0913-1422', scope: 'operations', mode: 'quick', status: 'failed', progress: 62, stage: '擷取實體與關係', startedAt: '2026-09-13 14:22', finishedAt: '2026-09-13 14:25', triggeredBy: '林怡君', documentCount: 2, error: '「2026 產品規格彙整」仍在處理中，無法擷取實體；待文件處理完成後再重建。' },
		{ id: 'gb-0907-0200', scope: 'all', mode: 'full', status: 'succeeded', progress: 100, stage: '完成', startedAt: '2026-09-07 02:00', finishedAt: '2026-09-07 02:41', triggeredBy: '排程', documentCount: 8, result: { nodes: 3842, edges: 12906, merged: 17 } },
	]
}

export const graphAdminState = reactive({
	entities: createEntities(),
	candidates: createCandidates(),
	communities: createCommunities(),
	jobs: createJobs(),
})

/** 測試用：還原成初始資料。 */
export function resetGraphAdminState(): void {
	graphAdminState.entities = createEntities()
	graphAdminState.candidates = createCandidates()
	graphAdminState.communities = createCommunities()
	graphAdminState.jobs = createJobs()
}

function now(): string {
	const date = new Date()
	const pad = (value: number) => String(value).padStart(2, '0')
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// > 查詢

export function getScopeClusters(scope: GraphScope): readonly string[] {
	return scope === 'all' ? Object.values(GRAPH_CLUSTERS_BY_KNOWLEDGE_SOURCE).flat() : (GRAPH_CLUSTERS_BY_KNOWLEDGE_SOURCE[scope] ?? [])
}

export function getEntity(id: string): GraphEntity | undefined {
	return graphAdminState.entities.find((entity) => entity.id === id)
}

/** 圖上實際存在的實體（排除已隱藏與已合併）。 */
function isLive(entity: GraphEntity): boolean {
	return entity.status !== 'hidden' && entity.status !== 'merged'
}

export function getScopeEntities(scope: GraphScope): GraphEntity[] {
	const clusters = new Set(getScopeClusters(scope))
	return graphAdminState.entities.filter((entity) => clusters.has(entity.cluster))
}

/** 兩端都存在的關係；合併後的關係已由主要實體承接，這裡不重複計算。 */
export function getLiveEdges(): KnowledgeGraphEdge[] {
	const liveIds = new Set(graphAdminState.entities.filter(isLive).map((entity) => entity.id))
	return graphEdges.filter((edge) => liveIds.has(edge.from) && liveIds.has(edge.to))
}

export function getDegreeMap(): Map<string, number> {
	const degrees = new Map<string, number>()
	for (const edge of getLiveEdges()) {
		degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1)
		degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1)
	}
	return degrees
}

export function getEntityRelations(entityId: string): Array<{ entity: GraphEntity; label: string; direction: 'out' | 'in' }> {
	return getLiveEdges().flatMap((edge) => {
		const direction = edge.from === entityId ? 'out' : edge.to === entityId ? 'in' : null
		const other = direction ? getEntity(direction === 'out' ? edge.to : edge.from) : undefined
		return direction && other ? [{ entity: other, label: edge.label, direction }] : []
	})
}

export function getCandidatesForScope(scope: GraphScope): MergeCandidate[] {
	const ids = new Set(getScopeEntities(scope).map((entity) => entity.id))
	return graphAdminState.candidates.filter((candidate) => ids.has(candidate.primaryId) || ids.has(candidate.duplicateId))
}

/** 已決定但尚未經完整重建套用的覆核決定。 */
export function getUnappliedDecisions(scope: GraphScope): MergeCandidate[] {
	return getCandidatesForScope(scope).filter((candidate) => candidate.decision !== 'pending' && !candidate.applied)
}

/** 沒有任何關係、也不在待覆核合併名單中的實體。 */
export function getOrphanEntities(scope: GraphScope): GraphEntity[] {
	const degrees = getDegreeMap()
	const pendingIds = new Set(graphAdminState.candidates.filter((candidate) => candidate.decision === 'pending').flatMap((candidate) => [candidate.primaryId, candidate.duplicateId]))
	return getScopeEntities(scope).filter((entity) => isLive(entity) && !degrees.get(entity.id) && !pendingIds.has(entity.id))
}

/**
 * 所有來源文件都已下架的實體；重建時會被移除。
 * @ 只有部分來源下架的實體仍有其他文件支撐，會保留，只少掉那份文件的關聯
 */
export function getRetiredOnlyEntities(scope: GraphScope): GraphEntity[] {
	const isRetired = (id: string) => workspaceDocuments.find((document) => document.id === id)?.status === '已下架'
	return getScopeEntities(scope).filter((entity) => isLive(entity) && entity.documentIds.length > 0 && entity.documentIds.every(isRetired))
}

export interface DocumentGraphSummary {
	entities: GraphEntity[]
	relationCount: number
	/** 有待覆核合併建議的實體數 */
	pendingReviewCount: number
}

/** 單一文件在圖譜中的樣貌，供文件詳細頁顯示摘要。 */
export function getDocumentGraphSummary(documentId: string): DocumentGraphSummary {
	const entities = graphAdminState.entities.filter((entity) => isLive(entity) && entity.documentIds.includes(documentId))
	const ids = new Set(entities.map((entity) => entity.id))
	const relationCount = getLiveEdges().filter((edge) => ids.has(edge.from) || ids.has(edge.to)).length
	const pendingIds = new Set(graphAdminState.candidates.filter((candidate) => candidate.decision === 'pending').flatMap((candidate) => [candidate.primaryId, candidate.duplicateId]))
	return { entities, relationCount, pendingReviewCount: entities.filter((entity) => pendingIds.has(entity.id)).length }
}

export function getScopeCommunities(scope: GraphScope): GraphCommunity[] {
	const clusters = new Set(getScopeClusters(scope))
	return graphAdminState.communities.filter((community) => clusters.has(community.cluster))
}

export function getRunningJob(): GraphBuildJob | undefined {
	return graphAdminState.jobs.find((job) => job.status === 'running')
}

/** 範圍涵蓋判斷：全公司的重建也涵蓋單一主題。 */
export function jobCoversScope(job: GraphBuildJob, scope: GraphScope): boolean {
	return job.scope === 'all' || scope === 'all' || job.scope === scope
}

export function getLastSucceededJob(scope: GraphScope): GraphBuildJob | undefined {
	return graphAdminState.jobs.find((job) => job.status === 'succeeded' && jobCoversScope(job, scope))
}

// > 實體編輯（立即生效，並標記為人工修正，重建時保留）

export interface EntityPatch {
	label: string
	type: GraphNodeType
	aliases: string[]
}

/** 回傳錯誤訊息；空字串代表成功。 */
export function updateEntity(id: string, patch: EntityPatch): string {
	const entity = getEntity(id)
	if (!entity) return '找不到這個實體，可能已被合併。'
	const label = patch.label.trim()
	if (!label) return '請輸入實體名稱。'
	if (label.length > 40) return '實體名稱最多 40 個字。'
	const clash = graphAdminState.entities.find((other) => other.id !== id && isLive(other) && other.cluster === entity.cluster && other.label === label)
	if (clash) return `同一主題已有「${label}」，請改用合併處理。`
	const aliases = [...new Set(patch.aliases.map((alias) => alias.trim()).filter((alias) => alias && alias !== label))]
	const { extracted } = entity
	// @ 改回與擷取結果完全相同時，不算人工修正
	const manuallyEdited = label !== extracted.label || patch.type !== extracted.type || aliases.join('\n') !== extracted.aliases.join('\n')
	Object.assign(entity, { label, type: patch.type, aliases, manuallyEdited, updatedAt: now() })
	return ''
}

export function setEntityHidden(id: string, hidden: boolean): void {
	const entity = getEntity(id)
	if (!entity || entity.status === 'merged') return
	entity.status = hidden ? 'hidden' : 'active'
	entity.updatedAt = now()
}

/** 還原為系統擷取的名稱、類型與別名；之後重建會以擷取結果為準。回傳錯誤訊息，空字串代表成功。 */
export function revertEntityEdits(id: string): string {
	const entity = getEntity(id)
	if (!entity || !entity.manuallyEdited) return ''
	const { label, type, aliases } = entity.extracted
	const clash = graphAdminState.entities.find((other) => other.id !== id && isLive(other) && other.cluster === entity.cluster && other.label === label)
	if (clash) return `同一主題已有「${label}」，無法還原成這個名稱。`
	Object.assign(entity, { label, type, aliases: [...aliases], manuallyEdited: false, updatedAt: now() })
	return ''
}

// > 合併覆核（決定先記錄，完整重建時才套用）

export function decideCandidate(id: string, decision: MergeDecision, by: string): void {
	const candidate = graphAdminState.candidates.find((item) => item.id === id)
	if (!candidate || candidate.applied) return
	candidate.decision = decision
	candidate.decidedBy = decision === 'pending' ? undefined : by
	candidate.decidedAt = decision === 'pending' ? undefined : now()
}

/** 對調主要名稱；只能在尚未套用前調整。 */
export function swapCandidatePrimary(id: string): void {
	const candidate = graphAdminState.candidates.find((item) => item.id === id)
	if (!candidate || candidate.applied) return
	;[candidate.primaryId, candidate.duplicateId] = [candidate.duplicateId, candidate.primaryId]
}

function applyMergeDecisions(scope: GraphScope): number {
	let merged = 0
	for (const candidate of getUnappliedDecisions(scope)) {
		candidate.applied = true
		if (candidate.decision !== 'merge') continue
		const primary = getEntity(candidate.primaryId)
		const duplicate = getEntity(candidate.duplicateId)
		if (!primary || !duplicate) continue
		primary.aliases = [...new Set([...primary.aliases, duplicate.label, ...duplicate.aliases])]
		// 合併屬於系統結果而非人工修正，別名同步寫入擷取值，還原時才不會弄丟
		primary.extracted.aliases = [...new Set([...primary.extracted.aliases, duplicate.label, ...duplicate.extracted.aliases])]
		primary.documentIds = [...new Set([...primary.documentIds, ...duplicate.documentIds])]
		primary.updatedAt = now()
		duplicate.status = 'merged'
		duplicate.mergedInto = primary.id
		duplicate.updatedAt = now()
		merged += 1
	}
	return merged
}

// > 主題社群

export function requestResummarize(id: string): void {
	const community = graphAdminState.communities.find((item) => item.id === id)
	if (!community || community.summaryStatus === 'processing') return
	community.summaryStatus = 'processing'
	community.summaryError = undefined
}

const GENERATED_SUMMARIES: Record<string, { summary: string; keyPoints: string[] }> = {
	採購與請款: { summary: '請購、驗收入庫到請款的三段流程，比價金額門檻與簽核層級由採購管理辦法定義。', keyPoints: ['超過門檻需比價', '驗收後才能請款', '請款由財務部承辦'] },
}

export function completeResummarize(id: string): void {
	const community = graphAdminState.communities.find((item) => item.id === id)
	if (!community || community.summaryStatus !== 'processing') return
	const generated = GENERATED_SUMMARIES[community.cluster]
	if (generated) Object.assign(community, generated)
	community.summaryStatus = 'ready'
	community.updatedAt = now()
}

// > 重建工作

export function estimateRebuild(scope: GraphScope, mode: BuildMode): { documentCount: number; decisions: number; minutes: string } {
	const documentIds = new Set(getScopeEntities(scope).flatMap((entity) => entity.documentIds))
	const documentCount = mode === 'full' ? documentIds.size : Math.max(1, Math.ceil(documentIds.size / 3))
	return {
		documentCount,
		decisions: mode === 'full' ? getUnappliedDecisions(scope).length : 0,
		minutes: mode === 'full' ? (scope === 'all' ? '約 40 分鐘' : '約 10 分鐘') : '約 1–2 分鐘',
	}
}

/** 同時間只允許一個重建工作；回傳錯誤訊息或新工作。 */
export function startRebuild(scope: GraphScope, mode: BuildMode, by: string): GraphBuildJob | string {
	if (getRunningJob()) return '已有重建工作在執行，請等待完成或先取消。'
	const job: GraphBuildJob = { id: `gb-${Date.now()}`, scope, mode, status: 'running', progress: 0, stage: BUILD_STAGES[mode][0]!.label, startedAt: now(), triggeredBy: by, documentCount: estimateRebuild(scope, mode).documentCount }
	graphAdminState.jobs.unshift(job)
	return graphAdminState.jobs[0]!
}

/** 推進執行中的工作；完成時套用覆核決定並更新社群摘要。 */
export function advanceRebuild(jobId: string, step: number): void {
	const job = graphAdminState.jobs.find((item) => item.id === jobId)
	if (!job || job.status !== 'running') return
	job.progress = Math.min(100, job.progress + step)
	job.stage = BUILD_STAGES[job.mode].find((stage) => job.progress <= stage.until)?.label ?? '完成'
	if (job.progress < 100) return

	const merged = job.mode === 'full' ? applyMergeDecisions(job.scope) : 0
	// @ 兩種重建都會重讀來源，只來自下架文件的實體一律移除；仍在覆核名單中的先保留，避免覆核項目指不到實體
	const candidateIds = new Set(graphAdminState.candidates.flatMap((candidate) => [candidate.primaryId, candidate.duplicateId]))
	const retiredIds = new Set(getRetiredOnlyEntities(job.scope).map((entity) => entity.id).filter((id) => !candidateIds.has(id)))
	if (retiredIds.size) graphAdminState.entities = graphAdminState.entities.filter((entity) => !retiredIds.has(entity.id))
	if (job.mode === 'full') {
		for (const community of getScopeCommunities(job.scope)) {
			if (community.summaryStatus === 'processing') continue
			const generated = GENERATED_SUMMARIES[community.cluster]
			if (generated && !community.summary) Object.assign(community, generated)
			community.summaryStatus = 'ready'
			community.summaryError = undefined
			community.updatedAt = now()
		}
	}
	const scopeEntities = getScopeEntities(job.scope).filter(isLive)
	const ids = new Set(scopeEntities.map((entity) => entity.id))
	Object.assign(job, {
		status: 'succeeded',
		stage: '完成',
		finishedAt: now(),
		result: { nodes: scopeEntities.length, edges: getLiveEdges().filter((edge) => ids.has(edge.from) || ids.has(edge.to)).length, merged },
	})
}

export function cancelRebuild(jobId: string): void {
	const job = graphAdminState.jobs.find((item) => item.id === jobId)
	if (!job || job.status !== 'running') return
	Object.assign(job, { status: 'canceled', finishedAt: now(), stage: `於「${job.stage}」取消` })
}
