import React, { useRef, useState, KeyboardEvent, useEffect } from 'react';
import { FormattingToolbar } from './FormattingToolbar';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  attachments: Attachment[];
  onAddAttachment: (files: File[]) => void;
  onRemoveAttachment: (id: number) => void;
}

export type Attachment = { id: number; file: File };

export function RichTextEditor({
  value,
  onChange,
  className,
  attachments,
  onAddAttachment,
  onRemoveAttachment,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const [showAttachInput, setShowAttachInput] = useState(true);

  // Function to place cursor at the end of content
  const placeCursorAtEnd = () => {
    if (editorRef.current) {
      const selection = window.getSelection();
      const range = document.createRange();
      
      // Select the last child node or the editor itself if empty
      const lastNode = editorRef.current.lastChild || editorRef.current;
      range.selectNodeContents(lastNode);
      range.collapse(false); // false means collapse to end
      
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  };

  // Place cursor at end when component mounts or value changes
  useEffect(() => {
    if (editorRef.current) {
      placeCursorAtEnd();
    }
  }, [value]);

  const handleFormat = (format: string) => {
    if (!editorRef.current) return;

    switch (format) {
      case 'alignLeft':
        document.execCommand('justifyLeft', false);
        break;
      case 'alignCenter':
        document.execCommand('justifyCenter', false);
        break;
      case 'alignRight':
        document.execCommand('justifyRight', false);
        break;
      case 'bulletList': {
        const selection = window.getSelection();
        if (selection?.rangeCount) {
          const range = selection.getRangeAt(0);
          const list = document.createElement('ul');
          list.style.listStyleType = 'disc';
          list.style.marginLeft = '1.5em';
          list.style.paddingLeft = '0.5em';
          const listItem = document.createElement('li');
          listItem.textContent = '\u200B'; // Zero-width space
          list.appendChild(listItem);
          range.deleteContents();
          range.insertNode(list);
          range.setStart(listItem, 0);
          range.setEnd(listItem, 0);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        break;
      }
      case 'numberedList': {
        const selection = window.getSelection();
        if (selection?.rangeCount) {
          const range = selection.getRangeAt(0);
          const list = document.createElement('ol');
          list.style.listStyleType = 'decimal';
          list.style.marginLeft = '1.5em';
          list.style.paddingLeft = '0.5em';
          const listItem = document.createElement('li');
          listItem.textContent = '\u200B'; // Zero-width space
          list.appendChild(listItem);
          range.deleteContents();
          range.insertNode(list);
          range.setStart(listItem, 0);
          range.setEnd(listItem, 0);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        break;
      }
      case 'quote':
        document.execCommand('formatBlock', false, 'blockquote');
        break;
      case 'code':
        document.execCommand('formatBlock', false, 'pre');
        break;
      default:
        document.execCommand(format, false);
    }
    editorRef.current.focus();
  };

  const handleUndo = () => {
    document.execCommand('undo', false);
    editorRef.current?.focus();
  };

  const handleRedo = () => {
    document.execCommand('redo', false);
    editorRef.current?.focus();
  };

  const handleInsertLink = () => {
    const url = prompt('Enter URL:');
    if (url) {
      document.execCommand('createLink', false, url);
    }
    editorRef.current?.focus();
  };

  const handleInsertImage = () => {
    fileInputRef.current?.click();
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const imageUrl = e.target?.result as string;
        if (imageUrl) {
          document.execCommand('insertImage', false, imageUrl);
          editorRef.current?.focus();
        }
      };
      reader.readAsDataURL(file);
    }
    // Reset the input value so the same file can be selected again
    event.target.value = '';
  };

  const handleFileAttach = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      onAddAttachment(Array.from(files));
    }
    event.target.value = '';
  };

  const handleRemoveAttachment = (id: number) => {
    onRemoveAttachment(id);
    setShowAttachInput(false);
    setTimeout(() => setShowAttachInput(true), 0);
  };

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Allow default behavior for backspace and delete
    if (e.key === 'Backspace' || e.key === 'Delete') {
      return;
    }

    // Handle other keyboard shortcuts
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          handleFormat('bold');
          break;
        case 'i':
          e.preventDefault();
          handleFormat('italic');
          break;
        case 'u':
          e.preventDefault();
          handleFormat('underline');
          break;
        case 'z':
          e.preventDefault();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
          break;
        case 'y':
          e.preventDefault();
          handleRedo();
          break;
      }
    }
  };

  const handleFocus = () => {
    placeCursorAtEnd();
  };

  return (
    <div className={`flex flex-col border rounded-md bg-background ${className}`}>
      <FormattingToolbar
        onFormat={handleFormat}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onInsertLink={handleInsertLink}
        onInsertImage={handleInsertImage}
      />
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleImageUpload}
      />
      {showAttachInput && (
        <input
          type="file"
          ref={attachInputRef}
          className="hidden"
          multiple
          onChange={handleFileAttach}
        />
      )}
      <div
        ref={editorRef}
        contentEditable
        className="flex-1 p-3 min-h-[200px] focus:outline-none [&>ul]:list-disc [&>ul]:ml-6 [&>ul]:pl-2 [&>ol]:list-decimal [&>ol]:ml-6 [&>ol]:pl-2"
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        dangerouslySetInnerHTML={{ __html: value }}
        suppressContentEditableWarning
      />
      {attachments.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {attachments.map(att => (
            <div key={att.id} className="flex items-center gap-2 bg-muted px-2 py-1 rounded">
              <span className="truncate max-w-xs" title={att.file.name}>{att.file.name}</span>
              <button
                type="button"
                className="text-red-500 hover:text-red-700 text-xs font-bold"
                onClick={() => handleRemoveAttachment(att.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 