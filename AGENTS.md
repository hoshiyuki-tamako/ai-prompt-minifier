# AGENTS.md

## Global Rules

- **Config**: Prefer data-driven values for configuration and constants.
- **Brevity**: Comment and respond as simply as possible to minimize token usage.
- **Tech Stack**: Pure HTML, JavaScript, and CSS only - no frameworks and no build tools.
- **No External Dependencies**: No external libraries, CDNs, or network calls, ever.
- **Single Entry**: Exactly one `index.html` entry point in the repository.
- **Offline First**: The app must keep working from `file://` - no ES modules, no fetch/XHR, no service worker.

### Git Commit Workflow

- **Atomicity**: ONE logical change per commit. Never bundle unrelated changes. If a task requires multiple distinct fixes/features, execute multiple separate commits.
- **Workflow**: ALWAYS `git add` and `git commit` after completing a logical unit of work. Never leave the working tree dirty at the end of a task.
- **Structure**: Strictly use Conventional Commits. Format: `<type>(<scope>): <description>`.
- **Allowed Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`.
- **AI Attribution**: MUST include `Co-authored-by: AI Agent <ai-agent[bot]@noreply.local>` in the commit footer to indicate AI generation.
- **Issue Linking**: If resolving a specific issue, append `Closes #<issue_number>` to the commit body.

Example:

```text
feat(auth): add JWT token refresh logic

Implemented automatic token refresh on 401 responses.
Added unit tests for the refresh interceptor.

Closes #42

Co-authored-by: AI Agent <ai-agent[bot]@noreply.local>
```

## Skills

- **Orientation**: `.ai/skills/apm-orientation/SKILL.md`
- **Unit Testing**: `.ai/skills/apm-unit-testing/SKILL.md`
- **Add Filter**: `.ai/skills/apm-add-filter/SKILL.md`
- **Verification**: `.ai/skills/apm-verification/SKILL.md` (integration - read after the domain skill, before commit)

## Skill Domain

- `scripts/tests/**` -> **Unit Testing**
- `scripts/filters/**` -> **Add Filter**
- `scripts/core/**`, `scripts/ui/**`, `styles/**`, `index.html`, `manifest.json` -> **Orientation**

## Knowledge

- **Agent Source**: `{PROJECT_ROOT}/.ai/knowledge/**/*`
- **App Contract**: `README.md`

## Features

- **Filter Pipeline**: an ordered recipe of nine filters (Minify, Output length limit, Strip HTML, Remove comments, Remove extra space, Remove emoji, Regex replace, Code minify, Dedup) applied to the input.
- **System Prompt Prefix**: an optional prefix placed above the input in the output, never minified.
- **Live I/O**: output updates live as you type, with character + token counters, a truncated badge, and copy to clipboard.
- **Saves**: named hard saves (prefix + recipe), debounced auto-resume, and JSON export/import of all saves.
- **Workspace UI**: three-column resizable layout, four themes, collapsible left rails with hover-peek.
- **Fully Offline**: runs from a double-clicked file with zero network access.

## Project Goal

Develop a single-page prompt minifier application optimized for 1-to-1 chat interfaces to bypass text length and token limits.
