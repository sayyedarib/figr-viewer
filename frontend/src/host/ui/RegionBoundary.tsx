import { Component, type ErrorInfo, type ReactNode } from "react";
import type { Region } from "../errors/regions";
import { useAppState, useServices } from "./AppContext";
import { ErrorNotice } from "./ErrorNotice";

interface Props {
  region: Region;
  onRetry: () => void;
  /** "panel" shows the error in place; "none" renders nothing (the region's error is shown elsewhere). */
  fallback?: "panel" | "none";
  /** Heading for the error; a function lets the heading depend on what failed. */
  title?: string | ((message: string) => string);
  children: ReactNode;
}

/**
 * The React face of a region. Render errors below it and errors reported to the
 * registry from handlers, timers or responses all end up in the same failure record,
 * so the same error UI and the same single report() follow wherever the throw happened.
 */
export function RegionBoundary({ region, onRetry, fallback = "panel", title, children }: Props) {
  const { errors } = useServices();
  const failure = useAppState((s) => s.failures[region.id]);
  const retry = () => {
    errors.reset(region.id);
    onRetry();
  };
  const message = failure?.message ?? "";
  const heading = typeof title === "function" ? title(message) : title;
  const notice = fallback === "panel" ? <ErrorNotice title={heading} message={heading === message ? undefined : message} onRetry={retry} /> : null;
  return (
    <Boundary failed={!!failure} fallback={notice} onError={(err) => errors.fail(region, err)}>
      {children}
    </Boundary>
  );
}

interface BoundaryProps {
  failed: boolean;
  fallback: ReactNode;
  onError(error: Error): void;
  children: ReactNode;
}

interface BoundaryState {
  crashed: boolean;
  wasFailed: boolean;
}

class Boundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { crashed: false, wasFailed: false };

  static getDerivedStateFromError(): Partial<BoundaryState> {
    return { crashed: true };
  }

  /** Once the region's failure is cleared (Retry), render children again. */
  static getDerivedStateFromProps(props: BoundaryProps, state: BoundaryState): Partial<BoundaryState> {
    if (state.wasFailed && !props.failed) return { crashed: false, wasFailed: false };
    return { wasFailed: props.failed };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError(error);
  }

  render() {
    return this.props.failed || this.state.crashed ? this.props.fallback : this.props.children;
  }
}
