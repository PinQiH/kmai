<script setup lang="ts">
import { computed } from 'vue'

interface Props {
	name: string
	department: string
	email: string
	roleLabel?: string
}

interface AccountMenuItem {
	title: string
	icon: string
	tab: 'profile' | 'appearance' | 'security' | 'support' | 'about'
}

const props = withDefaults(defineProps<Props>(), {
	roleLabel: '一般使用者',
})

const emit = defineEmits<{
	logout: []
}>()

const initials = computed(() => props.name.trim().slice(0, 1) || '使')

const accountItems: AccountMenuItem[] = [
	{
		title: '個人資料',
		icon: 'mdi-account-outline',
		tab: 'profile',
	},
	{
		title: '外觀設定',
		icon: 'mdi-palette-outline',
		tab: 'appearance',
	},
	{
		title: '密碼與安全',
		icon: 'mdi-lock-outline',
		tab: 'security',
	},
]

const supportItems: AccountMenuItem[] = [
	{
		title: '問題回報',
		icon: 'mdi-lifebuoy',
		tab: 'support',
	},
	{
		title: '版本與隱私',
		icon: 'mdi-update',
		tab: 'about',
	},
]
</script>

<template>
	<VMenu location="bottom end" :offset="8">
		<template #activator="{ props: menuProps }">
			<VBtn
				v-bind="menuProps"
				variant="text"
				class="user-menu-trigger"
				data-testid="user-menu-trigger"
				:aria-label="`${name}的使用者選單`"
			>
				<VAvatar size="36" class="user-avatar" aria-hidden="true">{{ initials }}</VAvatar>
				<span class="user-menu-name">{{ name }}</span>
				<VIcon icon="mdi-chevron-down" size="18" class="user-menu-chevron" aria-hidden="true" />
			</VBtn>
		</template>

		<VCard class="user-account-menu surface-border">
			<div class="user-summary">
				<VAvatar size="36" class="user-avatar" aria-hidden="true">{{ initials }}</VAvatar>
				<div class="user-summary-copy">
					<p class="user-summary-name">{{ name }}</p>
					<p class="user-summary-meta">{{ department }} · {{ roleLabel }}</p>
					<span class="user-summary-email-sr">{{ email }}</span>
				</div>
			</div>

			<VDivider />
			<VList class="user-menu-list" aria-label="使用者帳號與支援">
				<VListItem
					v-for="item in accountItems"
					:key="item.tab"
					:active="false"
					:prepend-icon="item.icon"
					:title="item.title"
					:to="{ path: '/account', query: { tab: item.tab } }"
					:data-testid="`user-menu-${item.tab}`"
				/>

				<VListItem
					v-for="item in supportItems"
					:key="item.tab"
					:active="false"
					:prepend-icon="item.icon"
					:title="item.title"
					:to="{ path: '/account', query: { tab: item.tab } }"
					:data-testid="`user-menu-${item.tab}`"
				/>

				<VDivider class="my-1" />
				<VListItem
					prepend-icon="mdi-logout"
					title="登出"
					class="logout-item"
					data-testid="user-menu-logout"
					@click="emit('logout')"
				/>
			</VList>
		</VCard>
	</VMenu>
</template>

<style scoped>
.user-menu-trigger {
	min-width: 44px;
	min-height: 44px;
	padding-inline: var(--space-xs) var(--space-sm);
	border-radius: var(--radius-md);
	text-transform: none;
}

.user-menu-trigger :deep(.v-btn__content) {
	gap: var(--space-sm);
}

.user-avatar {
	flex: 0 0 auto;
	border: 1px solid rgb(var(--v-theme-primary) / 32%);
	background: var(--tint-active);
	color: rgb(var(--v-theme-primary));
	font-size: 0.9rem;
	font-weight: 700;
}

.user-menu-name {
	max-width: 112px;
	overflow: hidden;
	color: var(--ink-strong);
	font-size: 0.875rem;
	font-weight: 650;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.user-menu-chevron {
	color: var(--ink-muted);
}

.user-account-menu {
	width: min(288px, calc(100vw - 24px));
	max-height: min(440px, calc(100vh - 80px));
	overflow-y: auto;
	border-radius: var(--radius-md);
	box-shadow: 0 12px 28px rgb(0 0 0 / 18%);
}

.user-summary {
	display: flex;
	align-items: center;
	gap: var(--space-sm);
	padding: var(--space-md);
}

.user-summary-copy {
	min-width: 0;
}

.user-summary-email-sr {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}

.user-summary-name {
	color: var(--ink-strong);
	font-weight: 700;
}

.user-summary-meta {
	overflow: hidden;
	color: var(--ink-muted);
	font-size: 0.76rem;
	line-height: 1.45;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.user-menu-list {
	padding-block: var(--space-xs);
}

.user-menu-list :deep(.v-list-item) {
	min-height: 40px;
	margin-inline: var(--space-xs);
	border-radius: var(--radius-sm);
}

.user-menu-list :deep(.v-list-item-title) {
	font-size: 0.875rem;
	font-weight: 600;
}

.logout-item {
	color: rgb(var(--v-theme-error));
}

@media (max-width: 960px) {
	.user-menu-trigger {
		width: 44px;
		padding: 0;
	}

	.user-menu-name,
	.user-menu-chevron {
		display: none;
	}
}
</style>
