'use client';

export const LEAD_ID_STORAGE_KEY = 'acme-los.lead-id';

function readLeadIdFromStorage(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const value = window.localStorage.getItem(LEAD_ID_STORAGE_KEY)?.trim();
  return value ? value : null;
}

function writeLeadIdToStorage(value: string): string {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(LEAD_ID_STORAGE_KEY, value);
  }

  return value;
}

function sanitizeLeadId(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9_-]/g, '');
}

function randomSuffix(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
  }

  return Math.random().toString(36).slice(2, 12).toUpperCase();
}

export function generateLeadId(): string {
  const timestamp = new Date()
    .toISOString()
    .split('')
    .filter((character) => character >= '0' && character <= '9')
    .join('')
    .slice(0, 14);

  return `ACME_${timestamp}_${randomSuffix()}`;
}

export function getStoredLeadId(): string | null {
  return readLeadIdFromStorage();
}

export function resolveOrCreateLeadId(
  searchParams?: URLSearchParams,
): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const requestedLeadId =
    searchParams?.get('lead_id') ?? searchParams?.get('leadId') ?? '';
  const normalizedRequestedLeadId = sanitizeLeadId(requestedLeadId);

  if (normalizedRequestedLeadId) {
    return writeLeadIdToStorage(normalizedRequestedLeadId);
  }

  const existingLeadId = readLeadIdFromStorage();
  if (existingLeadId) {
    return existingLeadId;
  }

  return writeLeadIdToStorage(generateLeadId());
}
