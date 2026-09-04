# Web Visual Design System

This document owns the durable visual direction for ACME LOS web experiences. Route-specific implementation remains in `apps/web-app`.

## Visual Thesis

ACME LOS is a calm, precise lending workspace with an editorial financial tone: warm enough to feel approachable, restrained enough that identity, disclosures, and application decisions stay unambiguous.

The source tokens in `apps/web-app/src/app/global.css` define the light and dark palettes, typography, focus treatment, surfaces, borders, brand green, and restrained gold accent. Extend those tokens deliberately instead of creating route-local palettes.

## Reference-To-Interface Workflow

1. Inspect the current route, adjacent flows, tokens, screenshots, and any supplied design reference.
2. Extract composition, hierarchy, material, typography, spacing, and interaction intent. Do not copy a third-party layout or asset literally.
3. State one visual thesis, one content hierarchy, and no more than three meaningful interactions before implementation.
4. Choose one dominant visual or workspace anchor. Remove copy, cards, and decoration that do not improve comprehension.
5. Iterate from full-page desktop and mobile screenshots, comparing composition and states rather than relying on DOM structure alone.

## Product Composition

- Operational journeys such as application, funding, account security, and customer profile use restrained, scan-friendly layouts with predictable navigation and clear primary actions.
- Cards represent repeated items, modals, or genuinely framed tools. Do not nest cards or turn every page section into a floating panel.
- Keep display typography for true page-level moments. Use compact headings inside forms, dashboards, sidebars, and inspectors.
- Use familiar icons for toolbar actions and clear text or icon-plus-text for business commands. Add tooltips for unfamiliar icon-only controls.
- Keep authentication and account-recovery surfaces focused on the current remediation, with explicit progress, error recovery, and a dependable route back to Sign in.

## Responsive And State Quality

- Define stable dimensions for fixed-format controls, boards, grids, toolbars, and counters so dynamic content cannot shift the layout.
- Let text wrap naturally and verify the longest realistic labels, errors, emails, and phone values at supported widths.
- Design loading, empty, validation, error, disabled, pending, success, timeout, and reauthentication states as first-class states.
- Preserve keyboard order, visible focus, sufficient contrast, reduced motion, semantic labels, and touch targets.
- Keep environment, identity, support-mode, and security indicators visible when required; visual polish must not obscure operational truth.

## Visual Acceptance

For material UI changes, capture desktop and mobile evidence with Playwright. Confirm no overlap or clipping, the primary workflow remains obvious, every interactive state is coherent, and supported browser projects retain equivalent behavior. Type checking and isolated component tests are not sufficient visual evidence.
