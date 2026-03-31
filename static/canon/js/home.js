// PWA installation and debugging script
document.addEventListener('DOMContentLoaded', () => {
  const statusDiv = document.getElementById('pwa-status');
  const debugBtn = document.getElementById('debugBtn');
  const installBtn = document.getElementById('installPWA');
  const pwaDebugDiv = document.getElementById('pwa-debug');

  // Ensure debug div has dark background with light text
  if (pwaDebugDiv) {
    pwaDebugDiv.style.backgroundColor = '#333';
    pwaDebugDiv.style.color = '#fff';
  }

  // Check if we're in development mode
  const isDevMode = window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1';

  // Hide the debug section in production
  if (!isDevMode) {
    pwaDebugDiv.style.display = 'none';
  }

  // Function to update status
  function updateStatus(message) {
    if (statusDiv) {
      statusDiv.innerHTML = message;
      console.log(`PWA Status: ${message}`);
    }
  }

  // Check if running in standalone mode (already installed)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                      (window.navigator.standalone === true);

  if (isStandalone) {
    updateStatus('✅ App is already installed and running in standalone mode');
    if (installBtn) installBtn.style.display = 'none';
  } else {
    updateStatus('App is running in browser mode (not installed)');
  }

  // Check for service worker support
  if ('serviceWorker' in navigator) {
    updateStatus(statusDiv.innerHTML + '<br>✅ Service Worker is supported');

    // Register service worker
    navigator.serviceWorker.register('/serviceworker.js')
      .then(registration => {
        updateStatus(statusDiv.innerHTML + '<br>✅ Service Worker registered successfully');

        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              if (isDevMode) {
                updateStatus(statusDiv.innerHTML + '<br>🔄 New version available! Refresh to update.');
              }
            }
          });
        });
      })
      .catch(error => {
        updateStatus(statusDiv.innerHTML + `<br>❌ Service Worker registration failed: ${error}`);
      });

    // Check if service worker is controlling the page
    if (navigator.serviceWorker.controller) {
      updateStatus(statusDiv.innerHTML + '<br>✅ Page is controlled by a service worker');
    } else {
      updateStatus(statusDiv.innerHTML + '<br>ℹ️ Page is not yet controlled by a service worker');
    }
  } else {
    updateStatus(statusDiv.innerHTML + '<br>❌ Service Worker is NOT supported');
  }

  // Check if site is served over HTTPS
  if (window.location.protocol === 'https:' || isDevMode) {
    updateStatus(statusDiv.innerHTML + '<br>✅ Site is served over HTTPS or localhost');
  } else {
    updateStatus(statusDiv.innerHTML + '<br>❌ Site is NOT served over HTTPS (required for PWA)');
  }

  // Check for web app manifest
  const manifestLink = document.querySelector('link[rel="manifest"]');
  if (manifestLink) {
    updateStatus(statusDiv.innerHTML + '<br>✅ Web Manifest is linked');

    // Fetch and validate manifest
    fetch(manifestLink.href)
      .then(response => {
        if (response.ok) {
          return response.json();
        }
        throw new Error('Failed to load manifest');
      })
      .then(manifest => {
        // Check for required manifest properties
        const requiredProps = ['name', 'icons', 'start_url', 'display'];
        const missingProps = requiredProps.filter(prop => !manifest[prop]);

        if (missingProps.length === 0) {
          updateStatus(statusDiv.innerHTML + '<br>✅ Manifest contains all required properties');
        } else {
          updateStatus(statusDiv.innerHTML + `<br>❌ Manifest missing: ${missingProps.join(', ')}`);
        }
      })
      .catch(error => {
        updateStatus(statusDiv.innerHTML + `<br>❌ ${error.message}`);
      });
  } else {
    updateStatus(statusDiv.innerHTML + '<br>❌ Web Manifest is NOT linked');
  }

  // Check cache storage
  if ('caches' in window) {
    updateStatus(statusDiv.innerHTML + '<br>✅ Cache Storage API is supported');

    // Check if our cache exists
    caches.has('theravada-pwa-v1')
      .then(hasCache => {
        if (hasCache) {
          updateStatus(statusDiv.innerHTML + '<br>✅ App cache exists');
        } else {
          updateStatus(statusDiv.innerHTML + '<br>ℹ️ App cache not yet created');
        }
      });
  } else {
    updateStatus(statusDiv.innerHTML + '<br>❌ Cache Storage API is NOT supported');
  }

  // Listen for beforeinstallprompt event
  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the default install prompt
    e.preventDefault();

    // Store the event for later use
    deferredPrompt = e;
    updateStatus(statusDiv.innerHTML + '<br>✅ Install prompt available! You can install the app.');

    // Show the install button
    if (installBtn) {
      installBtn.style.display = 'block';

      // Install button click handler
      installBtn.addEventListener('click', async () => {
        // Hide the button
        installBtn.style.display = 'none';

        // Show the prompt
        deferredPrompt.prompt();

        // Wait for user choice
        const { outcome } = await deferredPrompt.userChoice;
        updateStatus(statusDiv.innerHTML + `<br>User response: ${outcome}`);
        console.log(`User response to the install prompt: ${outcome}`);

        // Clear the prompt
        deferredPrompt = null;
      });
    }
  });

  // Track installation
  window.addEventListener('appinstalled', () => {
    updateStatus(statusDiv.innerHTML + '<br>✅ App was successfully installed!');
    console.log('PWA was installed');
    if (installBtn) installBtn.style.display = 'none';
  });

  // Track display mode changes
  window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
    if (e.matches) {
      updateStatus(statusDiv.innerHTML + '<br>✅ Display mode changed to standalone');
    } else {
      updateStatus(statusDiv.innerHTML + '<br>ℹ️ Display mode changed from standalone');
    }
  });

  // Debug button click handler
  if (debugBtn) {
    debugBtn.addEventListener('click', () => {
      const debugInfo = {
        'Browser': navigator.userAgent,
        'Is Mobile': /Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent),
        'Protocol': window.location.protocol,
        'Has Service Worker API': 'serviceWorker' in navigator,
        'In Standalone Mode': isStandalone,
        'Install Prompt Available': !!deferredPrompt,
        'Install Button Visible': installBtn ? installBtn.style.display !== 'none' : false,
        'Cache API Available': 'caches' in window,
        'IndexedDB Available': 'indexedDB' in window,
        'Network Status': navigator.onLine ? 'Online' : 'Offline'
      };

      // Display as alert for easy visibility
      alert(Object.entries(debugInfo).map(([key, value]) => `${key}: ${value}`).join('\n'));
      console.table(debugInfo);
    });
  }

  // Network status monitoring
  function updateNetworkStatus() {
    if (navigator.onLine) {
      document.body.classList.remove('offline');
      if (statusDiv) {
        updateStatus(statusDiv.innerHTML + '<br>✅ You are online');
      }
    } else {
      document.body.classList.add('offline');
      if (statusDiv) {
        updateStatus(statusDiv.innerHTML + '<br>❌ You are offline');
      }
    }
  }

  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);

  // Initial check
  updateNetworkStatus();
});

// Add lazy loading to images and iframes
document.addEventListener('DOMContentLoaded', function() {
  // Find all images without explicit loading attributes
  const images = document.querySelectorAll('img:not([loading])');
  images.forEach(img => {
    img.setAttribute('loading', 'lazy');
  });

  // Find all iframes without explicit loading attributes
  const iframes = document.querySelectorAll('iframe:not([loading])');
  iframes.forEach(iframe => {
    iframe.setAttribute('loading', 'lazy');
  });
});

// Check for service worker updates periodically
function checkForUpdates() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then(registration => {
      if (registration) {
        registration.update();
      }
    });
  }
}

// Check for updates every hour
setInterval(checkForUpdates, 60 * 60 * 1000);
