// progress-window.js - Utility functions for creating and managing a progress window with Pico.css styling

const ProgressWindow = {
  // Create a progress window with text and a progress bar using Pico.css styling
  create: function(total) {
    // Create container with pico.css card styling
    const container = document.createElement("article");
    container.id = "progressWindow";
    container.classList.add("container");
    container.style.position = "fixed";
    container.style.top = "20px";
    container.style.right = "20px";
    container.style.maxWidth = "300px";
    container.style.zIndex = "10000";
    
    // Add header
    const header = document.createElement("header");
    const title = document.createElement("h5");
    title.textContent = "Loading Data";
    header.appendChild(title);
    container.appendChild(header);
    
    // Add progress text
    const text = document.createElement("p");
    text.id = "progressText";
    text.textContent = `Loading language files: 0/${total}`;
    container.appendChild(text);
    
    // Add progress bar with pico.css styling
    const progressBar = document.createElement("progress");
    progressBar.id = "progressBar";
    progressBar.max = total;
    progressBar.value = 0;
    container.appendChild(progressBar);
    
    document.body.appendChild(container);
  },

  // Update the progress window
  update: function(current, total) {
    const text = document.getElementById("progressText");
    if (text) {
      text.textContent = `Loading language files: ${current}/${total}`;
    }
    const progressBar = document.getElementById("progressBar");
    if (progressBar) {
      progressBar.value = current;
    }
  },

  // Close/remove the progress window with a fade-out effect
  close: function() {
    const progressWindow = document.getElementById("progressWindow");
    if (progressWindow) {
      progressWindow.style.transition = "opacity 0.5s ease-out";
      progressWindow.style.opacity = "0";
      setTimeout(() => {
        if (progressWindow.parentNode) {
          progressWindow.parentNode.removeChild(progressWindow);
        }
      }, 500);
    }
  }
};
