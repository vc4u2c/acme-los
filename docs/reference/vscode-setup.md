# VS Code Setup

This doc captures the VS Code extensions and editor setup that are useful for
working in this repo.

This pass was updated from the local extension folders under
`%USERPROFILE%\.vscode\extensions` on April 23, 2026. Where multiple versions
of the same extension were present, this doc keeps the extension id once and
ignores the duplicate version folders.

## Core Repo Recommendations

Current workspace recommendations in
[.vscode/extensions.json](../../.vscode/extensions.json):

- `nrwl.angular-console`
  - Nx workspace graph, generators, and project awareness
- `esbenp.prettier-vscode`
  - Prettier formatting for TS, MD, JSON, YAML, and CSS
- `dbaeumer.vscode-eslint`
  - ESLint diagnostics and fix-on-save support
- `ms-playwright.playwright`
  - Playwright test integration for the web E2E suite
- `firsttris.vscode-jest-runner`
  - Jest test runner support
- `bierner.markdown-mermaid`
  - Mermaid rendering in Markdown preview

## Installed Extensions With Strong Repo Fit

These are installed locally and match the repo well even if they are not all
committed as workspace recommendations yet.

### Frontend, Nx, and day-to-day editing

- `bradlc.vscode-tailwindcss`
  - Tailwind class completion and class-name inspection for the web app
- `editorconfig.editorconfig`
  - Keeps indentation and newline behavior aligned with repo config
- `christian-kohler.path-intellisense`
  - Faster path completion when moving around the monorepo
- `usernamehw.errorlens`
  - Surfaces TypeScript and lint issues inline while editing
- `eamodio.gitlens`
  - Helpful blame, history, and change inspection during reviews and refactors

### Azure, infra, and platform work

- `ms-azuretools.vscode-bicep`
  - Best fit for the Bicep assets under `infra/azure`
- `hashicorp.terraform`
  - Standard Terraform and HCL support
- `4ops.terraform`
  - Also installed locally; keep only if you prefer its Terraform editing aids
- `ms-vscode.azurecli`
  - Useful for Azure CLI command authoring and output inspection
- `ms-vscode.powershell`
  - Strong fit for the repo's PowerShell-heavy Azure scripts
- `redhat.vscode-yaml`
  - YAML validation for workflows, manifests, and config files
- `ms-azuretools.azure-dev`
  - Helpful when working with Azure Developer CLI workflows
- `ms-azuretools.vscode-docker`
  - Container build and image workflow support
- `ms-azuretools.vscode-containers`
  - Container explorer and runtime inspection
- `ms-vscode-remote.remote-containers`
  - Useful if you work in dev containers
- `ms-vscode-remote.remote-wsl`
  - Useful if part of your workflow runs in WSL
- `ms-kubernetes-tools.vscode-kubernetes-tools`
  - Useful for cluster and manifest work around ACA-adjacent debugging

### Testing, APIs, and repo operations

- `github.vscode-github-actions`
  - Handy for GitHub Actions workflow inspection
- `rangav.vscode-thunder-client`
  - Useful for manual API checks against local and dev endpoints

### Optional AI and helper tooling

- `anthropic.claude-code`
  - Optional if you want Claude Code available in VS Code
- `openai.chatgpt`
  - Optional if you want OpenAI chat tooling in VS Code
- `ms-python.python`
  - Useful for occasional local scripts and tooling
- `ms-python.vscode-pylance`
  - Python language intelligence
- `ms-python.debugpy`
  - Python debugging support

## Installed But Not Repo-Critical

These are present locally but are more personal or adjacent than repo-specific:

- `dsznajder.es7-react-js-snippets`
- `rettimo.nextjs-vscode-snippets`
- `angular.ng-template`
- `eraserlabs.eraserlabs`

## Why Mermaid Still Matters Here

This repo includes Mermaid diagrams in:

- [docs/architecture/auth-server-flows.md](../architecture/auth-server-flows.md)

If Mermaid is not rendered in preview, you will see the raw fenced code block
instead of the diagram.

## Helpful VS Code Behaviors

- restart the TypeScript server if red squiggles look wrong after large refactors
- reload the window if Markdown preview or generated type files look stale
- prefer the normal Markdown preview when checking Mermaid docs
- if duplicate extension versions accumulate locally, remove stale folders and
  keep the latest installed version only

## Related Docs

- [Tech stack and tooling](./tech-stack.md)
- [Workspace commands](../getting-started/workspace-commands.md)
