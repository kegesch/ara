import { describe, expect, test } from "bun:test";
import { parseAdr } from "../src/commands/import";
import type { ImportedEntity } from "../src/commands/import";

// ─── Real-world ADR format samples ───

/**
 * These test cases represent real-world ADR formats found across GitHub
 * repositories. The goal is to validate A-012:
 *   "ADR markdown files follow a standard format with # title and ## Status sections"
 *
 * Sources of inspiration:
 * - joelparkerhenderson/architecture-decision-record
 * - adr/tools (github.com/adrguidance/adrguidance.github.io)
 * - Michael Nygard's original ADR template
 * - Various ADR formats seen in the wild
 */

// ─── Standard Nygard format (most common) ───

const NYGARD_ADR = `# 1. Use PostgreSQL as the primary database

## Status

Accepted

## Context

We need a reliable relational database that supports JSON queries.

## Decision

We will use PostgreSQL 15.

## Consequences

- Need to manage PostgreSQL instances
- Team needs to learn PostgreSQL-specific features
`;

const NYGARD_ADR_SUPERSEDED = `# 2. Use MongoDB for document storage

## Status

{superseded by 3}

## Context

We need a document store for unstructured data.

## Decision

We will use MongoDB.

## Consequences

- Schema flexibility
- No joins
`;

const NYGARD_ADR_SUPERSEDED_BY_LINK = `# 3. Use document storage in PostgreSQL

## Status

Superseded by [ADR 4](0004-use-jsonb.md)

## Context

We can use JSONB columns in PostgreSQL instead of a separate document store.

## Decision

Store documents in PostgreSQL JSONB columns.

## Consequences

- Simpler infrastructure
- May be slower for very large documents
`;

// ─── Numbered filename format (adr/tools style) ───

const ADR_TOOLS_FORMAT = `# Record architecture decisions

## Status

Accepted

## Context

We need to record the architecture decisions made on this project.

## Decision

We will use Architecture Decision Records, as described by Michael Nygard in this document: http://thinkrelevance.com/blog/2011/11/15/documenting-architecture-decisions

## Consequences

See Michael Nygard's article, linked above.
`;

// ─── ADR with proposed/pending status ───

const PROPOSED_ADR = `# Use event sourcing for order management

## Status

Proposed

## Context

Our current CRUD approach makes it hard to audit changes.

## Decision

We will implement event sourcing for the Order aggregate.

## Consequences

- Full audit trail
- More complex queries
- Need event versioning strategy
`;

const PENDING_ADR = `# Migrate to microservices

## Status

Pending review

## Context

The monolith is becoming hard to scale.

## Decision

Gradually extract services from the monolith.

## Consequences

- More operational complexity
- Better scalability
`;

// ─── ADR with deprecated status ───

const DEPRECATED_ADR = `# Use Redis for caching

## Status

Deprecated

## Context

We used Redis for HTTP response caching.

## Decision

Use Redis with a 5-minute TTL for all GET endpoints.

## Consequences

- Reduced database load
- Potential stale data for up to 5 minutes
`;

const REJECTED_ADR = `# Use NoSQL for all data

## Status

Rejected

## Context

Someone suggested using MongoDB for everything.

## Decision

We decided against this.

## Consequences

None.
`;

// ─── ADR without ## Status section (edge case) ───

const NO_STATUS_SECTION = `# Use environment variables for configuration

## Context

We need a way to configure the application without rebuilding.

## Decision

Use environment variables, validated at startup.

## Consequences

- Configuration is external to the application
- Need documentation of all variables
`;

// ─── ADR with title in filename but different heading ───

const DIFFERENT_TITLE_IN_FILE = `# Choose a caching strategy

## Status

Accepted

## Context

We need to cache frequently accessed data.

## Decision

Use a write-through cache with Redis.

## Consequences

- Data consistency
- Additional infrastructure
`;

// ─── ADR with extra metadata sections ───

const EXTENDED_ADR = `# 5. Implement circuit breaker pattern

Author: engineering-team
Date: 2024-03-15

## Status

Accepted

## Context

Our service calls to external APIs occasionally fail and cascade.

## Decision

Implement the circuit breaker pattern using resilience4j.

## Decision drivers

- External API reliability is outside our control
- Cascading failures affect availability

## Options considered

1. Retry with exponential backoff
2. Circuit breaker
3. Bulkhead pattern

## Decision outcome

Option 2 was chosen because it provides the best protection against cascading failures.

## Consequences

- External API failures are isolated
- Need to tune circuit breaker thresholds
`;

// ─── Minimal ADR (just title and body) ───

const MINIMAL_ADR = `# Use dark mode by default

Accepted — we will default to dark mode in the UI.
`;

// ─── ADR with various superseded spellings ───

const SUPERCEDED_TYPO = `# Use XML for config

## Status

Superceded by ADR-006

## Context

XML was the standard.

## Decision

Use XML config files.

## Consequences

- Verbose configuration
`;

const SUPERSEDED_UPPERCASE = `# Use YAML for config

## Status

SUPERSEDED

## Context

YAML is simpler.

## Decision

Use YAML config files.

## Consequences

- Cleaner config
`;

// ─── ADR with Status in different formats ───

const STATUS_WITH_INLINE_TEXT = `# Use Docker for deployment

## Status: Accepted

## Context

We need consistent deployment environments.

## Decision

Use Docker containers deployed to ECS.

## Consequences

- Environment consistency
- Need container orchestration
`;

const STATUS_MULTI_LINE = `# Use Terraform for infrastructure

## Status

This decision is currently **accepted** and has been implemented across all environments.

## Context

We need infrastructure as code.

## Decision

Use Terraform to manage all cloud resources.

## Consequences

- Reproducible infrastructure
- Need Terraform state management
`;

// ─── Filenames ───

// ──────────────────────────────────────────────

describe("ADR import: parseAdr", () => {
	// ─── Standard Nygard format ───

	test("parses standard Nygard ADR with numbered title", () => {
		const result = parseAdr(NYGARD_ADR, "0001-use-postgresql.md");
		expect(result.title).toBe("1. Use PostgreSQL as the primary database");
		expect(result.status).toBe("accepted");
		expect(result.body).toContain("We will use PostgreSQL 15");
	});

	test("detects superseded status with curly brace notation", () => {
		const result = parseAdr(NYGARD_ADR_SUPERSEDED, "0002-use-mongodb.md");
		expect(result.title).toBe("2. Use MongoDB for document storage");
		expect(result.status).toBe("superseded");
	});

	test("detects superseded status with link reference", () => {
		const result = parseAdr(NYGARD_ADR_SUPERSEDED_BY_LINK, "0003-use-jsonb.md");
		expect(result.title).toBe("3. Use document storage in PostgreSQL");
		expect(result.status).toBe("superseded");
	});

	// ─── Proposed / Pending ───

	test("detects proposed status", () => {
		const result = parseAdr(PROPOSED_ADR, "use-event-sourcing.md");
		expect(result.status).toBe("proposed");
	});

	test("detects pending status", () => {
		const result = parseAdr(PENDING_ADR, "migrate-to-microservices.md");
		expect(result.status).toBe("proposed");
	});

	// ─── Deprecated / Rejected ───

	test("detects deprecated status", () => {
		const result = parseAdr(DEPRECATED_ADR, "use-redis-caching.md");
		expect(result.status).toBe("deprecated");
	});

	test("detects rejected status", () => {
		const result = parseAdr(REJECTED_ADR, "use-nosql-for-all.md");
		expect(result.status).toBe("rejected");
	});

	// ─── Missing Status section ───

	test("defaults to accepted when no ## Status section exists", () => {
		const result = parseAdr(NO_STATUS_SECTION, "use-env-vars.md");
		expect(result.title).toBe("Use environment variables for configuration");
		expect(result.status).toBe("accepted");
	});

	// ─── Title extraction ───

	test("uses first # heading as title", () => {
		const result = parseAdr(DIFFERENT_TITLE_IN_FILE, "caching-strategy-2024.md");
		expect(result.title).toBe("Choose a caching strategy");
	});

	test("falls back to filename when no # heading exists", () => {
		const content = "This is just a paragraph with no heading.\n\nMore text.";
		const result = parseAdr(content, "some-decision.md");
		expect(result.title).toBe("some decision");
	});

	test("strips leading numbers and dashes from filename fallback", () => {
		const content = "No heading here.";
		const result = parseAdr(content, "0005-implement-circuit-breaker.md");
		expect(result.title).toBe("implement circuit breaker");
	});

	test("replaces underscores with spaces in filename fallback", () => {
		const content = "No heading here.";
		const result = parseAdr(content, "use_cache_for_performance.md");
		expect(result.title).toBe("use cache for performance");
	});

	// ─── Extended ADR with extra metadata ───

	test("parses ADR with extra metadata sections", () => {
		const result = parseAdr(EXTENDED_ADR, "0005-circuit-breaker.md");
		expect(result.title).toBe("5. Implement circuit breaker pattern");
		expect(result.status).toBe("accepted");
		expect(result.body).toContain("resilience4j");
		expect(result.body).toContain("Options considered");
	});

	// ─── Minimal ADR ───

	test("parses minimal ADR with no ## sections", () => {
		const result = parseAdr(MINIMAL_ADR, "dark-mode-default.md");
		expect(result.title).toBe("Use dark mode by default");
		expect(result.status).toBe("accepted");
	});

	// ─── Superseded variant spellings ───

	test("detects 'superceded' (common typo) as superseded", () => {
		const result = parseAdr(SUPERCEDED_TYPO, "use-xml-config.md");
		expect(result.status).toBe("superseded");
	});

	test("detects UPPERCASE 'SUPERSEDED' status", () => {
		const result = parseAdr(SUPERSEDED_UPPERCASE, "use-yaml-config.md");
		expect(result.status).toBe("superseded");
	});

	// ─── Status format variations ───

	test("handles 'Status: Accepted' inline format", () => {
		const result = parseAdr(STATUS_WITH_INLINE_TEXT, "use-docker-deployment.md");
		// The regex /^##\s*Status\s*$/mi won't match "## Status: Accepted"
		// So status should default to "accepted"
		expect(result.status).toBe("accepted");
	});

	test("extracts accepted from multi-line status with bold text", () => {
		const result = parseAdr(STATUS_MULTI_LINE, "use-terraform.md");
		// First non-empty line after ## Status is "This decision is currently **accepted**..."
		// The word "accepted" is present, so it should match
		expect(result.status).toBe("accepted");
	});

	// ─── Body preservation ───

	test("preserves full body content", () => {
		const result = parseAdr(NYGARD_ADR, "0001-use-postgresql.md");
		expect(result.body).toContain("## Context");
		expect(result.body).toContain("## Decision");
		expect(result.body).toContain("## Consequences");
		expect(result.body).toContain("Team needs to learn");
	});

	// ─── Edge cases with empty content ───

	test("handles empty content gracefully", () => {
		const result = parseAdr("", "empty-file.md");
		expect(result.title).toBe("empty file");
		expect(result.status).toBe("accepted");
		expect(result.body).toBe("");
	});

	test("handles content with only whitespace", () => {
		const result = parseAdr("   \n  \n  ", "whitespace-only.md");
		expect(result.title).toBe("whitespace only");
		expect(result.status).toBe("accepted");
	});

	// ─── adr/tools template ───

	test("parses adr/tools template format", () => {
		const result = parseAdr(ADR_TOOLS_FORMAT, "0001-record-architecture-decisions.md");
		expect(result.title).toBe("Record architecture decisions");
		expect(result.status).toBe("accepted");
		expect(result.body).toContain("Michael Nygard");
	});

	// ─── Filename edge cases ───

	test("handles filename without leading number", () => {
		const content = "No heading.";
		const result = parseAdr(content, "database-choice.md");
		expect(result.title).toBe("database choice");
	});

	test("handles filename with multiple leading digits and dash", () => {
		const content = "No heading.";
		const result = parseAdr(content, "0012-use-graphql-api.md");
		expect(result.title).toBe("use graphql api");
	});

	test("handles filename with underscores instead of dashes", () => {
		const content = "No heading.";
		const result = parseAdr(content, "0012_use_graphql_api.md");
		expect(result.title).toBe("use graphql api");
	});

	// ─── Status with extra whitespace ───

	test("handles ## Status with trailing whitespace", () => {
		const content = `# Use HTTPS everywhere

## Status    

Accepted

## Context

Security is important.
`;
		const result = parseAdr(content, "use-https.md");
		expect(result.status).toBe("accepted");
	});

	// ─── Mixed case Status heading ───

	test("handles ## STATUS (all caps) heading", () => {
		const content = `# Use rate limiting

## STATUS

Accepted

## Context

We need to protect against abuse.
`;
		const result = parseAdr(content, "rate-limiting.md");
		expect(result.status).toBe("accepted");
	});

	// ─── Status with additional text on the value line ───

	test("detects accepted when status line has extra text", () => {
		const content = `# Use blue-green deployments

## Status

Accepted - implemented in production

## Context

Zero-downtime deployments are required.
`;
		const result = parseAdr(content, "blue-green-deploy.md");
		expect(result.status).toBe("accepted");
	});

	// ─── Ensure body is trimmed ───

	test("body is trimmed of leading/trailing whitespace", () => {
		const content = `# Some decision

## Status

Accepted

Body here.
`;
		const result = parseAdr(content, "test.md");
		expect(result.body.startsWith("#")).toBe(true);
		expect(result.body.endsWith(".")).toBe(true);
	});
});
