<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import PageHeader from '@/components/PageHeader.vue'

const route = useRoute()
const activeTab = ref('profile')
const displayName = ref('王小明')
const email = ref('employee@company.com')
const issueCategory = ref('搜尋結果')
const issueTitle = ref('')
const issueDescription = ref('')
const isSaved = ref(false)
const isIssueSubmitted = ref(false)
const emailTouched = ref(false)
const currentPassword = ref('')
const newPassword = ref('')
const confirmedPassword = ref('')
const passwordTouched = ref(false)
const passwordMessage = ref('')
const isPrivacyOpen = ref(false)

const allowedTabs = new Set(['profile', 'security', 'support', 'about'])

async function saveProfile(): Promise<void> {
	emailTouched.value = true
	if (!email.value.includes('@')) return
	// TODO(api-integration): 改為串接個人資料 API。
	isSaved.value = true
	window.setTimeout(() => { isSaved.value = false }, 2500)
}

function updatePassword(): void {
	passwordTouched.value = true
	if (!currentPassword.value || newPassword.value.length < 8 || newPassword.value !== confirmedPassword.value) return
	currentPassword.value = ''
	newPassword.value = ''
	confirmedPassword.value = ''
	passwordTouched.value = false
	passwordMessage.value = '密碼已更新，下次登入請使用新密碼。'
}

function submitIssue(): void {
	if (!issueTitle.value.trim() || !issueDescription.value.trim()) return
	isIssueSubmitted.value = true
	issueTitle.value = ''
	issueDescription.value = ''
}

function syncTabFromRoute(): void {
	const requestedTab = String(route.query.tab ?? 'profile')
	activeTab.value = allowedTabs.has(requestedTab) ? requestedTab : 'profile'
}

watch(() => route.query.tab, syncTabFromRoute)
onMounted(syncTabFromRoute)
</script>

<template>
	<div class="page-shell account-page">
		<PageHeader title="個人設定" description="管理個人資料、密碼、問題回報與產品資訊。" />
		<VTabs v-model="activeTab" color="primary" class="mb-6" show-arrows>
			<VTab value="profile">個人資料</VTab><VTab value="security">密碼</VTab><VTab value="support">問題回報</VTab><VTab value="about">版本與隱私</VTab>
		</VTabs>
		<VWindow v-model="activeTab">
			<VWindowItem value="profile">
				<VCard class="surface-border pa-6" tag="form" @submit.prevent="saveProfile">
					<h2 class="section-heading mb-5">基本資料</h2>
					<VTextField v-model="displayName" label="顯示名稱" />
					<VTextField v-model="email" label="電子郵件" type="email" autocomplete="email" :error-messages="emailTouched && !email.includes('@') ? '請輸入有效的電子郵件地址，例如 name@company.com' : undefined" @blur="emailTouched = true" />
					<VAlert v-if="isSaved" type="success" variant="tonal" class="mb-4">個人資料已更新。</VAlert>
					<VBtn type="submit" color="primary">儲存變更</VBtn>
				</VCard>
			</VWindowItem>
			<VWindowItem value="security">
				<VCard class="surface-border pa-6" tag="form" @submit.prevent="updatePassword">
					<h2 class="section-heading mb-5">變更密碼</h2>
					<VTextField v-model="currentPassword" label="目前密碼" type="password" autocomplete="current-password" />
					<VTextField v-model="newPassword" label="新密碼" type="password" autocomplete="new-password" hint="至少 8 個字元" persistent-hint :error-messages="passwordTouched && newPassword.length < 8 ? '新密碼至少需要 8 個字元' : undefined" @blur="passwordTouched = true" />
					<VTextField v-model="confirmedPassword" label="再次輸入新密碼" type="password" autocomplete="new-password" :error-messages="passwordTouched && confirmedPassword !== newPassword ? '兩次輸入的密碼不一致，請重新確認' : undefined" @blur="passwordTouched = true" />
					<VAlert v-if="passwordMessage" type="success" variant="tonal" class="mb-4">{{ passwordMessage }}</VAlert>
					<VBtn type="submit" color="primary">更新密碼</VBtn>
				</VCard>
			</VWindowItem>
			<VWindowItem value="support">
				<VCard class="surface-border pa-6" tag="form" @submit.prevent="submitIssue">
					<h2 class="section-heading mb-2">回報使用問題</h2>
					<p class="text-body-2 text-medium-emphasis mb-5">請描述你原本想完成的事情，以及實際發生的情況。</p>
					<VSelect v-model="issueCategory" label="問題分類" :items="['搜尋結果', 'AI 回答', '文件內容', '帳號權限', '其他']" />
					<VTextField v-model="issueTitle" label="問題標題" />
					<VTextarea v-model="issueDescription" label="詳細說明" rows="5" />
					<VAlert v-if="isIssueSubmitted" type="success" variant="tonal" class="mb-4">問題已送出，管理者將透過電子郵件回覆處理進度。</VAlert>
					<VBtn type="submit" color="primary" :disabled="!issueTitle.trim() || !issueDescription.trim()">送出問題</VBtn>
				</VCard>
			</VWindowItem>
			<VWindowItem value="about">
				<VCard class="surface-border pa-6">
					<h2 class="section-heading">Kmai 0.1.0</h2>
					<p class="text-body-2 text-medium-emphasis mt-2">展示版本 · 2026-08-14</p>
					<VDivider class="my-5" />
					<h3 class="font-weight-bold">本次更新</h3>
					<ul class="pl-5 mt-3 text-body-2"><li>全新知識搜尋與 AI 問答</li><li>文件版本與引用追溯</li><li>管理端健康度與處理監控</li></ul>
					<VBtn class="mt-5" variant="tonal" @click="isPrivacyOpen = true">查看隱私權政策</VBtn>
				</VCard>
			</VWindowItem>
		</VWindow>
		<VDialog v-model="isPrivacyOpen" max-width="720"><VCard><VCardTitle class="pa-6 pb-2">隱私權暨個人資料保護政策</VCardTitle><VCardText class="pa-6 pt-2"><p class="mb-3">Kmai 僅在授權範圍內處理公司知識與使用紀錄，用於提供搜尋、問答、系統安全及服務改善。</p><p>使用者的提問、回饋與操作紀錄會依公司治理規範保存；如需查詢或更正個人資料，請聯絡系統管理員。</p></VCardText><VCardActions class="pa-5"><VSpacer /><VBtn color="primary" @click="isPrivacyOpen = false">我知道了</VBtn></VCardActions></VCard></VDialog>
	</div>
</template>

<style scoped>
.account-page {
	max-width: 860px;
}
</style>
