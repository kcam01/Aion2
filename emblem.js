// Play the Higgsfield crest only when it is visible and motion is welcome.
// Keep the original image available while loading, on failure, and for reduced motion.
for (const emblem of document.querySelectorAll('[data-crest-motion]')) {
  const video = emblem.querySelector('video');
  const toggle = emblem.querySelector('.crest-motion-toggle');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let userPaused = Boolean(navigator.connection?.saveData);
  let motionOptIn = false;
  let visible = false;
  let failed = false;
  let playPending = false;
  const prefersPaused = () => userPaused || (reducedMotion.matches && !motionOptIn);
  const shouldPlay = () => !prefersPaused() && visible && !document.hidden && !failed;

  function syncMotion() {
    const running = shouldPlay();
    emblem.dataset.motion = running ? 'running' : 'paused';
    emblem.dataset.userPaused = String(prefersPaused());
    emblem.dataset.motionOptIn = String(motionOptIn);
    toggle.hidden = failed;
    toggle.setAttribute('aria-label', prefersPaused() ? 'Play emblem animation' : 'Pause emblem animation');
    toggle.title = toggle.getAttribute('aria-label');
    if (!running) {
      video.pause();
      return;
    }
    if (playPending || !video.paused) return;
    // A data-src attribute avoids fetching video on reduced-motion or data-saving visits.
    if (!video.hasAttribute('src')) video.src = video.dataset.src;
    video.muted = true;
    playPending = true;
    video.play().then(() => {
      // A user pause or tab switch can happen while the first frame is loading.
      if (!shouldPlay()) video.pause();
    }).catch(error => {
      if (shouldPlay() && error.name !== 'AbortError') userPaused = true;
    }).finally(() => {
      playPending = false;
      if (video.paused || !shouldPlay()) syncMotion();
    });
  }

  video.addEventListener('playing', () => { emblem.dataset.videoReady = 'true'; });
  video.addEventListener('error', () => {
    failed = true;
    emblem.dataset.videoReady = 'false';
    syncMotion();
  });
  toggle.addEventListener('click', () => {
    const playRequested = prefersPaused();
    userPaused = !playRequested;
    motionOptIn = playRequested;
    syncMotion();
  });
  reducedMotion.addEventListener('change', () => { motionOptIn = false; syncMotion(); });
  document.addEventListener('visibilitychange', syncMotion);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncMotion();
    }, { threshold: 0.1 }).observe(emblem);
  } else visible = true;
  syncMotion();
}
