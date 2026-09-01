import { describe, expect, it } from "vitest"

import {
	ADMIN_WORKSPACE_WINDOW_NAME,
	EMPLOYEE_WORKSPACE_WINDOW_NAME,
	getWorkspaceWindowName,
	getWorkspaceSwitchWindowName,
} from "@/utils/adminWorkspaceWindow"

describe("admin workspace window", () => {
	it("should assign a stable name to each workspace", () => {
		expect(getWorkspaceWindowName(false)).toBe(EMPLOYEE_WORKSPACE_WINDOW_NAME)
		expect(getWorkspaceWindowName(true)).toBe(ADMIN_WORKSPACE_WINDOW_NAME)
	})

	it("should target the admin workspace from the employee workspace", () => {
		expect(getWorkspaceSwitchWindowName(false)).toBe(ADMIN_WORKSPACE_WINDOW_NAME)
	})

	it("should target the employee workspace from the admin workspace", () => {
		expect(getWorkspaceSwitchWindowName(true)).toBe(EMPLOYEE_WORKSPACE_WINDOW_NAME)
	})

	it("should keep employee and admin workspace names distinct", () => {
		expect(EMPLOYEE_WORKSPACE_WINDOW_NAME).not.toBe(ADMIN_WORKSPACE_WINDOW_NAME)
	})
})
