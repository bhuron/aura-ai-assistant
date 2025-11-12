let providers = [];
let defaultModel = '';

// Load saved settings
chrome.storage.sync.get(['providers', 'systemPrompt', 'defaultModel'], (result) => {
  if (result.systemPrompt) document.getElementById('systemPrompt').value = result.systemPrompt;
  
  defaultModel = result.defaultModel || '';
  
  providers = result.providers || [
    { type: 'openai', apiKey: '', models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'] }
  ];
  
  renderProviders();
  updateDefaultModelDropdown();
});

document.getElementById('addProviderBtn').addEventListener('click', () => {
  providers.push({ type: 'openai', apiKey: '', models: [] });
  renderProviders();
  updateDefaultModelDropdown();
});

function renderProviders() {
  const container = document.getElementById('providersList');
  container.innerHTML = providers.map((provider, index) => `
    <div class="provider-card">
      <div class="provider-header">
        <select class="provider-type" data-index="${index}">
          <option value="openai" ${provider.type === 'openai' ? 'selected' : ''}>OpenAI</option>
          <option value="anthropic" ${provider.type === 'anthropic' ? 'selected' : ''}>Anthropic</option>
          <option value="custom" ${provider.type === 'custom' ? 'selected' : ''}>Custom</option>
        </select>
        <button class="remove-provider-btn" data-index="${index}">Remove</button>
      </div>
      
      ${provider.type === 'custom' ? `
        <div class="form-group">
          <label>API URL:</label>
          <input type="text" class="provider-url" data-index="${index}" value="${provider.apiUrl || ''}" placeholder="https://api.example.com/v1/chat/completions">
        </div>
      ` : ''}
      
      <div class="form-group">
        <label>API Key:</label>
        <input type="password" class="provider-key" data-index="${index}" value="${provider.apiKey || ''}" placeholder="Enter API key">
      </div>
      
      <div class="form-group">
        <label>Models (comma-separated):</label>
        <input type="text" class="provider-models" data-index="${index}" value="${provider.models.join(', ')}" placeholder="gpt-4, gpt-3.5-turbo">
      </div>
    </div>
  `).join('');
  
  // Add event listeners
  container.querySelectorAll('.provider-type').forEach(el => {
    el.addEventListener('change', (e) => {
      const index = parseInt(e.target.dataset.index);
      const oldType = providers[index].type;
      const newType = e.target.value;
      
      providers[index].type = newType;
      
      // Set default models when switching provider type
      if (newType === 'openai' && oldType !== 'openai') {
        providers[index].models = ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'];
      } else if (newType === 'anthropic' && oldType !== 'anthropic') {
        providers[index].models = ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'];
      } else if (newType === 'custom' && oldType !== 'custom') {
        providers[index].models = [];
        providers[index].apiUrl = '';
      }
      
      renderProviders();
      updateDefaultModelDropdown();
    });
  });
  
  container.querySelectorAll('.provider-key').forEach(el => {
    el.addEventListener('input', (e) => {
      const index = parseInt(e.target.dataset.index);
      providers[index].apiKey = e.target.value;
    });
  });
  
  container.querySelectorAll('.provider-url').forEach(el => {
    el.addEventListener('input', (e) => {
      const index = parseInt(e.target.dataset.index);
      providers[index].apiUrl = e.target.value;
    });
  });
  
  container.querySelectorAll('.provider-models').forEach(el => {
    el.addEventListener('input', (e) => {
      const index = parseInt(e.target.dataset.index);
      providers[index].models = e.target.value.split(',').map(m => m.trim()).filter(m => m);
      updateDefaultModelDropdown();
    });
  });
  
  container.querySelectorAll('.remove-provider-btn').forEach(el => {
    el.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      providers.splice(index, 1);
      renderProviders();
      updateDefaultModelDropdown();
    });
  });
}

function updateDefaultModelDropdown() {
  const dropdown = document.getElementById('defaultModel');
  
  // Collect all models from all providers
  const allModels = [];
  providers.forEach(provider => {
    if (provider.models && provider.models.length > 0) {
      provider.models.forEach(model => {
        if (!allModels.includes(model)) {
          allModels.push(model);
        }
      });
    }
  });
  
  dropdown.innerHTML = '<option value="">Select a default model</option>' +
    allModels.map(model => 
      `<option value="${model}" ${model === defaultModel ? 'selected' : ''}>${model}</option>`
    ).join('');
}

document.getElementById('saveBtn').addEventListener('click', () => {
  const systemPrompt = document.getElementById('systemPrompt').value;
  defaultModel = document.getElementById('defaultModel').value;

  // Validate at least one provider has an API key
  const hasValidProvider = providers.some(p => p.apiKey && p.apiKey.trim());
  if (!hasValidProvider) {
    showStatus('Please add at least one provider with an API key', 'error');
    return;
  }

  chrome.storage.sync.set({ providers, systemPrompt, defaultModel }, () => {
    showStatus('Settings saved!', 'success');
    // Notify sidepanel to reload models
    chrome.runtime.sendMessage({ action: 'settingsUpdated' });
  });
});

document.getElementById('defaultModel').addEventListener('change', (e) => {
  defaultModel = e.target.value;
});



function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = type;
  setTimeout(() => status.textContent = '', 3000);
}
