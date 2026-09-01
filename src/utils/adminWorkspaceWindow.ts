export const ADMIN_WORKSPACE_WINDOW_NAME = "syscom-cubi-admin-workspace-v2"
export const EMPLOYEE_WORKSPACE_WINDOW_NAME = "syscom-cubi-employee-workspace-v1"

/**
 * - 取得目前工作區應登記的瀏覽器頁簽名稱
 * @param isAdminWorkspace 是否位於管理後台
 * @returns 目前工作區的固定頁簽名稱
 */
export function getWorkspaceWindowName(isAdminWorkspace: boolean): string {
	return isAdminWorkspace
		? ADMIN_WORKSPACE_WINDOW_NAME
		: EMPLOYEE_WORKSPACE_WINDOW_NAME
}

/**
 * - 取得切換工作區時應指向的瀏覽器頁簽名稱
 * @param isAdminWorkspace 是否從管理後台發起切換
 * @returns 另一個工作區的固定頁簽名稱
 */
export function getWorkspaceSwitchWindowName(isAdminWorkspace: boolean): string {
	return isAdminWorkspace
		? EMPLOYEE_WORKSPACE_WINDOW_NAME
		: ADMIN_WORKSPACE_WINDOW_NAME
}
