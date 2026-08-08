import type { ReactNode } from 'react'
import PublicAppearanceDock from '@/components/PublicAppearanceDock'

export default function Template({ children }: { children: ReactNode }) {
  const repairThemeScript = `
    (function () {
      try {
        var cookies = document.cookie.split('; ').reduce(function (values, item) {
          var parts = item.split('=');
          values[parts[0]] = parts.slice(1).join('=');
          return values;
        }, {});
        var mode = null;
        var accent = null;
        try {
          mode = localStorage.getItem('arofi-theme');
          accent = localStorage.getItem('arofi-accent-theme');
        } catch (storageError) {}
        mode = mode || cookies['arofi-theme'];
        accent = accent || cookies['arofi-accent-theme'];
        if (mode === 'light' || mode === 'dark') {
          document.documentElement.setAttribute('data-theme', mode);
          document.documentElement.style.colorScheme = mode;
        }
        if (accent === 'blue' || accent === 'green' || accent === 'gold') {
          document.documentElement.setAttribute('data-accent-theme', accent);
        }
      } catch (error) {}
    })();
  `

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: repairThemeScript }} />
      {children}
      <PublicAppearanceDock />
    </>
  )
}
