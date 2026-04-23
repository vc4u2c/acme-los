import showcaseLendingPipelineRows from '../data/showcase-lending-pipeline.json';

export const showcaseGridProductOptions = [
  'Working capital',
  'Equipment',
  'Expansion',
  'Refinance',
] as const;

export const showcaseGridStatusOptions = [
  'Draft',
  'Review',
  'Conditional',
  'Approved',
  'Funded',
] as const;

export const showcaseGridOfficerOptions = [
  'Avery Chen',
  'Morgan Patel',
  'Riley Brooks',
  'Samira King',
  'Taylor Reed',
] as const;

export const showcaseGridRegionOptions = [
  'Central',
  'Northeast',
  'Southeast',
  'West',
] as const;

export const showcaseGridRiskGradeOptions = ['A', 'B', 'C', 'D'] as const;

export const showcaseGridColumnFilterIds = [
  'borrower',
  'industry',
  'product',
  'region',
] as const;

export type ShowcaseGridProduct = (typeof showcaseGridProductOptions)[number];
export type ShowcaseGridStatus = (typeof showcaseGridStatusOptions)[number];
export type ShowcaseGridOfficer = (typeof showcaseGridOfficerOptions)[number];
export type ShowcaseGridRegion = (typeof showcaseGridRegionOptions)[number];
export type ShowcaseGridRiskGrade =
  (typeof showcaseGridRiskGradeOptions)[number];
export type ShowcaseGridColumnFilterId =
  (typeof showcaseGridColumnFilterIds)[number];
export type ShowcaseGridColumnFilters = Partial<
  Record<ShowcaseGridColumnFilterId, string>
>;

export type ShowcaseGridRow = {
  id: string;
  borrower: string;
  product: ShowcaseGridProduct;
  status: ShowcaseGridStatus;
  officer: ShowcaseGridOfficer;
  region: ShowcaseGridRegion;
  state: string;
  industry: string;
  amount: number;
  annualRevenue: number;
  requestedTermMonths: number;
  debtServiceCoverage: number;
  rate: number;
  ltv: number;
  riskGrade: ShowcaseGridRiskGrade;
  collateral: string;
  covenant: string;
  nextMilestone: string;
  updatedAt: string;
};

export type ShowcaseGridSorting = {
  id: string;
  desc: boolean;
};

export type ShowcaseGridQuery = {
  columnFilters?: ShowcaseGridColumnFilters;
  deletedRowIds?: string[];
  excludedRowIds?: string[];
  globalFilter?: string;
  pageIndex: number;
  pageSize: number;
  sorting?: ShowcaseGridSorting[];
  statusFilter?: ShowcaseGridStatus | 'all';
};

export type ShowcaseGridQueryResponse = {
  pageCount: number;
  pageIndex: number;
  pageSize: number;
  rowCount: number;
  rows: ShowcaseGridRow[];
  serverQuery: {
    columnFilters: ShowcaseGridColumnFilters;
    deletedRowIds: string[];
    excludedRowIds: string[];
    globalFilter: string;
    sorting: ShowcaseGridSorting[];
    statusFilter: ShowcaseGridStatus | 'all';
  };
};

export const showcaseGridSortableColumnIds = [
  'id',
  'borrower',
  'product',
  'status',
  'officer',
  'region',
  'state',
  'industry',
  'amount',
  'annualRevenue',
  'requestedTermMonths',
  'debtServiceCoverage',
  'rate',
  'ltv',
  'riskGrade',
  'updatedAt',
] as const;

type ShowcaseGridSortableColumnId =
  (typeof showcaseGridSortableColumnIds)[number];

const sortableAccessors: Record<
  ShowcaseGridSortableColumnId,
  (row: ShowcaseGridRow) => number | string
> = {
  amount: (row) => row.amount,
  borrower: (row) => row.borrower,
  id: (row) => row.id,
  industry: (row) => row.industry,
  ltv: (row) => row.ltv,
  officer: (row) => row.officer,
  product: (row) => row.product,
  rate: (row) => row.rate,
  region: (row) => row.region,
  riskGrade: (row) => row.riskGrade,
  state: (row) => row.state,
  status: (row) => row.status,
  annualRevenue: (row) => row.annualRevenue,
  debtServiceCoverage: (row) => row.debtServiceCoverage,
  requestedTermMonths: (row) => row.requestedTermMonths,
  updatedAt: (row) => row.updatedAt,
};

function isSortableColumnId(
  value: string,
): value is ShowcaseGridSortableColumnId {
  return showcaseGridSortableColumnIds.some((columnId) => columnId === value);
}

export const showcaseGridRows =
  showcaseLendingPipelineRows as ShowcaseGridRow[];

export function queryShowcaseGridRows({
  columnFilters = {},
  deletedRowIds = [],
  excludedRowIds = [],
  globalFilter = '',
  pageIndex,
  pageSize,
  sorting = [],
  statusFilter = 'all',
}: ShowcaseGridQuery): ShowcaseGridQueryResponse {
  const excludedRowIdSet = new Set([...deletedRowIds, ...excludedRowIds]);
  const normalizedFilter = globalFilter.trim().toLowerCase();
  const normalizedColumnFilters = {
    borrower: columnFilters.borrower?.trim().toLowerCase() ?? '',
    industry: columnFilters.industry?.trim().toLowerCase() ?? '',
    product: columnFilters.product?.trim().toLowerCase() ?? '',
    region: columnFilters.region?.trim().toLowerCase() ?? '',
  };
  const [primarySort] = sorting;

  let rows = showcaseGridRows.filter((row) => !excludedRowIdSet.has(row.id));

  if (statusFilter !== 'all') {
    rows = rows.filter((row) => row.status === statusFilter);
  }

  if (normalizedFilter) {
    rows = rows.filter((row) => {
      const searchable = [
        row.id,
        row.borrower,
        row.product,
        row.status,
        row.officer,
        row.region,
        row.state,
        row.industry,
        row.riskGrade,
      ]
        .join(' ')
        .toLowerCase();

      return searchable.includes(normalizedFilter);
    });
  }

  if (normalizedColumnFilters.borrower) {
    rows = rows.filter((row) =>
      row.borrower.toLowerCase().includes(normalizedColumnFilters.borrower),
    );
  }

  if (normalizedColumnFilters.industry) {
    rows = rows.filter(
      (row) => row.industry.toLowerCase() === normalizedColumnFilters.industry,
    );
  }

  if (normalizedColumnFilters.product) {
    rows = rows.filter(
      (row) => row.product.toLowerCase() === normalizedColumnFilters.product,
    );
  }

  if (normalizedColumnFilters.region) {
    rows = rows.filter(
      (row) => row.region.toLowerCase() === normalizedColumnFilters.region,
    );
  }

  if (primarySort && isSortableColumnId(primarySort.id)) {
    const accessor = sortableAccessors[primarySort.id];
    rows = [...rows].sort((left, right) => {
      const leftValue = accessor(left);
      const rightValue = accessor(right);

      if (leftValue === rightValue) {
        return left.id.localeCompare(right.id);
      }

      const direction = primarySort.desc ? -1 : 1;

      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return (leftValue - rightValue) * direction;
      }

      return String(leftValue).localeCompare(String(rightValue)) * direction;
    });
  } else {
    rows = [...rows].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  }

  const rowCount = rows.length;
  const pageCount = Math.max(1, Math.ceil(rowCount / pageSize));
  const boundedPageIndex = Math.min(pageIndex, pageCount - 1);
  const start = boundedPageIndex * pageSize;

  return {
    pageCount,
    pageIndex: boundedPageIndex,
    pageSize,
    rowCount,
    rows: rows.slice(start, start + pageSize),
    serverQuery: {
      columnFilters,
      deletedRowIds,
      excludedRowIds,
      globalFilter,
      sorting,
      statusFilter,
    },
  };
}
