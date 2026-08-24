import * as React from "react";
import type { Context } from "@deepseek-ai/cordis";
import type { ConvViewProps } from "@deepseek-ai/dsh-client-ui-conversation/client";
import type {} from "@deepseek-ai/dsh-client-runtime/client";

import {
  DESIGN_STUDIO_HOST_CHANNEL,
  designStudioAskAiPrompt,
  isDesignStudioHostMessage,
} from "../../../../packages/design-studio/src/bridge";

export type DeepSeekDesignStudioClientOptions = {
  routeRoot: `/${string}`;
  viewId: string;
  label: string;
  studioTitle: string;
  projectSuffix?: string;
};

export const inject = ["slots"];

export function createDeepSeekDesignStudioClient(options: DeepSeekDesignStudioClientOptions) {
  function StudioView({ sessionId, useWorkspaces, inputActions }: ConvViewProps) {
    const iframeRef = React.useRef<HTMLIFrameElement>(null);
    const workspace = useWorkspaces((state) => state.items.find((item) => item.sessionIds.includes(sessionId)));
    const projectId = `${String(sessionId)}${options.projectSuffix ?? ""}`;
    const pageKey = `ipollowork:${projectId}:lastPage`;

    // Restore the last active slide on a genuine remount (view switch) so the
    // same page reappears. We read sessionStorage ONCE via a lazy useState (not
    // on every render): re-renders of this component must not re-read the value,
    // because a deck-changed on slide navigation updates sessionStorage and would
    // otherwise change the iframe src and reload the whole Studio (a visible
    // flash of the panel). Caching it keeps the src stable while flipping slides;
    // only a genuine remount re-initializes the lazy state and restores the page.
    const [initialPage] = React.useState<number | null>(() => {
      try {
        const raw = window.sessionStorage.getItem(pageKey);
        const value = raw === null ? NaN : Number(raw);
        if (Number.isInteger(value) && value >= 0) return value;
      } catch {
        // sessionStorage can be unavailable (e.g. in a sandboxed context).
      }
      return null;
    });

    React.useEffect(() => {
      const receive = (event: MessageEvent) => {
        if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;
        if (!isDesignStudioHostMessage(event.data)) return;
        if (event.data.type === "deck-changed") {
          const page = event.data.page;
          try {
            window.sessionStorage.setItem(pageKey, String(page));
          } catch {
            // sessionStorage can be unavailable (e.g. in a sandboxed context); best-effort.
          }
          return;
        }
        if (event.data.type === "ask-document-ai") {
          const _curPage = (event.data as { currentPage?: string }).currentPage || "";
          const mode = (event.data as { mode?: "ask" | "review" }).mode || "ask";
          if (mode === "review") {
            inputActions.setDraft([
              `Do a full global review of the ${options.studioTitle} document.`,
              `Project: design/${projectId}`,
              "Read manifest.json, then read its entry file and linked design-tokens.css completely.",
              "Review ALL slides/views for: content accuracy and completeness, structural and pacing problems, visual/typographic consistency, copy errors or typos, and any violation of the design-tokens.css theme contract.",
              "Output a findings list grouped by slide/view. For each finding give: severity (MUST_FIX or SUGGEST), the problem, and a concrete fix suggestion. Keep the existing structure unless a fix requires a deliberate redesign.",
              "",
              "My focus/priority:",
            ].join("\n"));
            return;
          }
          inputActions.setDraft([
            `Help me improve the current ${options.studioTitle} document.`,
            `Project: design/${projectId}`,
            ...(_curPage ? [`当前页：${_curPage}`] : []),
            "Read manifest.json, then read its entry file and linked design-tokens.css before editing.",
            "Preserve the existing structure unless I request a redesign.",
            "My requested change:",
          ].join("\n"));
          return;
        }
        if (event.data.type === "ask-page-ai") {
          const pageIndex = event.data.pageIndex;
          const pageTitle = (event.data as { pageTitle?: string }).pageTitle || "";
          const pageLabel = pageTitle ? `第 ${pageIndex + 1} 页：${pageTitle}` : `第 ${pageIndex + 1} 页`;
          inputActions.setDraft([
            `Help me improve a single slide of the ${options.studioTitle} document.`,
            `Project: design/${projectId}`,
            `Focus page: ${pageLabel}`,
            "Read manifest.json, then read its entry file and linked design-tokens.css before editing.",
            "Scope your suggestions ONLY to that slide. Preserve the existing structure and the linked design-tokens.css theme contract unless I request a redesign.",
            "My requested change:",
          ].join("\n"));
          return;
        }
        inputActions.setDraft(designStudioAskAiPrompt(event.data.request));
      };
      window.addEventListener("message", receive);
      return () => window.removeEventListener("message", receive);
    }, [inputActions, projectId, pageKey]);

    if (!workspace) {
      return (
        <div style={emptyStyle}>
          <strong>{options.studioTitle} needs a workspace</strong>
          <span>Open this conversation from a registered DeepSeek Harness workspace.</span>
        </div>
      );
    }

    const query = new URLSearchParams({ workspaceId: String(workspace.workspaceId), sessionId: String(sessionId) });
    if (initialPage !== null) query.set("page", String(initialPage));
    return (
      <section style={shellStyle} aria-label={`iPolloWork ${options.studioTitle}`}>
        <iframe
          ref={iframeRef}
          title={`iPolloWork ${options.studioTitle}`}
          src={`${options.routeRoot}/studio/?${query.toString()}`}
          style={frameStyle}
          sandbox="allow-downloads allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
        />
      </section>
    );
  }

  return function apply(ctx: Context): void {
    ctx.slots.inject("conversation.view", () => ctx.slots.register({
      name: "conversation.view",
      id: options.viewId,
      order: 20,
      label: options.label,
    }, StudioView));
  };
}

export const apply = createDeepSeekDesignStudioClient({
  routeRoot: "/ipollowork-design",
  viewId: "ipollowork-design-studio",
  label: "Design",
  studioTitle: "DeepSeek iDesign",
});

const shellStyle: React.CSSProperties = { display: "flex", flexDirection: "column", width: "100%", height: "100%", minHeight: 0, background: "var(--color-background, #f6f7f9)" };
const frameStyle: React.CSSProperties = { flex: 1, width: "100%", minHeight: 0, border: 0, background: "#f6f7f9" };
const emptyStyle: React.CSSProperties = { display: "grid", placeContent: "center", gap: 8, height: "100%", padding: 32, color: "#70757f", textAlign: "center" };
