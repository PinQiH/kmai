<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useAppStore } from '@/stores/app'

const router = useRouter()
const appStore = useAppStore()
const currentPassword = ref('')
const newPassword = ref('')
const confirmedPassword = ref('')
const isSubmitting = ref(false)
const isTouched = ref(false)

const isValid = computed(() => currentPassword.value.length >= 8 && newPassword.value.length >= 8 && newPassword.value === confirmedPassword.value)

async function handleSubmit(): Promise<void> {
	isTouched.value = true
	if (!isValid.value) return
	isSubmitting.value = true
	// TODO(api-integration): 改為串接首次登入密碼變更 API。
	await new Promise((resolve) => window.setTimeout(resolve, 600))
	appStore.mustChangePassword = false
	isSubmitting.value = false
	await router.push('/')
}
</script>

<template>
	<main class="password-page">
		<VCard class="surface-border pa-7" width="min(100%, 480px)" tag="form" @submit.prevent="handleSubmit">
			<p class="eyebrow text-primary mb-2">首次登入</p>
			<h1 class="text-h4 font-weight-bold">設定新的登入密碼</h1>
			<p class="text-body-2 text-medium-emphasis mt-3 mb-6">為保護帳號安全，完成密碼變更後才能繼續使用系統。</p>
			<VTextField v-model="currentPassword" label="目前密碼" type="password" autocomplete="current-password" />
			<VTextField v-model="newPassword" label="新密碼" type="password" autocomplete="new-password" hint="至少 8 個字元" persistent-hint :error-messages="isTouched && newPassword.length < 8 ? '新密碼至少需要 8 個字元' : undefined" @blur="isTouched = true" />
			<VTextField v-model="confirmedPassword" label="再次輸入新密碼" type="password" autocomplete="new-password" :error-messages="isTouched && confirmedPassword !== newPassword ? '兩次輸入的密碼不一致，請重新確認' : undefined" @blur="isTouched = true" />
			<VBtn type="submit" color="primary" block size="large" :loading="isSubmitting">儲存並繼續</VBtn>
		</VCard>
	</main>
</template>

<style scoped>
.password-page { display: grid; place-items: center; min-height: 100vh; padding: 24px; background: rgb(var(--v-theme-background)); }
</style>
