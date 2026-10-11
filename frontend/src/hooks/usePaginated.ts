'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Paginated } from '@lms/shared';
import { api, errorMessage } from '@/lib/api';

/** Fetches a paginated list endpoint; re-fetches when the path/query changes. Search is debounced. */
export function usePaginated<T>(path: string, params: Record<string, string | number | undefined>) {
  const [data, setData] = useState<Paginated<T> | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const qs = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string | number] => e[1] !== undefined && e[1] !== '').map(([k, v]) => [k, String(v)]),
  ).toString();
  const url = `${path}${qs ? `?${qs}` : ''}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api.get<Paginated<T>>(url));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return { data, error, loading, reload: load };
}
