document.addEventListener('DOMContentLoaded', function() {
// Get all translator toggle checkboxes
const toggles = document.querySelectorAll('.toggle-input');

// Load saved preferences when page loads
toggles.forEach(toggle => {
  const translatorCode = toggle.id.replace('toggle-', '');
  const savedState = localStorage.getItem(`translator-${translatorCode}`);

  // If there's a saved preference, apply it
  if (savedState !== null) {
    toggle.checked = savedState === 'true';
  }
});

// Save preferences whenever a toggle changes
toggles.forEach(toggle => {
  toggle.addEventListener('change', function() {
    const translatorCode = this.id.replace('toggle-', '');
    localStorage.setItem(`translator-${translatorCode}`, this.checked);
  });
});
});
