(function () {
  function getCart() {
    try {
      return JSON.parse(localStorage.getItem('cart')) || [];
    } catch {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem('cart', JSON.stringify(cart));
  }

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
  const oldSave = saveCart;
  saveCart = function(cart) {
    oldSave(cart);
    renderCartDebug();
  };



})();
