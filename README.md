# Aura - AI Assistant Chrome Extension

A modern Chrome extension that brings AI-powered assistance to your browsing experience. Similar to Brave's Leo, but with more flexibility and features.

## ✨ Features

### Core Functionality
- 💬 **Chat with AI** about any webpage in real-time
- 🔄 **Streaming responses** for instant feedback
- 📑 **Multi-tab support** - Reference multiple pages with @mentions
- 🎬 **YouTube transcript extraction** - Analyze video content
- 📝 **Per-tab conversations** - Separate chat history for each page
- 🎯 **Suggested prompts** - Quick actions like "Summarize" and "Explain"

### AI Provider Support
- 🤖 **Multiple providers** - OpenAI, Anthropic, or custom endpoints
- 🔀 **Model switching** - Switch between models on the fly
- ⚙️ **Custom system prompts** - Define AI behavior globally
- 🎛️ **Flexible configuration** - Add multiple providers with different models

### User Experience
- 🎨 **Modern, clean design** - Spacious interface with beautiful typography
- ⚡ **Stop generation** - Cancel responses mid-stream
- 💾 **Export conversations** - Save chats as UTF-8 text files
- 🔄 **Auto-refresh tabs** - Tab list updates automatically
- ⌨️ **Keyboard friendly** - Enter to send, Shift+Enter for new line

## 🚀 Installation

1. Open Chrome (or Chromium-based browser) and navigate to `chrome://extensions/`
2. Enable **Developer mode** in the top right
3. Click **Load unpacked**
4. Select the extension directory
5. The Aura icon will appear in your toolbar

## ⚙️ Setup

### First Time Configuration

1. **Click the Aura icon** to open settings (or right-click → Options)
2. **Add a provider:**
   - Choose provider type (OpenAI, Anthropic, or Custom)
   - Enter your API key
   - Add models (comma-separated)
   - For custom providers, add the API URL
3. **Set a default model** from the dropdown
4. **(Optional)** Add a system prompt to customize AI behavior
5. Click **Save Settings**

### Adding Multiple Providers

You can configure multiple providers and models:
- Click **+ Add Provider** to add more
- Each provider can have multiple models
- All models appear in the side panel selector
- Aura automatically routes requests to the correct provider

## 📖 Usage

### Basic Chat
1. Click the Aura icon to open the side panel
2. The current page is automatically sent as context
3. Type your question and press Enter
4. Responses stream in real-time

### Multi-Tab Context
1. Type `@` in the input field
2. Select additional tabs from the dropdown
3. Selected tabs appear as pills above the input
4. All selected tabs are sent to the AI

### Quick Actions
- Click **Summarize** or **Explain** for instant prompts
- Click **Stop** to cancel a response
- Click **↓** to export the conversation
- Click **↻** to refresh the tab list
- Click **✕** to clear the conversation

## 💡 Tips

- **Costs:** You pay your AI provider directly based on usage
- **Context limits:** Page content up to 32,000 characters, YouTube transcripts up to 50,000
- **Privacy:** API keys stored locally in Chrome's sync storage
- **Conversations:** Each tab maintains its own conversation history
- **Model switching:** Change models mid-conversation without losing context
