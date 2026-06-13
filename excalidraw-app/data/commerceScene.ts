import type {
  ExcalidrawImperativeAPI,
  BinaryFiles,
} from "@excalidraw/excalidraw/types";

/**
 * Bridge between the Excalidraw editor and the commerce "cloud scenes" feature.
 *
 * App.tsx registers the imperative API here once it is ready; the commerce
 * account widget (mounted as a sibling overlay) then reads/writes the live
 * scene without needing to be a child of `<Excalidraw>`.
 */

let api: ExcalidrawImperativeAPI | null = null;

export const registerExcalidrawAPI = (
  instance: ExcalidrawImperativeAPI | null,
): void => {
  api = instance;
};

export const hasExcalidrawAPI = (): boolean => api !== null;

export interface SerializedScene {
  elements: unknown[];
  files: BinaryFiles;
  appState: { viewBackgroundColor?: string };
}

/** Snapshot the current drawing into a plain, JSON-serializable object. */
export const captureCurrentScene = (): SerializedScene | null => {
  if (!api) {
    return null;
  }
  const appState = api.getAppState();
  return {
    elements: api.getSceneElements() as unknown[],
    files: api.getFiles(),
    appState: { viewBackgroundColor: appState.viewBackgroundColor },
  };
};

/** Load a previously saved scene back into the editor. */
export const loadSceneIntoEditor = (data: unknown): boolean => {
  if (!api || !data || typeof data !== "object") {
    return false;
  }
  const scene = data as Partial<SerializedScene>;
  if (!Array.isArray(scene.elements)) {
    return false;
  }
  if (scene.files) {
    api.addFiles(Object.values(scene.files));
  }
  const bg = scene.appState?.viewBackgroundColor;
  api.updateScene({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    elements: scene.elements as any,
    appState: typeof bg === "string" ? { viewBackgroundColor: bg } : undefined,
  });
  api.scrollToContent();
  return true;
};
