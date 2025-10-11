// JS/search.js
(function () {
  if (window.__productSearchInitialized) return;
  window.__productSearchInitialized = true;

  document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('productsContainer');
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');

    if (!container) {
      console.error('search.js: #productsContainer not found.');
      return;
    }

    // Map<Element, Entry>
    const indexed = new Map();
    // small helper set to avoid repeated re-highlighting while typing fast
    let lastQuery = null;

    // Normalizers & helpers
    function normalizeText(s = '') {
      return String(s).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\w\s-]/g, '').trim();
    }
    function escapeHtml(s = '') {
      return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    // Index a single card element (idempotent)
    function indexCard(card) {
      if (!card || !(card instanceof Element)) return null;
      if (indexed.has(card)) return indexed.get(card);

      // try to find title text from standard selectors or dataset
      const titleEl = card.querySelector('.product-title') || card.querySelector('h3') || null;
      const titleText = titleEl ? titleEl.textContent.trim() : (card.dataset && card.dataset.title ? card.dataset.title : card.textContent.trim());
      const normalizedTitle = normalizeText(titleText);
      const tokens = normalizedTitle.split(/\s+/).filter(Boolean);

      const entry = { cardEl: card, origTitle: titleText, normalizedTitle, tokens };
      indexed.set(card, entry);
      return entry;
    }

    // Index all existing product cards
    function indexExistingCards() {
      const nodes = Array.from(container.querySelectorAll('.product-card'));
      nodes.forEach(n => indexCard(n));
      console.log(`search.js: indexed ${indexed.size} existing product card(s).`);
    }

    // MutationObserver to catch newly added product cards
    const observer = new MutationObserver(mutations => {
      let newCount = 0;
      for (const m of mutations) {
        if (m.type === 'childList' && m.addedNodes && m.addedNodes.length) {
          m.addedNodes.forEach(node => {
            if (!(node instanceof Element)) return;
            // if root node added is a .product-card
            if (node.matches && node.matches('.product-card')) {
              indexCard(node);
              newCount++;
            } else {
              // or it may contain .product-card children
              const children = Array.from(node.querySelectorAll ? node.querySelectorAll('.product-card') : []);
              children.forEach(c => { indexCard(c); newCount++; });
            }
          });
        }
      }
      if (newCount > 0) {
        console.log(`search.js: indexed ${newCount} new product card(s). Total indexed: ${indexed.size}`);
        // if there is an active query, re-run filter to apply to new items immediately
        if (lastQuery !== null && lastQuery !== '') runFilter(lastQuery);
      }
    });
    observer.observe(container, { childList: true, subtree: true });

    // Wait helper: resolves when at least 1 product-card is seen or after timeout.
    function waitForCards(timeoutMs = 3000, checkInterval = 100) {
      return new Promise((resolve) => {
        indexExistingCards();
        if (indexed.size > 0) return resolve(true);
        const start = Date.now();
        const iv = setInterval(() => {
          indexExistingCards();
          if (indexed.size > 0) {
            clearInterval(iv);
            return resolve(true);
          }
          if (Date.now() - start > timeoutMs) {
            clearInterval(iv);
            return resolve(false);
          }
        }, checkInterval);
      });
    }

    // Matching logic (tokenized + substring)
    function matches(entry, rawQuery) {
      const q = normalizeText(rawQuery || '');
      if (!q) return true;
      if (entry.normalizedTitle.includes(q)) return true;
      const qTokens = q.split(/\s+/).filter(Boolean);
      return qTokens.every(t => entry.normalizedTitle.includes(t));
    }

    // Highlight matching parts (best-effort)
    function highlightTitle(origTitle, rawQuery) {
      const q = normalizeText(rawQuery || '');
      if (!q) return escapeHtml(origTitle);
      const qTokens = Array.from(new Set(q.split(/\s+/).filter(Boolean)));
      const parts = origTitle.split(/\b/);
      return parts.map(part => {
        const np = normalizeText(part);
        for (const tok of qTokens) {
          if (tok && np.includes(tok)) return `<span class="highlight">${escapeHtml(part)}</span>`;
        }
        return escapeHtml(part);
      }).join('');
    }

    // Apply filter to all indexed cards
    function runFilter(rawQuery) {
      lastQuery = rawQuery;
      let visible = 0;
      indexed.forEach(entry => {
        const ok = matches(entry, rawQuery);
        entry.cardEl.style.display = ok ? '' : 'none';
        const titleEl = entry.cardEl.querySelector('.product-title');
        if (titleEl) {
          titleEl.innerHTML = ok ? highlightTitle(entry.origTitle, rawQuery) : escapeHtml(entry.origTitle);
        }
        if (ok) visible++;
      });
      console.log(`search.js: query="${rawQuery}" -> ${visible}/${indexed.size} visible`);
    }

    // Public helpers
    window.__productSearch = {
      reindexAll: () => { indexed.clear(); indexExistingCards(); console.log('search.js: reindexed'); },
      showAll: () => { indexed.forEach(e => e.cardEl.style.display = ''); lastQuery = ''; },
      getCount: () => indexed.size
    };

    // Hook up UI after waiting a short time for renderer to populate:
    waitForCards(4000, 100).then(found => {
      if (!found) console.warn('search.js: No product cards found within timeout — the observer will still watch for additions.');
      // ensure we at least have initial index
      indexExistingCards();

      // attach UI events
      if (searchInput) {
        searchInput.addEventListener('input', () => runFilter(searchInput.value));
        searchInput.addEventListener('keypress', e => { if (e.key === 'Enter') runFilter(searchInput.value); });
      }
      if (searchButton) {
        searchButton.addEventListener('click', () => runFilter(searchInput ? searchInput.value : ''));
      }
      // initial show
      runFilter('');
    });

    // Optional: if the renderer wants to explicitly tell us it's done, it can dispatch this event:
    // document.addEventListener('productsRendered', () => { indexed.clear(); indexExistingCards(); runFilter(lastQuery||''); });
    // (You can add `document.dispatchEvent(new Event('productsRendered'))` at the end of your product card renderer.)
  });
})();














// // search.js - Product search functionality
// document.addEventListener('DOMContentLoaded', function() {
//   const searchInput = document.getElementById('searchInput');
//   const searchButton = document.getElementById('searchButton');
  
//   function performSearch() {
//     const searchTerm = searchInput.value.toLowerCase();
//     const productCards = document.querySelectorAll('.product-card');
    
//     productCards.forEach(card => {
//       const title = card.querySelector('.product-title').textContent.toLowerCase();
//       card.style.display = title.includes(searchTerm) ? 'block' : 'none';
//     });
//   }
  
//   // Search on button click
//   searchButton.addEventListener('click', performSearch);
//   searchInput.addEventListener('keypress', function(e) {
//     if (e.key === 'Enter') {
//       performSearch();
//     }
//   });
// });








