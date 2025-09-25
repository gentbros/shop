// filter.js - Standalone filter functionality
document.addEventListener('DOMContentLoaded', function() {
  initializeFilters();
});

function initializeFilters() {
  // Set up filter button event listeners
  const filterButtons = document.querySelectorAll('.filter-btn');
  if (filterButtons.length > 0) {
    filterButtons.forEach(btn => {
      btn.addEventListener('click', handleFilterClick);
    });
    
    // Apply 'all' filter by default
    applyFilter('all');
  }
}

function handleFilterClick() {
  // Update active state
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  this.classList.add('active');
  
  // Apply the filter
  const filter = this.dataset.filter;
  applyFilter(filter);
}

function applyFilter(category) {
  const productCards = document.querySelectorAll('.product-card');
  
  if (productCards.length === 0) {
    console.warn('No product cards found for filtering');
    return;
  }

  productCards.forEach(card => {
    if (category === 'all') {
      card.style.display = 'block';
    } else {
      const categories = card.dataset.categories ? card.dataset.categories.split(' ') : [];
      card.style.display = categories.includes(category) ? 'block' : 'none';
    }
  });
}

// Make functions available globally if needed
window.FilterManager = {
  init: initializeFilters,
  filter: applyFilter
};