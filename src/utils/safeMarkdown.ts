import DOMPurify from 'dompurify';
import { marked } from 'marked';

const forbiddenTags = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'link',
  'meta',
  'base',
  'img',
  'picture',
  'source',
  'video',
  'audio',
  'svg',
  'math',
];

const forbiddenAttributes = ['style', 'target', 'srcset'];

export function renderSafeMarkdown(markdown: string): string {
  const parsed = marked.parse(markdown || '');
  const rawHTML = typeof parsed === 'string' ? parsed : '';
  const sanitized = DOMPurify.sanitize(rawHTML, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: forbiddenTags,
    FORBID_ATTR: forbiddenAttributes,
    ALLOW_DATA_ATTR: false,
  });

  if (typeof sanitized !== 'string') {
    return '';
  }

  if (typeof document === 'undefined') {
    return sanitized;
  }

  const container = document.createElement('div');
  container.innerHTML = sanitized;

  for (const link of container.querySelectorAll('a')) {
    const href = (link.getAttribute('href') || '').trim();
    if (!isAllowedLinkTarget(href)) {
      link.removeAttribute('href');
      continue;
    }

    if (href.startsWith('http://') || href.startsWith('https://')) {
      link.setAttribute('rel', 'noopener noreferrer');
    }
  }

  return container.innerHTML;
}

function isAllowedLinkTarget(href: string): boolean {
  if (href === '' || href.startsWith('#')) {
    return true;
  }

  if (href.startsWith('/')) {
    return !href.startsWith('//');
  }

  if (href.startsWith('./') || href.startsWith('../') || href.startsWith('?')) {
    return true;
  }

  return /^(https?:|mailto:|tel:)/i.test(href);
}
