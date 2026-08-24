import * as React from "react";
import { GripVertical, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { DESIGN_MESSAGE_CHANNEL, buildDeckThumbnailDocument } from "./design-html-runtime";

const THUMBNAIL_STAGE_WIDTH = 1600;
const THUMBNAIL_STAGE_HEIGHT = 900;
const THUMBNAIL_MIN_WIDTH = 120;
const THUMBNAIL_MAX_WIDTH = 280;

type DeckThumbnailRailProps = {
  deckIndex: number;
  deckTotal: number;
  source: string;
  templateTokenCss: string;
  frameRevision: string;
  onJump: (index: number) => void;
};

// A left rail that lists a 16:9 thumbnail for every slide of the deck. Each
// thumbnail reuses the SAME deck document as the main preview
// (buildDesignPreviewDocument) and, on load, is navigated to its slide index via
// a deck-navigate message, so it renders a slide exactly like the deck does.
// Thumbnails use a namespaced frameRevision so their deck reports never
// overwrite the host's real deck state. The rail is collapsible and its width
// can be dragged; clicking a thumbnail jumps the deck via onJump.
export function DeckThumbnailRail({
  deckIndex,
  deckTotal,
  source,
  templateTokenCss,
  frameRevision,
  onJump,
}: DeckThumbnailRailProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [railWidth, setRailWidth] = React.useState(168);
  const [activeIndex, setActiveIndex] = React.useState(deckIndex);
  const dragStartRef = React.useRef<{ startX: number; startWidth: number } | null>(null);

  // The wallpaper/report-frame revision is shared so the deck runtime in each
  // thumbnail renders the same content; we namespace it per-thumbnail so the
  // deck messages these iframes post up to the host are ignored.
  const thumbFrameRevision = React.useMemo(() => `thumb:${frameRevision}`, [frameRevision]);

  // Keep the rail highlight in sync with the deck's reported active slide.
  React.useEffect(() => {
    setActiveIndex(deckIndex);
  }, [deckIndex]);

  const beginDrag = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragStartRef.current = { startX: event.clientX, startWidth: railWidth };
    const onMove = (moveEvent: PointerEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      const next = Math.max(THUMBNAIL_MIN_WIDTH, Math.min(THUMBNAIL_MAX_WIDTH, start.startWidth + (moveEvent.clientX - start.startX)));
      setRailWidth(next);
    };
    const onUp = () => {
      dragStartRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [railWidth]);

  const thumbnailWidth = railWidth - 16;
  const thumbnailHeight = Math.round((thumbnailWidth * THUMBNAIL_STAGE_HEIGHT) / THUMBNAIL_STAGE_WIDTH);
  const thumbnailScale = thumbnailWidth / THUMBNAIL_STAGE_WIDTH;

  if (collapsed) {
    return (
      <div className="flex shrink-0 flex-col items-center gap-2 border-r border-border bg-background/60 py-2" data-testid="deck-thumbnail-rail">
        <button
          type="button"
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => setCollapsed(false)}
          title="Show slide thumbnails"
          aria-label="Show slide thumbnails"
        >
          <PanelLeftOpen className="size-4" />
        </button>
        <span className="text-[10px] font-medium tabular-nums text-muted-foreground">{deckTotal}</span>
      </div>
    );
  }

  return (
    <div
      className="relative flex shrink-0 flex-col border-r border-border bg-background/60"
      style={{ width: railWidth }}
      data-testid="deck-thumbnail-rail"
    >
      <div className="flex shrink-0 items-center gap-1 px-1.5 py-1.5">
        <span className="min-w-0 flex-1 truncate pl-1 text-[11px] font-semibold text-muted-foreground">Slides</span>
        <button
          type="button"
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => setCollapsed(true)}
          title="Hide slide thumbnails"
          aria-label="Hide slide thumbnails"
        >
          <PanelLeftClose className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {Array.from({ length: deckTotal }).map((_, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              key={index}
              type="button"
              onClick={() => onJump(index)}
              className={cnThumb(
                "group relative mb-2 block w-full overflow-hidden rounded-lg border transition-all",
                isActive
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-border/70 hover:border-foreground/30",
              )}
              style={{ height: thumbnailHeight }}
              title={`Go to slide ${index + 1}`}
              aria-label={`Go to slide ${index + 1}`}
              aria-current={isActive ? "true" : undefined}
            >
              <iframe
                srcDoc={buildDeckThumbnailDocument(source, templateTokenCss, thumbFrameRevision)}
                className="pointer-events-none select-none border-0"
                style={{
                  width: THUMBNAIL_STAGE_WIDTH,
                  height: THUMBNAIL_STAGE_HEIGHT,
                  transform: `scale(${thumbnailScale})`,
                  transformOrigin: "top left",
                }}
                title={`Slide ${index + 1} thumbnail`}
                sandbox="allow-scripts allow-same-origin"
                loading="lazy"
                onLoad={(event) => {
                  const frameWindow = event.currentTarget.contentWindow;
                  if (!frameWindow) return;
                  frameWindow.postMessage({
                    channel: DESIGN_MESSAGE_CHANNEL,
                    type: "deck-navigate",
                    direction: "index",
                    index,
                    viewRevision: "",
                  }, "*");
                }}
              />
              <span className="absolute bottom-1 right-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
                {index + 1}
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={beginDrag}
        className="group absolute -right-1 top-0 flex h-full w-2 cursor-col-resize items-center justify-center"
        style={{ touchAction: "none" }}
        title="Drag to resize"
      >
        <div className="h-8 w-0.5 rounded bg-border/70 opacity-0 transition-opacity group-hover:opacity-100" />
        <GripVertical className="absolute size-3.5 text-muted-foreground/60" />
      </div>
    </div>
  );
}

function cnThumb(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
