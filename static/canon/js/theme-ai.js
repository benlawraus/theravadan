// Apply the theme immediately to prevent flash of wrong theme
(function() {
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  } else if (prefersDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();

// Function to set theme
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
}

// Function to toggle theme
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  setTheme(newTheme);
}

// Add event listener once DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  // Only attach click event if toggle button exists on the current page
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  // PWA offline mode button handler
  const pwaButton = document.getElementById('pwa-enable');
  if (pwaButton) {
    // Check if offline content is already downloaded
    if ('caches' in window) {
      caches.open('theravada-content-v1').then(cache => {
        cache.match('theravada-cache-progress').then(response => {
          if (response) {
            response.json().then(progress => {
              if (progress.lastBatchProcessed >= progress.totalBatches) {
                pwaButton.textContent = 'Offline Content Ready';
                pwaButton.disabled = true;
              } else if (progress.lastBatchProcessed > 0) {
                const percent = Math.round((progress.lastBatchProcessed / progress.totalBatches) * 100);
                pwaButton.textContent = `Download Offline Content (${percent}% complete)`;

                // If download was in progress but interrupted, button should still be enabled
                pwaButton.disabled = false;
              }
            });
          }
        });
      });
    }

    // Handle PWA button click
    pwaButton.addEventListener('click', function() {
      if (navigator.serviceWorker.controller) {
        pwaButton.textContent = 'Downloading...';
        pwaButton.disabled = true;

        // No progress indicator, we'll just update the button text

        // Tell service worker to start caching
        navigator.serviceWorker.controller.postMessage({
          action: 'startProgressiveCaching'
        });
        console.log('📋 User triggered offline content download');
      } else {
        console.log('📋 No service worker controller available');
        pwaButton.textContent = 'Service worker not ready, try again later';
        setTimeout(() => {
          pwaButton.textContent = 'Download Offline Content';
          pwaButton.disabled = false;
        }, 3000);
      }
    });
  }
});

// Register service worker if supported
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/serviceworker.js')
      .then(registration => {
        console.log('📋 ServiceWorker registration successful with scope: ', registration.scope);
      })
      .catch(err => {
        console.log('📋 ServiceWorker registration failed: ', err);
      });
  });

  // Listen for messages from the service worker
  navigator.serviceWorker.addEventListener('message', event => {
    const data = event.data;

    // Handle logging messages
    if (data.type === 'log') {
      console.log('📋', data.message);
    }

    // Handle cache progress updates
    if (data.type === 'cacheProgress') {
      console.log(`📋 Cache progress: Batch ${data.currentBatch}/${data.totalBatches}`);

      // Wait a bit then tell the service worker to continue
      setTimeout(() => {
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            action: 'scheduleNextBatch',
            currentBatch: data.currentBatch,
            totalBatches: data.totalBatches
          });
          console.log('📋 Requesting service worker to continue caching');
        } else {
          console.log('📋 Service worker controller not available');
        }
      }, 5000);
    }

    // Handle detailed caching status for button text update
    if (data.type === 'cachingStatus') {
      const pwaButton = document.getElementById('pwa-enable');

      if (pwaButton) {
        pwaButton.textContent = `Downloading... ${data.progress}%`;
        pwaButton.disabled = true; // Ensure button stays disabled during download
      }
    }

    // Handle caching complete message
    if (data.type === 'cachingComplete') {
      const pwaButton = document.getElementById('pwa-enable');

      if (pwaButton) {
        pwaButton.textContent = 'Offline Content Ready';
        pwaButton.disabled = true;
      }

      console.log(`📋 All content cached successfully! Total files: ${data.totalFiles}`);

      // Redirect to search page after a short delay to let the user see the "complete" status
      setTimeout(() => {
        window.location.href = '/search/en.html';
      }, 1000);
    }

    // Handle caching error message
    if (data.type === 'cacheError') {
      const pwaButton = document.getElementById('pwa-enable');

      if (pwaButton) {
        pwaButton.textContent = 'Error downloading content';
        pwaButton.disabled = false;

        setTimeout(() => {
          pwaButton.textContent = 'Try Download Again';
        }, 3000);
      }

      console.error(`📋 Error caching content: ${data.message}`);
    }
  });

  // Check if the service worker is already controlling the page
  if (navigator.serviceWorker.controller) {
    console.log('📋 Service worker is active and controlling the page');
  }
}

// Function to check cache progress manually
function checkCacheProgress() {
  if ('caches' in window) {
    caches.open('theravada-content-v1').then(cache => {
      cache.match('theravada-cache-progress').then(response => {
        if (response) {
          response.json().then(progress => {
            console.log('📋 Current cache progress:', progress);
          });
        } else {
          console.log('📋 No cache progress information found');
        }
      });
    });
  }
}

// Add a manual trigger for continuing caching
function triggerCaching() {
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      action: 'startProgressiveCaching'
    });
    console.log('📋 Manually triggered service worker caching');
  } else {
    console.log('📋 No service worker controller available');
  }
}