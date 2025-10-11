// media-library.js - Manifest-driven, lazy-loading Media Library (mobile-friendly + video posters)
// Robust: verifies file existence, hides deleted files, shows missing state, hard-refresh support.
(function() {
  // state
  let mediaLibrary = null;
  let currentCallback = null;
  let currentMultiple = false;
  let cachedFiles = null;
  let activeTypeTab = 'image';
  const PRODUCTS_MANIFEST = '../products.json';
  let lastManifestSignature = '';
  let lazyObserver = null;

  // tiny transparent placeholder (1x1) used before poster/thumb is loaded
  const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

  // Candidate folders to probe for poster/thumb images (order matters)
  const POSTER_PATH_CANDIDATES = [
    '../video/posters/',
    '../image/thumbs/',
    '../image/',
    '' // allow full relative paths or absolute urls
  ];

  // helper: check whether a URL exists (image) with timeout and cache-bust
  function checkImageExists(url, timeout = 3000) {
    return new Promise(resolve => {
      if (!url) return resolve(false);
      const img = new Image();
      let settled = false;
      const timer = setTimeout(() => { if (!settled) { settled = true; resolve(false); } }, timeout);
      img.onload = () => { if (!settled) { settled = true; clearTimeout(timer); resolve(true); } };
      img.onerror = () => { if (!settled) { settled = true; clearTimeout(timer); resolve(false); } };
      // cache-bust so that deleted/updated files are detected
      img.src = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
    });
  }

  // resolve poster path: accept a filename or path; probe candidate folders and return first found or null
  async function resolvePosterPath(candidate) {
    if (!candidate) return null;
    // if candidate looks like a full path or absolute url, test it first
    const looksLikePath = candidate.includes('/') || candidate.startsWith('http') || candidate.startsWith('../') || candidate.startsWith('/');
    if (looksLikePath) {
      if (await checkImageExists(candidate)) return candidate;
      // fall back to basename checks below
    }
    const base = candidate.split('/').pop();
    for (const folder of POSTER_PATH_CANDIDATES) {
      if (!folder) continue;
      const attempt = folder + base;
      if (await checkImageExists(attempt)) return attempt;
    }
    return null;
  }

  // ---------------------------------------
  // create modal + style
  // ---------------------------------------
  function createMediaLibrary() {
    if (mediaLibrary) return mediaLibrary;

    const overlay = document.createElement('div');
    overlay.id = 'mediaLibraryOverlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.75); display: none;
      justify-content: center; align-items: center; z-index: 10000;
      -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
    `;

    const modal = document.createElement('div');
    modal.id = 'mediaLibraryModal';
    modal.style.cssText = `
      background: var(--card, #0b1220); border-radius: 12px; padding: 18px;
      width: 94%; max-width: 980px; max-height: 86vh; display:flex;flex-direction:column;
      border:1px solid rgba(255,255,255,0.06); color:#e6eef6; overflow:hidden; box-sizing:border-box;
    `;

    modal.innerHTML = `
      <div id="mediaHeader" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;">
        <h3 id="mediaTitle" style="margin:0;color:var(--accent,#06b6d4);font-size:18px;">Media Library</h3>
        <div style="display:flex;align-items:center;gap:8px;">
          <button id="refreshLibrary" title="Refresh" aria-label="Refresh media" style="background:none;border:none;color:#9aa4b2;font-size:18px;cursor:pointer;padding:6px;">⟳</button>
          <button id="closeMediaLibrary" title="Close" aria-label="Close library" style="background:none;border:none;color:#9aa4b2;font-size:22px;cursor:pointer;padding:6px;">×</button>
        </div>
      </div>

      <div id="mediaControls" style="display:flex;gap:10px;margin-bottom:10px;align-items:center;">
        <input type="text" id="mediaSearch" placeholder="Search files..." style="flex:1;padding:9px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.03);color:white;min-width:0;">
        <div style="display:flex;gap:8px;flex-shrink:0;">
          <button id="tabImages" class="media-tab active" data-type="image">Images</button>
          <button id="tabVideos" class="media-tab" data-type="video">Videos</button>
          <button id="tabAll" class="media-tab" data-type="all">All</button>
        </div>
      </div>

      <div id="mediaGrid" style="flex:1;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;padding:8px;background:rgba(255,255,255,0.015);border-radius:8px;">
        <div style="text-align:center;padding:30px;color:#9aa4b2;">Loading media...</div>
      </div>

      <div id="mediaFooter" style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06);">
        <div id="selectionInfo" style="color:#9aa4b2;font-size:13px;">No file selected</div>
        <div style="display:flex;gap:10px;">
          <button id="cancelMediaSelection" style="padding:8px 14px;border:1px solid rgba(255,255,255,0.12);background:transparent;color:#9aa4b2;border-radius:6px;cursor:pointer;">Cancel</button>
          <button id="confirmMediaSelection" style="padding:8px 14px;border:none;background:var(--accent,#06b6d4);color:white;border-radius:6px;cursor:pointer;">Select</button>
        </div>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const style = document.createElement('style');
    style.textContent = `
      .media-tab{padding:7px 12px;border:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.02);color:#cbd5e1;border-radius:6px;cursor:pointer;}
      .media-tab.active{background:var(--accent,#06b6d4);color:white;border-color:var(--accent,#06b6d4);}
      .media-item{position:relative;border-radius:8px;overflow:hidden;background:rgba(255,255,255,0.02);border:2px solid transparent;cursor:pointer;transition:all .14s;display:flex;align-items:center;justify-content:center;height:0;padding-bottom:100%;box-sizing:border-box;}
      .media-item>.fill{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;}
      .media-item:hover{border-color:rgba(255,255,255,0.08);transform:translateY(-4px);}
      .media-item.selected{border-color:var(--accent,#06b6d4);box-shadow:0 6px 18px rgba(6,182,212,0.16);transform:none;}
      .media-item img,.media-item video,.media-item .video-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
      .media-item.missing{opacity:.35;pointer-events:none;}
      .media-item .filename{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,0.7));color:white;padding:6px;font-size:12px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .video-thumb{position:relative;width:100%;height:100%;}
      .video-thumb .play-icon{position:absolute;left:8px;top:8px;padding:6px 8px;border-radius:6px;background:rgba(0,0,0,0.45);color:white;font-weight:600;font-size:12px;}
    `;
    document.head.appendChild(style);

    setupEventListeners(overlay);
    mediaLibrary = overlay;

    // create intersection observer for lazy loading; we will only set data-src when file exists
    const gridEl = document.getElementById('mediaGrid');
    lazyObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const item = entry.target;
        const img = item.querySelector('img[data-src]');
        if (img && img.dataset.src) {
          // set cache-busted src so latest server state is fetched
          img.src = img.dataset.src + (img.dataset.src.includes('?') ? '&' : '?') + '_t=' + Date.now();
          img.removeAttribute('data-src');
        }
        lazyObserver.unobserve(item);
      });
    }, { root: gridEl, rootMargin: '300px' });

    return overlay;
  }

  // ---------------------------------------
  // Events
  // ---------------------------------------
  function setupEventListeners(overlay) {
    overlay.querySelector('#closeMediaLibrary').addEventListener('click', closeMediaLibrary);
    overlay.querySelector('#cancelMediaSelection').addEventListener('click', closeMediaLibrary);
    overlay.querySelector('#refreshLibrary').addEventListener('click', async () => {
      // hard refresh: clear cache, re-scan manifest and re-render
      cachedFiles = null;
      lastManifestSignature = '';
      console.debug('[MediaLibrary] hard refresh triggered');
      await showFiles(activeTypeTab, true);
    });

    overlay.querySelectorAll('.media-tab').forEach(tab => {
      tab.addEventListener('click', async () => {
        overlay.querySelectorAll('.media-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeTypeTab = tab.dataset.type;
        await showFiles(activeTypeTab, true);
      });
    });

    overlay.querySelector('#mediaSearch').addEventListener('input', e => filterMedia(e.target.value));
    overlay.querySelector('#confirmMediaSelection').addEventListener('click', confirmSelection);

    // allow closing with esc key when open
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') closeMediaLibrary(); });
  }

  // ---------------------------------------
  // scan manifest and verify existence
  // ---------------------------------------
  async function scanFiles(forceRefresh = false) {
    if (cachedFiles && !forceRefresh) return cachedFiles;

    try {
      const res = await fetch(`${PRODUCTS_MANIFEST}?t=${Date.now()}`, { cache: 'no-cache' });
      if (!res.ok) throw new Error('Failed to load manifest');
      const products = await res.json();

      // collect raw entries
      const unique = new Map();
      const raw = [];
      const pushImage = (name, thumb) => {
        if (!name) return;
        const key = `image::${name}`;
        if (unique.has(key)) return;
        unique.set(key, true);
        raw.push({ name, type: 'image', src: `../image/${name}`, thumb: thumb || null });
      };
      const pushVideo = (name, poster) => {
        if (!name) return;
        const key = `video::${name}`;
        if (unique.has(key)) return;
        unique.set(key, true);
        raw.push({ name, type: 'video', src: `../video/${name}`, poster: poster || null });
      };

      products.forEach(p => {
        if (p.image) pushImage(p.image, p.thumb);
        if (Array.isArray(p.images)) p.images.forEach(i => pushImage(i));
        if (Array.isArray(p.mediaGallery)) {
          p.mediaGallery.forEach(m => {
            if (!m?.src) return;
            if (m.type === 'video') pushVideo(m.src, m.poster || m.thumb);
            else pushImage(m.src, m.thumb);
          });
        }
      });

      // resolve posters/thumbs by probing candidate folders (this detects deleted files)
      const resolved = [];
      for (const entry of raw) {
        if (entry.type === 'image') {
          let thumbResolved = null;
          if (entry.thumb) thumbResolved = await resolvePosterPath(entry.thumb);
          // fallback to src if exists
          if (!thumbResolved && await checkImageExists(entry.src)) thumbResolved = entry.src;
          // only include this image if source exists (don't show deleted image skeletons)
          if (await checkImageExists(entry.src)) {
            resolved.push({ name: entry.name, type: 'image', src: entry.src, thumb: thumbResolved });
          } else {
            console.debug('[MediaLibrary] image missing, skipping:', entry.src);
          }
        } else {
          // video: try poster from poster field or default base name
          let posterResolved = null;
          if (entry.poster) posterResolved = await resolvePosterPath(entry.poster);
          if (!posterResolved) {
            const base = entry.name.split('/').pop().replace(/\.\w+$/, '.jpg');
            posterResolved = await resolvePosterPath(base);
          }
          // only include video if video file exists on server
          if (await checkVideoExists(entry.src)) {
            resolved.push({ name: entry.name, type: 'video', src: entry.src, poster: posterResolved });
          } else {
            console.debug('[MediaLibrary] video missing, skipping:', entry.src);
          }
        }
      }

      const signature = JSON.stringify(resolved.map(f => f.name)).slice(0, 5000);
      if (signature !== lastManifestSignature) {
        console.info('🔄 Media library refreshed: manifest updated', { count: resolved.length });
        lastManifestSignature = signature;
      }

      cachedFiles = resolved;
      return cachedFiles;
    } catch (err) {
      console.warn('⚠️ Media manifest failed:', err);
      cachedFiles = [];
      return cachedFiles;
    }
  }

  // helper to check video file existence (uses <video> metadata load)
  function checkVideoExists(url, timeout = 3500) {
    return new Promise(resolve => {
      if (!url) return resolve(false);
      const v = document.createElement('video');
      let settled = false;
      const timer = setTimeout(() => { if (!settled) { settled = true; resolve(false); } }, timeout);
      v.preload = 'metadata';
      v.onloadedmetadata = () => { if (!settled) { settled = true; clearTimeout(timer); resolve(true); } };
      v.onerror = () => { if (!settled) { settled = true; clearTimeout(timer); resolve(false); } };
      v.src = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
    });
  }

  // resolve poster path (same implementation used above)
  async function resolvePosterPath(candidate) {
    if (!candidate) return null;
    const looksLikePath = candidate.includes('/') || candidate.startsWith('http') || candidate.startsWith('../') || candidate.startsWith('/');
    if (looksLikePath) {
      if (await checkImageExists(candidate)) return candidate;
    }
    const base = candidate.split('/').pop();
    for (const folder of POSTER_PATH_CANDIDATES) {
      if (!folder) continue;
      const attempt = folder + base;
      if (await checkImageExists(attempt)) return attempt;
    }
    return null;
  }

  // ---------------------------------------
  // render grid + lazy loading
  // ---------------------------------------
  async function showFiles(type = 'image', forceRefresh = false) {
    await createMediaLibrary();
    const grid = document.getElementById('mediaGrid');
    grid.innerHTML = '<div style="text-align:center;padding:30px;color:#9aa4b2;">Loading media...</div>';
    const files = await scanFiles(forceRefresh);

    const visible = type === 'all' ? files : files.filter(f => f.type === type);
    if (!visible.length) {
      grid.innerHTML = '<div style="text-align:center;padding:30px;color:#9aa4b2;">No files found</div>';
      return;
    }

    renderFilesList(visible);
  }

  function renderFilesList(files) {
    const grid = document.getElementById('mediaGrid');
    grid.innerHTML = '';
    files.forEach(f => {
      const item = document.createElement('div');
      item.className = 'media-item';
      item.dataset.filename = f.name;
      item.dataset.type = f.type;

      const fill = document.createElement('div'); fill.className = 'fill';

      if (f.type === 'image') {
        const img = document.createElement('img');
        img.alt = f.name;
        // lazy: set data-src to the verified url (without extra timestamp here; observer adds timestamp)
        if (f.src) img.dataset.src = f.src;
        img.src = f.thumb || TRANSPARENT_PIXEL;
        img.loading = 'lazy';

        // handle error -> mark item missing
        img.onerror = () => {
          item.classList.add('missing');
          const cap = item.querySelector('.filename'); if (cap) cap.textContent = `${f.name} — Missing`;
        };

        fill.appendChild(img);
      } else {
        const wrapper = document.createElement('div'); wrapper.className = 'video-thumb';
        const poster = document.createElement('img');
        poster.alt = f.name;
        if (f.poster) {
          poster.dataset.src = f.poster; // verified url
          item.dataset.poster = f.poster;
        }
        poster.src = TRANSPARENT_PIXEL;
        poster.loading = 'lazy';
        poster.onerror = () => {
          // poster missing — keep placeholder, do not mark whole item missing (video may still be present)
        };
        wrapper.appendChild(poster);

        const play = document.createElement('div'); play.className = 'play-icon'; play.textContent = '▶';
        wrapper.appendChild(play);

        fill.appendChild(wrapper);

        if (f.src) item.dataset.videoSrc = f.src;
      }

      const caption = document.createElement('div'); caption.className = 'filename'; caption.textContent = f.name;
      item.appendChild(fill); item.appendChild(caption);

      // click behavior
      item.addEventListener('click', (e) => {
        if (item.classList.contains('missing')) return; // don't react to missing ones
        if (item.dataset.type === 'video') {
          if (item.dataset.loadedVideo) toggleSelection(item);
          else loadVideoInItem(item);
        } else {
          toggleSelection(item);
        }
      });

      // when an image loads successfully, ensure it's selectable and caption correct
      const imgEl = item.querySelector('img');
      if (imgEl) {
        imgEl.addEventListener('load', () => {
          item.classList.remove('missing');
          const cap = item.querySelector('.filename'); if (cap) cap.textContent = f.name;
        });
      }

      grid.appendChild(item);
      if (lazyObserver) lazyObserver.observe(item);
    });
  }

  // ---------------------------------------
  // load video in place of poster
  // ---------------------------------------
  function loadVideoInItem(item) {
    const src = item.dataset.videoSrc;
    if (!src) return;
    const fill = item.querySelector('.fill');
    if (!fill) return;

    // remove poster wrapper if present
    const posterWrapper = fill.querySelector('.video-thumb');
    if (posterWrapper) posterWrapper.remove();

    const video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.style.width = '100%'; video.style.height = '100%'; video.style.display = 'block';
    video.setAttribute('playsinline', '');
    if (item.dataset.poster) video.poster = item.dataset.poster;

    const source = document.createElement('source');
    source.src = src;
    video.appendChild(source);

    fill.appendChild(video);
    item.dataset.loadedVideo = '1';

    video.addEventListener('click', ev => { ev.stopPropagation(); toggleSelection(item); });

    toggleSelection(item);
  }

  // ---------------------------------------
  // selection / filtering / confirm
  // ---------------------------------------
  function toggleSelection(item) {
    if (currentMultiple) item.classList.toggle('selected');
    else { document.querySelectorAll('.media-item').forEach(i => i.classList.remove('selected')); item.classList.add('selected'); }
    updateSelectionInfo();
  }

  function updateSelectionInfo() {
    const sel = document.querySelectorAll('.media-item.selected');
    const info = document.getElementById('selectionInfo');
    if (info) info.textContent = sel.length ? `${sel.length} file${sel.length > 1 ? 's' : ''} selected` : 'No file selected';
  }

  function filterMedia(term) {
    const grid = document.getElementById('mediaGrid');
    if (!grid) return;
    const value = (term || '').trim().toLowerCase();
    Array.from(grid.children).forEach(i => {
      const match = (i.dataset.filename || '').toLowerCase().includes(value);
      i.style.display = match ? '' : 'none';
    });
  }

  function confirmSelection() {
    const sel = Array.from(document.querySelectorAll('.media-item.selected'));
    if (!sel.length) return alert('Please select at least one file');
    const result = sel.map(i => {
      if (i.dataset.type === 'image') {
        return { name: i.dataset.filename, type: 'image', src: i.querySelector('img')?.src || null };
      } else {
        return { name: i.dataset.filename, type: 'video', src: i.dataset.videoSrc || null, poster: i.dataset.poster || i.querySelector('.video-thumb img')?.src || null };
      }
    });
    if (currentCallback) currentCallback(result);
    closeMediaLibrary();
  }

  function closeMediaLibrary() {
    if (!mediaLibrary) return;
    mediaLibrary.style.display = 'none';
    const search = document.getElementById('mediaSearch'); if (search) search.value = '';
    document.querySelectorAll('.media-item.selected').forEach(i => i.classList.remove('selected'));
    updateSelectionInfo();
  }

  async function refreshMediaLibrary() {
    cachedFiles = null;
    lastManifestSignature = '';
    await showFiles(activeTypeTab, true);
  }

  // Public API
  window.MediaLibrary = {
    open: async ({ multiple = false, onSelect = null, initialTab = 'image' } = {}) => {
      createMediaLibrary();
      currentMultiple = !!multiple;
      currentCallback = typeof onSelect === 'function' ? onSelect : null;
      activeTypeTab = initialTab || 'image';
      const overlay = mediaLibrary;
      overlay.style.display = 'flex';
      overlay.querySelectorAll('.media-tab').forEach(t => t.classList.remove('active'));
      overlay.querySelector(`[data-type="${activeTypeTab}"]`)?.classList.add('active');
      const search = overlay.querySelector('#mediaSearch'); if (search) search.focus();
      await showFiles(activeTypeTab);
      overlay.tabIndex = -1; overlay.focus();
    },
    close: closeMediaLibrary,
    refresh: refreshMediaLibrary,
    preload: async () => { await scanFiles(false); }
  };

  // init
  createMediaLibrary();
})();













// // media-library.js - Manifest-driven, lazy-loading Media Library (mobile-friendly + video posters)
// (function() {
//     // state
//     let mediaLibrary = null;
//     let currentCallback = null;
//     let currentMultiple = false;
//     let cachedFiles = null;
//     let activeTypeTab = 'image';
//     const PRODUCTS_MANIFEST = '../products.json';
//     let lastManifestSignature = '';
//     let lazyObserver = null;

//     // tiny transparent placeholder (1x1) used before poster/thumb is loaded
//     const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

//     // ---------------------------------------
//     // Create modal + styles (responsive)
//     // ---------------------------------------
//     function createMediaLibrary() {
//         if (mediaLibrary) return mediaLibrary;

//         const overlay = document.createElement('div');
//         overlay.id = 'mediaLibraryOverlay';
//         overlay.style.cssText = `
//             position: fixed;
//             inset: 0;
//             background: rgba(0,0,0,0.75);
//             display: none;
//             justify-content: center;
//             align-items: center;
//             z-index: 10000;
//             -webkit-backdrop-filter: blur(4px);
//             backdrop-filter: blur(4px);
//         `;

//         const modal = document.createElement('div');
//         modal.id = 'mediaLibraryModal';
//         modal.style.cssText = `
//             background: var(--card, #0b1220);
//             border-radius: 12px;
//             padding: 18px;
//             width: 94%;
//             max-width: 980px;
//             max-height: 86vh;
//             display: flex;
//             flex-direction: column;
//             border: 1px solid rgba(255,255,255,0.06);
//             color: #e6eef6;
//             overflow: hidden;
//             font-family: Inter, system-ui, Arial, sans-serif;
//             box-sizing: border-box;
//         `;

//         modal.innerHTML = `
//             <div id="mediaHeader" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;">
//                 <h3 id="mediaTitle" style="margin:0;color:var(--accent,#06b6d4);font-size:18px;">Media Library</h3>
//                 <div style="display:flex;align-items:center;gap:8px;">
//                     <button id="refreshLibrary" title="Refresh" aria-label="Refresh media"
//                         style="background:none;border:none;color:#9aa4b2;font-size:18px;cursor:pointer;padding:6px;">⟳</button>
//                     <button id="closeMediaLibrary" title="Close" aria-label="Close library"
//                         style="background:none;border:none;color:#9aa4b2;font-size:22px;cursor:pointer;padding:6px;">×</button>
//                 </div>
//             </div>

//             <div id="mediaControls" style="display:flex;gap:10px;margin-bottom:10px;align-items:center;">
//                 <input type="text" id="mediaSearch" placeholder="Search files..." 
//                     style="flex:1;padding:9px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);
//                     background:rgba(255,255,255,0.03);color:white;min-width:0;">
//                 <div style="display:flex;gap:8px;flex-shrink:0;">
//                     <button id="tabImages" class="media-tab active" data-type="image">Images</button>
//                     <button id="tabVideos" class="media-tab" data-type="video">Videos</button>
//                     <button id="tabAll" class="media-tab" data-type="all">All</button>
//                 </div>
//             </div>

//             <div id="mediaGrid" style="flex:1;overflow:auto;display:grid;
//                 grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;
//                 padding:8px;background:rgba(255,255,255,0.015);border-radius:8px;">
//                 <div style="text-align:center;padding:30px;color:#9aa4b2;">Loading media...</div>
//             </div>

//             <div id="mediaFooter" style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;
//                 padding-top:10px;border-top:1px solid rgba(255,255,255,0.06);">
//                 <div id="selectionInfo" style="color:#9aa4b2;font-size:13px;">No file selected</div>
//                 <div style="display:flex;gap:10px;">
//                     <button id="cancelMediaSelection" style="padding:8px 14px;border:1px solid rgba(255,255,255,0.12);
//                         background:transparent;color:#9aa4b2;border-radius:6px;cursor:pointer;">Cancel</button>
//                     <button id="confirmMediaSelection" style="padding:8px 14px;border:none;background:var(--accent,#06b6d4);
//                         color:white;border-radius:6px;cursor:pointer;">Select</button>
//                 </div>
//             </div>
//         `;

//         overlay.appendChild(modal);
//         document.body.appendChild(overlay);

//         const style = document.createElement('style');
//         style.textContent = `
//             .media-tab {
//                 padding:7px 12px;border:1px solid rgba(255,255,255,0.06);
//                 background:rgba(255,255,255,0.02);color:#cbd5e1;border-radius:6px;cursor:pointer;
//                 transition:all 0.15s ease;font-size:13px;
//             }
//             .media-tab.active {background:var(--accent,#06b6d4);color:white;border-color:var(--accent,#06b6d4);}
//             .media-item {
//                 position:relative;border-radius:8px;overflow:hidden;background:rgba(255,255,255,0.02);
//                 border:2px solid transparent;cursor:pointer;transition:all 0.14s ease;display:flex;
//                 align-items:center;justify-content:center;height:0;padding-bottom:100%; /* aspect ratio 1:1 */
//                 box-sizing:border-box;
//             }
//             /* inside element absolutely positioned */
//             .media-item > .fill {
//                 position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
//             }
//             .media-item:hover {border-color:rgba(255,255,255,0.08);transform:translateY(-4px);}
//             .media-item.selected {border-color:var(--accent,#06b6d4);box-shadow:0 6px 18px rgba(6,182,212,0.16);transform:none;}
//             .media-item img,.media-item video,.media-item .video-thumb img {width:100%;height:100%;object-fit:cover;display:block;}
//             .media-item .filename {
//                 position:absolute;bottom:0;left:0;right:0;
//                 background:linear-gradient(transparent,rgba(0,0,0,0.7));
//                 color:white;padding:6px;font-size:12px;text-align:center;white-space:nowrap;
//                 overflow:hidden;text-overflow:ellipsis;
//             }
//             .video-thumb {position:relative;width:100%;height:100%;}
//             .video-thumb .play-icon {
//                 position:absolute;left:8px;top:8px;padding:6px 8px;border-radius:6px;background:rgba(0,0,0,0.45);
//                 color:white;font-weight:600;font-size:12px;
//             }

//             /* mobile adjustments */
//             @media (max-width: 600px) {
//                 #mediaLibraryModal { width: 100%; height: 100vh; max-width: none; max-height: none; border-radius: 0; padding: 12px; }
//                 #mediaHeader { margin-bottom:8px; }
//                 #mediaControls { gap:8px; margin-bottom:8px; }
//                 #mediaGrid { padding:6px; gap:8px; grid-template-columns: repeat(auto-fill, minmax(98px, 1fr)); }
//                 .media-tab { padding:6px 10px; font-size:12px; }
//                 .video-thumb .play-icon { left:6px; top:6px; padding:5px 7px; font-size:11px; }
//                 .media-item { padding-bottom:100%; } /* keeps square */
//                 #mediaFooter { padding-top:8px; gap:8px; }
//             }

//             /* larger screens: more columns */
//             @media (min-width: 900px) {
//                 #mediaGrid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:12px; padding:12px; }
//                 .media-item { padding-bottom:100%; }
//             }
//         `;
//         document.head.appendChild(style);

//         setupEventListeners(overlay);
//         mediaLibrary = overlay;

//         // create an IntersectionObserver now that the grid exists in the DOM
//         const gridEl = document.getElementById('mediaGrid');
//         lazyObserver = new IntersectionObserver((entries) => {
//             entries.forEach(entry => {
//                 if (!entry.isIntersecting) return;
//                 const item = entry.target;
//                 // find any <img> inside and swap dataset.src -> src
//                 const img = item.querySelector('img[data-src]');
//                 if (img && img.dataset.src) {
//                     img.src = img.dataset.src;
//                     img.removeAttribute('data-src');
//                 }
//                 lazyObserver.unobserve(item);
//             });
//         }, { root: gridEl, rootMargin: '300px' });

//         return overlay;
//     }

//     // ---------------------------------------
//     // Event wiring
//     // ---------------------------------------
//     function setupEventListeners(overlay) {
//         overlay.querySelector('#closeMediaLibrary').addEventListener('click', closeMediaLibrary);
//         overlay.querySelector('#cancelMediaSelection').addEventListener('click', closeMediaLibrary);
//         overlay.querySelector('#refreshLibrary').addEventListener('click', refreshMediaLibrary);

//         overlay.querySelectorAll('.media-tab').forEach(tab => {
//             tab.addEventListener('click', () => {
//                 overlay.querySelectorAll('.media-tab').forEach(t => t.classList.remove('active'));
//                 tab.classList.add('active');
//                 activeTypeTab = tab.dataset.type;
//                 showFiles(activeTypeTab, true);
//             });
//         });

//         overlay.querySelector('#mediaSearch').addEventListener('input', e => filterMedia(e.target.value));
//         overlay.querySelector('#confirmMediaSelection').addEventListener('click', confirmSelection);

//         // allow closing with esc key when open
//         overlay.addEventListener('keydown', e => { if (e.key === 'Escape') closeMediaLibrary(); });
//     }

//     // ---------------------------------------
//     // Manifest scanning (cache-busted)
//     // ---------------------------------------
//     async function scanFiles(forceRefresh = false) {
//         if (cachedFiles && !forceRefresh) return cachedFiles;

//         try {
//             const res = await fetch(`${PRODUCTS_MANIFEST}?t=${Date.now()}`, { cache: 'no-cache' });
//             if (!res.ok) throw new Error('Failed to load manifest');
//             const products = await res.json();

//             const map = new Map();
//             const pushImage = (name, thumb) => {
//                 if (!name) return;
//                 const key = `image::${name}`;
//                 if (!map.has(key)) {
//                     // DON'T set a default thumb path when not provided; use null so we don't try to load an empty poster
//                     map.set(key, { name, type: 'image', src: `../image/${name}`, thumb: thumb || null });
//                 }
//             };
//             const pushVideo = (name, poster) => {
//                 if (!name) return;
//                 const key = `video::${name}`;
//                 if (!map.has(key)) {
//                     // DO NOT invent a poster path if none provided; leave poster null so UI won't try to load a missing poster
//                     map.set(key, { name, type: 'video', src: `../video/${name}`, poster: poster || null });
//                 }
//             };

//             products.forEach(p => {
//                 if (p.image) pushImage(p.image, p.thumb);
//                 if (Array.isArray(p.images)) p.images.forEach(i => pushImage(i));
//                 if (Array.isArray(p.mediaGallery)) {
//                     p.mediaGallery.forEach(m => {
//                         if (!m?.src) return;
//                         if (m.type === 'video') pushVideo(m.src, m.poster || m.thumb);
//                         else pushImage(m.src, m.thumb);
//                     });
//                 }
//             });

//             const files = Array.from(map.values());
//             const signature = JSON.stringify(files.map(f => f.name)).slice(0, 5000);
//             if (signature !== lastManifestSignature) {
//                 console.info('🔄 Media library refreshed: manifest updated');
//                 lastManifestSignature = signature;
//             }

//             cachedFiles = files;
//             return cachedFiles;
//         } catch (err) {
//             console.warn('⚠️ Media manifest failed:', err);
//             cachedFiles = [];
//             return cachedFiles;
//         }
//     }

//     // ---------------------------------------
//     // Render grid + lazy loading
//     // ---------------------------------------
//     async function showFiles(type = 'image', forceRefresh = false) {
//         createMediaLibrary();
//         const grid = document.getElementById('mediaGrid');
//         grid.innerHTML = '<div style="text-align:center;padding:30px;color:#9aa4b2;">Loading media...</div>';
//         const files = await scanFiles(forceRefresh);

//         const visible = type === 'all' ? files : files.filter(f => f.type === type);
//         if (!visible.length) {
//             grid.innerHTML = '<div style="text-align:center;padding:30px;color:#9aa4b2;">No files found</div>';
//             return;
//         }

//         renderFilesList(visible);
//     }

//     function renderFilesList(files) {
//         const grid = document.getElementById('mediaGrid');
//         grid.innerHTML = '';
//         files.forEach(f => {
//             const item = document.createElement('div');
//             item.className = 'media-item';
//             item.dataset.filename = f.name;
//             item.dataset.type = f.type;

//             // inner absolute container
//             const fill = document.createElement('div');
//             fill.className = 'fill';

//             if (f.type === 'image') {
//                 const img = document.createElement('img');
//                 img.alt = f.name;
//                 // lazy load the full image path; use thumb if available for immediate small preview
//                 if (f.src) img.dataset.src = f.src;
//                 img.src = f.thumb || TRANSPARENT_PIXEL; // immediate small thumb or placeholder
//                 img.loading = 'lazy';
//                 fill.appendChild(img);
//             } else {
//                 // video poster: use data-src so lazyObserver will load poster when visible
//                 const wrapper = document.createElement('div');
//                 wrapper.className = 'video-thumb';
//                 const poster = document.createElement('img');
//                 poster.alt = f.name;
//                 // only attach data-src if poster is provided; if poster is null, leave src as placeholder
//                 if (f.poster) {
//                     poster.dataset.src = f.poster;
//                     // keep a reference on the item so loadVideoInItem can reuse it
//                     item.dataset.poster = f.poster;
//                 } else {
//                     // ensure no empty poster dataset property - remove any accidental empty assignment
//                     // item.dataset.poster remains unset if no poster
//                 }
//                 poster.src = TRANSPARENT_PIXEL;        // placeholder until poster loaded
//                 poster.loading = 'lazy';
//                 wrapper.appendChild(poster);

//                 const play = document.createElement('div');
//                 play.className = 'play-icon';
//                 play.textContent = '▶';
//                 wrapper.appendChild(play);

//                 fill.appendChild(wrapper);

//                 // store video src for deferred loading
//                 if (f.src) item.dataset.videoSrc = f.src;
//             }

//             const caption = document.createElement('div');
//             caption.className = 'filename';
//             caption.textContent = f.name;

//             item.appendChild(fill);
//             item.appendChild(caption);

//             // Behavior: images -> select; videos -> load video on first tap, then select
//             item.addEventListener('click', (e) => {
//                 if (item.dataset.type === 'video') {
//                     if (item.dataset.loadedVideo) {
//                         toggleSelection(item);
//                     } else {
//                         // load <video> in place of poster (preload metadata)
//                         loadVideoInItem(item);
//                     }
//                 } else {
//                     toggleSelection(item);
//                 }
//             });

//             grid.appendChild(item);

//             // observe for lazy loading (posters & image thumbs)
//             if (lazyObserver) lazyObserver.observe(item);
//         });
//     }

//     // ---------------------------------------
//     // Deferred video loader
//     // ---------------------------------------
//     function loadVideoInItem(item) {
//         const src = item.dataset.videoSrc;
//         if (!src) return;
//         const fill = item.querySelector('.fill');
//         if (!fill) return;

//         // remove existing poster wrapper if present
//         const posterWrapper = fill.querySelector('.video-thumb');
//         if (posterWrapper) posterWrapper.remove();

//         // create video element
//         const video = document.createElement('video');
//         video.controls = true;
//         video.playsInline = true;
//         video.preload = 'metadata'; // metadata only until play
//         video.style.width = '100%';
//         video.style.height = '100%';
//         video.style.display = 'block';
//         video.setAttribute('playsinline', '');
//         // set poster if available (dataset property set earlier only if poster existed)
//         const posterUrl = item.dataset.poster || '';
//         if (posterUrl) video.poster = posterUrl;

//         const source = document.createElement('source');
//         source.src = src;
//         video.appendChild(source);

//         fill.appendChild(video);
//         item.dataset.loadedVideo = '1';

//         // clicking the video toggles selection (stop propagation)
//         video.addEventListener('click', (ev) => {
//             ev.stopPropagation();
//             toggleSelection(item);
//         });

//         // also mark selected immediately for convenience
//         toggleSelection(item);
//     }

//     // ---------------------------------------
//     // Selection / filtering
//     // ---------------------------------------
//     function toggleSelection(item) {
//         if (currentMultiple) {
//             item.classList.toggle('selected');
//         } else {
//             document.querySelectorAll('.media-item').forEach(i => i.classList.remove('selected'));
//             item.classList.add('selected');
//         }
//         updateSelectionInfo();
//     }

//     function updateSelectionInfo() {
//         const sel = document.querySelectorAll('.media-item.selected');
//         const info = document.getElementById('selectionInfo');
//         if (info) info.textContent = sel.length ? `${sel.length} file${sel.length > 1 ? 's' : ''} selected` : 'No file selected';
//     }

//     function filterMedia(term) {
//         const grid = document.getElementById('mediaGrid');
//         if (!grid) return;
//         const value = (term || '').trim().toLowerCase();
//         Array.from(grid.children).forEach(i => {
//             const match = (i.dataset.filename || '').toLowerCase().includes(value);
//             i.style.display = match ? '' : 'none';
//         });
//     }

//     function confirmSelection() {
//         const sel = Array.from(document.querySelectorAll('.media-item.selected'));
//         if (!sel.length) return alert('Please select at least one file');
//         const result = sel.map(i => {
//             if (i.dataset.type === 'image') {
//                 return {
//                     name: i.dataset.filename,
//                     type: 'image',
//                     src: i.querySelector('img')?.src || null
//                 };
//             } else {
//                 return {
//                     name: i.dataset.filename,
//                     type: 'video',
//                     src: i.dataset.videoSrc || null,
//                     // include poster if available (dataset.poster) or use the poster img src if it loaded
//                     poster: i.dataset.poster || i.querySelector('.video-thumb img')?.src || null
//                 };
//             }
//         });
//         if (currentCallback) currentCallback(result);
//         closeMediaLibrary();
//     }

//     function closeMediaLibrary() {
//         if (!mediaLibrary) return;
//         mediaLibrary.style.display = 'none';
//         const search = document.getElementById('mediaSearch');
//         if (search) search.value = '';
//         document.querySelectorAll('.media-item.selected').forEach(i => i.classList.remove('selected'));
//         updateSelectionInfo();
//     }

//     // ---------------------------------------
//     // Refresh behavior
//     // ---------------------------------------
//     async function refreshMediaLibrary() {
//         cachedFiles = null;
//         await showFiles(activeTypeTab, true);
//     }

//     // ---------------------------------------
//     // Public API
//     // ---------------------------------------
//     window.MediaLibrary = {
//         open: async ({ multiple = false, onSelect = null, initialTab = 'image' } = {}) => {
//             createMediaLibrary();
//             currentMultiple = !!multiple;
//             currentCallback = typeof onSelect === 'function' ? onSelect : null;
//             activeTypeTab = initialTab || 'image';
//             const overlay = mediaLibrary;
//             overlay.style.display = 'flex';

//             // make sure the tab states are correct
//             overlay.querySelectorAll('.media-tab').forEach(t => t.classList.remove('active'));
//             overlay.querySelector(`[data-type="${activeTypeTab}"]`)?.classList.add('active');

//             // focus search for accessibility
//             const search = overlay.querySelector('#mediaSearch');
//             if (search) search.focus();

//             await showFiles(activeTypeTab);
//             // focus overlay for ESC key to work
//             overlay.tabIndex = -1;
//             overlay.focus();
//         },
//         close: closeMediaLibrary,
//         refresh: refreshMediaLibrary,
//         preload: async () => { await scanFiles(false); }
//     };

//     // initialize modal immediately (but keep hidden)
//     createMediaLibrary();
// })();
