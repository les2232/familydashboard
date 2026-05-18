// script.js

// Constants
const REFRESH_INTERVALS = {
  weather: 10 * 60 * 1000, // 10 minutes
  calendar: 5 * 60 * 1000, // 5 minutes
  tasks: 3 * 60 * 1000     // 3 minutes
};

const STALE_THRESHOLDS = {
  weather: 15 * 60 * 1000, // 15 minutes
  calendar: 10 * 60 * 1000, // 10 minutes
  tasks: 5 * 60 * 1000     // 5 minutes
};

const MAX_RETRIES = 3;

// Widget states
const widgetStates = {
  weather: { lastUpdate: null, isLoading: false, isUpdating: false, error: null, data: null, source: 'unknown' },
  calendar: { lastUpdate: null, isLoading: false, isUpdating: false, error: null, data: null, source: 'unknown' },
  tasks: { lastUpdate: null, isLoading: false, isUpdating: false, error: null, data: null, source: 'unknown' }
};

// ======================================
// FOCUS MODE - ADHD-FRIENDLY FEATURE
// ======================================

// Initialize Focus Mode from localStorage
function initializeFocusMode() {
  const focusMode = localStorage.getItem('dashboardFocusMode') === 'true';
  if (focusMode) {
    document.body.classList.add('focus-mode');
  }
}

// Toggle Focus Mode
function toggleFocusMode() {
  const isCurrentlyActive = document.body.classList.contains('focus-mode');
  
  if (isCurrentlyActive) {
    document.body.classList.remove('focus-mode');
    localStorage.setItem('dashboardFocusMode', 'false');
  } else {
    document.body.classList.add('focus-mode');
    localStorage.setItem('dashboardFocusMode', 'true');
  }
}

// ======================================
function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

// Helper: check if data is stale
function isStale(widget, timestamp) {
  if (!timestamp) return false;
  const now = Date.now();
  const updateTime = new Date(timestamp).getTime();
  return (now - updateTime) > STALE_THRESHOLDS[widget];
}

// Helper: set widget state
function setWidgetState(widgetEl, state, content = '', lastUpdated = null, isUpdating = false, source = 'unknown') {
  const contentEl = widgetEl.querySelector('.card-content');
  const statusEl = widgetEl.querySelector('.status-indicator');
  const sourceEl = widgetEl.querySelector('.source-indicator');
  const updatedEl = widgetEl.querySelector('.last-updated');

  let statusClass = 'status-online';
  let updateText = '';

  if (state === 'loading') {
    if (!isUpdating) contentEl.innerHTML = '<em>Loading…</em>';
    statusClass = 'status-loading';
  } else if (state === 'updating') {
    // Keep existing content, add subtle indicator
    statusClass = 'status-updating';
    updateText = lastUpdated ? `Updated ${formatRelativeTime(lastUpdated)}` : '';
  } else if (state === 'error') {
    if (!isUpdating) contentEl.innerHTML = `<div class="error">${content}</div>`;
    statusClass = 'status-error';
  } else if (state === 'empty') {
    if (!isUpdating) contentEl.innerHTML = `<div class="empty">${content}</div>`;
    statusClass = 'status-online';
    updateText = lastUpdated ? `Updated ${formatRelativeTime(lastUpdated)}` : '';
  } else if (state === 'success') {
    if (!isUpdating) {
      if (content instanceof Node) {
        contentEl.replaceChildren(content);
      } else {
        contentEl.innerHTML = content;
      }
    }
    statusClass = isStale(widgetEl.classList[1].replace('-card', ''), lastUpdated) ? 'status-stale' : 'status-online';
    updateText = lastUpdated ? `Updated ${formatRelativeTime(lastUpdated)}` : '';
  }

  statusEl.className = `status-indicator ${statusClass}`;
  if (sourceEl) sourceEl.className = `source-indicator source-${source}`;
  if (sourceEl) sourceEl.textContent = source.toUpperCase();
  if (updatedEl) updatedEl.textContent = updateText;
}

// Helper: fetch with retry and backoff
async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      throw new Error(`HTTP ${res.status}`);
    } catch (error) {
      if (i === retries - 1) throw error;
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, i) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

function renderCalendarContent(items = []) {
  const container = document.createElement('div');

  const today = new Date();
  const dateEl = document.createElement('div');
  dateEl.className = 'calendar-date';

  const dayEl = document.createElement('span');
  dayEl.className = 'calendar-day';
  dayEl.textContent = String(today.getDate());

  const monthEl = document.createElement('span');
  monthEl.className = 'calendar-month';
  monthEl.textContent = today.toLocaleString('default', { month: 'long', year: 'numeric' });

  dateEl.append(dayEl, monthEl);

  const eventsEl = document.createElement('div');
  eventsEl.className = 'calendar-events';

  if (!items.length) {
    const emptyEl = document.createElement('div');
    emptyEl.textContent = 'No events today.';
    eventsEl.append(emptyEl);
  } else {
    items.forEach(ev => {
      const itemEl = document.createElement('div');
      itemEl.className = 'event-item';

      const timeEl = document.createElement('div');
      timeEl.className = 'event-time';
      if (ev.start?.dateTime) {
        const dt = new Date(ev.start.dateTime);
        timeEl.textContent = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        timeEl.textContent = 'All day';
      }

      const titleEl = document.createElement('div');
      titleEl.className = 'event-title';
      titleEl.textContent = ev.summary || 'Untitled event';

      itemEl.append(timeEl, titleEl);
      eventsEl.append(itemEl);
    });
  }

  container.append(dateEl, eventsEl);
  return container;
}

function renderTasksContent(headers = [], tasks = []) {
  const safeHeaders = Array.isArray(headers) ? headers : [];
  const importantHeaders = ['status', 'description', 'category'];
  const filteredHeaders = importantHeaders.filter(h => safeHeaders.includes(h));

  if (!Array.isArray(tasks) || tasks.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'empty';
    emptyEl.textContent = 'No tasks available.';
    return emptyEl;
  }

  const listEl = document.createElement('div');
  listEl.className = 'tasks-list';

  tasks.forEach(task => {
    if (!filteredHeaders.some(header => String(task[header] ?? '').trim() !== '')) {
      return;
    }

    const itemEl = document.createElement('div');
    itemEl.className = 'task-item';

    const descriptionEl = document.createElement('div');
    descriptionEl.className = 'task-description';
    descriptionEl.textContent = task.description || '';

    const metaEl = document.createElement('div');
    metaEl.className = 'task-meta';

    if (task.status) {
      const statusEl = document.createElement('span');
      statusEl.className = `badge status-${String(task.status).toLowerCase()}`;
      statusEl.textContent = task.status;
      metaEl.append(statusEl);
    }

    if (task.category) {
      const categoryEl = document.createElement('span');
      categoryEl.className = 'badge category';
      categoryEl.textContent = task.category;
      metaEl.append(categoryEl);
    }

    itemEl.append(descriptionEl, metaEl);
    listEl.append(itemEl);
  });

  return listEl;
}

// Helper: generic widget loader
async function loadWidget(widget, fetchFn, isRefresh = false) {
  const state = widgetStates[widget];
  if (state.isLoading || state.isUpdating) return; // Prevent overlapping

  const widgetEl = document.querySelector(`.${widget}-card`);
  if (!widgetEl) return;

  state.isLoading = !isRefresh;
  state.isUpdating = isRefresh;

  try {
    setWidgetState(widgetEl, isRefresh ? 'updating' : 'loading', '', state.lastUpdate, isRefresh, state.source);

    const response = await fetchFn();
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Request failed');
    }

    // Process data based on widget
    let content = '';
    if (widget === 'weather') {
      const temp = Math.round(data.data.main.temp);
      const location = data.data.name;
      const description = `${data.data.weather[0].main} • ${data.data.weather[0].description}`;
      content = `
        <div class="weather-info">
          <div class="weather-temp">${temp}°</div>
          <div>
            <div class="weather-location">${location}</div>
            <div class="weather-description">${description}</div>
          </div>
        </div>
      `;
    } else if (widget === 'calendar') {
      content = renderCalendarContent(data.data?.items || []);
    } else if (widget === 'tasks') {
      const { headers, tasks } = data.data || {};
      content = renderTasksContent(headers, tasks);
    }

    state.lastUpdate = data.timestamp;
    state.error = null;
    state.data = data; // Store the data
    state.source = data.source || 'unknown'; // Store the source
    setWidgetState(widgetEl, 'success', content, data.timestamp, false, state.source);

    // Update glance after any widget update
    updateGlance();

  } catch (error) {
    console.error(`${widget} load error:`, error);
    state.error = error.message;
    setWidgetState(widgetEl, 'error', 'Failed to load data', state.lastUpdate, isRefresh, 'error');
  } finally {
    state.isLoading = false;
    state.isUpdating = false;
  }
}

// Specific loaders
function loadWeather(isRefresh = false) {
  return loadWidget('weather', () => fetchWithRetry(`/api/weather?city=Aurora,CO,US&_=${Date.now()}`), isRefresh);
}

function loadCalendar(isRefresh = false) {
  const dateStr = new Date().toISOString().slice(0, 10);
  return loadWidget('calendar', () => fetchWithRetry(`/api/calendar?date=${dateStr}&_=${Date.now()}`), isRefresh);
}

function loadTasks(isRefresh = false) {
  return loadWidget('tasks', () => fetchWithRetry(`/api/tasks?_= ${Date.now()}`), isRefresh);
}

// Daily Brief state
const briefState = {
  lastUpdate: null,
  isLoading: false,
  isUpdating: false,
  error: null,
  data: null,
  source: 'unknown',
  cachedSummary: null,
  cacheExpiry: null
};

const BRIEF_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Load Daily Brief
async function loadBrief(isRefresh = false) {
  const widgetEl = document.querySelector('.brief-card');
  if (!widgetEl) return;

  // Check if we have fresh cache
  if (!isRefresh && briefState.cachedSummary && briefState.cacheExpiry && Date.now() < briefState.cacheExpiry) {
    // Use cached summary, but still show it with proper state
    const contentEl = widgetEl.querySelector('.brief-text');
    contentEl.textContent = briefState.cachedSummary;
    setWidgetState(widgetEl, 'success', '', briefState.lastUpdate, false, briefState.source);
    return;
  }

  if (briefState.isLoading || briefState.isUpdating) return; // Prevent overlapping

  briefState.isLoading = !isRefresh;
  briefState.isUpdating = isRefresh;

  try {
    setWidgetState(widgetEl, isRefresh ? 'updating' : 'loading', '', briefState.lastUpdate, isRefresh, briefState.source);

    const response = await fetchWithRetry(`/api/summary?_=${Date.now()}`);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Request failed');
    }

    briefState.lastUpdate = data.data.timestamp;
    briefState.error = null;
    briefState.data = data.data;
    briefState.source = data.source || 'unknown';
    briefState.cachedSummary = data.data.summary;
    briefState.cacheExpiry = Date.now() + BRIEF_CACHE_TTL;

    setWidgetState(widgetEl, 'success', '<div class="brief-text"></div>', data.data.timestamp, false, data.source);
    const contentEl = widgetEl.querySelector('.brief-text');
    contentEl.textContent = data.data.summary;

  } catch (error) {
    console.error('Brief load error:', error);
    briefState.error = error.message;
    setWidgetState(widgetEl, 'error', 'Failed to generate summary', briefState.lastUpdate, isRefresh, 'error');
  } finally {
    briefState.isLoading = false;
    briefState.isUpdating = false;
  }
}

// Helper: get active tasks count
function getActiveTasksCount(tasks) {
  if (!tasks) return 0;
  return tasks.filter(task => {
    const status = (task.status || '').toLowerCase();
    return status !== 'done' && status !== 'completed';
  }).length;
}

// Helper: get next event
function getNextEvent(items) {
  if (!items || items.length === 0) return null;
  const now = new Date();
  const upcoming = items.filter(event => {
    const start = new Date(event.start.dateTime || event.start.date);
    return start > now;
  }).sort((a, b) => {
    const aTime = new Date(a.start.dateTime || a.start.date);
    const bTime = new Date(b.start.dateTime || b.start.date);
    return aTime - bTime;
  });
  return upcoming[0] || null;
}

// Helper: check if weather affects plans
function weatherAffectsPlans(weather) {
  if (!weather) return false;
  const main = weather.weather?.[0]?.main?.toLowerCase();
  const temp = weather.main?.temp;
  return main === 'rain' || main === 'snow' || main === 'storm' || temp < 32 || temp > 90;
}

// Helper: generate summary text
function generateSummaryText(eventCount, activeTasks, nextEvent, weatherAffects) {
  const hasEvents = eventCount > 0;
  const hasTasks = activeTasks > 0;
  const busyEvents = eventCount >= 3;
  const busyTasks = activeTasks >= 4;
  const nextSoon = nextEvent && (new Date(nextEvent.start.dateTime || nextEvent.start.date) - new Date()) < 2 * 60 * 60 * 1000; // 2 hours

  if (busyEvents && busyTasks) {
    return `Busy day: ${eventCount} events and ${activeTasks} active tasks`;
  } else if (busyEvents) {
    return `Event-heavy day with ${eventCount} scheduled activities`;
  } else if (busyTasks) {
    return `Task-focused day with ${activeTasks} items still open`;
  } else if (hasEvents && hasTasks) {
    return `Balanced day: ${eventCount} event${eventCount > 1 ? 's' : ''} and ${activeTasks} active task${activeTasks > 1 ? 's' : ''}`;
  } else if (hasEvents) {
    return `Light schedule with ${eventCount} event${eventCount > 1 ? 's' : ''} today`;
  } else if (hasTasks) {
    return `Clear schedule so far, but ${activeTasks} task${activeTasks > 1 ? 's' : ''} need${activeTasks === 1 ? 's' : ''} attention`;
  } else {
    return `Free day with no events or pending tasks`;
  }
}

// Helper: generate badges
function generateBadges(eventCount, activeTasks, nextEvent, weatherAffects) {
  const badges = [];
  const nextSoon = nextEvent && (new Date(nextEvent.start.dateTime || nextEvent.start.date) - new Date()) < 2 * 60 * 60 * 1000;

  if (nextSoon) badges.push('Next event soon');
  if (eventCount === 0) badges.push('No events today');
  if (activeTasks >= 4) badges.push('Task-heavy day');
  if (weatherAffects) badges.push('Weather may affect plans');

  return badges;
}

// Update Today at a Glance
function updateGlance() {
  const weatherData = widgetStates.weather.data;
  const calendarData = widgetStates.calendar.data;
  const tasksData = widgetStates.tasks.data;

  const eventCount = calendarData?.data?.items?.length || 0;
  const activeTasks = getActiveTasksCount(tasksData?.data?.tasks);
  const nextEvent = getNextEvent(calendarData?.data?.items);
  const weatherAffects = weatherAffectsPlans(weatherData?.data);

  const summaryText = generateSummaryText(eventCount, activeTasks, nextEvent, weatherAffects);
  const badges = generateBadges(eventCount, activeTasks, nextEvent, weatherAffects);

  // Check for outdated data sources
  const sources = [widgetStates.weather.source, widgetStates.calendar.source, widgetStates.tasks.source];
  const hasStaleData = sources.some(source => source === 'fallback' || source === 'error');

  const widgetEl = document.querySelector('.glance-card');
  if (!widgetEl) return;

  const contentEl = widgetEl.querySelector('.glance-text');
  const badgesEl = widgetEl.querySelector('.glance-badges');
  const updatedEl = widgetEl.querySelector('.last-updated');

  let displayText = summaryText;
  if (hasStaleData) {
    displayText += ' (Some data may be outdated)';
  }

  contentEl.textContent = displayText;
  badgesEl.innerHTML = badges.map(badge => `<span class="badge">${badge}</span>`).join('');

  // Use the most recent update time
  const timestamps = [widgetStates.weather.lastUpdate, widgetStates.calendar.lastUpdate, widgetStates.tasks.lastUpdate].filter(Boolean);
  const latestUpdate = timestamps.length > 0 ? new Date(Math.max(...timestamps.map(t => new Date(t)))) : null;

  if (updatedEl && latestUpdate) {
    updatedEl.textContent = `Updated ${formatRelativeTime(latestUpdate.toISOString())}`;
  }

  // Set status based on data availability
  const statusEl = widgetEl.querySelector('.status-indicator');
  const hasData = weatherData || calendarData || tasksData;
  statusEl.className = `status-indicator ${hasData ? 'status-online' : 'status-loading'}`;
}

// Send prompt to AI Assistant
async function askChatGPT(prompt) {
  const resEl = document.getElementById('chatResponse');
  resEl.textContent = 'Thinking…';
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    const data = await res.json();
    resEl.textContent = data.reply || data.error || 'No response.';
  } catch (err) {
    console.error('Chat error:', err);
    resEl.textContent = 'Failed to run assistant.';
  }
}

// Update header time
function updateTime() {
  const timeEl = document.getElementById('current-time');
  const dateEl = document.getElementById('current-date');
  const now = new Date();
  timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// Check for stale data and update indicators
function checkStaleData() {
  Object.keys(widgetStates).forEach(widget => {
    const state = widgetStates[widget];
    if (state.lastUpdate && isStale(widget, state.lastUpdate)) {
      const widgetEl = document.querySelector(`.${widget}-card`);
      if (widgetEl) {
        const statusEl = widgetEl.querySelector('.status-indicator');
        statusEl.className = 'status-indicator status-stale';
      }
    }
  });
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  // Initialize Focus Mode first
  initializeFocusMode();
  
  // Set up Focus Mode toggle
  const focusToggle = document.getElementById('focus-toggle');
  if (focusToggle) {
    focusToggle.addEventListener('click', toggleFocusMode);
  }
  
  updateTime();
  setInterval(updateTime, 60000); // Update every minute
  setInterval(checkStaleData, 60000); // Check stale every minute

  // Initial load
  loadWeather();
  setTimeout(() => loadCalendar(), 1000); // Stagger by 1s
  setTimeout(() => loadTasks(), 2000); // Stagger by 2s
  setTimeout(() => loadBrief(), 2500); // Stagger by 2.5s

  // Auto-refresh with different intervals
  setInterval(() => loadWeather(true), REFRESH_INTERVALS.weather);
  setTimeout(() => {
    setInterval(() => loadCalendar(true), REFRESH_INTERVALS.calendar);
  }, 1000);
  setTimeout(() => {
    setInterval(() => loadTasks(true), REFRESH_INTERVALS.tasks);
  }, 2000);
  setTimeout(() => {
    setInterval(() => loadBrief(true), 10 * 60 * 1000); // Refresh every 10 minutes
  }, 2500);

  // Chat functionality (unchanged)
  const chatInput = document.getElementById('chatInput');
  const chatSubmit = document.getElementById('chatSubmit');
  chatSubmit.addEventListener('click', () => {
    const input = chatInput.value.trim();
    if (input) askChatGPT(input);
  });
  chatInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const input = chatInput.value.trim();
      if (input) askChatGPT(input);
    }
  });
});
