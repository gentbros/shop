// media-library.js - Optimized Media Library with Cache Refresh
(function () {
  let mediaLibrary = null;
  let currentCallback = null;
  let currentMultiple = false;
  let cachedFiles = null;
  let isScanning = false;

  function createMediaLibrary() {
    if (mediaLibrary) return mediaLibrary;

    const overlay = document.createElement("div");
    overlay.id = "mediaLibraryOverlay";
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.8);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 10000;
      backdrop-filter: blur(5px);
    `;

    const modal = document.createElement("div");
    modal.style.cssText = `
      background: var(--card, #0b1220);
      border-radius: 12px;
      padding: 20px;
      width: 90%;
      max-width: 900px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      border: 1px solid rgba(255,255,255,0.1);
      color: #e6eef6;
      overflow: hidden;
      font-family: Inter, Segoe UI, Roboto, system-ui, Arial;
    `;

    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h3 style="margin:0;color:var(--accent,#06b6d4);">Media Library</h3>
        <div style="display:flex;gap:10px;align-items:center;">
          <button id="refreshMedia" style="background:none;border:1px solid rgba(255,255,255,0.2);
            color:#9aa4b2;padding:6px 12px;border-radius:6px;cursor:pointer;">⟳ Refresh</button>
          <button id="closeMediaLibrary" style="background:none;border:none;color:#9aa4b2;font-size:20px;cursor:pointer;">×</button>
        </div>
      </div>

      <input type="text" id="mediaSearch" placeholder="Search files..."
        style="width:100%;padding:8px 12px;margin-bottom:15px;border-radius:8px;
        border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:white;">

      <div style="display:flex;gap:10px;margin-bottom:15px;">
        <button id="tabImages" class="media-tab active" data-type="image">Images</button>
        <button id="tabVideos" class="media-tab" data-type="video">Videos</button>
        <button id="tabAll" class="media-tab" data-type="all">All</button>
      </div>

      <div id="mediaGrid" style="flex:1;overflow-y:auto;display:grid;
        grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;
        padding:10px;background:rgba(255,255,255,0.02);border-radius:8px;">
        <div style="text-align:center;padding:30px;color:#9aa4b2;">Loading media...</div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:15px;
        padding-top:15px;border-top:1px solid rgba(255,255,255,0.1);">
        <div id="selectionInfo" style="color:#9aa4b2;font-size:14px;">No file selected</div>
        <div style="display:flex;gap:10px;">
          <button id="cancelMediaSelection" style="padding:8px 16px;border:1px solid rgba(255,255,255,0.2);
            background:transparent;color:#9aa4b2;border-radius:6px;cursor:pointer;">Cancel</button>
          <button id="confirmMediaSelection" style="padding:8px 16px;border:none;background:var(--accent,#06b6d4);
            color:white;border-radius:6px;cursor:pointer;">Select</button>
        </div>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const style = document.createElement("style");
    style.textContent = `
      .media-tab {
        padding:8px 16px;border:1px solid rgba(255,255,255,0.1);
        background:rgba(255,255,255,0.05);color:#9aa4b2;border-radius:6px;cursor:pointer;
        transition:all 0.2s ease;
      }
      .media-tab.active {background:var(--accent,#06b6d4);color:white;border-color:var(--accent,#06b6d4);}
      .media-item {
        position:relative;aspect-ratio:1;border-radius:8px;overflow:hidden;background:rgba(255,255,255,0.03);
        border:2px solid transparent;cursor:pointer;transition:all 0.2s ease;
      }
      .media-item:hover {border-color:rgba(255,255,255,0.2);transform:translateY(-2px);}
      .media-item.selected {border-color:var(--accent,#06b6d4);box-shadow:0 4px 12px rgba(6,182,212,0.3);}
      .media-item img,.media-item video {width:100%;height:100%;object-fit:cover;}
      .media-item .filename {
        position:absolute;bottom:0;left:0;right:0;
        background:linear-gradient(transparent,rgba(0,0,0,0.8));color:white;
        padding:6px 4px 4px;font-size:11px;text-align:center;white-space:nowrap;
        overflow:hidden;text-overflow:ellipsis;
      }
    `;
    document.head.appendChild(style);

    setupEventListeners();
    mediaLibrary = overlay;
    return overlay;
  }

  function setupEventListeners() {
    document.getElementById("closeMediaLibrary").addEventListener("click", closeMediaLibrary);
    document.getElementById("cancelMediaSelection").addEventListener("click", closeMediaLibrary);
    document.getElementById("refreshMedia").addEventListener("click", refreshMediaLibrary);

    document.querySelectorAll(".media-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".media-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        showFiles(tab.dataset.type);
      });
    });

    document.getElementById("mediaSearch").addEventListener("input", (e) => filterMedia(e.target.value));
    document.getElementById("confirmMediaSelection").addEventListener("click", confirmSelection);
  }

  async function fileExists(url) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function scanFilesOnce(forceRescan = false) {
    if (isScanning) return cachedFiles;
    if (!forceRescan && cachedFiles) return cachedFiles;

    isScanning = true;
    const results = [];
    const imageExt = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
    const videoExt = [".mp4", ".webm", ".mov"];
    const maxScan = 200; // supports up to 200 files

    const checkFiles = async (pathPrefix, extensions, type) => {
      for (let i = 1; i <= maxScan; i++) {
        for (const ext of extensions) {
          const path = `../${pathPrefix}/${type}${i}${ext}`;
          if (await fileExists(path)) {
            results.push({ name: `${type}${i}${ext}`, type });
            break;
          }
        }
      }
    };

    await Promise.all([
      checkFiles("image", imageExt, "image"),
      checkFiles("video", videoExt, "video"),
    ]);

    cachedFiles = results;
    isScanning = false;
    return results;
  }

  async function showFiles(type = "image") {
    const grid = document.getElementById("mediaGrid");
    grid.innerHTML = '<div style="text-align:center;padding:30px;color:#9aa4b2;">Loading...</div>';

    const files = cachedFiles || (await scanFilesOnce());
    const visible = type === "all" ? files : files.filter((f) => f.type === type);

    grid.innerHTML = "";
    if (!visible.length) {
      grid.innerHTML = '<div style="text-align:center;padding:30px;color:#9aa4b2;">No files found</div>';
      return;
    }

    visible.forEach((file) => {
      const item = document.createElement("div");
      item.className = "media-item";
      item.dataset.filename = file.name;
      item.dataset.type = file.type;

      if (file.type === "image") {
        const img = document.createElement("img");
        img.loading = "lazy";
        img.src = `../image/${file.name}`;
        item.appendChild(img);
      } else {
        const video = document.createElement("video");
        video.src = `../video/${file.name}`;
        video.muted = true;
        item.appendChild(video);
      }

      const caption = document.createElement("div");
      caption.className = "filename";
      caption.textContent = file.name;
      item.appendChild(caption);

      item.addEventListener("click", () => {
        if (currentMultiple) item.classList.toggle("selected");
        else {
          document.querySelectorAll(".media-item").forEach((i) => i.classList.remove("selected"));
          item.classList.add("selected");
        }
        updateSelectionInfo();
      });

      grid.appendChild(item);
    });
  }

  function refreshMediaLibrary() {
    cachedFiles = null;
    showFiles(document.querySelector(".media-tab.active").dataset.type);
  }

  function filterMedia(term) {
    term = term.toLowerCase();
    document.querySelectorAll(".media-item").forEach((i) => {
      const match = i.dataset.filename.toLowerCase().includes(term);
      i.style.display = match ? "block" : "none";
    });
  }

  function updateSelectionInfo() {
    const sel = document.querySelectorAll(".media-item.selected");
    const info = document.getElementById("selectionInfo");
    info.textContent = sel.length
      ? `${sel.length} file${sel.length > 1 ? "s" : ""} selected`
      : "No file selected";
  }

  function confirmSelection() {
    const sel = document.querySelectorAll(".media-item.selected");
    if (!sel.length) return alert("Please select at least one file");
    const result = Array.from(sel).map((i) => ({
      name: i.dataset.filename,
      type: i.dataset.type,
    }));
    if (currentCallback) currentCallback(result);
    closeMediaLibrary();
  }

  function closeMediaLibrary() {
    if (!mediaLibrary) return;
    mediaLibrary.style.display = "none";
    document.getElementById("mediaSearch").value = "";
    document.querySelectorAll(".media-item").forEach((i) => i.classList.remove("selected"));
    document.getElementById("selectionInfo").textContent = "No file selected";
  }

  window.MediaLibrary = {
    open: function ({ multiple = false, onSelect = null } = {}) {
      createMediaLibrary();
      currentMultiple = multiple;
      currentCallback = onSelect;
      showFiles(document.querySelector(".media-tab.active").dataset.type);
      mediaLibrary.style.display = "flex";
    },
    close: closeMediaLibrary,
  };
})();
