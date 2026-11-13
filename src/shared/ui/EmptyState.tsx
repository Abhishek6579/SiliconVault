import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  message: string;
  icon: ReactNode;
  action?: ReactNode;
}

export default function EmptyState({ title, message, icon, action }: EmptyStateProps) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h2>{title}</h2><p>{message}</p>{action && <div className="empty-actions">{action}</div>}</div>;
}
