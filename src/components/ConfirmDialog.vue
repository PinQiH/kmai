<script setup lang="ts">
/*
 * > 確認對話框
 * @ 統一刪除等不可逆操作的確認樣式：標題、說明、「返回」與確認按鈕。
 *   說明較複雜時用預設 slot；需要額外按鈕（例如「前往設定頁」）時用 extra-actions slot，
 *   並可用 hideConfirm 隱藏確認按鈕。
 */
interface ComponentProps {
	title: string
	description?: string
	confirmLabel?: string
	cancelLabel?: string
	tone?: 'error' | 'primary' | 'warning'
	confirmDisabled?: boolean
	hideConfirm?: boolean
	maxWidth?: number | string
}

withDefaults(defineProps<ComponentProps>(), {
	description: undefined,
	confirmLabel: '確認刪除',
	cancelLabel: '返回',
	tone: 'error',
	confirmDisabled: false,
	hideConfirm: false,
	maxWidth: 460,
})

const isOpen = defineModel<boolean>({ required: true })
const emit = defineEmits<{ confirm: [] }>()
</script>

<template>
	<VDialog v-model="isOpen" :max-width="maxWidth">
		<VCard>
			<VCardTitle class="pa-6 pb-2 text-wrap">{{ title }}</VCardTitle>
			<VCardText class="pa-6 pt-2">
				<slot>{{ description }}</slot>
			</VCardText>
			<VCardActions class="pa-5">
				<VSpacer />
				<VBtn data-testid="confirm-dialog-cancel" @click="isOpen = false">{{ cancelLabel }}</VBtn>
				<slot name="extra-actions" />
				<VBtn v-if="!hideConfirm" :color="tone" variant="flat" :disabled="confirmDisabled" data-testid="confirm-dialog-confirm" @click="emit('confirm')">{{ confirmLabel }}</VBtn>
			</VCardActions>
		</VCard>
	</VDialog>
</template>
