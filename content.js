// Listen for messages from the side panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getContent') {
    const content = extractPageContent();
    sendResponse(content);
  }
  return true;
});

function extractPageContent() {
  // Get page title
  const title = document.title;
  const url = window.location.href;
  
  // Check if it's a YouTube video
  if (url.includes('youtube.com/watch')) {
    const transcript = extractYouTubeTranscript();
    if (transcript) {
      return {
        title: title,
        url: url,
        content: transcript,
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
  const maxLength = 8000;
  const truncatedText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  
  return {
    title: title,
    url: url,
    content: truncatedText.trim(),
    type: 'webpage'
  };
}

function extractYouTubeTranscript() {
  try {
    // Try to get transcript from the page
    const transcriptButton = document.querySelector('button[aria-label*="transcript" i], button[aria-label*="Show transcript" i]');
    
    if (transcriptButton) {
      // Click to open transcript if not already open
      if (!document.querySelector('ytd-transcript-renderer')) {
        transcriptButton.click();
      }
      
      // Wait a bit for transcript to load
      setTimeout(() => {
        const transcriptSegments = document.querySelectorAll('ytd-transcript-segment-renderer');
        if (transcriptSegments.length > 0) {
          const transcript = Array.from(transcriptSegments)
            .map(segment => {
              const text = segment.querySelector('.segment-text')?.textContent?.trim();
              return text;
            })
            .filter(text => text)
            .join(' ');
          
          return transcript.substring(0, 12000); // Larger limit for transcripts
        }
      }, 500);
    }
    
    // Fallback: try to get video description
    const description = document.querySelector('#description-inline-expander')?.textContent?.trim();
    if (description) {
      return `Video Description:\n${description.substring(0, 8000)}`;
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting YouTube content:', error);
    return null;
  }
}
