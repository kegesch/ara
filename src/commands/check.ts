// arad check — find orphans, contradictions, dangling refs, unvalidated assumptions,
//              plus heuristic analysis: possible contradictions, duplicates, status anomalies

import { bold, dim, green, red, yellow } from "../display/format.js";
import {
	buildGraph,
	findContradictions,
	findDanglingRefs,
	findOrphanRequirements,
	findOrphans,
	findPossibleContradictions,
	findPossibleDuplicates,
	findStatusAnomalies,
	findUnvalidatedAssumptions,
} from "../graph/analysis.js";
import { readAllEntities, requireAradProject } from "../io/files.js";

export interface CheckOptions {
	strict?: boolean;
	format?: "text" | "json";
	context?: string;
}

export interface CheckResult {
	entities: number;
	relationships: number;
	issues: CheckIssue[];
	warnings: CheckWarning[];
}

export interface CheckIssue {
	kind: string;
	severity: "error";
	message: string;
	ids: string[];
	detail?: string;
}

export interface CheckWarning {
	kind: string;
	severity: "warning";
	message: string;
	ids: string[];
	detail?: string;
}

/**
 * Run all checks and return structured results.
 */
export function runCheck(contextFilter?: string): CheckResult {
	let entities = readAllEntities();

	// Filter by context if specified
	if (contextFilter) {
		entities = entities.filter(
			(e) =>
				e.context?.toLowerCase().includes(contextFilter.toLowerCase()) ?? false,
		);
	}

	const graph = buildGraph(entities);

	const result: CheckResult = {
		entities: entities.length,
		relationships: graph.edges.length,
		issues: [],
		warnings: [],
	};

	// ─── Hard issues ───

	for (const o of findOrphans(graph)) {
		result.issues.push({
			kind: "orphan_decision",
			severity: "error",
			message: `Decision ${o.id} "${o.title}" has no backing requirement or assumption`,
			ids: [o.id],
		});
	}

	for (const [a, b] of findContradictions(graph)) {
		result.issues.push({
			kind: "contradiction",
			severity: "error",
			message: `Requirements ${a.id} and ${b.id} explicitly conflict`,
			ids: [a.id, b.id],
			detail: `"${a.title}" ↔ "${b.title}"`,
		});
	}

	for (const d of findDanglingRefs(graph)) {
		result.issues.push({
			kind: "dangling_ref",
			severity: "error",
			message: `${d.from} references non-existent ${d.ref} (${d.context})`,
			ids: [d.from, d.ref],
		});
	}

	for (const anomaly of findStatusAnomalies(graph)) {
		result.issues.push({
			kind: "status_anomaly",
			severity: "error",
			message: anomaly.issue,
			ids: [anomaly.entity.id, ...anomaly.refs.map((r) => r.id)],
		});
	}

	// ─── Warnings ───

	for (const a of findUnvalidatedAssumptions(graph)) {
		const incoming = graph.incoming.get(a.id) ?? [];
		const depCount = incoming.filter((e) =>
			["driven_by", "enables"].includes(e.type),
		).length;
		result.warnings.push({
			kind: "unvalidated_assumption",
			severity: "warning",
			message: `Assumption ${a.id} "${a.title}" is unvalidated`,
			ids: [a.id],
			detail: depCount > 0 ? `${depCount} dependent decision(s)` : undefined,
		});
	}

	for (const r of findOrphanRequirements(graph)) {
		result.warnings.push({
			kind: "orphan_requirement",
			severity: "warning",
			message: `Requirement ${r.id} "${r.title}" is accepted but has no decisions addressing it`,
			ids: [r.id],
		});
	}

	for (const pc of findPossibleContradictions(graph)) {
		result.warnings.push({
			kind: "possible_contradiction",
			severity: "warning",
			message: `"${pc.a.title}" ↔ "${pc.b.title}"`,
			ids: [pc.a.id, pc.b.id],
			detail: pc.reason,
		});
	}

	for (const dup of findPossibleDuplicates(graph)) {
		const pct = Math.round(dup.similarity * 100);
		result.warnings.push({
			kind: "possible_duplicate",
			severity: "warning",
			message: `"${dup.a.title}" ≈ "${dup.b.title}" (${pct}% similar)`,
			ids: [dup.a.id, dup.b.id],
		});
	}

	return result;
}

/**
 * Display check results in human-readable text format.
 */
function displayText(result: CheckResult, strict: boolean): void {
	console.log(bold("ARAD Health Check"));
	console.log(
		dim(`  ${result.entities} entities, ${result.relationships} relationships`),
	);
	console.log("");

	for (const issue of result.issues) {
		console.log(red(`  ✗ [${issue.kind}] ${issue.message}`));
		if (issue.detail) console.log(dim(`    ${issue.detail}`));
	}
	if (result.issues.length > 0) console.log("");

	for (const w of result.warnings) {
		console.log(yellow(`  ⚠ [${w.kind}] ${w.message}`));
		if (w.detail) console.log(dim(`    ${w.detail}`));
	}
	if (result.warnings.length > 0) console.log("");

	if (result.issues.length === 0 && result.warnings.length === 0) {
		console.log(green("✓ All clean. No issues or warnings."));
	} else {
		if (result.issues.length > 0) {
			console.log(red(`✗ ${result.issues.length} issue(s).`));
		}
		if (result.warnings.length > 0) {
			console.log(yellow(`⚠ ${result.warnings.length} warning(s).`));
		}
	}

	if (strict && result.warnings.length > 0) {
		console.log(red("\n--strict: treating warnings as errors."));
	}
}

/**
 * Display check results as machine-parseable JSON.
 */
function displayJson(result: CheckResult): void {
	console.log(JSON.stringify(result, null, 2));
}

/**
 * CLI entry point for check command.
 */
export function checkCommand(options?: CheckOptions): void {
	requireAradProject();

	const strict = options?.strict ?? false;
	const format = options?.format ?? "text";

	const result = runCheck(options?.context);

	if (format === "json") {
		displayJson(result);
	} else {
		displayText(result, strict);
	}

	// Exit codes
	if (result.issues.length > 0) {
		process.exit(1);
	}
	if (strict && result.warnings.length > 0) {
		process.exit(1);
	}
}
