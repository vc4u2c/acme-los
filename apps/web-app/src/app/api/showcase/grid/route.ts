import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  queryShowcaseGridRows,
  showcaseGridSortableColumnIds,
  showcaseGridStatusOptions,
  type ShowcaseGridSorting,
} from '../../../../lib/showcase-grid';

export const runtime = 'nodejs';

const gridQuerySchema = z.object({
  deletedIds: z.string().trim().max(768).default(''),
  filter: z.string().trim().max(80).default(''),
  pageIndex: z.coerce.number().int().min(0).max(100).default(0),
  pageSize: z.coerce.number().int().min(5).max(25).default(8),
  sortDesc: z.enum(['true', 'false']).default('false'),
  sortId: z.enum(showcaseGridSortableColumnIds).optional(),
  status: z
    .union([z.literal('all'), z.enum(showcaseGridStatusOptions)])
    .default('all'),
});

function parseDeletedIds(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => /^GRID-\d{4}$/.test(item))
    .slice(0, 50);
}

export function GET(request: NextRequest): NextResponse {
  const parsedQuery = gridQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );

  if (!parsedQuery.success) {
    return NextResponse.json(
      { message: 'Invalid showcase grid query.' },
      { status: 400 },
    );
  }

  const query = parsedQuery.data;
  const sorting: ShowcaseGridSorting[] = query.sortId
    ? [
        {
          desc: query.sortDesc === 'true',
          id: query.sortId,
        },
      ]
    : [];

  return NextResponse.json(
    queryShowcaseGridRows({
      deletedRowIds: parseDeletedIds(query.deletedIds),
      globalFilter: query.filter,
      pageIndex: query.pageIndex,
      pageSize: query.pageSize,
      sorting,
      statusFilter: query.status,
    }),
    {
      headers: {
        'cache-control': 'no-store, max-age=0',
      },
    },
  );
}
