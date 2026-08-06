/**
 * Shared parse limits.
 *
 * These live in core because every adapter needs them and the reasoning behind the numbers is not
 * obvious from any single call site.
 */

/**
 * Maximum nesting depth an adapter will descend before giving up on a subtree.
 *
 * Recursive-descent parsers consume stack per level, and the budget is far smaller than it looks:
 * parsing runs in a **worker**, whose stack is a fraction of the main thread's. Measured on Node
 * 24, the Python adapter — roughly five frames per nesting level — dies at ~1250 levels inside a
 * worker, so a cap of 1000 provided essentially no protection at all.
 *
 * 200 leaves an order of magnitude of headroom for the frame-hungriest adapter while remaining far
 * beyond real data: `repr()` output and JSON configs nest in the tens, not the hundreds. Input past
 * this becomes an `opaque` node plus a `truncated` flag, which is a legible outcome. A stack
 * overflow is not — it takes the whole tab down.
 */
export const MAX_PARSE_DEPTH = 200;

/** Default input cap. Beyond this the tab is at risk, so adapters refuse with an explanation. */
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;
