# ui-web

Shared web UI foundation for the Next.js app.

Current exports:

- `Button`
- `buttonVariants`
- `cn`

Project config:

- root `components.json` is present for shadcn CLI compatibility
- `shadcn` is installed as a dev dependency
- `@radix-ui/react-slot` is installed for the standard shadcn `asChild` pattern

The intent is to keep this library aligned with shadcn-style composition:

- Tailwind-first primitives
- `class-variance-authority` variants
- `cn()` utility with `clsx` and `tailwind-merge`
- Radix Slot-based composition

Import from:

```ts
import { Button, cn } from '@acme-los/ui-web';
```
