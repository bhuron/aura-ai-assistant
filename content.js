let myTabId = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (sender.tab) myTabId = sender.tab.id;

  if (request.action === 'getContent') {
    extractPageContent().then(content => sendResponse(content));
  } else if (request.action === 'getSelectedText') {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    sendResponse({ success: true, text: selectedText });
  } else if (request.action === 'clearSelection') {
    window.getSelection().removeAllRanges();
    sendResponse({ success: true });
  }
  return true;
});

function sanitizeText(text) {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
    .replace(/[�]/g, '')
    .replace(/[\uD800-\uDFFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function extractPageContent() {
  const title = document.title;
  const url = window.location.href;

  if (url.includes('youtube.com/watch')) {
    const transcript = await extractYouTubeTranscript();
    if (transcript) {
      return {
        title: sanitizeText(title),
        url: url,
        content: sanitizeText(transcript),
        type: 'youtube'
      };
    }
  }

  const article = document.querySelector('article') || document.querySelector('main') || document.body;
  const clone = article.cloneNode(true);
  clone.querySelectorAll('script, style, nav, header, footer, iframe').forEach(el => el.remove());
  const text = clone.innerText || clone.textContent;
  const maxLength = 32000;
  const truncatedText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;

  return {
    title: sanitizeText(title),
    url: url,
    content: sanitizeText(truncatedText),
    type: 'webpage'
  };
}

async function extractYouTubeTranscript() {
  try {
    // Attempt 1: Click transcript button and scrape the DOM
    const button = findTranscriptButton();
    if (button) {
      if (!isTranscriptPanelOpen()) {
        button.click();
        await new Promise(r => setTimeout(r, 2000));
      }
      const domTranscript = await collectTranscriptFromDOM(5000);
      if (domTranscript) return domTranscript.substring(0, 50000);
    }

    // Fallback: video description
    const descEl = document.querySelector('#description-inline-expander, #description, ytd-expander #description');
    const desc = descEl?.textContent?.trim();
    if (desc) {
      return 'Video Description:\n' + desc.substring(0, 32000);
    }

    return null;
  } catch (error) {
    console.error('Error extracting YouTube content:', error);
    return null;
  }
}

function findTranscriptButton() {
  const selectors = [
    'button[aria-label*="transcript" i]',
    'button[aria-label*="Show transcript" i]',
    'ytd-video-description-transcript-section-renderer button',
  ];
  for (const sel of selectors) {
    const btn = document.querySelector(sel);
    if (btn) return btn;
  }
  return null;
}

function isTranscriptPanelOpen() {
  if (document.querySelector('button[aria-label*="Close transcript" i], button[aria-label*="Fermer la transcription" i]')) {
    return true;
  }
  return !!document.querySelector(
    'ytd-transcript-renderer, ytd-transcript-segment-list-renderer, #segments-container'
  );
}

async function collectTranscriptFromDOM(timeoutMs) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const segs = document.querySelectorAll('ytd-transcript-segment-renderer');
    if (segs.length > 0) break;
    await new Promise(r => setTimeout(r, 200));
  }

  const segments = document.querySelectorAll('ytd-transcript-segment-renderer');
  const texts = Array.from(segments)
    .map(el => el.textContent?.trim())
    .filter(t => t);

  return texts.length > 0 ? texts.join(' ') : null;
}
