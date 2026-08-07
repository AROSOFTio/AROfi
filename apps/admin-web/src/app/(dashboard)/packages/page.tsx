import PackagesManager from '@/components/PackagesManager'

export const dynamic = 'force-dynamic'

export default function PackagesPage() {
  return (
    <>
      <PackagesManager />
      <style>{`
        .package-switch{
          width:32px!important;
          height:18px!important;
          min-width:32px!important;
          border:1px solid rgba(127,29,29,.24)!important;
          border-radius:999px!important;
          background:#dc2626!important;
          padding:0!important;
          box-shadow:inset 0 1px 2px rgba(15,23,42,.16),0 1px 2px rgba(15,23,42,.08)!important;
          transition:background-color .16s ease,border-color .16s ease,box-shadow .16s ease!important;
        }
        .package-switch span{
          width:14px!important;
          height:14px!important;
          top:1px!important;
          left:1px!important;
          background:#fff!important;
          border:1px solid rgba(15,23,42,.08)!important;
          box-shadow:0 1px 2px rgba(15,23,42,.24)!important;
          transition:transform .16s ease!important;
        }
        .package-switch.on{
          background:#16a34a!important;
          border-color:rgba(20,83,45,.28)!important;
        }
        .package-switch.on span{transform:translateX(14px)!important}
        .package-switch:hover{box-shadow:inset 0 1px 2px rgba(15,23,42,.12),0 0 0 3px rgba(37,99,235,.08)!important}
        .package-switch:focus-visible{outline:2px solid #2563eb!important;outline-offset:2px!important}
        .package-switch:disabled{opacity:.48!important;cursor:not-allowed!important}
      `}</style>
    </>
  )
}
