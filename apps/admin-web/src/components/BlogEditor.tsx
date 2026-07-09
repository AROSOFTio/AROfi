'use client'

import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3, List, ListOrdered, Quote, Code,
  Link as LinkIcon, Image as ImageIcon, Table as TableIcon,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Undo, Redo,
} from 'lucide-react'
import { clientUploadApi } from '@/lib/client-api'

type BlogEditorProps = {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      style={active ? { background: 'var(--green-light)', color: 'var(--green-dark)' } : undefined}
    >
      {children}
    </button>
  )
}

export default function BlogEditor({ value, onChange, placeholder }: BlogEditorProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [linkBarOpen, setLinkBarOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: placeholder ?? 'Write your article...' }),
      CharacterCount,
    ],
    content: value,
    onUpdate: ({ editor: updatedEditor }) => onChange(updatedEditor.getHTML()),
    editorProps: {
      attributes: {
        class: 'blog-editor-content',
      },
    },
  })

  // Keep the editor in sync when the parent resets `value` (e.g. switching
  // between "create" and "edit" without unmounting the component).
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  if (!editor) {
    return null
  }

  async function handleImagePick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !editor) {
      return
    }
    const formData = new FormData()
    formData.append('file', file)
    try {
      const uploaded = await clientUploadApi<{ id: string; url: string }>('/blog/admin/images', formData)
      editor.chain().focus().setImage({ src: uploaded.url }).run()
    } catch (caught) {
      setUploadError(caught instanceof Error ? caught.message : 'Unable to upload image')
    }
  }

  function setLink() {
    const previousUrl = editor?.getAttributes('link').href as string | undefined
    setLinkUrl(previousUrl ?? 'https://')
    setLinkBarOpen(true)
  }

  function applyLink() {
    if (linkUrl.trim() === '' || linkUrl.trim() === 'https://') {
      editor?.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      editor?.chain().focus().extendMarkRange('link').setLink({ href: linkUrl.trim() }).run()
    }
    setLinkBarOpen(false)
  }

  return (
    <div className="blog-editor" style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 4, padding: 8,
          borderBottom: '1px solid var(--border)', background: 'var(--surface-2, #f7f7f8)',
        }}
      >
        <ToolbarButton label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={15} /></ToolbarButton>
        <ToolbarButton label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={15} /></ToolbarButton>
        <ToolbarButton label="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={15} /></ToolbarButton>
        <ToolbarButton label="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={15} /></ToolbarButton>
        <ToolbarButton label="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={15} /></ToolbarButton>
        <ToolbarButton label="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={15} /></ToolbarButton>
        <ToolbarButton label="Heading 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={15} /></ToolbarButton>
        <ToolbarButton label="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={15} /></ToolbarButton>
        <ToolbarButton label="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={15} /></ToolbarButton>
        <ToolbarButton label="Blockquote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={15} /></ToolbarButton>
        <ToolbarButton label="Code block" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code size={15} /></ToolbarButton>
        <ToolbarButton label="Link" active={editor.isActive('link')} onClick={setLink}><LinkIcon size={15} /></ToolbarButton>
        <ToolbarButton label="Insert image" onClick={() => fileInputRef.current?.click()}><ImageIcon size={15} /></ToolbarButton>
        <ToolbarButton label="Insert table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon size={15} /></ToolbarButton>
        <ToolbarButton label="Align left" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeft size={15} /></ToolbarButton>
        <ToolbarButton label="Align center" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter size={15} /></ToolbarButton>
        <ToolbarButton label="Align right" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}><AlignRight size={15} /></ToolbarButton>
        <ToolbarButton label="Justify" active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}><AlignJustify size={15} /></ToolbarButton>
        <ToolbarButton label="Undo" onClick={() => editor.chain().focus().undo().run()}><Undo size={15} /></ToolbarButton>
        <ToolbarButton label="Redo" onClick={() => editor.chain().focus().redo().run()}><Redo size={15} /></ToolbarButton>
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImagePick} />
      {linkBarOpen && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg-app)' }}>
          <input
            className="form-input"
            style={{ maxWidth: 420 }}
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            placeholder="https://example.com"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); applyLink() }
              if (event.key === 'Escape') setLinkBarOpen(false)
            }}
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={applyLink}>Apply</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setLinkUrl(''); applyLink() }}>Remove link</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLinkBarOpen(false)}>Cancel</button>
        </div>
      )}
      {uploadError && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--danger-bg)', color: 'var(--danger-fg)', fontSize: 12.5 }}>
          <span>{uploadError}</span>
          <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'inherit' }} onClick={() => setUploadError('')}>Dismiss</button>
        </div>
      )}
      <div style={{ padding: 16, minHeight: 320 }}>
        <EditorContent editor={editor} />
      </div>
      <div style={{ padding: '6px 16px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
        {editor.storage.characterCount.characters()} characters · {editor.storage.characterCount.words()} words
      </div>
    </div>
  )
}
