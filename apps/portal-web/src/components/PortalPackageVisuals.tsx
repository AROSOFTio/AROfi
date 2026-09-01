'use client'

/**
 * Visual-only overrides shared by the hosted compact portal. The RouterOS
 * hotspot/login.html has a matching server-side clarity pass so customers see
 * the same readable package hierarchy in both surfaces.
 */
export default function PortalPackageVisuals() {
  return (
    <style jsx global>{`
      /* Package cards are the main purchase decision. Keep two columns on
         phones, but make names, durations, prices and CTAs readable. */
      main article {
        min-height: 178px !important;
        padding: 14px !important;
        border-radius: 16px !important;
        border-color: #d8e2ef !important;
        background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%) !important;
        box-shadow: 0 6px 18px rgba(7, 26, 73, 0.055) !important;
      }
      main article > div:first-child > div:first-child {
        width: 38px !important;
        height: 38px !important;
        border: 1px solid #d8ebff !important;
        background: #edf6ff !important;
      }
      main article > div:first-child > div:first-child svg {
        width: 20px !important;
        height: 20px !important;
      }
      main article h3 {
        margin-top: 10px !important;
        overflow: visible !important;
        text-overflow: clip !important;
        white-space: normal !important;
        font-size: 16px !important;
        line-height: 1.18 !important;
        font-weight: 900 !important;
        color: #0b1739 !important;
      }
      main article h3 + p {
        margin-top: 4px !important;
        font-size: 12px !important;
        line-height: 1.3 !important;
        font-weight: 600 !important;
        color: #64748b !important;
      }
      main article h3 + p + div {
        margin-top: 8px !important;
        font-size: 21px !important;
        line-height: 1.05 !important;
        font-weight: 950 !important;
        letter-spacing: -0.02em !important;
        color: #0759e8 !important;
      }
      main article button {
        min-height: 36px !important;
        border-radius: 10px !important;
        padding: 9px 10px !important;
        font-size: 13px !important;
        line-height: 1 !important;
        font-weight: 850 !important;
        box-shadow: 0 6px 13px rgba(9, 100, 250, 0.18) !important;
      }
      #portal-plans h2 {
        font-size: 18px !important;
        line-height: 1.2 !important;
      }
      #portal-plans h2 + p {
        margin-top: 2px !important;
        font-size: 12.5px !important;
        line-height: 1.35 !important;
      }
      @media (max-width: 639px) {
        #portal-plans .mt-3 > .grid {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 8px !important;
        }
        main article {
          min-height: 164px !important;
          padding: 11px !important;
          border-radius: 14px !important;
        }
        main article > div:first-child > div:first-child {
          width: 34px !important;
          height: 34px !important;
        }
        main article > div:first-child > div:first-child svg {
          width: 18px !important;
          height: 18px !important;
        }
        main article h3 {
          margin-top: 8px !important;
          font-size: 14.5px !important;
        }
        main article h3 + p {
          font-size: 10.75px !important;
        }
        main article h3 + p + div {
          margin-top: 6px !important;
          font-size: 19px !important;
        }
        main article button {
          min-height: 34px !important;
          font-size: 12px !important;
          padding: 8px !important;
        }
      }
      @media (max-width: 390px) {
        main article {
          min-height: 158px !important;
          padding: 9px !important;
        }
        main article h3 {
          font-size: 13.5px !important;
        }
        main article h3 + p {
          font-size: 10px !important;
        }
        main article h3 + p + div {
          font-size: 18px !important;
        }
        main article button {
          font-size: 11.5px !important;
        }
      }
    `}</style>
  )
}
