---
name: frontend-design
description: Plan, implement, and visually verify distinctive production-grade ACME LOS web and mobile interfaces. Use for pages, app shells, dashboards, account and application journeys, responsive layout, design-system changes, screenshots, reference-driven UI, or refinements where visual quality, accessibility, and product behavior matter together.
---

# Frontend Design

Create calm, precise lending experiences that feel intentionally designed without turning operational workflows into generic marketing UI.

## Read Before Designing

1. Run `npm.cmd run harness:context`.
2. For web work, read `apps/web-app/AGENTS.md`, `docs/architecture/visual-design-system.md`, the affected route and adjacent journey, shared components, and `apps/web-app/src/app/global.css`.
3. Read relevant version-pinned Next.js documentation under `node_modules/next/dist/docs/` before changing framework behavior.
4. Inspect every supplied screenshot, video, or design reference. Extract composition, hierarchy, material, typography, spacing, and interaction intent; do not copy a third-party layout or asset literally.

## Frame The Design

Before coding, state:

- **visual thesis:** one sentence for mood, material, and energy;
- **content hierarchy:** the one job and takeaway for each section or workspace region; and
- **interaction thesis:** no more than three interactions that improve orientation, trust, or action.

Name the visual vocabulary explicitly and reject generic patterns that conflict with it. Choose one dominant visual or workspace anchor, preserve intentional negative space, and remove elements that do not improve comprehension.

## Compose For The Product

- Treat each viewport as one composition with a clear primary action and readable planes.
- For application, funding, profile, and security screens, favor a primary workspace plus necessary context. Keep them restrained, scan-friendly, and predictable.
- Use cards only for repeated items, modals, or genuinely framed tools. Do not nest cards or make page sections float by default.
- Reserve display type for real page-level moments. Use compact headings and stable dimensions inside forms, dashboards, sidebars, inspectors, boards, and toolbars.
- Use familiar icons for tool actions and clear text or icon-plus-text for business commands. Add tooltips to unfamiliar icon-only controls.
- Keep authentication and recovery focused on the current remediation. Preserve explicit OTP actions, business-friendly labels, useful validation, and a dependable Sign in route.
- Do not add decorative orbs, one-note palettes, generic SaaS hero mosaics, or visual effects that obscure lending content or security state.

## Implement In The Existing Stack

- Keep Next.js pages and layouts as Server Components by default. Add the smallest Client Component island for browser state, event handlers, Auth JS, animation, canvas, or Three.js.
- Reuse `@acme-los/ui-web`, Tailwind utilities, CSS variables, shared shells, Lucide icons, and semantic HTML before adding dependencies or primitives.
- Preserve BFF ownership of identity, assurance, customer scope, sensitive mutations, and minimized DTOs. Visual work must not weaken server boundaries.
- For mobile, reuse the Expo, NativeWind, and shared mobile UI patterns without forcing web-only layout or Radix assumptions into React Native.
- Use optimized raster assets for inspectable product imagery and code-native geometry for diagrams. Record asset provenance and never use customer documents or personal data as generation input.
- Honor reduced motion and keep animation limited to hierarchy, orientation, or causal feedback.

## State Matrix

Design and verify:

- default, hover, focus, active, selected, and disabled controls;
- loading, empty, validation, pending, success, timeout, stale-session, and service-error states;
- realistic long names, email addresses, phone values, identifiers, and error copy;
- keyboard order, visible focus, semantic names, contrast, touch targets, and reduced motion;
- light and dark themes where the route supports both.

## Visual Verification

1. Start the real app or production-equivalent Playwright server.
2. Capture full-page desktop and mobile screenshots for the changed route and adjacent transitions.
3. Compare screenshots with the visual thesis and reference. Inspect overlap, clipping, text fit, safe negative space, hierarchy, and primary-action clarity.
4. Exercise the state matrix and supported browser projects. For canvas or 3D, also verify nonblank pixels, framing, motion, input, and fallback behavior.
5. Run the applicable build, accessibility, and Playwright gates. Do not call a material visual change complete from type checking or unit tests alone.

Deliver the implemented outcome, visual decisions, viewport evidence, checks run, and any untested browser, device, or accessibility boundary.
