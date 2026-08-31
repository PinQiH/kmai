import type {
	AlertEvent,
	AlertRule,
	EmailChannelSettings,
	LogEntry,
	RecipientGroup,
	ServiceHealth,
	ServiceMetric,
} from '@/types'

/*
 * - 以固定公式產生取樣序列。
 * @ 刻意不用 Math.random：每次重新整理都必須是同一張圖，
 *   使用者回報「某個時段的尖峰怪怪的」時才重現得出來。
 */
function buildSeries({ base, amplitude, points, seed }: { base: number; amplitude: number; points: number; seed: number }): number[] {
	return Array.from({ length: points }, (_, index) => {
		const wave = Math.sin((index + seed) / 2.6) * amplitude
		const drift = Math.cos((index + seed) / 5.1) * amplitude * 0.45
		const value = base + wave + drift
		return Math.round(Math.max(value, 0) * 100) / 100
	})
}

const SAMPLE_POINTS = 24

// TODO(api-integration): 串接 Prometheus 查詢 API 後移除此 Mock 資料。
export const serviceMetrics: ServiceMetric[] = [
	{
		id: 'metric-request-rate',
		label: '問答請求量',
		value: 342,
		unit: '次 / 小時',
		deltaPercent: 12.4,
		higherIsWorse: false,
		status: 'good',
		detail: '尖峰出現在今天 10:00，與上週同時段相近',
		series: buildSeries({ base: 300, amplitude: 70, points: SAMPLE_POINTS, seed: 1 }),
	},
	{
		id: 'metric-answer-latency',
		label: '回答延遲 p95',
		value: 3.8,
		unit: '秒',
		deltaPercent: 18.6,
		higherIsWorse: true,
		status: 'warning',
		detail: '門檻 4 秒 · 過去 6 小時有 3 次逼近門檻',
		series: buildSeries({ base: 3.1, amplitude: 0.8, points: SAMPLE_POINTS, seed: 4 }),
	},
	{
		id: 'metric-error-rate',
		label: '請求錯誤率',
		value: 1.4,
		unit: '%',
		deltaPercent: -22.1,
		higherIsWorse: true,
		status: 'good',
		detail: '門檻 3% · 主要來自 LLM 服務逾時重試',
		series: buildSeries({ base: 1.6, amplitude: 0.7, points: SAMPLE_POINTS, seed: 9 }),
	},
	{
		id: 'metric-queue-backlog',
		label: '文件處理積壓',
		value: 18,
		unit: '件',
		deltaPercent: 46.8,
		higherIsWorse: true,
		status: 'critical',
		detail: '門檻 15 件 · 已持續 12 分鐘並觸發告警',
		series: buildSeries({ base: 11, amplitude: 6, points: SAMPLE_POINTS, seed: 13 }),
	},
]

export const serviceHealth: ServiceHealth[] = [
	{ id: 'svc-api', name: 'API 服務', component: 'kmai-api · 3 個執行個體', status: 'good', latencyMs: 128, successRate: 99.7, checkedAt: '15 秒前', note: '全部執行個體正常回應健康檢查' },
	{ id: 'svc-vector', name: '向量資料庫', component: 'Qdrant · 主要叢集', status: 'good', latencyMs: 42, successRate: 99.9, checkedAt: '15 秒前', note: '索引大小 4.2 GB' },
	{ id: 'svc-database', name: '關聯式資料庫', component: 'PostgreSQL · 主從架構', status: 'good', latencyMs: 9, successRate: 100, checkedAt: '15 秒前', note: '連線池使用率 38%' },
	{ id: 'svc-llm', name: 'LLM 推論服務', component: 'OpenAI 相容端點', status: 'warning', latencyMs: 2860, successRate: 97.4, checkedAt: '20 秒前', note: '過去 1 小時有 26 次逾時重試' },
	{ id: 'svc-worker', name: '文件處理 Worker', component: '2 個工作節點', status: 'critical', latencyMs: 0, successRate: 88.2, checkedAt: '35 秒前', note: '1 個節點無回應，佇列持續積壓' },
	{ id: 'svc-smtp', name: '郵件寄送服務', component: 'SMTP 轉送', status: 'good', latencyMs: 310, successRate: 99.2, checkedAt: '1 分鐘前', note: '今日已寄出 14 封告警信' },
]

// TODO(api-integration): 串接 Loki 查詢 API 後移除此 Mock 資料。
export const logEntries: LogEntry[] = [
	{ id: 'log-01', occurredAt: '2026-08-31T02:42:18.000Z', timestamp: '10:42:18', level: 'error', service: 'document-worker', message: '文件處理失敗：解析器逾時（資訊安全教育訓練.pdf）', traceId: 'trc-9f13a2', fields: { documentId: 'doc-118', stage: 'parse', retries: '2' } },
	{ id: 'log-02', occurredAt: '2026-08-31T02:42:02.000Z', timestamp: '10:42:02', level: 'warn', service: 'llm-gateway', message: '推論請求逾時，改用備援模型重試', traceId: 'trc-9f1391', fields: { model: 'gpt-4.1-mini', timeoutMs: '8000', fallback: 'ollama-local' } },
	{ id: 'log-03', occurredAt: '2026-08-31T02:41:55.000Z', timestamp: '10:41:55', level: 'info', service: 'kmai-api', message: '問答完成：差旅住宿費用上限（2 筆引用）', traceId: 'trc-9f1386', fields: { userId: 'user-204', elapsedMs: '2410', citations: '2' } },
	{ id: 'log-04', occurredAt: '2026-08-31T02:41:31.000Z', timestamp: '10:41:31', level: 'warn', service: 'document-worker', message: '處理佇列長度 18 件，超過建議上限 15 件', traceId: 'trc-9f1372', fields: { queue: 'ingest', depth: '18' } },
	{ id: 'log-05', occurredAt: '2026-08-31T02:40:47.000Z', timestamp: '10:40:47', level: 'info', service: 'kmai-api', message: '登入成功：employee@company.com', traceId: 'trc-9f1360', fields: { ip: '10.20.1.18', method: 'password' } },
	{ id: 'log-06', occurredAt: '2026-08-31T02:39:12.000Z', timestamp: '10:39:12', level: 'error', service: 'llm-gateway', message: '模型服務回應 503，已將請求排入重試佇列', traceId: 'trc-9f1341', fields: { statusCode: '503', endpoint: '/v1/chat/completions' } },
	{ id: 'log-07', occurredAt: '2026-08-31T02:38:58.000Z', timestamp: '10:38:58', level: 'debug', service: 'vector-store', message: '相似度查詢完成，取回 20 筆候選片段', traceId: 'trc-9f1338', fields: { topK: '20', elapsedMs: '41' } },
	{ id: 'log-08', occurredAt: '2026-08-31T02:38:20.000Z', timestamp: '10:38:20', level: 'info', service: 'notification', message: '告警信已寄給 系統維運群組（3 位收件人）', traceId: 'trc-9f1329', fields: { rule: '文件處理積壓過高', recipients: '3' } },
	{ id: 'log-09', occurredAt: '2026-08-31T02:37:44.000Z', timestamp: '10:37:44', level: 'warn', service: 'kmai-api', message: '同一使用者 1 分鐘內送出 12 次提問，已套用速率限制', traceId: 'trc-9f1310', fields: { userId: 'user-77', limit: '10/min' } },
	{ id: 'log-10', occurredAt: '2026-08-31T02:36:02.000Z', timestamp: '10:36:02', level: 'info', service: 'document-worker', message: '文件向量化完成：採購請款標準作業流程.docx', traceId: 'trc-9f12f8', fields: { documentId: 'doc-004', chunks: '75' } },
	{ id: 'log-11', occurredAt: '2026-08-31T02:35:19.000Z', timestamp: '10:35:19', level: 'debug', service: 'kmai-api', message: '混合檢索權重：語意 0.6 / 關鍵字 0.4', traceId: 'trc-9f12e1', fields: { semantic: '0.6', keyword: '0.4' } },
	{ id: 'log-12', occurredAt: '2026-08-31T02:34:07.000Z', timestamp: '10:34:07', level: 'error', service: 'notification', message: 'SMTP 連線被拒，告警信改為稍後重送', traceId: 'trc-9f12c4', fields: { host: 'smtp.company.com', retryInMinutes: '5' } },
]

export const recipientGroups: RecipientGroup[] = [
	{ id: 'group-ops', name: '系統維運', description: '負責服務可用性與基礎設施', emails: ['ops@company.com', 'sre-oncall@company.com', 'kevin.lin@company.com'], severities: ['critical', 'warning'] },
	{ id: 'group-km', name: '知識管理員', description: '負責內容處理與回答品質', emails: ['km.admin@company.com', 'yijun.lin@company.com'], severities: ['warning', 'info'] },
	{ id: 'group-manager', name: '值班主管', description: '只在嚴重告警時通知', emails: ['it.manager@company.com'], severities: ['critical'] },
]

export const alertRules: AlertRule[] = [
	{ id: 'rule-latency', name: '回答延遲過高', metricId: 'metric-answer-latency', metricLabel: '回答延遲 p95', comparison: '>', threshold: 4, unit: '秒', durationMinutes: 5, severity: 'warning', recipientGroupId: 'group-ops', isEnabled: true },
	{ id: 'rule-error', name: '請求錯誤率異常', metricId: 'metric-error-rate', metricLabel: '請求錯誤率', comparison: '>', threshold: 3, unit: '%', durationMinutes: 10, severity: 'critical', recipientGroupId: 'group-ops', isEnabled: true },
	{ id: 'rule-backlog', name: '文件處理積壓過高', metricId: 'metric-queue-backlog', metricLabel: '文件處理積壓', comparison: '>=', threshold: 15, unit: '件', durationMinutes: 10, severity: 'critical', recipientGroupId: 'group-manager', isEnabled: true },
	{ id: 'rule-llm', name: 'LLM 服務成功率下降', metricId: 'metric-error-rate', metricLabel: 'LLM 呼叫成功率', comparison: '<', threshold: 98, unit: '%', durationMinutes: 15, severity: 'warning', recipientGroupId: 'group-ops', isEnabled: true },
	{ id: 'rule-traffic', name: '問答請求量異常下降', metricId: 'metric-request-rate', metricLabel: '問答請求量', comparison: '<', threshold: 50, unit: '次 / 小時', durationMinutes: 30, severity: 'info', recipientGroupId: 'group-km', isEnabled: false },
]

export const alertEvents: AlertEvent[] = [
	{ id: 'evt-01', occurredAt: '2026-08-31T02:30:00.000Z', ruleName: '文件處理積壓過高', severity: 'critical', status: 'firing', observed: '18 件（門檻 15 件）', startedAt: '今天 10:30', durationLabel: '持續 12 分鐘', notifiedCount: 1, notifyResult: '已寄出' },
	{ id: 'evt-02', occurredAt: '2026-08-31T02:36:00.000Z', ruleName: '回答延遲過高', severity: 'warning', status: 'firing', observed: '4.3 秒（門檻 4 秒）', startedAt: '今天 10:36', durationLabel: '持續 6 分鐘', notifiedCount: 3, notifyResult: '已寄出' },
	{ id: 'evt-03', occurredAt: '2026-08-31T01:58:00.000Z', ruleName: 'LLM 服務成功率下降', severity: 'warning', status: 'silenced', observed: '97.4%（門檻 98%）', startedAt: '今天 09:58', durationLabel: '靜音至 12:00', notifiedCount: 0, notifyResult: '未通知' },
	{ id: 'evt-04', occurredAt: '2026-08-31T00:12:00.000Z', ruleName: '請求錯誤率異常', severity: 'critical', status: 'resolved', observed: '3.6%（門檻 3%）', startedAt: '今天 08:12', durationLabel: '22 分鐘後恢復', notifiedCount: 4, notifyResult: '已寄出' },
	{ id: 'evt-05', occurredAt: '2026-08-30T14:41:00.000Z', ruleName: '文件處理積壓過高', severity: 'critical', status: 'resolved', observed: '16 件（門檻 15 件）', startedAt: '昨天 22:41', durationLabel: '35 分鐘後恢復', notifiedCount: 1, notifyResult: '寄送失敗' },
	{ id: 'evt-06', occurredAt: '2026-08-30T07:07:00.000Z', ruleName: '回答延遲過高', severity: 'warning', status: 'resolved', observed: '4.1 秒（門檻 4 秒）', startedAt: '昨天 15:07', durationLabel: '9 分鐘後恢復', notifiedCount: 3, notifyResult: '已寄出' },
]

export const emailChannelSettings: EmailChannelSettings = {
	smtpHost: 'smtp.company.com',
	smtpPort: 587,
	encryption: 'TLS',
	senderName: 'Syscom Cubi 營運監控',
	senderAddress: 'no-reply@company.com',
	repeatIntervalMinutes: 30,
	groupWindowMinutes: 5,
	notifyOnResolved: true,
	isQuietHoursEnabled: false,
	quietHoursStart: '22:00',
	quietHoursEnd: '07:00',
}
