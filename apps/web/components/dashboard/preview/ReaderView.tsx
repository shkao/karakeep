import { useEffect, useRef } from "react";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { FileX } from "lucide-react";
import { useQueryState } from "nuqs";

import BookmarkHTMLHighlighter from "@karakeep/shared-react/components/BookmarkHtmlHighlighter";
import ScrollProgressTracker from "@karakeep/shared-react/components/ScrollProgressTracker";
import {
  useCreateHighlight,
  useUpdateHighlight,
} from "@karakeep/shared-react/hooks/highlights";
import { useReadingProgress } from "@karakeep/shared-react/hooks/reading-progress";
import { useTRPC } from "@karakeep/shared-react/trpc";
import type { ReadingPosition } from "@karakeep/shared/utils/reading-progress-dom";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { getReadingPosition } from "@karakeep/shared/utils/reading-progress-dom";

import { useDeleteHighlightWithUndo } from "../highlights/useDeleteHighlightWithUndo";
import BookmarkLoadError, { retryBookmarkQuery } from "./BookmarkLoadError";
import { flashHighlight } from "./highlights";
import ReadingProgressBanner from "./ReadingProgressBanner";

export default function ReaderView({
  bookmarkId,
  className,
  style,
  readOnly,
  progressBarStyle,
  progressBarClassName,
  progressBarAlwaysVisible,
}: {
  bookmarkId: string;
  className?: string;
  style?: React.CSSProperties;
  readOnly: boolean;
  progressBarStyle?: React.CSSProperties;
  progressBarClassName?: string;
  progressBarAlwaysVisible?: boolean;
}) {
  const { t } = useTranslation();
  const api = useTRPC();
  const { data: highlights } = useQuery(
    api.highlights.getForBookmark.queryOptions({
      bookmarkId,
    }),
  );
  const retriedImages = useRef(new Set<string>());
  useEffect(() => {
    retriedImages.current.clear();
  }, [bookmarkId]);
  const {
    data: cached,
    isPending: isCachedContentLoading,
    error: cachedContentError,
    isFetching: isFetchingCachedContent,
    refetch: refetchCachedContent,
  } = useQuery(
    api.bookmarks.getBookmark.queryOptions(
      {
        bookmarkId,
        includeContent: true,
      },
      {
        retry: retryBookmarkQuery,
        // Saved images use signed URLs that expire; refresh them while the
        // reader stays open.
        refetchInterval: (query) => {
          const content = query.state.data?.content;
          return content?.type === BookmarkTypes.LINK &&
            content.htmlContent?.includes("/public/assets/")
            ? 30 * 60 * 1000
            : false;
        },
        select: (data) =>
          data.content.type == BookmarkTypes.LINK
            ? {
                // Only a verification page was saved; don't show it.
                html: data.content.captureBlocked
                  ? null
                  : data.content.htmlContent,
                blocked: !!data.content.captureBlocked,
              }
            : { html: null, blocked: false },
      },
    ),
  );
  const cachedContent = cached === undefined ? undefined : cached.html;

  // An image whose signed URL expired: refetch fresh URLs once, then retry it.
  const retryImage = (event: React.SyntheticEvent<HTMLDivElement>) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) return;
    const url = new URL(image.src);
    const match = url.pathname.match(/\/public\/assets\/([\w-]+)$/);
    if (!match || !url.searchParams.has("token")) return;
    if (retriedImages.current.has(match[1])) return;
    retriedImages.current.add(match[1]);
    void refetchCachedContent().then(() => {
      if (image.isConnected) image.setAttribute("src", image.src);
    });
  };

  const {
    showBanner,
    bannerPercent,
    onContinue,
    onDismiss,
    restorePosition,
    readingProgressOffset,
    readingProgressAnchor,
    onSavePosition,
    onScrollPositionChange,
  } = useReadingProgress({
    bookmarkId,
  });

  // The highlights page links to a passage with ?highlight=<id>. Once it's drawn,
  // scroll to it and flash it, once per id.
  const [focusHighlightId] = useQueryState("highlight");
  const focusedIdRef = useRef<string | null>(null);
  const trackerRef = useRef<HTMLDivElement>(null);
  // Where the jump landed, which isn't where they've read up to. Reading on
  // from there saves as usual.
  const jumpOffsetRef = useRef<number | null>(null);
  useEffect(() => {
    if (!focusHighlightId || focusedIdRef.current === focusHighlightId) {
      return;
    }
    // Waits for the highlighter to settle, as every redraw replaces the spans.
    const frame = requestAnimationFrame(() => {
      const selector = `[data-highlight-id="${CSS.escape(focusHighlightId)}"]`;
      const span = Array.from(
        document.querySelectorAll<HTMLElement>(selector),
      ).find((el) => el.offsetParent !== null);
      if (!span) {
        return;
      }
      focusedIdRef.current = focusHighlightId;
      span.scrollIntoView({ block: "center" });
      if (trackerRef.current) {
        jumpOffsetRef.current =
          getReadingPosition(trackerRef.current)?.offset ?? null;
      }
      flashHighlight(focusHighlightId);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusHighlightId, highlights, cachedContent]);

  // They came for one passage, so don't offer to take them elsewhere (as on mobile).
  useEffect(() => {
    if (focusHighlightId) {
      onDismiss();
    }
  }, [focusHighlightId, onDismiss]);

  const onSaveReadingPosition = (position: ReadingPosition) => {
    if (position.offset === jumpOffsetRef.current) {
      return;
    }
    onSavePosition(position);
  };

  // Once they've scrolled off the jumped-to paragraph, coming back to it counts.
  const onReadingPositionChange = (position: ReadingPosition) => {
    if (position.offset !== jumpOffsetRef.current) {
      jumpOffsetRef.current = null;
    }
    onScrollPositionChange(position);
  };

  const onHighlightError = () => {
    toast({
      variant: "destructive",
      description: t("common.something_went_wrong"),
    });
  };

  // The highlight appearing in the text says it worked.
  const { mutate: createHighlight } = useCreateHighlight({
    onError: onHighlightError,
  });

  const { mutate: updateHighlight } = useUpdateHighlight({
    onSuccess: () => {
      toast({ description: t("toasts.highlights.updated") });
    },
    onError: onHighlightError,
  });

  const { mutate: deleteHighlight } = useDeleteHighlightWithUndo();

  let content;
  if (isCachedContentLoading) {
    content = <FullPageSpinner />;
  } else if (cachedContentError && cachedContent === undefined) {
    content = (
      <div className="p-4 font-sans">
        <BookmarkLoadError
          error={cachedContentError}
          onRetry={() => refetchCachedContent()}
          isRetrying={isFetchingCachedContent}
        />
      </div>
    );
  } else if (!cachedContent) {
    content = (
      <div className="flex h-full w-full items-center justify-center p-4 font-sans">
        <div className="max-w-sm space-y-4 text-center">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <FileX className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-medium text-foreground">
              {t("preview.fetch_error_title")}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {cached?.blocked
                ? t("preview.capture_blocked")
                : t("preview.fetch_error_description")}
            </p>
          </div>
        </div>
      </div>
    );
  } else {
    content = (
      <ScrollProgressTracker
        ref={trackerRef}
        onSavePosition={onSaveReadingPosition}
        onScrollPositionChange={onReadingPositionChange}
        restorePosition={restorePosition}
        readingProgressOffset={readingProgressOffset}
        readingProgressAnchor={readingProgressAnchor}
        showProgressBar
        progressBarStyle={progressBarStyle}
        progressBarClassName={cn("print:hidden", progressBarClassName)}
        progressBarFillClassName="bg-foreground/50"
        progressBarAlwaysVisible={progressBarAlwaysVisible}
      >
        {showBanner && (
          <ReadingProgressBanner
            percent={bannerPercent}
            onContinue={onContinue}
            onDismiss={onDismiss}
          />
        )}
        <div onErrorCapture={retryImage}>
          <BookmarkHTMLHighlighter
            className={className}
            style={style}
            htmlContent={cachedContent || ""}
            highlights={highlights?.highlights ?? []}
            readOnly={readOnly}
            onDeleteHighlight={(h) =>
              deleteHighlight({
                highlightId: h.id,
              })
            }
            onUpdateHighlight={(h) =>
              updateHighlight({
                highlightId: h.id,
                color: h.color,
                note: h.note,
              })
            }
            onHighlight={(h) =>
              createHighlight({
                startOffset: h.startOffset,
                endOffset: h.endOffset,
                color: h.color,
                bookmarkId,
                text: h.text,
                prefix: h.prefix ?? null,
                suffix: h.suffix ?? null,
                note: h.note ?? null,
              })
            }
          />
        </div>
      </ScrollProgressTracker>
    );
  }
  return content;
}
