'use client'

import { FormEvent, useEffect, useState } from 'react'
import { BlogPostListResponse, BlogPostDetail, BlogPostStatus } from '@/lib/admin-types'
import FormProcessStatus from '@/components/FormProcessStatus'
import BlogEditor from '@/components/BlogEditor'
import { clientDeleteApi, clientFetchApi, clientPatchApi, clientPostApi, clientUploadApi } from '@/lib/client-api'
import { slugify } from '@/lib/slugify'

const browserApiBase = process.env.NEXT_PUBLIC_API_URL ?? '/api'

type BlogFormState = {
  title: string
  slug: string
  slugTouched: boolean
  excerpt: string
  contentHtml: string
  metaTitle: string
  metaDescription: string
  tags: string
  status: BlogPostStatus
}

const initialFormState: BlogFormState = {
  title: '',
  slug: '',
  slugTouched: false,
  excerpt: '',
  contentHtml: '',
  metaTitle: '',
  metaDescription: '',
  tags: '',
  status: 'DRAFT',
}

function statusLabel(status: BlogPostStatus) {
  if (status === 'PUBLISHED') return 'Published'
  if (status === 'ARCHIVED') return 'Archived'
  return 'Draft'
}

export default function BlogManager() {
  const [list, setList] = useState<BlogPostListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [formState, setFormState] = useState<BlogFormState>(initialFormState)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingCoverImageId, setEditingCoverImageId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [processText, setProcessText] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const items = list?.items ?? []

  useEffect(() => {
    void loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      const data = await clientFetchApi<BlogPostListResponse>('/blog/admin/posts?pageSize=100')
      setList(data)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load blog posts')
    } finally {
      setLoading(false)
    }
  }

  function startCreate() {
    setEditingId(null)
    setEditingCoverImageId(null)
    setCoverFile(null)
    setFormError(null)
    setProcessText('')
    setFormState(initialFormState)
    setCreateOpen(true)
  }

  async function startEdit(id: string) {
    setError(null)
    setFormError(null)
    setSuccess(null)
    setProcessText('')
    setCoverFile(null)
    try {
      const post = await clientFetchApi<BlogPostDetail>(`/blog/admin/posts/${id}`)
      setEditingId(post.id)
      setEditingCoverImageId(post.coverImageId)
      setFormState({
        title: post.title,
        slug: post.slug,
        slugTouched: true,
        excerpt: post.excerpt ?? '',
        contentHtml: post.contentHtml,
        metaTitle: post.metaTitle ?? '',
        metaDescription: post.metaDescription ?? '',
        tags: post.tags.join(', '),
        status: post.status,
      })
      setCreateOpen(true)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load post')
    }
  }

  function handleTitleChange(title: string) {
    setFormState((previous) => ({
      ...previous,
      title,
      slug: previous.slugTouched ? previous.slug : slugify(title),
    }))
  }

  function handleSlugChange(slug: string) {
    setFormState((previous) => ({ ...previous, slug, slugTouched: true }))
  }

  async function handleDelete(id: string) {
    setDeleting(true)
    setError(null)
    setSuccess(null)
    try {
      await clientDeleteApi(`/blog/admin/posts/${id}`)
      setSuccess('Post deleted successfully')
      setDeleteConfirmId(null)
      await loadData()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to delete post')
      setDeleteConfirmId(null)
    } finally {
      setDeleting(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setFormError(null)
    setSuccess(null)

    if (!formState.contentHtml.trim()) {
      const failure = 'Write some content before saving'
      setError(failure)
      setFormError(failure)
      return
    }

    setSubmitting(true)
    setProcessText(editingId ? 'Saving post changes.' : 'Creating post.')

    const payload = {
      title: formState.title.trim(),
      slug: formState.slug.trim() || undefined,
      excerpt: formState.excerpt.trim() || undefined,
      contentHtml: formState.contentHtml,
      metaTitle: formState.metaTitle.trim() || undefined,
      metaDescription: formState.metaDescription.trim() || undefined,
      tags: formState.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      status: formState.status,
    }

    try {
      const postId = editingId
        ? (await clientPatchApi<BlogPostDetail>(`/blog/admin/posts/${editingId}`, payload)).id
        : (await clientPostApi<BlogPostDetail>('/blog/admin/posts', payload)).id

      if (coverFile) {
        setProcessText('Uploading cover image.')
        const coverForm = new FormData()
        coverForm.append('file', coverFile)
        await clientUploadApi(`/blog/admin/posts/${postId}/cover`, coverForm)
      }

      setProcessText('Refreshing post list.')
      setSuccess(editingId ? 'Post updated successfully' : 'Post created successfully')
      setEditingId(null)
      setCoverFile(null)
      setFormState(initialFormState)
      await loadData()
      setCreateOpen(false)
    } catch (requestError) {
      const failure = requestError instanceof Error ? requestError.message : editingId ? 'Unable to update post' : 'Unable to create post'
      setError(failure)
      setFormError(failure)
    } finally {
      setSubmitting(false)
      setProcessText('')
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Blog</h1>
          <p className="page-subtitle">Write and publish SEO articles at arofi.net/&lt;slug&gt;.</p>
        </div>
      </div>

      {createOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => !submitting && setCreateOpen(false)}>
          <div className="modal-card wide" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setCreateOpen(false)} disabled={submitting}>Close</button>
            <div className="modal-kicker">Blog posts</div>
            <h2 className="modal-title">{editingId ? 'Edit Post' : 'New Post'}</h2>
            <form onSubmit={handleSubmit} style={{ marginTop: 18 }}>
              <div className="stats-grid" style={{ marginBottom: 16 }}>
                <div className="form-group">
                  <label className="form-label">Title</label>
                  <input className="form-input" value={formState.title} onChange={(event) => handleTitleChange(event.target.value)} placeholder="How to Start a WiFi Hotspot Business in Uganda" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Slug (arofi.net/...)</label>
                  <input className="form-input" value={formState.slug} onChange={(event) => handleSlugChange(event.target.value)} placeholder="how-to-start-wifi-business-uganda" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-input" value={formState.status} onChange={(event) => setFormState((previous) => ({ ...previous, status: event.target.value as BlogPostStatus }))}>
                    <option value="DRAFT">Draft</option>
                    <option value="PUBLISHED">Published</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Tags (comma separated)</label>
                  <input className="form-input" value={formState.tags} onChange={(event) => setFormState((previous) => ({ ...previous, tags: event.target.value }))} placeholder="wifi business, uganda, mikrotik" />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Excerpt</label>
                <input className="form-input" value={formState.excerpt} onChange={(event) => setFormState((previous) => ({ ...previous, excerpt: event.target.value }))} placeholder="Short summary shown on the blog index and used as a fallback meta description." />
              </div>

              <div className="stats-grid" style={{ marginTop: 12, marginBottom: 16 }}>
                <div className="form-group">
                  <label className="form-label">Meta title (optional, SEO)</label>
                  <input className="form-input" value={formState.metaTitle} onChange={(event) => setFormState((previous) => ({ ...previous, metaTitle: event.target.value }))} placeholder="Falls back to the post title" />
                </div>
                <div className="form-group">
                  <label className="form-label">Meta description (optional, SEO)</label>
                  <input className="form-input" value={formState.metaDescription} onChange={(event) => setFormState((previous) => ({ ...previous, metaDescription: event.target.value }))} placeholder="Falls back to the excerpt" />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Cover image</label>
                {editingCoverImageId && !coverFile && (
                  <img src={`${browserApiBase}/blog/images/${editingCoverImageId}`} alt="Current cover" style={{ maxWidth: 220, borderRadius: 8, marginBottom: 8, display: 'block' }} />
                )}
                <input type="file" accept="image/*" onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)} />
              </div>

              <div className="form-group" style={{ marginTop: 12 }}>
                <label className="form-label">Content</label>
                <BlogEditor value={formState.contentHtml} onChange={(html) => setFormState((previous) => ({ ...previous, contentHtml: html }))} />
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : editingId ? 'Save Changes' : 'Create Post'}
                </button>
              </div>
              <div style={{ marginTop: 12 }}>
                <FormProcessStatus busy={submitting} error={formError} success={success} text={processText || 'Saving post.'} />
              </div>
              {error && !formError && <p style={{ color: 'var(--danger-fg)', marginTop: 10, fontSize: 13 }}>{error}</p>}
            </form>
          </div>
        </div>
      )}

      {error && !formError && <p style={{ color: 'var(--danger-fg)', fontSize: 13, marginBottom: 10 }}>{error}</p>}
      {success && !submitting && <p style={{ color: 'var(--success-fg)', fontSize: 13, marginBottom: 10 }}>{success}</p>}

      <div className="table-toolbar">
        <div />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-primary" onClick={startCreate}>
            + New Post
          </button>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Published</th>
                <th>Views</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <p>Loading posts...</p>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <p>No blog posts yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.id}>
                  <td><div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{item.title}</div></td>
                  <td style={{ color: 'var(--text-2)' }}>/{item.slug}</td>
                  <td>
                    <span className={`switch-pill ${item.status === 'PUBLISHED' ? 'on' : ''}`} aria-label={item.status} />
                    <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-2)' }}>{statusLabel(item.status)}</span>
                  </td>
                  <td>{item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : '—'}</td>
                  <td>{item.viewCount}</td>
                  <td style={{ textAlign: 'right' }}>
                    {deleteConfirmId === item.id ? (
                      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--danger-fg)' }}>Delete?</span>
                        <button
                          type="button"
                          className="btn btn-sm"
                          style={{ background: 'var(--danger-fg)', color: '#fff', border: 'none' }}
                          onClick={() => void handleDelete(item.id)}
                          disabled={deleting}
                        >
                          {deleting ? '...' : 'Yes'}
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeleteConfirmId(null)} disabled={deleting}>
                          No
                        </button>
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', gap: 6 }}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void startEdit(item.id)}>Edit</button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--danger-fg)' }}
                          onClick={() => { setDeleteConfirmId(item.id); setError(null); setSuccess(null) }}
                        >
                          Delete
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
