// media-library.js - Manifest-driven, lazy-loading Media Library (auto-refresh capable)
(function() {
    let mediaLibrary = null;
    let currentCallback = null;
    let currentMultiple = false;
    let cachedFiles = null;
    let activeTypeTab = 'image';
    const PRODUCTS_MANIFEST = '../products.json';
    let lastManifestSignature = ''; // for change detection

    // -----------------------
    // Create the Media Library modal
    // -----------------------
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
                <div style="display:flex;align-items:center;gap:8px;">
                    <button id="refreshLibrary" title="Refresh" 
                        style="background:none;border:none;color:#9aa4b2;font-size:18px;cursor:pointer;">⟳</button>
                    <button id="closeMediaLibrary" title="Close" 
                        style="background:none;border:none;color:#9aa4b2;font-size:22px;cursor:pointer;">×</button>
                </div>
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

            <div id="mediaGrid" style="flex:1;overflow:auto;display:grid;
                grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;
                padding:10px;background:rgba(255,255,255,0.015);border-radius:8px;">
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
                border:2px solid transparent;cursor:pointer;transition:all 0.14s ease;display:flex;
                align-items:center;justify-content:center;
            }
            .media-item:hover {border-color:rgba(255,255,255,0.08);transform:translateY(-4px);}
            .media-item.selected {border-color:var(--accent,#06b6d4);box-shadow:0 6px 18px rgba(6,182,212,0.16);}
            .media-item img,.media-item video,.media-item .video-thumb img {width:100%;height:100%;object-fit:cover;}
            .media-item .filename {
                position:absolute;bottom:0;left:0;right:0;
                background:linear-gradient(transparent,rgba(0,0,0,0.7));
                color:white;padding:6px;font-size:12px;text-align:center;white-space:nowrap;
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

    // -----------------------
    // Event Listeners
    // -----------------------
    function setupEventListeners(overlay) {
        overlay.querySelector('#closeMediaLibrary').addEventListener('click', closeMediaLibrary);
        overlay.querySelector('#cancelMediaSelection').addEventListener('click', closeMediaLibrary);
        overlay.querySelector('#refreshLibrary').addEventListener('click', refreshMediaLibrary);

        overlay.querySelectorAll('.media-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                overlay.querySelectorAll('.media-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                activeTypeTab = tab.dataset.type;
                showFiles(activeTypeTab, true);
            });
        });

        overlay.querySelector('#mediaSearch').addEventListener('input', e => filterMedia(e.target.value));

        overlay.querySelector('#confirmMediaSelection').addEventListener('click', confirmSelection);

        overlay.addEventListener('keydown', e => { if (e.key === 'Escape') closeMediaLibrary(); });
    }

    // -----------------------
    // Manifest scan (with cache buster + change detection)
    // -----------------------
    async function scanFiles(forceRefresh = false) {
        if (cachedFiles && !forceRefresh) return cachedFiles;

        try {
            const res = await fetch(`${PRODUCTS_MANIFEST}?t=${Date.now()}`, { cache: 'no-cache' });
            if (!res.ok) throw new Error('Failed to load manifest');
            const products = await res.json();

            const map = new Map();
            const pushImage = (name, thumb) => {
                if (!name) return;
                const key = `image::${name}`;
                if (!map.has(key)) {
                    map.set(key, { name, type: 'image', src: `../image/${name}`, thumb: thumb || `../image/thumbs/${name}` });
                }
            };
            const pushVideo = (name, poster) => {
                if (!name) return;
                const key = `video::${name}`;
                if (!map.has(key)) {
                    map.set(key, { name, type: 'video', src: `../video/${name}`, poster: poster || `../video/posters/${name.replace(/\.\w+$/, '.jpg')}` });
                }
            };

            products.forEach(p => {
                if (p.image) pushImage(p.image, p.thumb);
                if (Array.isArray(p.images)) p.images.forEach(i => pushImage(i));
                if (Array.isArray(p.mediaGallery))
                    p.mediaGallery.forEach(m => {
                        if (!m?.src) return;
                        if (m.type === 'video') pushVideo(m.src, m.poster || m.thumb);
                        else pushImage(m.src, m.thumb);
                    });
            });

            const files = Array.from(map.values());
            const signature = JSON.stringify(files.map(f => f.name)).slice(0, 5000);
            if (signature !== lastManifestSignature) {
                console.info('🔄 Media library refreshed: manifest updated');
                lastManifestSignature = signature;
            }

            cachedFiles = files;
            return cachedFiles;
        } catch (err) {
            console.warn('⚠️ Media manifest failed:', err);
            cachedFiles = [];
            return cachedFiles;
        }
    }

    // -----------------------
    // Grid display + lazy loading
    // -----------------------
    async function showFiles(type = 'image', forceRefresh = false) {
        const grid = document.getElementById('mediaGrid');
        grid.innerHTML = '<div style="text-align:center;padding:30px;color:#9aa4b2;">Loading...</div>';
        const files = await scanFiles(forceRefresh);

        const visible = type === 'all' ? files : files.filter(f => f.type === type);
        if (!visible.length) {
            grid.innerHTML = '<div style="text-align:center;padding:30px;color:#9aa4b2;">No files found</div>';
            return;
        }

        renderFilesList(visible);
    }

    const lazyObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const item = entry.target;
            const type = item.dataset.type;
            if (type === 'image') {
                const img = item.querySelector('img');
                if (img?.dataset.src) {
                    img.src = img.dataset.src;
                    delete img.dataset.src;
                }
            }
            lazyObserver.unobserve(item);
        });
    }, { root: document.getElementById('mediaGrid'), rootMargin: '300px' });

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
                img.dataset.src = f.src;
                img.src = f.thumb || f.src;
                img.loading = 'lazy';
                item.appendChild(img);
            } else {
                const wrapper = document.createElement('div');
                wrapper.className = 'video-thumb';
                const poster = document.createElement('img');
                poster.src = f.poster || '../video/default-poster.jpg';
                wrapper.appendChild(poster);
                const play = document.createElement('div');
                play.className = 'play-icon';
                play.textContent = '▶';
                wrapper.appendChild(play);
                item.appendChild(wrapper);
            }

            const cap = document.createElement('div');
            cap.className = 'filename';
            cap.textContent = f.name;
            item.appendChild(cap);

            item.addEventListener('click', () => toggleSelection(item));

            grid.appendChild(item);
            lazyObserver.observe(item);
        });
    }

    // -----------------------
    // Selection + filters
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
        info.textContent = sel.length ? `${sel.length} file${sel.length > 1 ? 's' : ''} selected` : 'No file selected';
    }

    function filterMedia(term) {
        const grid = document.getElementById('mediaGrid');
        const value = term.trim().toLowerCase();
        Array.from(grid.children).forEach(i => {
            const match = (i.dataset.filename || '').toLowerCase().includes(value);
            i.style.display = match ? '' : 'none';
        });
    }

    function confirmSelection() {
        const sel = Array.from(document.querySelectorAll('.media-item.selected'));
        if (!sel.length) return alert('Please select at least one file');
        const result = sel.map(i => ({
            name: i.dataset.filename,
            type: i.dataset.type,
            src: i.querySelector('img')?.src || null
        }));
        if (currentCallback) currentCallback(result);
        closeMediaLibrary();
    }

    function closeMediaLibrary() {
        mediaLibrary.style.display = 'none';
        document.getElementById('mediaSearch').value = '';
        document.querySelectorAll('.media-item.selected').forEach(i => i.classList.remove('selected'));
        updateSelectionInfo();
    }

    // -----------------------
    // Refresh Button
    // -----------------------
    async function refreshMediaLibrary() {
        cachedFiles = null;
        await showFiles(activeTypeTab, true);
    }

    // -----------------------
    // Public API
    // -----------------------
    window.MediaLibrary = {
        open: async ({ multiple = false, onSelect = null, initialTab = 'image' } = {}) => {
            createMediaLibrary();
            currentMultiple = multiple;
            currentCallback = onSelect;
            activeTypeTab = initialTab;
            const overlay = mediaLibrary;
            overlay.style.display = 'flex';
            overlay.querySelectorAll('.media-tab').forEach(t => t.classList.remove('active'));
            overlay.querySelector(`[data-type="${initialTab}"]`)?.classList.add('active');
            await showFiles(initialTab);
        },
        close: closeMediaLibrary,
        refresh: refreshMediaLibrary
    };

    createMediaLibrary();
})();
