import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const SOURCE_ROOT = resolve(process.cwd(), 'src')
const SOURCE_EXTENSIONS = new Set(['.js', '.ts', '.vue'])
const NATIVE_DIALOG_NAMES = new Set(['alert', 'confirm', 'prompt'])
const BROWSER_GLOBAL_NAMES = new Set(['globalThis', 'self', 'window'])

interface SourceSegment {
	content: string
	lineOffset: number
}

function collectSourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = join(directory, entry.name)
		if (entry.isDirectory()) return collectSourceFiles(entryPath)
		return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [entryPath] : []
	})
}

function getSourceSegments(filePath: string, source: string): SourceSegment[] {
	if (extname(filePath) !== '.vue') return [{ content: source, lineOffset: 0 }]
	return Array.from(source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi), (match) => {
		const content = match[1]
		const contentStart = match.index + match[0].indexOf(content)
		return {
			content,
			lineOffset: source.slice(0, contentStart).split('\n').length - 1,
		}
	})
}

function getNativeDialogName(node: ts.Node): string | null {
	if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && NATIVE_DIALOG_NAMES.has(node.expression.text)) {
		return node.expression.text
	}
	if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && BROWSER_GLOBAL_NAMES.has(node.expression.text) && NATIVE_DIALOG_NAMES.has(node.name.text)) {
		return node.name.text
	}
	if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && BROWSER_GLOBAL_NAMES.has(node.expression.text) && ts.isStringLiteral(node.argumentExpression) && NATIVE_DIALOG_NAMES.has(node.argumentExpression.text)) {
		return node.argumentExpression.text
	}
	return null
}

function findNativeDialogCalls(filePath: string): string[] {
	const source = readFileSync(filePath, 'utf8')
	return getSourceSegments(filePath, source).flatMap(({ content, lineOffset }) => {
		const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
		const violations: string[] = []
		function visit(node: ts.Node): void {
			const dialogName = getNativeDialogName(node)
			if (dialogName) {
				const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
				violations.push(`${filePath}:${line + lineOffset + 1} ${dialogName}()`)
			}
			ts.forEachChild(node, visit)
		}
		visit(sourceFile)
		return violations
	})
}

describe('native browser dialogs', () => {
	it('should not use alert, confirm, or prompt in application source files', () => {
		const violations = collectSourceFiles(SOURCE_ROOT).flatMap(findNativeDialogCalls)

		expect(violations, `請改用系統內的對話框元件：\n${violations.join('\n')}`).toEqual([])
	})
})
