document.addEventListener('DOMContentLoaded', function () {
  // Get product ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('id');

  CartUtils.updateCartCount();

  if (!productId) {
    window.location.href = 'index.html';
    return;
  }

  fetch('products.json')
    .then(response => response.json())
    .then(products => {
      const product = products.find(p => p.id === productId);

      if (!product) {
        document.getElementById('productPageContainer').innerHTML = `
          <div class="product-not-found">
            <h2>Product Not Found</h2>
            <p>The product you're looking for doesn't exist.</p>
            <a href="index.html" class="back-to-home">Back to Home</a>
          </div>
        `;
        return;
      }

      renderProductPage(product, products);
    })
    .catch(error => {
      console.error('Error loading product:', error);
      document.getElementById('productPageContainer').innerHTML = `
        <div class="error-loading">
          <h2>Error Loading Product</h2>
          <p>There was an error loading the product details. Please try again later.</p>
          <a href="index.html" class="back-to-home">Back to Home</a>
        </div>
      `;
    });

  function renderProductPage(product, allProducts) {
    // Calculate total stock
    const totalStock = product.variants.reduce((sum, variant) => {
      return sum + (Array.isArray(variant.sizes)
        ? variant.sizes.reduce((s, sz) => s + (Number(sz?.stock) || 0), 0)
        : 0);
    }, 0);

    // Show size section only if any variant has real sizes
    const hasSizeSection = Array.isArray(product.variants) &&
      product.variants.some(v =>
        Array.isArray(v.sizes) &&
        v.sizes.some(sz => sz && sz.size != null && String(sz.size).trim() !== '')
      );

    // Color options
    const colorOptions = product.variants.map(variant => `
      <div class="variant-option" data-color="${variant.colorName}">
        <div class="color-swatch" style="background-color: ${variant.color}"></div>
        <span class="color-name">${variant.colorName}</span>
      </div>
    `).join('');

    // Features list
    const featuresList = product.features ? `
      <div class="product-features">
        <h3>Key Features</h3>
        <ul>
          ${product.features.map(f => `<li>${f}</li>`).join('')}
        </ul>
      </div>
    ` : '';

    // Product images
    const productImages = product.images || [product.image];

    // Gallery HTML
    const galleryHTML = `
      <div class="product-gallery">
        <div class="main-image-container">
          <img src="image/${productImages[0]}" alt="${product.title}" class="main-image" loading="lazy">
          ${totalStock <= 0 ? '<div class="out-of-stock-badge">OUT OF STOCK</div>' : ''}
          ${productImages.length > 1 ? `
            <button class="gallery-nav prev-btn" aria-label="Previous image">❮</button>
            <button class="gallery-nav next-btn" aria-label="Next image">❯</button>
          ` : ''}
        </div>
        ${productImages.length > 1 ? `
          <div class="thumbnail-container">
            ${productImages.map((img, index) => `
              <img src="image/${img}" alt="${product.title} - ${index + 1}" 
                   class="thumbnail ${index === 0 ? 'active' : ''}" 
                   data-index="${index}" loading="lazy">
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;

    // Media gallery
    const mediaGallery = product.mediaGallery && product.mediaGallery.length > 0 ? `
      <div class="media-gallery">
        <h3>More Photos & Videos</h3>
        <div class="media-thumbnails">
          ${product.mediaGallery.map((item, i) => `
            <div class="media-thumb" data-index="${i}" data-type="${item.type}" data-src="${item.src}">
              ${item.type === 'image' 
                ? `<img src="image/${item.src}" alt="Media ${i+1}">`
                : `<video src="video/${item.src}" muted></video>`}
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';

    // Full HTML (added Buy Now button next to Add to Cart)
    const productHTML = `
      <div class="product-details">
        ${galleryHTML}
        <div class="product-info">
          <h1 class="product-title">${product.title}</h1>
          <div class="product-rating">
            ${product.rating} <span class="review-count">(${product.reviews} reviews)</span>
          </div>
          <div class="price-container">
            <span class="current-price">৳${product.price.toFixed(2)}</span>
            <span class="original-price">৳${product.originalPrice.toFixed(2)}</span>
            <span class="discount-percentage">${((product.originalPrice - product.price) / product.originalPrice * 100).toFixed(0)}% OFF</span>
          </div>
          ${product.variants && product.variants.length > 0 ? `
            <div class="color-selection" style="${product.variants.length === 1 ? 'display:none;' : ''}">
              <h3>Color:</h3>
              <div class="color-options">${colorOptions}</div>
            </div>
          ` : ''}
          ${hasSizeSection ? `
            <div class="size-selection">
              <h3>Size:</h3>
              <div class="size-options">Select a color first</div>
            </div>
          ` : ''}
          <div class="stock-status"></div>
          <div class="product-actions">
            <div class="quantity-selector">
              <button class="quantity-btn minus">-</button>
              <input type="number" value="1" min="1" max="1" class="quantity-input" disabled>
              <button class="quantity-btn plus">+</button>
            </div>
            <button class="add-to-cart-btn" disabled>
              ${hasSizeSection ? 'Select color & size' : 'Select color'}
            </button>
            <button class="buy-now-btn" disabled>Buy Now</button>
          </div>
          <div class="product-description">
            <h3>Description</h3>
            <p>${product.description}</p>
          </div>
          ${featuresList}
          ${mediaGallery}
        </div>
      </div>

      <div class="product-recommendations">
        <h2>You May Also Like</h2>
        <div class="recommendations-container" id="recommendationsContainer"></div>
      </div>
    `;

    document.getElementById('productPageContainer').innerHTML = productHTML;

    // Initialize galleries
    if (productImages.length > 1) initImageGallery(productImages);
    if (product.mediaGallery && product.mediaGallery.length > 0) initMediaGallery(product.mediaGallery);

    loadRecommendations(product.id, allProducts);

    // --- VARIANT & CART LOGIC ---
    let selectedVariant = null;
    const quantityInput = document.querySelector('.quantity-input');
    const addToCartBtn = document.querySelector('.add-to-cart-btn');
    const buyNowBtn = document.querySelector('.buy-now-btn'); // new buy now button
    const stockStatus = document.querySelector('.stock-status');
    const sizeSectionEl = document.querySelector('.size-selection');
    const sizeContainer = sizeSectionEl ? sizeSectionEl.querySelector('.size-options') : null;
    const colorOptionsEls = document.querySelectorAll('.variant-option');

    function selectColor(colorName) {
      colorOptionsEls.forEach(opt => opt.dataset.color === colorName ? opt.classList.add('active') : opt.classList.remove('active'));
      const variant = product.variants.find(v => v.colorName === colorName);
      if (!variant) return;

      const variantHasRealSizes = Array.isArray(variant.sizes) &&
        variant.sizes.some(sz => sz && sz.size != null && String(sz.size).trim() !== '');

      if (variantHasRealSizes && sizeContainer) {
        const visibleSizes = variant.sizes.filter(sz => sz && sz.size != null && String(sz.size).trim() !== '');
        sizeContainer.innerHTML = visibleSizes.map(s => `
          <div class="size-option ${s.stock <= 0 ? 'out-of-stock' : ''}" 
               data-size="${String(s.size).trim()}" data-stock="${s.stock}" data-color="${colorName}">
            ${String(s.size).trim()} ${s.stock <= 0 ? '(Out)' : ''}
          </div>
        `).join('');

        document.querySelectorAll('.size-option').forEach(sizeEl => {
          sizeEl.addEventListener('click', function() {
            if (this.classList.contains('out-of-stock')) return;
            document.querySelectorAll('.size-option').forEach(s => s.classList.remove('active'));
            this.classList.add('active');
            selectedVariant = {
              colorName: this.dataset.color,
              size: this.dataset.size,
              stock: parseInt(this.dataset.stock, 10)
            };
            updateVariantSelection();
          });
        });

        if (visibleSizes.length === 1) {
          const singleSizeEl = sizeContainer.querySelector('.size-option');
          if (singleSizeEl && !singleSizeEl.classList.contains('out-of-stock')) singleSizeEl.click();
        }
      } else {
        if (sizeSectionEl) sizeSectionEl.remove();
        const totalStockForVariant = Array.isArray(variant.sizes)
          ? variant.sizes.reduce((sum, sz) => sum + (Number(sz?.stock) || 0), 0)
          : 0;
        selectedVariant = { colorName, size: null, stock: totalStockForVariant };
        updateVariantSelection();
      }
    }

    colorOptionsEls.forEach(option => option.addEventListener('click', () => selectColor(option.dataset.color)));
    if (product.variants.length === 1) selectColor(product.variants[0].colorName);

    function updateVariantSelection() {
      if (!selectedVariant) return;
      stockStatus.innerHTML = '';
      quantityInput.disabled = false;
      quantityInput.max = selectedVariant.stock;
      quantityInput.value = 1;
      if (addToCartBtn) {
        addToCartBtn.disabled = false;
        addToCartBtn.textContent = 'Add to Cart';
      }
      if (buyNowBtn) {
        buyNowBtn.disabled = false;
      }
    }

    // Quantity controls
    document.querySelector('.quantity-btn.minus').addEventListener('click', () => {
      if (quantityInput.disabled) return;
      quantityInput.value = Math.max(1, parseInt(quantityInput.value) - 1);
    });

    document.querySelector('.quantity-btn.plus').addEventListener('click', () => {
      if (quantityInput.disabled) return;
      const max = parseInt(quantityInput.max);
      if (parseInt(quantityInput.value) < max) quantityInput.value = parseInt(quantityInput.value) + 1;
      else alert(`You cannot add more of this item. Stock limit reached.`);
    });

    quantityInput.addEventListener('change', function () {
      if (parseInt(this.value) > parseInt(this.max)) {
        this.value = this.max;
        alert(`Only ${this.max} available in stock!`);
      }
      if (parseInt(this.value) < 1) this.value = 1;
    });

    // Add to cart handler (existing behavior)
    if (addToCartBtn) {
      addToCartBtn.addEventListener('click', function () {
        if (!selectedVariant || this.disabled) return;

        const quantity = parseInt(quantityInput.value, 10);
        if (quantity > selectedVariant.stock) {
          let detailMsg = selectedVariant.colorName || '';
          if (selectedVariant.size) detailMsg += detailMsg ? `, Size ${selectedVariant.size}` : `Size ${selectedVariant.size}`;
          alert(`Sorry, you cannot add more of this product${detailMsg ? ` in ${detailMsg}` : ''}.`);
          return;
        }

        // --- use shared cart helpers ---
        const cart = CartUtils.getCart();

        // same product + color + size = same line item
        const existing = cart.find(
          (it) =>
            it.id === product.id &&
            it.color === selectedVariant.colorName &&
            it.size === selectedVariant.size
        );

        if (existing) {
          existing.quantity = Math.min(existing.quantity + quantity, selectedVariant.stock);
        } else {
          cart.push({
            id: product.id,
            title: product.title,
            color: selectedVariant.colorName,
            size: selectedVariant.size,
            quantity,
            price: product.price,
            stock: selectedVariant.stock,
            image: product.image
          });
        }

        CartUtils.saveCart(cart);
        CartUtils.updateCartCount();

        // --- Toast Feedback ---
        const details = [
          selectedVariant.colorName,
          selectedVariant.size ? `Size ${selectedVariant.size}` : null
        ].filter(Boolean).join(', ');

        showToast(`${quantity} ${product.title}${details ? ` (${details})` : ''} added to cart!`);

        // --- Prevent double clicks for 1 second ---
        this.disabled = true;
        setTimeout(() => {
          this.disabled = false;
        }, 1000);
      });
    }

    // Buy Now handler (adds the same item to cart then redirects to cart.html)
    if (buyNowBtn) {
      buyNowBtn.addEventListener('click', function () {
        if (!selectedVariant || this.disabled) return;

        const quantity = parseInt(quantityInput.value, 10);
        if (quantity > selectedVariant.stock) {
          let detailMsg = selectedVariant.colorName || '';
          if (selectedVariant.size) detailMsg += detailMsg ? `, Size ${selectedVariant.size}` : `Size ${selectedVariant.size}`;
          alert(`Sorry, you cannot buy more of this product${detailMsg ? ` in ${detailMsg}` : ''}.`);
          return;
        }

        // --- add to cart using shared helpers ---
        const cart = CartUtils.getCart();

        const existing = cart.find(
          (it) =>
            it.id === product.id &&
            it.color === selectedVariant.colorName &&
            it.size === selectedVariant.size
        );

        if (existing) {
          existing.quantity = Math.min(existing.quantity + quantity, selectedVariant.stock);
        } else {
          cart.push({
            id: product.id,
            title: product.title,
            color: selectedVariant.colorName,
            size: selectedVariant.size,
            quantity,
            price: product.price,
            stock: selectedVariant.stock,
            image: product.image
          });
        }

        CartUtils.saveCart(cart);
        CartUtils.updateCartCount();

        const details = [
          selectedVariant.colorName,
          selectedVariant.size ? `Size ${selectedVariant.size}` : null
        ].filter(Boolean).join(', ');

        showToast(`${quantity} ${product.title}${details ? ` (${details})` : ''} added to cart!`);

        // prevent double clicks briefly
        this.disabled = true;
        setTimeout(() => {
          this.disabled = false;
        }, 1000);

        // redirect to cart page
        window.location.href = 'cart.html';
      });
    }

    // --- GALLERY FUNCTIONS ---
    function initImageGallery(images) {
      const mainImage = document.querySelector('.main-image');
      const thumbnails = document.querySelectorAll('.thumbnail');
      const prevBtn = document.querySelector('.prev-btn');
      const nextBtn = document.querySelector('.next-btn');
      let currentIndex = 0;

      function updateMainImage(index) {
        mainImage.src = `image/${images[index]}`;
        thumbnails.forEach(thumb => thumb.classList.remove('active'));
        thumbnails[index].classList.add('active');
        currentIndex = index;
      }

      thumbnails.forEach(thumb => thumb.addEventListener('click', () => updateMainImage(parseInt(thumb.dataset.index))));
      prevBtn.addEventListener('click', () => updateMainImage((currentIndex - 1 + images.length) % images.length));
      nextBtn.addEventListener('click', () => updateMainImage((currentIndex + 1) % images.length));
      document.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') prevBtn.click(); else if (e.key === 'ArrowRight') nextBtn.click(); });
    }

    function initMediaGallery(mediaItems) {
      const thumbs = document.querySelectorAll('.media-thumb');
      let currentIndex = 0;

      const modal = document.createElement('div');
      modal.classList.add('media-modal');
      modal.innerHTML = `<div class="media-content"></div><button class="close-btn">✖</button><button class="prev-btn">❮</button><button class="next-btn">❯</button>`;
      document.body.appendChild(modal);

      const content = modal.querySelector('.media-content');
      const closeBtn = modal.querySelector('.close-btn');
      const prevBtn = modal.querySelector('.prev-btn');
      const nextBtn = modal.querySelector('.next-btn');

      function showMedia(index) {
        const item = mediaItems[index];
        currentIndex = index;
        content.innerHTML = item.type === 'image'
          ? `<img src="image/${item.src}" alt="media ${index + 1}">`
          : `<video src="video/${item.src}" controls autoplay></video>`;
      }

      thumbs.forEach(thumb => {
        thumb.addEventListener('click', () => {
          currentIndex = parseInt(thumb.dataset.index);
          showMedia(currentIndex);
          modal.classList.add('active');
        });
      });

      closeBtn.addEventListener('click', () => modal.classList.remove('active'));
      prevBtn.addEventListener('click', () => showMedia((currentIndex - 1 + mediaItems.length) % mediaItems.length));
      nextBtn.addEventListener('click', () => showMedia((currentIndex + 1) % mediaItems.length));
    }

    // --- RECOMMENDATIONS ---
    function loadRecommendations(currentProductId, allProducts) {
      const filteredProducts = allProducts.filter(p => p.id !== currentProductId);
      const shuffled = [...filteredProducts].sort(() => 0.5 - Math.random());
      const recommendedProducts = shuffled.slice(0, 4);
      renderRecommendations(recommendedProducts);
    }

    function renderRecommendations(products) {
      const container = document.getElementById('recommendationsContainer');
      if (products.length === 0) {
        container.innerHTML = '<p>No recommendations available at this time.</p>';
        return;
      }

      container.innerHTML = products.map(product => {
        const totalStock = product.variants.reduce((sum, variant) => {
          return sum + (Array.isArray(variant.sizes)
            ? variant.sizes.reduce((s, sz) => s + (Number(sz?.stock) || 0), 0)
            : 0);
        }, 0);

        const discountPercentage = ((product.originalPrice - product.price) / product.originalPrice * 100).toFixed(0);
        const colorOptions = product.variants.map(v => `<div class="color-option" style="background-color: ${v.color}"></div>`).join('');

        return `
          <div class="product-card" data-stock="${totalStock}">
            <a href="product-page.html?id=${product.id}" class="product-link">
              ${discountPercentage > 0 ? `<div class="discount-badge">${discountPercentage}% OFF</div>` : ''}
              ${totalStock <= 0 ? '<div class="out-of-stock-badge">OUT OF STOCK</div>' : ''}
              <img src="image/${product.image}" alt="${product.title}" class="product-img" loading="lazy">
              <div class="product-info">
                <div class="product-title">${product.title}</div>
                <div class="product-review">${product.rating} <span class="review-count">(${product.reviews} reviews)</span></div>
                <div class="color-availability">${colorOptions}</div>
                <div class="product-price">
                  <span class="original-price">৳${product.originalPrice.toFixed(2)}</span>
                  <span class="current-price">৳${product.price.toFixed(2)}</span>
                </div>
              </div>
            </a>
          </div>
        `;
      }).join('');
    }

  }

  // --- Toast Notification ---
  function showToast(message) {
    // Remove any existing toast first
    const existingToast = document.getElementById('toast');
    if (existingToast) {
      existingToast.remove();
    }

    // Create a new toast element
    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast show';
    toast.textContent = message;
    document.body.appendChild(toast);

    // Auto-close in 1 second
    const autoClose = setTimeout(() => {
      toast.classList.remove('show');
      toast.remove();
    }, 1000);

    // Close immediately if user clicks anywhere
    function hideToast() {
      clearTimeout(autoClose);
      toast.classList.remove('show');
      toast.remove();
      document.removeEventListener('click', hideToast);
    }

    setTimeout(() => {
      document.addEventListener('click', hideToast, { once: true });
    }, 50);
  }

});
