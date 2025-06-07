import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link,
  Image,
  Code,
  Quote,
  Undo,
  Redo,
  Paperclip,
} from 'lucide-react';

interface FormattingToolbarProps {
  onFormat: (format: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onInsertLink: () => void;
  onInsertImage: () => void;
  onAttachFile?: () => void;
}

export function FormattingToolbar({
  onFormat,
  onUndo,
  onRedo,
  onInsertLink,
  onInsertImage,
  onAttachFile,
}: FormattingToolbarProps) {
  return (
    <div className="flex items-center gap-1 p-2 border-b bg-background">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onUndo}
          className="h-8 w-8"
        >
          <Undo className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRedo}
          className="h-8 w-8"
        >
          <Redo className="h-4 w-4" />
        </Button>
      </div>

      <div className="h-6 w-px bg-border mx-1" />

      <div className="flex items-center gap-1">
        <Toggle
          size="sm"
          pressed={false}
          onPressedChange={() => onFormat('bold')}
          className="h-8 w-8"
        >
          <Bold className="h-4 w-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={false}
          onPressedChange={() => onFormat('italic')}
          className="h-8 w-8"
        >
          <Italic className="h-4 w-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={false}
          onPressedChange={() => onFormat('underline')}
          className="h-8 w-8"
        >
          <Underline className="h-4 w-4" />
        </Toggle>
      </div>

      <div className="h-6 w-px bg-border mx-1" />

      <div className="flex items-center gap-1">
        <Toggle
          size="sm"
          pressed={false}
          onPressedChange={() => onFormat('alignLeft')}
          className="h-8 w-8"
        >
          <AlignLeft className="h-4 w-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={false}
          onPressedChange={() => onFormat('alignCenter')}
          className="h-8 w-8"
        >
          <AlignCenter className="h-4 w-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={false}
          onPressedChange={() => onFormat('alignRight')}
          className="h-8 w-8"
        >
          <AlignRight className="h-4 w-4" />
        </Toggle>
      </div>

      <div className="h-6 w-px bg-border mx-1" />

      <div className="flex items-center gap-1">
        <Toggle
          size="sm"
          pressed={false}
          onPressedChange={() => onFormat('bulletList')}
          className="h-8 w-8"
        >
          <List className="h-4 w-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={false}
          onPressedChange={() => onFormat('numberedList')}
          className="h-8 w-8"
        >
          <ListOrdered className="h-4 w-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={false}
          onPressedChange={() => onFormat('quote')}
          className="h-8 w-8"
        >
          <Quote className="h-4 w-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={false}
          onPressedChange={() => onFormat('code')}
          className="h-8 w-8"
        >
          <Code className="h-4 w-4" />
        </Toggle>
      </div>

      <div className="h-6 w-px bg-border mx-1" />

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            onInsertLink();
          }}
          className="h-8 w-8"
        >
          <Link className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            onInsertImage();
          }}
          className="h-8 w-8"
        >
          <Image className="h-4 w-4" />
        </Button>
        {onAttachFile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              onAttachFile();
            }}
            className="h-8 w-8"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
} 