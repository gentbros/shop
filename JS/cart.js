document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('cartContainer');
  const totalEl = document.getElementById('cartTotal');
  const subtotalEl = document.getElementById('subtotal');
  const shippingEl = document.getElementById('shipping');
  const outsideCheckbox = document.getElementById('outsideDelivery');
  const outsideLabel = document.getElementById('outsideLabel');
  const insideLabel = document.getElementById('insideLabel');
  const checkoutButton = document.getElementById('checkoutButton'); // Added

  /**
   * Load delivery configuration
   */
  async function loadDeliveryData() {
    try {
      const res = await fetch("delivery.json");
      return await res.json();
    } catch (err) {
      console.error("Failed to load delivery.json:", err);
      return {
        baseFee: 10,
        options: {
          inside: { extra: 0, waitDays: 2 },
          outside: { extra: 5, waitDays: 5 }
        }
      };
    }
  }

  /**
   * Load rules from cart-rules.json
   */
  async function loadCartRules() {
    try {
      const res = await fetch("cart-rules.json");
      return await res.json();
    } catch (err) {
      console.warn("cart-rules.json not found or invalid:", err);
      return {
        freeDeliveryThreshold: 9999, // disables free delivery fallback
        productRules: {}
      };
    }
  }

    /**
   * Save checkout/delivery data for backend (simulation)
   */
  function saveCheckoutData(cart, deliveryFee, total, deliveryType) {
    // Get existing checkout data first
    const existingData = CartUtils.getCheckoutData() || {};
    
    // Only update delivery-related fields, preserve customer info
    const data = {
      ...existingData, // Preserve existing customer data
      cart,
      deliveryFee: deliveryFee === 0 ? "000" : deliveryFee.toFixed(2),
      total: total.toFixed(2),
      deliveryType: deliveryType, // "Free" or "Payment"
      timestamp: new Date().toISOString()
    };
    CartUtils.saveCheckoutData(data);
  }

  /**
   * Check if free delivery should be applied based on rules
   * - global threshold (highest priority)
   * - any product that explicitly has freeDelivery (product-level no-delivery)
   * - product quantity triggers (minQuantityForFree)
   */
  function shouldApplyFreeDelivery(cart, rules) {
    const totalItems = cart.reduce((sum, item) => sum + (item.quantity || 0), 0);

    // Rule 1: Global Free Delivery Threshold (highest priority)
    if (Number.isFinite(rules.freeDeliveryThreshold) && totalItems >= rules.freeDeliveryThreshold) {
      return { free: true, reason: 'global' };
    }

    // Rule X: Product-level free delivery (any product that has no delivery charge)
    for (const item of cart) {
      const rule = (rules.productRules && rules.productRules[item.id]) || {};
      // Accept multiple signals:
      // - rule.freeDelivery === true (from cart-rules.json)
      // - item.noDeliveryCharge === true (explicit product field)
      // - item.deliveryFee === 0 / "0" / "000" (some products might carry this)
      const itemDeliveryFee = item.hasOwnProperty('deliveryFee') ? item.deliveryFee : undefined;
      const noDeliveryFlag = rule.freeDelivery === true ||
                             item.noDeliveryCharge === true ||
                             itemDeliveryFee === 0 ||
                             itemDeliveryFee === "0" ||
                             itemDeliveryFee === "000";

      if (noDeliveryFlag) {
        return { free: true, reason: 'product-no-delivery', productId: item.id };
      }
    }

    // Rule 2: Product Quantity Triggered Free Delivery (second priority)
    const quantityTriggeredProduct = cart.find(item => {
      const rule = rules.productRules[item.id];
      return rule && Number.isFinite(rule.minQuantityForFree) && item.quantity >= rule.minQuantityForFree;
    });

    if (quantityTriggeredProduct) {
      return { free: true, reason: 'quantity', productId: quantityTriggeredProduct.id };
    }

    // Rule 3 (existing): Single-product freeDelivery when only one product and its rule has freeDelivery true
    if (cart.length === 1) {
      const singleItem = cart[0];
      const rule = rules.productRules[singleItem.id];
      if (rule && rule.freeDelivery) {
        return { free: true, reason: 'single-product', productId: singleItem.id };
      }
    }

    return { free: false, reason: null };
  }

  /**
   * Update checkout button state based on cart contents
   */
  function updateCheckoutButton(cart) {
    if (!checkoutButton) return;
    
    if (cart.length === 0) {
      // Disable the button when cart is empty
      checkoutButton.disabled = true;
      checkoutButton.style.opacity = '0.6';
      checkoutButton.style.cursor = 'not-allowed';
      checkoutButton.onclick = null; // Remove any click handler
    } else {
      // Enable the button when cart has items
      checkoutButton.disabled = false;
      checkoutButton.style.opacity = '1';
      checkoutButton.style.cursor = 'pointer';
      checkoutButton.onclick = () => window.location.href = 'checkout.html';
    }
  }

  /**
   * Main render function
   */
  async function renderCart() {
    const cart = CartUtils.getCart();
    container.innerHTML = '';

    // Update checkout button state
    updateCheckoutButton(cart);

    if (cart.length === 0) {
      container.innerHTML = '<p>Your cart is empty.</p>';
      subtotalEl.textContent = '৳0.00';
      shippingEl.textContent = '৳0.00';
      totalEl.textContent = '৳0.00';
      CartUtils.updateCartCount();
      return;
    }

    // Load delivery + rules
    const deliveryData = await loadDeliveryData();
    const rules = await loadCartRules();
    const deliveryChoice = CartUtils.getDeliveryChoice() || "inside";

    let total = 0;
    let totalItems = 0;
    let hidePriceProducts = [];

    // Render each product
    cart.forEach((item, index) => {
      totalItems += item.quantity;

      const rule = rules.productRules[item.id] || {};
      const showPrice = !rule.hidePrice;
      const priceDisplay = showPrice ? `৳${item.price.toFixed(2)} each` : 'Price hidden';
      const subtotal = showPrice ? item.price * item.quantity : 0;

      if (rule.hidePrice) hidePriceProducts.push(item.id);
      total += subtotal;

      const itemEl = document.createElement('div');
      itemEl.classList.add('cart-item-wrapper');
      itemEl.innerHTML = `
        <div class="flex flex-col sm:flex-row items-center bg-white rounded-2xl shadow-sm p-6 hover:shadow-md transition">
          <img src="image/${item.image}" alt="${item.title}" class="w-28 h-28 rounded-xl object-cover">
          <div class="sm:ml-6 mt-4 sm:mt-0 flex-1 w-full">
            <h2 class="text-lg font-semibold text-gray-800">${item.title}</h2>
            <p class="text-sm text-gray-500">${item.color || ''} ${item.size || ''}</p>

            <div class="mt-4 flex items-center justify-between w-full">
              <span class="text-gray-900 font-medium">${priceDisplay}</span>
              <div class="flex items-center space-x-2">
                <div class="flex items-center space-x-2 sm:hidden">
                  <button class="px-3 py-1 bg-gray-200 rounded-lg text-lg font-bold minus">-</button>
                  <input type="number" value="${item.quantity}" min="1" max="${item.stock}" class="w-14 border rounded-lg p-2 text-center qty-input" readonly>
                  <button class="px-3 py-1 bg-gray-200 rounded-lg text-lg font-bold plus">+</button>
                </div>
                <div class="hidden sm:flex items-center">
                  <input type="number" value="${item.quantity}" min="1" max="${item.stock}" class="w-20 border rounded-lg p-2 text-center qty-input-desktop">
                </div>
                <button class="ml-3 text-gray-400 hover:text-red-500 remove-btn">✕</button>
              </div>
            </div>

            <p class="text-sm text-gray-600 mt-2">Subtotal: ৳${subtotal.toFixed(2)}</p>
          </div>
        </div>
      `;

      // Quantity & remove logic
      const minusBtn = itemEl.querySelector('.minus');
      const plusBtn = itemEl.querySelector('.plus');
      const qtyInputDesktop = itemEl.querySelector('.qty-input-desktop');
      const removeBtn = itemEl.querySelector('.remove-btn');

      if (minusBtn) minusBtn.addEventListener('click', () => { 
        if (item.quantity > 1) { 
          item.quantity--; 
          saveAndRender(cart); 
        } 
      });
      
      if (plusBtn) plusBtn.addEventListener('click', () => { 
        if (item.quantity < item.stock) { 
          item.quantity++; 
          saveAndRender(cart); 
        } else { 
          alert(`Only ${item.stock} available in stock!`); 
        } 
      });
      
      if (qtyInputDesktop) qtyInputDesktop.addEventListener('change', () => {
        let val = parseInt(qtyInputDesktop.value, 10);
        if (isNaN(val) || val < 1) val = 1;
        if (val > item.stock) val = item.stock;
        item.quantity = val;
        saveAndRender(cart);
      });
      
      if (removeBtn) removeBtn.addEventListener('click', () => { 
        cart.splice(index, 1); 
        saveAndRender(cart); 
      });

      container.appendChild(itemEl);
    });

    // --- SMART FREE DELIVERY LOGIC ---
    const freeDeliveryResult = shouldApplyFreeDelivery(cart, rules);
    const freeDelivery = freeDeliveryResult.free;
    const freeReason = freeDeliveryResult.reason;

    
    // Calculate delivery type for Google Sheets
    const deliveryType = freeDelivery ? "Free" : "Payment";
    
    // Calculate base delivery fee
    let deliveryFee = deliveryData.baseFee + (deliveryData.options[deliveryChoice]?.extra || 0);
    
    // Apply free delivery if rules met
    if (freeDelivery) {
      deliveryFee = 0;
      shippingEl.textContent = '৳0.00 (FREE)';
    } else {
      shippingEl.textContent = `৳${deliveryFee.toFixed(2)}`;
    }
    
    // Update delivery option labels and controls
    if (outsideLabel) {
      // If freeDelivery is true for any reason, show disabled message
      if (freeDelivery) {
        outsideLabel.textContent = `Free delivery — selection disabled`;
      } else if (deliveryData.options.outside) {
        outsideLabel.textContent = `Outside Dhaka (+৳${deliveryData.options.outside.extra})`;
      }
    }
    
    if (insideLabel) {
      if (freeDelivery) {
        insideLabel.textContent = `Free delivery — selection disabled`;
      } else {
        insideLabel.textContent = `Standard shipping inside Dhaka: ৳${deliveryData.baseFee}`;
      }
    }
    
    // Disable delivery selection when any free delivery reason applies
    if (outsideCheckbox) {
      if (freeDelivery) {
        outsideCheckbox.disabled = true;
        outsideCheckbox.checked = false;
        // ensure choice stored as 'inside' so checkout uses that canonical value
        if (typeof CartUtils !== "undefined" && CartUtils.saveDeliveryChoice) {
          CartUtils.saveDeliveryChoice('inside');
        } else {
          localStorage.setItem('deliveryChoice', 'inside');
        }
      } else {
        outsideCheckbox.disabled = false;
        outsideCheckbox.checked = (deliveryChoice === "outside");
      }
    }

    // Update totals
    subtotalEl.textContent = `৳${total.toFixed(2)}`;
    totalEl.textContent = `৳${(total + deliveryFee).toFixed(2)}`;

    // Save backend data (deliveryFee === 0 will be saved as "000" and deliveryType as "Free"/"Payment")
    saveCheckoutData(cart, deliveryFee, total + deliveryFee, deliveryType);
    CartUtils.updateCartCount();
  }

  function saveAndRender(cart) {
    CartUtils.saveCart(cart);
    renderCart();
  }

  // Initialize
  renderCart();
  
  if (outsideCheckbox) {
    outsideCheckbox.addEventListener('change', () => {
      CartUtils.saveDeliveryChoice(outsideCheckbox.checked ? 'outside' : 'inside');
      renderCart();
    });
  }
});

