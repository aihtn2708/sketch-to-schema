// Startup. Each imported module sets up its own part of the page when it loads;
// this file only adds the icons, fills in the AI connection, and opens the last project.
import { injectIcons } from "./icons.js";
import { renderConn } from "./connection.js";
import "./schema/editor.js";
import "./schema/export-panel.js";
import { redraw } from "./sketch/board.js";
import "./sketch/draw-tools.js";
import "./diagram/diagram.js";
import "./extract.js";
import "./query/ask-panel.js";
import "./mock/mock-panel.js";
import "./workspace.js";
import { initProjects } from "./projects/projects.js";
import { state } from "./state.js";

// Read-only handle for debugging in the browser console (e.g. s2s.state.schema).
window.s2s = { state };

injectIcons();
renderConn();
initProjects().then(() => document.fonts?.ready?.then(redraw));
