"use strict";
// Window routing helpers shared between main and renderer.
//
// Each connection workspace runs in its own BrowserWindow, distinguished by
// the URL hash `#/connection/<connectionId>`. The home/welcome window has
// no hash (or a non-matching hash) and shows the connection list.
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseHashRoute = parseHashRoute;
exports.buildHashRoute = buildHashRoute;
/** Parse a hash like `#/connection/abcd` into a structured route. */
function parseHashRoute(hash) {
    if (!hash)
        return { kind: 'home' };
    // Tolerate '#', '#/', '/#', and missing leading '#'.
    let h = hash;
    if (h.startsWith('#'))
        h = h.slice(1);
    if (h.startsWith('/'))
        h = h.slice(1);
    const parts = h.split('/').filter(Boolean);
    if (parts.length === 2 && parts[0] === 'connection') {
        const id = parts[1];
        if (id && /^[A-Za-z0-9._-]+$/.test(id)) {
            return { kind: 'connection', connectionId: id };
        }
    }
    return { kind: 'home' };
}
/** Build the hash for a given route. Always starts with `#`. */
function buildHashRoute(route) {
    if (route.kind === 'home')
        return '';
    return `#/connection/${route.connectionId}`;
}
