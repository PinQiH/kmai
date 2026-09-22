<script setup lang="ts">
import { computed, ref } from 'vue'

import FilterSearchField from '@/components/FilterSearchField.vue'
import { useMasterDetailDraft } from '@/composables/useMasterDetailDraft'

import {
	GROUP_TYPE_LABELS,
	SOURCE_LABELS,
	SYSTEM_ADMIN_ROLE_ID,
	USER_STATUS_COLORS,
	USER_STATUS_LABELS,
	accessState,
	canActorGrantSystemAdmin,
	createGroup,
	deleteGroup,
	getDescendantGroupIds,
	getGroup,
	getGroupAffectedUserCount,
	getGroupDeleteBlocker,
	getGroupMembers,
	getGroupPath,
	getGroupTree,
	removeGroupMember,
	updateGroup,
	type GroupDraft,
	type GroupType,
} from '@/repositories/access.repository'

const emit = defineEmits<{ notify: [text: string, tone?: 'success' | 'error']; openUser: [userId: string] }>()

const typeItems = (Object.keys(GROUP_TYPE_LABELS) as GroupType[]).map((value) => ({ value, title: GROUP_TYPE_LABELS[value] }))

const search = ref('')
const confirmDelete = ref(false)

const { selectedId, pendingId, form, errors, isDirty, isCreating, resetForm, requestSelect, discardAndSwitch, clearError } = useMasterDetailDraft<GroupDraft>({
	initialId: accessState.groups[0]?.id ?? null,
	draftFromSelection: draftFromGroup,
})

const tree = computed(() => {
	const keyword = search.value?.trim() ?? ''
	return getGroupTree().filter(({ group }) => !keyword || getGroupPath(group.id).includes(keyword))
})
const selectedGroup = computed(() => (selectedId.value ? getGroup(selectedId.value) : undefined))
const isSynced = computed(() => selectedGroup.value?.source === 'sso')
const members = computed(() => (selectedGroup.value ? getGroupMembers(selectedGroup.value.id) : []))
const children = computed(() => accessState.groups.filter((group) => selectedId.value && group.parentId === selectedId.value))
const affectedCount = computed(() => (selectedGroup.value ? getGroupAffectedUserCount(selectedGroup.value.id) : 0))
const deleteBlocker = computed(() => (selectedGroup.value ? getGroupDeleteBlocker(selectedGroup.value.id) : null))
const canGrantAdmin = computed(() => canActorGrantSystemAdmin())

// @ 上層候選排除自己與所有子孫，避免形成循環
const parentItems = computed(() => {
	const excluded = selectedId.value ? new Set([selectedId.value, ...getDescendantGroupIds(selectedId.value)]) : new Set<string>()
	return [{ value: null, title: '無（最上層）' }, ...getGroupTree().filter(({ group }) => !excluded.has(group.id)).map(({ group }) => ({ value: group.id, title: getGroupPath(group.id) }))]
})
const roleItems = computed(() => accessState.roles.map((role) => ({ value: role.id, title: role.name, props: { disabled: role.id === SYSTEM_ADMIN_ROLE_ID && !canGrantAdmin.value } })))

function draftFromGroup(id: string | null): GroupDraft {
	const group = id ? getGroup(id) : undefined
	return group ? { name: group.name, type: group.type, parentId: group.parentId, roleIds: [...group.roleIds] } : { name: '', type: 'team', parentId: null, roleIds: [] }
}

function save(): void {
	if (isCreating.value) {
		const result = createGroup(form)
		if (!result.ok) { errors.value = result.errors; return }
		selectedId.value = result.value.id
		emit('notify', `已新增群組「${result.value.name}」。`)
		return
	}
	if (!selectedGroup.value) return
	const result = updateGroup(selectedGroup.value.id, form)
	if (!result.ok) { errors.value = result.errors; return }
	resetForm()
	emit('notify', `已儲存群組「${form.name}」，影響 ${affectedCount.value} 位成員的權限。`)
}

function remove(): void {
	const group = selectedGroup.value
	confirmDelete.value = false
	if (!group) return
	const result = deleteGroup(group.id)
	if (!result.ok) { emit('notify', result.errors.form, 'error'); return }
	selectedId.value = accessState.groups[0]?.id ?? null
	emit('notify', `已刪除群組「${group.name}」。`)
}

function removeMember(userId: string): void {
	if (!selectedGroup.value) return
	const result = removeGroupMember(selectedGroup.value.id, userId)
	if (!result.ok) emit('notify', Object.values(result.errors)[0] ?? '移出失敗', 'error')
	else emit('notify', '已將成員移出群組。')
}

defineExpose({ isDirty })
</script>

<template>
	<div class="split">
		<section class="list-pane" aria-label="群組階層">
			<VBtn color="primary" variant="tonal" block prepend-icon="mdi-account-multiple-plus-outline" class="mb-3" data-testid="groups-create" :active="isCreating" @click="requestSelect(null)">新增群組</VBtn>
			<FilterSearchField v-model="search" label="搜尋群組" density="compact" class="mb-3" />
			<ul class="item-list">
				<li v-if="isCreating"><span class="item-row is-active"><span class="item-top"><strong>新群組</strong></span><span class="item-sub">尚未儲存</span></span></li>
				<li v-for="{ group, depth } in tree" :key="group.id">
					<button type="button" class="item-row" :class="{ 'is-active': group.id === selectedId }" :style="{ paddingInlineStart: `${12 + (search ? 0 : depth * 16)}px` }" :aria-current="group.id === selectedId ? 'true' : undefined" @click="requestSelect(group.id)">
						<span class="item-top">
							<strong>{{ group.name }}</strong>
							<VIcon v-if="group.source === 'sso'" icon="mdi-sync" size="14" aria-label="SSO 同步" />
						</span>
						<span class="item-sub">{{ GROUP_TYPE_LABELS[group.type] }} · {{ getGroupMembers(group.id).length }} 位成員<template v-if="group.roleIds.length"> · {{ group.roleIds.length }} 個角色</template></span>
					</button>
				</li>
				<li v-if="!tree.length" class="empty-note">沒有符合的群組</li>
			</ul>
		</section>

		<section class="detail-pane" :aria-label="isCreating ? '新增群組' : '群組設定'">
			<header class="detail-head">
				<div>
					<p class="eyebrow-sm">{{ isCreating ? '新增群組' : getGroupPath(selectedGroup?.id ?? '') }}</p>
					<h2 class="section-heading">{{ isCreating ? '新群組' : selectedGroup?.name }}</h2>
				</div>
				<div class="d-flex ga-2 flex-wrap">
					<VBtn v-if="!isCreating && !isSynced" variant="text" color="error" :disabled="Boolean(deleteBlocker)" @click="confirmDelete = true">刪除</VBtn>
					<VBtn v-if="isDirty && !isCreating" variant="text" @click="resetForm">取消變更</VBtn>
					<VBtn color="primary" :disabled="!isDirty && !isCreating" data-testid="group-save" @click="save">{{ isCreating ? '建立群組' : '儲存變更' }}</VBtn>
				</div>
			</header>

			<VAlert v-if="isSynced" type="info" variant="tonal" density="compact" class="mb-4" icon="mdi-sync">此群組由 SSO 同步，名稱、階層與成員請在公司身分系統修改；這裡可以指派角色。</VAlert>
			<VAlert v-if="errors.form" type="error" variant="tonal" density="compact" class="mb-4">{{ errors.form }}</VAlert>
			<p v-if="deleteBlocker && !isCreating && !isSynced" class="note mb-4">刪除限制：{{ deleteBlocker }}。</p>

			<div class="form-grid">
				<VTextField v-model="form.name" label="群組名稱" :readonly="isSynced" :error-messages="errors.name" @update:model-value="clearError('name')" />
				<VSelect v-model="form.type" label="類型" :items="typeItems" :readonly="isSynced" />
				<VSelect v-model="form.parentId" label="上層群組" :items="parentItems" :readonly="isSynced" :error-messages="errors.parentId" @update:model-value="clearError('parentId')" />
				<VAutocomplete v-model="form.roleIds" label="群組角色" :items="roleItems" multiple chips closable-chips :error-messages="errors.roleIds" :hint="isCreating ? '成員與子群組成員都會取得這些角色' : `成員與子群組成員都會取得這些角色，目前影響 ${affectedCount} 人`" persistent-hint @update:model-value="clearError('roleIds')" />
			</div>

			<template v-if="!isCreating">
				<h3 class="sub-heading">直接成員 <span class="note">{{ members.length }} 位</span></h3>
				<p v-if="!members.length" class="note">沒有直接成員。{{ isSynced ? '' : '到「使用者」編輯帳號即可加入此群組。' }}</p>
				<ul v-else class="member-list">
					<li v-for="member in members" :key="member.id">
						<button type="button" class="member-link" @click="emit('openUser', member.id)">{{ member.displayName }}</button>
						<span class="note">{{ member.email }}</span>
						<VChip size="x-small" :color="USER_STATUS_COLORS[member.status]" variant="tonal" label>{{ USER_STATUS_LABELS[member.status] }}</VChip>
						<VBtn v-if="!isSynced" size="x-small" variant="text" class="ms-auto" :aria-label="`將 ${member.displayName} 移出群組`" @click="removeMember(member.id)">移出</VBtn>
					</li>
				</ul>
				<template v-if="children.length">
					<h3 class="sub-heading">子群組 <span class="note">{{ children.length }} 個</span></h3>
					<div class="d-flex flex-wrap ga-2">
						<VChip v-for="child in children" :key="child.id" size="small" variant="outlined" @click="requestSelect(child.id)">{{ child.name }}</VChip>
					</div>
				</template>
				<p class="note mt-4">來源：{{ SOURCE_LABELS[selectedGroup?.source ?? 'local'] }}</p>
			</template>
		</section>

		<VDialog :model-value="pendingId !== undefined" max-width="440" @update:model-value="pendingId = undefined">
			<VCard title="捨棄未儲存的變更？" text="目前群組有尚未儲存的設定，切換後會遺失。">
				<VCardActions><VSpacer /><VBtn @click="pendingId = undefined">繼續編輯</VBtn><VBtn color="error" @click="discardAndSwitch">捨棄變更</VBtn></VCardActions>
			</VCard>
		</VDialog>
		<VDialog v-model="confirmDelete" max-width="440">
			<VCard title="刪除群組" :text="`確定刪除「${selectedGroup?.name ?? ''}」？此操作無法復原。`">
				<VCardActions><VSpacer /><VBtn @click="confirmDelete = false">取消</VBtn><VBtn color="error" @click="remove">刪除</VBtn></VCardActions>
			</VCard>
		</VDialog>
	</div>
</template>

<style scoped src="./access-panel.css"></style>
<style scoped>
.member-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; }
.member-list li { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); flex-wrap: wrap; }
.member-link { color: rgb(var(--v-theme-primary)); font-weight: 600; }
.member-link:hover { text-decoration: underline; }
</style>
