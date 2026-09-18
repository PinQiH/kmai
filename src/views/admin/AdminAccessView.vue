<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'

import FilterSearchField from '@/components/FilterSearchField.vue'
import AccessGroupsPanel from '@/components/AccessGroupsPanel.vue'
import AccessRolesPanel from '@/components/AccessRolesPanel.vue'
import PageHeader from '@/components/PageHeader.vue'
import {
	CAPABILITIES,
	CURRENT_USER_ID,
	MIN_PASSWORD_LENGTH,
	SOURCE_LABELS,
	SYSTEM_ADMIN_ROLE_ID,
	USER_STATUS_COLORS,
	USER_STATUS_HINTS,
	USER_STATUS_LABELS,
	accessState,
	canActorGrantSystemAdmin,
	createUser,
	formatAccessTime,
	getEffectiveCapabilityCodes,
	getEffectiveRoles,
	getGroup,
	getGroupChain,
	getGroupPath,
	getGroupTree,
	getUser,
	resetUserPassword,
	setUsersStatus,
	updateUser,
	type AccessUser,
	type FieldErrors,
	type IssuedCredential,
	type UserStatus,
} from '@/mocks/access'
import { useToastStore } from '@/stores/toast'

type AccessTab = 'users' | 'roles' | 'groups'
const tabs: AccessTab[] = ['users', 'roles', 'groups']
const statuses = Object.keys(USER_STATUS_LABELS) as UserStatus[]

const route = useRoute()
const router = useRouter()
const activeTab = ref<AccessTab>(tabs.find((tab) => tab === route.query.tab) ?? 'users')
watch(() => route.query.tab, (tab) => { activeTab.value = tabs.find((item) => item === tab) ?? 'users' })
watch(activeTab, (tab) => {
	const next = tab === 'users' ? undefined : tab
	if (next !== route.query.tab) router.replace({ query: { ...route.query, tab: next } })
})

const rolesPanel = ref<InstanceType<typeof AccessRolesPanel> | null>(null)
const groupsPanel = ref<InstanceType<typeof AccessGroupsPanel> | null>(null)
const leaveTarget = ref<string | null>(null)
let allowLeave = false
onBeforeRouteLeave((to) => {
	if (allowLeave || !(rolesPanel.value?.isDirty || groupsPanel.value?.isDirty)) return true
	leaveTarget.value = to.fullPath
	return false
})
function confirmLeave(): void {
	const target = leaveTarget.value
	leaveTarget.value = null
	if (!target) return
	allowLeave = true
	router.push(target)
}

const toastStore = useToastStore()
function notify(text: string, tone: 'success' | 'error' | 'warning' = 'success'): void {
	toastStore.show(text, tone)
}

// > 使用者清單

const keyword = ref('')
const statusFilter = ref<UserStatus | null>(null)
const roleFilter = ref<string | null>(null)
const groupFilter = ref<string | null>(null)
const selectedUserIds = ref<string[]>([])

const roleOptions = computed(() => accessState.roles.map((role) => ({ value: role.id, title: role.name })))
const groupOptions = computed(() => getGroupTree().map(({ group }) => ({ value: group.id, title: getGroupPath(group.id) })))
const statusCounts = computed(() => Object.fromEntries(statuses.map((status) => [status, accessState.users.filter((user) => user.status === status).length])) as Record<UserStatus, number>)
const neverLoggedIn = computed(() => accessState.users.filter((user) => user.status === 'active' && !user.lastLoginAt).length)

const filteredUsers = computed(() => {
	const text = keyword.value?.trim().toLowerCase() ?? ''
	return accessState.users.filter((user) => {
		if (text && !`${user.displayName} ${user.account} ${user.email}`.toLowerCase().includes(text)) return false
		if (statusFilter.value && user.status !== statusFilter.value) return false
		// @ 角色篩選看有效角色，群組繼承來的也算，否則「誰能審核文件」會漏人
		if (roleFilter.value && !getEffectiveRoles(user).some((entry) => entry.role.id === roleFilter.value)) return false
		if (groupFilter.value && !user.groupIds.some((id) => getGroupChain(id).some((group) => group.id === groupFilter.value))) return false
		return true
	})
})
const hasFilters = computed(() => Boolean(keyword.value || statusFilter.value || roleFilter.value || groupFilter.value))
function clearFilters(): void {
	keyword.value = ''
	statusFilter.value = null
	roleFilter.value = null
	groupFilter.value = null
}

const headers = [
	{ title: '使用者', key: 'displayName' },
	{ title: '群組', key: 'groups', sortable: false },
	{ title: '角色', key: 'roles', sortable: false },
	{ title: '狀態', key: 'status', width: 100 },
	{ title: '最後登入', key: 'lastLoginAt', width: 150 },
	{ title: '', key: 'actions', sortable: false, width: 72, align: 'end' as const },
]

function applyBulkStatus(status: UserStatus): void {
	const result = setUsersStatus(selectedUserIds.value, status)
	const label = USER_STATUS_LABELS[status]
	if (result.skipped.length) {
		const detail = result.skipped.map((item) => `${getUser(item.userId)?.displayName}：${item.reason}`).join('；')
		notify(`已將 ${result.changed.length} 位改為${label}，${result.skipped.length} 位未變更（${detail}）。`, 'warning')
	} else {
		notify(result.changed.length ? `已將 ${result.changed.length} 位使用者改為${label}。` : `選取的使用者已是${label}。`)
	}
	selectedUserIds.value = []
}

// > 新增／編輯使用者

const editorOpen = ref(false)
const editingId = ref<string | null>(null)
const editor = reactive({ account: '', email: '', displayName: '', status: 'active' as UserStatus, roleIds: [] as string[], groupIds: [] as string[], passwordMode: 'generate' as 'generate' | 'manual', temporaryPassword: '' })
const editorErrors = ref<FieldErrors>({})
const showPassword = ref(false)
const credential = ref<IssuedCredential | null>(null)
const copied = ref(false)
const confirmReset = ref(false)

const editingUser = computed(() => (editingId.value ? getUser(editingId.value) : undefined))
const isSsoUser = computed(() => editingUser.value?.source === 'sso')
const isSelf = computed(() => editingId.value === CURRENT_USER_ID)
const canGrantAdmin = computed(() => canActorGrantSystemAdmin())
const editorRoleItems = computed(() => accessState.roles.map((role) => ({ value: role.id, title: role.name, subtitle: role.description, props: { disabled: role.id === SYSTEM_ADMIN_ROLE_ID && !canGrantAdmin.value } })))
// @ SSO 群組成員由同步決定，編輯時鎖住非本帳號已在的 SSO 群組
const editorGroupItems = computed(() => getGroupTree().map(({ group }) => ({ value: group.id, title: getGroupPath(group.id), props: { disabled: group.source === 'sso' } })))
const previewRoles = computed(() => getEffectiveRoles(editor))
const previewCapabilities = computed(() => {
	const codes = getEffectiveCapabilityCodes(editor)
	return CAPABILITIES.filter((capability) => codes.includes(capability.code))
})

function openEditor(user: AccessUser | null): void {
	editingId.value = user?.id ?? null
	Object.assign(editor, user
		? { account: user.account, email: user.email, displayName: user.displayName, status: user.status, roleIds: [...user.roleIds], groupIds: [...user.groupIds], passwordMode: 'generate', temporaryPassword: '' }
		: { account: '', email: '', displayName: '', status: 'active', roleIds: ['role-km-user'], groupIds: [], passwordMode: 'generate', temporaryPassword: '' })
	editorErrors.value = {}
	showPassword.value = false
	editorOpen.value = true
}

function openUserById(userId: string): void {
	const user = getUser(userId)
	if (!user) return
	activeTab.value = 'users'
	openEditor(user)
}

function clearEditorError(key: string): void {
	if (editorErrors.value[key]) editorErrors.value = Object.fromEntries(Object.entries(editorErrors.value).filter(([field]) => field !== key))
}

function submitEditor(): void {
	if (editingUser.value) {
		const result = updateUser(editingUser.value.id, editor)
		if (!result.ok) { editorErrors.value = result.errors; return }
		editorOpen.value = false
		notify(`已更新「${editingUser.value.displayName}」。`)
		return
	}
	const result = createUser({ ...editor, temporaryPassword: editor.passwordMode === 'manual' ? editor.temporaryPassword : '' })
	if (!result.ok) { editorErrors.value = result.errors; return }
	editorOpen.value = false
	showCredential(result.value)
	notify(`已建立帳號 ${result.value.account}，首次登入須變更密碼。`)
}

function handleResetPassword(): void {
	confirmReset.value = false
	if (!editingUser.value) return
	const result = resetUserPassword(editingUser.value.id)
	if (!result.ok) { notify(result.errors.form, 'error'); return }
	editorOpen.value = false
	showCredential(result.value)
	notify(`已重設「${result.value.displayName}」的密碼，下次登入須變更。`)
}

function showCredential(value: IssuedCredential): void {
	copied.value = false
	credential.value = value
}

async function copyCredential(): Promise<void> {
	if (!credential.value) return
	try {
		await navigator.clipboard.writeText(`帳號：${credential.value.account}\n臨時密碼：${credential.value.temporaryPassword}`)
		copied.value = true
	} catch {
		notify('無法存取剪貼簿，請手動選取複製。', 'error')
	}
}

function closeCredential(): void {
	// !! 關閉後清掉記憶體中的臨時密碼，之後無法再次查看
	credential.value = null
}


function directRoleNames(user: AccessUser): string[] {
	return getEffectiveRoles(user).map((entry) => (entry.sources.includes('直接指派') ? entry.role.name : `${entry.role.name}*`))
}
</script>

<template>
	<div class="page-shell">
		<PageHeader eyebrow="身分與權限" title="使用者與存取" description="管理誰能登入、能做什麼。權限來自角色，角色可以直接指派給使用者，或指派給群組讓成員與子群組一起繼承。" />


		<VTabs v-model="activeTab" color="primary" show-arrows class="mb-5">
			<VTab value="users">使用者 <span class="tab-count">{{ accessState.users.length }}</span></VTab>
			<VTab value="roles">角色與權限 <span class="tab-count">{{ accessState.roles.length }}</span></VTab>
			<VTab value="groups">群組 <span class="tab-count">{{ accessState.groups.length }}</span></VTab>
		</VTabs>

		<VWindow v-model="activeTab">
			<VWindowItem value="users">
				<dl class="health-row" aria-label="帳號概況">
					<div v-for="status in statuses" :key="status"><dt>{{ USER_STATUS_LABELS[status] }}</dt><dd><button type="button" class="metric-button" :aria-pressed="statusFilter === status" @click="statusFilter = statusFilter === status ? null : status">{{ statusCounts[status] }}</button></dd></div>
					<div><dt>啟用但從未登入</dt><dd>{{ neverLoggedIn }}</dd></div>
				</dl>

				<div class="filters">
					<VBtn color="primary" prepend-icon="mdi-account-plus-outline" height="40" data-testid="access-create" @click="openEditor(null)">新增使用者</VBtn>
					<FilterSearchField v-model="keyword" label="搜尋名稱、帳號或 Email" density="compact" />
					<VSelect v-model="statusFilter" label="狀態" :items="statuses.map((value) => ({ value, title: USER_STATUS_LABELS[value] }))" density="compact" hide-details clearable />
					<VSelect v-model="roleFilter" label="角色（含繼承）" :items="roleOptions" density="compact" hide-details clearable />
					<VAutocomplete v-model="groupFilter" label="群組（含子群組）" :items="groupOptions" density="compact" hide-details clearable />
				</div>

				<div v-if="selectedUserIds.length" class="bulk-bar" role="region" aria-label="批次操作">
					<span>已選 {{ selectedUserIds.length }} 位</span>
					<VBtn size="small" variant="text" @click="applyBulkStatus('active')">啟用</VBtn>
					<VBtn size="small" variant="text" @click="applyBulkStatus('suspended')">暫停</VBtn>
					<VBtn size="small" variant="text" color="error" @click="applyBulkStatus('disabled')">停用</VBtn>
					<VSpacer />
					<VBtn size="small" variant="text" @click="selectedUserIds = []">取消選取</VBtn>
				</div>

				<VCard class="surface-border">
					<VDataTable v-model="selectedUserIds" :headers="headers" :items="filteredUsers" item-value="id" show-select :items-per-page="20" hover class="user-table" @click:row="(_: unknown, row: { item: AccessUser }) => openEditor(row.item)">
						<template #item.displayName="{ item }">
							<div class="identity">
								<strong>{{ item.displayName }}<span v-if="item.id === CURRENT_USER_ID" class="note">（你）</span></strong>
								<span class="note">{{ item.account }} · {{ item.email }}</span>
							</div>
						</template>
						<template #item.groups="{ item }">
							<span class="note">{{ item.groupIds.map((id) => getGroup(id)?.name).filter(Boolean).join('、') || '未加入群組' }}</span>
						</template>
						<template #item.roles="{ item }">
							<div class="chips"><VChip v-for="name in directRoleNames(item)" :key="name" size="x-small" variant="tonal" label>{{ name }}</VChip></div>
						</template>
						<template #item.status="{ item }">
							<VChip size="small" :color="USER_STATUS_COLORS[item.status]" variant="tonal" label>{{ USER_STATUS_LABELS[item.status] }}</VChip>
						</template>
						<template #item.lastLoginAt="{ item }">
							<span class="note num">{{ formatAccessTime(item.lastLoginAt) }}</span>
							<VChip v-if="item.mustChangePassword" size="x-small" color="warning" variant="tonal" label class="d-block mt-1" style="width: fit-content">待變更密碼</VChip>
						</template>
						<template #item.actions="{ item }">
							<VBtn icon="mdi-pencil-outline" size="small" variant="text" :aria-label="`編輯 ${item.displayName}`" @click.stop="openEditor(item)" />
						</template>
						<template #no-data>
							<div class="py-8 text-center">
								<p class="mb-2">沒有符合的使用者</p>
								<VBtn v-if="hasFilters" size="small" variant="text" color="primary" @click="clearFilters">清除篩選</VBtn>
							</div>
						</template>
					</VDataTable>
				</VCard>
				<p class="note mt-3">角色名稱後的 * 代表由群組繼承。SSO 帳號在使用者首次登入時自動建立；這裡新增的是本機帳號，適合外部顧問等沒有公司帳號的人。</p>
			</VWindowItem>

			<VWindowItem value="roles">
				<AccessRolesPanel ref="rolesPanel" @notify="notify" />
			</VWindowItem>

			<VWindowItem value="groups">
				<AccessGroupsPanel ref="groupsPanel" @notify="notify" @open-user="openUserById" />
			</VWindowItem>
		</VWindow>

		<VDialog v-model="editorOpen" max-width="760" scrollable>
			<VCard>
				<VCardTitle class="pa-6 pb-1">{{ editingUser ? `編輯 ${editingUser.displayName}` : '新增本機帳號' }}</VCardTitle>
				<VCardSubtitle v-if="editingUser" class="px-6">{{ SOURCE_LABELS[editingUser.source] }} · 建立於 {{ formatAccessTime(editingUser.createdAt) }} · 最後登入 {{ formatAccessTime(editingUser.lastLoginAt) }}</VCardSubtitle>
				<VCardText class="pa-6">
					<VAlert v-if="isSsoUser" type="info" variant="tonal" density="compact" icon="mdi-sync" class="mb-4">SSO 帳號的名稱、Email、密碼與部門群組由公司身分系統同步，這裡可調整狀態、角色與本機群組。</VAlert>
					<VAlert v-if="editorErrors.form" type="error" variant="tonal" density="compact" class="mb-4">{{ editorErrors.form }}</VAlert>
					<div class="editor-grid">
						<VTextField v-model="editor.account" label="帳號" :disabled="Boolean(editingUser)" :hint="editingUser ? '建立後不可修改' : '登入用，3–32 碼小寫英數字'" persistent-hint :error-messages="editorErrors.account" autocomplete="off" @update:model-value="clearEditorError('account')" />
						<VTextField v-model="editor.displayName" label="顯示名稱" :readonly="isSsoUser" :error-messages="editorErrors.displayName" @update:model-value="clearEditorError('displayName')" />
						<VTextField v-model="editor.email" label="Email" type="email" :readonly="isSsoUser" :error-messages="editorErrors.email" autocomplete="off" class="span-2" @update:model-value="clearEditorError('email')" />
						<VAutocomplete v-model="editor.roleIds" label="直接指派角色" :items="editorRoleItems" multiple chips closable-chips :error-messages="editorErrors.roleIds" :hint="canGrantAdmin ? '' : '「系統管理員」只能由系統管理員指派'" persistent-hint class="span-2" @update:model-value="clearEditorError('roleIds')" />
						<VAutocomplete v-model="editor.groupIds" label="群組" :items="editorGroupItems" multiple chips :closable-chips="false" :error-messages="editorErrors.groupIds" hint="部門群組由 SSO 同步，只能加入本機建立的專案或團隊群組" persistent-hint class="span-2" @update:model-value="clearEditorError('groupIds')" />
					</div>

					<template v-if="editingUser">
						<h3 class="sub-heading">帳號狀態</h3>
						<VRadioGroup v-model="editor.status" :error-messages="editorErrors.status" hide-details="auto" @update:model-value="clearEditorError('status')">
							<VRadio v-for="status in statuses" :key="status" :value="status" :disabled="isSelf && status !== 'active'">
								<template #label><span><strong>{{ USER_STATUS_LABELS[status] }}</strong> <span class="note">{{ USER_STATUS_HINTS[status] }}</span></span></template>
							</VRadio>
						</VRadioGroup>
						<template v-if="!isSsoUser && !isSelf">
							<h3 class="sub-heading">密碼</h3>
							<div class="d-flex align-center ga-3 flex-wrap">
								<VBtn variant="outlined" prepend-icon="mdi-lock-reset" @click="confirmReset = true">重設為臨時密碼</VBtn>
								<span class="note">{{ editingUser.mustChangePassword ? '目前仍在使用臨時密碼，尚未變更。' : '產生新的臨時密碼，使用者下次登入須變更。' }}</span>
							</div>
						</template>
					</template>
					<template v-else>
						<h3 class="sub-heading">臨時密碼</h3>
						<VRadioGroup v-model="editor.passwordMode" inline hide-details>
							<VRadio value="generate" label="自動產生（建議）" />
							<VRadio value="manual" label="自行設定" />
						</VRadioGroup>
						<VTextField v-if="editor.passwordMode === 'manual'" v-model="editor.temporaryPassword" label="臨時密碼" :type="showPassword ? 'text' : 'password'" :append-inner-icon="showPassword ? 'mdi-eye-off-outline' : 'mdi-eye-outline'" :error-messages="editorErrors.temporaryPassword" :hint="`至少 ${MIN_PASSWORD_LENGTH} 碼`" persistent-hint autocomplete="new-password" class="mt-2" @click:append-inner="showPassword = !showPassword" @update:model-value="clearEditorError('temporaryPassword')" />
						<p class="note mt-2">建立後會顯示一次登入資訊，使用者首次登入必須變更密碼。</p>
					</template>

					<h3 class="sub-heading">儲存後的有效權限</h3>
					<p v-if="!previewRoles.length" class="note">沒有任何角色，這個帳號登入後什麼都不能做。</p>
					<ul v-else class="effective-list">
						<li v-for="entry in previewRoles" :key="entry.role.id"><strong>{{ entry.role.name }}</strong><span class="note">{{ entry.sources.join('、') }}</span></li>
					</ul>
					<div v-if="previewCapabilities.length" class="chips mt-2">
						<VChip v-for="capability in previewCapabilities" :key="capability.code" size="x-small" variant="outlined" label>{{ capability.name }}</VChip>
					</div>
				</VCardText>
				<VCardActions class="pa-5">
					<VSpacer />
					<VBtn @click="editorOpen = false">取消</VBtn>
					<VBtn color="primary" variant="flat" data-testid="user-save" @click="submitEditor">{{ editingUser ? '儲存變更' : '建立帳號' }}</VBtn>
				</VCardActions>
			</VCard>
		</VDialog>

		<VDialog :model-value="Boolean(leaveTarget)" max-width="440" @update:model-value="leaveTarget = null">
			<VCard title="離開此頁？" text="有尚未儲存的角色或群組設定，離開後會遺失。">
				<VCardActions><VSpacer /><VBtn @click="leaveTarget = null">繼續編輯</VBtn><VBtn color="error" @click="confirmLeave">捨棄並離開</VBtn></VCardActions>
			</VCard>
		</VDialog>

		<VDialog v-model="confirmReset" max-width="440">
			<VCard title="重設密碼" :text="`確定為「${editingUser?.displayName ?? ''}」產生新的臨時密碼？原本的密碼會立即失效。`">
				<VCardActions><VSpacer /><VBtn @click="confirmReset = false">取消</VBtn><VBtn color="primary" @click="handleResetPassword">重設</VBtn></VCardActions>
			</VCard>
		</VDialog>

		<!-- !! 臨時密碼只在此視窗顯示一次，不放進會自動消失的提示，也不寫進狀態 -->
		<VDialog :model-value="Boolean(credential)" max-width="480" persistent>
			<VCard v-if="credential">
				<VCardTitle class="pa-6 pb-2">登入資訊</VCardTitle>
				<VCardText class="px-6">
					<VAlert type="warning" variant="tonal" density="compact" class="mb-4">關閉後無法再次查看，請透過安全管道交給 {{ credential.displayName }}。</VAlert>
					<dl class="credential" data-testid="credential">
						<div><dt>帳號</dt><dd><code>{{ credential.account }}</code></dd></div>
						<div><dt>臨時密碼</dt><dd><code>{{ credential.temporaryPassword }}</code></dd></div>
					</dl>
				</VCardText>
				<VCardActions class="pa-5">
					<VBtn variant="outlined" :prepend-icon="copied ? 'mdi-check' : 'mdi-content-copy'" @click="copyCredential">{{ copied ? '已複製' : '複製' }}</VBtn>
					<VSpacer />
					<VBtn color="primary" variant="flat" @click="closeCredential">我已記下，關閉</VBtn>
				</VCardActions>
			</VCard>
		</VDialog>
	</div>
</template>

<style scoped>
.tab-count { margin-inline-start: 6px; font-size: 0.75rem; opacity: 0.7; }
.note { font-size: 0.8125rem; color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)); }
.health-row { display: flex; flex-wrap: wrap; gap: 32px; margin-bottom: 20px; }
.health-row dt { font-size: 0.8125rem; color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)); }
.health-row dd { font-size: 1.5rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.metric-button { color: inherit; border-bottom: 2px solid transparent; }
.metric-button[aria-pressed='true'] { border-bottom-color: rgb(var(--v-theme-primary)); }
.filters { display: grid; grid-template-columns: auto minmax(220px, 1.4fr) repeat(3, minmax(150px, 1fr)); gap: 12px; margin-bottom: 12px; }
.bulk-bar { display: flex; align-items: center; gap: 4px; padding: 6px 12px; margin-bottom: 8px; border-radius: 8px; background: rgba(var(--v-theme-primary), 0.08); }
.user-table :deep(tbody tr) { cursor: pointer; }
.identity { display: flex; flex-direction: column; padding: 8px 0; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.num { font-variant-numeric: tabular-nums; }
.editor-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 16px; row-gap: 8px; }
.span-2 { grid-column: span 2; }
.sub-heading { font-size: 0.9375rem; font-weight: 600; margin: 20px 0 8px; }
.effective-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
.effective-list li { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.credential { display: grid; gap: 10px; }
.credential div { display: grid; grid-template-columns: 80px 1fr; align-items: center; }
.credential dt { color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)); }
.credential code { font-size: 1rem; user-select: all; }
@media (max-width: 860px) {
	.filters { grid-template-columns: 1fr 1fr; }
	.editor-grid { grid-template-columns: 1fr; }
	.span-2 { grid-column: auto; }
}
@media (max-width: 560px) { .filters { grid-template-columns: 1fr; } }
</style>
