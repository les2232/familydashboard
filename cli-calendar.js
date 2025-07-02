#!/usr/bin/env node
// cli-calendar.js
// Node.js CLI for Family Dashboard: Ask about your schedule, get real events via OpenAI function-calling

import dotenv from 'dotenv';
import fetch from 'node-fetch';
import readline from 'readline';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY in .env');
  process.exit(1);
}

// Function schema (should match your backend)
const tools = [
  {
    type: 'function',
    function: {
      name: 'getCalendarEvents',
      description: 'Get calendar events for a given day.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Target date in YYYY-MM-DD format (defaults to today)'
          }
        },
        required: []
      }
    }
  }
];

// Helper: prompt user for input if not provided as CLI arg
function askQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, ans => { rl.close(); resolve(ans); }));
}

// Helper: call backend calendar API
async function callCalendarApi(date) {
  const url = `${BACKEND_URL}/api/calendar${date ? `?date=${encodeURIComponent(date)}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Calendar API error: ${res.status}`);
  return res.json();
}

// Helper: resolve relative dates in prompt
function resolveRelativeDates(prompt) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;
  const tyyyy = tomorrow.getFullYear();
  const tmm = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const tdd = String(tomorrow.getDate()).padStart(2, '0');
  const tomorrowStr = `${tyyyy}-${tmm}-${tdd}`;
  return prompt
    .replace(/\btoday\b/gi, todayStr)
    .replace(/\btomorrow\b/gi, tomorrowStr);
}

// Main orchestrator
async function main() {
  let userPrompt = process.argv.slice(2).join(' ');
  if (!userPrompt) {
    userPrompt = await askQuestion('Ask about your schedule: ');
  }
  userPrompt = resolveRelativeDates(userPrompt);

  // 1. Send user prompt to OpenAI with function-calling enabled
  const firstRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: userPrompt }],
      tools,
      tool_choice: 'auto'
    })
  });
  const firstData = await firstRes.json();
  if (!firstRes.ok) {
    console.error('OpenAI API error:', firstData);
    process.exit(1);
  }
  const msg = firstData.choices[0].message;

  // 2. If function call, call backend and feed result to OpenAI
  if (msg.tool_calls && msg.tool_calls.length > 0) {
    const toolCall = msg.tool_calls[0];
    const args = JSON.parse(toolCall.function.arguments || '{}');
    let calendarResult;
    try {
      calendarResult = await callCalendarApi(args.date);
    } catch (err) {
      console.error('Failed to fetch calendar:', err.message);
      process.exit(1);
    }
    // 3. Send function result back to OpenAI
    const followupRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'user', content: userPrompt },
          msg,
          {
            tool_call_id: toolCall.id,
            role: 'tool',
            content: JSON.stringify(calendarResult)
          }
        ]
      })
    });
    const followupData = await followupRes.json();
    if (!followupRes.ok) {
      console.error('OpenAI API error (followup):', followupData);
      process.exit(1);
    }
    const reply = followupData.choices[0].message.content;
    console.log('\nAssistant:\n' + reply);
  } else {
    // No function call, just print reply
    console.log('\nAssistant:\n' + msg.content);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
