"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Underline,
  Undo2,
  type LucideIcon,
} from "lucide-react";

export function EditorToolbar({ editor }: { editor: Editor }) {
  // Re-render only when the formatting state at the cursor changes.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-2 py-1.5"
    >
      <Btn icon={Undo2} label="Undo" disabled={!state.canUndo} onClick={() => chain().undo().run()} />
      <Btn icon={Redo2} label="Redo" disabled={!state.canRedo} onClick={() => chain().redo().run()} />
      <Sep />
      <Btn icon={Bold} label="Bold (Ctrl+B)" active={state.bold} onClick={() => chain().toggleBold().run()} />
      <Btn icon={Italic} label="Italic (Ctrl+I)" active={state.italic} onClick={() => chain().toggleItalic().run()} />
      <Btn icon={Underline} label="Underline (Ctrl+U)" active={state.underline} onClick={() => chain().toggleUnderline().run()} />
      <Sep />
      <Btn icon={Heading1} label="Heading 1" active={state.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()} />
      <Btn icon={Heading2} label="Heading 2" active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()} />
      <Btn icon={Heading3} label="Heading 3" active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()} />
      <Sep />
      <Btn icon={List} label="Bulleted list" active={state.bullet} onClick={() => chain().toggleBulletList().run()} />
      <Btn icon={ListOrdered} label="Numbered list" active={state.ordered} onClick={() => chain().toggleOrderedList().run()} />
    </div>
  );
}

function Btn({
  icon: Icon,
  label,
  onClick,
  active = false,
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // keep the editor's selection
      onClick={onClick}
      className={`rounded-md p-2 text-slate-700 hover:bg-slate-100 disabled:opacity-30 ${
        active ? "bg-blue-100 text-blue-700 hover:bg-blue-100" : ""
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

const Sep = () => <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />;
