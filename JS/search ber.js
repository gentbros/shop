// search.js - Enhanced version
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded - initializing search');
  
  const searchInput = document.getElementById('searchInput');
  const searchButton = document.getElementById('searchButton');
  
  // Debug: Check if elements are found
  if (!searchInput) {
    console.error('Search input element not found!');
    return;
  }
  if (!searchButton) {
    console.error('Search button element not found!');
    return;
  }
  
  console.log('Search elements found successfully');

  function performSearch() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    console.log('Searching for:', searchTerm);
    
    const productCards = document.querySelectorAll('.product-card');
    console.log('Found', productCards.length, 'product cards');
    
    let visibleCount = 0;
    
    productCards.forEach(card => {
      const titleElement = card.querySelector('.product-title');
      if (titleElement) {
        const title = titleElement.textContent.toLowerCase();
        const isVisible = title.includes(searchTerm);
        
        card.style.display = isVisible ? 'block' : 'none';
        
        if (isVisible) visibleCount++;
        
        console.log(`Product: "${title}" - Visible: ${isVisible}`);
      }
    });
    
    console.log('Search complete. Visible products:', visibleCount);
  }
  
  // Event listeners
  searchButton.addEventListener('click', performSearch);
  
  searchInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      performSearch();
    }
  });
  
  // Optional: Clear search and show all products
  searchInput.addEventListener('input', function(e) {
    if (e.target.value === '') {
      const productCards = document.querySelectorAll('.product-card');
      productCards.forEach(card => {
        card.style.display = 'block';
      });
    }
  });
});















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








