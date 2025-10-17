
(function () {
  function getCart() {
    try {
      return JSON.parse(localStorage.getItem('cart')) || [];
    } catch {
      return [];
    }
  }

  function saveCartRaw(cart) {
    localStorage.setItem('cart', JSON.stringify(cart));
  }

  function saveCart(cart) {
    // wrapper kept for backward compatibility if other code calls CartUtils.saveCart
    saveCartWrapped(cart);
  }

  // We'll set up a wrapped save function below that notifies listeners.
  let saveCartWrapped = function(cart) {
    // default raw implementation (will be replaced after declaration)
    saveCartRaw(cart);
  };

  function updateCartCount() {
    const cart = getCart();
    const totalItems = cart.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const el = document.querySelector('.cart-count');
    if (el) el.textContent = totalItems;
  }

  // --- Delivery ---
  function getDeliveryChoice() {
    return localStorage.getItem('deliveryChoice') || null;
  }

  function saveDeliveryChoice(choice) {
    if (choice) {
      localStorage.setItem('deliveryChoice', choice);
    } else {
      localStorage.removeItem('deliveryChoice');
    }
  }

  // --- Checkout Data ---
  function getCheckoutData() {
    try {
      return JSON.parse(localStorage.getItem('checkoutData')) || null;
    } catch {
      return null;
    }
  }

  function saveCheckoutData(data) {
    if (data) {
      localStorage.setItem('checkoutData', JSON.stringify(data));
    } else {
      localStorage.removeItem('checkoutData');
    }
  }

  // expose globally
  window.CartUtils = { 
    getCart, saveCart, updateCartCount,
    getDeliveryChoice, saveDeliveryChoice,
    getCheckoutData, saveCheckoutData
  };

  // update count automatically on every page load
  document.addEventListener('DOMContentLoaded', updateCartCount);

  // --- For testing: clear cart button ---
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('clearCartBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        localStorage.removeItem('cart'); 
        localStorage.removeItem('deliveryChoice'); 
        localStorage.removeItem('checkoutData'); // ✅ clear checkout too
        CartUtils.updateCartCount();
        alert('Cart + Checkout cleared!');
        renderCartDebug();
      });
    }
  });

  // --- Debug Overlay ---
  function renderCartDebug() {
    const panel = document.getElementById('cartDebugPanel');
    if (!panel) return;
  
    const cart = getCart();
    const delivery = getDeliveryChoice();
    const checkout = getCheckoutData();
  
    let html = '';
    if (cart.length === 0) {
      html += 'Cart is empty';
    } else {
      html += '<strong>Cart Data:</strong><br>' +
        cart.map(item => {
          const color = item.color ? item.color : 'none';
          const size = item.size ? item.size : 'none';
  
          // ✅ Extract filename from the image path
          let imageFile = item.image ? item.image.split('/').pop() : 'none';
  
          return `• ${item.title}  
            <br>&nbsp;&nbsp;ID: ${item.id}  
            <br>&nbsp;&nbsp;Image: ${imageFile}  
            <br>&nbsp;&nbsp;(${color}, ${size}) x${item.quantity} = ৳${(item.quantity * item.price).toFixed(2)}<br>`;
        }).join('<br>');
    }
  
    html += `<br><br><strong>Delivery:</strong> ${delivery || 'null'}`;
  
    if (checkout) {
      html += `<br><br><strong>Checkout Data:</strong><br>` +
        Object.entries(checkout).map(([k, v]) => {
          if (typeof v === 'object' && v !== null) {
            return `${k}: ${JSON.stringify(v)}`;
          }
          return `${k}: ${v || 'null'}`;
        }).join('<br>');
    }
  
    panel.innerHTML = html;
  }

  document.addEventListener('DOMContentLoaded', renderCartDebug);

  // --- Wrapped saveCart that notifies listeners and triggers GIF logic ---
  // We'll detect if cart transitioned from empty -> non-empty or grew in length/quantity.
  saveCartWrapped = function(newCart) {
    // capture previous cart state
    const prevCart = getCart();
    const prevTotal = prevCart.reduce((s, it) => s + (it.quantity || 0), 0);
    const prevLen = prevCart.length;

    // perform raw save
    saveCartRaw(newCart);

    // update UI/debug
    updateCartCount();
    renderCartDebug();

    // determine new state
    const currTotal = (newCart || []).reduce((s, it) => s + (it.quantity || 0), 0);
    const currLen = (newCart || []).length;

    // Determine action: added, removed, updated, cleared, none
    let action = 'updated';
    if (prevLen === 0 && currLen > 0) action = 'added';           // became non-empty
    else if (currLen === 0 && prevLen > 0) action = 'cleared';     // emptied
    else if (currTotal > prevTotal) action = 'added';
    else if (currTotal < prevTotal) action = 'removed';
    else action = 'updated';

    // Dispatch a global event so other scripts (GIF logic) can listen.
    try {
      const ev = new CustomEvent('cart:updated', { detail: { cart: newCart, action } });
      window.dispatchEvent(ev);
    } catch (e) {
      // fallback for old browsers
      const ev2 = document.createEvent('CustomEvent');
      ev2.initCustomEvent('cart:updated', true, true, { cart: newCart, action });
      window.dispatchEvent(ev2);
    }

    // If a global startGifLogic function exists, call it (safe guard).
    // This allows the GIF script to expose a function `window.startGifLogic` and get triggered immediately.
    try {
      if (typeof window.startGifLogic === 'function') {
        // pass new cart for convenience (GIF logic can re-check CartUtils.getCart() as well)
        window.startGifLogic(newCart);
      }
    } catch (e) {
      // ignore errors from user-defined handlers
      // console.warn('startGifLogic call failed', e);
    }
  };

  // Ensure the exported CartUtils.saveCart points to our wrapped implementation
  window.CartUtils.saveCart = function(cart) {
    // Keep API stable
    saveCartWrapped(cart);
  };

  // Also expose a convenience method to programmatically trigger the update event
  window.CartUtils.notifyCartUpdated = function() {
    const cart = getCart();
    const ev = new CustomEvent('cart:updated', { detail: { cart, action: 'programmatic' } });
    window.dispatchEvent(ev);
    if (typeof window.startGifLogic === 'function') window.startGifLogic(cart);
  };

})();

