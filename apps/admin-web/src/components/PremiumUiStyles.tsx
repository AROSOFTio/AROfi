export default function PremiumUiStyles() {
  return (
    <style>{`
      :root {
        --ui-font: "Segoe UI", "Segoe UI Variable", Inter, Roboto, "Helvetica Neue", Arial, sans-serif;
        --ui-radius: 10px;
        --ui-radius-sm: 8px;
        --ui-control-height: 40px;
      }

      html,
      body,
      button,
      input,
      select,
      textarea,
      table {
        font-family: var(--ui-font) !important;
      }

      body {
        font-size: 14px;
        line-height: 1.45;
        letter-spacing: 0;
      }

      .content {
        padding: 18px 20px;
      }

      .router-nudge {
        position: sticky;
        top: 10px;
        z-index: 80;
        margin: 12px 16px 0;
        padding: 12px 42px 12px 14px;
        border: 1px solid rgba(36, 99, 235, 0.22);
        border-radius: 14px;
        background: linear-gradient(135deg, rgba(239, 246, 255, 0.97), rgba(236, 253, 243, 0.97));
        box-shadow: 0 14px 34px rgba(15, 23, 42, 0.12);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
      }

      .router-nudge-head {
        display: grid;
        gap: 3px;
      }

      .router-nudge-head span {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--brand);
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .router-nudge-head strong {
        color: var(--text-1);
        font-size: 14px;
      }

      .router-nudge-steps {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .router-nudge-steps a {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 10px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.88);
        color: var(--text-1);
        border: 1px solid rgba(148, 163, 184, 0.32);
        text-decoration: none;
        font-size: 12px;
        font-weight: 750;
      }

      .router-nudge-steps a:first-child {
        background: var(--brand);
        color: #fff;
        border-color: var(--brand);
      }

      .router-nudge-close {
        position: absolute;
        top: 10px;
        right: 10px;
        width: 24px;
        height: 24px;
        border: 0;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.9);
        color: var(--text-3);
        cursor: pointer;
        display: grid;
        place-items: center;
      }

      @media (max-width: 760px) {
        .router-nudge {
          position: relative;
          top: auto;
          align-items: flex-start;
          flex-direction: column;
        }

        .router-nudge-steps {
          display: grid;
          width: 100%;
          grid-template-columns: 1fr;
        }

        .router-nudge-steps a {
          justify-content: center;
        }
      }

      .page-header {
        margin-bottom: 14px;
      }

      .page-title {
        font-size: 26px;
        line-height: 1.2;
        font-weight: 650;
        letter-spacing: -0.025em;
      }

      .page-subtitle {
        margin-top: 3px;
        max-width: 720px;
        font-size: 13px;
        line-height: 1.45;
        color: var(--text-2);
      }

      .card {
        border-radius: var(--ui-radius);
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.035);
      }

      .btn {
        min-height: 36px;
        padding: 0 13px;
        border-radius: var(--ui-radius-sm);
        font-family: var(--ui-font) !important;
        font-size: 13px;
        line-height: 1;
        font-weight: 600;
        letter-spacing: 0;
        box-shadow: none;
      }

      .btn.btn-sm,
      .btn-sm {
        min-height: 32px;
        padding: 0 10px;
        font-size: 12.5px;
      }

      .btn-primary:hover {
        transform: none;
        box-shadow: none;
      }

      .form-group {
        margin-bottom: 0;
      }

      .form-label {
        display: block;
        margin-bottom: 6px;
        font-size: 12.5px;
        line-height: 1.25;
        font-weight: 600;
        color: var(--text-2);
      }

      .form-input {
        width: 100%;
        min-height: var(--ui-control-height);
        padding: 8px 11px;
        border-radius: var(--ui-radius-sm);
        font-family: var(--ui-font) !important;
        font-size: 14px;
        line-height: 1.3;
      }

      textarea.form-input {
        min-height: 86px;
        resize: vertical;
      }

      .modal-overlay {
        padding: 18px;
        background: rgba(15, 23, 42, 0.5);
        backdrop-filter: blur(2px);
      }

      .modal-card {
        width: min(680px, 100%);
        max-width: calc(100vw - 36px) !important;
        max-height: calc(100vh - 36px);
        padding: 22px;
        border-radius: 12px;
        box-shadow: 0 24px 70px rgba(15, 23, 42, 0.24);
        overflow-y: auto;
      }

      .modal-card.compact {
        width: min(500px, 100%);
      }

      .modal-card.wide {
        width: min(1040px, 100%);
      }

      .modal-title {
        margin: 0 52px 18px 0;
        font-size: 22px;
        line-height: 1.25;
        font-weight: 650;
        letter-spacing: -0.02em;
      }

      .modal-close {
        top: 16px;
        right: 18px;
        min-height: 32px;
        padding: 0 8px;
        border-radius: 7px;
        font-size: 12.5px;
        font-weight: 600;
      }

      .badge {
        font-family: var(--ui-font) !important;
        font-weight: 600;
        letter-spacing: 0;
      }

      table th,
      table td {
        font-family: var(--ui-font) !important;
      }

      @media (max-width: 760px) {
        .content {
          padding: 14px 12px;
        }

        .page-title {
          font-size: 23px;
        }

        .modal-overlay {
          align-items: flex-end;
          padding: 0;
        }

        .modal-card,
        .modal-card.compact,
        .modal-card.wide {
          width: 100%;
          max-width: 100% !important;
          max-height: 92vh;
          padding: 18px 16px;
          border-radius: 14px 14px 0 0;
        }

        .modal-title {
          font-size: 20px;
          margin-bottom: 16px;
        }

        .btn {
          min-height: 38px;
        }
      }
    `}</style>
  )
}
