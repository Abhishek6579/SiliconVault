import { X } from 'lucide-react';

interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

export default function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  if (!message) return null;
  return <div className="error-banner"><span>{message}</span><button onClick={onDismiss} aria-label="Dismiss error"><X size={15} /></button></div>;
}
