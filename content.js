// Listen for messages from the side panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
  // Remove control characters and problematic unicode
  // Don't escape quotes/backslashes - JSON.stringify will handle that
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '') // Remove control chars
    .replace(/\uFFFD/g, '') // Remove replacement character
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove more control chars
    .replace(/[\uD800-\uDFFF]/g, '') // Remove unpaired surrogates
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
}

async function extractPageContent() {
  // Get page title
  const title = document.title;
  const url = window.location.href;

  // Check if it's a YouTube video
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

  // Get main text content
  const article = document.querySelector('article') || document.querySelector('main') || document.body;

  // Remove script, style, and nav elements
  const clone = article.cloneNode(true);
  clone.querySelectorAll('script, style, nav, header, footer, iframe').forEach(el => el.remove());

  const text = clone.innerText || clone.textContent;

  // Limit content length
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
    // Multiple possible selectors for the transcript button (YouTube changes these)
    const transcriptButtonSelectors = [
      'button[aria-label*="transcript" i]',
      'button[aria-label*="Show transcript" i]',
      'ytd-button-renderer button[aria-label*="transcript" i]',
    ];

    let transcriptButton = null;
    for (const sel of transcriptButtonSelectors) {
      transcriptButton = document.querySelector(sel);
      if (transcriptButton) break;
    }

    if (transcriptButton) {
      // Click to open transcript if not already open
      if (!document.querySelector('ytd-transcript-renderer, ytd-engagement-panel-section-list-renderer[engagement-panel-title*="transcript" i]')) {
        transcriptButton.click();
      }

      // Poll for transcript segments to appear (YouTube loads them asynchronously)
      const transcript = await waitForTranscript(5000);
      if (transcript) return transcript.substring(0, 50000);
    }

    // Fallback: try to get video description
    const descriptionEl = document.querySelector('#description-inline-expander, #description, ytd-expander #description');
    const description = descriptionEl?.textContent?.trim();
    if (description) {
      return `Video Description:\n${description.substring(0, 32000)}`;
    }

    return null;
  } catch (error) {
    console.error('Error extracting YouTube content:', error);
    return null;
  }
}

async function waitForTranscript(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const segments = document.querySelectorAll(
      'ytd-transcript-segment-renderer .segment-text, ' +
      'ytd-transcript-segment-renderer yt-formatted-string'
    );
    if (segments.length > 0) {
      const transcript = Array.from(segments)
        .map(el => el.textContent?.trim())
        .filter(text => text)
        .join(' ');
      if (transcript.length > 10) return transcript;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return null;
}
