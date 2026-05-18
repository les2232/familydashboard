import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import express from 'express';
import cors from 'cors';
import { getWeather } from './services/weatherService.js';
import { getCalendarEvents } from './services/calendarService.js';
import { getTasks } from './services/tasksService.js';
import { interpolateTemplates } from './helpers/utils.js';
import weatherRouter from './routes/weather.js';
import calendarRouter from './routes/calendar.js';
import tasksRouter from './routes/tasks.js';
import summaryRouter from './routes/summary.js';
import captureRouter from './routes/capture.js';
import { env, logEnvironmentStatus } from './config/env.js';

const app = express();

// Initialize OpenAI client
let openai = null;

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4000',
  'http://127.0.0.1:4000'
];

function getAllowedOrigins() {
  const extraOrigins = (env.DASHBOARD_ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  return [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...extraOrigins])];
}

const allowedOrigins = getAllowedOrigins();

app.use(cors({
  origin(origin, callback) {
    // Allow same-origin requests, curl, and health checks that do not send an Origin header.
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    const error = new Error('Origin is not allowed by dashboard CORS policy');
    error.statusCode = 403;
    callback(error);
  }
}));
app.use(express.json({ limit: '32kb' }));
// Phase 2 keeps this beginner-friendly: Express serves the project root for local production-style use.
// Vite still serves the frontend separately during development.
app.use(express.static(__dirname));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Use route modules
app.use('/api', weatherRouter);
app.use('/api', calendarRouter);
app.use('/api', tasksRouter);
app.use('/api', summaryRouter);
app.use('/api', captureRouter);

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
        return await getCalendarEvents(parsedArgs);

      case 'getGoogleTasks':
      case 'get_google_tasks':
      case 'getTasks':
      case 'get_tasks':
        return await getTasks();

      default:
        throw new Error(`Unknown function: ${name}`);
    }
  } catch (error) {
    console.error(`Function dispatcher error for ${name}:`, error);
    return { error: `Failed to execute ${name}: ${error.message}` };
  }
}

// 🧠 Chat endpoint: supports function-calling with tools (updated API)
app.post('/api/chat', async (req, res) => {
  try {
    const prompt = req.body.prompt || req.body.message;
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'OpenAI chat is not configured. Add OPENAI_API_KEY to .env.' });
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
          name: 'getGoogleTasks',
          description: 'Retrieve tasks from Google Tasks',
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
    if (!response.ok) {
      console.error('OpenAI chat request failed:', data?.error?.message || response.status);
      return res.status(response.status).json({ error: 'OpenAI API error' });
    }

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
      if (!followup.ok) {
        console.error('OpenAI chat follow-up failed:', finalData?.error?.message || followup.status);
        return res.status(followup.status).json({ error: 'OpenAI API error' });
      }
      
      // Return in a format that matches what your frontend expects
      // Interpolate template variables before sending
      const variables = {
        current_date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      };
      const interpolatedReply = interpolateTemplates(finalData.choices[0].message.content, variables);
      return res.json({
        reply: interpolatedReply,
        usage: finalData.usage
      });
    }

    // No function call - return the direct response
    // Interpolate template variables before sending
    const variables = {
      current_date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    };
    const interpolatedReply = interpolateTemplates(msg.content, variables);
    res.json({
      reply: interpolatedReply,
      usage: data.usage
    });
    
  } catch (error) {
    console.error('Chat endpoint error:', error);
    res.status(500).json({ error: 'Chat request failed' });
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
      name: "getGoogleTasks",
      description: "Retrieve tasks from Google Tasks",
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
    const assistantId = env.OPENAI_ASSISTANT_ID;
    const userInput = req.body.prompt;

    if (!assistantId) {
      return res.status(503).json({ error: "OpenAI Assistant is not configured. Add OPENAI_ASSISTANT_ID to .env." });
    }

    if (!userInput) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    // Check if we're using the beta API or the regular API
    const threadsAPI = openai.beta?.threads || openai.threads;
    
    if (!threadsAPI) {
      console.error('OpenAI Threads API not available in this SDK version.');
      return res.status(500).json({ 
        error: "Assistant service is not available right now."
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
        error: "Assistant run failed"
      });
    }

    // Get the assistant's response
    const messages = await threadsAPI.messages.list(thread.id);
    const lastAssistantMessage = messages.data.find(message => message.role === "assistant");
    
    if (!lastAssistantMessage) {
      return res.status(500).json({ error: "No response from assistant" });
    }

    const reply = lastAssistantMessage.content[0]?.text?.value || "No response available";
    // Interpolate template variables before sending
    const variables = {
      current_date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    };
    const interpolatedReply = interpolateTemplates(reply, variables);
    res.json({ reply: interpolatedReply });

  } catch (error) {
    console.error('Assistant endpoint error:', error);
    res.status(500).json({ 
      error: "Assistant run failed"
    });
  }
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  console.error('Unhandled error:', err);
  res.status(statusCode).json({
    success: false,
    data: null,
    error: statusCode === 403 ? 'Origin is not allowed by dashboard CORS policy' : 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/api/health', (req, res) => res.json({
  success: true,
  data: {
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  },
  error: null,
  timestamp: new Date().toISOString()
}));

// Test page
app.get('/test', (req, res) => res.sendFile(__dirname + '/test.html'));

// 🧠 Initialize OpenAI and start server
(async () => {
  try {
    logEnvironmentStatus();
    console.log(`Allowed browser origins: ${allowedOrigins.join(', ')}`);

    if (env.OPENAI_API_KEY) {
      const { default: OpenAI } = await import('openai');
      openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
      console.log('OpenAI client initialized successfully');
    } else {
      console.warn('OpenAI client not initialized because OPENAI_API_KEY is missing.');
    }
    
    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (error) {
    console.error('Server startup failed:', error);
    process.exit(1);
  }
})();
