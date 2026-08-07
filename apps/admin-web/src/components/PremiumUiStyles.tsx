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
