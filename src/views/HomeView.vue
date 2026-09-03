<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import AnimatedNumber from '@/components/AnimatedNumber.vue'
import DocumentCard from '@/components/DocumentCard.vue'
import KnowledgeConstellation from '@/components/KnowledgeConstellation.vue'
import SearchInput from '@/components/SearchInput.vue'
import { getKnowledgeSourceIdByGraphLabel } from '@/mocks/graph'
import { getEmployeeDocumentsSnapshot } from '@/repositories/knowledge.repository'
import { COMPANY_KNOWLEDGE_SOURCES } from '@/utils/knowledgeSources'

const suggestedQuestions = ['國內出差住宿費用上限是多少？', '新進同仁第一週要完成哪些事情？', '如何申請客戶資料存取權限？']
const knowledgeBaseIcons: Record<string, string> = {
	policy: 'mdi-domain',
	benefits: 'mdi-account-heart-outline',
	'information-security': 'mdi-shield-lock-outline',
	operations: 'mdi-transit-connection-variant',
}

const router = useRouter()
const query = ref('')
const employeeDocuments = getEmployeeDocumentsSnapshot()
const recentDocuments = employeeDocuments.slice(0, 3)
const knowledgeBases = COMPANY_KNOWLEDGE_SOURCES
	.filter((source) => source.id !== 'company')
	.map((source) => ({
		...source,
		icon: knowledgeBaseIcons[source.id] ?? 'mdi-bookshelf',
		count: employeeDocuments.filter((document) => document.knowledgeSourceId === source.id).length,
	}))

// - 首頁的提問入口一律進 AI 問答；純關鍵字檢索由側邊欄的搜尋頁負責
async function handleSearch(value = query.value): Promise<void> {
	if (!value.trim()) return
	await router.push({ path: '/ask', query: { q: value.trim() } })
}

// - 點擊背景星圖的節點，帶著該主題進入所屬知識庫的圖譜分頁
async function handleTopicSelect(label: string): Promise<void> {
	const sourceId = getKnowledgeSourceIdByGraphLabel(label)
	if (!sourceId) return
	await router.push({ path: '/library', query: { source: sourceId, view: 'graph', focus: label } })
}
</script>

<template>
	<div class="page-shell">
		<section class="home-hero py-8 py-md-16">
			<div class="hero-field" aria-hidden="true" />
			<KnowledgeConstellation @select="handleTopicSelect" />
			<p class="eyebrow text-primary mb-3 rise-in" :style="{ '--rise-index': 0 }">早安，王小明</p>
			<h1 class="home-title text-balance rise-in" :style="{ '--rise-index': 1 }">今天想找什麼？</h1>
			<p class="text-medium-emphasis mt-3 mb-7 rise-in" :style="{ '--rise-index': 2 }">搜尋公司知識，或直接用一句話描述你的問題。</p>
			<div class="rise-in" :style="{ '--rise-index': 3 }">
				<SearchInput
					v-model="query"
					label="輸入問題或關鍵字"
					placeholder="例如：出差回來多久內要完成核銷？"
					submit-label="提問"
					autofocus
					@search="handleSearch"
				/>
			</div>
			<div class="suggestions mt-4 rise-in" :style="{ '--rise-index': 4 }" aria-label="建議問題">
				<span class="text-caption text-medium-emphasis">可以試著問：</span>
				<VBtn v-for="question in suggestedQuestions" :key="question" variant="text" size="small" @click="handleSearch(question)">
					{{ question }}
				</VBtn>
			</div>
		</section>

		<section class="mb-12" aria-labelledby="knowledge-base-title">
			<div class="d-flex align-center mb-4">
				<h2 id="knowledge-base-title" class="section-heading">依知識庫瀏覽</h2>
				<VSpacer />
				<VBtn to="/library" variant="text" append-icon="mdi-arrow-right" data-testid="all-knowledge-documents">瀏覽全部文件</VBtn>
			</div>
			<VRow>
				<VCol v-for="(knowledgeBase, index) in knowledgeBases" :key="knowledgeBase.id" cols="12" sm="6" lg="3">
					<VCard class="knowledge-base-row surface-border pa-4 rise-in" :style="{ '--rise-index': index }" :to="{ path: '/library', query: { source: knowledgeBase.id } }" :data-testid="`home-knowledge-base-${knowledgeBase.id}`">
						<VIcon :icon="knowledgeBase.icon" color="primary" aria-hidden="true" />
						<div>
							<p class="font-weight-bold">{{ knowledgeBase.name }}</p>
							<p class="text-caption text-medium-emphasis"><AnimatedNumber :value="knowledgeBase.count" /> 份文件</p>
						</div>
					</VCard>
				</VCol>
			</VRow>
		</section>

		<section aria-labelledby="recent-title">
			<div class="d-flex align-center mb-4">
				<h2 id="recent-title" class="section-heading">最近更新</h2>
			</div>
			<VRow>
				<VCol v-for="(document, index) in recentDocuments" :key="document.id" cols="12" md="4">
					<DocumentCard :document="document" class="rise-in" :style="{ '--rise-index': index }" />
				</VCol>
			</VRow>
		</section>
	</div>
</template>

<style scoped>
.home-hero {
	position: relative;
	isolation: isolate;
	/* @ 給星圖足夠的垂直空間展開，否則叢集會全擠在遮罩鏤空區裡看不見 */
	min-height: 460px;
	max-width: 900px;
	margin-inline: auto;
	text-align: center;
	--rise-step: 70ms;
	--rise-distance: 16px;
	--rise-duration: 480ms;
}

/* @ 內容需自建層級，才能疊在背景網格與星圖之上；兩個背景層自己有定位不可被覆寫 */
.home-hero > *:not(.hero-field):not(.constellation) {
	position: relative;
	z-index: 1;
}

/* @ 極低對比的工程網格，用品牌靛藍而非通用紫藍漸層；四周以 mask 淡出 */
.hero-field {
	position: absolute;
	inset: -40px -20vw 0;
	z-index: 0;
	pointer-events: none;
	background-image:
		linear-gradient(rgba(var(--v-theme-primary), 0.055) 1px, transparent 1px),
		linear-gradient(90deg, rgba(var(--v-theme-primary), 0.055) 1px, transparent 1px);
	background-size: 56px 56px;
	-webkit-mask-image: radial-gradient(ellipse 60% 70% at 50% 42%, #000 0%, transparent 78%);
	mask-image: radial-gradient(ellipse 60% 70% at 50% 42%, #000 0%, transparent 78%);
}

.home-title {
	font-size: clamp(2.4rem, 6vw, 4.8rem);
	line-height: 1.04;
	letter-spacing: -0.055em;
}

.suggestions {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-wrap: wrap;
	gap: 4px;
}

.knowledge-base-row {
	display: flex;
	align-items: center;
	gap: 14px;
}
</style>
