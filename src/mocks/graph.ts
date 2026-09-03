// > 知識圖譜資料
// @ 首頁的 3D 星圖背景與 /graph 圖譜頁共用這一份，不要在元件內另外寫死節點
// TODO(api-integration): 接後端後改由 API 提供，節點需帶真實的文件關聯

export type GraphNodeType = '制度' | '流程' | '部門' | '角色' | '專有名詞'

export interface KnowledgeGraphNode {
	id: string
	label: string
	type: GraphNodeType
	/** 所屬主題群，用於力導向的初始佈局與首頁星圖的叢集中心 */
	cluster: string
}

export interface KnowledgeGraphEdge {
	from: string
	to: string
	/** 關聯語意，顯示在詳情面板 */
	label: string
}

export const GRAPH_CLUSTERS = ['差旅與報支', '人事與到職', '資訊安全', '採購與請款', '績效考核'] as const

export const GRAPH_CLUSTERS_BY_KNOWLEDGE_SOURCE: Record<string, readonly string[]> = {
	policy: ['差旅與報支'],
	benefits: ['人事與到職', '績效考核'],
	'information-security': ['資訊安全'],
	operations: ['採購與請款'],
}

export const GRAPH_NODE_TYPES: GraphNodeType[] = ['制度', '流程', '部門', '角色', '專有名詞']

export const graphNodes: KnowledgeGraphNode[] = [
	// > 差旅與報支
	{ id: 'n-travel-policy', label: '差旅管理辦法', type: '制度', cluster: '差旅與報支' },
	{ id: 'n-expense-policy', label: '費用報支辦法', type: '制度', cluster: '差旅與報支' },
	{ id: 'n-travel-apply', label: '出差申請', type: '流程', cluster: '差旅與報支' },
	{ id: 'n-expense-claim', label: '費用核銷', type: '流程', cluster: '差旅與報支' },
	{ id: 'n-finance', label: '財務部', type: '部門', cluster: '差旅與報支' },
	{ id: 'n-lodging-cap', label: '住宿費上限', type: '專有名詞', cluster: '差旅與報支' },
	{ id: 'n-per-diem', label: '日支費', type: '專有名詞', cluster: '差旅與報支' },
	{ id: 'n-approver', label: '直屬主管', type: '角色', cluster: '差旅與報支' },

	// > 人事與到職
	{ id: 'n-leave-policy', label: '請假管理辦法', type: '制度', cluster: '人事與到職' },
	{ id: 'n-onboarding', label: '新人到職', type: '流程', cluster: '人事與到職' },
	{ id: 'n-offboarding', label: '離職交接', type: '流程', cluster: '人事與到職' },
	{ id: 'n-hr', label: '人資部', type: '部門', cluster: '人事與到職' },
	{ id: 'n-deputy', label: '代理人', type: '專有名詞', cluster: '人事與到職' },
	{ id: 'n-probation', label: '試用期', type: '專有名詞', cluster: '人事與到職' },

	// > 資訊安全
	{ id: 'n-security-policy', label: '資訊安全政策', type: '制度', cluster: '資訊安全' },
	{ id: 'n-access-request', label: '權限申請', type: '流程', cluster: '資訊安全' },
	{ id: 'n-it', label: '資訊部', type: '部門', cluster: '資訊安全' },
	{ id: 'n-sysadmin', label: '系統管理員', type: '角色', cluster: '資訊安全' },
	{ id: 'n-data-class', label: '資料分級', type: '專有名詞', cluster: '資訊安全' },
	{ id: 'n-customer-data', label: '客戶資料', type: '專有名詞', cluster: '資訊安全' },

	// > 採購與請款
	{ id: 'n-purchase-policy', label: '採購管理辦法', type: '制度', cluster: '採購與請款' },
	{ id: 'n-requisition', label: '請購作業', type: '流程', cluster: '採購與請款' },
	{ id: 'n-acceptance', label: '驗收入庫', type: '流程', cluster: '採購與請款' },
	{ id: 'n-payment', label: '請款作業', type: '流程', cluster: '採購與請款' },
	{ id: 'n-procurement', label: '採購部', type: '部門', cluster: '採購與請款' },
	{ id: 'n-approval-tier', label: '簽核層級', type: '專有名詞', cluster: '採購與請款' },
	{ id: 'n-quote-threshold', label: '比價金額門檻', type: '專有名詞', cluster: '採購與請款' },

	// > 績效考核
	{ id: 'n-review-policy', label: '績效考核辦法', type: '制度', cluster: '績效考核' },
	{ id: 'n-review-meeting', label: '績效面談', type: '流程', cluster: '績效考核' },
	{ id: 'n-appeal', label: '考核申覆', type: '流程', cluster: '績效考核' },
	{ id: 'n-review-cycle', label: '考核週期', type: '專有名詞', cluster: '績效考核' },
	{ id: 'n-km-owner', label: '知識管理員', type: '角色', cluster: '績效考核' },
]

export const graphEdges: KnowledgeGraphEdge[] = [
	// > 差旅與報支
	{ from: 'n-travel-policy', to: 'n-travel-apply', label: '規範' },
	{ from: 'n-travel-policy', to: 'n-lodging-cap', label: '定義' },
	{ from: 'n-travel-policy', to: 'n-per-diem', label: '定義' },
	{ from: 'n-travel-apply', to: 'n-approver', label: '需簽核' },
	{ from: 'n-travel-apply', to: 'n-expense-claim', label: '後續流程' },
	{ from: 'n-expense-policy', to: 'n-expense-claim', label: '規範' },
	{ from: 'n-expense-claim', to: 'n-finance', label: '承辦' },
	{ from: 'n-expense-claim', to: 'n-approval-tier', label: '依循' },
	{ from: 'n-finance', to: 'n-expense-policy', label: '主管單位' },

	// > 人事與到職
	{ from: 'n-onboarding', to: 'n-hr', label: '承辦' },
	{ from: 'n-onboarding', to: 'n-access-request', label: '包含' },
	{ from: 'n-onboarding', to: 'n-probation', label: '起算' },
	{ from: 'n-offboarding', to: 'n-hr', label: '承辦' },
	{ from: 'n-offboarding', to: 'n-deputy', label: '指定' },
	{ from: 'n-leave-policy', to: 'n-deputy', label: '要求' },
	{ from: 'n-leave-policy', to: 'n-hr', label: '主管單位' },
	{ from: 'n-leave-policy', to: 'n-approver', label: '需簽核' },
	{ from: 'n-probation', to: 'n-review-policy', label: '適用' },

	// > 資訊安全
	{ from: 'n-security-policy', to: 'n-data-class', label: '定義' },
	{ from: 'n-security-policy', to: 'n-access-request', label: '規範' },
	{ from: 'n-access-request', to: 'n-sysadmin', label: '需簽核' },
	{ from: 'n-access-request', to: 'n-approver', label: '需簽核' },
	{ from: 'n-sysadmin', to: 'n-it', label: '隸屬' },
	{ from: 'n-data-class', to: 'n-customer-data', label: '涵蓋' },
	{ from: 'n-it', to: 'n-security-policy', label: '主管單位' },
	{ from: 'n-offboarding', to: 'n-access-request', label: '需回收' },

	// > 採購與請款
	{ from: 'n-purchase-policy', to: 'n-requisition', label: '規範' },
	{ from: 'n-purchase-policy', to: 'n-quote-threshold', label: '定義' },
	{ from: 'n-purchase-policy', to: 'n-approval-tier', label: '定義' },
	{ from: 'n-requisition', to: 'n-procurement', label: '承辦' },
	{ from: 'n-requisition', to: 'n-acceptance', label: '後續流程' },
	{ from: 'n-acceptance', to: 'n-payment', label: '後續流程' },
	{ from: 'n-payment', to: 'n-finance', label: '承辦' },
	{ from: 'n-payment', to: 'n-expense-policy', label: '依循' },
	{ from: 'n-procurement', to: 'n-purchase-policy', label: '主管單位' },

	// > 績效考核
	{ from: 'n-review-policy', to: 'n-review-meeting', label: '規範' },
	{ from: 'n-review-policy', to: 'n-review-cycle', label: '定義' },
	{ from: 'n-review-meeting', to: 'n-approver', label: '主持' },
	{ from: 'n-review-meeting', to: 'n-appeal', label: '後續流程' },
	{ from: 'n-appeal', to: 'n-hr', label: '承辦' },
	{ from: 'n-review-policy', to: 'n-hr', label: '主管單位' },
	{ from: 'n-km-owner', to: 'n-review-cycle', label: '維護' },
]

export interface KnowledgeGraphSnapshot {
	clusters: readonly string[]
	nodes: KnowledgeGraphNode[]
	edges: KnowledgeGraphEdge[]
}

/** 取得單一公司知識庫的圖譜快照，並排除跨知識庫連線。 */
export function getKnowledgeGraphBySourceId(sourceId: string): KnowledgeGraphSnapshot {
	const clusters = GRAPH_CLUSTERS_BY_KNOWLEDGE_SOURCE[sourceId] ?? []
	const clusterSet = new Set(clusters)
	const nodes = graphNodes.filter((node) => clusterSet.has(node.cluster))
	const nodeIds = new Set(nodes.map((node) => node.id))
	const edges = graphEdges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))

	return { clusters, nodes, edges }
}

/** 依首頁星圖的主題或節點名稱，找出所屬公司知識庫。 */
export function getKnowledgeSourceIdByGraphLabel(label: string): string | undefined {
	const node = graphNodes.find((item) => item.label === label)
	const cluster = node?.cluster ?? label

	return Object.entries(GRAPH_CLUSTERS_BY_KNOWLEDGE_SOURCE)
		.find(([, clusters]) => clusters.includes(cluster))?.[0]
}

// - 取得指定節點的相鄰節點與關聯語意
export function getNeighbors(
	nodeId: string,
	nodes: KnowledgeGraphNode[] = graphNodes,
	edges: KnowledgeGraphEdge[] = graphEdges,
): { node: KnowledgeGraphNode, label: string }[] {
	const byId = new Map(nodes.map((node) => [node.id, node]))
	const result: { node: KnowledgeGraphNode, label: string }[] = []

	for (const edge of edges) {
		const otherId = edge.from === nodeId ? edge.to : edge.to === nodeId ? edge.from : ''
		if (!otherId) continue
		const node = byId.get(otherId)
		if (node) result.push({ node, label: edge.label })
	}

	return result
}
