'use strict';

const axios = require('axios');

// Provider definitions — ordered by preference.
// The router tries each in sequence, moving on after any error.
const PROVIDERS = [
  {
    name: 'Anthropic',
    envKey: 'ANTHROPIC_KEY',
    call: async (prompt, apiKey) => {
      const res = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-opus-4-8',
          max_tokens: 600,
          messages: [{ role: 'user', content: prompt }],
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          timeout: 30_000,
        }
      );
      return res.data.content[0].text;
    },
  },
  {
    name: 'OpenAI',
    envKey: 'OPENAI_KEY',
    call: async (prompt, apiKey) => {
      const res = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 600,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30_000,
        }
      );
      return res.data.choices[0].message.content;
    },
  },
  {
    name: 'Gemini',
    envKey: 'GEMINI_KEY',
    call: async (prompt, apiKey) => {
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 600 },
        },
        { timeout: 30_000 }
      );
      return res.data.candidates[0].content.parts[0].text;
    },
  },
  {
    name: 'Groq',
    envKey: 'GROQ_KEY',
    call: async (prompt, apiKey) => {
      const res = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 600,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30_000,
        }
      );
      return res.data.choices[0].message.content;
    },
  },
  {
    name: 'Cohere',
    envKey: 'COHERE_KEY',
    call: async (prompt, apiKey) => {
      const res = await axios.post(
        'https://api.cohere.com/v2/chat',
        {
          model: 'command-r-plus',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 600,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30_000,
        }
      );
      return res.data.message.content[0].text;
    },
  },
];

/**
 * Attempts email generation through each provider in order.
 * On 429 (rate limit), 403 (auth/quota), or any network/timeout error,
 * logs the failure and moves on to the next provider automatically.
 *
 * @param {string} prompt
 * @returns {Promise<{ text: string, provider: string }>}
 */
async function routeToAI(prompt) {
  const errors = [];

  for (const provider of PROVIDERS) {
    const apiKey = process.env[provider.envKey];
    if (!apiKey) {
      errors.push(`${provider.name}: key not configured (${provider.envKey})`);
      continue;
    }

    try {
      const text = await provider.call(prompt, apiKey);
      console.log(`[aiRouter] Success via ${provider.name}`);
      return { text, provider: provider.name };
    } catch (err) {
      const status = err?.response?.status;
      const message = err?.response?.data?.error?.message ?? err.message ?? 'unknown error';
      errors.push(`${provider.name} [${status ?? 'ERR'}]: ${message}`);
      console.warn(`[aiRouter] ${provider.name} failed (${status ?? 'ERR'}), trying next provider.`);
    }
  }

  throw new Error(`All AI providers exhausted:\n${errors.join('\n')}`);
}

module.exports = { routeToAI };
