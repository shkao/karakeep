import { ZBookmark } from "@karakeep/shared/types/bookmarks";
import type { ZClientConfig } from "@karakeep/shared/types/config";

export interface ContentRenderer {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  canRender: (bookmark: ZBookmark, clientConfig: ZClientConfig) => boolean;
  component: React.ComponentType<{ bookmark: ZBookmark }>;
  priority?: number;
}

export interface ContentRendererRegistry {
  register: (renderer: ContentRenderer) => void;
  getRenderers: (
    bookmark: ZBookmark,
    clientConfig: ZClientConfig,
  ) => ContentRenderer[];
  getAllRenderers: () => ContentRenderer[];
}
