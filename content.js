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
    const videoId = new URLSearchParams(window.location.search).get('v');
    if (!videoId) return null;

    // Attempt 1: Innertube API with ANDROID client context
    const apiKey = findApiKey();
    if (apiKey) {
      const tracks = await fetchCaptionsViaInnertube(videoId, apiKey);
      if (tracks?.length) {
        const transcript = await fetchTranscriptFromTracks(tracks);
        if (transcript) return transcript.substring(0, 50000);
      }
    }

    // Attempt 2: DOM scraping
    const fromDom = await extractViaDOM();
    if (fromDom) return fromDom.substring(0, 50000);

    // Attempt 3: Video description
    const desc = extractDescription();
    if (desc) return desc;

    return null;
  } catch (error) {
    console.error('Error extracting YouTube content:', error);
    return null;
  }
}

// --- Extract INNERTUBE_API_KEY from the page's script tags (reading only, no injection) ---

function findApiKey() {
  for (const script of document.querySelectorAll('script')) {
    const text = script.textContent || '';
    const m = text.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/);
    if (m) return m[1];
  }
  return null;
}

// --- Fetch and parse a timedtext XML transcript ---

async function fetchTranscriptFromTracks(tracks) {
  // Prefer English, then the first available track
  const track = tracks.find(t => t.languageCode === 'en') || tracks[0];
  let url = track.baseUrl;
  if (!url) return null;
  if (url.startsWith('/')) url = 'https://www.youtube.com' + url;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const xmlText = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    if (xmlDoc.querySelector('parsererror')) return null;

    const textNodes = xmlDoc.querySelectorAll('text');
    const lines = Array.from(textNodes)
      .map(el => el.textContent?.trim())
      .filter(t => t);

    return lines.length > 0 ? lines.join(' ') : null;
  } catch {
    return null;
  }
}

// --- Innertube API call with ANDROID client context ---

async function fetchCaptionsViaInnertube(videoId, apiKey) {
  try {
    const response = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: {
          client: { clientName: 'ANDROID', clientVersion: '20.10.38' }
        },
        videoId: videoId
      })
    });
    if (!response.ok) return null;

    const data = await response.json();
    return data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || null;
  } catch {
    return null;
  }
}

// --- Strategy 3: DOM scraping (legacy fallback) ---

async function extractViaDOM() {
  const button = findTranscriptButton();
  if (!button) return null;

  if (!isTranscriptPanelOpen()) {
    button.click();
    await new Promise(r => setTimeout(r, 2000));
  }

  const transcript = await collectTranscriptFromDOM(5000);
  return transcript;
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

// --- Strategy 4: Video description fallback ---

function extractDescription() {
  const descEl = document.querySelector('#description-inline-expander, #description, ytd-expander #description');
  const desc = descEl?.textContent?.trim();
  if (desc) {
    return 'Video Description:\n' + desc.substring(0, 32000);
  }
  return null;
}
