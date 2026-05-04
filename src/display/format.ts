// Terminal display formatting

import { getDescriptor, getDescriptorForId } from "../entities/registry";
import type { Entity } from "../types";

const C = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
};

const color = (code: string, text: string) => `${code}${text}${C.reset}`;
export const bold = (t: string) => color(C.bold, t);
export const dim = (t: string) => color(C.dim, t);
export const red = (t: string) => color(C.red, t);
export const green = (t: string) => color(C.green, t);
export const yellow = (t: string) => color(C.yellow, t);
export const cyan = (t: string) => color(C.cyan, t);
export const mag = (t: string) => color(C.magenta, t);

export function typeColor(type: string): string {
	return getDescriptor(type as any).ansiColor;
}

export function colorId(id: string): string {
	const desc = getDescriptorForId(id);
	return color(desc.ansiColor, id);
}

export function statusIcon(status: string): string {
	switch (status) {
		case "accepted":
		case "validated":
			return green("✓");
		case "proposed":
		case "draft":
		case "unvalidated":
			return yellow("○");
		case "deprecated":
		case "rejected":
		case "invalidated":
			return red("✗");
		case "superseded":
			return dim("→");
		case "explore":
		case "parked":
			return mag("💡");
		case "active":
			return green("👥");
		case "inactive":
			return dim("👥");
		case "identified":
			return yellow("⚠");
		case "mitigated":
			return green("✓");
		case "materialized":
			return red("⚠");
		case "closed":
			return dim("✓");
		default:
			return "·";
	}
}

export function formatEntityBrief(entity: Entity): string {
	const tc = typeColor(entity.type);
	const icon = statusIcon(entity.status);
	const id = color(tc, entity.id);
	const status = dim(`[${entity.status}]`);
	return `${icon} ${id} ${status} ${entity.title}`;
}

export function formatEntityList(entities: Entity[]): string {
	return entities.map(formatEntityBrief).join("\n");
}

export function formatEntityDetail(entity: Entity): string {
	const tc = typeColor(entity.type);
	const desc = getDescriptor(entity.type);
	const lines: string[] = [];

	lines.push(bold(`${entity.id}: ${entity.title}`));
	lines.push(
		`${color(tc, entity.type)} · ${statusIcon(entity.status)} ${entity.status} · ${entity.date}`,
	);

	if (entity.tags.length > 0) {
		lines.push(`tags: ${entity.tags.map((t) => mag(t)).join(", ")}`);
	}

	if (entity.context) {
		lines.push(`context: ${bold(entity.context)}`);
	}

	// Type-specific relations via descriptor
	for (const rel of desc.detailRelations(entity as any)) {
		const ids = Array.isArray(rel.ids)
			? rel.ids.map(colorId).join(", ")
			: colorId(rel.ids);
		const label =
			rel.style === "red" ? red(rel.label) : rel.label;
		lines.push(`${label}: ${ids}`);
	}

	if (entity.body) {
		lines.push("");
		lines.push(dim("─".repeat(50)));
		lines.push(entity.body);
	}

	return lines.join("\n");
}

/**
 * Format a trace tree with Unicode box-drawing characters.
 */
export function formatTraceTree(
	node: {
		entity: Entity;
		edgeType: string;
		children: Array<{ entity: Entity; edgeType: string; children: unknown[] }>;
	},
	prefix: string = "",
	isLast: boolean = true,
	isRoot: boolean = true,
): string[] {
	const lines: string[] = [];
	const { entity, edgeType, children } = node;
	const tc = typeColor(entity.type);
	const icon = statusIcon(entity.status);

	let connector = "";
	if (!isRoot) {
		connector = isLast ? "└── " : "├── ";
	}

	const edgeLabel = edgeType !== "root" ? dim(`[${edgeType}] `) : "";
	lines.push(
		`${prefix}${connector}${icon} ${color(tc, entity.id)} ${entity.title} ${edgeLabel}`,
	);

	const childPrefix = isRoot ? "" : isLast ? "    " : "│   ";

	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		const childLines = formatTraceTree(
			child as any,
			prefix + childPrefix,
			i === children.length - 1,
			false,
		);
		lines.push(...childLines);
	}

	return lines;
}
