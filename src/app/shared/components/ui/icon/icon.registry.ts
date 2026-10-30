/**
 * Inline SVG icon registry.
 *
 * Replaces the previous ion-icon usage, which fetched its sprites at runtime from ionicons
 * package. In this app those requests failed ("Could not load icon ... Invalid
 * base URL"), so every icon rendered as an empty box. Inlining the paths keeps
 * the icons offline-safe — which matters for an app that advertises 100%
 * client-side processing — and removes a network round-trip per icon.
 *
 * Paths are drawn on a 24x24 grid and inherit `currentColor`, so a single
 * definition serves every size and theme. Names match the ionicon names that
 * were previously in use so templates read the same.
 */
export const ICON_PATHS: Record<string, string> = {
  // --- Navigation / chevrons ---
  'arrow-back': '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  'arrow-forward': '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  'arrow-up': '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
  'arrow-down': '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
  'chevron-back': '<polyline points="15 18 9 12 15 6"/>',
  'chevron-forward': '<polyline points="9 18 15 12 9 6"/>',
  'chevron-down': '<polyline points="6 9 12 15 18 9"/>',
  'chevron-up': '<polyline points="18 15 12 9 6 15"/>',
  'swap-horizontal': '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  'git-branch': '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  'git-merge': '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
  'arrow-undo': '<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
  'arrow-redo': '<polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>',
  'expand': '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>',
  'compass': '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',

  // --- Actions ---
  'add': '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  'add-circle': '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
  'remove': '<line x1="5" y1="12" x2="19" y2="12"/>',
  'close': '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  'close-circle': '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  'checkmark': '<polyline points="20 6 9 17 4 12"/>',
  'checkmark-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  'checkmark-done': '<polyline points="1 13 5 17 13 9"/><polyline points="9 13 13 17 23 7"/>',
  'refresh': '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  'sync': '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/>',
  'trash': '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  'copy': '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  'save': '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  'send': '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  'share-social': '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
  'search': '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  'play': '<polygon points="5 3 19 12 5 21 5 3"/>',
  'pause': '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
  'volume-high': '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>',
  'moon': '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  'sunny': '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  'cut': '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>',
  'link': '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',

  // --- Documents ---
  'document': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  'archive': '<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>',
  'document-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
  'document-attach': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="M9.5 14.5 12 12l2.5 2.5"/>',
  'documents': '<path d="M16 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><polyline points="16 4 16 8 20 8"/><path d="M4 8v12a2 2 0 0 0 2 2h9"/>',
  'folder-open': '<path d="M3 7a2 2 0 0 1 2-2h4l2 3h6a2 2 0 0 1 2 2v1"/><path d="M3 9h17l-2.4 9.2a2 2 0 0 1-1.94 1.5H5.34a2 2 0 0 1-1.94-1.5z"/>',
  'grid': '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  'list-number': '<line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
  'book': '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  'mail': '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/>',
  'logo-markdown': '<rect x="3" y="5" width="18" height="14" rx="2" ry="2"/><polyline points="7 15 7 9 9.5 12 12 9 12 15"/><polyline points="15 12 17 14 19 12"/><line x1="17" y1="9" x2="17" y2="14"/>',

  // --- Mirror / flip & page geometry ---
  /*
   * A dashed centre line with an arrowed shape either side of it: the axis the
   * flip mirrors about, and the two states. Drawn so the horizontal and
   * vertical pair read as the same idea turned a quarter turn.
   */
  'flip-horizontal': '<line x1="12" y1="3" x2="12" y2="21" stroke-dasharray="3 3"/><path d="M8 7 4 12l4 5z"/><path d="M16 7l4 5-4 5z"/>',
  'flip-vertical': '<line x1="3" y1="12" x2="21" y2="12" stroke-dasharray="3 3"/><path d="M7 8 12 4l5 4z"/><path d="M7 16l5 4 5-4z"/>',
  /*
   * Both axes is a point reflection, so it is drawn as the two dashed centre
   * lines with a shape in diagonally opposite quadrants. An earlier version
   * put four short strokes around the centre instead, which at 24px read as a
   * starburst rather than a flip.
   */
  'flip-both': '<line x1="12" y1="2.5" x2="12" y2="21.5" stroke-dasharray="3 3"/><line x1="2.5" y1="12" x2="21.5" y2="12" stroke-dasharray="3 3"/><path d="M9 4.5H4.5V9z"/><path d="M15 19.5h4.5V15z"/>',
  'tablet-portrait': '<rect x="6" y="2" width="12" height="20" rx="2"/><line x1="10" y1="19" x2="14" y2="19"/>',
  'tablet-landscape': '<rect x="2" y="6" width="20" height="12" rx="2"/><line x1="19" y1="10" x2="19" y2="14"/>',
  'resize': '<polyline points="4 9 4 4 9 4"/><polyline points="15 4 20 4 20 9"/><polyline points="20 15 20 20 15 20"/><polyline points="9 20 4 20 4 15"/>',
  'funnel': '<path d="M3 4h18l-7 8v7l-4 2v-9z"/>',
  'layers': '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 12 12 17 22 12"/><polyline points="2 17 12 22 22 17"/>',
  'albums': '<rect x="3" y="7" width="18" height="14" rx="2"/><line x1="6" y1="4" x2="18" y2="4"/><line x1="8" y1="1.5" x2="16" y2="1.5"/>',

  // --- Media ---
  'image': '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  'images': '<rect x="7" y="3" width="14" height="14" rx="2"/><circle cx="11.5" cy="7.5" r="1.5"/><polyline points="21 12 17 8 10 15"/><path d="M17 21H5a2 2 0 0 1-2-2V7"/>',
  'camera': '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  'crop': '<path d="M6.13 1 6 16a2 2 0 0 0 2 2h15"/><path d="M1 6.13 16 6a2 2 0 0 1 2 2v15"/>',
  'scan': '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="3" y1="12" x2="21" y2="12"/>',
  'eye': '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  'eye-outline': '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  'color-wand': '<path d="m15 4 5 5"/><path d="M3 21 17.5 6.5a2.12 2.12 0 0 1 3 3L6 24"/><path d="M9 4V2"/><path d="M13 8h2"/><path d="M5 10V8"/>',
  'water': '<path d="M12 2.69s5.66 5.66 5.66 9.31A5.66 5.66 0 0 1 6.34 12C6.34 8.35 12 2.69 12 2.69z"/>',
  'shapes': '<circle cx="7" cy="17" r="4"/><rect x="13" y="13" width="8" height="8" rx="1"/><path d="M12 3 16 10H8z"/>',
  'ellipse': '<circle cx="12" cy="12" r="9"/>',
  'square': '<rect x="4" y="4" width="16" height="16" rx="2"/>',
  'checkbox': '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  'text': '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>',

  // --- Tools ---
  'brush': '<path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/>',
  'pencil': '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  'create': '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  'construct': '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  'hammer': '<path d="m15 12-8.5 8.5a2.12 2.12 0 1 1-3-3L12 9"/><path d="M17.64 15 22 10.64"/><path d="m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l1.22 1.21"/>',
  'hand-right': '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  'key': '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3"/>',
  'lock-closed': '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  'lock-open': '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  'shield': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  'shield-checkmark': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>',
  'shield-lock': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><rect x="9" y="11" width="6" height="5" rx="1"/><path d="M10 11V9.5a2 2 0 0 1 4 0V11"/>',
  'shield-lock-outline': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><rect x="9" y="11" width="6" height="5" rx="1"/><path d="M10 11V9.5a2 2 0 0 1 4 0V11"/>',

  // --- Status / meta ---
  'alert-circle': '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  'warning': '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  'information-circle': '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  'time': '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  'calendar': '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  'cloud': '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
  'cloud-upload': '<path d="M16 16l-4-4-4 4"/><path d="M12 12v9"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>',
  'download-cloud': '<polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>',
  'cloud-download': '<polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>',
  'person-add': '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>',
  'chatbox': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  'chatbox-ellipses': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="8" y1="10" x2="8.01" y2="10"/><line x1="12" y1="10" x2="12.01" y2="10"/><line x1="16" y1="10" x2="16.01" y2="10"/>',

  // --- Splitting (B1-B5) ---
  'speedometer': '<path d="M4.5 18a9 9 0 1 1 15 0"/><line x1="12" y1="13" x2="16" y2="9"/><circle cx="12" cy="13.5" r="1.5"/>',
  'bookmark': '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  'qr-code': '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><line x1="14" y1="14" x2="17" y2="14"/><line x1="20" y1="14" x2="21" y2="14"/><line x1="14" y1="17" x2="14" y2="21"/><line x1="17" y1="17" x2="21" y2="21"/>',
  'text-search': '<line x1="4" y1="6" x2="16" y2="6"/><line x1="4" y1="11" x2="11" y2="11"/><line x1="4" y1="16" x2="9" y2="16"/><circle cx="16.5" cy="15.5" r="4"/><line x1="19.5" y1="18.5" x2="22" y2="21"/>',

  // --- Integrity & Inspection (G1-G5) ---
  'fingerprint': '<path d="M12 2a10 10 0 0 0-6.88 2.77"/><path d="M8.56 5.5A8 8 0 0 1 12 4a8 8 0 0 1 8 8v2"/><path d="M4 12a8 8 0 0 0 2.2 5.5"/><path d="M12 8a4 4 0 0 1 4 4v7"/><path d="M8 14v5"/><path d="M12 12a1 1 0 0 1 1 1v7"/><path d="M16 16v4"/><path d="M20 16v3"/>',
  'pulse': '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  'code': '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  'code-slash': '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/><line x1="14" y1="4" x2="10" y2="20"/>',
  'ribbon': '<circle cx="12" cy="8" r="6"/><path d="M15.48 13.92 18 22l-6-3-6 3 2.52-8.08"/>',

  // --- Photo Tools (I1-I10) ---
  'person': '<circle cx="12" cy="7" r="4"/><path d="M5.5 21v-2a6.5 6.5 0 0 1 13 0v2"/>',
  'eye-off': '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
  'eye-off-outline': '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
  'sparkles': '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/>',
  'pin': '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  'map': '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>',
  'ruler': '<path d="M21.3 8.7 8.7 21.3c-1 1-2.6 1-3.5 0l-2.5-2.5c-1-1-1-2.6 0-3.5L15.3 2.7c1-1 2.6-1 3.5 0l2.5 2.5c1 1 1 2.6 0 3.5z"/><line x1="13.5" y1="4.5" x2="15.5" y2="6.5"/><line x1="10.5" y1="7.5" x2="13.5" y2="10.5"/><line x1="7.5" y1="10.5" x2="9.5" y2="12.5"/><line x1="4.5" y1="13.5" x2="7.5" y2="16.5"/>',
  /* "Put this on the page": the Part K sheets that hand a placement to the
   * canvas. Crosshairs, because what follows is a tap or a drag on the page. */
  'locate': '<circle cx="12" cy="12" r="7"/><line x1="12" y1="1" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="23"/><line x1="1" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="23" y2="12"/><circle cx="12" cy="12" r="2"/>',
  // --- Reader (L1-L6) ---
  /* The reader toolbar asked for `plus`, `minus`, `maximize` and `minimize`
   * and got nothing: unregistered names resolve to '' and the button paints
   * an empty box. They are aliases of glyphs already here, but
   * resolveIconName only strips `-outline`, so each needs its own entry. */
  'plus': '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  'minus': '<line x1="5" y1="12" x2="19" y2="12"/>',
  'maximize': '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>',
  'minimize': '<polyline points="4 10 4 4 10 4"/><polyline points="20 14 20 20 14 20"/><line x1="4" y1="4" x2="10" y2="10"/><line x1="20" y1="20" x2="14" y2="14"/>',
  /* L2 — the page-spread and scroll-mode choices. Two panes side by side for
   * the spread; a tall page with a flow arrow for continuous scrolling. */
  'columns': '<rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/>',
  'scroll-continuous': '<rect x="6" y="2" width="12" height="9" rx="1"/><rect x="6" y="14" width="12" height="9" rx="1"/><polyline points="10 11.5 12 13.5 14 11.5"/>',
  /* L5 — the voice picker next to read-aloud. */
  'mic': '<path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/>',
  /* L6 — the thumbnail strip you drag along. */
  'film-strip': '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="8" y1="5" x2="8" y2="19"/><line x1="16" y1="5" x2="16" y2="19"/>',
  /* The overflow affordance on the phone toolbar. */
  'ellipsis-horizontal': '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  'form-builder': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h6M7 16h4"/><circle cx="17" cy="15" r="3"/><line x1="17" y1="13.5" x2="17" y2="16.5"/><line x1="15.5" y1="15" x2="18.5" y2="15"/>',
  'form-data': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h3m2 0h3M8 17h8"/><polyline points="10 9 9 9 8 9"/>',
  'mail-merge': '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/><circle cx="18" cy="18" r="4"/><polyline points="16 18 17.5 19.5 20.5 16.5"/>',
  'signature-template': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18h6"/><path d="M7 15c2-2 4 1 6-1"/>',
  'signing-packet': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><polyline points="14 11 16 13 22 7"/>',
  'certificate-sign': '<path d="M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14z"/><path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12"/><circle cx="12" cy="8" r="3"/>',
  'batch-shield': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/><path d="M4 10V7l3-1.12"/><path d="M20 10V7l-3-1.12"/>',
  'verified-stamp': '<path d="M12 2l2.4 2.1 3.2-.3 1.2 3 2.9 1.4-.4 3.2 2 2.6-1.5 2.9.8 3.1-3 1.2-1.4 2.9-3.2-.4L12 22l-2.4-2.1-3.2.3-1.2-3-2.9-1.4.4-3.2-2-2.6 1.5-2.9-.8-3.1 3-1.2 1.4-2.9 3.2.4z"/><polyline points="9 12 11 14 15 10"/>',
  'metadata-edit': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  'forensic-scan': '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="5" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="19"/><line x1="5" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="19" y2="12"/>',
  'chatbubble': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  'dice': '<rect x="3" y="3" width="18" height="18" rx="3" ry="3"/><circle cx="8" cy="8" r="1.5"/><circle cx="16" cy="8" r="1.5"/><circle cx="8" cy="16" r="1.5"/><circle cx="16" cy="16" r="1.5"/><circle cx="12" cy="12" r="1.5"/>',
  'dice-outline': '<rect x="3" y="3" width="18" height="18" rx="3" ry="3"/><circle cx="8" cy="8" r="1.5"/><circle cx="16" cy="8" r="1.5"/><circle cx="8" cy="16" r="1.5"/><circle cx="16" cy="16" r="1.5"/><circle cx="12" cy="12" r="1.5"/>',
  'globe': '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  'globe-lang': '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  'magic-detect': '<path d="m19 11-4-4m-2 2L4.5 17.5a2.121 2.121 0 0 0 3 3L16 12m2-9v4m-2-2h4m-1 12v3m-1.5-1.5h3m-13-11v2m-1-1h2"/>',
  'pen-tool': '<path d="m12 19 7-7 3 3-7 7-3-3z"/><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="m2 2 7.586 7.586"/><circle cx="11" cy="11" r="2"/>',
  'zoom-in': '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>',
  'zoom-out': '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>',
  'spellcheck': '<path d="m6 16 6-12 6 12"/><path d="M8 12h8"/><path d="m16 20 2 2 4-4"/>',
  'table-excel': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  'barcode-scanner': '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10 8v8M14 8v8M17 8v8M3 12h18"/>',
  'structured-extract': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 12h3M8 16h2"/><rect x="13" y="11" width="5" height="3" rx="1"/><rect x="12" y="15" width="6" height="3" rx="1"/>',
  'contact-calendar': '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="9" cy="16" r="2"/><path d="M13 18a3 3 0 0 1 6 0"/>',
  'panic-clear': '<path d="M12 2c-.5 2.5-2 4.5-4 6-2 1.5-3 4-3 6.5A7 7 0 0 0 12 22a7 7 0 0 0 7-7.5c0-2.5-1-5-3-6.5-2-1.5-3.5-3.5-4-6z"/><line x1="9" y1="12" x2="15" y2="18"/><line x1="15" y1="12" x2="9" y2="18"/>',
  'report-card': '<rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="12" y2="15"/><circle cx="15" cy="15" r="3"/><polyline points="14 15 15 16 17 14"/>',
  'preset-builder': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><rect x="8" y="11" width="8" height="8" rx="1"/><path d="M6 15h2M16 15h2M12 9v2M12 19v2"/>',
  'profile-json': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M10 12c-1 0-1.5.5-1.5 1.5v.5c0 .7-.5 1-1.5 1 1 0 1.5.3 1.5 1v.5c0 1 .5 1.5 1.5 1.5M14 12c1 0 1.5.5 1.5 1.5v.5c0 .7.5 1 1.5 1-1 0-1.5.3-1.5 1v.5c0 1-.5 1.5-1.5 1.5"/>',
  'batch-check': '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><polyline points="9 12 11 14 15 10"/><line x1="8" y1="17" x2="16" y2="17"/>',
  'recipe-pipeline': '<rect x="3" y="3" width="7" height="5" rx="1"/><rect x="14" y="9" width="7" height="5" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/><path d="M10 5.5h2a2 2 0 0 1 2 2V9M14 14v1.5a2 2 0 0 1-2 2h-2"/>',
  'recipe-batch': '<rect x="3" y="3" width="6" height="5" rx="1"/><rect x="12" y="3" width="6" height="5" rx="1"/><rect x="3" y="12" width="6" height="5" rx="1"/><rect x="12" y="12" width="6" height="5" rx="1"/><path d="M9 5.5h3M6 8v4M15 8v4M9 14.5h3"/>',
  'multi-qa': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M2 6v14a2 2 0 0 0 2 2h12"/><circle cx="12" cy="14" r="3"/><path d="m14.5 16.5 2 2"/>',
  'smart-tag': '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/><path d="M16 2v4m-2-2h4"/>',
  'clause-search': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 12h5M8 16h3"/><circle cx="15.5" cy="15.5" r="3.5"/><path d="m18 18 3 3"/>',
  'book-open': '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  'split-view': '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="6" y1="8" x2="9" y2="8"/><line x1="6" y1="12" x2="9" y2="12"/><line x1="15" y1="8" x2="18" y2="8"/><line x1="15" y1="12" x2="18" y2="12"/>',
  'accessibility': '<circle cx="12" cy="4" r="2"/><path d="M4 9h16M12 9v7M8 21l4-5 4 5"/>',
};

/** ionicon names map onto the base glyphs above; `-outline` is the same path. */
export function resolveIconName(name: string): string {
  const base = name.replace(/-outline$/, '').replace(/-sharp$/, '');
  return ICON_PATHS[base] ? base : ICON_PATHS[name] ? name : '';
}
