let conversationHistory = [];
let availableTabs = [];
let selectedTabIds = new Set();
let currentModel = '';
let currentTabId = null;
let conversationsByTab = {}; // Store conversations per tab
let currentPort = null;
let isGenerating = false;

const suggestedPrompts = [
  'Summarize',
  'Explain'
];

document.getElementById('sendBtn').addEventListener('click', () => {
  if (isGenerating) {
    stopGeneration();
  } else {
    sendMessage();
  }
});
document.getElementById('userInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

document.getElementById('userInput').addEventListener('input', handleAtMention);
document.getElementById('exportChat').addEventListener('click', exportConversation);
document.getElementById('modelSelector').addEventListener('change', handleModelChange);

document.getElementById('clearChat').addEventListener('click', () => {
  conversationHistory = [];
  selectedTabIds.clear();
  document.getElementById('messages').innerHTML = '';
  
  // Clear from storage
  if (currentTabId !== null) {
    delete conversationsByTab[currentTabId];
  }
  
  updateSelectedTabs();
  showSuggestedPrompts();
});

document.getElementById('refreshTabs').addEventListener('click', loadTabs);

// Initialize
loadTabs();
loadModelSelector();
initializeTabConversation();

// Listen for tab changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  switchToTab(activeInfo.tabId);
});

// Listen for new tabs or tab updates
chrome.tabs.onCreated.addListener(() => {
  loadTabs();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.title || changeInfo.url) {
    loadTabs();
  }
});

chrome.tabs.onRemoved.addListener(() => {
  loadTabs();
});

async function initializeTabConversation() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    switchToTab(tab.id);
  }
}

function switchToTab(tabId) {
  // Save current conversation
  if (currentTabId !== null) {
    conversationsByTab[currentTabId] = {
      history: conversationHistory,
      messages: document.getElementById('messages').innerHTML
    };
  }
  
  // Load conversation for new tab
  currentTabId = tabId;
  if (conversationsByTab[tabId]) {
    conversationHistory = conversationsByTab[tabId].history;
    document.getElementById('messages').innerHTML = conversationsByTab[tabId].messages;
  } else {
    conversationHistory = [];
    document.getElementById('messages').innerHTML = '';
    showSuggestedPrompts();
  }
  
  // Scroll to bottom
  const messagesDiv = document.getElementById('messages');
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}



function showSuggestedPrompts() {
  if (conversationHistory.length > 0) return;
  
  const container = document.getElementById('suggestedPrompts');
  container.innerHTML = suggestedPrompts.map(prompt => 
    `<button class="suggested-prompt">${prompt}</button>`
  ).join('');
  
  container.querySelectorAll('.suggested-prompt').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('userInput').value = btn.textContent;
      sendMessage();
    });
  });
}

function hideSuggestedPrompts() {
  document.getElementById('suggestedPrompts').innerHTML = '';
}

async function loadModelSelector() {
  const settings = await chrome.storage.sync.get(['model', 'apiProvider', 'customModels']);
  const selector = document.getElementById('modelSelector');
  
  const provider = settings.apiProvider || 'openai';
  currentModel = settings.model || (provider === 'openai' ? 'gpt-4' : 'claude-3-5-sonnet-20241022');
  
  let models = [];
  if (provider === 'openai') {
    models = ['gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-3.5-turbo'];
  } else if (provider === 'anthropic') {
    models = ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'];
  } else if (settings.customModels) {
    models = settings.customModels.split(',').map(m => m.trim());
  } else {
    models = [currentModel];
  }
  
  // Ensure current model is in the list
  if (!models.includes(currentModel)) {
    models.unshift(currentModel);
  }
  
  selector.innerHTML = models.map(model => 
    `<option value="${model}" ${model === currentModel ? 'selected' : ''}>${model}</option>`
  ).join('');
  selector.style.display = 'inline-block';
}

async function handleModelChange(e) {
  currentModel = e.target.value;
  await chrome.storage.sync.set({ model: currentModel });
}

async function exportConversation() {
  if (conversationHistory.length === 0) {
    addMessage('No conversation to export', 'error');
    return;
  }
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabTitle = tab ? tab.title.replace(/[^a-z0-9]/gi, '-').toLowerCase() : 'conversation';
  
  const text = conversationHistory.map(msg => 
    `${msg.role.toUpperCase()}:\n${msg.content}\n`
  ).join('\n---\n\n');
  
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aura-${tabTitle}-${new Date().toISOString().slice(0,10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

async function loadTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  availableTabs = tabs
    .filter(tab => tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://'))
    .map(tab => ({
      id: tab.id,
      title: tab.title || 'Untitled',
      url: tab.url
    }));
}

function handleAtMention(e) {
  const input = e.target;
  const text = input.value;
  const cursorPos = input.selectionStart;
  
  // Find @ before cursor
  const textBeforeCursor = text.substring(0, cursorPos);
  const atMatch = textBeforeCursor.match(/@(\w*)$/);
  
  if (atMatch) {
    showTabSuggestions(atMatch[1], cursorPos - atMatch[0].length);
  } else {
    hideTabSuggestions();
  }
}

function showTabSuggestions(query, position) {
  const suggestions = availableTabs.filter(tab => 
    tab.title.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 5);
  
  if (suggestions.length === 0) {
    hideTabSuggestions();
    return;
  }
  
  let dropdown = document.getElementById('tabSuggestions');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.id = 'tabSuggestions';
    dropdown.className = 'tab-suggestions';
    document.querySelector('.input-container').appendChild(dropdown);
  }
  
  dropdown.innerHTML = suggestions.map(tab => 
    `<div class="tab-suggestion" data-tab-id="${tab.id}" data-tab-title="${tab.title}">
      <div class="tab-title">${tab.title}</div>
      <div class="tab-url">${tab.url}</div>
    </div>`
  ).join('');
  
  dropdown.querySelectorAll('.tab-suggestion').forEach(el => {
    el.addEventListener('click', () => {
      const tabId = parseInt(el.dataset.tabId);
      const tabTitle = el.dataset.tabTitle;
      insertTabMention(tabId, tabTitle);
      hideTabSuggestions();
    });
  });
  
  dropdown.style.display = 'block';
}

function hideTabSuggestions() {
  const dropdown = document.getElementById('tabSuggestions');
  if (dropdown) dropdown.style.display = 'none';
}

function insertTabMention(tabId, tabTitle) {
  const input = document.getElementById('userInput');
  const text = input.value;
  const cursorPos = input.selectionStart;
  
  // Find and remove the @mention
  const textBeforeCursor = text.substring(0, cursorPos);
  const atPos = textBeforeCursor.lastIndexOf('@');
  
  const newText = text.substring(0, atPos) + text.substring(cursorPos);
  input.value = newText;
  
  // Set cursor position
  const newCursorPos = atPos;
  input.setSelectionRange(newCursorPos, newCursorPos);
  input.focus();
  
  selectedTabIds.add(tabId);
  updateSelectedTabs();
}

function updateSelectedTabs() {
  let container = document.getElementById('selectedTabsContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'selectedTabsContainer';
    container.className = 'selected-tabs-container';
    document.querySelector('.chat-header').after(container);
  }
  
  if (selectedTabIds.size === 0) {
    container.style.display = 'none';
    return;
  }
  
  container.style.display = 'flex';
  const selectedTabs = availableTabs.filter(tab => selectedTabIds.has(tab.id));
  container.innerHTML = selectedTabs.map(tab => {
    const domain = new URL(tab.url).hostname;
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    return `<span class="selected-tab">
      <img src="${faviconUrl}" class="selected-tab-favicon" alt="" onerror="this.style.display='none'">
      <span class="selected-tab-title">${tab.title}</span>
      <button class="remove-tab" data-tab-id="${tab.id}">×</button>
    </span>`;
  }).join('');
  
  container.querySelectorAll('.remove-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedTabIds.delete(parseInt(btn.dataset.tabId));
      updateSelectedTabs();
    });
  });
}

async function sendMessage() {
  if (isGenerating) return;
  
  const input = document.getElementById('userInput');
  const message = input.value.trim();
  
  if (!message) return;
  
  input.value = '';
  hideTabSuggestions();
  hideSuggestedPrompts();
  addMessage(message, 'user');
  
  // Update UI for generating state
  isGenerating = true;
  updateSendButton();
  
  // Always get current tab content
  let pageContents = [];
  const currentContent = await getPageContent();
  if (currentContent) pageContents.push(currentContent);
  
  // Add any @mentioned tabs (excluding current tab to avoid duplicates)
  if (selectedTabIds.size > 0) {
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    for (const tabId of selectedTabIds) {
      if (tabId !== currentTab.id) {
        const content = await getPageContentFromTab(tabId);
        if (content) pageContents.push(content);
      }
    }
  }
  
  // Create streaming message
  const messageId = addMessage('', 'assistant');
  let fullReply = '';
  
  try {
    currentPort = chrome.runtime.connect({ name: 'chat-stream' });
    
    currentPort.postMessage({
      message: message,
      pageContents: pageContents,
      history: conversationHistory,
      model: currentModel
    });
    
    currentPort.onMessage.addListener((response) => {
      if (response.error) {
        updateMessage(messageId, `Error: ${response.error}`);
        stopGeneration();
      } else if (response.chunk) {
        fullReply += response.chunk;
        updateMessage(messageId, fullReply);
      } else if (response.done) {
        conversationHistory.push(
          { role: 'user', content: message },
          { role: 'assistant', content: fullReply }
        );
        stopGeneration();
      }
    });
    
    currentPort.onDisconnect.addListener(() => {
      stopGeneration();
    });
  } catch (error) {
    updateMessage(messageId, `Error: ${error.message}`);
    stopGeneration();
  }
}

function stopGeneration() {
  if (currentPort) {
    currentPort.disconnect();
    currentPort = null;
  }
  isGenerating = false;
  updateSendButton();
}

function updateSendButton() {
  const sendBtn = document.getElementById('sendBtn');
  if (isGenerating) {
    sendBtn.textContent = 'Stop';
    sendBtn.classList.add('stop-btn');
  } else {
    sendBtn.textContent = 'Send';
    sendBtn.classList.remove('stop-btn');
  }
}

async function getPageContent() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return await getPageContentFromTab(tab.id);
}

async function getPageContentFromTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    
    // Check if we can access the tab
    if (!tab || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      console.log('Cannot access this type of page');
      return null;
    }
    
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'getContent' });
      
      // For YouTube, wait a bit longer for transcript
      if (response && response.url && response.url.includes('youtube.com/watch')) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const retryResponse = await chrome.tabs.sendMessage(tabId, { action: 'getContent' });
        return retryResponse || response;
      }
      
      return response;
    } catch (error) {
      // Content script not injected yet, try to inject it
      console.log('Content script not ready, injecting...');
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
      
      // Try again after injection
      await new Promise(resolve => setTimeout(resolve, 500));
      const response = await chrome.tabs.sendMessage(tabId, { action: 'getContent' });
      return response;
    }
  } catch (error) {
    console.error('Could not get page content:', error);
    return null;
  }
}

let messageIdCounter = 0;

function addMessage(text, sender, isLoading = false) {
  const messagesDiv = document.getElementById('messages');
  const messageDiv = document.createElement('div');
  const messageId = messageIdCounter++;
  
  messageDiv.className = `message ${sender}`;
  messageDiv.id = `msg-${messageId}`;
  
  // Render markdown for assistant messages
  if (sender === 'assistant' && typeof marked !== 'undefined') {
    messageDiv.innerHTML = marked.parse(text);
  } else {
    messageDiv.textContent = text;
  }
  
  messagesDiv.appendChild(messageDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  
  return messageId;
}

function removeMessage(messageId) {
  const messageDiv = document.getElementById(`msg-${messageId}`);
  if (messageDiv) messageDiv.remove();
}

function updateMessage(messageId, text) {
  const messageDiv = document.getElementById(`msg-${messageId}`);
  if (messageDiv) {
    if (typeof marked !== 'undefined') {
      messageDiv.innerHTML = marked.parse(text);
    } else {
      messageDiv.textContent = text;
    }
    const messagesDiv = document.getElementById('messages');
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
}
