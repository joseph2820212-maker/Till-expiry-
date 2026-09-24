import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { onDataChanged } from '../storage/changeBus';
import { useActiveWorkspace } from '../modules/workspaces/workspaceStore';
import type { Workspace } from '../domain/expiry/expiryTypes';

export interface WorkspaceData<T> { data: T | null; error: boolean; reload: () => void; workspace: Workspace | null }

/**
 * Load data for the ACTIVE workspace: again whenever the screen gains focus, the workspace changes, or any repository
 * commits a change. Results for a previous workspace are discarded, so a switch can never flash another business's data.
 */
export function useWorkspaceData<T>(loader: (w: Workspace) => Promise<T>): WorkspaceData<T> {
  const workspace = useActiveWorkspace();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);
  const focused = useRef(false);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(() => {
    if (!workspace) { setData(null); return () => undefined; }
    let live = true;
    const wsId = workspace.id;
    loaderRef.current(workspace)
      .then(d => { if (live && wsId === workspace.id) { setData(d); setError(false); } })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [workspace, tick]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    const cancel = run();
    return () => { focused.current = false; cancel(); };
  }, [run]));

  useEffect(() => { setData(null); }, [workspace?.id]);
  useEffect(() => onDataChanged(() => { if (focused.current) setTick(x => x + 1); }), []);

  const reload = useCallback(() => setTick(x => x + 1), []);
  return { data, error, reload, workspace };
}
