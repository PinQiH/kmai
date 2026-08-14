<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import DocumentCard from '@/components/DocumentCard.vue'
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

async function handleSearch(value = query.value): Promise<void> {
	if (!value.trim()) return
	await router.push({ path: '/search', query: { q: value.trim() } })
}
</script>

<template>
	<div class="page-shell">
		<section class="home-hero py-8 py-md-16">
			<p class="eyebrow text-primary mb-3">早安，王小明</p>
			<h1 class="home-title text-balance">今天想找什麼？</h1>
			<p class="text-medium-emphasis mt-3 mb-7">搜尋公司知識，或直接用一句話描述你的問題。</p>
			<SearchInput v-model="query" autofocus @search="handleSearch" />
			<div class="suggestions mt-4" aria-label="建議問題">
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
				<VCol v-for="topic in topics" :key="topic.title" cols="12" sm="6" lg="3">
					<VCard class="topic-row surface-border pa-4" to="/library">
						<VIcon :icon="topic.icon" color="primary" aria-hidden="true" />
						<div>
							<p class="font-weight-bold">{{ topic.title }}</p>
							<p class="text-caption text-medium-emphasis">{{ topic.count }} 份文件</p>
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
				<VCol v-for="document in recentDocuments" :key="document.id" cols="12" md="4">
					<DocumentCard :document="document" />
				</VCol>
			</VRow>
		</section>
	</div>
</template>

<style scoped>
.home-hero {
	max-width: 900px;
	margin-inline: auto;
	text-align: center;
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
