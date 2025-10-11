// media-library.js - Manifest-driven, lazy-loading Media Library
(function() {
    // PUBLIC API state
    let mediaLibrary = null;
    let currentCallback = null;
    let currentMultiple = false;
    let cachedFiles = null; // cached manifest-derived file list
    let activeTypeTab = 'image'; // default tab
    const PRODUCTS_MANIFEST = '../products.json'; // change if your manifest path differs

    // --- UI creation (modal + styles) ---
    function createMediaLibrary() {
        if (mediaLibrary) return mediaLibrary;

        const overlay = document.createElement('div');
        overlay.id = 'mediaLibraryOverlay';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.75);
            display: none;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            backdrop-filter: blur(4px);
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background: var(--card, #0b1220);
            border-radius: 12px;
            padding: 18px;
            width: 94%;
            max-width: 980px;
            max-height: 86vh;
            display: flex;
            flex-direction: column;
            border: 1px solid rgba(255,255,255,0.06);
            color: #e6eef6;
            overflow: hidden;
            font-family: Inter, system-ui, Arial, sans-serif;
        `;

        modal.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                <h3 id="mediaTitle" style="margin:0;color:var(--accent,#06b6d4);font-size:18px;">Media Library</h3>
                <button id="closeMediaLibrary" title="Close" style="background:none;border:none;color:#9aa4b2;font-size:22px;cursor:pointer;">×</button>
            </div>

            <div style="display:flex;gap:10px;margin-bottom:12px;align-items:center;">
                <input type="text" id="mediaSearch" placeholder="Search files..." 
                    style="flex:1;padding:9px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);
                    background:rgba(255,255,255,0.03);color:white;">
                <div style="display:flex;gap:8px;">
                    <button id="tabImages" class="media-tab active" data-type="image">Images</button>
                    <button id="tabVideos" class="media-tab" data-type="video">Videos</button>
                    <button id="tabAll" class="media-tab" data-type="all">All</button>
                </div>
            </div>

            <div id="mediaGrid" style="flex:1;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));
                gap:10px;padding:10px;background:rgba(255,255,255,0.015);border-radius:8px;">
                <div style="text-align:center;padding:30px;color:#9aa4b2;">Loading media...</div>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;
                padding-top:12px;border-top:1px solid rgba(255,255,255,0.06);">
                <div id="selectionInfo" style="color:#9aa4b2;font-size:13px;">No file selected</div>
                <div style="display:flex;gap:10px;">
                    <button id="cancelMediaSelection" style="padding:8px 14px;border:1px solid rgba(255,255,255,0.12);
                        background:transparent;color:#9aa4b2;border-radius:6px;cursor:pointer;">Cancel</button>
                    <button id="confirmMediaSelection" style="padding:8px 14px;border:none;background:var(--accent,#06b6d4);
                        color:white;border-radius:6px;cursor:pointer;">Select</button>
                </div>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const style = document.createElement('style');
        style.textContent = `
            .media-tab {
                padding:7px 12px;border:1px solid rgba(255,255,255,0.06);
                background:rgba(255,255,255,0.02);color:#cbd5e1;border-radius:6px;cursor:pointer;
                transition:all 0.15s ease;font-size:13px;
            }
            .media-tab.active {background:var(--accent,#06b6d4);color:white;border-color:var(--accent,#06b6d4);}
            .media-item {
                position:relative;aspect-ratio:1;border-radius:8px;overflow:hidden;background:rgba(255,255,255,0.02);
                border:2px solid transparent;cursor:pointer;transition:all 0.14s ease;display:flex;align-items:center;justify-content:center;
            }
            .media-item:hover {border-color:rgba(255,255,255,0.08);transform:translateY(-4px);}
            .media-item.selected {border-color:var(--accent,#06b6d4);box-shadow:0 6px 18px rgba(6,182,212,0.16);transform:none;}
            .media-item img,.media-item video,.media-item .video-thumb img {width:100%;height:100%;object-fit:cover;display:block;}
            .media-item .filename {
                position:absolute;bottom:0;left:0;right:0;
                background:linear-gradient(transparent,rgba(0,0,0,0.7));color:white;
                padding:6px 6px 6px;font-size:12px;text-align:center;white-space:nowrap;
                overflow:hidden;text-overflow:ellipsis;
            }
            .video-thumb {position:relative;width:100%;height:100%;}
            .video-thumb .play-icon {
                position:absolute;left:8px;top:8px;padding:6px 8px;border-radius:6px;background:rgba(0,0,0,0.45);
                color:white;font-weight:600;font-size:12px;
            }
        `;
        document.head.appendChild(style);

        setupEventListeners(overlay);
        mediaLibrary = overlay;
        return overlay;
    }

    // --- Event wiring ---
    function setupEventListeners(overlay) {
        overlay.querySelector('#closeMediaLibrary').addEventListener('click', closeMediaLibrary);
        overlay.querySelector('#cancelMediaSelection').addEventListener('click', closeMediaLibrary);
        overlay.querySelectorAll('.media-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                overlay.querySelectorAll('.media-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                activeTypeTab = tab.dataset.type;
                showFiles(activeTypeTab);
            });
        });
        overlay.querySelector('#mediaSearch').addEventListener('input', e => filterMedia(e.target.value));
        overlay.querySelector('#confirmMediaSelection').addEventListener('click', confirmSelection);

        // click handling for video play/selection & keyboard escape
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeMediaLibrary();
        });
    }

    // --- Manifest-based scanning (fast) ---
    // Returns array of { name, type: 'image'|'video', src, thumb?, poster? }
    async function scanFilesOnce() {
        if (cachedFiles) return cachedFiles;

        // Fetch products.json manifest
        try {
            const res = await fetch(PRODUCTS_MANIFEST, { cache: 'no-cache' });
            if (!res.ok) throw new Error('manifest fetch failed');
            const products = await res.json();

            const map = new Map();

            // Helpers to push files into map uniquely
            const pushImage = (name, thumb) => {
                if (!name) return;
                const key = `image::${name}`;
                if (!map.has(key)) {
                    // Derive thumb if not explicitly provided
                    const thumbPath = thumb || `../image/thumbs/${name}`;
                    map.set(key, {
                        name,
                        type: 'image',
                        src: `../image/${name}`,
                        thumb: thumbPath
                    });
                }
            };
            const pushVideo = (name, poster) => {
                if (!name) return;
                const key = `video::${name}`;
                if (!map.has(key)) {
                    const posterPath = poster || `../video/posters/${name.replace(/\.\w+$/, '.jpg')}`;
                    map.set(key, {
                        name,
                        type: 'video',
                        src: `../video/${name}`,
                        poster: posterPath
                    });
                }
            };

            // Iterate products: use 'image', 'images', and 'mediaGallery' as authoritative sources
            products.forEach(p => {
                if (p.image) {
                    // allow product to include thumb: p.thumb (optional)
                    pushImage(p.image, p.thumb);
                }
                if (Array.isArray(p.images)) p.images.forEach(img => pushImage(img));
                if (Array.isArray(p.mediaGallery)) {
                    p.mediaGallery.forEach(m => {
                        if (!m || !m.src) return;
                        if (m.type === 'video') pushVideo(m.src, m.poster || m.thumb);
                        else pushImage(m.src, m.thumb);
                    });
                }
            });

            cachedFiles = Array.from(map.values());
            return cachedFiles;
        } catch (err) {
            console.warn('Media manifest load failed:', err);
            // graceful fallback: empty list (avoid probing server with many HEADs)
            cachedFiles = [];
            return cachedFiles;
        }
    }

    // --- Show files (grid) filtered by type ---
    async function showFiles(type = 'image') {
        createMediaLibrary(); // ensure modal exists
        const grid = document.getElementById('mediaGrid');
        grid.innerHTML = '<div style="text-align:center;padding:30px;color:#9aa4b2;">Loading...</div>';

        const files = await scanFilesOnce();
        let visible;
        if (type === 'all') visible = files;
        else visible = files.filter(f => f.type === type);

        if (!visible || !visible.length) {
            grid.innerHTML = '<div style="text-align:center;padding:30px;color:#9aa4b2;">No files found</div>';
            return;
        }

        renderFilesList(visible);
    }

    // --- Lazy loading infrastructure ---
    // IntersectionObserver observes each .media-item; when visible it swaps the thumbnail for full src
    const lazyObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const item = entry.target;
            const type = item.dataset.type;
            if (type === 'image') {
                const img = item.querySelector('img');
                if (img && img.dataset.src) {
                    img.src = img.dataset.src;
                    delete img.dataset.src;
                }
            } else if (type === 'video') {
                // do nothing aggressive - we keep poster img in place and wait for user click to load video
            }
            lazyObserver.unobserve(item);
        });
    }, { root: document.getElementById('mediaGrid'), rootMargin: '300px' });

    // --- Render grid items (thumbnails & selection) ---
    function renderFilesList(files) {
        const grid = document.getElementById('mediaGrid');
        grid.innerHTML = '';
        files.forEach(f => {
            const item = document.createElement('div');
            item.className = 'media-item';
            item.dataset.filename = f.name;
            item.dataset.type = f.type;

            if (f.type === 'image') {
                const img = document.createElement('img');
                img.alt = f.name;
                img.dataset.src = f.src;     // full image will be swapped in when visible
                img.src = f.thumb || f.src;  // show thumbnail immediately (or full if no thumb)
                img.loading = 'lazy';
                item.appendChild(img);
            } else {
                // video: render poster thumbnail and a play icon; don't set <video> src yet
                const wrapper = document.createElement('div');
                wrapper.className = 'video-thumb';
                const posterImg = document.createElement('img');
                posterImg.alt = f.name;
                posterImg.dataset.src = f.poster || '';
                posterImg.src = f.poster || '../video/default-poster.jpg';
                posterImg.loading = 'lazy';
                wrapper.appendChild(posterImg);

                const play = document.createElement('div');
                play.className = 'play-icon';
                play.textContent = '▶';
                wrapper.appendChild(play);

                item.appendChild(wrapper);
                item.dataset.videoSrc = f.src;
                item.dataset.poster = f.poster || '';
            }

            const caption = document.createElement('div');
            caption.className = 'filename';
            caption.textContent = f.name;
            item.appendChild(caption);

            // click behaviour: selection (single/multi) or deferred video load on thumbnail click
            item.addEventListener('click', (e) => {
                // if click was on video poster and not using multiple selection, load video element instead of immediate selection
                if (item.dataset.type === 'video') {
                    // if already loaded to video element then treat as selection
                    if (item.dataset.loadedVideo) {
                        toggleSelection(item);
                    } else {
                        // replace poster with actual <video> element (preload metadata only)
                        loadVideoInItem(item);
                    }
                    return;
                }

                // for images, select/deselect
                toggleSelection(item);
            });

            grid.appendChild(item);
            lazyObserver.observe(item);
        });
    }

    function toggleSelection(item) {
        if (currentMultiple) {
            item.classList.toggle('selected');
        } else {
            document.querySelectorAll('.media-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
        }
        updateSelectionInfo();
    }

    // --- Deferred video loader: create <video> element only on user demand ---
    function loadVideoInItem(item) {
        const src = item.dataset.videoSrc;
        if (!src) return;
        // create <video> element
        const video = document.createElement('video');
        video.controls = true;
        video.playsInline = true;
        video.preload = 'metadata'; // do not download full video until play
        video.style.width = '100%';
        video.style.height = '100%';
        const source = document.createElement('source');
        source.src = src;
        video.appendChild(source);

        // remove poster wrapper if exists
        const wrapper = item.querySelector('.video-thumb');
        if (wrapper) wrapper.remove();

        // insert video before filename
        const filename = item.querySelector('.filename');
        item.insertBefore(video, filename);
        item.dataset.loadedVideo = '1';

        // clicking now toggles selection (so attach click handler to selection)
        video.addEventListener('click', (ev) => {
            // prevent bubbling to parent which would attempt to reload video
            ev.stopPropagation();
            toggleSelection(item);
        });

        updateSelectionInfo();
    }

    // --- Filter by search term (client-side) ---
    function filterMedia(term) {
        const grid = document.getElementById('mediaGrid');
        if (!grid) return;
        term = (term || '').trim().toLowerCase();
        if (!term) {
            Array.from(grid.children).forEach(i => i.style.display = '');
            return;
        }
        Array.from(grid.children).forEach(i => {
            const name = (i.dataset.filename || '').toLowerCase();
            const visible = name.includes(term);
            i.style.display = visible ? '' : 'none';
        });
    }

    // --- Selection info & confirm/cancel ---
    function updateSelectionInfo() {
        const sel = document.querySelectorAll('.media-item.selected');
        const info = document.getElementById('selectionInfo');
        if (!info) return;
        info.textContent = sel.length ? `${sel.length} file${sel.length > 1 ? 's' : ''} selected` : 'No file selected';
    }

    function confirmSelection() {
        const sel = Array.from(document.querySelectorAll('.media-item.selected'));
        if (!sel.length) {
            return alert('Please select at least one file');
        }
        const result = sel.map(i => {
            return {
                name: i.dataset.filename,
                type: i.dataset.type,
                // return recommended URLs (full src for image/video)
                src: i.dataset.type === 'image' ? (i.querySelector('img')?.src || null) : (i.dataset.videoSrc || null)
            };
        });
        if (currentCallback) currentCallback(result);
        closeMediaLibrary();
    }

    function closeMediaLibrary() {
        if (!mediaLibrary) return;
        mediaLibrary.style.display = 'none';
        const search = document.getElementById('mediaSearch');
        if (search) search.value = '';
        // clean selection
        document.querySelectorAll('.media-item.selected').forEach(i => i.classList.remove('selected'));
        const info = document.getElementById('selectionInfo');
        if (info) info.textContent = 'No file selected';
    }

    // --- Public API: open/close ---
    window.MediaLibrary = {
        open: async function({ multiple = false, onSelect = null, initialTab = 'image' } = {}) {
            createMediaLibrary();
            currentMultiple = !!multiple;
            currentCallback = typeof onSelect === 'function' ? onSelect : null;
            // set tab
            initialTab = initialTab || 'image';
            activeTypeTab = initialTab;
            const overlay = mediaLibrary;
            // activate correct tab button
            overlay.querySelectorAll('.media-tab').forEach(t => t.classList.remove('active'));
            const tabEl = Array.from(overlay.querySelectorAll('.media-tab')).find(t => t.dataset.type === initialTab) || overlay.querySelector('.media-tab');
            if (tabEl) tabEl.classList.add('active');

            // show, focus search for keyboard accessibility
            overlay.style.display = 'flex';
            const search = overlay.querySelector('#mediaSearch');
            if (search) search.focus();

            // fetch and render files
            await showFiles(activeTypeTab);

            // allow closing with Esc
            overlay.tabIndex = -1;
            overlay.focus();
        },
        close: closeMediaLibrary
    };

    // Auto-init: create the modal once script loads (but keep hidden)
    createMediaLibrary();

    // Expose helper to prewarm the cache (optional): call MediaLibrary.preload()
    window.MediaLibrary.preload = async function() {
        await scanFilesOnce();
    };
})();
