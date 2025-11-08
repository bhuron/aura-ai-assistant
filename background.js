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
    const settings = await chrome.storage.sync.get(['apiKey', 'apiProvider', 'apiUrl', 'model', 'systemPrompt']);
    
    if (!settings.apiKey) {
      port.postMessage({ error: 'Please configure your API key in the extension settings' });
      return;
    }

    const modelToUse = request.model || settings.model;
    const settingsWithModel = { ...settings, model: modelToUse };
    
    const { apiUrl, headers, body } = buildApiRequest(settingsWithModel, request, true);
    
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
            const chunk = extractStreamChunk(parsed, settings.apiProvider);
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

async function handleChat(request) {
  try {
    const settings = await chrome.storage.sync.get(['apiKey', 'apiProvider', 'apiUrl', 'model', 'systemPrompt']);
    
    if (!settings.apiKey) {
      return { error: 'Please configure your API key in the extension settings' };
    }

    const modelToUse = request.model || settings.model;
    const settingsWithModel = { ...settings, model: modelToUse };
    
    const { apiUrl, headers, body } = buildApiRequest(settingsWithModel, request, false);
    
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
    const reply = extractReply(data, settings.apiProvider);
    
    return { reply };
  } catch (error) {
    return { error: error.message };
  }
}

function buildApiRequest(settings, request, stream = false) {
  const provider = settings.apiProvider || 'openai';
  const model = settings.model || 'gpt-4';
  
  let messages = [];
  
  // Build system message
  let systemContent = settings.systemPrompt || 'You are a helpful AI assistant.';
  
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

  if (provider === 'openai') {
    return {
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: {
        model: model,
        messages: messages,
        stream: stream
      }
    };
  } else if (provider === 'anthropic') {
    // Anthropic uses a different format
    const systemMessage = messages.find(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');
    
    return {
      apiUrl: 'https://api.anthropic.com/v1/messages',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: {
        model: model || 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        system: systemMessage ? systemMessage.content : undefined,
        messages: userMessages,
        stream: stream
      }
    };
  } else {
    // Custom provider
    return {
      apiUrl: settings.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: {
        model: model,
        messages: messages,
        stream: stream
      }
    };
  }
}

function extractStreamChunk(data, provider) {
  if (provider === 'anthropic') {
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
