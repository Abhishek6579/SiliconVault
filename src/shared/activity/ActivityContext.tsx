import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, LoaderCircle, X } from 'lucide-react';

export interface ActivityProgress {
  detail?: string;
  current?: number;
  total?: number | null;
}

export interface ActivityItem {
  id: number;
  title: string;
  detail: string;
  current: number;
  total: number | null;
  status: 'running' | 'success' | 'error';
}

export interface ActivityHandle {
  update(progress: ActivityProgress): void;
  complete(detail?: string): void;
  fail(detail: string): void;
  dismiss(): void;
}

interface ActivityContextValue {
  items: ActivityItem[];
  startActivity(title: string, detail?: string): ActivityHandle;
  dismiss(id: number): void;
}

const ActivityContext = createContext<ActivityContextValue | null>(null);

export function ActivityProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const update = useCallback((id: number, progress: ActivityProgress) => {
    setItems((current) => current.map((item) => item.id === id && item.status === 'running'
      ? { ...item, ...progress, current: progress.current ?? item.current, total: progress.total === undefined ? item.total : progress.total }
      : item));
  }, []);

  const finish = useCallback((id: number, status: 'success' | 'error', detail: string) => {
    setItems((current) => current.map((item) => item.id === id
      ? { ...item, status, detail, current: status === 'success' && item.total !== null ? item.total : item.current }
      : item));
    const previous = timers.current.get(id);
    if (previous) clearTimeout(previous);
    timers.current.set(id, setTimeout(() => dismiss(id), status === 'error' ? 9000 : 5500));
  }, [dismiss]);

  const startActivity = useCallback((title: string, detail = 'Starting…'): ActivityHandle => {
    const id = ++nextId.current;
    setItems((current) => [...current, { id, title, detail, current: 0, total: null, status: 'running' }]);
    return {
      update: (progress) => update(id, progress),
      complete: (message = 'Completed') => finish(id, 'success', message),
      fail: (message) => finish(id, 'error', message),
      dismiss: () => dismiss(id),
    };
  }, [dismiss, finish, update]);

  return <ActivityContext.Provider value={{ items, startActivity, dismiss }}>{children}</ActivityContext.Provider>;
}

export function useActivity(): ActivityContextValue {
  const value = useContext(ActivityContext);
  if (!value) throw new Error('useActivity must be used inside ActivityProvider.');
  return value;
}

export function ActivityCenter() {
  const { items, dismiss } = useActivity();
  return (
    <div className="activity-stack" aria-live="polite" aria-relevant="additions text">
      {items.slice(-4).map((item) => {
        const determinate = item.total !== null && item.total > 0;
        const percent = determinate ? Math.max(0, Math.min(100, (item.current / item.total!) * 100)) : 0;
        return (
          <section className={`activity-card activity-${item.status}`} key={item.id} role="status">
            <div className="activity-card-heading">
              <span className="activity-icon" aria-hidden="true">
                {item.status === 'success' ? <CheckCircle2 size={17} /> : item.status === 'error' ? <AlertCircle size={17} /> : <LoaderCircle size={17} className="activity-spinner" />}
              </span>
              <strong>{item.title}</strong>
              <button className="activity-dismiss" type="button" aria-label="Dismiss activity" onClick={() => dismiss(item.id)}><X size={14} /></button>
            </div>
            <div className="activity-detail" title={item.detail}>{item.detail}</div>
            {item.status === 'running' && (
              <>
                <div className={`activity-progress-track ${determinate ? '' : 'activity-progress-indeterminate'}`} role="progressbar"
                  aria-label={item.title}
                  aria-valuemin={determinate ? 0 : undefined}
                  aria-valuemax={determinate ? 100 : undefined}
                  aria-valuenow={determinate ? Math.round(percent) : undefined}>
                  <span style={determinate ? { width: `${percent}%` } : undefined} />
                </div>
                {determinate && <div className="activity-count">{item.current.toLocaleString()} / {item.total!.toLocaleString()}</div>}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
