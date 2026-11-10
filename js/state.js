// The one place shared app state lives, plus a tiny event system so modules
// can react to each other without calling each other directly.
//
// Events used in the app:
//   "draft:replaced"  the whole draft changed (extraction, project opened, table or column added/removed)
//                     → the editor re-renders and the export panel refreshes
//   "draft:edited"    a field was edited in place → the export panel refreshes
//   "dirty"           something worth saving changed → the project autosaves
//   "text:commit"     finish any text box being typed on the board (before switching modes, extracting, saving)
//   "project:loaded"  a project was opened → the drawing's undo history resets
//   "mock:run"        run SQL on the mock database ({ sql, name, dialect }), e.g. from an Ask answer
//   "view"            switch the workspace tab: "design" (Sketch to schema), "ask" or "test"
//   "view:shown"      a workspace tab was opened (its name)

import { defaultMock } from "./mock/saved.js";

export const EXAMPLE_PHOTO_NAME = "Example whiteboard (shop schema)";

export const state = {
  schema: { tables: [], warnings: [] },  // the draft: tables with columns, flags and references
  original: {},                            // the draft as first extracted, for the "kept as extracted" figure
  mode: "photo",                           // "photo" or "draw"
  shapes: [],                              // the drawing, in world coordinates (the board has no edges)
  textSize: 30,                            // size of new text on the board
  photo: { img: null, data: null, name: EXAMPLE_PHOTO_NAME },  // img null = show the example whiteboard
  diagram: { pos: {} },                    // Diagram view: table positions, by table id
  editor: { collapsed: {} },               // Draft editor: tables shown collapsed, by table id
  queries: [],                             // Ask in plain language: saved questions and answers, newest first
  mock: defaultMock(),                     // Test on mock data: sample data script, query, tests
  project: null                            // the open project record
};

const handlers = new Map();
export function on(event, fn) {
  if (!handlers.has(event)) handlers.set(event, []);
  handlers.get(event).push(fn);
}
export function emit(event, detail) {
  for (const fn of handlers.get(event) || []) fn(detail);
}
