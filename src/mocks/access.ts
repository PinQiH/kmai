import { reactive } from 'vue'

// > 使用者與存取：欄位與規則對齊舊版 /api/v2/admin/users、roles、groups
// TODO(api-integration): 改呼叫後端 users、roles、groups、capabilities API，驗證規則以後端為準
// @ 有效權限 = 直接指派的角色 + 所屬群組（含上層群組）指派的角色；持有 system.admin 視為擁有全部權限

export type UserStatus = 'active' | 'suspended' | 'disabled'
export type GroupType = 'department' | 'project' | 'team'
/** sso 代表由身分提供者同步，名稱與階層不可在這裡改。 */
export type IdentitySource = 'local' | 'sso'

export interface Capability {
	code: string
	name: string
	resource: string
	description: string
}

export interface AccessRole {
	id: string
	code: string
	name: string
	description: string
	/** 內建角色不可刪除，其中 SYSTEM_ADMIN 連權限也不可改。 */
	isSystem: boolean
	capabilityCodes: string[]
}

export interface AccessGroup {
	id: string
	name: string
	type: GroupType
	source: IdentitySource
	parentId: string | null
	roleIds: string[]
}

export interface AccessUser {
	id: string
	account: string
	email: string
	displayName: string
	status: UserStatus
	source: IdentitySource
	mustChangePassword: boolean
	lastLoginAt: string | null
	createdAt: string
	roleIds: string[]
	groupIds: string[]
}

export type FieldErrors = Record<string, string>
export type Result<T = undefined> = ({ ok: true } & (T extends undefined ? unknown : { value: T })) | { ok: false; errors: FieldErrors }

export const SYSTEM_ADMIN_ROLE_ID = 'role-system-admin'
export const SYSTEM_ADMIN_CAPABILITY = 'system.admin'
export const ADMIN_ACCESS_CAPABILITY = 'km.admin.access'
export const MIN_PASSWORD_LENGTH = 8
// TODO(api-integration): 改由登入身分取得
export const CURRENT_USER_ID = 'user-km-admin'

export const USER_STATUS_LABELS: Record<UserStatus, string> = { active: '啟用中', suspended: '已暫停', disabled: '已停用' }
export const USER_STATUS_COLORS: Record<UserStatus, string> = { active: 'success', suspended: 'warning', disabled: 'secondary' }
export const USER_STATUS_HINTS: Record<UserStatus, string> = {
	active: '可以登入並依角色使用功能。',
	suspended: '暫時無法登入，資料與權限保留，適合留停或調查中。',
	disabled: '無法登入，適合離職帳號；保留紀錄以供稽核。',
}
export const GROUP_TYPE_LABELS: Record<GroupType, string> = { department: '部門', project: '專案', team: '團隊' }
export const SOURCE_LABELS: Record<IdentitySource, string> = { local: '本機帳號', sso: 'SSO 同步' }
export const RESOURCE_LABELS: Record<string, string> = { portal: '入口', document: '文件', rag: 'AI 問答', skill: 'Skill', access: '權限', audit: '稽核', system: '系統' }

export const CAPABILITIES: Capability[] = [
	{ code: 'km.portal.access', name: '進入知識入口', resource: 'portal', description: '登入並瀏覽知識庫' },
	{ code: ADMIN_ACCESS_CAPABILITY, name: '進入管理後台', resource: 'portal', description: '看到並進入管理後台' },
	{ code: 'km.document.read', name: '讀取文件', resource: 'document', description: '閱讀已授權的文件內容' },
	{ code: 'km.document.download', name: '下載文件', resource: 'document', description: '下載文件或附件' },
	{ code: 'km.document.create', name: '建立文件', resource: 'document', description: '建立與上傳文件' },
	{ code: 'km.document.edit', name: '編輯文件', resource: 'document', description: '編輯已授權的文件' },
	{ code: 'km.document.delete', name: '刪除文件', resource: 'document', description: '刪除已授權的文件' },
	{ code: 'km.document.share', name: '分享文件', resource: 'document', description: '管理文件的存取對象與分享' },
	{ code: 'km.document.review', name: '審核文件', resource: 'document', description: '審核待發布的知識文件' },
	{ code: 'km.document.manage_all', name: '管理所有文件', resource: 'document', description: '不受部門限制管理所有文件與生命週期' },
	{ code: 'km.rag.query', name: '使用 AI 問答', resource: 'rag', description: '向知識庫提問並取得 AI 回答' },
	{ code: 'km.rag.lab.manage', name: '管理 AI 與檢索設定', resource: 'rag', description: '調整模型、檢索參數與提示詞' },
	{ code: 'km.skill.manage', name: '管理 Skill', resource: 'skill', description: '管理 Agent Skill' },
	{ code: 'km.access.manage', name: '管理使用者與權限', resource: 'access', description: '管理帳號、角色與群組' },
	{ code: 'km.audit.read', name: '讀取系統紀錄', resource: 'audit', description: '查看登入、操作與問答紀錄' },
	{ code: SYSTEM_ADMIN_CAPABILITY, name: '系統管理', resource: 'system', description: '擁有全部權限，含指派系統管理員' },
]

// @ 這些權限的操作都在管理後台，必須同時持有「進入管理後台」
export const ADMIN_ONLY_CAPABILITY_CODES = ['km.document.manage_all', 'km.rag.lab.manage', 'km.skill.manage', 'km.access.manage', 'km.audit.read']

export function grantsAdminAccess(capabilityCodes: string[]): boolean {
	return capabilityCodes.includes(ADMIN_ACCESS_CAPABILITY) || capabilityCodes.includes(SYSTEM_ADMIN_CAPABILITY)
}

const READER = ['km.portal.access', 'km.document.read', 'km.document.download', 'km.rag.query']

const initialRoles: AccessRole[] = [
	{ id: 'role-km-user', code: 'KM_USER', name: '一般使用者', description: '搜尋、閱讀與 AI 問答', isSystem: true, capabilityCodes: [...READER] },
	{ id: 'role-km-contributor', code: 'KM_CONTRIBUTOR', name: '內容貢獻者', description: '可上傳與編輯自己負責的文件', isSystem: false, capabilityCodes: [...READER, 'km.document.create', 'km.document.edit'] },
	{ id: 'role-km-reviewer', code: 'KM_REVIEWER', name: '文件審核者', description: '審核部門送審的文件', isSystem: false, capabilityCodes: [...READER, ADMIN_ACCESS_CAPABILITY, 'km.document.review'] },
	{ id: 'role-km-manager', code: 'KM_MANAGER', name: '知識管理員', description: '管理全部文件、審核、權限與系統紀錄', isSystem: true, capabilityCodes: [...READER, ADMIN_ACCESS_CAPABILITY, 'km.document.review', 'km.document.manage_all', 'km.access.manage', 'km.audit.read', 'km.rag.lab.manage'] },
	{ id: SYSTEM_ADMIN_ROLE_ID, code: 'SYSTEM_ADMIN', name: '系統管理員', description: '擁有全部權限，系統保護角色', isSystem: true, capabilityCodes: [SYSTEM_ADMIN_CAPABILITY] },
]

const initialGroups: AccessGroup[] = [
	{ id: 'group-company', name: '全公司', type: 'department', source: 'sso', parentId: null, roleIds: ['role-km-user'] },
	{ id: 'group-product', name: '產品事業群', type: 'department', source: 'sso', parentId: 'group-company', roleIds: [] },
	{ id: 'group-planning', name: '產品企劃部', type: 'department', source: 'sso', parentId: 'group-product', roleIds: ['role-km-contributor'] },
	{ id: 'group-sales', name: '業務部', type: 'department', source: 'sso', parentId: 'group-product', roleIds: [] },
	{ id: 'group-admin-dept', name: '管理處', type: 'department', source: 'sso', parentId: 'group-company', roleIds: [] },
	{ id: 'group-hr', name: '人力資源部', type: 'department', source: 'sso', parentId: 'group-admin-dept', roleIds: ['role-km-reviewer'] },
	{ id: 'group-it', name: '資訊服務部', type: 'department', source: 'sso', parentId: 'group-admin-dept', roleIds: [] },
	{ id: 'group-km', name: '知識管理部', type: 'department', source: 'sso', parentId: 'group-admin-dept', roleIds: [] },
	{ id: 'group-helpdesk-project', name: '客服知識庫導入專案', type: 'project', source: 'local', parentId: null, roleIds: ['role-km-contributor'] },
]

const initialUsers: AccessUser[] = [
	{ id: CURRENT_USER_ID, account: 'yjlin', email: 'yjlin@syscom.com.tw', displayName: '林怡君', status: 'active', source: 'sso', mustChangePassword: false, lastLoginAt: '2026-09-17T08:52:00+08:00', createdAt: '2025-03-02T10:00:00+08:00', roleIds: ['role-km-manager'], groupIds: ['group-km'] },
	{ id: 'user-sysadmin', account: 'chhchang', email: 'chhchang@syscom.com.tw', displayName: '張家豪', status: 'active', source: 'sso', mustChangePassword: false, lastLoginAt: '2026-09-16T17:40:00+08:00', createdAt: '2025-03-01T09:00:00+08:00', roleIds: [SYSTEM_ADMIN_ROLE_ID], groupIds: ['group-it'] },
	{ id: 'user-wang', account: 'employee', email: 'employee@syscom.com.tw', displayName: '王小明', status: 'active', source: 'sso', mustChangePassword: false, lastLoginAt: '2026-09-17T09:05:00+08:00', createdAt: '2025-06-11T09:00:00+08:00', roleIds: [], groupIds: ['group-planning'] },
	{ id: 'user-chen', account: 'bywchen', email: 'bywchen@syscom.com.tw', displayName: '陳柏宇', status: 'active', source: 'sso', mustChangePassword: false, lastLoginAt: '2026-09-15T14:22:00+08:00', createdAt: '2025-08-20T09:00:00+08:00', roleIds: [], groupIds: ['group-sales'] },
	{ id: 'user-liu', account: 'mcliu', email: 'mcliu@syscom.com.tw', displayName: '劉美君', status: 'active', source: 'sso', mustChangePassword: false, lastLoginAt: '2026-09-12T11:03:00+08:00', createdAt: '2025-04-07T09:00:00+08:00', roleIds: [], groupIds: ['group-hr'] },
	{ id: 'user-ho', account: 'cyho', email: 'cyho@syscom.com.tw', displayName: '何志遠', status: 'active', source: 'sso', mustChangePassword: false, lastLoginAt: null, createdAt: '2026-09-15T09:30:00+08:00', roleIds: [], groupIds: ['group-it', 'group-helpdesk-project'] },
	{ id: 'user-huang', account: 'szhuang', email: 'szhuang@syscom.com.tw', displayName: '黃思涵', status: 'suspended', source: 'sso', mustChangePassword: false, lastLoginAt: '2026-07-30T10:15:00+08:00', createdAt: '2025-02-18T09:00:00+08:00', roleIds: [], groupIds: ['group-sales'] },
	{ id: 'user-wu', account: 'amywu', email: 'amywu@syscom.com.tw', displayName: '吳佩珊', status: 'disabled', source: 'sso', mustChangePassword: false, lastLoginAt: '2026-05-29T18:01:00+08:00', createdAt: '2024-11-04T09:00:00+08:00', roleIds: [], groupIds: ['group-sales'] },
	{ id: 'user-consultant', account: 'ext.consultant', email: 'consultant@acme-partner.com', displayName: '外部顧問 David Lin', status: 'active', source: 'local', mustChangePassword: true, lastLoginAt: null, createdAt: '2026-09-10T15:00:00+08:00', roleIds: ['role-km-user'], groupIds: ['group-helpdesk-project'] },
]

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T
}

export const accessState = reactive({
	users: clone(initialUsers),
	roles: clone(initialRoles),
	groups: clone(initialGroups),
})

export function resetAccessState(): void {
	accessState.users = clone(initialUsers)
	accessState.roles = clone(initialRoles)
	accessState.groups = clone(initialGroups)
}

// > 查詢

export function getUser(id: string): AccessUser | undefined {
	return accessState.users.find((user) => user.id === id)
}

export function getRole(id: string): AccessRole | undefined {
	return accessState.roles.find((role) => role.id === id)
}

export function getGroup(id: string): AccessGroup | undefined {
	return accessState.groups.find((group) => group.id === id)
}

/** 由根到自己的群組鏈；資料若意外成環會在重複處停止。 */
export function getGroupChain(groupId: string): AccessGroup[] {
	const chain: AccessGroup[] = []
	const seen = new Set<string>()
	let cursor = getGroup(groupId)
	while (cursor && !seen.has(cursor.id)) {
		seen.add(cursor.id)
		chain.unshift(cursor)
		cursor = cursor.parentId ? getGroup(cursor.parentId) : undefined
	}
	return chain
}

export function getGroupPath(groupId: string): string {
	return getGroupChain(groupId).map((group) => group.name).join(' / ')
}

export function getDescendantGroupIds(groupId: string): string[] {
	const result: string[] = []
	const queue = [groupId]
	while (queue.length) {
		const current = queue.shift() as string
		for (const child of accessState.groups.filter((group) => group.parentId === current)) {
			if (result.includes(child.id) || child.id === groupId) continue
			result.push(child.id)
			queue.push(child.id)
		}
	}
	return result
}

/** 依階層排序並附上深度，供樹狀清單使用。 */
export function getGroupTree(): Array<{ group: AccessGroup; depth: number }> {
	const rows: Array<{ group: AccessGroup; depth: number }> = []
	const visit = (parentId: string | null, depth: number): void => {
		accessState.groups
			.filter((group) => group.parentId === parentId)
			.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))
			.forEach((group) => {
				rows.push({ group, depth })
				visit(group.id, depth + 1)
			})
	}
	visit(null, 0)
	return rows
}

export interface EffectiveRole {
	role: AccessRole
	/** 例如「直接指派」「群組：產品企劃部」「群組：全公司（上層）」。 */
	sources: string[]
}

export function getEffectiveRoles(user: Pick<AccessUser, 'roleIds' | 'groupIds'>): EffectiveRole[] {
	const map = new Map<string, EffectiveRole>()
	const add = (roleId: string, source: string): void => {
		const role = getRole(roleId)
		if (!role) return
		const entry = map.get(roleId) ?? { role, sources: [] }
		if (!entry.sources.includes(source)) entry.sources.push(source)
		map.set(roleId, entry)
	}
	user.roleIds.forEach((roleId) => add(roleId, '直接指派'))
	for (const groupId of user.groupIds) {
		const chain = getGroupChain(groupId)
		chain.forEach((group, index) => {
			const inherited = index < chain.length - 1
			group.roleIds.forEach((roleId) => add(roleId, `群組：${group.name}${inherited ? '（上層）' : ''}`))
		})
	}
	return [...map.values()]
}

export function getEffectiveCapabilityCodes(user: Pick<AccessUser, 'roleIds' | 'groupIds'>): string[] {
	const codes = new Set(getEffectiveRoles(user).flatMap((entry) => entry.role.capabilityCodes))
	if (codes.has(SYSTEM_ADMIN_CAPABILITY)) return CAPABILITIES.map((capability) => capability.code)
	return CAPABILITIES.map((capability) => capability.code).filter((code) => codes.has(code))
}

export function isSystemAdmin(user: Pick<AccessUser, 'roleIds' | 'groupIds'>): boolean {
	return getEffectiveRoles(user).some((entry) => entry.role.capabilityCodes.includes(SYSTEM_ADMIN_CAPABILITY))
}

function actorIsSystemAdmin(actorId: string): boolean {
	const actor = getUser(actorId)
	return Boolean(actor && actor.status === 'active' && isSystemAdmin(actor))
}

export function canActorGrantSystemAdmin(actorId: string = CURRENT_USER_ID): boolean {
	return actorIsSystemAdmin(actorId)
}

export function getRoleUsage(roleId: string): { users: number; groups: number; effectiveUsers: number } {
	return {
		users: accessState.users.filter((user) => user.roleIds.includes(roleId)).length,
		groups: accessState.groups.filter((group) => group.roleIds.includes(roleId)).length,
		effectiveUsers: accessState.users.filter((user) => getEffectiveRoles(user).some((entry) => entry.role.id === roleId)).length,
	}
}

export function getGroupMembers(groupId: string): AccessUser[] {
	return accessState.users.filter((user) => user.groupIds.includes(groupId))
}

/** 含子群組成員（去重），代表群組角色實際影響的人數。 */
export function getGroupAffectedUserCount(groupId: string): number {
	const ids = new Set([groupId, ...getDescendantGroupIds(groupId)])
	return accessState.users.filter((user) => user.groupIds.some((id) => ids.has(id))).length
}

// > 驗證工具

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const ACCOUNT_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/
const ROLE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,31}$/

/** 模擬套用變更後是否仍至少有一位啟用中的系統管理員，避免把全系統鎖死。 */
function keepsActiveSystemAdmin(nextUsers: AccessUser[], nextGroups: AccessGroup[] = accessState.groups, nextRoles: AccessRole[] = accessState.roles): boolean {
	const roleHasAdmin = new Set(nextRoles.filter((role) => role.capabilityCodes.includes(SYSTEM_ADMIN_CAPABILITY)).map((role) => role.id))
	const groupMap = new Map(nextGroups.map((group) => [group.id, group]))
	const groupGrantsAdmin = (groupId: string): boolean => {
		const seen = new Set<string>()
		let cursor = groupMap.get(groupId)
		while (cursor && !seen.has(cursor.id)) {
			if (cursor.roleIds.some((id) => roleHasAdmin.has(id))) return true
			seen.add(cursor.id)
			cursor = cursor.parentId ? groupMap.get(cursor.parentId) : undefined
		}
		return false
	}
	return nextUsers.some((user) => user.status === 'active' && (user.roleIds.some((id) => roleHasAdmin.has(id)) || user.groupIds.some(groupGrantsAdmin)))
}

export function generateTemporaryPassword(length = 12): string {
	// @ 排除易混淆的 0/O、1/l/I
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
	const bytes = new Uint32Array(length)
	crypto.getRandomValues(bytes)
	return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('')
}

// > 使用者

export interface UserDraft {
	account: string
	email: string
	displayName: string
	status: UserStatus
	roleIds: string[]
	groupIds: string[]
}

export interface CreateUserInput extends UserDraft {
	/** 空字串代表由系統產生。 */
	temporaryPassword: string
}

export interface IssuedCredential {
	userId: string
	account: string
	displayName: string
	temporaryPassword: string
	generated: boolean
}

export function normalizeUserDraft<T extends UserDraft>(draft: T): T {
	return { ...draft, account: draft.account.trim().toLowerCase(), email: draft.email.trim().toLowerCase(), displayName: draft.displayName.trim(), roleIds: [...new Set(draft.roleIds)], groupIds: [...new Set(draft.groupIds)] }
}

export function validateUserDraft(draft: UserDraft, userId: string | null, actorId: string = CURRENT_USER_ID): FieldErrors {
	const errors: FieldErrors = {}
	const next = normalizeUserDraft(draft)
	const existing = userId ? getUser(userId) : undefined
	const others = accessState.users.filter((user) => user.id !== userId)

	if (!existing) {
		if (!ACCOUNT_PATTERN.test(next.account)) errors.account = '帳號為 3–32 碼小寫英數字，可含 . _ -'
		else if (others.some((user) => user.account === next.account)) errors.account = '此帳號已被使用'
	}
	if (!existing || existing.source === 'local') {
		if (!next.displayName) errors.displayName = '請輸入顯示名稱'
		else if (next.displayName.length > 50) errors.displayName = '顯示名稱最多 50 字'
		if (!EMAIL_PATTERN.test(next.email)) errors.email = 'Email 格式不正確'
		else if (others.some((user) => user.email === next.email)) errors.email = '此 Email 已被其他使用者使用'
	}
	if (next.roleIds.some((id) => !getRole(id))) errors.roleIds = '部分角色不存在'
	if (next.groupIds.some((id) => !getGroup(id))) errors.groupIds = '部分群組不存在'
	else {
		const before = existing?.groupIds ?? []
		const changedSso = [...next.groupIds.filter((id) => !before.includes(id)), ...before.filter((id) => !next.groupIds.includes(id))].map(getGroup).filter((group) => group?.source === 'sso')
		if (changedSso.length) errors.groupIds = `「${changedSso.map((group) => group?.name).join('、')}」由 SSO 同步，成員請在公司身分系統調整`
	}

	// !! 只有系統管理員能授予或移除系統管理員角色，避免知識管理員自行提權
	const hadAdminRole = existing?.roleIds.includes(SYSTEM_ADMIN_ROLE_ID) ?? false
	const hasAdminRole = next.roleIds.includes(SYSTEM_ADMIN_ROLE_ID)
	if (hadAdminRole !== hasAdminRole && !actorIsSystemAdmin(actorId)) errors.roleIds = '只有系統管理員可以指派或移除「系統管理員」角色'

	if (existing && existing.status !== next.status && existing.id !== actorId && isSystemAdmin(existing) && !actorIsSystemAdmin(actorId)) errors.status = '只有系統管理員可以變更系統管理員的帳號狀態'
	if (userId === actorId && existing) {
		if (next.status !== 'active') errors.status = '不能暫停或停用自己的帳號'
		else if (existing.roleIds.includes('role-km-manager') && !next.roleIds.includes('role-km-manager') && !actorIsSystemAdmin(actorId)) errors.roleIds = '不能移除自己的管理權限，請由其他管理者處理'
	}
	if (existing && !errors.status && !errors.roleIds) {
		const nextUsers = accessState.users.map((user) => (user.id === userId ? { ...user, status: next.status, roleIds: next.roleIds, groupIds: next.groupIds } : user))
		if (!keepsActiveSystemAdmin(nextUsers)) errors.status = '這是最後一位啟用中的系統管理員，不能停用或移除權限'
	}
	return errors
}

export function createUser(input: CreateUserInput, actorId: string = CURRENT_USER_ID): Result<IssuedCredential> {
	const next = normalizeUserDraft(input)
	const errors = validateUserDraft(next, null, actorId)
	const typedPassword = input.temporaryPassword
	if (typedPassword && typedPassword.length < MIN_PASSWORD_LENGTH) errors.temporaryPassword = `臨時密碼至少 ${MIN_PASSWORD_LENGTH} 碼`
	if (Object.keys(errors).length) return { ok: false, errors }

	const temporaryPassword = typedPassword || generateTemporaryPassword()
	const id = `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
	// !! 密碼只回傳給呼叫端顯示一次，不存進狀態
	accessState.users.unshift({ id, account: next.account, email: next.email, displayName: next.displayName, status: next.status, source: 'local', mustChangePassword: true, lastLoginAt: null, createdAt: new Date().toISOString(), roleIds: next.roleIds, groupIds: next.groupIds })
	return { ok: true, value: { userId: id, account: next.account, displayName: next.displayName, temporaryPassword, generated: !typedPassword } }
}

export function updateUser(userId: string, draft: UserDraft, actorId: string = CURRENT_USER_ID): Result {
	const user = getUser(userId)
	if (!user) return { ok: false, errors: { form: '找不到使用者' } }
	const next = normalizeUserDraft(draft)
	const errors = validateUserDraft(next, userId, actorId)
	if (Object.keys(errors).length) return { ok: false, errors }
	if (user.source === 'local') {
		user.displayName = next.displayName
		user.email = next.email
	}
	user.status = next.status
	user.roleIds = next.roleIds
	user.groupIds = next.groupIds
	return { ok: true }
}

export function resetUserPassword(userId: string, actorId: string = CURRENT_USER_ID): Result<IssuedCredential> {
	const user = getUser(userId)
	if (!user) return { ok: false, errors: { form: '找不到使用者' } }
	if (user.source === 'sso') return { ok: false, errors: { form: 'SSO 帳號的密碼由公司身分系統管理，無法在這裡重設' } }
	if (user.id === actorId) return { ok: false, errors: { form: '請到個人設定變更自己的密碼' } }
	if (isSystemAdmin(user) && !actorIsSystemAdmin(actorId)) return { ok: false, errors: { form: '只有系統管理員可以重設系統管理員的密碼' } }
	const temporaryPassword = generateTemporaryPassword()
	user.mustChangePassword = true
	return { ok: true, value: { userId, account: user.account, displayName: user.displayName, temporaryPassword, generated: true } }
}

export interface BulkStatusResult {
	changed: string[]
	skipped: Array<{ userId: string; reason: string }>
}

/** 批次變更狀態；逐筆套用規則，不符合的略過並回報原因。 */
export function setUsersStatus(userIds: string[], status: UserStatus, actorId: string = CURRENT_USER_ID): BulkStatusResult {
	const result: BulkStatusResult = { changed: [], skipped: [] }
	for (const userId of userIds) {
		const user = getUser(userId)
		if (!user) continue
		if (user.status === status) continue
		const errors = validateUserDraft({ ...user, status }, userId, actorId)
		if (errors.status) {
			result.skipped.push({ userId, reason: errors.status })
			continue
		}
		user.status = status
		result.changed.push(userId)
	}
	return result
}

// > 角色

export interface RoleDraft {
	code: string
	name: string
	description: string
	capabilityCodes: string[]
}

export function isRoleLocked(role: AccessRole): boolean {
	return role.id === SYSTEM_ADMIN_ROLE_ID
}

export function validateRoleDraft(draft: RoleDraft, roleId: string | null): FieldErrors {
	const errors: FieldErrors = {}
	const others = accessState.roles.filter((role) => role.id !== roleId)
	if (!roleId) {
		const code = draft.code.trim().toUpperCase()
		if (!ROLE_CODE_PATTERN.test(code)) errors.code = '代碼為 3–32 碼大寫英數字與底線，需以英文字母開頭'
		else if (others.some((role) => role.code === code)) errors.code = '角色代碼已存在'
	}
	const name = draft.name.trim()
	if (!name) errors.name = '請輸入角色名稱'
	else if (name.length > 30) errors.name = '角色名稱最多 30 字'
	else if (others.some((role) => role.name === name)) errors.name = '已有同名角色'
	if (draft.description.length > 200) errors.description = '說明最多 200 字'
	if (draft.capabilityCodes.includes(SYSTEM_ADMIN_CAPABILITY)) errors.capabilityCodes = '「系統管理」權限只屬於系統管理員角色'
	else if (draft.capabilityCodes.some((code) => !CAPABILITIES.some((capability) => capability.code === code))) errors.capabilityCodes = '部分權限不存在'
	else if (!draft.capabilityCodes.includes(ADMIN_ACCESS_CAPABILITY) && draft.capabilityCodes.some((code) => ADMIN_ONLY_CAPABILITY_CODES.includes(code))) errors.capabilityCodes = '管理類權限需要同時勾選「進入管理後台」'
	return errors
}

export function createRole(draft: RoleDraft): Result<AccessRole> {
	const errors = validateRoleDraft(draft, null)
	if (Object.keys(errors).length) return { ok: false, errors }
	const code = draft.code.trim().toUpperCase()
	const role: AccessRole = { id: `role-${code.toLowerCase().replace(/_/g, '-')}`, code, name: draft.name.trim(), description: draft.description.trim(), isSystem: false, capabilityCodes: [...new Set(draft.capabilityCodes)] }
	accessState.roles.push(role)
	return { ok: true, value: role }
}

export function updateRole(roleId: string, draft: RoleDraft, actorId: string = CURRENT_USER_ID): Result {
	const role = getRole(roleId)
	if (!role) return { ok: false, errors: { form: '找不到角色' } }
	if (isRoleLocked(role)) return { ok: false, errors: { form: '系統管理員為保護角色，無法修改' } }
	const errors = validateRoleDraft(draft, roleId)
	// !! 拿掉自己賴以管理權限的能力會把自己鎖在頁面外
	if (!errors.capabilityCodes && role.capabilityCodes.includes('km.access.manage') && !draft.capabilityCodes.includes('km.access.manage')) {
		const actor = getUser(actorId)
		if (actor && !isSystemAdmin(actor)) {
			const stillCan = getEffectiveRoles(actor).some((entry) => entry.role.id !== roleId && entry.role.capabilityCodes.includes('km.access.manage'))
			if (!stillCan) errors.capabilityCodes = '移除後你將失去管理使用者與權限的能力，請由系統管理員處理'
		}
	}
	if (Object.keys(errors).length) return { ok: false, errors }
	role.name = draft.name.trim()
	role.description = draft.description.trim()
	role.capabilityCodes = CAPABILITIES.map((capability) => capability.code).filter((code) => draft.capabilityCodes.includes(code))
	return { ok: true }
}

export function getRoleDeleteBlocker(roleId: string): string | null {
	const role = getRole(roleId)
	if (!role) return '找不到角色'
	if (role.isSystem) return '內建角色不可刪除'
	const usage = getRoleUsage(roleId)
	if (usage.users || usage.groups) return `仍指派給 ${usage.users} 位使用者、${usage.groups} 個群組，請先解除指派`
	return null
}

export function deleteRole(roleId: string): Result {
	const blocker = getRoleDeleteBlocker(roleId)
	if (blocker) return { ok: false, errors: { form: blocker } }
	accessState.roles = accessState.roles.filter((role) => role.id !== roleId)
	return { ok: true }
}

// > 群組

export interface GroupDraft {
	name: string
	type: GroupType
	parentId: string | null
	roleIds: string[]
}

export function validateGroupDraft(draft: GroupDraft, groupId: string | null, actorId: string = CURRENT_USER_ID): FieldErrors {
	const errors: FieldErrors = {}
	const existing = groupId ? getGroup(groupId) : undefined
	const name = draft.name.trim()
	const structureChanged = !existing || existing.name !== name || existing.parentId !== draft.parentId || existing.type !== draft.type
	if (existing?.source === 'sso' && structureChanged) errors.form = 'SSO 同步的群組只能調整角色，名稱與階層請在公司身分系統修改'

	if (!name) errors.name = '請輸入群組名稱'
	else if (name.length > 50) errors.name = '群組名稱最多 50 字'
	else if (accessState.groups.some((group) => group.id !== groupId && group.name === name)) errors.name = '群組名稱已存在'

	if (draft.parentId) {
		if (draft.parentId === groupId) errors.parentId = '上層群組不可指向自己'
		else if (!getGroup(draft.parentId)) errors.parentId = '上層群組不存在'
		else if (groupId && getDescendantGroupIds(groupId).includes(draft.parentId)) errors.parentId = '不可把子群組設為上層，會形成循環'
	}
	if (draft.roleIds.some((id) => !getRole(id))) errors.roleIds = '部分角色不存在'
	const hadAdmin = existing?.roleIds.includes(SYSTEM_ADMIN_ROLE_ID) ?? false
	if (hadAdmin !== draft.roleIds.includes(SYSTEM_ADMIN_ROLE_ID) && !actorIsSystemAdmin(actorId)) errors.roleIds = '只有系統管理員可以透過群組授予或移除「系統管理員」角色'
	if (groupId && !errors.roleIds && !errors.parentId) {
		const nextGroups = accessState.groups.map((group) => (group.id === groupId ? { ...group, parentId: draft.parentId, roleIds: draft.roleIds } : group))
		if (!keepsActiveSystemAdmin(accessState.users, nextGroups)) errors.roleIds = '變更後將沒有任何啟用中的系統管理員'
	}
	return errors
}

export function createGroup(draft: GroupDraft, actorId: string = CURRENT_USER_ID): Result<AccessGroup> {
	const errors = validateGroupDraft(draft, null, actorId)
	if (Object.keys(errors).length) return { ok: false, errors }
	const group: AccessGroup = { id: `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name: draft.name.trim(), type: draft.type, source: 'local', parentId: draft.parentId, roleIds: [...new Set(draft.roleIds)] }
	accessState.groups.push(group)
	return { ok: true, value: group }
}

export function updateGroup(groupId: string, draft: GroupDraft, actorId: string = CURRENT_USER_ID): Result {
	const group = getGroup(groupId)
	if (!group) return { ok: false, errors: { form: '找不到群組' } }
	const errors = validateGroupDraft(draft, groupId, actorId)
	if (Object.keys(errors).length) return { ok: false, errors }
	group.name = draft.name.trim()
	group.type = draft.type
	group.parentId = draft.parentId
	group.roleIds = [...new Set(draft.roleIds)]
	return { ok: true }
}

export function getGroupDeleteBlocker(groupId: string): string | null {
	const group = getGroup(groupId)
	if (!group) return '找不到群組'
	if (group.source === 'sso') return 'SSO 同步的群組請在公司身分系統刪除'
	const members = getGroupMembers(groupId).length
	const children = accessState.groups.filter((item) => item.parentId === groupId).length
	if (members || children) return `仍有 ${members} 位成員、${children} 個子群組，請先移出或轉移`
	return null
}

export function deleteGroup(groupId: string): Result {
	const blocker = getGroupDeleteBlocker(groupId)
	if (blocker) return { ok: false, errors: { form: blocker } }
	accessState.groups = accessState.groups.filter((group) => group.id !== groupId)
	return { ok: true }
}

/** 將群組成員移出（只限本機群組；SSO 群組成員由同步決定）。 */
export function removeGroupMember(groupId: string, userId: string): Result {
	const group = getGroup(groupId)
	const user = getUser(userId)
	if (!group || !user) return { ok: false, errors: { form: '找不到群組或使用者' } }
	if (group.source === 'sso') return { ok: false, errors: { form: 'SSO 群組的成員由公司身分系統同步' } }
	return updateUser(userId, { ...user, groupIds: user.groupIds.filter((id) => id !== groupId) })
}

export function formatAccessTime(value: string | null): string {
	if (!value) return '從未登入'
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return '—'
	return new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' }).format(date)
}
