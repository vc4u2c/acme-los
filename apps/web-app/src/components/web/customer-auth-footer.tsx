import * as React from 'react';

export function CustomerAuthFooter(): React.ReactElement {
  return (
    <footer className="border-t border-[var(--border)] bg-[color:var(--surface)/0.94] text-[var(--muted-foreground)]">
      <div className="site-shell py-6">
        <div className="rounded-[1.4rem] border border-[var(--border)] bg-[var(--surface-strong)] px-5 py-4 text-center text-sm shadow-lg shadow-[color:var(--shadow-soft)]">
          Copyright {new Date().getFullYear()} ACME LOS. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
