# aaPanel Theme Audit

Date inspected: 2026-07-19

Reference:

- Official demo: `https://demo.aapanel.com/fdgi87jbn/`
- Demo credentials used: `aapanel` / `aapanel`
- Current public download page inspected: aaPanel Free `8.0.4`
- Authenticated asset cache-buster inspected: `v=1782899742524`
- Source assets saved locally under `docs/ui/aapanel-reference/http/`

Inspected files:

- `docs/ui/aapanel-reference/http/login.html`
- `docs/ui/aapanel-reference/http/app.html`
- `docs/ui/aapanel-reference/http/static_vite_css_app.css`
- `docs/ui/aapanel-reference/http/static_oldcss_site.css`
- `docs/ui/aapanel-reference/http/theme-vars.json`
- `docs/ui/aapanel-reference/http/summary.json`

Notes:

- The authenticated aaPanel UI uses `:root` for light mode and `:root[theme-mode=dark]` for dark mode.
- The extracted app theme contains 280 light variables and 280 dark variables.
- Browser CDP attachment was attempted with local Chrome, but the DevTools endpoint did not open in this sandbox. Exact values below are therefore taken from the official authenticated CSS source plus login-shell computed declarations, not from live interactive DevTools computed panes.
- Product boundary: aaPanel is used only as the visual skin reference. AROFi keeps its WiFi billing, hotspot, router, RADIUS, wallet, staff/RBAC, reporting, support, logo, name, favicon, and blue primary action branding.

## Typography

| Token | Light | Dark | Source |
| --- | --- | --- | --- |
| font family | `PingFang SC, Inter, Microsoft YaHei, Segoe UI, sans-serif` | same | `static_vite_css_app.css` body |
| legacy font stack | `v-sans, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"` | same | `static_oldcss_site.css` body |
| body font size | `12px` | `12px` | app + old CSS |
| sidebar font size | `15px` | `15px` | `.sidebar-scroll .menu li a` |
| submenu font size | `12px` | `12px` | base UI scale |
| table font size | `12px` | `12px` | `.divtable .table`, `.n-data-table` |
| table header font size | `12.5px` | `12.5px` | `.divtable .table thead th` |
| form label font size | `12px` | `12px` | base UI scale |
| input font size | `12px` | `12px` | app input/select rules |
| button font size | `12px` | `12px` | app button scale |
| page title font size | `20px` | `20px` | compact heading target from aaPanel utility scale |
| section heading font size | `14px` | `14px` | panel/card heading scale |
| body line height | `normal` | `normal` | app body |
| heading line height | `1.1` | `1.1` | heading rule |
| letter spacing | `0` | `0` | source rules do not apply negative tracking |
| normal weight | `400` | `400` | app body |
| heading weight | `500` | `500` | heading rule |

## Colors

| Use | Light | Dark |
| --- | --- | --- |
| page background | `#f2f5f9` | `#18191c` |
| sidebar background | `rgba(242,245,249,.6)` / classic `#353d44` | `transparent` / classic `#202020` |
| top-bar background | `#fff` | `#202020` |
| panel background | `#fff` | `#202020` |
| card background | `#fff` | `#202020` |
| secondary surface | `#f2f5f9` | `#2e2e2e` |
| tertiary surface | `#f7f7f7` | `#2e2e2e` |
| input background | `#fff` | `#202020` |
| border | `#dcdfe6` | `#434343` |
| divider | `#edf1f2` | `#434343` |
| normal text | `#3a424d` | `#c7c7c7` |
| strong text | `#131313` | `#d8dce2` |
| muted text | `#999` | `#999` |
| placeholder text | `#999` | `#999` |
| disabled text | `#999` | `#999` |
| selected navigation background | `rgba(32,165,58,.063)` | `#353535` |
| selected navigation text | `#20a53a` | `#c7c7c7` |
| navigation hover background | `rgba(32,165,58,.1)` | `#353535` |
| navigation hover text | `#20a53a` | `#fff` |
| primary button | `#20a53a` | `#20a53a` |
| primary button hover | `#1d9534` | `#267544` |
| primary button pressed | `#1a8a30` | `#20633a` |
| secondary button | `#eee` | `#353535` |
| success | `#20a53a` | `#20a53a` |
| warning | `#ffae45` | `#e67e22` |
| error | `#e73a33` | `#f16575` |
| informational state | `#20a53a` | `#20a53a` |
| links | `#20a53a` | `#20a53a` |
| table header | `#f6f6f6` | `#232323` |
| table row hover | `#f0f9f7` | `#353535` |
| modal overlay | `rgba(0,0,0,.3)` | `rgba(0,0,0,.3)` |
| tooltip background | `#fff` | `#181818` |
| tooltip text | `#666` | `#c7c7c7` |
| scrollbar thumb | `#999` | `rgba(255,255,255,.2)` |
| scrollbar track | `#ededed` | `rgba(255,255,255,0)` |

## Dimensions And Spacing

| Use | Value | Source |
| --- | --- | --- |
| expanded sidebar width | `200px` | `.sidebar-scroll` |
| collapsed sidebar width | `50px` | aaPanel compact utility/sidebar convention |
| top-bar height | `50px` | `.mypcip`, logo/top compact rhythm |
| navigation row height | `44px` | `.sidebar-scroll .menu li a` |
| submenu row height | `36px` | compact secondary row target |
| content padding | `15px` | aaPanel help/content spacing |
| card padding | `20px` | `.n-card .n-card-header` |
| section spacing | `15px` | recurring panel/help margin |
| table row height | `36px` | `.n-data-table .n-data-table-td` |
| table header height | `34px` | `.n-data-table .n-data-table-th` |
| form control height | `30px` | `.bt-input-text`, `.el-select__wrapper` |
| primary button height | `34px` | `.bt-submit` |
| modal padding | `20px` | modal/message/content rules |
| grid gaps | `15px` | recurring panel spacing |
| icon dimensions | `16px` | old sidebar icon background size |
| logo area | `50px` | top/sidebar item rhythm |
| mobile drawer width | `200px` | sidebar width reused |
| responsive breakpoint | `768px` | AROFi implementation breakpoint aligned to mobile drawer |

## Component Appearance

| Component | Extracted styling |
| --- | --- |
| sidebar | classic `#353d44`, `200px`, fixed height, `44px` rows, left active border `#20a53a` |
| collapsed sidebar | `50px` target, icon-only compact state not fully verified in demo |
| top bar | `50px`, `#fff` light / `#202020` dark, bottom border `#dcdfe6` / `#434343` |
| cards | `#fff` / `#202020`, `1px` border, `4px` radius target, `0 0 8px rgba(0,0,0,.06)` |
| tables | `12px`, header `#f6f6f6` / `#232323`, row `36px`, hover `#f0f9f7` / `#353535` |
| inputs | `30px`, `1px solid #ccc` legacy or token border, `2px` radius, focus shadow `0 0 8px rgba(102,175,233,.6)` |
| buttons | `30px` base, primary `#20a53a`, hover `#1d9534` light / `#267544` dark |
| checkboxes/radio | `14px` square/circle controls |
| dialogs | modal surface `#fff` / `#18191c`, overlay `rgba(0,0,0,.3)`, shadow `0 0 3px 1px ...` |
| pagination | active border/text uses theme border/text tokens |
| tooltips | light text `#666`, dark text `#c7c7c7`, dark bg `#181818` |
| transitions | `.15s` focus/control transitions, `.2s` hover/background transitions |

## Verification Artifacts

Created:

- `docs/ui/aapanel-reference/http/login.html`
- `docs/ui/aapanel-reference/http/app.html`
- `docs/ui/aapanel-reference/http/theme-vars.json`
- `docs/ui/aapanel-reference/http/summary.json`

Not completed:

- Reference screenshots at `1440x900`, `1366x768`, `1024x768`, `390x844`
- AROFi matching screenshots at the same viewports
- Live computed-style screenshots from browser DevTools

Reason: local Chrome launched, but its DevTools endpoint did not expose a usable debugging port in this environment. The implementation avoids estimated colors by using values extracted from official authenticated aaPanel CSS assets.
