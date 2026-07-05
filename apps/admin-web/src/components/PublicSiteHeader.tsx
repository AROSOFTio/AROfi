import Link from 'next/link'

// Shared top navigation for the public / SEO pages (blog index, articles,
// docs). Server component — just links, no client state. Keeps a consistent
// header so visitors (and search-engine crawlers) can move between the
// marketing home, blog, docs and sign-in from any public page.
export default function PublicSiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="AROFi" className="h-7 w-auto" />
          <span className="text-base font-extrabold tracking-tight text-slate-900">AROFi</span>
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <Link href="/" className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">Home</Link>
          <Link href="/blog" className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">Blog</Link>
          <Link href="/docs" className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">Docs</Link>
          <Link href="/login" className="rounded-md px-3 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900">Sign In</Link>
          <Link href="/register" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Register Free</Link>
        </div>
      </nav>
    </header>
  )
}
