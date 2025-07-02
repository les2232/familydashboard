import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { Client } from '@notionhq/client';
import fs from 'fs';
import { DateTime } from 'luxon';
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const NOTION_DB_ID = process.env.NOTION_DB_ID;

// Initialize OpenAI client
let openai = null;

// Dynamic import for node-fetch
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// 🧩 Function dispatcher for tool calls
async function functionDispatcher({ name, arguments: args }) {
  console.log(`🔧 Function called: ${name} with args:`, args);
  try {
    const parsedArgs = JSON.parse(args || '{}');
    switch (name) {
      case 'getWeather':
      case 'get_weather':
        return await getWeather(parsedArgs);

      case 'getCalendarEvents':
      case 'get_calendar_events':
      case 'getCalendar':
      case 'get_calendar':
        // ← UPDATED: call getCalendarEvents instead of getCalendar
        return await getCalendarEvents(parsedArgs);

      case 'getNotionTasks':
      case 'get_notion_tasks':
      case 'getTasks':
      case 'get_tasks':
        return await getNotionTasks();

      default:
        throw new Error(`Unknown function: ${name}`);
    }
  } catch (error) {
    console.error(`Function dispatcher error for ${name}:`, error);
    return { error: `Failed to execute ${name}: ${error.message}` };
  }
}


// Helper: getWeather
async function getWeather({ city = 'Denver' } = {}) {
  const key = process.env.WEATHER_API_KEY;
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&units=imperial&appid=${key}`;
  const res = await fetch(url);
  return res.json();
}

// Helper: getCalendarEvents (accepts an optional `{ date }`)
async function getCalendarEvents({ date } = {}) {
  console.log('▶️ getCalendarEvents called with date:', date);

  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const apiKey     = process.env.GOOGLE_API_KEY;
  const timeZone   = 'America/Denver';

  // Use Luxon for all date handling
  const target = date
    ? DateTime.fromISO(date, { zone: timeZone })
    : DateTime.now().setZone(timeZone);

  const timeMin = target.startOf('day').toISO({ suppressMilliseconds: true, includeOffset: true });
  const timeMax = target.endOf('day').toISO({ suppressMilliseconds: true, includeOffset: true });

  const url = [
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    `?timeMin=${timeMin}`,
    `&timeMax=${timeMax}`,
    `&timeZone=${encodeURIComponent(timeZone)}`,
    `&singleEvents=true&orderBy=startTime`,
    `&key=${apiKey}`
  ].join('');

  console.log('🔗 Fetching URL:', url);

  const res  = await fetch(url);
  const data = await res.json();

  console.log('📥 Google Calendar API raw response:', JSON.stringify(data, null, 2));

  if (data.error) {
    console.error('Calendar API returned error:', data.error);
    return { date: target.toISODate(), items: [], error: data.error.message };
  }
  if (!data.items?.length) {
    console.log('ℹ️ No events found for this date.');
    return { date: target.toISODate(), items: [] };
  }

  // Only include events whose start date matches the target date (local time)
  const targetDateStr = target.toISODate(); // 'YYYY-MM-DD'
  const items = data.items.filter(ev => {
    if (ev.start.dateTime) {
      const eventDate = DateTime.fromISO(ev.start.dateTime, { zone: timeZone });
      return eventDate.toISODate() === targetDateStr;
    } else if (ev.start.date) {
      return ev.start.date === targetDateStr;
    }
    return false;
  }).map(ev => ({
    start: ev.start,
    summary: ev.summary
  }));

  console.log('✅ Processed calendar items:', JSON.stringify(items, null, 2));
  return {
    date: targetDateStr,
    items
  };
}


// Helper: getNotionTasks
async function getNotionTasks() {
  const data = await notion.databases.query({ database_id: NOTION_DB_ID });
  const allHeaders = new Set();
  data.results.forEach(p => Object.keys(p.properties).forEach(k => allHeaders.add(k)));
  const headers = Array.from(allHeaders);
  const tasks = data.results.map(p => {
    const row = {};
    headers.forEach(header => {
      const prop = p.properties[header];
      row[header] = prop ? (
        prop.type === 'title' ? prop.title.map(t=>t.plain_text).join(' ') :
        prop.type === 'rich_text' ? prop.rich_text.map(t=>t.plain_text).join(' ') :
        prop.type === 'select' ? prop.select?.name || '' :
        prop.type === 'multi_select' ? prop.multi_select.map(s=>s.name).join(', ') :
        prop.type === 'checkbox' ? (prop.checkbox ? 'Yes':'No') :
        prop.type === 'date' ? prop.date?.start || '' :
        prop.type === 'number' ? prop.number??'' :
        prop.type === 'people' ? prop.people.map(p=>p.name||p.id).join(', ') :
        prop.type === 'email' ? prop.email||'' :
        prop.type === 'phone_number' ? prop.phone_number||'' :
        prop.type === 'url' ? prop.url||'' :
        prop.type === 'status' ? prop.status?.name||'' : ''
      ) : '';
    });
    return row;
  });
  return { headers, tasks };
}

// 🌤️ Weather endpoint
app.get('/api/weather', async (req, res) => {
  try {
    const city = req.query.city || 'Denver';
    const weather = await getWeather({ city });
    res.json(weather);
  } catch (error) {
    console.error('Weather API error:', error);
    res.status(500).json({ error: 'Failed to fetch weather data' });
  }
});

// 📅 Calendar endpoint (now uses getCalendarEvents)
app.get('/api/calendar', async (req, res) => {
  try {
    // Optional: allow a ?date=YYYY-MM-DD query
    const date = req.query.date;  

    // Call your new helper instead of the old one
    const calendar = await getCalendarEvents({ date });
    res.json(calendar);
  } catch (error) {
    console.error('Calendar API error:', error);
    res.status(500).json({ error: 'Failed to fetch calendar data' });
  }
});


// ✅ Notion tasks endpoint
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await getNotionTasks();
    res.json(tasks);
  } catch (error) {
    console.error('Notion API error:', error);
    res.status(500).json({ error: 'Failed to fetch tasks data' });
  }
});

// 🧠 Chat endpoint: supports function-calling with tools (updated API)
app.post('/api/chat', async (req, res) => {
  try {
    const prompt = req.body.prompt || req.body.message;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OpenAI API key not configured' });
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    // Define available tools (updated format)
    const tools = [
      {
        type: "function",
        function: {
          name: 'getWeather',
          description: 'Get current weather for a city',
          parameters: { 
            type: 'object', 
            properties: { 
              city: { type: 'string', description: 'City name, e.g., Denver' } 
            }, 
            required: ['city'] 
          }
        }
      },
      {
        type: "function", 
        function: {
          name: 'getCalendarEvents',
          description: 'Fetch upcoming calendar events for today',
          parameters: { type: 'object', properties: {}, required: [] }
        }
      },
      {
        type: "function",
        function: {
          name: 'getNotionTasks', 
          description: 'Retrieve tasks from Notion database',
          parameters: { type: 'object', properties: {}, required: [] }
        }
      }
    ];

    // First pass: ask model with tools
    let response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', 
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${apiKey}` 
      },
      body: JSON.stringify({ 
        model: 'gpt-3.5-turbo', 
        messages: [{ role: 'user', content: prompt }], 
        tools: tools,
        tool_choice: 'auto'
      })
    });
    
    let data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: 'OpenAI API error', details: data });

    const msg = data.choices[0].message;
    
    // Check if the model wants to call a tool
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      // Execute the function calls
      const toolResults = await Promise.all(
        msg.tool_calls.map(async (toolCall) => {
          const result = await functionDispatcher({
            name: toolCall.function.name,
            arguments: toolCall.function.arguments
          });
          return {
            tool_call_id: toolCall.id,
            role: 'tool',
            content: JSON.stringify(result)
          };
        })
      );

      // Second pass: provide function results
      const followup = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', 
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}` 
        }, 
        body: JSON.stringify({ 
          model: 'gpt-3.5-turbo', 
          messages: [
            { role: 'user', content: prompt },
            msg,
            ...toolResults
          ]
        })
      });
      
      const finalData = await followup.json();
      
      // Return in a format that matches what your frontend expects
      return res.json({
        reply: finalData.choices[0].message.content,
        usage: finalData.usage
      });
    }

    // No function call - return the direct response
    res.json({
      reply: msg.content,
      usage: data.usage
    });
    
  } catch (error) {
    console.error('Chat endpoint error:', error);
    res.status(500).json({ error: 'Chat request failed', details: error.message });
  }
});

// Define functions array for OpenAI assistant
const assistantFunctions = [
  {
    type: "function",
    function: {
      name: "getCalendarEvents",
      description: "Get calendar events for a given day.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Target date in YYYY-MM-DD format (defaults to today)"
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getWeather",
      description: "Get current weather for a city",
      parameters: {
        type: "object",
        properties: {
          city: {
            type: "string",
            description: "City name, e.g., Denver"
          }
        },
        required: ["city"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getNotionTasks",
      description: "Retrieve tasks from Notion database",
      parameters: {
        type: "object",
          properties: {
          date: {
          type: "string",
          description: "Target date in YYYY-MM-DD format (defaults to today)"
          }
        },
        // No required parameters for this function
        required: []
      }
    }
  }
];

// 🔍 Fixed Assistant Endpoint - Compatible with different OpenAI versions
app.post('/assistant/run', async (req, res) => {
  if (!openai) {
    return res.status(503).json({ error: "OpenAI not initialized yet. Please try again in a moment." });
  }
  
  try {
    const assistantId = process.env.OPENAI_ASSISTANT_ID;
    const userInput = req.body.prompt;

    if (!assistantId) {
      return res.status(500).json({ error: "OpenAI Assistant ID not configured" });
    }

    if (!userInput) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    // Check if we're using the beta API or the regular API
    const threadsAPI = openai.beta?.threads || openai.threads;
    
    if (!threadsAPI) {
      return res.status(500).json({ 
        error: "OpenAI Threads API not available", 
        details: "Please ensure you're using a compatible OpenAI client version" 
      });
    }

    // Create a new thread for this conversation
    const thread = await threadsAPI.create();
    console.log(`Created thread: ${thread.id}`);

    // Add the user's message to the thread
    await threadsAPI.messages.create(thread.id, {
      role: "user",
      content: userInput
    });

    // Create and run the assistant
    let run = await threadsAPI.runs.create(thread.id, {
      assistant_id: assistantId,
      tools: assistantFunctions
    });

    console.log(`Created run: ${run.id} with status: ${run.status}`);

    // Wait for the run to complete
    while (["in_progress", "queued"].includes(run.status)) {
      await new Promise(r => setTimeout(r, 1000));
      run = await threadsAPI.runs.retrieve(thread.id, run.id);
      console.log(`Run status: ${run.status}`);
    }

    // Handle function calls if required
    if (run.status === "requires_action") {
      console.log("Run requires action - processing tool calls");
      const toolCalls = run.required_action.submit_tool_outputs.tool_calls;
      
      const toolOutputs = await Promise.all(
        toolCalls.map(async (call) => {
          console.log(`Processing tool call: ${call.function.name}`);
          try {
            const result = await functionDispatcher({
              name: call.function.name,
              arguments: call.function.arguments
            });
            
            return {
              tool_call_id: call.id,
              output: JSON.stringify(result)
            };
          } catch (error) {
            console.error(`Tool call error for ${call.function.name}:`, error);
            return {
              tool_call_id: call.id,
              output: JSON.stringify({ error: error.message })
            };
          }
        })
      );

      // Submit tool outputs
      await threadsAPI.runs.submitToolOutputs(thread.id, run.id, {
        tool_outputs: toolOutputs
      });

      // Wait for the run to complete after submitting tool outputs
      do {
        await new Promise(r => setTimeout(r, 1000));
        run = await threadsAPI.runs.retrieve(thread.id, run.id);
        console.log(`Run status after tool outputs: ${run.status}`);
      } while (["in_progress", "queued"].includes(run.status));
    }

    if (run.status === "failed") {
      console.error("Run failed:", run.last_error);
      return res.status(500).json({ 
        error: "Assistant run failed", 
        details: run.last_error?.message || "Unknown error"
      });
    }

    // Get the assistant's response
    const messages = await threadsAPI.messages.list(thread.id);
    const lastAssistantMessage = messages.data.find(message => message.role === "assistant");
    
    if (!lastAssistantMessage) {
      return res.status(500).json({ error: "No response from assistant" });
    }

    const reply = lastAssistantMessage.content[0]?.text?.value || "No response available";
    
    res.json({ reply });

  } catch (error) {
    console.error('Assistant endpoint error:', error);
    res.status(500).json({ 
      error: "Assistant run failed", 
      details: error.message,
      stack: error.stack
    });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ status:'ok', timestamp:new Date().toISOString(), openaiInitialized:!!openai }));

// Test page
app.get('/test', (req, res) => res.sendFile(__dirname + '/test.html'));

// 🧠 Initialize OpenAI and start server
(async () => {
  try {
    const { default: OpenAI } = await import('openai');
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log('OpenAI client initialized successfully');
    
    // Debug: Check what's available in the OpenAI client
    console.log('OpenAI client properties:', Object.keys(openai));
    console.log('Has beta:', !!openai.beta);
    console.log('Has threads:', !!openai.threads);
    if (openai.beta) {
      console.log('Beta properties:', Object.keys(openai.beta));
    }
    
    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (error) {
    console.error('Server startup failed:', error);
    process.exit(1);
  }
})();