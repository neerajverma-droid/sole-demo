"use client";

/**
 * The proposal editor's plugins — sole-webapp's
 * `components/Proposal/LexicalEditor/plugins/*`, ported as-is in behaviour and
 * restyled to this app's controls.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { OnChangePlugin as LexicalOnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { $generateHtmlFromNodes, $generateNodesFromDOM } from "@lexical/html";
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListNode,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
} from "@lexical/rich-text";
import { $patchStyleText, $setBlocksType } from "@lexical/selection";
import {
  $getNearestNodeOfType,
  $insertNodeToNearestRoot,
  mergeRegister,
} from "@lexical/utils";
import {
  $createParagraphNode,
  $createRangeSelection,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $insertNodes,
  $isElementNode,
  $isRangeSelection,
  $setSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  createCommand,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  KEY_DOWN_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
  type LexicalCommand,
  type NodeKey,
} from "lexical";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Columns2,
  Highlighter,
  ImageIcon,
  Italic,
  Link,
  Link2Off,
  List,
  ListOrdered,
  Loader2,
  Pencil,
  Plus,
  Quote,
  Redo2,
  Strikethrough,
  Trash2,
  Underline,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { apiErrorMessage } from "@/lib/api-error";
import { MERGE_TAG_GROUPS, isBlankHtml, type MergeValues } from "@/lib/proposals";
import { cn } from "@/lib/utils";
import {
  $createAttributeNode,
  $createImageNode,
  $createLayoutContainerNode,
  $createLayoutItemNode,
  $isLayoutContainerNode,
  ImageNode,
  LayoutContainerNode,
  LayoutItemNode,
} from "@/components/proposals/lexical/nodes";

export const INSERT_IMAGE_COMMAND: LexicalCommand<{ src: string; altText?: string }> =
  createCommand("INSERT_IMAGE_COMMAND");
/** Payload is a CSS grid-template-columns value, e.g. "1fr 1fr". */
export const INSERT_LAYOUT_COMMAND: LexicalCommand<string> = createCommand("INSERT_LAYOUT_COMMAND");
export const INSERT_ATTRIBUTE_COMMAND: LexicalCommand<{ label: string; value: string }> =
  createCommand("INSERT_ATTRIBUTE_COMMAND");
export const SHOW_FLOATING_LINK_EDITOR: LexicalCommand<void> = createCommand("SHOW_FLOATING_LINK_EDITOR");

/**
 * How the toolbar's Insert → Image uploads. The builder provides it (it knows
 * the proposal id); without one, the Image option isn't offered.
 */
export const EditorImageUploadContext = React.createContext<
  ((file: File) => Promise<string | null>) | null
>(null);

/* ------------------------------------------------------------------ *
 * Initial content — seeded exactly once per editor
 * ------------------------------------------------------------------ */

const TOP_LEVEL = new Set(["paragraph", "list", "heading", "quote", "image", "layout-container"]);

export function LoadInitialStatePlugin({ initialValue }: { initialValue: string }) {
  const [editor] = useLexicalComposerContext();
  const loaded = React.useRef(false);

  React.useEffect(() => {
    // One shot only: the parent writes the editor's own HTML back down on
    // every change, and reparsing that would wipe the caret mid-typing.
    if (loaded.current) return;
    loaded.current = true;

    const html = initialValue?.trim() ?? "";
    if (!html || !html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, "").trim()) {
      if (!/<img|data-lexical-layout-container/.test(html)) return;
    }

    queueMicrotask(() => {
      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const dom = new DOMParser().parseFromString(html, "text/html");
        dom.body.querySelectorAll("p").forEach((p) => {
          if (!p.textContent?.replace(/ /g, "").trim() && !p.querySelector("img")) p.remove();
        });
        for (const node of $generateNodesFromDOM(editor, dom.body)) {
          if (TOP_LEVEL.has(node.getType())) {
            root.append(node);
          } else {
            const paragraph = $createParagraphNode();
            paragraph.append(node);
            root.append(paragraph);
          }
        }
        root.selectEnd();
      });
    });
  }, [editor, initialValue]);

  return null;
}

export function HtmlOnChangePlugin({ onChange }: { onChange: (html: string) => void }) {
  const [editor] = useLexicalComposerContext();
  return (
    <LexicalOnChangePlugin
      ignoreSelectionChange
      onChange={(editorState) => {
        editorState.read(() => {
          const html = $generateHtmlFromNodes(editor);
          // An emptied editor still exports "<p><br></p>" — that's no content.
          const hasMedia = /<img|data-lexical-layout-container/.test(html);
          onChange(!hasMedia && isBlankHtml(html) ? "" : html);
        });
      }}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Images
 * ------------------------------------------------------------------ */

export function ImagesPlugin() {
  const [editor] = useLexicalComposerContext();

  React.useEffect(() => {
    if (!editor.hasNodes([ImageNode])) throw new Error("ImagesPlugin: ImageNode not registered");
    return editor.registerCommand(
      INSERT_IMAGE_COMMAND,
      ({ src, altText }) => {
        editor.update(() => {
          const selection = $getSelection();
          // A caret sitting on an empty column has no block to insert into.
          if ($isRangeSelection(selection)) {
            const anchor = selection.anchor.getNode();
            if ($isElementNode(anchor) && anchor.isShadowRoot()) {
              let target = anchor.getLastChild();
              if (!target) {
                const paragraph = $createParagraphNode();
                anchor.append(paragraph);
                target = paragraph;
              }
              if ($isElementNode(target)) target.selectEnd();
              else target.selectNext();
            }
          }
          $insertNodes([$createImageNode(src, altText || "")]);
        });
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor]);

  return null;
}

/* ------------------------------------------------------------------ *
 * Columns
 * ------------------------------------------------------------------ */

export function LayoutPlugin() {
  const [editor] = useLexicalComposerContext();
  const [activeKey, setActiveKey] = React.useState<NodeKey | null>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);

  React.useEffect(() => {
    if (!editor.hasNodes([LayoutContainerNode, LayoutItemNode])) {
      throw new Error("LayoutPlugin: layout nodes not registered");
    }
    return editor.registerCommand(
      INSERT_LAYOUT_COMMAND,
      (templateColumns) => {
        editor.update(() => {
          const container = $createLayoutContainerNode(templateColumns);
          const count = templateColumns.split(/\s+/).filter(Boolean).length || 2;
          for (let index = 0; index < count; index += 1) {
            const item = $createLayoutItemNode();
            item.append($createParagraphNode());
            container.append(item);
          }
          $insertNodeToNearestRoot(container);
          container.getFirstChild()?.selectStart();
        });
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor]);

  // Which column layout, if any, holds the caret.
  React.useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            setActiveKey(null);
            return;
          }
          let node: ReturnType<typeof selection.anchor.getNode> | null = selection.anchor.getNode();
          let key: NodeKey | null = null;
          while (node) {
            if ($isLayoutContainerNode(node)) {
              key = node.getKey();
              break;
            }
            node = node.getParent();
          }
          setActiveKey(key);
        });
      }),
    [editor],
  );

  const updatePosition = React.useCallback(() => {
    const el = activeKey ? editor.getElementByKey(activeKey) : null;
    if (!el) {
      setPos(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.top + 6, left: rect.right - 34 });
  }, [activeKey, editor]);

  React.useEffect(() => {
    updatePosition();
    if (!activeKey) return;
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [activeKey, updatePosition]);

  if (!pos) return null;

  return createPortal(
    <Button
      type="button"
      variant="outline"
      size="icon"
      title="Remove columns"
      aria-label="Remove columns"
      className="fixed z-[1000] size-7 text-destructive"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        if (!activeKey) return;
        editor.update(() => {
          const node = $getNodeByKey(activeKey);
          if (node) {
            const paragraph = $createParagraphNode();
            node.replace(paragraph);
            paragraph.selectStart();
          }
        });
        setActiveKey(null);
      }}
    >
      <Trash2 />
    </Button>,
    document.body,
  );
}

/* ------------------------------------------------------------------ *
 * Floating link editor
 * ------------------------------------------------------------------ */

export function FloatingLinkPlugin() {
  const [editor] = useLexicalComposerContext();
  const [visible, setVisible] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [url, setUrl] = React.useState("https://");
  const [isLink, setIsLink] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const refresh = React.useCallback(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    const nodes = selection.getNodes();
    const linkNode =
      nodes.find($isLinkNode) ?? (nodes[0] && $isLinkNode(nodes[0].getParent()) ? nodes[0].getParent() : null);
    if (linkNode && $isLinkNode(linkNode)) {
      setIsLink(true);
      setUrl(linkNode.getURL());
      setVisible(true);
    } else {
      setIsLink(false);
      setEditing(false);
      setUrl("https://");
      setVisible(false);
    }
  }, []);

  React.useEffect(
    () =>
      mergeRegister(
        editor.registerUpdateListener(({ editorState }) => editorState.read(refresh)),
        editor.registerCommand(
          SELECTION_CHANGE_COMMAND,
          () => {
            refresh();
            return false;
          },
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
          SHOW_FLOATING_LINK_EDITOR,
          () => {
            editor.update(() => {
              const selection = $getSelection();
              if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
              // A bare caret links its whole block, as sole-webapp does.
              const block = selection.anchor.getNode().getTopLevelElementOrThrow();
              const first = block.getFirstDescendant() ?? block;
              const last = block.getLastDescendant() ?? block;
              const range = $createRangeSelection();
              range.anchor.set(first.getKey(), 0, "text");
              range.focus.set(last.getKey(), last.getTextContentSize(), "text");
              $setSelection(range);
            });
            setVisible(true);
            setEditing(true);
            return false;
          },
          COMMAND_PRIORITY_LOW,
        ),
      ),
    [editor, refresh],
  );

  React.useEffect(() => {
    if (visible && (editing || !isLink)) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [visible, editing, isLink]);

  const apply = () => {
    const value = url.trim();
    editor.dispatchCommand(
      TOGGLE_LINK_COMMAND,
      value ? (/^https?:\/\//i.test(value) ? value : `https://${value}`) : null,
    );
    setEditing(false);
    setVisible(false);
  };

  const host = editor.getRootElement()?.parentElement;
  if (!visible || !host) return null;

  return createPortal(
    <div className="absolute left-1/2 top-12 z-[1000] flex w-[min(380px,calc(100%-16px))] -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-popover p-2 shadow-lg">
      {isLink && !editing ? (
        <>
          <Link className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 truncate text-sm text-primary underline"
          >
            {url}
          </a>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil />
            Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={() => {
              editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
              setVisible(false);
            }}
          >
            <Link2Off />
            Remove
          </Button>
        </>
      ) : (
        <>
          <Input
            ref={inputRef}
            value={url}
            placeholder="https://example.com"
            aria-label="Link URL"
            className="h-8 flex-1"
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                apply();
              }
              if (event.key === "Escape") {
                setEditing(false);
                setVisible(false);
              }
            }}
          />
          <Button type="button" size="sm" onClick={apply}>
            Save
          </Button>
        </>
      )}
    </div>,
    host,
  );
}

/* ------------------------------------------------------------------ *
 * Toolbar
 * ------------------------------------------------------------------ */

const HIGHLIGHT_COLORS = [
  { label: "None", value: "" },
  { label: "Yellow", value: "#FEF08A" },
  { label: "Green", value: "#BBF7D0" },
  { label: "Blue", value: "#BFDBFE" },
  { label: "Pink", value: "#FBCFE8" },
  { label: "Orange", value: "#FED7AA" },
] as const;

const LAYOUT_PRESETS = [
  { label: "2 columns", value: "1fr 1fr" },
  { label: "3 columns", value: "1fr 1fr 1fr" },
  { label: "4 columns", value: "1fr 1fr 1fr 1fr" },
  { label: "Left wide", value: "3fr 1fr" },
  { label: "Right wide", value: "1fr 3fr" },
] as const;

type BlockType = "normal" | "h1" | "h2" | "h3";

const BLOCK_TYPES: { label: string; type: BlockType; shortcut: string; key: string }[] = [
  { label: "Paragraph", type: "normal", shortcut: "⌘ ⌥ 0", key: "0" },
  { label: "Heading 1", type: "h1", shortcut: "⌘ ⌥ 1", key: "1" },
  { label: "Heading 2", type: "h2", shortcut: "⌘ ⌥ 2", key: "2" },
  { label: "Heading 3", type: "h3", shortcut: "⌘ ⌥ 3", key: "3" },
];

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn("size-7 shrink-0", active && "bg-primary/10 text-primary hover:bg-primary/15")}
    >
      {children}
    </Button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />;
}

export function ToolbarPlugin({ mergeValues = {} }: { mergeValues?: MergeValues }) {
  const [editor] = useLexicalComposerContext();
  const uploadImage = React.useContext(EditorImageUploadContext);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [canUndo, setCanUndo] = React.useState(false);
  const [canRedo, setCanRedo] = React.useState(false);
  const [blockType, setBlockType] = React.useState<BlockType>("normal");
  const [formats, setFormats] = React.useState({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    link: false,
    quote: false,
    bullet: false,
    number: false,
  });

  const $updateToolbar = React.useCallback(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    const anchor = selection.anchor.getNode();
    let element = null;
    try {
      element = anchor.getKey() === "root" ? null : anchor.getTopLevelElementOrThrow();
    } catch {
      element = null;
    }
    const tag = element && $isHeadingNode(element) ? element.getTag() : null;
    setBlockType(tag === "h1" || tag === "h2" || tag === "h3" ? tag : "normal");
    const first = selection.getNodes()[0];
    const list = $getNearestNodeOfType(anchor, ListNode);
    setFormats({
      bold: selection.hasFormat("bold"),
      italic: selection.hasFormat("italic"),
      underline: selection.hasFormat("underline"),
      strikethrough: selection.hasFormat("strikethrough"),
      link: Boolean(first && ($isLinkNode(first) || $isLinkNode(first.getParent()))),
      quote: Boolean(element && $isQuoteNode(element)),
      bullet: list?.getListType() === "bullet",
      number: list?.getListType() === "number",
    });
  }, []);

  const applyBlockType = React.useCallback(
    (type: BlockType) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        $setBlocksType(selection, () => (type === "normal" ? $createParagraphNode() : $createHeadingNode(type)));
      });
    },
    [editor],
  );

  React.useEffect(
    () =>
      mergeRegister(
        editor.registerUpdateListener(({ editorState }) => editorState.read($updateToolbar)),
        editor.registerCommand(
          SELECTION_CHANGE_COMMAND,
          () => {
            $updateToolbar();
            return false;
          },
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
          CAN_UNDO_COMMAND,
          (payload) => {
            setCanUndo(payload);
            return false;
          },
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
          CAN_REDO_COMMAND,
          (payload) => {
            setCanRedo(payload);
            return false;
          },
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
          INSERT_ATTRIBUTE_COMMAND,
          ({ label, value }) => {
            editor.update(() => {
              const selection = $getSelection();
              if (!$isRangeSelection(selection)) return;
              selection.insertNodes([$createAttributeNode(label, value)]);
              selection.insertText(" ");
            });
            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
        // The ⌘⌥0–3 shortcuts the style menu advertises.
        editor.registerCommand(
          KEY_DOWN_COMMAND,
          (event: KeyboardEvent) => {
            if (!(event.metaKey || event.ctrlKey) || !event.altKey) return false;
            const match = BLOCK_TYPES.find((item) => event.code === `Digit${item.key}`);
            if (!match) return false;
            event.preventDefault();
            applyBlockType(match.type);
            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
      ),
    [editor, $updateToolbar, applyBlockType],
  );

  const toggleQuote = () =>
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => (formats.quote ? $createParagraphNode() : $createQuoteNode()));
      }
    });

  const highlight = (color: string) =>
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) $patchStyleText(selection, { "background-color": color || null });
    });

  const onImageFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !uploadImage) return;
    setUploading(true);
    try {
      const src = await uploadImage(file);
      if (src) editor.dispatchCommand(INSERT_IMAGE_COMMAND, { src, altText: file.name });
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to upload image"));
    } finally {
      setUploading(false);
    }
  };

  // Only fields with a value are offered — an empty one would insert nothing.
  const attributes = MERGE_TAG_GROUPS.map((group) => ({
    ...group,
    tags: group.tags.filter((tag) => Boolean(mergeValues[tag.key]?.trim())),
  })).filter((group) => group.tags.length > 0);

  const blockLabel = BLOCK_TYPES.find((item) => item.type === blockType)?.label ?? "Paragraph";

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 px-1.5 py-1"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1 bg-background px-2 text-xs">
            {blockLabel}
            <ChevronDown className="size-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56" onCloseAutoFocus={(event) => event.preventDefault()}>
          {BLOCK_TYPES.map((item) => (
            <DropdownMenuItem
              key={item.type}
              className="justify-between"
              onSelect={() => applyBlockType(item.type)}
            >
              <span className={cn(item.type === blockType && "font-medium")}>{item.label}</span>
              <span className="text-xs text-muted-foreground">{item.shortcut}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <ToolButton label="Undo" disabled={!canUndo} onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}>
        <Undo2 />
      </ToolButton>
      <ToolButton label="Redo" disabled={!canRedo} onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}>
        <Redo2 />
      </ToolButton>
      <Divider />
      <ToolButton label="Bold" active={formats.bold} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}>
        <Bold />
      </ToolButton>
      <ToolButton label="Italic" active={formats.italic} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}>
        <Italic />
      </ToolButton>
      <ToolButton
        label="Underline"
        active={formats.underline}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline")}
      >
        <Underline />
      </ToolButton>
      <ToolButton
        label="Strikethrough"
        active={formats.strikethrough}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough")}
      >
        <Strikethrough />
      </ToolButton>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="size-7" title="Highlight color" aria-label="Highlight color">
            <Highlighter />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44" onCloseAutoFocus={(event) => event.preventDefault()}>
          <div className="flex flex-wrap gap-1 p-1">
            {HIGHLIGHT_COLORS.map((color) => (
              <DropdownMenuItem
                key={color.label}
                title={color.label}
                aria-label={color.label}
                onSelect={() => highlight(color.value)}
                className="size-7 justify-center rounded-md border border-border p-0 focus:ring-2 focus:ring-primary/30"
                style={{ backgroundColor: color.value || undefined }}
              >
                {!color.value && <span className="text-[10px] text-muted-foreground">✕</span>}
              </DropdownMenuItem>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <Divider />
      <ToolButton
        label="Insert link"
        active={formats.link}
        onClick={() => editor.dispatchCommand(SHOW_FLOATING_LINK_EDITOR, undefined)}
      >
        <Link />
      </ToolButton>
      <Divider />
      <ToolButton label="Left align" onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "left")}>
        <AlignLeft />
      </ToolButton>
      <ToolButton label="Center align" onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "center")}>
        <AlignCenter />
      </ToolButton>
      <ToolButton label="Right align" onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "right")}>
        <AlignRight />
      </ToolButton>
      <ToolButton label="Justify" onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "justify")}>
        <AlignJustify />
      </ToolButton>
      <Divider />
      <ToolButton label="Quote" active={formats.quote} onClick={toggleQuote}>
        <Quote />
      </ToolButton>
      <ToolButton
        label="Bullet list"
        active={formats.bullet}
        onClick={() =>
          editor.dispatchCommand(formats.bullet ? REMOVE_LIST_COMMAND : INSERT_UNORDERED_LIST_COMMAND, undefined)
        }
      >
        <List />
      </ToolButton>
      <ToolButton
        label="Numbered list"
        active={formats.number}
        onClick={() =>
          editor.dispatchCommand(formats.number ? REMOVE_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND, undefined)
        }
      >
        <ListOrdered />
      </ToolButton>
      <Divider />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="size-7" title="Insert columns" aria-label="Insert columns">
            <Columns2 />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44" onCloseAutoFocus={(event) => event.preventDefault()}>
          {LAYOUT_PRESETS.map((preset) => (
            <DropdownMenuItem
              key={preset.value}
              onSelect={() => editor.dispatchCommand(INSERT_LAYOUT_COMMAND, preset.value)}
            >
              <Columns2 className="opacity-60" />
              {preset.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {uploadImage && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" disabled={uploading}>
                {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                Insert
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
                <ImageIcon className="opacity-60" />
                Image
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onImageFile} />
        </>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="ml-1 h-7 bg-background px-2 text-xs">
            + Add Attribute
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60" onCloseAutoFocus={(event) => event.preventDefault()}>
          {attributes.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">No attributes available</p>
          ) : (
            attributes.map((group, index) => (
              <React.Fragment key={group.label}>
                {index > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-xs text-muted-foreground">{group.label}</DropdownMenuLabel>
                {group.tags.map((tag) => (
                  <DropdownMenuItem
                    key={tag.key}
                    onSelect={() =>
                      editor.dispatchCommand(INSERT_ATTRIBUTE_COMMAND, {
                        label: tag.label,
                        value: `{{${tag.key}}}`,
                      })
                    }
                  >
                    {tag.label}
                  </DropdownMenuItem>
                ))}
              </React.Fragment>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
