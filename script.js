// script.js

// Fetch and display weather
async function loadWeather(city = 'Aurora,CO,US') {
  const tempEl = document.querySelector('.weather-temp');
  const locEl = document.querySelector('.weather-location');
  const descEl = document.querySelector('.weather-description');
  try {
    const res = await fetch(`/api/weather?city=${encodeURIComponent(city)}&_=${Date.now()}`);
    const data = await res.json();
    if (data.cod && data.cod !== 200) {
      tempEl.textContent = '--';
      locEl.textContent = 'Failed to load';
      descEl.textContent = data.message ? `(${data.message})` : '';
      return;
    }
    tempEl.textContent = `${Math.round(data.main.temp)}°F`;
    locEl.textContent = data.name;
    descEl.textContent = `${data.weather[0].main} – ${data.weather[0].description}`;
  } catch (err) {
    tempEl.textContent = '--';
    locEl.textContent = 'Failed to load';
    descEl.textContent = '';
  }
}

// Fetch and display calendar events for today
async function loadCalendar() {
  const calendarEventsEl = document.querySelector('.calendar-events');
  const calendarDayEl = document.querySelector('.calendar-day');
  const calendarMonthEl = document.querySelector('.calendar-month');

  const today = new Date();
  calendarDayEl.textContent = today.getDate();
  calendarMonthEl.textContent = today.toLocaleString('default', {
    month: 'long',
    year: 'numeric'
  });

  calendarEventsEl.innerHTML = '<em>Loading events…</em>';
  try {
    const dateStr = today.toISOString().slice(0, 10);
    // Cache-busting to avoid 304 Not Modified
    const res = await fetch(`/api/calendar?date=${dateStr}&_=${Date.now()}`);
    const data = await res.json();

    if (Array.isArray(data.items)) {
      if (data.items.length === 0) {
        calendarEventsEl.innerHTML = '<div>No events today.</div>';
      } else {
        calendarEventsEl.innerHTML = data.items.map(ev => {
          const dt = new Date(ev.start.dateTime || ev.start.date);
          const time = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          return `
            <div class="event-item">
              <div class="event-time">${time}</div>
              <div class="event-title">${ev.summary}</div>
            </div>`;
        }).join('');
      }
    } else if (data.error) {
      calendarEventsEl.innerHTML = `<div>${data.error}</div>`;
    } else {
      calendarEventsEl.innerHTML = '<div>Failed to load events.</div>';
    }
  } catch (err) {
    console.error('Calendar fetch error:', err);
    calendarEventsEl.innerHTML = '<div>Failed to load events.</div>';
  }
}

// Fetch and display Notion tasks
async function loadNotionTasks() {
  const el = document.getElementById('notion-tasks');
  try {
    const res = await fetch(`/api/tasks?_= ${Date.now()}`);
    const { headers, tasks } = await res.json();
    // Only show these important columns in a specific order
    const importantHeaders = ['status', 'description', 'category'];
    const filteredHeaders = importantHeaders.filter(h => headers.includes(h));
    if (!Array.isArray(tasks) || tasks.length === 0) {
      el.textContent = 'No tasks available.';
    } else {
      // Render as a table with filtered headers
      let html = '<table><thead><tr>';
      for (const header of filteredHeaders) {
        html += `<th>${header}</th>`;
      }
      html += '</tr></thead><tbody>';
      for (const t of tasks) {
        // Only render if at least one important field is non-empty
        if (filteredHeaders.some(header => (t[header] ?? '').trim() !== '')) {
          html += '<tr>';
          for (const header of filteredHeaders) {
            html += `<td>${t[header] ?? ''}</td>`;
          }
          html += '</tr>';
        }
      }
      html += '</tbody></table>';
      el.innerHTML = html;
    }
  } catch (err) {
    el.textContent = 'Failed to load tasks.';
  }
}

// Send prompt to AI Assistant
async function askChatGPT(prompt) {
  const resEl = document.getElementById('chatResponse');
  resEl.textContent = 'Thinking…';
  try {
    const res = await fetch('http://localhost:4000/assistant/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    const data = await res.json();
    resEl.textContent = data.reply || 'No response.';
  } catch (err) {
    console.error('Chat error:', err);
    resEl.textContent = 'Failed to run assistant.';
  }
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  loadWeather('Aurora,CO,US');
  loadCalendar();
  loadNotionTasks();

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
