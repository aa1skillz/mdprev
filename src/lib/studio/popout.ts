/** Kênh giữa studio và cửa sổ pop-out (cùng nguồn gốc, không qua server). */
export const POPOUT_CHANNEL = 'mdprev-md-preview';
export const POPOUT_NAME = 'mdprev-md-preview';

export type PopMsg =
  | { t: 'html'; html: string; fm: { rows: [string, string][] } | null; title: string; doc?: string; dt?: { vars: [string, string][]; doc: { fontFamily?: string; fontSize?: string; maxWidth?: string } } | undefined }
  | { t: 'scroll'; line: number }
  | { t: 'hello' };

export const popoutUrl = (path: string) => path.replace(/\/?$/, '/') + 'preview/';
