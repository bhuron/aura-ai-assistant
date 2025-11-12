// Load saved settings
chrome.storage.sync.get(['apiKey', 'apiProvider', 'apiUrl', 'model', 'customModels', 'systemPrompt'], (result) => {
  if (result.apiKey) document.getElementById('apiKey').value = result.apiKey;
  if (result.apiProvider) document.getElementById('apiProvider').value = result.apiProvider;
  if (result.apiUrl) document.getElementById('apiUrl').value = result.apiUrl;
  if (result.model) document.getElementById('model').value = result.model;
  if (result.customModels) document.getElementById('customModels').value = result.customModels;
  if (result.systemPrompt) document.getElementById('systemPrompt').value = result.systemPrompt;
  
  toggleCustomUrl(result.apiProvider);
  toggleCustomModels(result.apiProvider);
});

document.getElementById('apiProvider').addEventListener('change', (e) => {
  toggleCustomUrl(e.target.value);
  toggleCustomModels(e.target.value);
});

function toggleCustomUrl(provider) {
  const customUrlGroup = document.getElementById('customUrlGroup');
  customUrlGroup.style.display = provider === 'custom' ? 'block' : 'none';
}

function toggleCustomModels(provider) {
  const customModelsGroup = document.getElementById('customModelsGroup');
  customModelsGroup.style.display = provider === 'custom' ? 'block' : 'none';
}

document.getElementById('saveBtn').addEventListener('click', () => {
  const apiKey = document.getElementById('apiKey').value;
  const apiProvider = document.getElementById('apiProvider').value;
  const apiUrl = document.getElementById('apiUrl').value;
  const model = document.getElementById('model').value;
  const customModels = document.getElementById('customModels').value;
  const systemPrompt = document.getElementById('systemPrompt').value;

  if (!apiKey) {
    showStatus('Please enter an API key', 'error');
    return;
  }

  chrome.storage.sync.set({ apiKey, apiProvider, apiUrl, model, customModels, systemPrompt }, () => {
    showStatus('Settings saved!', 'success');
  });
});



function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = type;
  setTimeout(() => status.textContent = '', 3000);
}
