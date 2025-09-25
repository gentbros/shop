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
      const res = await fetch("delivery.json"); // adjust path if stored elsewhere
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
  async function renderCart() {
    const cart = CartUtils.getCart();
    container.innerHTML = '';

    // If cart is empty
    if (cart.length === 0) {
      container.innerHTML = '<p>Your cart is empty.</p>';
      subtotalEl.textContent = '৳0.00';
      shippingEl.textContent = '৳0.00';
      totalEl.textContent = '0.00';
      CartUtils.updateCartCount();
      return;
    }

    let total = 0;

    // Loop through cart items
    cart.forEach((item, index) => {
      const subtotal = item.price * item.quantity;
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
              <span class="text-gray-900 font-medium">৳${item.price.toFixed(2)} each</span>

              <div class="flex items-center space-x-2">

                <!-- Mobile Controls -->
                <div class="flex items-center space-x-2 sm:hidden">
                  <button class="px-3 py-1 bg-gray-200 rounded-lg text-lg font-bold minus">-</button>
                  <input type="number" value="${item.quantity}" min="1" max="${item.stock}"
                         class="w-14 border rounded-lg p-2 text-center qty-input" readonly>
                  <button class="px-3 py-1 bg-gray-200 rounded-lg text-lg font-bold plus">+</button>
                </div>

                <!-- Desktop Controls -->
                <div class="hidden sm:flex items-center">
                  <input type="number" value="${item.quantity}" min="1" max="${item.stock}"
                         class="w-20 border rounded-lg p-2 text-center qty-input-desktop">
                </div>

                <!-- Remove Button -->
                <button class="ml-3 text-gray-400 hover:text-red-500 remove-btn">✕</button>
              </div>
            </div>

            <p class="text-sm text-gray-600 mt-2">Subtotal: ৳${subtotal.toFixed(2)}</p>
          </div>
        </div>
      `;

      // Mobile quantity buttons
      const qtyInput = itemEl.querySelector('.qty-input');
      const minusBtn = itemEl.querySelector('.minus');
      const plusBtn = itemEl.querySelector('.plus');

      if (minusBtn) {
        minusBtn.addEventListener('click', () => {
          if (item.quantity > 1) {
            item.quantity--;
            saveAndRender(cart);
          }
        });
      }

      if (plusBtn) {
        plusBtn.addEventListener('click', () => {
          if (item.quantity < item.stock) {
            item.quantity++;
            saveAndRender(cart);
          } else {
            alert(`Only ${item.stock} available in stock!`);
          }
        });
      }

      // Desktop number input
      const qtyInputDesktop = itemEl.querySelector('.qty-input-desktop');
      if (qtyInputDesktop) {
        qtyInputDesktop.addEventListener('change', () => {
          let val = parseInt(qtyInputDesktop.value, 10);
          if (isNaN(val) || val < 1) val = 1;
          if (val > item.stock) val = item.stock;
          item.quantity = val;
          saveAndRender(cart);
        });
      }

      // Remove button
      const removeBtn = itemEl.querySelector('.remove-btn');
      removeBtn.addEventListener('click', () => {
        cart.splice(index, 1);
        saveAndRender(cart);
      });

      container.appendChild(itemEl);
    });

    // --- Delivery Fee (loaded from JSON) ---
    const deliveryData = await loadDeliveryData();
    const deliveryChoice = CartUtils.getDeliveryChoice() || "inside";

    // Update delivery labels dynamically
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

    // Checkbox state
    if (deliveryChoice === "outside") {
      if (outsideCheckbox) outsideCheckbox.checked = true;
    } else {
      if (outsideCheckbox) outsideCheckbox.checked = false;
    }

    // Update DOM with totals
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


