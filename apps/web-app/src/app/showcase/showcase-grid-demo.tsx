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
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
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
  EyeOff,
  Filter as FilterIcon,
  Pencil,
  RotateCcw,
  Save,
  Send,
  Trash2,
  X,
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
  type ShowcaseGridColumnFilters,
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
  handledBy: string;
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
const emptyServerColumnFilters: ShowcaseGridColumnFilters = {};
const emptyServerExcludedRowIds: string[] = [];

type EditableGridState = {
  deletedRowIds: string[];
  draftRow: ShowcaseGridRow | null;
  editedRowsById: Record<string, ShowcaseGridRow>;
  editingRowId: string | null;
  pendingSubmit: boolean;
  submitError: string | null;
  submitResult: ShowcaseGridSubmitResponse | null;
};

type EditableGridAction =
  | { type: 'cancelEdit' }
  | { type: 'deleteRows'; rowIds: string[] }
  | { type: 'reset' }
  | { type: 'saveDraft' }
  | { type: 'startEdit'; row: ShowcaseGridRow }
  | { type: 'submitError'; message: string }
  | { type: 'submitStart' }
  | { type: 'submitSuccess'; result: ShowcaseGridSubmitResponse }
  | {
      type: 'updateDraft';
      changes: Partial<Pick<ShowcaseGridRow, EditableGridField>>;
    };

const initialEditableGridState: EditableGridState = {
  deletedRowIds: [],
  draftRow: null,
  editedRowsById: {},
  editingRowId: null,
  pendingSubmit: false,
  submitError: null,
  submitResult: null,
};

function normalizeEditableGridRow(row: ShowcaseGridRow): ShowcaseGridRow {
  return {
    ...row,
    amount: Math.round(clampNumber(row.amount, 25_000, 5_000_000)),
    borrower: row.borrower.trim(),
    ltv: Math.round(clampNumber(row.ltv, 0, 100)),
    rate: Number(clampNumber(row.rate, 0, 30).toFixed(2)),
  };
}

function isEditableGridDraftValid(
  row: ShowcaseGridRow | null,
): row is ShowcaseGridRow {
  if (!row) {
    return false;
  }

  return (
    row.borrower.trim().length > 0 &&
    Number.isFinite(row.amount) &&
    row.amount >= 25_000 &&
    row.amount <= 5_000_000 &&
    Number.isFinite(row.ltv) &&
    row.ltv >= 0 &&
    row.ltv <= 100 &&
    Number.isFinite(row.rate) &&
    row.rate >= 0 &&
    row.rate <= 30
  );
}

function editableGridReducer(
  state: EditableGridState,
  action: EditableGridAction,
): EditableGridState {
  switch (action.type) {
    case 'cancelEdit':
      return {
        ...state,
        draftRow: null,
        editingRowId: null,
      };
    case 'deleteRows': {
      if (action.rowIds.length === 0) {
        return state;
      }

      const rowIdSet = new Set(action.rowIds);
      const editedRowsById = { ...state.editedRowsById };

      for (const rowId of rowIdSet) {
        delete editedRowsById[rowId];
      }

      return {
        ...state,
        deletedRowIds: Array.from(
          new Set([...state.deletedRowIds, ...action.rowIds]),
        ).slice(0, 50),
        draftRow:
          state.draftRow && rowIdSet.has(state.draftRow.id)
            ? null
            : state.draftRow,
        editedRowsById,
        editingRowId:
          state.editingRowId && rowIdSet.has(state.editingRowId)
            ? null
            : state.editingRowId,
      };
    }
    case 'reset':
      return initialEditableGridState;
    case 'saveDraft': {
      if (!isEditableGridDraftValid(state.draftRow)) {
        return state;
      }

      const draftRow = normalizeEditableGridRow(state.draftRow);

      return {
        ...state,
        draftRow: null,
        editedRowsById: {
          ...state.editedRowsById,
          [draftRow.id]: draftRow,
        },
        editingRowId: null,
        submitError: null,
        submitResult: null,
      };
    }
    case 'startEdit':
      return {
        ...state,
        draftRow: normalizeEditableGridRow(action.row),
        editingRowId: action.row.id,
        submitError: null,
      };
    case 'submitError':
      return {
        ...state,
        pendingSubmit: false,
        submitError: action.message,
      };
    case 'submitStart':
      return {
        ...state,
        pendingSubmit: true,
        submitError: null,
      };
    case 'submitSuccess':
      return {
        ...state,
        pendingSubmit: false,
        submitError: null,
        submitResult: action.result,
      };
    case 'updateDraft':
      return state.draftRow
        ? {
            ...state,
            draftRow: {
              ...state.draftRow,
              ...action.changes,
            },
          }
        : state;
    default:
      return state;
  }
}

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

function GridHeaderFilterButton({
  active,
  children,
  isOpen,
  label,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  isOpen: boolean;
  label: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={`Open ${label} filter`}
        aria-expanded={isOpen}
        onClick={onClick}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
          active || isOpen
            ? 'border-[var(--brand)] bg-[var(--surface-spot)] text-[var(--brand)]'
            : 'border-transparent text-[var(--muted-foreground)] hover:border-[var(--border)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]'
        }`}
      >
        <FilterIcon aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      {isOpen ? children : null}
    </div>
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
          {headerGroup.headers.map((header, headerIndex) => {
            const filterControl = (
              header.column.columnDef.meta as
                | { filterControl?: React.ReactNode }
                | undefined
            )?.filterControl;
            const hasHeaderSeparator =
              headerIndex < headerGroup.headers.length - 1;

            return (
              <th
                key={header.id}
                colSpan={header.colSpan}
                className="relative bg-[var(--surface-strong)] px-3 py-3 align-bottom text-xs font-semibold uppercase text-[var(--muted-foreground)]"
              >
                {hasHeaderSeparator ? (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute right-0 top-1/2 h-5 -translate-y-1/2 border-r-2 border-[var(--border-strong)] opacity-80"
                  />
                ) : null}
                {header.isPlaceholder ? null : header.column.getCanSort() ? (
                  <div className="flex w-full items-center justify-between gap-2 text-left">
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                      <span className="min-w-0 truncate">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                      </span>
                      <SortIndicator direction={header.column.getIsSorted()} />
                    </button>
                    {filterControl}
                  </div>
                ) : (
                  <div className="flex w-full items-center justify-between gap-2 text-left">
                    <span className="min-w-0 truncate">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                    </span>
                    {filterControl}
                  </div>
                )}
              </th>
            );
          })}
        </tr>
      ))}
    </thead>
  );
}

function ServerPaginationControls({
  isFetching,
  pageCount,
  pageIndex,
  table,
  visibleRowCount,
}: {
  isFetching: boolean;
  pageCount: number;
  pageIndex: number;
  table: Table<ShowcaseGridRow>;
  visibleRowCount: number;
}): React.ReactElement {
  return (
    <div
      data-testid="showcase-grid-pagination"
      className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-[var(--muted-foreground)]">
        Showing {visibleRowCount} visible rows from the server-side result set
        {isFetching ? ' while the next page loads.' : '.'}
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
        <span
          className="min-w-24 text-center font-mono text-sm text-[var(--foreground)]"
          data-testid="showcase-grid-page-indicator"
        >
          {pageIndex + 1} / {Math.max(1, pageCount)}
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

function getServerColumnFilters(
  columnFilters: ColumnFiltersState,
): ShowcaseGridColumnFilters {
  const serverFilters = columnFilters.reduce<ShowcaseGridColumnFilters>(
    (serverFilters, filter) => {
      if (typeof filter.value !== 'string') {
        return serverFilters;
      }

      const value = filter.value.trim();

      if (!value || value === 'all') {
        return serverFilters;
      }

      if (
        filter.id === 'borrower' ||
        filter.id === 'industry' ||
        filter.id === 'product' ||
        filter.id === 'region'
      ) {
        return {
          ...serverFilters,
          [filter.id]: value,
        };
      }

      return serverFilters;
    },
    {},
  );

  return Object.keys(serverFilters).length > 0
    ? serverFilters
    : emptyServerColumnFilters;
}

function buildGridUrl({
  columnFilters,
  deletedRowIds,
  excludedRowIds,
  filter,
  pageIndex,
  pageSize,
  sorting,
  status,
}: {
  columnFilters: ShowcaseGridColumnFilters;
  deletedRowIds: string[];
  excludedRowIds: string[];
  filter: string;
  pageIndex: number;
  pageSize: number;
  sorting: SortingState;
  status: ShowcaseGridStatus | 'all';
}): string {
  const [primarySort] = sorting;
  const searchParams = new URLSearchParams({
    deletedIds: deletedRowIds.join(','),
    excludedIds: excludedRowIds.join(','),
    filter,
    pageIndex: String(pageIndex),
    pageSize: String(pageSize),
    status,
  });

  for (const [columnId, value] of Object.entries(columnFilters)) {
    if (value) {
      searchParams.set(columnId, value);
    }
  }

  if (primarySort) {
    searchParams.set('sortId', primarySort.id);
    searchParams.set('sortDesc', String(primarySort.desc));
  }

  return `/api/showcase/grid?${searchParams.toString()}`;
}

async function fetchGridRows({
  columnFilters,
  deletedRowIds,
  excludedRowIds,
  filter,
  pageIndex,
  pageSize,
  sorting,
  status,
}: {
  columnFilters: ShowcaseGridColumnFilters;
  deletedRowIds: string[];
  excludedRowIds: string[];
  filter: string;
  pageIndex: number;
  pageSize: number;
  sorting: SortingState;
  status: ShowcaseGridStatus | 'all';
}): Promise<ShowcaseGridQueryResponse> {
  const response = await fetch(
    buildGridUrl({
      columnFilters,
      deletedRowIds,
      excludedRowIds,
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
  const gridSubmission = {
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
  };

  logScope.logger.info(
    'showcase.grid.submit.browser',
    'Submitting bounded showcase grid edits from the browser.',
    {
      eventName: 'showcase.grid.submit',
      gridSubmission,
    },
  );

  const response = await fetch('/api/observability/events', {
    body: JSON.stringify({
      eventName: 'showcase.grid.submit',
      gridSubmission,
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
  onSortingChange,
  rows,
  sorting,
}: {
  onSortingChange: React.Dispatch<React.SetStateAction<SortingState>>;
  rows: ShowcaseGridRow[];
  sorting: SortingState;
}): React.ReactElement {
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
            enableSorting: false,
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
            enableSorting: false,
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
            enableSorting: false,
            header: 'Risk',
          },
        ],
      },
      {
        header: 'Delivery',
        columns: [
          {
            accessorKey: 'officer',
            enableSorting: false,
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
    manualSorting: true,
    onSortingChange,
    state: {
      sorting,
    },
  });

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[color:var(--surface)/0.92] shadow-xl shadow-[color:var(--shadow-soft)]">
      <div className="overflow-x-auto">
        <table
          className="w-full min-w-[94rem] border-collapse text-left"
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
  onSortingChange,
  rows,
  sorting,
}: {
  onSortingChange: React.Dispatch<React.SetStateAction<SortingState>>;
  rows: ShowcaseGridRow[];
  sorting: SortingState;
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
        enableSorting: false,
        header: 'Status',
        cell: ({ row }) => <StatusPill status={row.original.status} />,
      },
      {
        accessorKey: 'collateral',
        enableSorting: false,
        header: 'Collateral',
      },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ getValue }) => currencyFormatter.format(getValue<number>()),
      },
      {
        accessorKey: 'nextMilestone',
        enableSorting: false,
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
    manualSorting: true,
    onExpandedChange: setExpanded,
    onSortingChange,
    state: {
      expanded,
      sorting,
    },
  });

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[color:var(--surface)/0.92] shadow-xl shadow-[color:var(--shadow-soft)]">
      <div className="overflow-x-auto">
        <table
          className="w-full min-w-[72rem] border-collapse text-left"
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
  columnFilters,
  hiddenRows,
  onColumnFiltersChange,
  onHiddenRowsChange,
  onSortingChange,
  rows,
  sorting,
}: {
  columnFilters: ColumnFiltersState;
  hiddenRows: ShowcaseGridRow[];
  onColumnFiltersChange: React.Dispatch<
    React.SetStateAction<ColumnFiltersState>
  >;
  onHiddenRowsChange: React.Dispatch<React.SetStateAction<ShowcaseGridRow[]>>;
  onSortingChange: React.Dispatch<React.SetStateAction<SortingState>>;
  rows: ShowcaseGridRow[];
  sorting: SortingState;
}): React.ReactElement {
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [openFilterColumn, setOpenFilterColumn] = React.useState<
    'borrower' | 'industry' | 'product' | 'region' | null
  >(null);
  const hiddenRowIds = React.useMemo(
    () => hiddenRows.map((row) => row.id),
    [hiddenRows],
  );
  const hasColumnFilter = React.useCallback(
    (columnId: string) =>
      columnFilters.some((filter) => filter.id === columnId),
    [columnFilters],
  );
  const setColumnFilterValue = React.useCallback(
    (columnId: string, value: unknown) => {
      onColumnFiltersChange((current) => {
        const nextFilters = current.filter((filter) => filter.id !== columnId);

        if (
          value === undefined ||
          value === null ||
          (typeof value === 'string' && value.trim().length === 0) ||
          (Array.isArray(value) && value.length === 0)
        ) {
          return nextFilters;
        }

        return [...nextFilters, { id: columnId, value }];
      });
    },
    [onColumnFiltersChange],
  );
  const hideRow = React.useCallback(
    (row: ShowcaseGridRow) => {
      onHiddenRowsChange((current) => [
        row,
        ...current.filter((hiddenRow) => hiddenRow.id !== row.id),
      ]);
    },
    [onHiddenRowsChange],
  );
  const restoreHiddenRow = React.useCallback(
    (rowId: string) => {
      onHiddenRowsChange((current) =>
        current.filter((row) => row.id !== rowId),
      );
    },
    [onHiddenRowsChange],
  );
  const getColumnFilterValue = React.useCallback(
    (columnId: string) =>
      columnFilters.find((filter) => filter.id === columnId)?.value,
    [columnFilters],
  );
  const borrowerFilter =
    (getColumnFilterValue('borrower') as string | undefined) ?? '';
  const productFilter =
    (getColumnFilterValue('product') as string | undefined) ?? 'all';
  const industryFilter =
    (getColumnFilterValue('industry') as string | undefined) ?? 'all';
  const regionFilter =
    (getColumnFilterValue('region') as string | undefined) ?? 'all';
  const industryOptions = React.useMemo(
    () => Array.from(new Set(rows.map((row) => row.industry))).sort(),
    [rows],
  );
  const visibleRows = React.useMemo(
    () =>
      hiddenRowIds.length > 0
        ? rows.filter((row) => !hiddenRowIds.includes(row.id))
        : rows,
    [hiddenRowIds, rows],
  );

  const renderBorrowerFilterPopover = React.useCallback(
    () => (
      <div className="absolute left-0 top-full z-30 mt-2 w-72 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl shadow-[color:var(--shadow-soft)]">
        <Input
          autoFocus
          value={borrowerFilter}
          onChange={(event) =>
            setColumnFilterValue('borrower', event.target.value)
          }
          placeholder="Filter borrowers"
          className="border-[var(--border)] bg-[var(--surface)] normal-case"
        />
      </div>
    ),
    [borrowerFilter, setColumnFilterValue],
  );

  const renderOptionFilterPopover = React.useCallback(
    ({
      allLabel,
      columnId,
      currentValue,
      options,
    }: {
      allLabel: string;
      columnId: 'industry' | 'product' | 'region';
      currentValue: string;
      options: readonly string[];
    }) => (
      <div className="absolute left-0 top-full z-30 mt-2 w-60 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-xl shadow-[color:var(--shadow-soft)]">
        <button
          type="button"
          aria-label={`Clear ${columnId} filter`}
          onClick={() => {
            setColumnFilterValue(columnId, undefined);
            setOpenFilterColumn(null);
          }}
          className={`block w-full rounded-md px-3 py-2 text-left text-sm normal-case ${
            currentValue === 'all'
              ? 'bg-[var(--surface-accent)] font-semibold text-[var(--foreground)]'
              : 'text-[var(--foreground)] hover:bg-[var(--surface-accent)]'
          }`}
        >
          {allLabel}
        </button>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-label={`Filter ${columnId} by ${option}`}
            onClick={() => {
              setColumnFilterValue(columnId, option);
              setOpenFilterColumn(null);
            }}
            className={`mt-1 block w-full rounded-md px-3 py-2 text-left text-sm normal-case ${
              currentValue === option
                ? 'bg-[var(--surface-accent)] font-semibold text-[var(--foreground)]'
                : 'text-[var(--foreground)] hover:bg-[var(--surface-accent)]'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    ),
    [setColumnFilterValue],
  );

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
        meta: {
          filterControl: (
            <GridHeaderFilterButton
              active={hasColumnFilter('borrower')}
              isOpen={openFilterColumn === 'borrower'}
              label="Borrower"
              onClick={() =>
                setOpenFilterColumn((current) =>
                  current === 'borrower' ? null : 'borrower',
                )
              }
            >
              {renderBorrowerFilterPopover()}
            </GridHeaderFilterButton>
          ),
        },
      },
      {
        accessorKey: 'industry',
        header: 'Industry',
        meta: {
          filterControl: (
            <GridHeaderFilterButton
              active={hasColumnFilter('industry')}
              isOpen={openFilterColumn === 'industry'}
              label="Industry"
              onClick={() =>
                setOpenFilterColumn((current) =>
                  current === 'industry' ? null : 'industry',
                )
              }
            >
              {renderOptionFilterPopover({
                allLabel: 'All industries',
                columnId: 'industry',
                currentValue: industryFilter,
                options: industryOptions,
              })}
            </GridHeaderFilterButton>
          ),
        },
      },
      {
        accessorKey: 'product',
        header: 'Product',
        meta: {
          filterControl: (
            <GridHeaderFilterButton
              active={hasColumnFilter('product')}
              isOpen={openFilterColumn === 'product'}
              label="Product"
              onClick={() =>
                setOpenFilterColumn((current) =>
                  current === 'product' ? null : 'product',
                )
              }
            >
              {renderOptionFilterPopover({
                allLabel: 'All products',
                columnId: 'product',
                currentValue: productFilter,
                options: showcaseGridProductOptions,
              })}
            </GridHeaderFilterButton>
          ),
        },
      },
      {
        accessorKey: 'status',
        enableSorting: false,
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
        meta: {
          filterControl: (
            <GridHeaderFilterButton
              active={hasColumnFilter('region')}
              isOpen={openFilterColumn === 'region'}
              label="Region"
              onClick={() =>
                setOpenFilterColumn((current) =>
                  current === 'region' ? null : 'region',
                )
              }
            >
              {renderOptionFilterPopover({
                allLabel: 'All regions',
                columnId: 'region',
                currentValue: regionFilter,
                options: showcaseGridRegionOptions,
              })}
            </GridHeaderFilterButton>
          ),
        },
      },
      {
        accessorKey: 'state',
        enableSorting: false,
        header: 'State',
      },
      {
        accessorKey: 'riskGrade',
        enableSorting: false,
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
      {
        id: 'hide',
        enableSorting: false,
        header: 'Hide',
        cell: ({ row }) => (
          <Button
            aria-label={`Hide ${row.original.id}`}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => hideRow(row.original)}
            className="h-8 w-8 rounded-md p-0"
          >
            <EyeOff aria-hidden="true" className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    [
      borrowerFilter,
      hasColumnFilter,
      hideRow,
      industryFilter,
      industryOptions,
      openFilterColumn,
      productFilter,
      regionFilter,
      renderBorrowerFilterPopover,
      renderOptionFilterPopover,
    ],
  );

  const table = useReactTable({
    columns,
    data: visibleRows,
    getCoreRowModel: getCoreRowModel(),
    manualFiltering: true,
    manualSorting: true,
    onColumnFiltersChange,
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange,
    state: {
      columnFilters,
      columnVisibility,
      sorting,
    },
  });
  const visibilityColumnIds = [
    'borrower',
    'industry',
    'product',
    'status',
    'officer',
    'region',
    'state',
    'riskGrade',
    'amount',
    'debtServiceCoverage',
  ] as const;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div
          data-testid="showcase-grid-filter-queue"
          className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-3"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
              Filter queue
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={columnFilters.length === 0 && hiddenRows.length === 0}
              onClick={() => {
                onColumnFiltersChange([]);
                onHiddenRowsChange([]);
                setOpenFilterColumn(null);
              }}
              className="h-8 rounded-md"
            >
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              Clear
            </Button>
          </div>

          <div className="mt-3 flex min-h-8 flex-wrap gap-2">
            {columnFilters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setColumnFilterValue(filter.id, undefined)}
                className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--brand)]"
              >
                {filter.id}: {String(filter.value)}
              </button>
            ))}
            {columnFilters.length === 0 ? (
              <span className="text-xs text-[var(--muted-foreground)]">
                No column filters
              </span>
            ) : null}
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
              Hidden rows
            </p>
            {hiddenRows.length > 0 ? (
              hiddenRows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-semibold text-[var(--foreground)]">
                      {row.id}
                    </p>
                    <p className="truncate text-xs text-[var(--muted-foreground)]">
                      {row.borrower}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Restore ${row.id}`}
                    onClick={() => restoreHiddenRow(row.id)}
                    className="h-8 w-8 shrink-0 rounded-md p-0"
                  >
                    <RotateCcw aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-xs text-[var(--muted-foreground)]">
                No hidden rows
              </p>
            )}
          </div>
        </div>

        <div
          data-testid="showcase-grid-column-visibility"
          className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-3"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
              Columns
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setColumnVisibility({})}
              className="h-8 rounded-md"
            >
              Reset
            </Button>
          </div>

          <div className="mt-3 grid gap-2">
            {visibilityColumnIds.map((columnId) => {
              const column = table.getColumn(columnId);

              if (!column) {
                return null;
              }

              return (
                <label
                  key={columnId}
                  className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs font-semibold text-[var(--foreground)]"
                >
                  <span>{columnId}</span>
                  <Checkbox
                    aria-label={`Toggle ${columnId} column`}
                    checked={column.getIsVisible()}
                    onChange={(event) =>
                      column.toggleVisibility(event.currentTarget.checked)
                    }
                  />
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[color:var(--surface)/0.92] shadow-xl shadow-[color:var(--shadow-soft)]">
        <div className="overflow-x-auto">
          <table
            className="w-full min-w-[82rem] border-collapse text-left"
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

function EditableGridRowPanel({
  canSave,
  colSpan,
  draftRow,
  onCancel,
  onSave,
  onUpdate,
}: {
  canSave: boolean;
  colSpan: number;
  draftRow: ShowcaseGridRow;
  onCancel: () => void;
  onSave: () => void;
  onUpdate: (
    changes: Partial<Pick<ShowcaseGridRow, EditableGridField>>,
  ) => void;
}): React.ReactElement {
  return (
    <tr className="border-b border-[var(--border)] bg-[var(--surface-strong)]">
      <td colSpan={colSpan} className="px-4 py-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
            <label className="grid gap-1.5 xl:col-span-2">
              <span className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
                Borrower
              </span>
              <Input
                aria-label={`Borrower name for ${draftRow.id}`}
                value={draftRow.borrower}
                onChange={(event) => onUpdate({ borrower: event.target.value })}
                className="border-[var(--border)] bg-[var(--surface)]"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
                Product
              </span>
              <Select
                value={draftRow.product}
                onValueChange={(product) =>
                  onUpdate({
                    product:
                      product as (typeof showcaseGridProductOptions)[number],
                  })
                }
              >
                <SelectTrigger className="border-[var(--border)] bg-[var(--surface)]">
                  <SelectValue placeholder={draftRow.product} />
                </SelectTrigger>
                <SelectContent>
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
                Status
              </span>
              <Select
                value={draftRow.status}
                onValueChange={(nextStatus) =>
                  onUpdate({
                    status:
                      nextStatus as (typeof showcaseGridStatusOptions)[number],
                  })
                }
              >
                <SelectTrigger className="border-[var(--border)] bg-[var(--surface)]">
                  <SelectValue placeholder={draftRow.status} />
                </SelectTrigger>
                <SelectContent>
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
                Amount
              </span>
              <Input
                aria-label={`Loan amount for ${draftRow.id}`}
                inputMode="numeric"
                max={5_000_000}
                min={25_000}
                step={5_000}
                type="number"
                value={String(draftRow.amount)}
                onChange={(event) =>
                  onUpdate({ amount: Number(event.target.value) })
                }
                className="border-[var(--border)] bg-[var(--surface)]"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
                Rate
              </span>
              <Input
                aria-label={`Rate for ${draftRow.id}`}
                inputMode="decimal"
                max={30}
                min={0}
                step={0.05}
                type="number"
                value={String(draftRow.rate)}
                onChange={(event) =>
                  onUpdate({ rate: Number(event.target.value) })
                }
                className="border-[var(--border)] bg-[var(--surface)]"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
                LTV
              </span>
              <Input
                aria-label={`LTV for ${draftRow.id}`}
                inputMode="numeric"
                max={100}
                min={0}
                step={1}
                type="number"
                value={String(draftRow.ltv)}
                onChange={(event) =>
                  onUpdate({ ltv: Number(event.target.value) })
                }
                className="border-[var(--border)] bg-[var(--surface)]"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
                Risk
              </span>
              <Select
                value={draftRow.riskGrade}
                onValueChange={(riskGrade) =>
                  onUpdate({
                    riskGrade:
                      riskGrade as (typeof showcaseGridRiskGradeOptions)[number],
                  })
                }
              >
                <SelectTrigger className="border-[var(--border)] bg-[var(--surface)]">
                  <SelectValue placeholder={draftRow.riskGrade} />
                </SelectTrigger>
                <SelectContent>
                  {showcaseGridRiskGradeOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
                Officer
              </span>
              <Select
                value={draftRow.officer}
                onValueChange={(officer) =>
                  onUpdate({
                    officer:
                      officer as (typeof showcaseGridOfficerOptions)[number],
                  })
                }
              >
                <SelectTrigger className="border-[var(--border)] bg-[var(--surface)]">
                  <SelectValue placeholder={draftRow.officer} />
                </SelectTrigger>
                <SelectContent>
                  {showcaseGridOfficerOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
                Region
              </span>
              <Select
                value={draftRow.region}
                onValueChange={(region) =>
                  onUpdate({
                    region:
                      region as (typeof showcaseGridRegionOptions)[number],
                  })
                }
              >
                <SelectTrigger className="border-[var(--border)] bg-[var(--surface)]">
                  <SelectValue placeholder={draftRow.region} />
                </SelectTrigger>
                <SelectContent>
                  {showcaseGridRegionOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="grid gap-3 sm:grid-cols-3">
              <QueryMetric
                label="Revenue"
                value={currencyFormatter.format(draftRow.annualRevenue)}
              />
              <QueryMetric
                label="Credit"
                value={`DSCR ${draftRow.debtServiceCoverage.toFixed(2)}`}
              />
              <QueryMetric label="Next" value={draftRow.nextMilestone} />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="rounded-md"
              >
                <X aria-hidden="true" className="h-4 w-4" />
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!canSave}
                onClick={onSave}
                className="rounded-md"
              >
                <Save aria-hidden="true" className="h-4 w-4" />
                Save row
              </Button>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

export function ShowcaseGridDemo(): React.ReactElement {
  const [activeGridTab, setActiveGridTab] =
    React.useState<GridDemoTab>('readonly');
  const [editableGridState, dispatchEditableGrid] = React.useReducer(
    editableGridReducer,
    initialEditableGridState,
  );
  const [filter, setFilter] = React.useState('');
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 8,
  });
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [sorting, setSorting] = React.useState<SortingState>([
    { desc: true, id: 'updatedAt' },
  ]);
  const [status, setStatus] = React.useState<ShowcaseGridStatus | 'all'>('all');
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [hiddenFilterRows, setHiddenFilterRows] = React.useState<
    ShowcaseGridRow[]
  >([]);
  const {
    deletedRowIds,
    draftRow,
    editedRowsById,
    editingRowId,
    pendingSubmit,
    submitError,
    submitResult,
  } = editableGridState;
  const debouncedFilter = useDebouncedValue(filter, 350);
  const debouncedColumnFilters = useDebouncedValue(columnFilters, 350);
  const serverColumnFilters = React.useMemo(
    () =>
      activeGridTab === 'filters'
        ? getServerColumnFilters(debouncedColumnFilters)
        : emptyServerColumnFilters,
    [activeGridTab, debouncedColumnFilters],
  );
  const serverExcludedRowIds = React.useMemo(
    () =>
      activeGridTab === 'filters' && hiddenFilterRows.length > 0
        ? hiddenFilterRows.map((row) => row.id)
        : emptyServerExcludedRowIds,
    [activeGridTab, hiddenFilterRows],
  );

  React.useEffect(() => {
    setPagination((current) => ({
      ...current,
      pageIndex: 0,
    }));
  }, [
    debouncedFilter,
    deletedRowIds,
    serverColumnFilters,
    serverExcludedRowIds,
    sorting,
    status,
  ]);

  const gridQuery = useQuery({
    placeholderData: keepPreviousData,
    queryFn: () =>
      fetchGridRows({
        columnFilters: serverColumnFilters,
        deletedRowIds,
        excludedRowIds: serverExcludedRowIds,
        filter: debouncedFilter,
        pageIndex: pagination.pageIndex,
        pageSize: pagination.pageSize,
        sorting,
        status,
      }),
    queryKey: [
      'showcase-grid',
      serverColumnFilters,
      deletedRowIds,
      debouncedFilter,
      serverExcludedRowIds,
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

  React.useEffect(() => {
    if (editingRowId && rows.every((row) => row.id !== editingRowId)) {
      dispatchEditableGrid({ type: 'cancelEdit' });
    }
  }, [editingRowId, rows]);

  const editedRows = React.useMemo(
    () => Object.values(editedRowsById),
    [editedRowsById],
  );

  const hasPendingChanges = editedRows.length > 0 || deletedRowIds.length > 0;

  const startEditingRow = React.useCallback((row: ShowcaseGridRow) => {
    dispatchEditableGrid({ type: 'startEdit', row });
  }, []);

  const updateDraftRow = React.useCallback(
    (changes: Partial<Pick<ShowcaseGridRow, EditableGridField>>) => {
      dispatchEditableGrid({ type: 'updateDraft', changes });
    },
    [],
  );

  const deleteRows = React.useCallback((rowIds: string[]) => {
    dispatchEditableGrid({ type: 'deleteRows', rowIds });
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
              <Checkbox
                aria-label={`Select ${row.original.id}`}
                checked={row.getIsSelected()}
                onChange={row.getToggleSelectedHandler()}
              />
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
              <div className="grid gap-1">
                <span className="font-mono text-xs font-semibold text-[var(--foreground)]">
                  {getValue<string>()}
                </span>
                {editedRowsById[getValue<string>()] ? (
                  <span className="w-fit rounded-full border border-[var(--brand)] bg-[var(--surface-spot)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--brand)]">
                    Edited
                  </span>
                ) : null}
              </div>
            ),
          },
          {
            accessorKey: 'borrower',
            header: 'Borrower',
            cell: ({ row }) => (
              <div className="grid min-w-[12rem] gap-1">
                <span className="font-medium text-[var(--foreground)]">
                  {row.original.borrower}
                </span>
                <span className="text-xs text-[var(--muted-foreground)]">
                  {row.original.industry} / {row.original.state}
                </span>
              </div>
            ),
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
            enableSorting: false,
            header: 'Status',
            cell: ({ row }) => <StatusPill status={row.original.status} />,
          },
        ],
      },
      {
        header: 'Credit terms',
        columns: [
          {
            accessorKey: 'amount',
            header: 'Amount',
            cell: ({ getValue }) =>
              currencyFormatter.format(getValue<number>()),
          },
          {
            accessorKey: 'rate',
            header: 'Rate',
            cell: ({ row }) => (
              <span className="whitespace-nowrap text-sm text-[var(--foreground)]">
                {row.original.rate.toFixed(2)}%
              </span>
            ),
          },
          {
            accessorKey: 'ltv',
            enableSorting: false,
            header: 'LTV',
            cell: ({ row }) => (
              <span className="whitespace-nowrap text-sm text-[var(--foreground)]">
                {row.original.ltv}%
              </span>
            ),
          },
          {
            accessorKey: 'riskGrade',
            enableSorting: false,
            header: 'Risk',
            cell: ({ row }) => (
              <span className="font-semibold text-[var(--foreground)]">
                {row.original.riskGrade}
              </span>
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
          },
          {
            accessorKey: 'region',
            header: 'Region',
            cell: ({ row }) => (
              <span className="whitespace-nowrap text-sm text-[var(--foreground)]">
                {row.original.region}
              </span>
            ),
          },
        ],
      },
      {
        header: 'Actions',
        columns: [
          {
            id: 'edit',
            enableSorting: false,
            header: 'Edit',
            cell: ({ row }) => (
              <Button
                aria-label={`Edit ${row.original.id}`}
                type="button"
                variant={editingRowId === row.original.id ? 'default' : 'ghost'}
                size="sm"
                onClick={() => startEditingRow(row.original)}
                className="h-8 w-8 rounded-md p-0"
              >
                <Pencil aria-hidden="true" className="h-4 w-4" />
              </Button>
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
    [deleteRows, editedRowsById, editingRowId, startEditingRow],
  );

  const table = useReactTable({
    columns,
    data: rows,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    rowCount: gridQuery.data?.rowCount ?? 0,
    state: {
      pagination,
      rowSelection,
      sorting,
    },
  });

  async function submitChanges() {
    dispatchEditableGrid({ type: 'submitStart' });

    try {
      dispatchEditableGrid({
        type: 'submitSuccess',
        result: await postShowcaseGridSubmission({
          deletedRowIds,
          editedRows: editedRows.slice(0, 25),
          filter: debouncedFilter,
          pageIndex: pagination.pageIndex,
          pageSize: pagination.pageSize,
          sorting,
          status,
        }),
      });
    } catch (error) {
      dispatchEditableGrid({
        type: 'submitError',
        message:
          error instanceof Error
            ? error.message
            : 'Unable to submit grid edits.',
      });
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
                dispatchEditableGrid({ type: 'reset' });
                setRowSelection({});
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
              className="w-full min-w-[68rem] border-collapse text-left"
              data-testid="showcase-grid-table"
            >
              <GridTableHeader table={table} />
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr
                      className={`border-b border-[var(--border)] transition-colors hover:bg-[var(--surface-accent)] ${
                        editingRowId === row.original.id
                          ? 'bg-[var(--surface-accent)]'
                          : ''
                      }`}
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
                    {editingRowId === row.original.id && draftRow ? (
                      <EditableGridRowPanel
                        canSave={isEditableGridDraftValid(draftRow)}
                        colSpan={row.getVisibleCells().length}
                        draftRow={draftRow}
                        onCancel={() =>
                          dispatchEditableGrid({ type: 'cancelEdit' })
                        }
                        onSave={() =>
                          dispatchEditableGrid({ type: 'saveDraft' })
                        }
                        onUpdate={updateDraftRow}
                      />
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
        </div>
      ) : activeGridTab === 'readonly' ? (
        <div
          id="showcase-grid-panel-readonly"
          role="tabpanel"
          aria-labelledby="showcase-grid-tab-readonly"
        >
          <ReadOnlySortableGrid
            onSortingChange={setSorting}
            rows={rows}
            sorting={sorting}
          />
        </div>
      ) : activeGridTab === 'collapsible' ? (
        <div
          id="showcase-grid-panel-collapsible"
          role="tabpanel"
          aria-labelledby="showcase-grid-tab-collapsible"
        >
          <CollapsibleGrid
            onSortingChange={setSorting}
            rows={rows}
            sorting={sorting}
          />
        </div>
      ) : (
        <div
          id="showcase-grid-panel-filters"
          role="tabpanel"
          aria-labelledby="showcase-grid-tab-filters"
        >
          <ColumnFilteringGrid
            columnFilters={columnFilters}
            hiddenRows={hiddenFilterRows}
            onColumnFiltersChange={setColumnFilters}
            onHiddenRowsChange={setHiddenFilterRows}
            onSortingChange={setSorting}
            rows={rows}
            sorting={sorting}
          />
        </div>
      )}

      <ServerPaginationControls
        isFetching={gridQuery.isFetching}
        pageCount={Math.max(1, table.getPageCount())}
        pageIndex={pagination.pageIndex}
        table={table}
        visibleRowCount={table.getRowModel().rows.length}
      />

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
