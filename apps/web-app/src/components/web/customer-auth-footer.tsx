import * as React from 'react';

export function CustomerAuthFooter(): React.ReactElement {
  return (
    <footer className="border-t border-[var(--border)] bg-[color:var(--surface)/0.94] text-[var(--muted-foreground)]">
      <div className="site-shell py-6 text-center text-sm">
        <div>
          &copy; {new Date().getFullYear()} ACME LOS. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
