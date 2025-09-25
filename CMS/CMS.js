
  // CMS client-side editor with a source-toggle button placed in the product list header.
  (function(){
    // Elements
    const LIST = document.getElementById('productsList');
    const editorTitle = document.getElementById('editorTitle');
    const inputs = {
      productId: document.getElementById('productId'),
      title: document.getElementById('title'),
      pageUrl: document.getElementById('pageUrl'),
      price: document.getElementById('price'),
      originalPrice: document.getElementById('originalPrice'),
      description: document.getElementById('description'),
      rating: document.getElementById('rating'),
      reviews: document.getElementById('reviews')
    };

    const categoriesEl = document.getElementById('categories');
    const featuresEl = document.getElementById('features');
    const categoryInput = document.getElementById('categoryInput');
    const featureInput = document.getElementById('featureInput');
    const mediaContainer = document.getElementById('mediaContainer');
    const imagesContainer = document.getElementById('imagesContainer');
    const mainImageArea = document.getElementById('mainImageArea');
    const bigPreview = document.getElementById('bigPreview');
    const variantsEl = document.getElementById('variants');

    // Toolbar buttons and controls
    const btnNew = document.getElementById('btnNew');
    const btnImport = document.getElementById('btnImport');
    const btnExport = document.getElementById('btnExport');
    const btnSend = document.getElementById('btnSend');
    const btnReset = document.getElementById('btnReset');
    const btnClearLocal = document.getElementById('btnClearLocal');
    const btnDuplicate = document.getElementById('btnDuplicate');
    const btnDelete = document.getElementById('btnDelete');
    const applyChanges = document.getElementById('applyChanges');
    const saveAll = document.getElementById('saveAll');
    const exportProduct = document.getElementById('exportProduct');
    const btnImportFile = document.getElementById('importJSON');

    const toolbar = document.querySelector('.toolbar');

    // Add Load from Sheet / Delete Sheet buttons if missing
    let btnLoadSheet = document.getElementById('btnLoadSheet');
    if(!btnLoadSheet){
      btnLoadSheet = document.createElement('button');
      btnLoadSheet.id = 'btnLoadSheet';
      btnLoadSheet.textContent = 'Load from Sheet';
      toolbar.appendChild(btnLoadSheet);
    }
    let btnDeleteSheet = document.getElementById('btnDeleteSheet');
    if(!btnDeleteSheet){
      btnDeleteSheet = document.createElement('button');
      btnDeleteSheet.id = 'btnDeleteSheet';
      btnDeleteSheet.textContent = 'Delete Sheet Data';
      toolbar.appendChild(btnDeleteSheet);
    }

    // File drop inputs
    const mediaDrop = document.getElementById('mediaDrop');
    const mediaSelect = document.getElementById('mediaSelect');
    const mediaFile = document.getElementById('mediaFile');
    const imagesDrop = document.getElementById('imagesDrop');
    const imagesSelect = document.getElementById('imagesSelect');
    const imagesFile = document.getElementById('imagesFile');
    const mainDrop = document.getElementById('mainDrop');
    const mainSelect = document.getElementById('mainSelect');
    const mainFile = document.getElementById('mainFile');

    const status = document.getElementById('saveStatus');

    // Your Apps Script endpoint
    const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyK5m0iaLvc3IbtfWzInTNW5leCJpVKlURnseUgswGQr7aWVo-SIIneKZwg7j8kNRRNYA/exec";

    let products = [];
    let current = null; // product.id currently editing
    // sessionUploads kept for backward compatibility but won't be used for server-backed files
    const sessionUploads = { images: {}, media: {}, main: {} };

    // Data source: 'json' or 'sheet'
    let dataSource = 'json';
    let localCache = null; // cached local products when switching to Sheet

    // Insert a toggle button inside the product list header (next to + New)
    (function insertSourceToggleIntoListHeader(){
      const header = document.querySelector('aside.panel > div');
      if(!header) return;
      const right = header.querySelector('div') || header;
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.gap = '8px';
      wrap.style.alignItems = 'center';

      const existingNew = right.querySelector('#btnNew');
      if(existingNew){
        right.removeChild(existingNew);
        wrap.appendChild(existingNew);
      } else {
        const newBtn = document.createElement('button');
        newBtn.id = 'btnNew';
        newBtn.textContent = '+ New';
        wrap.appendChild(newBtn);
      }

      const sourceToggle = document.createElement('button');
      sourceToggle.id = 'btnSourceToggle';
      sourceToggle.textContent = 'Source: JSON';
      sourceToggle.title = 'Toggle source between Local JSON and Google Sheet';
      wrap.appendChild(sourceToggle);

      if(right) {
        right.innerHTML = '';
        right.appendChild(wrap);
      }

      sourceToggle.addEventListener('click', async () => {
        if(dataSource === 'json'){
          try { localCache = JSON.parse(JSON.stringify(products || [])); } catch(e){ localCache = localStorage.getItem('cmsProducts') ? JSON.parse(localStorage.getItem('cmsProducts')) : (products ? JSON.parse(JSON.stringify(products)) : []); }
          dataSource = 'sheet';
          sourceToggle.textContent = 'Source: Google Sheet';
          setStatus('Source set to SHEET');
          await loadFromSheet('Sheet1');
        } else {
          dataSource = 'json';
          sourceToggle.textContent = 'Source: JSON';
          if(localCache){
            products = localCache;
            localCache = null;
            updateSequentialIds();
            renderList();
            setStatus('Switched back to JSON (restored in-memory local data)');
          } else {
            const local = localStorage.getItem('cmsProducts');
            if(local){
              try { products = JSON.parse(local); updateSequentialIds(); renderList(); setStatus('Switched to JSON (loaded from localStorage)'); }
              catch(e){ setStatus('Error parsing localStorage JSON', true); }
            } else {
              try {
                const res = await fetch('../products.json');
                if(res.ok){
                  const j = await res.json();
                  products = Array.isArray(j) ? j : [];
                  updateSequentialIds();
                  persist();
                  renderList();
                  setStatus('Switched to JSON (loaded from ../products.json)');
                } else {
                  products = [];
                  updateSequentialIds();
                  renderList();
                  setStatus('No ../products.json found', true);
                }
              } catch(err){
                console.error(err);
                setStatus('Could not load ../products.json', true);
              }
            }
          }
        }
      });
    })();

    // status helper
    function setStatus(t, isError = false, isLoading = false) {
      status.textContent = t;
      status.className = isLoading ? 'status loading' : (isError ? 'status error' : 'status');
    }

    // button loader helper
    function addButtonFeedback(button, callback) {
      if(!button) return;
      button.addEventListener('click', function(e) {
        const originalText = this.textContent;
        const originalHtml = this.innerHTML;
        this.classList.add('loading');
        this.innerHTML = 'Processing...';
        this.disabled = true;
        try {
          const result = callback.call(this, e);
          if (result && typeof result.then === 'function') {
            result.then(() => resetButton(this, originalText, originalHtml)).catch(err => { console.error(err); resetButton(this, originalText, originalHtml); });
          } else {
            setTimeout(() => resetButton(this, originalText, originalHtml), 400);
          }
        } catch (err) {
          console.error(err);
          resetButton(this, originalText, originalHtml);
        }
      });
    }
    function resetButton(button, originalText, originalHtml) {
      button.classList.remove('loading');
      button.textContent = originalText;
      button.innerHTML = originalHtml;
      button.disabled = false;
    }

    // --- IDs: sequential product1, product2, ... ---
    function updateSequentialIds(){
      products.forEach((p, idx) => { p.id = `product${idx + 1}`; });
    }

    // initial load
    async function loadInitial(){
      const local = localStorage.getItem('cmsProducts');
      if(local){
        try { products = JSON.parse(local); updateSequentialIds(); renderList(); setStatus('Loaded from localStorage'); return; } catch(e){}
      }
      try {
        const res = await fetch('../products.json');
        if(!res.ok) throw new Error('no products.json');
        products = await res.json();
        updateSequentialIds();
        localStorage.setItem('cmsProducts', JSON.stringify(products));
        renderList();
        setStatus('Loaded from ../products.json');
      } catch(e) {
        products = [];
        renderList();
        setStatus('No products.json found — start new');
      }
    }

    // render list
    function renderList(){
      LIST.innerHTML = '';
      products.forEach((p, index) => {
        const el = document.createElement('div');
        el.className = 'product-item';
        el.dataset.id = p.id;
        el.dataset.index = index;
        el.draggable = true;

        const t = document.createElement('div'); t.className='thumb';
        const img = document.createElement('img');
        const src = tryImagePath(p.image);
        img.src = src;
        img.onerror = ()=>{ img.src = ''; t.textContent = (p.title && p.title[0]) ? p.title[0] : '?'; };
        t.appendChild(img);

        const meta = document.createElement('div'); meta.className = 'meta';
        meta.innerHTML = `<h3><span class="product-id">ID: ${p.id}</span>${escapeHtml(p.title||'Untitled')}</h3><p class="muted">${Array.isArray(p.categories)?p.categories.join(', '):''}</p>`;

        el.appendChild(t); el.appendChild(meta);
        el.addEventListener('click', ()=> openProduct(p.id));
        if(current && p.id === current) el.classList.add('active');

        el.addEventListener('dragstart', e => {
          el.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(index));
        });
        el.addEventListener('dragend', e => { el.classList.remove('dragging'); });
        el.addEventListener('dragover', e => { e.preventDefault(); });
        el.addEventListener('drop', e => {
          e.preventDefault();
          const fromIndex = Number(e.dataTransfer.getData('text/plain'));
          const toIndex = index;
          if(isNaN(fromIndex) || fromIndex === toIndex) return;
          const item = products.splice(fromIndex,1)[0];
          products.splice(toIndex,0,item);
          updateSequentialIds();
          persist();
          renderList();
          openProduct(item.id);
        });

        LIST.appendChild(el);
      });
    }

    function tryImagePath(filename){ if(!filename) return ''; return `../image/${encodeURIComponent(filename)}`; }
    function tryVideoPath(filename){ if(!filename) return ''; return `../video/${encodeURIComponent(filename)}`; }

    function openProduct(id){
      current = id;
      const p = products.find(x=>x.id === id);
      if(!p) return;
      editorTitle.textContent = `Editing — ${p.title || ''}`;
      inputs.productId.value = p.id || '';
      inputs.title.value = p.title || '';
      inputs.pageUrl.value = p.pageUrl || 'running-shoes.html';
      inputs.price.value = p.price || '';
      inputs.originalPrice.value = p.originalPrice || '';
      inputs.description.value = p.description || '';
      inputs.rating.value = p.rating || '';
      inputs.reviews.value = p.reviews || 0;
      renderChips(categoriesEl, p.categories || [], 'categories');
      renderChips(featuresEl, p.features || [], 'features');
      renderMedia(p.mediaGallery || []);
      renderImages(p.images || []);
      renderMainImage(p.image || null);
      renderVariants(p.variants || []);
      renderList();
      setStatus('Editing product — changes saved to localStorage when applied');
    }

    inputs.productId.readOnly = true;

    function renderChips(container, items, kind){
      container.innerHTML = '';
      (items||[]).forEach((it, idx) => {
        const c = document.createElement('div'); c.className='chip';
        c.innerHTML = `<span>${escapeHtml(it)}</span><button title="remove" data-idx="${idx}" data-kind="${kind}">✕</button>`;
        container.appendChild(c);
      });
    }
    categoriesEl.addEventListener('click', (e)=>{ if(e.target.tagName === 'BUTTON') removeChip('categories', +e.target.dataset.idx); });
    featuresEl.addEventListener('click', (e)=>{ if(e.target.tagName === 'BUTTON') removeChip('features', +e.target.dataset.idx); });
    function removeChip(kind, idx){ if(!current) return; const p = products.find(x=>x.id===current); if(!p) return; p[kind].splice(idx,1); renderChips(kind === 'categories'?categoriesEl:featuresEl, p[kind], kind); persist(); }

    // media / images rendering
    function renderMedia(arr){ mediaContainer.innerHTML = ''; (arr||[]).forEach((m,i)=>{
      const box = document.createElement('div'); box.className='mini-thumb'; box.draggable=true; box.dataset.index=i;
      const removeBtn = document.createElement('button'); removeBtn.className='remove'; removeBtn.textContent='✕'; removeBtn.addEventListener('click',(ev)=>{ ev.stopPropagation(); removeMedia(i); });
      box.appendChild(removeBtn);
      if(m.type === 'video'){ const v = document.createElement('video'); v.src = tryVideoPath(m.src); v.controls=false; v.addEventListener('error', ()=>{ v.src = sessionUploads.media[m.src]||'' }); box.appendChild(v); }
      else { const im = document.createElement('img'); im.src = tryImagePath(m.src); im.onerror = ()=>{ im.src = sessionUploads.media[m.src]||'' }; box.appendChild(im); }
      box.addEventListener('click', ()=> showBigPreview(m, i, 'media'));
      box.addEventListener('dragstart', dragStart); box.addEventListener('dragover', dragOver); box.addEventListener('drop', dropMedia);
      mediaContainer.appendChild(box);
    }); }
    function removeMedia(i){ const p = products.find(x=>x.id===current); if(!p) return; p.mediaGallery.splice(i,1); renderMedia(p.mediaGallery); persist(); }

    function renderImages(arr){ imagesContainer.innerHTML=''; (arr||[]).forEach((src,i)=>{
      const box = document.createElement('div'); box.className='mini-thumb'; box.dataset.index=i;
      const btn = document.createElement('button'); btn.className='remove'; btn.textContent='✕'; btn.addEventListener('click', (ev)=>{ ev.stopPropagation(); removeImage(i); });
      box.appendChild(btn);
      const img = document.createElement('img'); img.src = tryImagePath(src); img.onerror = ()=>{ img.src = sessionUploads.images[src]||'' }; box.appendChild(img);
      box.addEventListener('click', ()=> showBigPreview({type:'image', src}, i, 'images'));
      box.draggable=true; box.addEventListener('dragstart', dragStart); box.addEventListener('dragover', dragOver); box.addEventListener('drop', dropImage);
      imagesContainer.appendChild(box);
    }); }
    function removeImage(i){ const p = products.find(x=>x.id===current); if(!p) return; p.images.splice(i,1); renderImages(p.images); persist(); }

    function renderMainImage(src){ mainImageArea.innerHTML=''; if(!src){ mainImageArea.appendChild(mainDrop); return; }
      const wrap = document.createElement('div'); wrap.className='big-preview';
      const img = document.createElement('img'); img.src = tryImagePath(src); img.onerror = ()=>{ img.src = sessionUploads.main[src]||'' };
      const btn = document.createElement('button'); btn.textContent = 'Change filename'; btn.addEventListener('click', ()=> editFilename('image', src));
      const rem = document.createElement('button'); rem.textContent = 'Remove'; rem.addEventListener('click', ()=> { const p = products.find(x=>x.id===current); if(!p) return; p.image = null; renderMainImage(null); persist(); });
      wrap.appendChild(img); wrap.appendChild(btn); wrap.appendChild(rem);
      mainImageArea.appendChild(wrap);
    }

    function toHex2(val) { if(!val) return '#000000'; val = String(val).trim(); if(!val.startsWith('#')) val = '#'+val; if(val.length === 4) val = '#'+val[1]+val[1]+val[2]+val[2]+val[3]+val[3]; return val.toLowerCase(); }

    function renderVariants(arr){
      variantsEl.innerHTML = '';
      (arr||[]).forEach((v, vi) => {
        const hex = toHex2(v.color || '#000000');
        const box = document.createElement('div'); box.className='variant';
        box.innerHTML = `
          <div style="display:flex; gap:12px; align-items:flex-end; justify-content:space-between; flex-wrap:wrap">
            <div style="flex:1; min-width:140px"><label>Color name</label><input data-vi="${vi}" class="variantColorName" type="text" value="${v.colorName||''}" /></div>
            <div style="flex:1; min-width:140px"><label>Color</label><div style="display:flex; gap:8px; align-items:center"><input type="color" data-vi="${vi}" class="variantColorPicker" value="${hex}" /><input type="text" data-vi="${vi}" class="variantColorHex" value="${hex}" style="flex:1" /></div></div>
          </div>
          <div class="sizes" data-vi="${vi}" style="margin-top:10px"></div>
          <div style="margin-top:10px"><button data-vi="${vi}" class="addSize">Add size</button><button data-vi="${vi}" class="removeVariant">Remove variant</button></div>
        `;
        variantsEl.appendChild(box);
      });

      // events & sync (same as before)
      variantsEl.querySelectorAll('.variantColorPicker').forEach(el=> el.addEventListener('input', e => {
        const vi = e.target.dataset.vi; const hexEl = variantsEl.querySelector(`.variantColorHex[data-vi="${vi}"]`); if(hexEl) hexEl.value = e.target.value;
        const p = products.find(x=>x.id===current); if(!p) return; if(p.variants && p.variants[vi]) p.variants[vi].color = e.target.value; persist();
      }));
      variantsEl.querySelectorAll('.variantColorHex').forEach(el=> el.addEventListener('input', e => {
        const vi = e.target.dataset.vi; let val = e.target.value.trim(); if(!val) val = '#000000'; if(!val.startsWith('#')) val = '#'+val; e.target.value = val;
        const pick = variantsEl.querySelector(`.variantColorPicker[data-vi="${vi}"]`); if(pick) pick.value = val;
        const p = products.find(x=>x.id===current); if(!p) return; if(p.variants && p.variants[vi]) p.variants[vi].color = val; persist();
      }));
      variantsEl.querySelectorAll('.variantColorName').forEach(inp=> inp.addEventListener('input', ev => { const vi = +ev.target.dataset.vi; const p = products.find(x=>x.id===current); if(!p) return; p.variants[vi].colorName = ev.target.value; persist(); }));
      variantsEl.querySelectorAll('.addSize').forEach(btn=> btn.addEventListener('click', ev => { const vi = +ev.target.dataset.vi; const p = products.find(x=>x.id===current); if(!p) return; p.variants[vi].sizes.push({size:'M', stock:0}); renderVariants(p.variants); persist(); }));
      variantsEl.querySelectorAll('.removeVariant').forEach(btn=> btn.addEventListener('click', ev => { const vi = +ev.target.dataset.vi; const p = products.find(x=>x.id===current); if(!p) return; p.variants.splice(vi,1); renderVariants(p.variants); persist(); }));

      // sizes render & events
      variantsEl.querySelectorAll('.sizes').forEach(div => {
        const vi = +div.dataset.vi; const p = products.find(x=>x.id===current); if(!p) return; const v = p.variants[vi]; div.innerHTML = '';
        v.sizes.forEach((s, si) => {
          const siEl = document.createElement('div'); siEl.className='size-item';
          siEl.innerHTML = `<input value="${escapeHtml(s.size)}" data-vi="${vi}" data-si="${si}" class="sizeSize" style="width:50px"/> <input type="number" value="${s.stock}" data-vi="${vi}" data-si="${si}" class="sizeStock" style="width:80px"/> <button data-vi="${vi}" data-si="${si}" class="removeSize">✕</button>`;
          div.appendChild(siEl);
        });
      });
      variantsEl.querySelectorAll('.sizeSize').forEach(inp=> inp.addEventListener('input', ev=>{ const vi=+ev.target.dataset.vi; const si=+ev.target.dataset.si; const p = products.find(x=>x.id===current); if(!p) return; p.variants[vi].sizes[si].size = ev.target.value; persist(); }));
      variantsEl.querySelectorAll('.sizeStock').forEach(inp=> inp.addEventListener('input', ev=>{ const vi=+ev.target.dataset.vi; const si=+ev.target.dataset.si; const p = products.find(x=>x.id===current); if(!p) return; p.variants[vi].sizes[si].stock = Number(ev.target.value); persist(); }));
      variantsEl.querySelectorAll('.removeSize').forEach(btn=> btn.addEventListener('click', ev=>{ const vi=+ev.target.dataset.vi; const si=+ev.target.dataset.si; const p = products.find(x=>x.id===current); if(!p) return; p.variants[vi].sizes.splice(si,1); renderVariants(p.variants); persist(); }));
    }

    function showBigPreview(item, index, kind){
      bigPreview.innerHTML = '';
      let el;
      if(item.type === 'video'){ el = document.createElement('video'); el.controls = true; el.src = tryVideoPath(item.src); el.onerror = ()=>{ el.src = sessionUploads.media[item.src]||'' }; }
      else { el = document.createElement('img'); el.src = tryImagePath(item.src); el.onerror = ()=>{ el.src = sessionUploads.media[item.src]||'' }; }
      const filenameInput = document.createElement('input'); filenameInput.value = item.src; filenameInput.style.width='100%'; filenameInput.style.marginTop='8px';
      const save = document.createElement('button'); save.textContent = 'Save filename'; save.addEventListener('click', ()=> {
        const p = products.find(x=>x.id===current); if(!p) return;
        if(kind === 'media'){ p.mediaGallery[index].src = filenameInput.value; renderMedia(p.mediaGallery); }
        else if(kind === 'images'){ p.images[index] = filenameInput.value; renderImages(p.images); }
        persist(); setStatus('Filename updated');
      });
      bigPreview.appendChild(el); bigPreview.appendChild(filenameInput); bigPreview.appendChild(save);
    }

    function editFilename(kind, src){ const input = prompt('Edit filename (only name, no path)', src||''); if(input === null) return; const p = products.find(x=>x.id===current); if(!p) return; if(kind === 'image'){ p.image = input; renderMainImage(input); } persist(); }

    // ---- FILE PRESENCE CHECK HELPERS ----
    // Use Image/video elements to verify file exists on the server project directory.
    function checkImageExists(filename){
      return new Promise(resolve => {
        if(!filename){ resolve(false); return; }
        const path = tryImagePath(filename) + '?_t=' + Date.now();
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = path;
      });
    }
    function checkVideoExists(filename){
      return new Promise(resolve => {
        if(!filename){ resolve(false); return; }
        const path = tryVideoPath(filename);
        const v = document.createElement('video');
        // small timeout fallback in case neither event fires
        let settled = false;
        const timer = setTimeout(()=>{ if(!settled){ settled=true; resolve(false); } }, 4000);
        v.preload = 'metadata';
        v.onloadedmetadata = () => { if(!settled){ settled=true; clearTimeout(timer); resolve(true); } };
        v.onerror = () => { if(!settled){ settled=true; clearTimeout(timer); resolve(false); } };
        // set src after handlers to avoid race
        v.src = path;
      });
    }

    // Determine server path existence. preferType: 'image'|'video'|null
    async function findExistingServerFile(filename, preferType = null){
      if(!filename) return null;
      // if preferType specified, test it first
      if(preferType === 'image'){
        if(await checkImageExists(filename)) return {type: 'image', filename};
      } else if(preferType === 'video'){
        if(await checkVideoExists(filename)) return {type: 'video', filename};
      }
      // otherwise try both (image then video)
      if(await checkImageExists(filename)) return {type:'image', filename};
      if(await checkVideoExists(filename)) return {type:'video', filename};
      return null;
    }

    // drag & drop wiring - modified to avoid double-opening when the nested "Select" button is clicked
    function wireDrop(dropEl, fileInput, onFiles){
      // Only open the file dialog when the outer drop element itself is clicked,
      // not when an inner button or link is clicked (those have their own handlers).
      dropEl.addEventListener('click', (e)=> {
        // if the click is inside a button or link, do nothing here (child handler will handle)
        if (e.target.closest('button') || e.target.closest('a')) return;
        fileInput.click();
      });
      dropEl.addEventListener('dragenter', e=>{ e.preventDefault(); dropEl.classList.add('dragover'); });
      dropEl.addEventListener('dragover', e=>{ e.preventDefault(); });
      dropEl.addEventListener('dragleave', e=>{ dropEl.classList.remove('dragover'); });
      dropEl.addEventListener('drop', async e=>{ e.preventDefault(); dropEl.classList.remove('dragover'); const dt = e.dataTransfer; if(dt && dt.files) await onFiles(dt.files); });

      // When the native file input changes, call the handler once and clear the input.
      fileInput.addEventListener('change', async ()=>{ 
        if (fileInput.files && fileInput.files.length) {
          await onFiles(fileInput.files);
          // Reset so selecting the same file again will fire `change` next time.
          fileInput.value = '';
        }
      });
    }
    wireDrop(mediaDrop, mediaFile, files=> handleFiles(files, 'media'));
    wireDrop(imagesDrop, imagesFile, files=> handleFiles(files, 'images'));
    wireDrop(mainDrop, mainFile, files=> handleFiles(files, 'main'));

    // Stop propagation on the explicit select buttons so their clicks don't bubble up
    mediaSelect.addEventListener('click', (e)=>{ e.stopPropagation(); mediaFile.click(); });
    imagesSelect.addEventListener('click', (e)=>{ e.stopPropagation(); imagesFile.click(); });
    mainSelect.addEventListener('click', (e)=>{ e.stopPropagation(); mainFile.click(); });

    // Modified handleFiles: check server-side project folder for filename before adding.
    async function handleFiles(files, kind){
      if(!current) return alert('Select or create a product first');
      const p = products.find(x=>x.id===current);
      if(!p) return;

      // convert FileList to array
      const fileArray = Array.from(files || []);
      for(const f of fileArray){
        const filename = f.name;
        const isVideoLocal = f.type && f.type.startsWith('video');
        // For 'main' and 'images' prefer image check; for 'media' use local file type
        let prefer = null;
        if(kind === 'main' || kind === 'images') prefer = 'image';
        else if(kind === 'media') prefer = isVideoLocal ? 'video' : 'image';

        // Check whether server already has that filename
        setStatus(`Checking project files for "${filename}"...`, false, true);
        try {
          const found = await findExistingServerFile(filename, prefer);
          if(found){
            // add filename to product JSON and show server file in preview
            if(kind === 'media'){
              p.mediaGallery = p.mediaGallery || [];
              p.mediaGallery.push({ type: found.type === 'video' ? 'video' : 'image', src: filename });
            } else if(kind === 'images'){
              p.images = p.images || [];
              p.images.push(filename);
            } else if(kind === 'main'){
              // main: set only if image found
              if(found.type === 'image') p.image = filename;
              else {
                setStatus(`❌ "${filename}" exists but is not an image (found as ${found.type}).`, true);
                continue;
              }
            }
            // don't create objectURL previews — use server path
            setStatus(`Added "${filename}" (found in project)`, false);
          } else {
            // file not found on server project folder
            setStatus(`❌ File not found in project: ${filename}. Please copy "${filename}" into ../image or ../video and try again.`, true);
            // do not add the file to product JSON — user must move the file to project directory
          }
        } catch(err) {
          console.error(err);
          setStatus(`❌ Error while checking "${filename}": ${err.message || err}`, true);
        }
      }

      // re-render and persist (only if JSON changed)
      renderMedia(p.mediaGallery || []);
      renderImages(p.images || []);
      renderMainImage(p.image || null);
      // persist local if the UI is currently using JSON source (don't overwrite when we're viewing sheet)
      if(dataSource === 'json') persist();
    }

    // drag reorder handlers for thumbnails
    let dragSrc = null;
    function dragStart(e){ dragSrc = e.currentTarget; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', e.currentTarget.dataset.index); }
    function dragOver(e){ e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
    function dropImage(e){ e.preventDefault(); if(!current) return; const from = +dragSrc.dataset.index; const to = +e.currentTarget.dataset.index; const p = products.find(x=>x.id===current); const arr = p.images; const item = arr.splice(from,1)[0]; arr.splice(to,0,item); renderImages(arr); persist(); }
    function dropMedia(e){ e.preventDefault(); if(!current) return; const from = +dragSrc.dataset.index; const to = +e.currentTarget.dataset.index; const p = products.find(x=>x.id===current); const arr = p.mediaGallery; const item = arr.splice(from,1)[0]; arr.splice(to,0,item); renderMedia(arr); persist(); }

    // CRUD handlers (same as before)
    addButtonFeedback(btnNew, ()=> {
      const p = { title:'New product', pageUrl:'running-shoes.html', categories:[], features:[], image:null, images:[], mediaGallery:[], price:0, originalPrice:0, rating:'', reviews:0, description:'', variants:[] };
      products.push(p);
      updateSequentialIds();
      persist(); renderList(); openProduct(p.id);
    });

    addButtonFeedback(btnDuplicate, ()=> {
      if(!current) return;
      const orig = products.find(x=>x.id === current);
      if(!orig) return;
      const copy = JSON.parse(JSON.stringify(orig));
      const idx = products.findIndex(x => x.id === current);
      products.splice(idx + 1, 0, copy);
      updateSequentialIds();
      persist(); renderList(); openProduct(copy.id);
    });

    addButtonFeedback(btnDelete, ()=> {
      if(!current) return;
      if(!confirm('Delete this product?')) return;
      const idx = products.findIndex(x => x.id === current);
      if(idx === -1) return;
      products.splice(idx,1);
      updateSequentialIds();
      persist(); renderList(); current = null; editorTitle.textContent='Edit product';
    });

    addButtonFeedback(applyChanges, ()=> {
      if(!current) return;
      const p = products.find(x=>x.id === current);
      if(!p) return;
      p.title = inputs.title.value;
      p.pageUrl = inputs.pageUrl.value;
      p.price = Number(inputs.price.value);
      p.originalPrice = Number(inputs.originalPrice.value);
      p.description = inputs.description.value;
      p.rating = inputs.rating.value;
      p.reviews = Number(inputs.reviews.value);
      persist(); renderList(); setStatus('Changes applied to localStorage');
    });

    // Export / Save
    addButtonFeedback(btnExport, ()=> { return new Promise(resolve => { downloadJSON(products, 'products.json'); setStatus('Downloaded products.json'); setTimeout(resolve, 600); }); });
    addButtonFeedback(saveAll, ()=> { return new Promise(resolve => { downloadJSON(products, 'products.json'); setStatus('Downloaded products.json — replace ../products.json in your project to publish changes'); setTimeout(resolve, 600); }); });
    addButtonFeedback(exportProduct, ()=> { if(!current) return; return new Promise(resolve => { const p = products.find(x=>x.id===current); if(!p) return resolve(); downloadJSON(p, `${p.id||'product'}.json`); setStatus('Downloaded product JSON'); setTimeout(resolve, 600); }); });

    addButtonFeedback(btnReset, async ()=> {
      if(!confirm('Load fresh ../products.json and overwrite local changes?')) return;
      try {
        const res = await fetch('../products.json');
        if(!res.ok) throw new Error('no products.json');
        const loaded = await res.json();
        products = Array.isArray(loaded) ? loaded : [];
        updateSequentialIds();
        localStorage.setItem('cmsProducts', JSON.stringify(products));
        renderList(); setStatus('Reset from ../products.json');
      } catch(e) {
        alert('Could not fetch ../products.json');
      }
    });

    addButtonFeedback(btnClearLocal, ()=> { if(!confirm('Clear localStorage and reload?')) return; localStorage.removeItem('cmsProducts'); location.reload(); });

    // import JSON file input
    btnImportFile.addEventListener('change', ()=> {
      const f = btnImportFile.files[0]; if(!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const j = JSON.parse(reader.result);
          const imported = Array.isArray(j) ? j : [j];
          products = imported;
          updateSequentialIds();
          localStorage.setItem('cmsProducts', JSON.stringify(products));
          renderList(); setStatus('Imported JSON into localStorage');
        } catch(e) { alert('Invalid JSON'); }
      };
      reader.readAsText(f);
    });
    addButtonFeedback(document.getElementById('btnImport'), ()=> btnImportFile.click());

    categoryInput.addEventListener('keydown', e=>{ if(e.key === 'Enter') { e.preventDefault(); addChip('categories', categoryInput.value.trim()); categoryInput.value=''; }});
    featureInput.addEventListener('keydown', e=>{ if(e.key === 'Enter') { e.preventDefault(); addChip('features', featureInput.value.trim()); featureInput.value=''; }});
    function addChip(kind, text){ if(!text) return; if(!current) return alert('Select product first'); const p = products.find(x=>x.id===current); if(!p) return; p[kind] = p[kind]||[]; p[kind].push(text); renderChips(kind==='categories'?categoriesEl:featuresEl, p[kind], kind); persist(); }

    addButtonFeedback(document.getElementById('addVariant'), ()=> {
      if(!current) return alert('Select product first');
      const p = products.find(x=>x.id===current); if(!p) return;
      p.variants = p.variants || [];
      p.variants.push({ colorName:'', color:'#000000', sizes:[] });
      renderVariants(p.variants); persist();
    });

    // Send to sheet (POST)
    addButtonFeedback(btnSend, async ()=> {
      if(!products || products.length === 0){ setStatus("❌ No products to send", true); return; }
      setStatus("⏳ Sending products to Google Sheets...", false, true);
      try {
        const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify(products) });
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if(data.status === "success"){ setStatus("✅ Products sent successfully!"); }
        else setStatus("❌ Error from server: " + (data.message || 'unknown'), true);
      } catch(err) {
        console.error(err);
        setStatus("❌ Network/Error sending JSON: " + (err.message || err), true);
        throw err;
      }
    });

    // persist local
    function persist(){ localStorage.setItem('cmsProducts', JSON.stringify(products)); setStatus('Saved to localStorage'); }

    function downloadJSON(obj, filename){
      const data = JSON.stringify(obj, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }

    function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&"'<>]/g, c=> ({'&':'&amp;','"':'&quot;','\'':'&#39;','<':'&lt;','>':'&gt;'}[c])); }

    // --- Load from Sheet ---
    async function loadFromSheet(sheetName = 'Sheet1'){
      setStatus('⏳ Fetching data from Google Sheet...', false, true);
      try{
        const url = `${SCRIPT_URL}?action=read&path=${encodeURIComponent(sheetName)}`;
        const res = await fetch(url);
        if(!res.ok) throw new Error('Network error: ' + res.status);
        const json = await res.json();
        if(json.status && json.status === 'success' && Array.isArray(json.data)){
          products = json.data.map(p => ({
            id: p.id || '', title: p.title || '', pageUrl: p.pageUrl || '', price: p.price || 0, originalPrice: p.originalPrice || 0,
            description: p.description || '', categories: p.categories || [], features: p.features || [], image: p.image || null, images: p.images || [],
            rating: p.rating || '', reviews: p.reviews || 0, mediaGallery: p.mediaGallery || [], variants: p.variants || []
          }));
          // IMPORTANT: do NOT persist sheet data to localStorage here.
          updateSequentialIds();
          renderList();
          setStatus(`✅ Loaded ${products.length} products from Sheet`);
        } else if(json.error){
          setStatus('❌ Sheet error: ' + json.error, true);
        } else {
          setStatus('❌ Unexpected sheet response', true);
        }
      } catch (err) {
        console.error(err);
        setStatus('❌ Error loading from sheet: ' + (err.message || err), true);
      }
    }

    // --- Delete sheet data (client request) ---
    async function deleteSheetData(sheetName = 'Sheet1'){
      if(!confirm('This will request the server to delete JSON products in the sheet. Proceed?')) return;
      setStatus('⏳ Sending delete request to server...', false, true);
      try {
        const url = `${SCRIPT_URL}?action=delete&path=${encodeURIComponent(sheetName)}`;
        const res = await fetch(url);
        if(!res.ok) throw new Error('Network error: ' + res.status);
        const json = await res.json();
        if(json.status === 'success'){
          setStatus('✅ Delete request succeeded: ' + (json.message || 'OK'));
        } else {
          setStatus('❌ Delete request failed: ' + (json.message || JSON.stringify(json)), true);
        }
      } catch(err) {
        console.error(err);
        setStatus('❌ Error during delete request: ' + (err.message || err), true);
      }
    }

    // Wire toolbar buttons for sheet/load/delete
    addButtonFeedback(btnLoadSheet, () => loadFromSheet('Sheet1'));
    addButtonFeedback(btnDeleteSheet, () => deleteSheetData('Sheet1'));

    // initial load
    loadInitial();

    // end IIFE
  })();

