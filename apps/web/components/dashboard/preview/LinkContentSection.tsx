import { useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSession } from "@/lib/auth/client";
import { useClientConfig } from "@/lib/clientConfig";
import { Trans, useTranslation } from "@/lib/i18n/client";
import { useReaderSettings } from "@/lib/readerSettings";
import { AlertTriangle, Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { ErrorBoundary } from "react-error-boundary";

import {
  BookmarkTypes,
  ZBookmark,
  ZBookmarkedLink,
} from "@karakeep/shared/types/bookmarks";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { READER_FONT_FAMILIES } from "@karakeep/shared/types/readers";
import { getBookmarkDisplayTitle } from "@karakeep/shared/utils/bookmarkUtils";

import ArticleTitleBlock, { useTitleScrolledAway } from "./ArticleTitleBlock";
import { contentRendererRegistry } from "./content-renderers";
import { ICON_CONTROL_CLASS } from "./IconControl";
import LinkViewMenu from "./LinkViewMenu";
import { readerColumnWidth } from "./readerColumn";
import ReaderView from "./ReaderView";
import SavedPageOverview from "./SavedPageOverview";
import SummaryReader from "./SummaryReader";

function CustomRendererErrorFallback({ error }: { error: Error }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <Alert variant="destructive" className="max-w-md">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{t("preview.renderer_error")}</AlertTitle>
        <AlertDescription>
          Failed to load custom content renderer.{" "}
          <details className="mt-2">
            <summary className="cursor-pointer text-xs">
              Technical details
            </summary>
            <code className="mt-1 block text-xs">{error.message}</code>
          </details>
        </AlertDescription>
      </Alert>
    </div>
  );
}

function FullPageArchiveSection({ link }: { link: ZBookmarkedLink }) {
  const archiveAssetId =
    link.fullPageArchiveAssetId ?? link.precrawledArchiveAssetId;
  return (
    <iframe
      sandbox=""
      title={link.url}
      src={`/api/assets/${archiveAssetId}`}
      className="relative h-full min-w-full"
    />
  );
}

function ScreenshotSection({ link }: { link: ZBookmarkedLink }) {
  return (
    <div className="relative h-full min-w-full overflow-y-auto overflow-x-hidden">
      <Image
        alt="screenshot"
        src={`/api/assets/${link.screenshotAssetId}`}
        width={0}
        height={0}
        unoptimized
        sizes="100vw"
        style={{ width: "100%", height: "auto" }}
      />
    </div>
  );
}

function VideoSection({ link }: { link: ZBookmarkedLink }) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0 h-full w-full">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- captions not (yet) available */}
        <video className="m-auto max-h-full max-w-full" controls>
          <source src={`/api/assets/${link.videoAssetId}`} />
          Not supported by your browser
        </video>
      </div>
    </div>
  );
}

function PDFSection({ link }: { link: ZBookmarkedLink }) {
  return (
    <iframe
      title="PDF Viewer"
      src={`/api/assets/${link.pdfAssetId}`}
      className="relative h-full min-w-full"
    />
  );
}

/** Which view of a link is showing. Also read by the details panel beside it. */
export function useLinkSection(bookmark: ZBookmark) {
  const clientConfig = useClientConfig();
  const api = useTRPC();
  const renderers = contentRendererRegistry.getRenderers(
    bookmark,
    clientConfig,
  );
  const link =
    bookmark.content.type === BookmarkTypes.LINK ? bookmark.content : null;
  const videoArticleRenderer = renderers.find(
    (renderer) => renderer.id === "video-article",
  );
  const isInstagram = renderers.some((renderer) => renderer.id === "instagram");
  // An Instagram reel's article is its reader view, not a view of its own.
  const instagramArticle = !!videoArticleRenderer && isInstagram;
  const availableRenderers = instagramArticle
    ? renderers.filter((renderer) => renderer.id !== "video-article")
    : renderers;
  const player = renderers.find(
    (renderer) => renderer.id === "youtube" || renderer.id === "tiktok",
  );
  const { data: videoArticle, isPending: videoArticlePending } = useQuery(
    api.bookmarks.getVideoArticle.queryOptions(
      { bookmarkId: bookmark.id },
      { enabled: !!videoArticleRenderer && !!player },
    ),
  );
  // Without a usable article (too long, failed, never made), open on the
  // player rather than an error.
  const playerFirst =
    !!videoArticleRenderer &&
    !!player &&
    !videoArticlePending &&
    (!videoArticle || videoArticle.status === "failure");
  // A blocked capture's reader view only holds the verification page.
  const readerAvailable =
    instagramArticle ||
    (link?.readerViewStatus !== "unavailable" && !link?.captureBlocked);

  // Instagram's page and embed don't read well; open on the summary.
  let defaultSection = isInstagram
    ? "summary"
    : playerFirst && player
      ? player.id
      : (availableRenderers[0]?.id ?? "cached");
  if (availableRenderers.length === 0 && link) {
    if (link.preferredPreview === "screenshot") {
      defaultSection = "screenshot";
    } else if (link.preferredPreview === "overview" || !readerAvailable) {
      defaultSection = "overview";
    }
  }
  const [requestedSection, setSection] = useQueryState("section", {
    defaultValue: defaultSection,
  });
  // A stale or hand-typed ?section= would open an empty or broken view; only
  // accept views the menu offers.
  const knownSections = new Set(
    [
      ...availableRenderers.map((renderer) => renderer.id),
      isInstagram && "summary",
      "overview",
      readerAvailable && "cached",
      link?.screenshotAssetId && "screenshot",
      link?.pdfAssetId && "pdf",
      (link?.fullPageArchiveAssetId || link?.precrawledArchiveAssetId) &&
        "archive",
      link?.videoAssetId && "video",
    ].filter((value): value is string => !!value),
  );
  const section = knownSections.has(requestedSection)
    ? requestedSection
    : defaultSection;
  return {
    section,
    setSection,
    availableRenderers,
    isInstagram,
    instagramArticle,
    videoArticleRenderer,
    readerAvailable,
  };
}

/** The views that show the page's title themselves. */
export const SECTIONS_WITH_TITLE = ["cached", "overview"];

export default function LinkContentSection({
  bookmark,
  toolbarSlot,
  compactToolbar,
  titleSlot,
  originalUrl,
  onShowContent,
}: {
  bookmark: ZBookmark;
  /** Where the view controls go, which is in the bar above the preview. */
  toolbarSlot?: HTMLElement | null;
  /** Uses short names for the views, for a bar that has little room. */
  compactToolbar?: boolean;
  /** Where the title goes once it has scrolled out of the article. */
  titleSlot?: HTMLElement | null;
  /** The source page, offered by the view controls at phone width. */
  originalUrl?: string | null;
  /** Brings this section back into view, if it's behind another tab. */
  onShowContent?: () => void;
}) {
  const { t } = useTranslation();
  const { settings } = useReaderSettings();
  const {
    section,
    setSection,
    availableRenderers,
    isInstagram,
    instagramArticle,
    videoArticleRenderer,
    readerAvailable,
  } = useLinkSection(bookmark);
  const readingAreaRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const chromeBottom = useCallback(
    () => readingAreaRef.current?.getBoundingClientRect().top ?? 0,
    [],
  );
  const { titleRef, isTitleAway } = useTitleScrolledAway();
  const { data: session } = useSession();
  const isOwner = session?.user?.id === bookmark.userId;

  if (bookmark.content.type != BookmarkTypes.LINK) {
    throw new Error("Invalid content type");
  }

  let content;

  // Check if current section is a custom renderer
  const customRenderer = availableRenderers.find((r) => r.id === section);
  if (customRenderer) {
    const RendererComponent = customRenderer.component;
    content = (
      <ErrorBoundary FallbackComponent={CustomRendererErrorFallback}>
        <RendererComponent bookmark={bookmark} />
      </ErrorBoundary>
    );
  } else if (section === "summary" && isInstagram) {
    content = <SummaryReader bookmark={bookmark} readOnly={!isOwner} />;
  } else if (section === "cached" && instagramArticle && videoArticleRenderer) {
    const RendererComponent = videoArticleRenderer.component;
    content = (
      <ErrorBoundary FallbackComponent={CustomRendererErrorFallback}>
        <RendererComponent bookmark={bookmark} />
      </ErrorBoundary>
    );
  } else if (section === "cached") {
    // Shared with the title, as these size the column in ch.
    const column = {
      fontFamily: READER_FONT_FAMILIES[settings.fontFamily],
      fontSize: `${settings.fontSize}px`,
      maxWidth: readerColumnWidth(settings.fontFamily),
    };
    content = (
      <div
        ref={readingAreaRef}
        className="h-full w-full overflow-y-auto overflow-x-hidden px-3 sm:px-6"
      >
        <div
          ref={columnRef}
          className="mx-auto pt-6 max-sm:pt-4"
          style={column}
        >
          <ArticleTitleBlock
            bookmark={bookmark}
            compactOnPhone
            titleRef={titleRef}
          />
        </div>
        <ReaderView
          className="mx-auto"
          style={{ ...column, lineHeight: settings.lineHeight }}
          bookmarkId={bookmark.id}
          readOnly={!isOwner}
          progressBarStyle={{ height: 2 }}
          // Reaches past the reading area's padding, to both of its edges.
          progressBarClassName="-mx-3 sm:-mx-6"
          progressBarAlwaysVisible
        />
      </div>
    );
  } else if (section === "archive") {
    content = <FullPageArchiveSection link={bookmark.content} />;
  } else if (section === "video") {
    content = <VideoSection link={bookmark.content} />;
  } else if (section === "pdf") {
    content = <PDFSection link={bookmark.content} />;
  } else if (section === "screenshot") {
    content = <ScreenshotSection link={bookmark.content} />;
  } else {
    content = (
      <SavedPageOverview
        link={bookmark.content}
        title={bookmark.title}
        onSelectSection={setSection}
      />
    );
  }

  const controls = (
    <>
      <LinkViewMenu
        bookmark={bookmark}
        link={bookmark.content}
        section={section}
        availableRenderers={availableRenderers}
        isInstagram={isInstagram}
        instagramArticle={instagramArticle}
        readerAvailable={readerAvailable}
        compact={compactToolbar}
        columnRef={columnRef}
        anchorBottom={chromeBottom}
        originalUrl={originalUrl}
        onSelectSection={setSection}
        onShowContent={onShowContent}
      />
      {section === "archive" && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="none"
              aria-label={t("preview.archive_info_label")}
              className={ICON_CONTROL_CLASS}
            >
              <Info className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-sm">
            <p className="text-sm">
              <Trans
                i18nKey="preview.archive_info"
                components={{
                  1: (
                    <Link
                      prefetch={false}
                      href={`/api/assets/${bookmark.content.fullPageArchiveAssetId ?? bookmark.content.precrawledArchiveAssetId}`}
                      download
                      className="font-medium underline"
                    >
                      link
                    </Link>
                  ),
                }}
              />
            </p>
          </TooltipContent>
        </Tooltip>
      )}
    </>
  );

  return (
    <div className="flex h-full w-full min-w-0 flex-col items-center overflow-hidden">
      {toolbarSlot && createPortal(controls, toolbarSlot)}
      {titleSlot &&
        section === "cached" &&
        isTitleAway &&
        createPortal(
          <p className="truncate text-sm font-medium">
            {getBookmarkDisplayTitle(bookmark)}
          </p>,
          titleSlot,
        )}
      <div className="min-h-0 w-full min-w-0 flex-1">{content}</div>
    </div>
  );
}
