<script setup lang="ts">
interface ComponentProps {
	status: string
}

defineProps<ComponentProps>()

const colorByStatus: Record<string, string> = {
	已發布: 'success',
	待審核: 'warning',
	處理中: 'info',
	失敗: 'error',
	已下架: 'secondary',
}
</script>

<template>
	<VChip :color="colorByStatus[status] ?? 'secondary'" size="small" variant="tonal">
		{{ status }}
	</VChip>
</template>
