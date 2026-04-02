# VS Code Setup

This doc captures the VS Code extensions and editor setup that are useful for working in this repo.

I could not reliably enumerate every recently installed extension from the shell because `code --list-extensions` returned no output in this environment. So this doc records the repo-recommended set plus the Mermaid preview extension you explicitly installed.

Recently added during this docs pass:

- `bierner.markdown-mermaid`
  - needed so the Mermaid auth-flow diagrams render in local Markdown preview

## Recommended Extensions

Current repo recommendations in [.vscode/extensions.json](../../.vscode/extensions.json):

- `nrwl.angular-console`
  - Nx graph, generators, and workspace support
- `esbenp.prettier-vscode`
  - Prettier formatting
- `dbaeumer.vscode-eslint`
  - ESLint diagnostics and fixes
- `ms-playwright.playwright`
  - Playwright test integration
- `firsttris.vscode-jest-runner`
  - Jest test runner support
- `bierner.markdown-mermaid`
  - Mermaid rendering in Markdown preview

## Why Mermaid Matters Here

This repo now includes Mermaid diagrams in:

- [docs/architecture/auth-server-flows.md](../architecture/auth-server-flows.md)

If Mermaid is not rendered in preview, you will see the raw fenced code block instead of the diagram.

## Helpful VS Code Behaviors

- restart the TypeScript server if red squiggles look wrong after large refactors
- reload the window if Markdown preview or generated type files look stale
- prefer the normal Markdown preview when checking Mermaid docs

## Related Docs

- [Tech stack and tooling](./tech-stack.md)
- [Workspace commands](../getting-started/workspace-commands.md)
