'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { navigationHandled } from '@/store/tool-calls-slice';

export function ToolNavigationListener() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const pendingNavigation = useAppSelector(
    (state) => state.toolCalls.pendingNavigation
  );

  useEffect(() => {
    if (!pendingNavigation) return;

    router.push(pendingNavigation.url);
    dispatch(navigationHandled(pendingNavigation.toolId));
  }, [dispatch, pendingNavigation, router]);

  return null;
}
