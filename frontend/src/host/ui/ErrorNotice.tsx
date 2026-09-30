interface Props {
  title?: string;
  message?: string;
  onRetry(): void;
  compact?: boolean;
}

export function ErrorNotice({ title = "Something went wrong", message, onRetry, compact }: Props) {
  return (
    <div className={compact ? "error-notice error-notice--compact" : "error-notice"} role="alert" data-no-pan>
      <strong>{title}</strong>
      {message && !compact && <span className="error-notice__message">{message}</span>}
      <button type="button" className="btn btn--small" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
