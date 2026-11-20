import type { Faq } from './faq';
import { absUrl } from '../url';

/** Dữ liệu có cấu trúc (schema.org). Chỉ trường có thật: không đánh giá, không số liệu bịa. */
type Site = URL | undefined;

export const softwareApp = (path: string, site: Site, description: string): object => ({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'mdprev',
  url: absUrl(path, site),
  description,
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Any (web browser)',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
});

/** FAQPage: dùng đúng danh sách `faqs` mà trang cũng hiển thị (cùng một nguồn). */
export const faqPage = (faqs: Faq[]): object => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
});

export const article = (o: { path: string; site: Site; headline: string; description: string; published: string; modified: string }): object => ({
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: o.headline,
  description: o.description,
  datePublished: o.published,
  dateModified: o.modified,
  author: { '@type': 'Organization', name: 'mdprev' },
  publisher: { '@type': 'Organization', name: 'mdprev' },
  mainEntityOfPage: absUrl(o.path, o.site),
});

export const webPage = (o: { path: string; site: Site; name: string; description: string; modified: string }): object => ({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: o.name,
  description: o.description,
  dateModified: o.modified,
  url: absUrl(o.path, o.site),
  isPartOf: { '@type': 'WebSite', name: 'mdprev', url: absUrl('/', o.site) },
});

export const breadcrumbs = (items: { name: string; path: string }[], site: Site): object => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: absUrl(it.path, site) })),
});

export const webSite = (site: Site): object => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'mdprev',
  alternateName: 'mdprev.space',
  url: absUrl('/', site),
  inLanguage: 'en',
});
