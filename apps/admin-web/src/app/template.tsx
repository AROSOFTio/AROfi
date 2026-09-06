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
        var preference = null;
        try { preference = localStorage.getItem('arofi-theme'); } catch (storageError) {}
        preference = preference || cookies['arofi-theme'] || 'system';
        if (preference !== 'light' && preference !== 'dark' && preference !== 'system') preference = 'system';
        var mode = preference === 'system'
          ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
          : preference;
        document.documentElement.setAttribute('data-theme', mode);
        document.documentElement.setAttribute('data-accent-theme', 'green');
        document.documentElement.style.colorScheme = mode;
      } catch (error) {}
    })();
  `

  const brandStyles = `
    .sidebar-logo{position:relative;min-height:78px}
    .sidebar-logo:before{display:none!important;content:none!important}
    .sidebar-logo>img{
      content:url('/brand-assets/arofi-app-icon')!important;
      width:52px!important;height:52px!important;opacity:1!important;flex:0 0 52px;
      object-fit:contain!important;border:0!important;border-radius:10px!important;
      background:transparent!important;box-shadow:none!important
    }
    .sidebar-logo h1 span{color:#22A53A!important}
    [data-theme='dark'] .sidebar-logo>img{content:url('/brand-assets/arofi-logo-dark')!important}
    [data-theme='dark'] .sidebar,[data-theme='dark'] .topbar{background-image:none!important;box-shadow:none!important}
    [data-theme='dark'] .sidebar{background:#171717!important;border-color:#303030!important}
    [data-theme='dark'] .topbar{background:#1A1A1A!important;border-color:#303030!important}
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
