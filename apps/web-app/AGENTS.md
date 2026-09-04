<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## ACME LOS Web Rules

- Run `npm.cmd run harness:context` and read `docs/architecture/visual-design-system.md` before material UI work.
- Keep pages and layouts server-first. Add the smallest Client Component island required for browser state, events, Auth JS, animation, or canvas.
- Preserve the same-origin Next facade and BFF authority. Do not move identity, assurance, customer scope, or account mutation into browser-owned state.
- Reuse `@acme-los/ui-web`, Tailwind utilities, and tokens from `src/app/global.css` before adding primitives or literal colors.
- For authentication and account security, preserve canonical routes, explicit OTP actions, recoverable validation, fresh-step-up rules, and a working Sign in route.
- For material visual changes, verify desktop and mobile screenshots, text fit, keyboard and focus behavior, contrast, reduced motion, and all loading, empty, error, disabled, pending, and success states.
