import type { AgentEvent, ElementBox, LiveProps, NodeId } from "../shared/protocol";
import { measure } from "./boxes";
import { readLiveProps } from "./liveProps";
import type { NodeRegistry } from "./registry";

const LIVE_INTERVAL_MS = 150;

/**
 * Streams geometry and live styles for the handful of elements the host is showing.
 *
 * Polling on animation frames catches every way a box can move (page scroll, inner
 * scroll areas, resize, layout shifts, transitions) with one mechanism, and only
 * changes are posted. Cost is a few getBoundingClientRect calls per frame.
 */
export class Tracker {
  private watched: NodeId[] = [];
  private inspected: NodeId[] = [];
  private readonly lastBox = new Map<NodeId, string>();
  private readonly lastLive = new Map<NodeId, string>();
  private lastLiveAt = 0;
  private frame = 0;

  constructor(
    private readonly registry: NodeRegistry,
    private readonly emit: (e: AgentEvent) => void,
  ) {}

  watch(ids: NodeId[]) {
    this.watched = ids;
    this.lastBox.clear();
    this.schedule();
  }

  inspect(ids: NodeId[]) {
    this.inspected = ids;
    this.lastLive.clear();
    this.lastLiveAt = 0;
    this.schedule();
  }

  private schedule() {
    if (!this.frame && (this.watched.length || this.inspected.length)) this.frame = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number) => {
    this.frame = 0;
    try {
      this.flushBoxes();
      if (now - this.lastLiveAt >= LIVE_INTERVAL_MS) {
        this.lastLiveAt = now;
        this.flushLive();
      }
    } finally {
      this.schedule();
    }
  };

  private flushBoxes() {
    const changed: Record<NodeId, ElementBox | null> = {};
    let any = false;
    for (const id of this.watched) {
      const el = this.registry.get(id);
      const box = el ? measure(el) : null;
      const sig = JSON.stringify(box);
      if (this.lastBox.get(id) === sig) continue;
      this.lastBox.set(id, sig);
      changed[id] = box;
      any = true;
    }
    if (any) this.emit({ type: "boxes", boxes: changed });
  }

  private flushLive() {
    const changed: Record<NodeId, LiveProps> = {};
    let any = false;
    for (const id of this.inspected) {
      const el = this.registry.get(id);
      if (!el) continue;
      const props = readLiveProps(el);
      const sig = JSON.stringify(props);
      if (this.lastLive.get(id) === sig) continue;
      this.lastLive.set(id, sig);
      changed[id] = props;
      any = true;
    }
    if (any) this.emit({ type: "live", props: changed });
  }
}
