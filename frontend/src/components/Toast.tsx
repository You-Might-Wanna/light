import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ApiRequestError } from '../lib/api';

interface Toast {
  id: string;
  type: 'error' | 'success' | 'info';
  message: string;
  requestId?: string;
}

interface ToastContextValue {
  showToast: (type: Toast['type'], message: string, requestId?: string) => void;
  showError: (error: unknown) => void;
  showSuccess: (message: string) => void;
  dismissToast: (id: string) => void;
  /** Fields currently flashing due to validation errors */
  flashingFields: Set<string>;
  /** Check if a field is currently flashing */
  isFieldFlashing: (fieldName: string) => boolean;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [flashingFields, setFlashingFields] = useState<Set<string>>(new Set());

  const flashFields = useCallback((fields: string[]) => {
    if (fields.length === 0) return;

    setFlashingFields(new Set(fields));

    // Clear flash after 3 seconds
    setTimeout(() => {
      setFlashingFields(new Set());
    }, 3000);
  }, []);

  const showToast = useCallback((type: Toast['type'], message: string, requestId?: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, message, requestId }]);

    // Auto-dismiss after 8 seconds (longer for errors with request ID)
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, requestId ? 12000 : 8000);
  }, []);

  const showError = useCallback((error: unknown) => {
    if (error instanceof ApiRequestError) {
      showToast('error', error.message, error.requestId);
      // Flash invalid fields if present
      if (error.fields && error.fields.length > 0) {
        flashFields(error.fields);
      }
    } else if (error instanceof Error) {
      showToast('error', error.message);
    } else if (typeof error === 'string') {
      showToast('error', error);
    } else {
      showToast('error', 'An unexpected error occurred');
    }
  }, [showToast, flashFields]);

  const showSuccess = useCallback((message: string) => {
    showToast('success', message);
  }, [showToast]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const isFieldFlashing = useCallback((fieldName: string) => {
    return flashingFields.has(fieldName);
  }, [flashingFields]);

  return (
    <ToastContext.Provider value={{ showToast, showError, showSuccess, dismissToast, flashingFields, isFieldFlashing }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}

interface ToastItemProps {
  toast: Toast;
  onDismiss: () => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const bgColor = {
    error: 'bg-red-50 border-red-200',
    success: 'bg-green-50 border-green-200',
    info: 'bg-blue-50 border-blue-200',
  }[toast.type];

  const iconColor = {
    error: 'text-red-400',
    success: 'text-green-400',
    info: 'text-blue-400',
  }[toast.type];

  const textColor = {
    error: 'text-red-800',
    success: 'text-green-800',
    info: 'text-blue-800',
  }[toast.type];

  const refColor = {
    error: 'text-red-600',
    success: 'text-green-600',
    info: 'text-blue-600',
  }[toast.type];

  return (
    <div
      className={`${bgColor} border rounded-lg shadow-lg p-4 animate-slide-in-right`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 ${iconColor}`}>
          {toast.type === 'error' && (
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          )}
          {toast.type === 'success' && (
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          )}
          {toast.type === 'info' && (
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${textColor}`}>{toast.message}</p>
          {toast.requestId && (
            <p className={`mt-1 text-xs ${refColor}`}>
              Reference: <code className="font-mono">{toast.requestId}</code>
            </p>
          )}
        </div>
        <button
          onClick={onDismiss}
          className={`flex-shrink-0 ${iconColor} hover:opacity-70`}
        >
          <span className="sr-only">Dismiss</span>
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
