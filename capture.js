const form = document.getElementById('captureForm');
const textInput = document.getElementById('captureText');
const submitButton = document.getElementById('captureSubmit');
const statusEl = document.getElementById('captureStatus');
const typeButtons = [...document.querySelectorAll('.type-option')];
const quickActionButtons = [...document.querySelectorAll('.quick-action')];

const state = {
  type: 'task',
  dueLabel: null,
  priority: null
};

function setStatus(message = '', status = '') {
  statusEl.textContent = message;
  statusEl.className = `capture-status${status ? ` is-${status}` : ''}`;
}

function updateTypeButtons() {
  typeButtons.forEach(button => {
    const isActive = button.dataset.type === state.type;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function updateQuickActions() {
  quickActionButtons.forEach(button => {
    const action = button.dataset.action;
    const value = button.dataset.value;
    const isActive = state[action] === value;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

async function submitCapture(event) {
  event.preventDefault();

  const text = textInput.value.trim();
  if (!text) {
    setStatus('Add a quick note before saving.', 'error');
    textInput.focus();
    return;
  }

  submitButton.disabled = true;
  setStatus('Saving...');

  try {
    const response = await fetch('/api/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        type: state.type,
        dueLabel: state.dueLabel,
        priority: state.priority === 'high'
      })
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Unable to save capture');
    }

    form.reset();
    state.type = 'task';
    state.dueLabel = null;
    state.priority = null;
    updateTypeButtons();
    updateQuickActions();
    setStatus('Saved. It will show up in the dashboard tasks list shortly.', 'success');
    textInput.focus();
  } catch (error) {
    console.error('Capture submit error:', error);
    setStatus(error.message || 'Unable to save capture right now.', 'error');
  } finally {
    submitButton.disabled = false;
  }
}

typeButtons.forEach(button => {
  button.addEventListener('click', () => {
    state.type = button.dataset.type;
    updateTypeButtons();
  });
});

quickActionButtons.forEach(button => {
  button.addEventListener('click', () => {
    const action = button.dataset.action;
    const value = button.dataset.value;
    state[action] = state[action] === value ? null : value;
    updateQuickActions();
  });
});

form.addEventListener('submit', submitCapture);
updateTypeButtons();
updateQuickActions();
textInput.focus();
