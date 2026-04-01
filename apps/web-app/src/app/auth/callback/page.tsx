import { redirect } from 'next/navigation';

function toSearchString(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const normalized = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') {
      normalized.set(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        normalized.append(key, item);
      }
    }
  }

  const search = normalized.toString();
  return search ? `?${search}` : '';
}

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;

  redirect(`/api/auth/callback${toSearchString(resolvedSearchParams)}`);
}
