    // Carousel functionality
 document.addEventListener('DOMContentLoaded', function() {
  const carouselTrack = document.getElementById('carouselTrack');
  const slides = document.querySelectorAll('.carousel-slide');
  let currentIndex = 0;
  const slideCount = slides.length;
  
  // Clone first slide and append to end for seamless looping
  const firstSlideClone = slides[0].cloneNode(true);
  carouselTrack.appendChild(firstSlideClone);
  
  function slideTo(index) {
    currentIndex = index;
    carouselTrack.style.transition = 'transform 0.5s ease-in-out';
    carouselTrack.style.transform = `translateX(-${currentIndex * 100}%)`;
  }
  
  function nextSlide() {
    currentIndex++;
    slideTo(currentIndex);
    
    // When reaching the clone, reset to first slide without animation
    if (currentIndex >= slideCount) {
      setTimeout(() => {
        carouselTrack.style.transition = 'none';
        currentIndex = 0;
        carouselTrack.style.transform = 'translateX(0)';
      }, 500);
    }
  }
  
  // Auto-advance every 5 seconds
  setInterval(nextSlide, 5000);
  
  // Initialize
  slideTo(0);
});