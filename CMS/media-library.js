// media-library.js - Manifest-driven library: immediate-load video thumbnails (CMS-like behavior)
(function() {
  // -------- CONFIG (edit if needed) --------
  const MANIFEST_PATH = './media-manifest.json'; // manifest location
  const IMAGE_FOLDER = '../image/';              // where images live (used if manifest gives filenames)
  const VIDEO_FOLDER = '../video/';              // where videos live
  const VIDEO_POSTER_FOLDER = '../video/posters/'; // optional server posters (not required)
  const IMAGE_THUMB_FOLDER = '../image/thumbs/'; // optional image thumbs
  // -----------------------------------------

  let mediaLibrary = null;
  let currentCallback = null;
  let currentMultiple = false;
  let cachedFiles = null;

  const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

  // Resolve an image path given either filename or full/relative path
  function resolveImageUrl(src) {
    if (!src) return '';
    const s = String(src);
    if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('../') || s.startsWith('/') ) return s;
    return IMAGE_FOLDER + s;
  }
  // Resolve a video path similarly
  function resolveVideoUrl(src) {
    if (!src) return '';
    const s = String(src);
    if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('../') || s.startsWith('/') ) return s;
    return VIDEO_FOLDER + s;
  }

  // -----------------------
  // Create modal & styles
  // -----------------------
  function createMediaLibrary() {
    if (mediaLibrary) return mediaLibrary;

    const overlay = document.createElement('div');
    overlay.id = 'mediaLibraryOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:none;justify-content:center;align-items:center;z-index:10000;backdrop-filter:blur(4px);';

    const modal = document.createElement('div');
    modal.id = 'mediaLibraryModal';
    modal.style.cssText = 'background:var(--card,#0b1220);border-radius:12px;padding:18px;width:94%;max-width:980px;max-height:86vh;display:flex;flex-direction:column;border:1px solid rgba(255,255,255,0.06);color:#e6eef6;overflow:hidden;box-sizing:border-box;font-family:Inter,system-ui,Arial,sans-serif;';

    modal.innerHTML = `
      <div id="mediaHeader" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;">
        <h3 style="margin:0;color:var(--accent,#06b6d4);font-size:18px;">Media Library</h3>
        <div style="display:flex;align-items:center;gap:8px;">
          <button id="refreshLibrary" title="Refresh" style="background:none;border:none;color:#9aa4b2;font-size:18px;cursor:pointer;padding:6px;">⟳</button>
          <button id="closeMediaLibrary" title="Close" style="background:none;border:none;color:#9aa4b2;font-size:22px;cursor:pointer;padding:6px;">×</button>
        </div>
      </div>

      <div id="mediaControls" style="display:flex;gap:10px;margin-bottom:10px;align-items:center;">
        <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">
          <label style="color:#cbd5e1;font-size:13px;">Images</label>
          <input id="imagesCount" type="number" min="0" step="1" value="0" style="width:80px;padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.02);color:white;">
          <label style="color:#cbd5e1;font-size:13px;margin-left:10px;">Videos</label>
          <input id="videosCount" type="number" min="0" step="1" value="0" style="width:80px;padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.02);color:white;margin-right:8px;">
          <button id="applyCounts" style="padding:8px 12px;border:none;background:var(--accent,#06b6d4);color:white;border-radius:6px;cursor:pointer;">Apply</button>
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
      .media-item{position:relative;border-radius:8px;overflow:hidden;background:rgba(255,255,255,0.02);border:2px solid transparent;cursor:pointer;transition:all .14s;display:flex;align-items:center;justify-content:center;height:0;padding-bottom:100%;box-sizing:border-box;}
      .media-item>.fill{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;}
      .media-item:hover{border-color:rgba(255,255,255,0.08);transform:translateY(-4px);}
      .media-item.selected{border-color:var(--accent,#06b6d4);box-shadow:0 6px 18px rgba(6,182,212,0.16);transform:none;}
      .media-item img,.media-item video,.media-item .video-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
      .media-item .filename{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,0.7));color:white;padding:6px;font-size:12px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .video-thumb{position:relative;width:100%;height:100%;}
      .video-thumb .play-icon{position:absolute;left:8px;top:8px;padding:6px 8px;border-radius:6px;background:rgba(0,0,0,0.45);color:white;font-weight:600;font-size:12px;}
      @media (max-width:600px){#mediaLibraryModal{width:100%;height:100vh;border-radius:0;padding:12px}.media-item{padding-bottom:100%}}
    `;
    document.head.appendChild(style);

    setupEventListeners(overlay);
    mediaLibrary = overlay;

    return overlay;
  }

  // -----------------------
  // Event wiring
  // -----------------------
  function setupEventListeners(overlay) {
    overlay.querySelector('#closeMediaLibrary').addEventListener('click', closeMediaLibrary);
    overlay.querySelector('#cancelMediaSelection').addEventListener('click', closeMediaLibrary);
    overlay.querySelector('#refreshLibrary').addEventListener('click', async () => { cachedFiles = null; await showFiles(true); });
    overlay.querySelector('#applyCounts').addEventListener('click', async () => { cachedFiles = null; await showFiles(true); });
    overlay.querySelector('#confirmMediaSelection').addEventListener('click', confirmSelection);
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') closeMediaLibrary(); });
  }

  // -----------------------
  // Load manifest helpers
  // -----------------------
  async function loadManifest() {
    try {
      const res = await fetch(`${MANIFEST_PATH}?t=${Date.now()}`, { cache: 'no-cache' });
      if (!res.ok) throw new Error('manifest not found');
      return await res.json();
    } catch (err) {
      console.warn('Media manifest load failed:', err);
      return null;
    }
  }

  async function buildFilesFromManifest(forceScan = false) {
    if (cachedFiles && !forceScan) return cachedFiles;
    const manifest = await loadManifest();
    if (!manifest) { cachedFiles = []; return cachedFiles; }

    // Count-style manifest { images: N, videos: M }
    if (typeof manifest === 'object' && !Array.isArray(manifest) && (manifest.images || manifest.videos)) {
      const imagesCount = Number(document.getElementById('imagesCount')?.value ?? manifest.images ?? 0);
      const videosCount = Number(document.getElementById('videosCount')?.value ?? manifest.videos ?? 0);
      const imgInput = document.getElementById('imagesCount');
      const vidInput = document.getElementById('videosCount');
      if (imgInput) imgInput.value = imagesCount;
      if (vidInput) vidInput.value = videosCount;

      const files = [];
      for (let i = 1; i <= imagesCount; i++) {
        const name = `image${i}.jpg`;
        files.push({ name, type: 'image', src: name, thumb: (IMAGE_THUMB_FOLDER ? `image${i}.jpg` : null) });
      }
      for (let j = 1; j <= videosCount; j++) {
        const name = `video${j}.mp4`;
        const posterCandidate = VIDEO_POSTER_FOLDER ? `video${j}.jpg` : null;
        files.push({ name, type: 'video', src: name, poster: posterCandidate });
      }
      cachedFiles = files;
      return cachedFiles;
    }

    // Array-style (product list)
    if (Array.isArray(manifest)) {
      const unique = new Map();
      const pushImage = (name, thumb) => {
        if (!name) return;
        const key = `image::${name}`;
        if (unique.has(key)) return;
        unique.set(key, { name, type: 'image', src: name, thumb: thumb || null });
      };
      const pushVideo = (name, poster) => {
        if (!name) return;
        const key = `video::${name}`;
        if (unique.has(key)) return;
        unique.set(key, { name, type: 'video', src: name, poster: poster || null });
      };

      manifest.forEach(p => {
        if (p.image) pushImage(p.image, p.thumb);
        if (Array.isArray(p.images)) p.images.forEach(img => pushImage(img));
        if (Array.isArray(p.mediaGallery)) {
          p.mediaGallery.forEach(m => {
            if (!m?.src) return;
            if (m.type === 'video') pushVideo(m.src, m.poster || m.thumb);
            else pushImage(m.src, m.thumb);
          });
        }
      });

      const files = Array.from(unique.values());
      cachedFiles = files;
      // prefill counts
      const imgInput = document.getElementById('imagesCount');
      const vidInput = document.getElementById('videosCount');
      if (imgInput) imgInput.value = files.filter(f => f.type === 'image').length;
      if (vidInput) vidInput.value = files.filter(f => f.type === 'video').length;
      return cachedFiles;
    }

    cachedFiles = [];
    return cachedFiles;
  }

  // -----------------------
  // Render grid (immediate load for everything)
  // -----------------------
  async function showFiles(forceScan = false) {
    await createMediaLibrary();
    const grid = document.getElementById('mediaGrid');
    grid.innerHTML = '<div style="text-align:center;padding:30px;color:#9aa4b2;">Loading media...</div>';

    const files = await buildFilesFromManifest(forceScan);
    const visible = files; // always show images & videos

    if (!visible.length) {
      grid.innerHTML = '<div style="text-align:center;padding:30px;color:#9aa4b2;">No files found</div>';
      return;
    }

    grid.innerHTML = '';
    for (const f of visible) {
      const item = document.createElement('div');
      item.className = 'media-item';
      item.dataset.filename = f.name;
      item.dataset.type = f.type;

      const fill = document.createElement('div');
      fill.className = 'fill';

      if (f.type === 'image') {
        const img = document.createElement('img');
        img.alt = f.name;
        // immediate load: resolve src & thumb now (no lazy)
        img.src = f.thumb ? resolveImageUrl(f.thumb) : resolveImageUrl(f.src);
        img.loading = 'eager';
        img.onerror = () => {
          item.classList.add('missing');
          const cap = item.querySelector('.filename'); if (cap) cap.textContent = `${f.name} — Missing`;
        };
        fill.appendChild(img);
      } else {
        // VIDEO thumbnail behavior: create a small <video> thumbnail element immediately,
        // autoplay + loop + muted + playsinline so it visually behaves like an image (CMS-like).
        const v = document.createElement('video');
        v.controls = false;
        // FORCE mute + zero volume to ensure no audio (additional guards)
        v.muted = true;
        v.volume = 0;
        v.setAttribute('muted', '');
        v.autoplay = true;
        v.loop = true;
        v.playsInline = true;
        v.preload = 'metadata';
        v.style.width = '100%';
        v.style.height = '100%';
        v.style.display = 'block';

        // set src using resolver
        const videoUrl = resolveVideoUrl(f.src);
        v.src = videoUrl;
        // expose video src for selection result
        item.dataset.videoSrc = videoUrl;

        // if a server poster exists, set it so browser picks it as thumbnail while loading
        if (f.poster) {
          v.poster = resolveImageUrl(f.poster);
          item.dataset.poster = v.poster;
        }

        v.onerror = () => {
          item.classList.add('missing');
          const cap = item.querySelector('.filename'); if (cap) cap.textContent = `${f.name} — Missing`;
        };

        // Further guard: if the video ever starts playing with audio unmuted, force mute again
        v.addEventListener('play', () => { try { v.muted = true; v.volume = 0; } catch (e) {} });
        v.addEventListener('volumechange', () => { try { if (!v.muted) v.muted = true; v.volume = 0; } catch(e){} });

        fill.appendChild(v);
      }

      const caption = document.createElement('div');
      caption.className = 'filename';
      caption.textContent = f.name;

      item.appendChild(fill);
      item.appendChild(caption);

      // CLICK behavior: only SELECT (no loading or toggling play). This is the key change.
      item.addEventListener('click', (e) => {
        if (item.classList.contains('missing')) return;
        // always just toggle selection; do not load/replace thumbnail with a full player
        toggleSelection(item);
      });

      grid.appendChild(item);
    }
  }

  // -----------------------
  // Deferred video loader (in-place - replaces thumbnail with a proper <video> player)
  // (Kept for future use but NOT used by click handler anymore.)
  // -----------------------
  function loadVideoInItem(item) {
    const src = item.dataset.videoSrc || (item.dataset.filename ? resolveVideoUrl(item.dataset.filename) : null);
    if (!src) return;
    const fill = item.querySelector('.fill'); if (!fill) return;

    // remove the tiny thumbnail video element (if present)
    const existing = fill.querySelector('video');
    if (existing) existing.remove();

    const video = document.createElement('video');
    // If you ever enable in-place playback, keep it muted by default to avoid surprise audio.
    video.controls = true; video.playsInline = true; video.preload = 'metadata';
    video.muted = true;
    video.volume = 0;
    video.style.width = '100%'; video.style.height = '100%'; video.style.display = 'block';
    video.setAttribute('playsinline', '');
    const posterUrl = item.dataset.poster || '';
    if (posterUrl) video.poster = posterUrl;

    const source = document.createElement('source'); source.src = src;
    video.appendChild(source);

    fill.appendChild(video);
    item.dataset.loadedVideo = '1';

    // keep click on video from propagating (but we are not using this now)
    video.addEventListener('click', ev => { ev.stopPropagation(); toggleSelection(item); });
    toggleSelection(item);
  }

  // -----------------------
  // Selection + confirm
  // -----------------------
  function toggleSelection(item) {
    if (currentMultiple) item.classList.toggle('selected');
    else {
      document.querySelectorAll('.media-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
    }
    updateSelectionInfo();
  }

  function updateSelectionInfo() {
    const sel = document.querySelectorAll('.media-item.selected');
    const info = document.getElementById('selectionInfo');
    if (info) info.textContent = sel.length ? `${sel.length} file${sel.length > 1 ? 's' : ''} selected` : 'No file selected';
  }

  function confirmSelection() {
    const sel = Array.from(document.querySelectorAll('.media-item.selected'));
    if (!sel.length) return alert('Please select at least one file');
    const result = sel.map(i => {
      if (i.dataset.type === 'image') return { name: i.dataset.filename, type: 'image', src: resolveImageUrl(i.dataset.filename) };
      else return { name: i.dataset.filename, type: 'video', src: i.dataset.videoSrc || resolveVideoUrl(i.dataset.filename), poster: i.dataset.poster || null };
    });
    if (currentCallback) currentCallback(result);
    closeMediaLibrary();
  }

  function closeMediaLibrary() {
    if (!mediaLibrary) return;
    mediaLibrary.style.display = 'none';
    document.querySelectorAll('.media-item.selected').forEach(i => i.classList.remove('selected'));
    updateSelectionInfo();
  }

  // -----------------------
  // Public API
  // -----------------------
  window.MediaLibrary = {
    open: async ({ multiple = false, onSelect = null } = {}) => {
      await createMediaLibrary();
      currentMultiple = !!multiple;
      currentCallback = typeof onSelect === 'function' ? onSelect : null;

      // Prefill counts from manifest if count-style
      const manifest = await loadManifest();
      if (manifest && typeof manifest === 'object' && !Array.isArray(manifest) && (manifest.images || manifest.videos)) {
        const imgInput = document.getElementById('imagesCount');
        const vidInput = document.getElementById('videosCount');
        if (imgInput) imgInput.value = manifest.images || 0;
        if (vidInput) vidInput.value = manifest.videos || 0;
      }

      mediaLibrary.style.display = 'flex';
      await showFiles(true);
      mediaLibrary.tabIndex = -1; mediaLibrary.focus();
    },
    close: closeMediaLibrary,
    refresh: async () => { cachedFiles = null; await showFiles(true); },
    preload: async () => { await buildFilesFromManifest(false); }
  };

  // Initialize DOM (keeps hidden)
  createMediaLibrary();

})();


