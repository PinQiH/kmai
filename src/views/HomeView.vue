<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import AnimatedNumber from '@/components/AnimatedNumber.vue'
import DocumentCard from '@/components/DocumentCard.vue'
import KnowledgeConstellation from '@/components/KnowledgeConstellation.vue'
import SearchInput from '@/components/SearchInput.vue'
import { getEmployeeDocumentsSnapshot } from '@/repositories/knowledge.repository'

const suggestedQuestions = ['國內出差住宿費用上限是多少？', '新進同仁第一週要完成哪些事情？', '如何申請客戶資料存取權限？']
const topics = [
	{ title: '公司制度', count: 128, icon: 'mdi-domain' },
	{ title: '人事與福利', count: 96, icon: 'mdi-account-heart-outline' },
	{ title: '作業流程', count: 214, icon: 'mdi-transit-connection-variant' },
	{ title: '產品與客戶', count: 175, icon: 'mdi-package-variant-closed' },
]

const router = useRouter()
const query = ref('')
const recentDocuments = getEmployeeDocumentsSnapshot().slice(0, 3)

// - 首頁的提問入口一律進 AI 問答；純關鍵字檢索由側邊欄的搜尋頁負責
async function handleSearch(value = query.value): Promise<void> {
	if (!value.trim()) return
	await router.push({ path: '/ask', query: { q: value.trim() } })
}

// - 點擊背景星圖的節點，帶著該主題進知識圖譜頁
async function handleTopicSelect(label: string): Promise<void> {
	await router.push({ path: '/graph', query: { focus: label } })
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

		<section class="mb-12" aria-labelledby="topic-title">
			<div class="d-flex align-center mb-4">
				<h2 id="topic-title" class="section-heading">依主題瀏覽</h2>
				<VSpacer />
				<VBtn to="/library" variant="text" append-icon="mdi-arrow-right">全部主題</VBtn>
			</div>
			<VRow>
				<VCol v-for="(topic, index) in topics" :key="topic.title" cols="12" sm="6" lg="3">
					<VCard class="topic-row surface-border pa-4 rise-in" :style="{ '--rise-index': index }" to="/library">
						<VIcon :icon="topic.icon" color="primary" aria-hidden="true" />
						<div>
							<p class="font-weight-bold">{{ topic.title }}</p>
							<p class="text-caption text-medium-emphasis"><AnimatedNumber :value="topic.count" /> 份文件</p>
						</div>
					</VCard>
				</VCol>
			</VRow>
		</section>

		<section aria-labelledby="recent-title">
			<div class="d-flex align-center mb-4">
				<h2 id="recent-title" class="section-heading">最近更新</h2>
				<VSpacer />
				<VBtn to="/library" variant="text" append-icon="mdi-arrow-right">查看知識庫</VBtn>
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

.topic-row {
	display: flex;
	align-items: center;
	gap: 14px;
}
</style>
