import type { ReactNode } from 'react'
import PublicAppearanceDock from '@/components/PublicAppearanceDock'
import DocsEnhancer from '@/components/docs/DocsEnhancer'

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

  const brandStyles = `
    .sidebar-logo{position:relative;min-height:86px}
    .sidebar-logo>img{width:58px!important;height:50px!important;opacity:0!important;flex:0 0 58px;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}
    .sidebar-logo:before{content:'';position:absolute;left:12px;top:18px;width:58px;height:50px;background:var(--arofi-mark,url('/brand/arofi-mark-blue.svg')) center/contain no-repeat;pointer-events:none}
    .sidebar-logo h1 span{color:var(--arofi-accent,var(--green))!important}
    [data-theme='dark'] .sidebar,[data-theme='dark'] .topbar{background-image:none!important;box-shadow:none!important}
    [data-theme='dark'] .sidebar{background:#0f141b!important;border-color:#273240!important}
    [data-theme='dark'] .topbar{background:#111821!important;border-color:#273240!important}
  `

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: repairThemeScript }} />
      <style dangerouslySetInnerHTML={{ __html: brandStyles }} />
      {children}
      <DocsEnhancer />
      <PublicAppearanceDock />
    </>
  )
}
