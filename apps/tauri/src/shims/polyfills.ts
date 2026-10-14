// Web APIs the editor uses that the oldest webview the app supports lacks. tauri.conf's
// minimumSystemVersion is macOS 12.0, whose WKWebView can be as old as Safari 15.0 until Safari is
// updated: no `crypto.randomUUID`, `Array#at`, `Object.hasOwn` (all Safari 15.4) and no
// `Array#toSorted` / `#toReversed` (Safari 16.0). Without them the editor does not even render.
// Import this first; each polyfill is a no-op where the API already exists.
//
// core-js is the ecosystem's reference polyfill library (github.com/zloirock/core-js), so the array
// and object methods come from there. The editor source is not touched: see apps/tauri/README.md.
import "core-js/actual/array/at";
import "core-js/actual/array/to-reversed";
import "core-js/actual/array/to-sorted";
import "core-js/actual/object/has-own";
import "core-js/actual/string/at";
import { installRandomUUID } from "./random-uuid";

installRandomUUID();
