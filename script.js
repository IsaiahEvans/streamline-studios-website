// ============================================
// STREAMLINE STUDIOS — site interactions
// ============================================

// Fetches shared header/footer partials into any [data-include] placeholder
// before the rest of the page's interactive behavior wires up. Requires the
// page to be served over http(s) (e.g. `python3 -m http.server`, or GitHub
// Pages) — fetch() cannot load local files over file://.
function loadIncludes() {
  const targets = Array.from(document.querySelectorAll('[data-include]'));
  if (!targets.length) return Promise.resolve();

  return Promise.all(targets.map(async (el) => {
    const src = el.getAttribute('data-include');
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Failed to load ${src}: ${res.status}`);
    el.outerHTML = await res.text();
  }));
}

function initSite() {

  // Footer year
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Booking form — pre-select package from a ?package=<slug> query param
  // (e.g. arriving via a "Book this" link from services.html)
  const packageSelect = document.getElementById('bk-package');
  if (packageSelect) {
    const pkg = new URLSearchParams(window.location.search).get('package');
    const match = Array.from(packageSelect.options).find(opt => opt.value === pkg);
    if (match) packageSelect.value = pkg;
  }

  // Booking form — add-ons. There is ONE list of add-on checkboxes; each
  // item lists the package families it applies to in data-families. The
  // selected package's data-family (car/personal/brand, read off the <option>)
  // decides which items show. Hidden items are unchecked and disabled so they
  // can't be submitted; checked ones post as repeated name="addons" fields.
  const addonsField = document.getElementById('bk-addons');
  if (packageSelect && addonsField) {
    const notes = Array.from(addonsField.querySelectorAll('[data-addons-for]'));
    const list = addonsField.querySelector('.addons-checks');
    const items = Array.from(addonsField.querySelectorAll('[data-families]'));

    function updateAddonsVisibility() {
      const selectedOption = packageSelect.options[packageSelect.selectedIndex];
      const family = selectedOption?.dataset.family || '';
      notes.forEach(note => note.classList.toggle('is-hidden', note.dataset.addonsFor !== family));
      let anyVisible = false;
      items.forEach(item => {
        const show = !!family && item.dataset.families.split(' ').includes(family);
        const cb = item.querySelector('input[type="checkbox"]');
        item.classList.toggle('is-hidden', !show);
        cb.disabled = !show;
        if (!show) cb.checked = false;
        anyVisible = anyVisible || show;
      });
      list.classList.toggle('is-hidden', !anyVisible);
      addonsField.classList.toggle('is-hidden', !family);
    }

    packageSelect.addEventListener('change', updateAddonsVisibility);
    updateAddonsVisibility(); // reflect any ?package= pre-fill from above on first render
  }

  // Inquiry forms — submitted with fetch to the site's own Worker
  // (worker/index.js, POST /api/contact) so the visitor stays on the page
  // and sees a success or error message under the button.
  // The email subject is built here at submit time, e.g.
  // "Booking request: Car Signature (Jay Lee)" or
  // "Event inquiry: Car meet / cruise (Jay Lee)".
  const CONTACT_EMAIL = 'contact.streamlinestudios@gmail.com';
  document.querySelectorAll('form.booking-form, form.events-form').forEach(form => {
    const statusEl = form.querySelector('.form-status');
    const submitBtn = form.querySelector('button[type="submit"]');

    function showStatus(message, isError) {
      if (!statusEl) return;
      statusEl.textContent = message;
      statusEl.classList.toggle('is-error', !!isError);
      statusEl.classList.remove('is-hidden');
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = (form.querySelector('[name="name"]')?.value || '').trim();
      const pkg = form.querySelector('select[name="package"]');
      const eventType = form.querySelector('select[name="event_type"]');
      const pkgLabel = pkg ? pkg.options[pkg.selectedIndex].text.trim() : '';
      let subject = 'Website inquiry';
      if (pkg) subject = `Booking request: ${pkgLabel}`;
      else if (eventType) subject = `Event inquiry: ${eventType.value}`;
      if (name) subject += ` (${name})`;
      const subjectField = form.querySelector('input[name="_subject"]');
      if (subjectField) subjectField.value = subject;

      const data = new FormData(form);
      if (pkg) data.set('package', pkgLabel); // readable name instead of the URL slug

      const btnLabel = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending…'; }
      statusEl?.classList.add('is-hidden');

      try {
        const res = await fetch(form.action, {
          method: 'POST',
          body: data,
          headers: { Accept: 'application/json' },
        });
        const result = await res.json().catch(() => null);
        if (res.ok && result?.ok) {
          form.reset();
          // Re-sync the package-dependent fields after the reset.
          form.querySelector('#bk-package')?.dispatchEvent(new Event('change'));
          showStatus(result.message || "Thanks — your message was sent. I'll reply within 24 hours.", false);
        } else {
          showStatus(result?.message || `Your message could not be sent. Please email ${CONTACT_EMAIL} directly.`, true);
        }
      } catch {
        showStatus(`Your message could not be sent. Check your connection and try again, or email ${CONTACT_EMAIL} directly.`, true);
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = btnLabel; }
      }
    });
  });

  // Location preference — separate control from add-ons above, shown only
  // for Personal/Branding packages (Car sessions are inherently
  // location/meet-based already, so it stays hidden for that family).
  const locationPrefField = document.getElementById('bk-location-pref');
  if (packageSelect && locationPrefField) {
    function updateLocationPrefVisibility() {
      const selectedOption = packageSelect.options[packageSelect.selectedIndex];
      const family = selectedOption?.dataset.family || '';
      locationPrefField.classList.toggle('is-hidden', family !== 'personal' && family !== 'brand');
    }
    packageSelect.addEventListener('change', updateLocationPrefVisibility);
    updateLocationPrefVisibility();
  }

  // Mobile nav toggle
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', isOpen);
    });
  }

  // Testimonial slider
  const track = document.querySelector('.testimonial-track');
  if (track) {
    const cards = Array.from(track.querySelectorAll('.testimonial-card'));
    const dotsWrap = document.querySelector('.slide-dots');
    // Prev/next arrows live inside each card (next to the client name), so
    // there's one pair per slide — only the active card's pair is visible/clickable.
    const prevBtns = Array.from(track.querySelectorAll('.slide-arrow--prev'));
    const nextBtns = Array.from(track.querySelectorAll('.slide-arrow--next'));
    let current = cards.findIndex(c => c.classList.contains('is-active'));
    if (current < 0) current = 0;

    // Build dots
    cards.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('aria-label', `Go to testimonial ${i + 1}`);
      if (i === current) dot.classList.add('is-active');
      dot.addEventListener('click', () => goTo(i));
      dotsWrap.appendChild(dot);
    });

    function render() {
      cards.forEach((c, i) => c.classList.toggle('is-active', i === current));
      Array.from(dotsWrap.children).forEach((d, i) => d.classList.toggle('is-active', i === current));
    }

    function goTo(index) {
      current = (index + cards.length) % cards.length;
      render();
    }

    prevBtns.forEach(btn => btn.addEventListener('click', () => goTo(current - 1)));
    nextBtns.forEach(btn => btn.addEventListener('click', () => goTo(current + 1)));

    // Auto-advance every 6s, pauses on hover/focus
    let autoplay = setInterval(() => goTo(current + 1), 6000);
    const slider = document.querySelector('.testimonial-slider');
    slider?.addEventListener('mouseenter', () => clearInterval(autoplay));
    slider?.addEventListener('mouseleave', () => { autoplay = setInterval(() => goTo(current + 1), 6000); });
  }

  // Events multi-item carousel (events.html only) — shows several images at
  // once and auto-advances by exactly one item, using a clone-and-snap loop
  // so it wraps seamlessly in both directions. Distinct from the testimonial
  // slider above (which shows one full card and swaps it outright), so it's
  // its own function rather than a variant of that one.
  function initEventsCarousel() {
    const root = document.querySelector('.events-carousel');
    if (!root) return;

    const viewport = root.querySelector('.carousel-viewport');
    const track = root.querySelector('.carousel-track');
    const prevBtn = root.querySelector('.carousel-arrow--prev');
    const nextBtn = root.querySelector('.carousel-arrow--next');
    const originalItems = Array.from(track.children);
    const total = originalItems.length;
    const GAP = 12; // px — matches .carousel-track's gap:0.75rem
    const CLONE_COUNT = 3; // covers the largest breakpoint's visible count

    // Clone the tail onto the front and the head onto the back, so stepping
    // past either end lands on real-looking content; a transitionend snap
    // (no transition) then silently re-centers the index onto the real item.
    const headFrag = document.createDocumentFragment();
    originalItems.slice(-CLONE_COUNT).forEach(el => {
      const clone = el.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      headFrag.appendChild(clone);
    });
    track.insertBefore(headFrag, track.firstChild);

    const tailFrag = document.createDocumentFragment();
    originalItems.slice(0, CLONE_COUNT).forEach(el => {
      const clone = el.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      tailFrag.appendChild(clone);
    });
    track.appendChild(tailFrag);

    let index = CLONE_COUNT; // first real item

    function visibleCount() {
      const w = window.innerWidth;
      if (w <= 600) return 1;
      if (w <= 860) return 2;
      return 3;
    }

    function itemWidth() {
      return (viewport.clientWidth - GAP * (visibleCount() - 1)) / visibleCount();
    }

    function updateTransform() {
      const step = itemWidth() + GAP;
      track.style.transform = `translateX(-${index * step}px)`;
    }

    function layout() {
      const w = itemWidth();
      Array.from(track.children).forEach(el => {
        el.style.flexBasis = `${w}px`;
        el.style.width = `${w}px`;
      });
      track.style.transition = 'none';
      updateTransform();
      track.offsetHeight; // force reflow so the next transform is transitioned
      track.style.transition = '';
    }

    function snapTo(newIndex) {
      index = newIndex;
      track.style.transition = 'none';
      updateTransform();
      track.offsetHeight;
      track.style.transition = '';
    }

    function next() { index++; updateTransform(); }
    function prev() { index--; updateTransform(); }

    track.addEventListener('transitionend', (e) => {
      if (e.propertyName !== 'transform') return;
      if (index >= CLONE_COUNT + total) snapTo(index - total);
      else if (index < CLONE_COUNT) snapTo(index + total);
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(layout, 150);
    });

    layout();

    let autoplay = setInterval(next, 4500);
    root.addEventListener('mouseenter', () => clearInterval(autoplay));
    root.addEventListener('mouseleave', () => { autoplay = setInterval(next, 4500); });
    root.addEventListener('focusin', () => clearInterval(autoplay));
    root.addEventListener('focusout', () => { autoplay = setInterval(next, 4500); });

    prevBtn?.addEventListener('click', prev);
    nextBtn?.addEventListener('click', next);
  }
  initEventsCarousel();

  // Gallery pages — portfolio.html (filters + lightbox) and the category
  // pages like car-photography.html (lightbox only, no filter bar). Keyed off
  // the lightbox element, which the homepage preview grid doesn't have.
  const lightbox = document.querySelector('.lightbox');
  const galleryGrid = lightbox ? document.querySelector('.portfolio-grid') : null;
  if (galleryGrid) {
    const filterBar = document.querySelector('.portfolio-filters');
    const filterBtns = filterBar ? Array.from(filterBar.querySelectorAll('.filter-btn')) : [];
    const tiles = Array.from(galleryGrid.querySelectorAll('.portfolio-tile'));
    const categoryNotes = Array.from(document.querySelectorAll('[data-note-for]'));
    const validCats = filterBtns.map(b => b.dataset.filter).filter(f => f !== 'all');

    function applyFilter(cat) {
      const target = validCats.includes(cat) ? cat : 'all';
      filterBtns.forEach(btn => {
        const isActive = btn.dataset.filter === target;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-pressed', isActive);
      });
      tiles.forEach(tile => {
        const show = target === 'all' || tile.dataset.category === target;
        tile.classList.toggle('is-hidden', !show);
      });
      // Category notes (e.g. "available as an add-on") only show under their
      // own filter, not on "All" or any other category.
      categoryNotes.forEach(note => {
        note.classList.toggle('is-hidden', note.dataset.noteFor !== target);
      });
    }

    if (filterBar) {
      filterBtns.forEach(btn => {
        btn.addEventListener('click', () => applyFilter(btn.dataset.filter));
      });

      const params = new URLSearchParams(window.location.search);
      applyFilter(params.get('cat'));
    }

    // Lightbox — navigates only through tiles visible under the active filter
    const lightboxMedia = lightbox?.querySelector('.lightbox-media');
    const lightboxCaption = lightbox?.querySelector('.lightbox-caption');
    const closeBtn = lightbox?.querySelector('.lightbox-close');
    const prevArrow = lightbox?.querySelector('.lightbox-arrow--prev');
    const nextArrow = lightbox?.querySelector('.lightbox-arrow--next');
    const scrim = lightbox?.querySelector('.lightbox-scrim');
    const focusable = [closeBtn, prevArrow, nextArrow];

    let visibleTiles = [];
    let lightboxIndex = 0;
    let lastFocused = null;

    function renderLightbox() {
      const tile = visibleTiles[lightboxIndex];
      const media = tile.querySelector('.tile-media');
      const label = tile.querySelector('.tile-label')?.textContent || '';
      lightboxMedia.src = media.src;
      lightboxMedia.alt = media.alt || label;
      lightboxCaption.textContent = label;
    }

    function goToImage(delta) {
      lightboxIndex = (lightboxIndex + delta + visibleTiles.length) % visibleTiles.length;
      renderLightbox();
    }

    function onLightboxKeydown(e) {
      if (e.key === 'Escape') { closeLightbox(); return; }
      if (e.key === 'ArrowLeft') { goToImage(-1); return; }
      if (e.key === 'ArrowRight') { goToImage(1); return; }
      if (e.key === 'Tab') {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    }

    function openLightbox(tile) {
      visibleTiles = tiles.filter(t => !t.classList.contains('is-hidden'));
      lightboxIndex = visibleTiles.indexOf(tile);
      if (lightboxIndex < 0) return;
      lastFocused = document.activeElement;
      renderLightbox();
      lightbox.hidden = false;
      closeBtn.focus();
      document.addEventListener('keydown', onLightboxKeydown);
    }

    function closeLightbox() {
      lightbox.hidden = true;
      document.removeEventListener('keydown', onLightboxKeydown);
      lastFocused?.focus();
    }

    tiles.forEach(tile => tile.addEventListener('click', () => openLightbox(tile)));
    closeBtn?.addEventListener('click', closeLightbox);
    scrim?.addEventListener('click', closeLightbox);
    prevArrow?.addEventListener('click', () => goToImage(-1));
    nextArrow?.addEventListener('click', () => goToImage(1));
  }

}

document.addEventListener('DOMContentLoaded', () => {
  loadIncludes()
    .catch(err => console.error('Component include failed:', err))
    .then(initSite);
});
