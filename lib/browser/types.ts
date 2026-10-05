export interface BrowserViewport {
  width: number;
  height: number;
  deviceScaleFactor?: number;
}

export interface BrowserActionRecord {
  id: string;
  type: string;
  detail: string;
  at: string;
  ok: boolean;
  error?: string;
}

export interface BrowserHistoryEntry {
  url: string;
  title: string;
  at: string;
}

export interface InteractiveElement {
  index: number;
  tag: string;
  type?: string;
  text: string;
  selector: string;
  href?: string;
  name?: string;
  box?: { x: number; y: number; width: number; height: number };
}

export interface PageState {
  sessionId: string;
  url: string;
  title: string;
  viewport: BrowserViewport;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  elements: InteractiveElement[];
  actionCount: number;
  lastAction?: BrowserActionRecord;
  screenshot?: string;
  screenshotFormat?: "png" | "jpeg";
}

export type BrowserAction =
  | { type: "click"; selector?: string; x?: number; y?: number; button?: "left" | "right" | "middle"; clickCount?: number }
  | { type: "type"; selector?: string; text: string; delay?: number; submit?: boolean; clear?: boolean }
  | { type: "press"; key: string; selector?: string }
  | { type: "scroll"; x?: number; y?: number; selector?: string }
  | { type: "hover"; selector: string }
  | { type: "select"; selector: string; value: string }
  | { type: "wait"; selector?: string; ms?: number }
  | { type: "back" }
  | { type: "forward" }
  | { type: "reload" }
  | { type: "setViewport"; viewport: BrowserViewport }
  | { type: "focus"; selector: string };

export interface BrowserSessionSummary {
  id: string;
  name: string;
  url: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  actionCount: number;
  alive: boolean;
}
