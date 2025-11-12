// Open side panel when clicking extension icon
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'chat') {
    handleChat(request).then(sendResponse);
    return true;
  }
});

let currentPort = null;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'chat-stream') {
    currentPort = port;
    
    port.onMessage.addListener(async (request) => {
      await handleChatStream(request, port);
    });
    
    port.onDisconnect.addListener(() => {
      currentPort = null;
    });
  }
});

async function handleChatStream(request, port) {
  try {
    const settings = await chrome.storage.sync.get(['providers', 'systemPrompt']);
    
    const providers = settings.providers || [];
    if (providers.length === 0) {
      port.postMessage({ error: 'Please configure at least one provider in settings' });
      return;
    }

    const modelToUse = request.model;
    const provider = findProviderForModel(providers, modelToUse);
    
    if (!provider) {
      port.postMessage({ error: `No provider configured for model: ${modelToUse}` });
      return;
    }
    
    const { apiUrl, headers, body } = buildApiRequest(provider, settings.systemPrompt, request, true);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      port.postMessage({ error: `API error: ${response.status} - ${errorText}` });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            const chunk = extractStreamChunk(parsed, provider.type);
            if (chunk) {
              port.postMessage({ chunk });
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }
    
    port.postMessage({ done: true });
  } catch (error) {
    port.postMessage({ error: error.message });
  }
}

function findProviderForModel(providers, modelName) {
  for (const provider of providers) {
    if (provider.models && provider.models.includes(modelName) && provider.apiKey) {
      return provider;
    }
  }
  return null;
}

async function handleChat(request) {
  try {
    const settings = await chrome.storage.sync.get(['providers', 'systemPrompt']);
    
    const providers = settings.providers || [];
    if (providers.length === 0) {
      return { error: 'Please configure at least one provider in settings' };
    }

    const modelToUse = request.model;
    const provider = findProviderForModel(providers, modelToUse);
    
    if (!provider) {
      return { error: `No provider configured for model: ${modelToUse}` };
    }
    
    const { apiUrl, headers, body } = buildApiRequest(provider, settings.systemPrompt, request, false);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { error: `API error: ${response.status} - ${errorText}` };
    }

    const data = await response.json();
    const reply = extractReply(data, provider.type);
    
    return { reply };
  } catch (error) {
    return { error: error.message };
  }
}

function buildApiRequest(provider, systemPrompt, request, stream = false) {
  const providerType = provider.type;
  const model = request.model;
  
  let messages = [];
  
  // Build system message
  let systemContent = systemPrompt || 'You are a helpful AI assistant.';
  
  // Add page context if available
  if (request.pageContents && request.pageContents.length > 0) {
    const pagesContext = request.pageContents.map((page, idx) => {
      const contentType = page.type === 'youtube' ? 'YouTube Video Transcript' : 'Webpage Content';
      return `Page ${idx + 1}:\nType: ${contentType}\nTitle: ${page.title}\nURL: ${page.url}\n\nContent:\n${page.content}`;
    }).join('\n\n---\n\n');
    
    systemContent += `\n\nThe user is viewing ${request.pageContents.length} page(s) with the following content:\n\n${pagesContext}`;
  }
  
  messages.push({
    role: 'system',
    content: systemContent
  });
  
  // Add conversation history
  if (request.history && request.history.length > 0) {
    messages = messages.concat(request.history);
  }
  
  // Add current message
  messages.push({
    role: 'user',
    content: request.message
  });

  if (providerType === 'openai') {
    return {
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`
      },
      body: {
        model: model,
        messages: messages,
        stream: stream
      }
    };
  } else if (providerType === 'anthropic') {
    // Anthropic uses a different format
    const systemMessage = messages.find(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');
    
    return {
      apiUrl: 'https://api.anthropic.com/v1/messages',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: {
        model: model,
        max_tokens: 4096,
        system: systemMessage ? systemMessage.content : undefined,
        messages: userMessages,
        stream: stream
      }
    };
  } else {
    // Custom provider
    return {
      apiUrl: provider.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`
      },
      body: {
        model: model,
        messages: messages,
        stream: stream
      }
    };
  }
}

function extractStreamChunk(data, providerType) {
  if (providerType === 'anthropic') {
    if (data.type === 'content_block_delta' && data.delta?.text) {
      return data.delta.text;
    }
  } else {
    // OpenAI and most custom providers
    if (data.choices?.[0]?.delta?.content) {
      return data.choices[0].delta.content;
    }
  }
  return null;
}

function extractReply(data, provider) {
  if (provider === 'anthropic') {
    return data.content[0].text;
  } else {
    // OpenAI and most custom providers
    return data.choices[0].message.content;
  }
}
