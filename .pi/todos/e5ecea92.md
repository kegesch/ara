{
  "id": "e5ecea92",
  "title": "Improvement: suppress or indicate template placeholder text in entity bodies",
  "tags": [
    "ux",
    "polish"
  ],
  "status": "done",
  "created_at": "2026-05-05T20:30:25.647Z"
}

## Context

Most entities have boilerplate bodies like:

```
## Context
(What is the issue motivating this decision?)

## Decision
(What is the change being proposed or made?)
```

When running `arad show D-001`, these placeholders add noise. They look like content but convey nothing.

## Options

1. **Suppress**: `show` could detect placeholder patterns `(What is ...)` or `(Describe ...)` and hide those sections
2. **Mark**: Add a visual indicator like `∅` or dim the placeholder text so it's clearly not real content
3. **Prompt**: During `arad add`, actually open an editor or prompt for body content instead of inserting templates
4. **Skip in show**: Only show non-empty body sections in `show` output
