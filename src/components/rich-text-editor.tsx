import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle, FontSize, Color } from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { DOMSerializer } from "@tiptap/pm/model";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Highlighter,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Minus,
  Link as LinkIcon,
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Table as TableIcon,
  Undo,
  Redo,
  Eraser,
  Palette,
  Type,
} from "lucide-react";

type Props = {
  value?: string;
  onChange?: (html: string) => void;
  editable?: boolean;
  placeholder?: string;
  paged?: boolean;
  minHeight?: string;
};

function ToolbarBtn({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-sm transition hover:bg-accent disabled:opacity-40 ${active ? "bg-accent text-accent-foreground" : ""}`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-1 h-5 w-px bg-border" />;
}

function Toolbar({ editor, onAskAI }: { editor: Editor; onAskAI: () => void }) {
  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL du lien", prev ?? "https://");
    if (url === null) return;
    if (url === "") return editor.chain().focus().extendMarkRange("link").unsetLink().run();
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };
  const insertImage = () => {
    const url = window.prompt("URL de l'image");
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };
  const insertTable = () =>
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();

  const blockValue = editor.isActive("heading", { level: 1 })
    ? "h1"
    : editor.isActive("heading", { level: 2 })
      ? "h2"
      : editor.isActive("heading", { level: 3 })
        ? "h3"
        : editor.isActive("blockquote")
          ? "quote"
          : "p";

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b bg-card/95 px-2 py-1.5 backdrop-blur">
      <ToolbarBtn
        title="Annuler"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      >
        <Undo className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Rétablir"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      >
        <Redo className="h-4 w-4" />
      </ToolbarBtn>
      <Sep />
      <select
        className="h-8 rounded-md border bg-background px-1.5 text-xs"
        value={blockValue}
        onChange={(e) => {
          const v = e.target.value;
          const c = editor.chain().focus();
          if (v === "p") c.setParagraph().run();
          else if (v === "quote") c.toggleBlockquote().run();
          else c.toggleHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
        }}
      >
        <option value="p">Paragraphe</option>
        <option value="h1">Titre 1</option>
        <option value="h2">Titre 2</option>
        <option value="h3">Titre 3</option>
        <option value="quote">Citation</option>
      </select>
      <select
        className="h-8 rounded-md border bg-background px-1.5 text-xs"
        value={(editor.getAttributes("textStyle").fontFamily as string) || ""}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) editor.chain().focus().unsetFontFamily().run();
          else editor.chain().focus().setFontFamily(v).run();
        }}
      >
        <option value="">Police</option>
        <option value="Inter, sans-serif">Inter</option>
        <option value="Georgia, serif">Georgia</option>
        <option value="Times New Roman, serif">Times</option>
        <option value="Arial, sans-serif">Arial</option>
        <option value="Courier New, monospace">Courier</option>
      </select>
      <div className="flex items-center gap-1">
        <Type className="h-4 w-4 text-muted-foreground" />
        <select
          className="h-8 rounded-md border bg-background px-1.5 text-xs"
          value={(editor.getAttributes("textStyle").fontSize as string) || ""}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) editor.chain().focus().unsetFontSize().run();
            else editor.chain().focus().setFontSize(v).run();
          }}
        >
          <option value="">Taille</option>
          {[
            "10px",
            "12px",
            "14px",
            "16px",
            "18px",
            "20px",
            "24px",
            "30px",
            "36px",
            "48px",
            "60px",
            "72px",
          ].map((s) => (
            <option key={s} value={s}>
              {s.replace("px", "")}
            </option>
          ))}
        </select>
      </div>
      <Sep />
      <ToolbarBtn
        title="Gras"
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
      >
        <Bold className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Italique"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
      >
        <Italic className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Souligné"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
      >
        <UnderlineIcon className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Barré"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive("strike")}
      >
        <Strikethrough className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Code"
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive("code")}
      >
        <Code className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Surligner"
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        active={editor.isActive("highlight")}
      >
        <Highlighter className="h-4 w-4" />
      </ToolbarBtn>
      <label
        className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md px-1.5 hover:bg-accent"
        title="Couleur du texte"
      >
        <Palette className="h-4 w-4" />
        <input
          type="color"
          className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
          value={(editor.getAttributes("textStyle").color as string) || "#000000"}
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
        />
      </label>
      <Sep />
      <ToolbarBtn
        title="Aligner à gauche"
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        active={editor.isActive({ textAlign: "left" })}
      >
        <AlignLeft className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Centrer"
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        active={editor.isActive({ textAlign: "center" })}
      >
        <AlignCenter className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Aligner à droite"
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        active={editor.isActive({ textAlign: "right" })}
      >
        <AlignRight className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Justifier"
        onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        active={editor.isActive({ textAlign: "justify" })}
      >
        <AlignJustify className="h-4 w-4" />
      </ToolbarBtn>
      <Sep />
      <ToolbarBtn
        title="Liste à puces"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
      >
        <List className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Liste numérotée"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Liste de tâches"
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        active={editor.isActive("taskList")}
      >
        <ListChecks className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Citation"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive("blockquote")}
      >
        <Quote className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Séparateur"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        <Minus className="h-4 w-4" />
      </ToolbarBtn>
      <Sep />
      <ToolbarBtn title="Insérer un lien" onClick={setLink} active={editor.isActive("link")}>
        <LinkIcon className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Insérer une image" onClick={insertImage}>
        <ImageIcon className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Insérer un tableau" onClick={insertTable}>
        <TableIcon className="h-4 w-4" />
      </ToolbarBtn>
      <Sep />
      <ToolbarBtn
        title="Effacer le formatage"
        onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
      >
        <Eraser className="h-4 w-4" />
      </ToolbarBtn>
      <Sep />
      <button
        type="button"
        title="Éditer avec l'IA"
        onClick={onAskAI}
        className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Éditer avec l'IA
      </button>
    </div>
  );
}

export function RichTextEditor({
  value = "",
  onChange,
  editable = true,
  placeholder = "Commencez à écrire…",
  paged = true,
  minHeight = "60vh",
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false, underline: false }),
      Underline,
      TextStyle,
      Color,
      FontSize,
      FontFamily,
      Highlight.configure({ multicolor: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { class: "text-primary underline" },
      }),
      Image.configure({ inline: false, HTMLAttributes: { class: "rounded-md max-w-full" } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder }),
    ],
    editable,
    content: value,
    editorProps: {
      attributes: {
        class: `prose prose-sm sm:prose-base dark:prose-invert max-w-none focus:outline-none ${paged ? "" : "p-4"}`,
        style: `min-height:${minHeight}`,
      },
    },
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  });

  // Sync external value updates
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || "<p></p>", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  useEffect(() => {
    if (editor) editor.setEditable(editable);
  }, [editable, editor]);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const runAI = async () => {
    if (!editor) return;
    const instruction = aiInstruction.trim();
    if (!instruction) return;
    setAiLoading(true);
    try {
      const { from, to, empty } = editor.state.selection;
      let scopedHtml = "";
      let isSelection = false;
      if (!empty && to > from) {
        const slice = editor.state.doc.slice(from, to);
        const serializer = DOMSerializer.fromSchema(editor.schema);
        const div = document.createElement("div");
        div.appendChild(serializer.serializeFragment(slice.content));
        scopedHtml = div.innerHTML;
        isSelection = true;
      } else {
        scopedHtml = editor.getHTML();
      }

      const system =
        "Tu es un assistant d'édition de texte. Tu reçois un fragment HTML et une instruction. " +
        "Applique strictement l'instruction et renvoie UNIQUEMENT le HTML modifié, sans balises <html>/<body>, " +
        "sans bloc de code Markdown, sans explication. Conserve la structure HTML (balises, listes, titres) " +
        "lorsque cela est pertinent. Réponds dans la même langue que le contenu d'origine.";
      const userMsg =
        `Instruction: ${instruction}\n\nHTML à modifier:\n${scopedHtml}\n\nRenvoie le HTML modifié.`;

      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: { system, messages: [{ role: "user", content: userMsg }] },
      });
      if (error) throw error;
      let reply: string = data?.reply ?? "";
      reply = reply.trim().replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim();
      if (!reply) throw new Error("Réponse vide");

      if (isSelection) {
        editor.chain().focus().deleteRange({ from, to }).insertContent(reply).run();
      } else {
        editor.chain().focus().setContent(reply, { emitUpdate: true }).run();
        onChange?.(editor.getHTML());
      }
      toast.success("Modifications appliquées");
      setAiOpen(false);
      setAiInstruction("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur IA");
    } finally {
      setAiLoading(false);
    }
  };

  if (!editor) return null;

  return (
    <div className="flex flex-col">
      {editable && <Toolbar editor={editor} onAskAI={() => setAiOpen(true)} />}
      <div className={paged ? "flex justify-center bg-muted/40 p-4 sm:p-8" : ""}>
        <div
          className={
            paged
              ? "w-full max-w-[820px] rounded-md bg-background px-6 py-10 shadow-sm sm:px-16 sm:py-14"
              : ""
          }
        >
          <EditorContent editor={editor} />
        </div>
      </div>
      <Dialog open={aiOpen} onOpenChange={(o) => !aiLoading && setAiOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Éditer avec l'IA
            </DialogTitle>
            <DialogDescription>
              Décrivez la modification à appliquer. Si du texte est sélectionné, seule la sélection
              sera modifiée — sinon, l'ensemble du document.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            value={aiInstruction}
            onChange={(e) => setAiInstruction(e.target.value)}
            placeholder="Ex : reformule en plus formel, corrige les fautes, traduis en anglais, ajoute une conclusion…"
            rows={5}
            disabled={aiLoading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                runAI();
              }
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAiOpen(false)} disabled={aiLoading}>
              Annuler
            </Button>
            <Button onClick={runAI} disabled={aiLoading || !aiInstruction.trim()}>
              {aiLoading ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" /> En cours…
                </>
              ) : (
                <>
                  <Sparkles className="mr-1 h-4 w-4" /> Appliquer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RichTextEditor;
