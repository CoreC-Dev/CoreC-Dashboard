/**
 * View Transitions API type declarations.
 *
 * The API is available in Chromium-based browsers (Chrome 111+, Edge 111+).
 * Firefox/Safari support is in progress. Callers must feature-detect at
 * runtime — the type is declared as optional.
 */
interface ViewTransition {
  finished: Promise<void>
  ready: Promise<void>
  updateCallbackDone: Promise<void>
  skipTransition: () => void
}

interface Document {
  startViewTransition?: (updateCallback: () => Promise<void> | void) => ViewTransition
}
