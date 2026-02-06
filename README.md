# AI Prompt Minifier

***Entire project are Vibe coded except this line of text***

A standalone, client-side web tool for minifying AI prompts. It reduces token usage by intelligently removing unnecessary whitespace while preserving code structure, required spacing between identifiers, and exact string contents.

Perfect for preparing long system prompts + code/examples for models with context limits (e.g., Claude, GPT-4, Gemini, etc.).

## Features

- **Dual minification modes**:
  - System prompt / prefix: natural language – collapses all extra spaces and newlines into single spaces.
  - Main content: code, JSON, instructions – removes unnecessary whitespace but preserves spaces between identifiers/tokens and keeps strings 100% intact.
- **Optional character limit** with automatic truncation (useful for strict context windows).
- **Preset system** – save, load, and delete common system prompts (stored in browser localStorage).
- **Live preview** – output updates instantly as you type.
- **Copy to clipboard** with success/error feedback.
- **Dark / Light theme toggle**.
- **Fully offline** – single HTML file, no dependencies, no server required.

## How to Use

1. Save the provided code as `index.html` (or any name ending in `.html`).
2. Open the file in any modern browser (Chrome, Firefox, Edge, Safari).
3. Fill in the fields:
   - **1. System Prompt / Prefix**: Your role/instructions in natural language (e.g., "You are an expert Python developer...").
   - **2. Content**: Paste code, examples, JSON schemas, additional instructions, etc.
4. The **Minified Output** updates automatically.
5. (Optional) Enable "character limit" and set a max length – the output will be truncated if it exceeds the limit.
6. Use the preset controls to save frequently used system prompts.
7. Click **Copy Output to Clipboard** and paste into your AI chat.
