# ui-web

Shared web UI foundation for the Next.js app.

Current exports:

- `Button`
- `buttonVariants`
- `cn`

The intent is to keep this library aligned with shadcn-style composition:

- Tailwind-first primitives
- `class-variance-authority` variants
- `cn()` utility with `clsx` and `tailwind-merge`

Import from:

```ts
import { Button, cn } from '@acme-los/ui-web';
```
