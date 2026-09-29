// Entry of the browser demo: install the in-page window.bp first, then start the normal renderer.
// Imports run in order, so the renderer sees window.bp from its very first line.

import './bpWeb';
import '../renderer/main';
