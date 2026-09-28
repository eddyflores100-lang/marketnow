/* Extracted from demo.html inline <script> for strict CSP (M-07). */

let currentSlide = 1;
const totalSlides = 7;
let autoPlay = null;
let autoMode = false;

function showSlide(n) {
  document.querySelectorAll('.slide').forEach(s => s.classList.remove('active'));
  const slide = document.getElementById('slide-' + n);
  if (slide) slide.classList.add('active');
  document.getElementById('progress').style.width = (n / totalSlides * 100) + '%';
  document.getElementById('slideNum').textContent = n + ' / ' + totalSlides;
  currentSlide = n;
}

function nextSlide() {
  if (currentSlide < totalSlides) showSlide(currentSlide + 1);
  else showSlide(1);
}

function prevSlide() {
  if (currentSlide > 1) showSlide(currentSlide - 1);
}

function toggleAuto() {
  if (autoMode) {
    clearInterval(autoPlay);
    autoMode = false;
    document.getElementById('autoBtn').textContent = '▶ AUTO';
  } else {
    autoMode = true;
    document.getElementById('autoBtn').textContent = '⏸ STOP';
    autoPlay = setInterval(nextSlide, 5000);
  }
}

// Start auto-play on load
setTimeout(() => toggleAuto(), 1000);

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') nextSlide();
  if (e.key === 'ArrowLeft') prevSlide();
  if (e.key === ' ') { e.preventDefault(); toggleAuto(); }
});

