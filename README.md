# Aura - AI Assistant Chrome Extension

A Chrome extension similar to Brave's Leo that provides AI-powered assistance for web browsing.

## Features

- Chat with AI about any webpage
- Summarize page content
- Support for multiple AI providers (OpenAI, Anthropic, Custom)
- Side panel interface for seamless browsing
- Conversation history within sessions

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked"
4. Select this extension directory

## Setup

1. Click the extension icon in your toolbar
2. Select your AI provider (OpenAI, Anthropic, or Custom)
3. Enter your API key
4. Enter the model name (e.g., `gpt-4`, `claude-3-5-sonnet-20241022`)
5. Click "Save Settings"

## Usage

1. Click "Open Assistant" or use the side panel
2. Ask questions about the current page
3. Click the 📄 button to quickly summarize the page
4. Use "Clear" to start a new conversation

## API Providers

### OpenAI
- Model examples: `gpt-4`, `gpt-3.5-turbo`
- Get API key: https://platform.openai.com/api-keys

### Anthropic
- Model examples: `claude-3-5-sonnet-20241022`, `claude-3-opus-20240229`
- Get API key: https://console.anthropic.com/

### Custom
- Use any OpenAI-compatible API endpoint
- Enter the full URL (e.g., `https://api.example.com/v1/chat/completions`)

## Notes

- Icon files (icon16.png, icon48.png, icon128.png) need to be added
- API keys are stored locally in Chrome's sync storage
- Page content is limited to 8000 characters for API efficiency
