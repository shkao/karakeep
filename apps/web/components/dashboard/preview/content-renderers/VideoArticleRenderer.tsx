import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { MarkdownReadonly } from "@/components/ui/markdown/markdown-readonly";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSession } from "@/lib/auth/client";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import { useReaderSettings } from "@/lib/readerSettings";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpenText, ChevronRight, ExternalLink } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import type { ZClientConfig } from "@karakeep/shared/types/config";
import { READER_FONT_FAMILIES } from "@karakeep/shared/types/readers";

import { ContentRenderer } from "./types";
import { tikTokRenderer } from "./TikTokRenderer";
import { youTubeRenderer } from "./YouTubeRenderer";

const INSTAGRAM_VIDEO_PATH = /^\/(reel|reels|tv)\/[^/]+/;

function isInstagramVideo(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      /(^|\.)instagram\.com$/.test(parsed.hostname) &&
      INSTAGRAM_VIDEO_PATH.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

// Any bookmark with a downloaded video, plus known video URLs whose video is
// still downloading, so a new reel opens on the article from the start.
function canRenderVideoArticle(
  bookmark: ZBookmark,
  clientConfig: ZClientConfig,
): boolean {
  if (
    !clientConfig.videoArticle.enabled ||
    bookmark.content.type !== BookmarkTypes.LINK
  ) {
    return false;
  }
  return (
    !!bookmark.content.videoAssetId ||
    isInstagramVideo(bookmark.content.url) ||
    youTubeRenderer.canRender(bookmark, clientConfig) ||
    tikTokRenderer.canRender(bookmark, clientConfig)
  );
}

/** Drops the leading "# " title, which the page shows above the byline. */
function articleBody(content: string): string {
  return content.replace(/^\s*#\s+.*(\r?\n)+/, "");
}

function SourceSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Collapsible className="border-t py-2">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-sm py-2 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronRight
          aria-hidden="true"
          className="size-4 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none"
        />
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-2 pl-6">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function GeneratingState({ message }: { message: string }) {
  return (
    <div className="space-y-4" aria-busy="true">
      <p role="status" aria-live="polite" className="text-muted-foreground">
        {message}
      </p>
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-4 w-1/3" />
      <div className="space-y-2 pt-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}

// The video download runs right after the crawl; past this, a missing video
// means it was skipped or failed, not that it's still coming.
const VIDEO_DOWNLOAD_GRACE_MS = 30 * 60 * 1000;

function VideoArticleRendererComponent({ bookmark }: { bookmark: ZBookmark }) {
  const { t } = useTranslation();
  const api = useTRPC();
  const queryClient = useQueryClient();
  const { settings } = useReaderSettings();
  const { data: session } = useSession();
  const clientConfig = useClientConfig();
  const isOwner = session?.user?.id === bookmark.userId;
  // Without an article, the original player is still worth showing.
  const playerRenderer = [youTubeRenderer, tikTokRenderer].find((renderer) =>
    renderer.canRender(bookmark, clientConfig),
  );
  const Player = playerRenderer?.component;
  const playerFallback = Player ? (
    <div
      className={
        // TikTok's embed is portrait; a 16:9 box would crop it.
        playerRenderer === tikTokRenderer
          ? "mx-auto mt-6 aspect-[9/16] w-full max-w-xs overflow-hidden rounded-md"
          : "mt-6 aspect-video w-full overflow-hidden rounded-md"
      }
    >
      <Player bookmark={bookmark} />
    </div>
  ) : null;

  const videoAssetId =
    bookmark.content.type === BookmarkTypes.LINK
      ? bookmark.content.videoAssetId
      : undefined;
  const [openedAt] = useState(() => Date.now());
  const crawledAt =
    bookmark.content.type === BookmarkTypes.LINK
      ? bookmark.content.crawledAt
      : undefined;
  const videoGaveUp =
    !videoAssetId &&
    !!crawledAt &&
    openedAt - new Date(crawledAt).getTime() > VIDEO_DOWNLOAD_GRACE_MS;

  const { data: article, isPending } = useQuery(
    api.bookmarks.getVideoArticle.queryOptions(
      { bookmarkId: bookmark.id },
      {
        // Poll until the article settles; the worker fills it in.
        refetchInterval: (query) => {
          const status = query.state.data?.status;
          if (status === "success" || status === "failure") return false;
          if (!status && (videoAssetId || videoGaveUp)) return false;
          return 5000;
        },
      },
    ),
  );

  const { mutate: regenerate, isPending: isRegenerating } = useMutation(
    api.bookmarks.regenerateVideoArticle.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries(
          api.bookmarks.getVideoArticle.queryFilter({
            bookmarkId: bookmark.id,
          }),
        ),
      onError: (e) => toast({ description: e.message, variant: "destructive" }),
    }),
  );

  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return null;
  }
  const link = bookmark.content;

  let body: React.ReactNode;
  if (isPending) {
    body = <GeneratingState message={t("preview.video_article.generating")} />;
  } else if (!article && !videoAssetId) {
    body = (
      <>
        {videoGaveUp ? (
          <p className="mt-6 text-sm text-muted-foreground">
            {t("preview.video_article.no_video")}
          </p>
        ) : (
          <GeneratingState
            message={t("preview.video_article.waiting_for_video")}
          />
        )}
        {playerFallback}
      </>
    );
  } else if (!article || article.status === "failure") {
    body = (
      <Alert>
        <AlertTitle>
          {article
            ? t("preview.video_article.failed_title")
            : t("preview.video_article.not_generated")}
        </AlertTitle>
        {article?.error && <AlertDescription>{article.error}</AlertDescription>}
        {isOwner && (
          <Button
            className="mt-3"
            size="sm"
            disabled={isRegenerating}
            onClick={() => regenerate({ bookmarkId: bookmark.id })}
          >
            {article
              ? t("preview.video_article.regenerate")
              : t("preview.video_article.write_article")}
          </Button>
        )}
      </Alert>
    );
    body = (
      <>
        {body}
        {playerFallback}
      </>
    );
  } else if (article.status === "pending" || !article.content) {
    body = <GeneratingState message={t("preview.video_article.generating")} />;
  } else {
    body = (
      <>
        <header className="mb-6 space-y-3">
          <h1 className="text-balance text-3xl font-semibold leading-tight">
            {article.title ?? link.title ?? link.url}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {(link.author ?? link.publisher) && (
              <span>{link.author ?? link.publisher}</span>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" tabIndex={0}>
                  {t("preview.video_article.generated_badge")}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {t("preview.video_article.generated_tooltip")}
              </TooltipContent>
            </Tooltip>
          </div>
          {!article.transcript && (
            <p className="text-sm text-muted-foreground">
              {t("preview.video_article.no_speech")}
            </p>
          )}
        </header>
        <MarkdownReadonly className="max-w-none">
          {articleBody(article.content)}
        </MarkdownReadonly>
        <footer className="mt-10">
          {videoAssetId && (
            <SourceSection title={t("preview.video_article.watch_video")}>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption -- the transcript below serves as captions */}
              <video
                className="max-h-[70vh] max-w-full rounded-md"
                controls
                preload="none"
              >
                <source src={`/api/assets/${videoAssetId}`} />
              </video>
            </SourceSection>
          )}
          {article.caption && (
            <SourceSection title={t("preview.video_article.original_caption")}>
              <p className="whitespace-pre-wrap text-sm">{article.caption}</p>
            </SourceSection>
          )}
          {article.transcript && (
            <SourceSection title={t("preview.video_article.transcript")}>
              <p className="whitespace-pre-wrap text-sm">
                {article.transcript}
              </p>
            </SourceSection>
          )}
          <div className="flex flex-wrap items-center gap-4 border-t pt-4 text-sm">
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
            >
              {t("preview.video_article.open_original")}
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </a>
            {isOwner && (
              <Button
                variant="ghost"
                size="sm"
                disabled={isRegenerating}
                onClick={() => regenerate({ bookmarkId: bookmark.id })}
              >
                {t("preview.video_article.regenerate")}
              </Button>
            )}
          </div>
        </footer>
      </>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden px-4 py-8 sm:px-6">
      <article
        className="mx-auto max-w-[68ch]"
        style={{
          fontFamily: READER_FONT_FAMILIES[settings.fontFamily],
          fontSize: `${settings.fontSize}px`,
          lineHeight: settings.lineHeight,
        }}
      >
        {body}
      </article>
    </div>
  );
}

export const videoArticleRenderer: ContentRenderer = {
  id: "video-article",
  name: "Article",
  icon: BookOpenText,
  canRender: canRenderVideoArticle,
  component: VideoArticleRendererComponent,
  // Above the video embeds (10), so a video opens as an article.
  priority: 20,
};
