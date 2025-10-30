/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");

// Cloudflare Worker URL (preferred). The front-end will POST here.
// This keeps the OpenAI API key on the server/worker and out of the browser.
const WORKER_URL = "https://young-field-f1f7.chanso18.workers.dev/";

// Default settings (easy to change later)
const SETTINGS = {
  model: "gpt-4o", // change to gpt-4o-mini or gpt-4o as desired
  temperature: 0.7,
  max_tokens: 800,
  systemPrompt:
    "You are a helpful product advisor for skincare and cosmetics. Provide friendly, concise guidance and ask clarifying questions if needed.",
};

let conversation = [{ role: "system", content: SETTINGS.systemPrompt }];

// initial greeting
appendMessage("assistant", "👋 Hello! How can I help you today?");

/* Helper functions */
function appendMessage(role, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;
  wrapper.textContent = text;
  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function setFormEnabled(enabled) {
  userInput.disabled = !enabled;
  chatForm.querySelector("button").disabled = !enabled;
}

function showTypingIndicator() {
  const el = document.createElement("div");
  el.className = "message assistant typing";
  el.textContent = "...";
  el.id = "typing-indicator";
  chatWindow.appendChild(el);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function removeTypingIndicator() {
  const el = document.getElementById("typing-indicator");
  if (el) el.remove();
}

async function sendToOpenAI(messages) {
  // If the user has added a Cloudflare Worker URL in secrets.js (window.WORKER_URL),
  // the front-end will POST to that worker to keep the API key secret.
  // If no worker is provided but window.OPENAI_API_KEY exists, we will use it directly
  // (NOT recommended in production because it exposes your key in the browser).

  const payload = {
    model: SETTINGS.model,
    messages,
    temperature: SETTINGS.temperature,
    max_tokens: SETTINGS.max_tokens,
  };

  // Prefer an explicit window.WORKER_URL (allows dynamic override), otherwise fall back to the constant WORKER_URL
  const workerUrl = window.WORKER_URL || WORKER_URL || null;

  if (workerUrl) {
    const res = await fetch(workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Worker error: ${res.status} ${text}`);
    }
    const data = await res.json();
    // Worker should return the same shape as OpenAI, or at least
    // data.choices[0].message.content
    return data;
  }

  // If no worker is available, fall back to direct OpenAI call (insecure in browser)
  if (window.OPENAI_API_KEY) {
    console.warn(
      "Warning: Using OPENAI_API_KEY directly from the browser is insecure. Prefer a server or Cloudflare Worker."
    );

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${window.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error: ${res.status} ${text}`);
    }
    const data = await res.json();
    return data;
  }

  throw new Error(
    "No WORKER_URL or OPENAI_API_KEY found. Create a local secrets.js from secrets.js.example or deploy a Cloudflare Worker and set WORKER_URL."
  );
}

/* Handle form submit */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text) return;

  // show user message
  appendMessage("user", text);
  userInput.value = "";

  // add to conversation
  conversation.push({ role: "user", content: text });

  // disable input and show typing
  setFormEnabled(false);
  showTypingIndicator();

  try {
    const data = await sendToOpenAI(conversation);

    // Cloudflare Worker or OpenAI should return data.choices[0].message.content
    const assistantText =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      JSON.stringify(data);

    removeTypingIndicator();
    appendMessage("assistant", assistantText);

    // add assistant reply to conversation
    conversation.push({ role: "assistant", content: assistantText });
  } catch (err) {
    removeTypingIndicator();
    appendMessage("assistant", "⚠️ Error: " + err.message);
    console.error(err);
  } finally {
    setFormEnabled(true);
  }
});

// Small helper exposed for debugging in browser console (optional)
window.__CHAT_HELPER = {
  conversation,
  SETTINGS,
};
