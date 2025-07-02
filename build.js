const fs = require('fs');
const path = require('path');

/**
 * Inserts a new section into an HTML file at a specified marker.
 * @param {string} htmlPath - Absolute path to the HTML file.
 * @param {string} newSection - HTML snippet to inject.
 * @param {string} marker - Unique comment marker in HTML to locate injection point.
 */
function injectFeature(htmlPath, newSection, marker) {
  let html;
  try {
    html = fs.readFileSync(htmlPath, 'utf8');
  } catch (err) {
    console.error(`Failed to read file at ${htmlPath}:`, err);
    return;
  }

  const parts = html.split(marker);
  if (parts.length !== 2) {
    console.error("Marker not found or found more than once!");
    return;
  }

  const updated = parts[0] + marker + '\n' + newSection + '\n' + parts[1];
  try {
    fs.writeFileSync(htmlPath, updated, 'utf8');
    console.log("Dashboard updated with new section.");
  } catch (err) {
    console.error(`Failed to write updated HTML to ${htmlPath}:`, err);
  }
}

// The snippet including the `showPrompt()` helper
const stuckSection = `
<!-- STUCK PROMPT -->
<section class="stuck-helper">
  <h2>🌀 I Feel Stuck</h2>
  <button onclick="showPrompt()">Give me a nudge</button>
  <p id="stuckPrompt">Tap the button when you need a boost.</p>
</section>
<script>
  function showPrompt() {
    const tips = [
      "Take three deep breaths.",
      "Stand up and stretch.",
      "Write one small goal down."
    ];
    const idx = Math.floor(Math.random() * tips.length);
    document.getElementById('stuckPrompt').textContent = tips[idx];
  }
</script>
`;

// Resolve the absolute path to your HTML file (adjust 'public' folder if yours differs)
const htmlPath = path.resolve(__dirname, 'public', 'index.html');
const marker = '<!-- INSERT HERE -->';

// Perform the injection
injectFeature(htmlPath, stuckSection, marker);
