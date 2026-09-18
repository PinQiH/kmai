<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'

import StatePanel from '@/components/StatePanel.vue'

const route = useRoute()
const router = useRouter()
</script>

<template>
	<div class="page-shell">
		<StatePanel
			icon="mdi-map-marker-question-outline"
			title="找不到這個頁面"
			:description="`網址「${route.fullPath}」不存在，可能是連結已過期或輸入錯誤。可以從左側選單前往其他頁面。`"
			action-label="回到首頁"
			@action="router.push('/')"
		/>
	</div>
</template>
