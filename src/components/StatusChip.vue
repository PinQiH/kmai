<script setup lang="ts">
import { computed } from 'vue'

/*
 * > 狀態標籤
 * @ 預設依文件狀態（已發布、待審核…）自動配色；其他狀態由呼叫端傳入 color 與 label，
 *   各功能的顏色對照表放在對應的 mocks／utils 常數，不要在頁面內重寫。
 */
interface ComponentProps {
	status: string
	// @ 省略時依文件狀態對照表配色
	color?: string
	// @ 省略時直接顯示 status
	label?: string
	size?: 'x-small' | 'small' | 'default'
}

const props = withDefaults(defineProps<ComponentProps>(), {
	color: undefined,
	label: undefined,
	size: 'small',
})

const colorByDocumentStatus: Record<string, string> = {
	已發布: 'success',
	待審核: 'warning',
	處理中: 'info',
	失敗: 'error',
	已下架: 'secondary',
}

const chipColor = computed(() => props.color ?? colorByDocumentStatus[props.status] ?? 'secondary')
</script>

<template>
	<VChip :color="chipColor" :size="size" variant="tonal">
		{{ label ?? status }}
	</VChip>
</template>
