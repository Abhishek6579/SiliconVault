# SiliconVault Progress

Last updated: 2026-11-09

## Current milestone
**SV-003B — Unified workspace shell**

### Implemented
- Added a shared tab strip for Markdown, Verilog, SystemVerilog, and PDF files.
- Added per-tab activation, close, minimize, and restore actions.
- Keep all open editor instances and PDF viewers mounted while hidden, preserving their in-session draft and reader state when switching tabs.
- Persist open tab references, minimized state, and active tab per workspace in localStorage; document contents and PDF blobs remain in IndexedDB.
- Embed the PDF reader inside the common workspace shell instead of displaying a second independent tab bar.
- Update tab titles/metadata when an open document is saved.

### Not yet verified
- Production build and browser-level interaction tests.
- Switching between multiple editor tabs and PDFs while editing and reading.
- Persistence and restoration of open tabs after reload.
- PDF page/zoom and CodeMirror state retention in a real browser session.
- Unsaved editor draft recovery after a full reload is not implemented yet.

### Next milestone
**SV-004 — PDF reader**
- PDF text extraction and full-document search.
- Search result navigation and text highlighting.
- Fit width/page, rotate, fullscreen, and keyboard navigation.
- Bookmarks, annotations, and reading-position persistence.

## Important data-safety note
Do not clear browser site data to troubleshoot a migration. That can permanently remove the local vault. Export or otherwise back up the existing data before testing.
