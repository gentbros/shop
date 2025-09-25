document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('cartContainer');
  const totalEl = document.getElementById('cartTotal');
  const subtotalEl = document.getElementById('subtotal');
  const shippingEl = document.getElementById('shipping');
  const outsideCheckbox = document.getElementById('outsideDelivery');
  const outsideLabel = document.getElementById('outsideLabel');
  const insideLabel = document.getElementById('insideLabel');

  /**
   * Load delivery configuration from delivery.json
   * This allows shipping fees and wait days to be managed externally.
   */
  async function loadDeliveryData() {
    try {
      const res = await fetch("../delivery.json"); // adjust path if stored elsewhere
      return await res.json();
    } catch (err) {
      console.error("Failed to load delivery.json:", err);
      // Fallback values in case JSON fails to load
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
   * Render the shopping cart items and update totals.
   */







// Replace the existing renderCart() function in JS/cart.js with this:
async function renderCart() {
  const cart = CartUtils.getCart();
  container.innerHTML = '';

  // Try to read canonical product data from sessionStorage
  let productsData = [];
  try {
    const raw = sessionStorage.getItem('productsData');
    if (raw) productsData = JSON.parse(raw);
  } catch (e) {
    console.warn('Could not parse session productsData:', e);
  }

  // If cart empty
  if (!cart || cart.length === 0) {
    container.innerHTML = '<p>Your cart is empty.</p>';
    subtotalEl.textContent = '৳0.00';
    shippingEl.textContent = '৳0.00';
    totalEl.textContent = '৳0.00';
    CartUtils.updateCartCount();
    return;
  }

  let total = 0;
  let didClamp = false;

  cart.forEach((item, index) => {
    // Find authoritative product info
    const prod = productsData.find(p => String(p.id).trim() === String(item.id).trim());
    // default stock fallback
    let computedStock = Number(item.stock) || 0;

    if (prod && Array.isArray(prod.variants)) {
      // find variant matching color
      const variant = prod.variants.find(v => {
        const cname = (v.colorName || v.color || '').toString().trim().toLowerCase();
        return cname && (String(cname) === String((item.color || '').toLowerCase()));
      });

      if (variant) {
        if (item.size && Array.isArray(variant.sizes)) {
          // find exact size entry
          const sizeObj = variant.sizes.find(s => String(s.size).trim() === String(item.size).trim());
          if (sizeObj) {
            computedStock = Number(sizeObj.stock) || 0;
          } else {
            // If size was provided but not found, sum variant sizes as fallback
            computedStock = variant.sizes.reduce((s, sz) => s + (Number(sz?.stock) || 0), 0);
          }
        } else {
          // no sizes — sum all sizes or use variant.stock
          if (Array.isArray(variant.sizes)) {
            computedStock = variant.sizes.reduce((s, sz) => s + (Number(sz?.stock) || 0), 0);
          } else {
            computedStock = Number(variant.stock) || computedStock || 0;
          }
        }
      } else {
        // If variant not found, fallback to product-level stock calc
        computedStock = prod.variants.reduce((s, v) => {
          if (Array.isArray(v.sizes)) return s + v.sizes.reduce((ss, sz) => ss + (Number(sz?.stock) || 0), 0);
          return s + (Number(v.stock) || 0);
        }, 0);
      }
    }

    // Ensure computedStock is a non-negative integer
    computedStock = Math.max(0, parseInt(computedStock || 0, 10));

    // If cart quantity exceeds computedStock, clamp it and mark to save
    if ((item.quantity || 0) > computedStock) {
      item.quantity = computedStock > 0 ? computedStock : 0;
      cart[index] = item;
      didClamp = true;
    }

    // Save computed stock into the cart item (so UI shows it in max attributes)
    item.stock = computedStock;

    // compute subtotal with the clamped quantity
    const subtotal = (Number(item.price) || 0) * (Number(item.quantity) || 0);
    total += subtotal;

    // Build item DOM (same structure as before but make sure we use item.stock)
    const itemEl = document.createElement('div');
    itemEl.classList.add('cart-item-wrapper');
    itemEl.innerHTML = `
      <div class="flex flex-col sm:flex-row items-center bg-white rounded-2xl shadow-sm p-6 hover:shadow-md transition">
        <img src="../image/${item.image}" alt="${item.title}" class="w-28 h-28 rounded-xl object-cover">
        <div class="sm:ml-6 mt-4 sm:mt-0 flex-1 w-full">
          <h2 class="text-lg font-semibold text-gray-800">${item.title}</h2>
          <p class="text-sm text-gray-500">${item.color || ''} ${item.size || ''}</p>

          <div class="mt-4 flex items-center justify-between w-full">
            <span class="text-gray-900 font-medium">৳${(Number(item.price)||0).toFixed(2)} each</span>

            <div class="flex items-center space-x-2">
              <div class="flex items-center space-x-2 sm:hidden">
                <button class="px-3 py-1 bg-gray-200 rounded-lg text-lg font-bold minus">-</button>
                <input type="number" value="${item.quantity}" min="1" max="${item.stock}"
                       class="w-14 border rounded-lg p-2 text-center qty-input" readonly>
                <button class="px-3 py-1 bg-gray-200 rounded-lg text-lg font-bold plus">+</button>
              </div>

              <div class="hidden sm:flex items-center">
                <input type="number" value="${item.quantity}" min="1" max="${item.stock}"
                       class="w-20 border rounded-lg p-2 text-center qty-input-desktop">
              </div>

              <button class="ml-3 text-gray-400 hover:text-red-500 remove-btn">✕</button>
            </div>
          </div>

          <p class="text-sm text-gray-600 mt-2">Subtotal: ৳${subtotal.toFixed(2)}</p>
          ${item.stock <= 0 ? '<p class="text-sm text-red-500 mt-1">This variant is out of stock</p>' : ''}
        </div>
      </div>
    `;

    // Hook up events - note closures capture `item` and `index`
    const minusBtn = itemEl.querySelector('.minus');
    const plusBtn  = itemEl.querySelector('.plus');
    const qtyInputDesktop = itemEl.querySelector('.qty-input-desktop');
    const removeBtn = itemEl.querySelector('.remove-btn');

    if (minusBtn) {
      minusBtn.addEventListener('click', () => {
        if ((item.quantity || 0) > 1) {
          item.quantity = (item.quantity || 1) - 1;
          CartUtils.saveCart(cart);
          renderCart(); // re-render to update totals and stock
        }
      });
    }

    if (plusBtn) {
      plusBtn.addEventListener('click', () => {
        if ((item.quantity || 0) < (item.stock || 0)) {
          item.quantity = (item.quantity || 0) + 1;
          CartUtils.saveCart(cart);
          renderCart();
        } else {
          alert(`Only ${item.stock} available in stock!`);
        }
      });
    }

    if (qtyInputDesktop) {
      qtyInputDesktop.addEventListener('change', () => {
        let val = parseInt(qtyInputDesktop.value, 10);
        if (isNaN(val) || val < 1) val = 1;
        if (val > item.stock) {
          val = item.stock;
          alert(`Only ${item.stock} available in stock!`);
        }
        item.quantity = val;
        CartUtils.saveCart(cart);
        renderCart();
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        cart.splice(index, 1);
        CartUtils.saveCart(cart);
        renderCart();
      });
    }

    container.appendChild(itemEl);
  });

  // If any quantity was clamped due to stock changes, persist cart now
  if (didClamp) {
    CartUtils.saveCart(cart);
  }

  // --- Delivery Fee (loaded from delivery.json as before) ---
  const deliveryData = await loadDeliveryData();
  const deliveryChoice = CartUtils.getDeliveryChoice() || "inside";

  if (outsideLabel && deliveryData.options.outside) {
    outsideLabel.textContent = `Outside City (+৳${deliveryData.options.outside.extra})`;
  }
  if (insideLabel) {
    insideLabel.textContent = `Standard shipping inside city: ৳${deliveryData.baseFee}`;
  }

  let deliveryFee = deliveryData.baseFee;
  if (deliveryData.options[deliveryChoice]) {
    deliveryFee += deliveryData.options[deliveryChoice].extra;
  }

  subtotalEl.textContent = `৳${total.toFixed(2)}`;
  shippingEl.textContent = `৳${deliveryFee.toFixed(2)}`;
  totalEl.textContent = (total + deliveryFee).toFixed(2);

  CartUtils.updateCartCount();
}












  /**
   * Save cart and re-render
   */
  function saveAndRender(cart) {
    CartUtils.saveCart(cart);
    renderCart();
  }

  // Initial render
  renderCart();

  // Save delivery choice on checkbox toggle
  if (outsideCheckbox) {
    outsideCheckbox.addEventListener('change', () => {
      if (outsideCheckbox.checked) {
        CartUtils.saveDeliveryChoice('outside');
      } else {
        CartUtils.saveDeliveryChoice('inside');
      }
      renderCart();
    });
  }
});


image