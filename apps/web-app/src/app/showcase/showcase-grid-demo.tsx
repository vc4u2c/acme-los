'use client';

import * as React from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  type ColumnDef,
  type ColumnFiltersState,
  type ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  getSortedRowModel,
  type Table,
  useReactTable,
} from '@tanstack/react-table';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronUp,
  RotateCcw,
  Send,
  Trash2,
} from 'lucide-react';
import {
  Button,
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@acme-los/ui-web';
import { createWebApiClient } from '@acme-los/api/web-client';
import { createBrowserLogScope } from '../../lib/observability/browser-trace-logger';
import {
  showcaseGridOfficerOptions,
  showcaseGridProductOptions,
  showcaseGridRegionOptions,
  type ShowcaseGridQueryResponse,
  type ShowcaseGridRow,
  showcaseGridRiskGradeOptions,
  showcaseGridStatusOptions,
  type ShowcaseGridStatus,
} from '../../lib/showcase-grid';

type ShowcaseGridSubmitResponse = {
  acceptedAt: string;
  correlationId: string;
  emittedEvents: string[];
  eventName: string;
  incomingTraceparent: string;
  parentSpanId: string;
  route: string;
  serverSpanId: string;
  serverTraceparent: string;
  traceFlags: string;
  traceId: string;
};

type EditableGridField =
  | 'amount'
  | 'borrower'
  | 'ltv'
  | 'officer'
  | 'product'
  | 'rate'
  | 'region'
  | 'riskGrade'
  | 'status';

type GridDemoTab = 'editable' | 'readonly' | 'collapsible' | 'filters';

const showcaseRoute = '/showcase';
const gridDemoTabs: Array<{ id: GridDemoTab; label: string }> = [
  { id: 'editable', label: 'Editable' },
  { id: 'readonly', label: 'Read-only sorting' },
  { id: 'collapsible', label: 'Collapsible' },
  { id: 'filters', label: 'Column filters' },
];
const currencyFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 0,
  style: 'currency',
});

function useDebouncedValue<TValue>(value: TValue, delayMs: number): TValue {
  const [debouncedValue, setDebouncedValue] = React.useState(value);

  React.useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);

  return debouncedValue;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function SortIndicator({
  direction,
}: {
  direction: false | 'asc' | 'desc';
}): React.ReactElement {
  if (direction === 'asc') {
    return <ChevronUp aria-hidden="true" className="h-3.5 w-3.5" />;
  }

  if (direction === 'desc') {
    return <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />;
  }

  return <span aria-hidden="true" className="h-3.5 w-3.5" />;
}

function TextEditCell({
  ariaLabel,
  onCommit,
  value,
}: {
  ariaLabel: string;
  onCommit: (value: string) => void;
  value: string;
}): React.ReactElement {
  const [draftValue, setDraftValue] = React.useState(value);

  React.useEffect(() => {
    setDraftValue(value);
  }, [value]);

  function commitValue() {
    const trimmedValue = draftValue.trim();

    if (trimmedValue && trimmedValue !== value) {
      onCommit(trimmedValue);
    }
  }

  return (
    <Input
      aria-label={ariaLabel}
      value={draftValue}
      onBlur={commitValue}
      onChange={(event) => setDraftValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
      }}
      className="h-9 min-w-[13rem] border-[var(--border)] bg-[var(--surface)]"
    />
  );
}

function NumberEditCell({
  ariaLabel,
  max,
  min,
  onCommit,
  step,
  value,
}: {
  ariaLabel: string;
  max: number;
  min: number;
  onCommit: (value: number) => void;
  step: number;
  value: number;
}): React.ReactElement {
  const [draftValue, setDraftValue] = React.useState(String(value));

  React.useEffect(() => {
    setDraftValue(String(value));
  }, [value]);

  function commitValue() {
    const parsedValue = Number(draftValue);

    if (!Number.isFinite(parsedValue)) {
      setDraftValue(String(value));
      return;
    }

    const nextValue = clampNumber(parsedValue, min, max);
    setDraftValue(String(nextValue));

    if (nextValue !== value) {
      onCommit(nextValue);
    }
  }

  return (
    <Input
      aria-label={ariaLabel}
      inputMode="decimal"
      max={max}
      min={min}
      step={step}
      type="number"
      value={draftValue}
      onBlur={commitValue}
      onChange={(event) => setDraftValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
      }}
      className="h-9 min-w-[7.5rem] border-[var(--border)] bg-[var(--surface)]"
    />
  );
}

function GridSelectCell<TOption extends string>({
  ariaLabel,
  onValueChange,
  options,
  value,
}: {
  ariaLabel: string;
  onValueChange: (value: TOption) => void;
  options: readonly TOption[];
  value: TOption;
}): React.ReactElement {
  return (
    <Select
      value={value}
      onValueChange={(nextValue) => onValueChange(nextValue as TOption)}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className="h-9 min-w-[9.5rem] border-[var(--border)] bg-[var(--surface)]"
      >
        <SelectValue placeholder={value} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StatusPill({
  status,
}: {
  status: ShowcaseGridStatus;
}): React.ReactElement {
  const statusClassName =
    status === 'Funded'
      ? 'border-[rgba(17,98,67,0.24)] bg-[rgba(17,98,67,0.12)] text-[var(--brand)]'
      : status === 'Approved'
        ? 'border-[rgba(214,176,95,0.36)] bg-[rgba(214,176,95,0.18)] text-[var(--accent-ink)]'
        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]';

  return (
    <span
      className={`inline-flex min-w-24 justify-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClassName}`}
    >
      {status}
    </span>
  );
}

function QueryMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
        {label}
      </p>
      <p className="mt-1 font-mono text-sm text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function getGridDemoTabClassName(isActive: boolean): string {
  return [
    'inline-flex min-h-10 cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]',
    isActive
      ? 'border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-contrast)]'
      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-accent)]',
  ].join(' ');
}

function GridTableHeader<TData>({
  table,
}: {
  table: Table<TData>;
}): React.ReactElement {
  return (
    <thead>
      {table.getHeaderGroups().map((headerGroup) => (
        <tr key={headerGroup.id} className="border-b border-[var(--border)]">
          {headerGroup.headers.map((header) => (
            <th
              key={header.id}
              colSpan={header.colSpan}
              className="bg-[var(--surface-strong)] px-3 py-3 align-bottom text-xs font-semibold uppercase text-[var(--muted-foreground)]"
            >
              {header.isPlaceholder ? null : header.column.getCanSort() ? (
                <button
                  type="button"
                  onClick={header.column.getToggleSortingHandler()}
                  className="flex w-full items-center gap-2 text-left"
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                  <SortIndicator direction={header.column.getIsSorted()} />
                </button>
              ) : (
                <div className="flex w-full items-center gap-2 text-left">
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                </div>
              )}
            </th>
          ))}
        </tr>
      ))}
    </thead>
  );
}

function EmptyGridRow({
  colSpan,
  message,
}: {
  colSpan: number;
  message: string;
}): React.ReactElement {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-4 py-10 text-center text-sm text-[var(--muted-foreground)]"
      >
        {message}
      </td>
    </tr>
  );
}

function buildGridUrl({
  deletedRowIds,
  filter,
  pageIndex,
  pageSize,
  sorting,
  status,
}: {
  deletedRowIds: string[];
  filter: string;
  pageIndex: number;
  pageSize: number;
  sorting: SortingState;
  status: ShowcaseGridStatus | 'all';
}): string {
  const [primarySort] = sorting;
  const searchParams = new URLSearchParams({
    deletedIds: deletedRowIds.join(','),
    filter,
    pageIndex: String(pageIndex),
    pageSize: String(pageSize),
    status,
  });

  if (primarySort) {
    searchParams.set('sortId', primarySort.id);
    searchParams.set('sortDesc', String(primarySort.desc));
  }

  return `/api/showcase/grid?${searchParams.toString()}`;
}

async function fetchGridRows({
  deletedRowIds,
  filter,
  pageIndex,
  pageSize,
  sorting,
  status,
}: {
  deletedRowIds: string[];
  filter: string;
  pageIndex: number;
  pageSize: number;
  sorting: SortingState;
  status: ShowcaseGridStatus | 'all';
}): Promise<ShowcaseGridQueryResponse> {
  const response = await fetch(
    buildGridUrl({
      deletedRowIds,
      filter,
      pageIndex,
      pageSize,
      sorting,
      status,
    }),
  );

  if (!response.ok) {
    throw new Error(`Grid query failed with status ${response.status}`);
  }

  return (await response.json()) as ShowcaseGridQueryResponse;
}

async function postShowcaseGridSubmission({
  deletedRowIds,
  editedRows,
  filter,
  pageIndex,
  pageSize,
  sorting,
  status,
}: {
  deletedRowIds: string[];
  editedRows: ShowcaseGridRow[];
  filter: string;
  pageIndex: number;
  pageSize: number;
  sorting: SortingState;
  status: ShowcaseGridStatus | 'all';
}): Promise<ShowcaseGridSubmitResponse> {
  const logScope = createBrowserLogScope({ route: showcaseRoute });
  const csrfToken = await createWebApiClient().security.getCsrfToken();

  logScope.logger.info(
    'showcase.grid.submit.browser',
    'Submitting bounded showcase grid edits.',
    {
      deletedRowCount: deletedRowIds.length,
      editedRowCount: editedRows.length,
      eventName: 'showcase.grid.submit',
    },
  );

  const response = await fetch('/api/observability/events', {
    body: JSON.stringify({
      eventName: 'showcase.grid.submit',
      gridSubmission: {
        deletedRowIds,
        editedRows: editedRows.map((row) => ({
          amount: row.amount,
          borrower: row.borrower,
          id: row.id,
          ltv: row.ltv,
          officer: row.officer,
          product: row.product,
          rate: row.rate,
          region: row.region,
          riskGrade: row.riskGrade,
          status: row.status,
        })),
        submittedAt: new Date().toISOString(),
        visibleQuery: {
          filter,
          pageIndex,
          pageSize,
          sorting: sorting.slice(0, 1).map((sort) => ({
            desc: sort.desc,
            id: sort.id,
          })),
          status,
        },
      },
      route: showcaseRoute,
    }),
    headers: {
      'content-type': 'application/json',
      ...logScope.headers,
      'x-csrf-token': csrfToken,
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Grid submission failed with status ${response.status}`);
  }

  return (await response.json()) as ShowcaseGridSubmitResponse;
}

function ReadOnlySortableGrid({
  rows,
}: {
  rows: ShowcaseGridRow[];
}): React.ReactElement {
  const [sorting, setSorting] = React.useState<SortingState>([
    { desc: true, id: 'amount' },
  ]);

  const columns = React.useMemo<ColumnDef<ShowcaseGridRow>[]>(
    () => [
      {
        header: 'Borrower package',
        columns: [
          {
            accessorKey: 'id',
            header: 'Deal',
            cell: ({ getValue }) => (
              <span className="font-mono text-xs font-semibold text-[var(--foreground)]">
                {getValue<string>()}
              </span>
            ),
          },
          {
            accessorKey: 'borrower',
            header: 'Borrower',
          },
          {
            accessorKey: 'industry',
            header: 'Industry',
          },
          {
            accessorKey: 'state',
            header: 'State',
          },
        ],
      },
      {
        header: 'Request',
        columns: [
          {
            accessorKey: 'product',
            header: 'Product',
          },
          {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => <StatusPill status={row.original.status} />,
          },
        ],
      },
      {
        header: 'Credit snapshot',
        columns: [
          {
            accessorKey: 'amount',
            header: 'Amount',
            cell: ({ getValue }) =>
              currencyFormatter.format(getValue<number>()),
          },
          {
            accessorKey: 'annualRevenue',
            header: 'Revenue',
            cell: ({ getValue }) =>
              currencyFormatter.format(getValue<number>()),
          },
          {
            accessorKey: 'requestedTermMonths',
            header: 'Term',
            cell: ({ getValue }) => `${getValue<number>()} mo`,
          },
          {
            accessorKey: 'rate',
            header: 'Rate',
            cell: ({ getValue }) => `${getValue<number>().toFixed(2)}%`,
          },
          {
            accessorKey: 'debtServiceCoverage',
            header: 'DSCR',
            cell: ({ getValue }) => getValue<number>().toFixed(2),
          },
          {
            accessorKey: 'ltv',
            header: 'LTV',
            cell: ({ getValue }) => `${getValue<number>()}%`,
          },
          {
            accessorKey: 'riskGrade',
            header: 'Risk',
          },
        ],
      },
      {
        header: 'Delivery',
        columns: [
          {
            accessorKey: 'officer',
            header: 'Officer',
          },
          {
            accessorKey: 'region',
            header: 'Region',
          },
          {
            accessorKey: 'updatedAt',
            header: 'Updated',
            cell: ({ getValue }) => (
              <span className="whitespace-nowrap font-mono text-xs text-[var(--muted-foreground)]">
                {getValue<string>()}
              </span>
            ),
          },
        ],
      },
    ],
    [],
  );

  const table = useReactTable({
    columns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  });

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[color:var(--surface)/0.92] shadow-xl shadow-[color:var(--shadow-soft)]">
      <div className="overflow-x-auto">
        <table
          className="min-w-[112rem] border-collapse text-left"
          data-testid="showcase-grid-readonly-table"
        >
          <GridTableHeader table={table} />
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-[var(--border)] transition-colors hover:bg-[var(--surface-accent)]"
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="px-3 py-3 align-middle text-sm text-[var(--foreground)]"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 ? (
              <EmptyGridRow
                colSpan={table.getAllLeafColumns().length}
                message="No lending records match the current server query."
              />
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="border-t border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
        Read-only view / {table.getRowModel().rows.length} rows
      </div>
    </div>
  );
}

function CollapsibleGrid({
  rows,
}: {
  rows: ShowcaseGridRow[];
}): React.ReactElement {
  const [expanded, setExpanded] = React.useState<ExpandedState>({});

  const columns = React.useMemo<ColumnDef<ShowcaseGridRow>[]>(
    () => [
      {
        id: 'expand',
        enableSorting: false,
        header: 'Open',
        cell: ({ row }) => (
          <Button
            aria-label={
              row.getIsExpanded()
                ? `Collapse ${row.original.id}`
                : `Expand ${row.original.id}`
            }
            type="button"
            variant="ghost"
            size="sm"
            onClick={row.getToggleExpandedHandler()}
            className="h-8 w-8 rounded-md p-0"
          >
            {row.getIsExpanded() ? (
              <ChevronDown aria-hidden="true" className="h-4 w-4" />
            ) : (
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            )}
          </Button>
        ),
      },
      {
        accessorKey: 'id',
        header: 'Deal',
        cell: ({ getValue }) => (
          <span className="font-mono text-xs font-semibold text-[var(--foreground)]">
            {getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: 'borrower',
        header: 'Borrower',
      },
      {
        accessorKey: 'industry',
        header: 'Industry',
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusPill status={row.original.status} />,
      },
      {
        accessorKey: 'collateral',
        header: 'Collateral',
      },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ getValue }) => currencyFormatter.format(getValue<number>()),
      },
      {
        accessorKey: 'nextMilestone',
        header: 'Next milestone',
      },
    ],
    [],
  );

  const table = useReactTable({
    columns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
    onExpandedChange: setExpanded,
    state: {
      expanded,
    },
  });

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[color:var(--surface)/0.92] shadow-xl shadow-[color:var(--shadow-soft)]">
      <div className="overflow-x-auto">
        <table
          className="min-w-[84rem] border-collapse text-left"
          data-testid="showcase-grid-collapsible-table"
        >
          <GridTableHeader table={table} />
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <React.Fragment key={row.id}>
                <tr className="border-b border-[var(--border)] transition-colors hover:bg-[var(--surface-accent)]">
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-3 py-3 align-middle text-sm text-[var(--foreground)]"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
                {row.getIsExpanded() ? (
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-strong)]">
                    <td colSpan={row.getVisibleCells().length} className="p-4">
                      <div className="grid gap-3 text-sm text-[var(--foreground)] md:grid-cols-4">
                        <QueryMetric
                          label="Revenue"
                          value={currencyFormatter.format(
                            row.original.annualRevenue,
                          )}
                        />
                        <QueryMetric
                          label="Covenant"
                          value={row.original.covenant}
                        />
                        <QueryMetric
                          label="Credit"
                          value={`DSCR ${row.original.debtServiceCoverage.toFixed(
                            2,
                          )} / ${row.original.requestedTermMonths} mo`}
                        />
                        <QueryMetric
                          label="Exposure"
                          value={`${currencyFormatter.format(
                            row.original.amount,
                          )} at ${row.original.rate}%`}
                        />
                      </div>
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            ))}
            {table.getRowModel().rows.length === 0 ? (
              <EmptyGridRow
                colSpan={table.getAllLeafColumns().length}
                message="No lending records match the current server query."
              />
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ColumnFilteringGrid({
  rows,
}: {
  rows: ShowcaseGridRow[];
}): React.ReactElement {
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [sorting, setSorting] = React.useState<SortingState>([
    { desc: false, id: 'borrower' },
  ]);

  const columns = React.useMemo<ColumnDef<ShowcaseGridRow>[]>(
    () => [
      {
        accessorKey: 'id',
        header: 'Deal',
        cell: ({ getValue }) => (
          <span className="font-mono text-xs font-semibold text-[var(--foreground)]">
            {getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: 'borrower',
        header: 'Borrower',
      },
      {
        accessorKey: 'industry',
        header: 'Industry',
      },
      {
        accessorKey: 'product',
        header: 'Product',
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusPill status={row.original.status} />,
      },
      {
        accessorKey: 'officer',
        header: 'Officer',
      },
      {
        accessorKey: 'region',
        header: 'Region',
      },
      {
        accessorKey: 'state',
        header: 'State',
      },
      {
        accessorKey: 'riskGrade',
        header: 'Risk',
      },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ getValue }) => currencyFormatter.format(getValue<number>()),
      },
      {
        accessorKey: 'debtServiceCoverage',
        header: 'DSCR',
        cell: ({ getValue }) => getValue<number>().toFixed(2),
      },
    ],
    [],
  );

  const industryOptions = React.useMemo(
    () => Array.from(new Set(rows.map((row) => row.industry))).sort(),
    [rows],
  );

  const table = useReactTable({
    columns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    state: {
      columnFilters,
      sorting,
    },
  });

  const borrowerFilter =
    (table.getColumn('borrower')?.getFilterValue() as string | undefined) ?? '';
  const productFilter =
    (table.getColumn('product')?.getFilterValue() as string | undefined) ??
    'all';
  const industryFilter =
    (table.getColumn('industry')?.getFilterValue() as string | undefined) ??
    'all';
  const regionFilter =
    (table.getColumn('region')?.getFilterValue() as string | undefined) ??
    'all';

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[minmax(14rem,1fr)_13rem_13rem_13rem_auto]">
        <label className="grid gap-1.5">
          <span className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
            Borrower column
          </span>
          <Input
            value={borrowerFilter}
            onChange={(event) =>
              table.getColumn('borrower')?.setFilterValue(event.target.value)
            }
            placeholder="Filter borrowers"
            className="border-[var(--border)] bg-[var(--surface)]"
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
            Industry column
          </span>
          <Select
            value={industryFilter}
            onValueChange={(nextIndustry) =>
              table
                .getColumn('industry')
                ?.setFilterValue(
                  nextIndustry === 'all' ? undefined : nextIndustry,
                )
            }
          >
            <SelectTrigger className="border-[var(--border)] bg-[var(--surface)]">
              <SelectValue
                placeholder={
                  industryFilter === 'all' ? 'All industries' : industryFilter
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All industries</SelectItem>
              {industryOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="grid gap-1.5">
          <span className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
            Product column
          </span>
          <Select
            value={productFilter}
            onValueChange={(nextProduct) =>
              table
                .getColumn('product')
                ?.setFilterValue(
                  nextProduct === 'all' ? undefined : nextProduct,
                )
            }
          >
            <SelectTrigger className="border-[var(--border)] bg-[var(--surface)]">
              <SelectValue
                placeholder={
                  productFilter === 'all' ? 'All products' : productFilter
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All products</SelectItem>
              {showcaseGridProductOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="grid gap-1.5">
          <span className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
            Region column
          </span>
          <Select
            value={regionFilter}
            onValueChange={(nextRegion) =>
              table
                .getColumn('region')
                ?.setFilterValue(nextRegion === 'all' ? undefined : nextRegion)
            }
          >
            <SelectTrigger className="border-[var(--border)] bg-[var(--surface)]">
              <SelectValue
                placeholder={
                  regionFilter === 'all' ? 'All regions' : regionFilter
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All regions</SelectItem>
              {showcaseGridRegionOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            disabled={columnFilters.length === 0}
            onClick={() => setColumnFilters([])}
            className="w-full rounded-md"
          >
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            Clear
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[color:var(--surface)/0.92] shadow-xl shadow-[color:var(--shadow-soft)]">
        <div className="overflow-x-auto">
          <table
            className="min-w-[92rem] border-collapse text-left"
            data-testid="showcase-grid-filter-table"
          >
            <GridTableHeader table={table} />
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[var(--border)] transition-colors hover:bg-[var(--surface-accent)]"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-3 py-3 align-middle text-sm text-[var(--foreground)]"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {table.getRowModel().rows.length === 0 ? (
                <EmptyGridRow
                  colSpan={table.getAllLeafColumns().length}
                  message="No lending records match the current column filters."
                />
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="border-t border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
          {table.getRowModel().rows.length} matching rows
        </div>
      </div>
    </div>
  );
}

export function ShowcaseGridDemo(): React.ReactElement {
  const [activeGridTab, setActiveGridTab] =
    React.useState<GridDemoTab>('readonly');
  const [deletedRowIds, setDeletedRowIds] = React.useState<string[]>([]);
  const [editedRowsById, setEditedRowsById] = React.useState<
    Record<string, ShowcaseGridRow>
  >({});
  const [expanded, setExpanded] = React.useState<ExpandedState>({});
  const [filter, setFilter] = React.useState('');
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 12,
  });
  const [pendingSubmit, setPendingSubmit] = React.useState(false);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [sorting, setSorting] = React.useState<SortingState>([
    { desc: true, id: 'updatedAt' },
  ]);
  const [status, setStatus] = React.useState<ShowcaseGridStatus | 'all'>('all');
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitResult, setSubmitResult] =
    React.useState<ShowcaseGridSubmitResponse | null>(null);
  const debouncedFilter = useDebouncedValue(filter, 250);

  React.useEffect(() => {
    setPagination((current) => ({
      ...current,
      pageIndex: 0,
    }));
  }, [debouncedFilter, deletedRowIds, sorting, status]);

  const gridQuery = useQuery({
    placeholderData: keepPreviousData,
    queryFn: () =>
      fetchGridRows({
        deletedRowIds,
        filter: debouncedFilter,
        pageIndex: pagination.pageIndex,
        pageSize: pagination.pageSize,
        sorting,
        status,
      }),
    queryKey: [
      'showcase-grid',
      deletedRowIds,
      debouncedFilter,
      pagination,
      sorting,
      status,
    ],
  });

  const rows = React.useMemo(
    () =>
      (gridQuery.data?.rows ?? []).map((row) => ({
        ...row,
        ...(editedRowsById[row.id] ?? {}),
      })),
    [editedRowsById, gridQuery.data?.rows],
  );

  const editedRows = React.useMemo(
    () => Object.values(editedRowsById),
    [editedRowsById],
  );

  const hasPendingChanges = editedRows.length > 0 || deletedRowIds.length > 0;

  const updateRow = React.useCallback(
    (
      row: ShowcaseGridRow,
      changes: Partial<Pick<ShowcaseGridRow, EditableGridField>>,
    ) => {
      setEditedRowsById((current) => ({
        ...current,
        [row.id]: {
          ...row,
          ...(current[row.id] ?? {}),
          ...changes,
        },
      }));
    },
    [],
  );

  const deleteRows = React.useCallback((rowIds: string[]) => {
    if (rowIds.length === 0) {
      return;
    }

    setDeletedRowIds((current) =>
      Array.from(new Set([...current, ...rowIds])).slice(0, 50),
    );
    setEditedRowsById((current) => {
      const nextRowsById = { ...current };

      for (const rowId of rowIds) {
        delete nextRowsById[rowId];
      }

      return nextRowsById;
    });
    setRowSelection({});
  }, []);

  const columns = React.useMemo<ColumnDef<ShowcaseGridRow>[]>(
    () => [
      {
        header: 'Control',
        columns: [
          {
            id: 'select',
            enableSorting: false,
            header: ({ table }) => (
              <Checkbox
                aria-label="Select visible grid rows"
                checked={table.getIsAllRowsSelected()}
                onChange={table.getToggleAllRowsSelectedHandler()}
              />
            ),
            cell: ({ row }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  aria-label={`Select ${row.original.id}`}
                  checked={row.getIsSelected()}
                  onChange={row.getToggleSelectedHandler()}
                />
                <Button
                  aria-label={
                    row.getIsExpanded()
                      ? `Collapse ${row.original.id}`
                      : `Expand ${row.original.id}`
                  }
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={row.getToggleExpandedHandler()}
                  className="h-8 w-8 rounded-md p-0"
                >
                  {row.getIsExpanded() ? (
                    <ChevronDown aria-hidden="true" className="h-4 w-4" />
                  ) : (
                    <ChevronRight aria-hidden="true" className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ),
          },
        ],
      },
      {
        header: 'Borrower package',
        columns: [
          {
            accessorKey: 'id',
            header: 'Deal',
            cell: ({ getValue }) => (
              <span className="font-mono text-xs font-semibold text-[var(--foreground)]">
                {getValue<string>()}
              </span>
            ),
          },
          {
            accessorKey: 'borrower',
            header: 'Borrower',
            cell: ({ row }) => (
              <div className="grid min-w-[14rem] gap-1">
                <TextEditCell
                  ariaLabel={`Borrower name for ${row.original.id}`}
                  value={row.original.borrower}
                  onCommit={(borrower) => updateRow(row.original, { borrower })}
                />
                <span className="text-xs text-[var(--muted-foreground)]">
                  {row.original.industry} / {row.original.state}
                </span>
              </div>
            ),
          },
          {
            accessorKey: 'product',
            header: 'Product',
            cell: ({ row }) => (
              <GridSelectCell
                ariaLabel={`Product for ${row.original.id}`}
                options={showcaseGridProductOptions}
                value={row.original.product}
                onValueChange={(product) =>
                  updateRow(row.original, { product })
                }
              />
            ),
          },
          {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => (
              <div className="flex min-w-[11rem] items-center gap-2">
                <StatusPill status={row.original.status} />
                <GridSelectCell
                  ariaLabel={`Status for ${row.original.id}`}
                  options={showcaseGridStatusOptions}
                  value={row.original.status}
                  onValueChange={(nextStatus) =>
                    updateRow(row.original, { status: nextStatus })
                  }
                />
              </div>
            ),
          },
        ],
      },
      {
        header: 'Credit terms',
        columns: [
          {
            accessorKey: 'amount',
            header: 'Amount',
            cell: ({ row }) => (
              <div className="grid gap-1">
                <NumberEditCell
                  ariaLabel={`Loan amount for ${row.original.id}`}
                  max={5_000_000}
                  min={25_000}
                  step={5_000}
                  value={row.original.amount}
                  onCommit={(amount) => updateRow(row.original, { amount })}
                />
                <span className="text-xs text-[var(--muted-foreground)]">
                  Revenue {currencyFormatter.format(row.original.annualRevenue)}
                </span>
              </div>
            ),
          },
          {
            accessorKey: 'requestedTermMonths',
            header: 'Term',
            cell: ({ row }) => (
              <span className="whitespace-nowrap text-sm text-[var(--foreground)]">
                {row.original.requestedTermMonths} mo
              </span>
            ),
          },
          {
            accessorKey: 'rate',
            header: 'Rate',
            cell: ({ row }) => (
              <NumberEditCell
                ariaLabel={`Rate for ${row.original.id}`}
                max={30}
                min={0}
                step={0.05}
                value={row.original.rate}
                onCommit={(rate) => updateRow(row.original, { rate })}
              />
            ),
          },
          {
            accessorKey: 'ltv',
            header: 'LTV',
            cell: ({ row }) => (
              <NumberEditCell
                ariaLabel={`LTV for ${row.original.id}`}
                max={100}
                min={0}
                step={1}
                value={row.original.ltv}
                onCommit={(ltv) => updateRow(row.original, { ltv })}
              />
            ),
          },
          {
            accessorKey: 'riskGrade',
            header: 'Risk',
            cell: ({ row }) => (
              <div className="grid gap-1">
                <GridSelectCell
                  ariaLabel={`Risk grade for ${row.original.id}`}
                  options={showcaseGridRiskGradeOptions}
                  value={row.original.riskGrade}
                  onValueChange={(riskGrade) =>
                    updateRow(row.original, { riskGrade })
                  }
                />
                <span className="text-xs text-[var(--muted-foreground)]">
                  DSCR {row.original.debtServiceCoverage.toFixed(2)}
                </span>
              </div>
            ),
          },
        ],
      },
      {
        header: 'Delivery',
        columns: [
          {
            accessorKey: 'officer',
            header: 'Officer',
            cell: ({ row }) => (
              <GridSelectCell
                ariaLabel={`Officer for ${row.original.id}`}
                options={showcaseGridOfficerOptions}
                value={row.original.officer}
                onValueChange={(officer) =>
                  updateRow(row.original, { officer })
                }
              />
            ),
          },
          {
            accessorKey: 'region',
            header: 'Region',
            cell: ({ row }) => (
              <GridSelectCell
                ariaLabel={`Region for ${row.original.id}`}
                options={showcaseGridRegionOptions}
                value={row.original.region}
                onValueChange={(region) => updateRow(row.original, { region })}
              />
            ),
          },
          {
            accessorKey: 'updatedAt',
            header: 'Updated',
            cell: ({ getValue }) => (
              <span className="whitespace-nowrap font-mono text-xs text-[var(--muted-foreground)]">
                {getValue<string>()}
              </span>
            ),
          },
          {
            id: 'delete',
            enableSorting: false,
            header: 'Delete',
            cell: ({ row }) => (
              <Button
                aria-label={`Delete ${row.original.id}`}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => deleteRows([row.original.id])}
                className="h-8 w-8 rounded-md p-0 text-[var(--critical)] hover:bg-[var(--surface-accent)]"
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </Button>
            ),
          },
        ],
      },
    ],
    [deleteRows, updateRow],
  );

  const table = useReactTable({
    columns,
    data: rows,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
    getRowId: (row) => row.id,
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    onExpandedChange: setExpanded,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    rowCount: gridQuery.data?.rowCount ?? 0,
    state: {
      expanded,
      pagination,
      rowSelection,
      sorting,
    },
  });

  async function submitChanges() {
    setSubmitError(null);
    setPendingSubmit(true);

    try {
      setSubmitResult(
        await postShowcaseGridSubmission({
          deletedRowIds,
          editedRows: editedRows.slice(0, 25),
          filter: debouncedFilter,
          pageIndex: pagination.pageIndex,
          pageSize: pagination.pageSize,
          sorting,
          status,
        }),
      );
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Unable to submit grid edits.',
      );
    } finally {
      setPendingSubmit(false);
    }
  }

  const selectedVisibleRowIds = table
    .getSelectedRowModel()
    .flatRows.map((row) => row.original.id);

  const serverQueryLabel = gridQuery.isFetching
    ? 'Refreshing'
    : gridQuery.isError
      ? 'Query error'
      : 'Ready';

  return (
    <section className="space-y-5" data-testid="showcase-grid-demo">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase text-[var(--brand)]">
            Enterprise grid
          </p>
          <h2 className="mt-2 font-display text-4xl font-semibold text-[var(--foreground)]">
            Lending pipeline table
          </h2>
        </div>
        {activeGridTab === 'editable' ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!hasPendingChanges || pendingSubmit}
              onClick={() => {
                setDeletedRowIds([]);
                setEditedRowsById({});
                setRowSelection({});
                setSubmitError(null);
                setSubmitResult(null);
              }}
              className="rounded-md"
            >
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              Reset
            </Button>
            <Button
              type="button"
              disabled={!hasPendingChanges || pendingSubmit}
              onClick={() => {
                void submitChanges();
              }}
              className="rounded-md"
            >
              <Send aria-hidden="true" className="h-4 w-4" />
              {pendingSubmit ? 'Submitting' : 'Submit'}
            </Button>
          </div>
        ) : null}
      </div>

      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="Grid demo types"
      >
        {gridDemoTabs.map((tab) => (
          <button
            key={tab.id}
            id={`showcase-grid-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-controls={`showcase-grid-panel-${tab.id}`}
            aria-selected={activeGridTab === tab.id}
            className={getGridDemoTabClassName(activeGridTab === tab.id)}
            onClick={() => setActiveGridTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className={`grid gap-3 ${
          activeGridTab === 'editable'
            ? 'lg:grid-cols-[minmax(16rem,1fr)_13rem_10rem_auto]'
            : 'lg:grid-cols-[minmax(16rem,1fr)_13rem_10rem]'
        }`}
      >
        <label className="grid gap-1.5">
          <span className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
            Server filter
          </span>
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Borrower, industry, officer, region"
            className="border-[var(--border)] bg-[var(--surface)]"
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
            Status
          </span>
          <Select
            value={status}
            onValueChange={(nextStatus) =>
              setStatus(nextStatus as ShowcaseGridStatus | 'all')
            }
          >
            <SelectTrigger className="border-[var(--border)] bg-[var(--surface)]">
              <SelectValue
                placeholder={status === 'all' ? 'All statuses' : status}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {showcaseGridStatusOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="grid gap-1.5">
          <span className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
            Page size
          </span>
          <Select
            value={String(pagination.pageSize)}
            onValueChange={(nextPageSize) =>
              setPagination({
                pageIndex: 0,
                pageSize: Number(nextPageSize),
              })
            }
          >
            <SelectTrigger className="border-[var(--border)] bg-[var(--surface)]">
              <SelectValue placeholder={`${pagination.pageSize} rows`} />
            </SelectTrigger>
            <SelectContent>
              {[8, 12, 25].map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} rows
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {activeGridTab === 'editable' ? (
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              disabled={selectedVisibleRowIds.length === 0}
              onClick={() => deleteRows(selectedVisibleRowIds)}
              className="w-full rounded-md text-[var(--critical)]"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              Delete selected
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QueryMetric
          label="Server state"
          value={`${serverQueryLabel} / ${gridQuery.data?.rowCount ?? 0} rows`}
        />
        <QueryMetric
          label="Page"
          value={`${(gridQuery.data?.pageIndex ?? pagination.pageIndex) + 1} of ${
            gridQuery.data?.pageCount ?? 1
          }`}
        />
        {activeGridTab === 'editable' ? (
          <>
            <QueryMetric label="Edited" value={`${editedRows.length} rows`} />
            <QueryMetric
              label="Deleted"
              value={`${deletedRowIds.length} rows`}
            />
          </>
        ) : (
          <>
            <QueryMetric
              label="Visible"
              value={`${table.getRowModel().rows.length} rows`}
            />
            <QueryMetric
              label="Mode"
              value={
                gridDemoTabs.find((tab) => tab.id === activeGridTab)?.label ??
                'Grid'
              }
            />
          </>
        )}
      </div>

      {activeGridTab === 'editable' ? (
        <div
          id="showcase-grid-panel-editable"
          role="tabpanel"
          aria-labelledby="showcase-grid-tab-editable"
          className="overflow-hidden rounded-xl border border-[var(--border)] bg-[color:var(--surface)/0.92] shadow-xl shadow-[color:var(--shadow-soft)]"
        >
          <div className="overflow-x-auto">
            <table
              className="min-w-[112rem] border-collapse text-left"
              data-testid="showcase-grid-table"
            >
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr
                    key={headerGroup.id}
                    className="border-b border-[var(--border)]"
                  >
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        colSpan={header.colSpan}
                        className="bg-[var(--surface-strong)] px-3 py-3 align-bottom text-xs font-semibold uppercase text-[var(--muted-foreground)]"
                      >
                        {header.isPlaceholder ? null : header.column.getCanSort() ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="flex w-full items-center gap-2 text-left"
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            <SortIndicator
                              direction={header.column.getIsSorted()}
                            />
                          </button>
                        ) : (
                          <div className="flex w-full items-center gap-2 text-left">
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr className="border-b border-[var(--border)] transition-colors hover:bg-[var(--surface-accent)]">
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="px-3 py-3 align-middle text-sm text-[var(--foreground)]"
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      ))}
                    </tr>
                    {row.getIsExpanded() ? (
                      <tr className="border-b border-[var(--border)] bg-[var(--surface-strong)]">
                        <td
                          colSpan={row.getVisibleCells().length}
                          className="px-4 py-4"
                        >
                          <div className="grid gap-3 text-sm text-[var(--foreground)] md:grid-cols-4">
                            <QueryMetric
                              label="Collateral"
                              value={row.original.collateral}
                            />
                            <QueryMetric
                              label="Covenant"
                              value={row.original.covenant}
                            />
                            <QueryMetric
                              label="Next"
                              value={row.original.nextMilestone}
                            />
                            <QueryMetric
                              label="Exposure"
                              value={`${currencyFormatter.format(
                                row.original.amount,
                              )} at ${row.original.rate}%`}
                            />
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                ))}
                {table.getRowModel().rows.length === 0 ? (
                  <EmptyGridRow
                    colSpan={table.getAllLeafColumns().length}
                    message={
                      gridQuery.isError
                        ? 'The showcase grid query failed.'
                        : 'No lending records match the current server query.'
                    }
                  />
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">
              Showing {table.getRowModel().rows.length} visible rows from a
              server-side result set.
            </p>
            <div className="flex items-center gap-2">
              <Button
                aria-label="First page"
                type="button"
                variant="outline"
                size="sm"
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.firstPage()}
                className="h-9 w-9 rounded-md p-0"
              >
                <ChevronsLeft aria-hidden="true" className="h-4 w-4" />
              </Button>
              <Button
                aria-label="Previous page"
                type="button"
                variant="outline"
                size="sm"
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
                className="h-9 w-9 rounded-md p-0"
              >
                <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              </Button>
              <span className="min-w-24 text-center font-mono text-sm text-[var(--foreground)]">
                {pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())}
              </span>
              <Button
                aria-label="Next page"
                type="button"
                variant="outline"
                size="sm"
                disabled={!table.getCanNextPage()}
                onClick={() => table.nextPage()}
                className="h-9 w-9 rounded-md p-0"
              >
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </Button>
              <Button
                aria-label="Last page"
                type="button"
                variant="outline"
                size="sm"
                disabled={!table.getCanNextPage()}
                onClick={() => table.lastPage()}
                className="h-9 w-9 rounded-md p-0"
              >
                <ChevronsRight aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : activeGridTab === 'readonly' ? (
        <div
          id="showcase-grid-panel-readonly"
          role="tabpanel"
          aria-labelledby="showcase-grid-tab-readonly"
        >
          <ReadOnlySortableGrid rows={rows} />
        </div>
      ) : activeGridTab === 'collapsible' ? (
        <div
          id="showcase-grid-panel-collapsible"
          role="tabpanel"
          aria-labelledby="showcase-grid-tab-collapsible"
        >
          <CollapsibleGrid rows={rows} />
        </div>
      ) : (
        <div
          id="showcase-grid-panel-filters"
          role="tabpanel"
          aria-labelledby="showcase-grid-tab-filters"
        >
          <ColumnFilteringGrid rows={rows} />
        </div>
      )}

      {activeGridTab === 'editable' ? (
        <div
          data-testid="showcase-grid-submit-result"
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--foreground)]"
        >
          {submitError ? (
            <p role="status" className="font-medium text-[var(--critical)]">
              {submitError}
            </p>
          ) : submitResult ? (
            <div className="grid gap-1">
              <p className="font-semibold">
                Logged {submitResult.emittedEvents.join(', ')}
              </p>
              <p className="break-all font-mono text-xs text-[var(--muted-foreground)]">
                Correlation ID: {submitResult.correlationId}
              </p>
            </div>
          ) : (
            <p className="text-[var(--muted-foreground)]">
              No grid submission logged yet.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
