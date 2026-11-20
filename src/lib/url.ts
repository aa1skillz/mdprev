/** Mọi liên kết nội bộ đều đi qua đây để đúng cả khi base là "/" lẫn "/<repo>/". */
const BASE = import.meta.env.BASE_URL.replace(/\/+$/, '');

export function url(path = '/'): string {
  const p = path.startsWith('/') ? path : '/' + path;
  return BASE + p;
}

/** URL tuyệt đối (canonical, og, rss). `site` lấy từ astro.config. */
export function absUrl(path: string, site: URL | undefined): string {
  return new URL(url(path), site ?? 'http://localhost').toString();
}
