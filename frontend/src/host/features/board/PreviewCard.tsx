import { memo, useEffect, useRef } from "react";
import { config } from "../../config";
import { regions } from "../../errors/regions";
import type { Screen } from "../../services/api";
import { UNREACHABLE_MESSAGE } from "../../services/PreviewConnection";
import { previewOrigin } from "../../state/viewport";
import { useAppState, useServices } from "../../ui/AppContext";
import { RegionBoundary } from "../../ui/RegionBoundary";

const { width: W, height: H } = config.preview;

export const PreviewCard = memo(function PreviewCard({ screen, index }: { screen: Screen; index: number }) {
  const { previews } = useServices();
  const origin = previewOrigin(index);
  const connected = useAppState((s) => s.previews[screen.id]?.connected ?? false);
  const active = useAppState((s) => s.activePreviewId === screen.id);
  const failed = useAppState((s) => regions.preview(screen.id).id in s.failures);

  return (
    <section className={`preview ${active ? "is-active" : ""}`} style={{ left: origin.x, top: origin.y, width: W, height: H }}>
      <header className="preview__header">
        <span className="preview__name">{screen.name}</span>
        {!connected && !failed && <span className="preview__status">connecting…</span>}
        <PageErrorBadge previewId={screen.id} />
      </header>
      <div className="preview__body">
        <RegionBoundary region={regions.preview(screen.id)} onRetry={() => previews.retry(screen.id)} title={previewErrorTitle}>
          <PreviewFrame screen={screen} />
        </RegionBoundary>
      </div>
    </section>
  );
});

const previewErrorTitle = (message: string) => (message === UNREACHABLE_MESSAGE ? message : "This preview hit an error");

function PreviewFrame({ screen }: { screen: Screen }) {
  const { previews } = useServices();
  const ref = useRef<HTMLIFrameElement>(null);
  const mount = useAppState((s) => s.previews[screen.id]?.mount ?? 0);

  useEffect(() => previews.attach(screen.id, ref.current!, screen.url), [previews, screen.id, screen.url, mount]);

  return (
    <iframe
      key={mount}
      ref={ref}
      className="preview__frame"
      src={screen.url}
      title={screen.name}
      width={W}
      height={H}
      // No top navigation or popups: a page can never take over the host.
      sandbox="allow-scripts allow-same-origin allow-forms"
    />
  );
}

function PageErrorBadge({ previewId }: { previewId: string }) {
  const errors = useAppState((s) => s.previews[previewId]?.pageErrors);
  if (!errors?.length) return null;
  return (
    <span className="page-error" tabIndex={0} data-no-pan>
      Page error{errors.length > 1 ? ` ×${errors.length}` : ""}
      <span className="page-error__tip" role="tooltip">
        {errors.slice(-5).map((m, i) => (
          <span key={i}>{m}</span>
        ))}
      </span>
    </span>
  );
}
