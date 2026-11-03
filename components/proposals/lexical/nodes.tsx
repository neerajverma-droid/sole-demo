"use client";

/**
 * The proposal editor's custom Lexical nodes — ported from sole-webapp's
 * `components/Proposal/LexicalEditor/{AttributeNode,nodes/*}`. Their HTML
 * export is unchanged, so content saved by either app round-trips.
 */

import * as React from "react";
import {
  $applyNodeReplacement,
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  DecoratorNode,
  ElementNode,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedElementNode,
  type SerializedLexicalNode,
  type Spread,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { mergeRegister } from "@lexical/utils";

import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Attribute (merge-field pill)
 * ------------------------------------------------------------------ */

type SerializedAttributeNode = Spread<{ label: string; value: string }, SerializedLexicalNode>;

/**
 * Shown as a pill; exported as its raw `{{tag}}` so the merge-tag pass can
 * resolve it in the saved HTML.
 */
export class AttributeNode extends DecoratorNode<React.ReactElement> {
  __label: string;
  __value: string;

  static getType(): string {
    return "attribute";
  }

  static clone(node: AttributeNode): AttributeNode {
    return new AttributeNode(node.__label, node.__value, node.__key);
  }

  constructor(label: string, value: string, key?: NodeKey) {
    super(key);
    this.__label = label;
    this.__value = value;
  }

  createDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "attribute-pill";
    span.contentEditable = "false";
    return span;
  }

  updateDOM(): false {
    return false;
  }

  exportDOM(): DOMExportOutput {
    const span = document.createElement("span");
    span.textContent = this.__value;
    return { element: span };
  }

  decorate(): React.ReactElement {
    return (
      <span className="rounded-full bg-warning/15 px-2 py-0.5 text-warning">{this.__label}</span>
    );
  }

  static importJSON(serialized: SerializedAttributeNode): AttributeNode {
    return new AttributeNode(serialized.label, serialized.value);
  }

  exportJSON(): SerializedAttributeNode {
    return { ...super.exportJSON(), type: "attribute", version: 1, label: this.__label, value: this.__value };
  }

  isInline(): true {
    return true;
  }
}

export function $createAttributeNode(label: string, value: string): AttributeNode {
  return new AttributeNode(label, value);
}

/* ------------------------------------------------------------------ *
 * Image (resizable)
 * ------------------------------------------------------------------ */

type Dimension = number | "inherit";

type SerializedImageNode = Spread<
  { src: string; altText: string; width: Dimension; height: Dimension },
  SerializedLexicalNode
>;

const HANDLES = [
  { key: "nw", dir: -1 },
  { key: "ne", dir: 1 },
  { key: "sw", dir: -1 },
  { key: "se", dir: 1 },
] as const;

function ImageResizer({
  editor,
  imageRef,
  onResizeStart,
  onResizeEnd,
}: {
  editor: LexicalEditor;
  imageRef: React.RefObject<HTMLImageElement | null>;
  onResizeStart: () => void;
  onResizeEnd: (width: number) => void;
}) {
  const state = React.useRef({ startX: 0, startWidth: 0, currentWidth: 0, dir: 1 });

  const start = (event: React.PointerEvent, dir: number) => {
    event.preventDefault();
    event.stopPropagation();
    const image = imageRef.current;
    if (!image) return;
    const { width } = image.getBoundingClientRect();
    state.current = { startX: event.clientX, startWidth: width, currentWidth: width, dir };
    onResizeStart();
    const maxWidth = editor.getRootElement()?.clientWidth ?? 9999;

    const move = (moveEvent: PointerEvent) => {
      const delta = (moveEvent.clientX - state.current.startX) * state.current.dir;
      const next = Math.min(Math.max(50, state.current.startWidth + delta), maxWidth);
      state.current.currentWidth = next;
      image.style.width = `${next}px`;
      image.style.height = "auto";
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      onResizeEnd(Math.round(state.current.currentWidth));
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  };

  return (
    <>
      {HANDLES.map((handle) => (
        <div
          key={handle.key}
          className={`image-resizer ${handle.key}`}
          onPointerDown={(event) => start(event, handle.dir)}
        />
      ))}
    </>
  );
}

function ImageComponent({
  src,
  altText,
  width,
  height,
  nodeKey,
}: {
  src: string;
  altText: string;
  width: Dimension;
  height: Dimension;
  nodeKey: NodeKey;
}) {
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);
  const imageRef = React.useRef<HTMLImageElement>(null);
  const [resizing, setResizing] = React.useState(false);

  const onDelete = React.useCallback(
    (event: KeyboardEvent) => {
      if (isSelected && $isNodeSelection($getSelection())) {
        event.preventDefault();
        const node = $getNodeByKey(nodeKey);
        if ($isImageNode(node)) node.remove();
        return true;
      }
      return false;
    },
    [isSelected, nodeKey],
  );

  React.useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          CLICK_COMMAND,
          (event: MouseEvent) => {
            if (event.target === imageRef.current) {
              if (!event.shiftKey) clearSelection();
              setSelected(!isSelected);
              return true;
            }
            return false;
          },
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(KEY_DELETE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
        editor.registerCommand(KEY_BACKSPACE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
      ),
    [editor, isSelected, onDelete, setSelected, clearSelection],
  );

  const onResizeEnd = (next: number) => {
    // Let the pointer events settle before the model updates.
    setTimeout(() => setResizing(false), 200);
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isImageNode(node)) node.setWidthAndHeight(next, "inherit");
    });
  };

  return (
    <span className="editor-image-wrap">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        src={src}
        alt={altText}
        draggable={false}
        className={cn("editor-image", (isSelected || resizing) && "selected")}
        style={{
          width: width === "inherit" ? "inherit" : width,
          height: height === "inherit" ? "inherit" : height,
          maxWidth: "100%",
        }}
      />
      {isSelected && (
        <ImageResizer
          editor={editor}
          imageRef={imageRef}
          onResizeStart={() => setResizing(true)}
          onResizeEnd={onResizeEnd}
        />
      )}
    </span>
  );
}

export class ImageNode extends DecoratorNode<React.ReactElement> {
  __src: string;
  __altText: string;
  __width: Dimension;
  __height: Dimension;

  static getType(): string {
    return "image";
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(node.__src, node.__altText, node.__width, node.__height, node.__key);
  }

  constructor(src: string, altText = "", width: Dimension = "inherit", height: Dimension = "inherit", key?: NodeKey) {
    super(key);
    this.__src = src;
    this.__altText = altText;
    this.__width = width;
    this.__height = height;
  }

  setWidthAndHeight(width: Dimension, height: Dimension): void {
    const self = this.getWritable();
    self.__width = width;
    self.__height = height;
  }

  static importJSON(serialized: SerializedImageNode): ImageNode {
    return new ImageNode(serialized.src, serialized.altText, serialized.width ?? "inherit", serialized.height ?? "inherit");
  }

  exportJSON(): SerializedImageNode {
    return {
      ...super.exportJSON(),
      type: "image",
      version: 1,
      src: this.__src,
      altText: this.__altText,
      width: this.__width,
      height: this.__height,
    };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      img: () => ({
        priority: 0,
        conversion: (element: HTMLElement): DOMConversionOutput => {
          const img = element as HTMLImageElement;
          const styleWidth = parseInt(img.style.width || "", 10);
          const attrWidth = parseInt(img.getAttribute("width") || "", 10);
          const width = !Number.isNaN(styleWidth) ? styleWidth : !Number.isNaN(attrWidth) ? attrWidth : "inherit";
          return { node: new ImageNode(img.getAttribute("src") || "", img.getAttribute("alt") || "", width, "inherit") };
        },
      }),
    };
  }

  exportDOM(): DOMExportOutput {
    const img = document.createElement("img");
    img.setAttribute("src", this.__src);
    img.setAttribute("alt", this.__altText);
    const width = typeof this.__width === "number" ? `width:${this.__width}px;` : "";
    // Inline so it sizes correctly in the read-only proposal.
    img.setAttribute("style", `${width}max-width:100%;height:auto;border-radius:8px;`);
    return { element: img };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const span = document.createElement("span");
    const className = config.theme?.image;
    if (className) span.className = className;
    return span;
  }

  updateDOM(): false {
    return false;
  }

  decorate(): React.ReactElement {
    return (
      <ImageComponent
        src={this.__src}
        altText={this.__altText}
        width={this.__width}
        height={this.__height}
        nodeKey={this.getKey()}
      />
    );
  }
}

export function $createImageNode(src: string, altText = ""): ImageNode {
  return new ImageNode(src, altText);
}

export function $isImageNode(node: LexicalNode | null | undefined): node is ImageNode {
  return node instanceof ImageNode;
}

/* ------------------------------------------------------------------ *
 * Column layout
 * ------------------------------------------------------------------ */

type SerializedLayoutContainerNode = Spread<{ templateColumns: string }, SerializedElementNode>;

export class LayoutContainerNode extends ElementNode {
  __templateColumns: string;

  constructor(templateColumns: string, key?: NodeKey) {
    super(key);
    this.__templateColumns = templateColumns;
  }

  static getType(): string {
    return "layout-container";
  }

  static clone(node: LayoutContainerNode): LayoutContainerNode {
    return new LayoutContainerNode(node.__templateColumns, node.__key);
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = document.createElement("div");
    dom.style.display = "grid";
    dom.style.gridTemplateColumns = this.__templateColumns;
    dom.style.gap = "16px";
    const className = config.theme?.layoutContainer;
    if (className) dom.className = className;
    return dom;
  }

  updateDOM(prevNode: LayoutContainerNode, dom: HTMLElement): boolean {
    if (prevNode.__templateColumns !== this.__templateColumns) {
      dom.style.gridTemplateColumns = this.__templateColumns;
    }
    return false;
  }

  exportDOM(): DOMExportOutput {
    const el = document.createElement("div");
    el.setAttribute("style", `display:grid;grid-template-columns:${this.__templateColumns};gap:16px;`);
    el.setAttribute("data-lexical-layout-container", "true");
    return { element: el };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute("data-lexical-layout-container")) return null;
        return {
          priority: 2,
          conversion: (element: HTMLElement) => ({
            node: $createLayoutContainerNode(element.style?.gridTemplateColumns || "1fr 1fr"),
          }),
        };
      },
    };
  }

  static importJSON(json: SerializedLayoutContainerNode): LayoutContainerNode {
    return $createLayoutContainerNode(json.templateColumns);
  }

  exportJSON(): SerializedLayoutContainerNode {
    return { ...super.exportJSON(), type: "layout-container", version: 1, templateColumns: this.__templateColumns };
  }

  canBeEmpty(): false {
    return false;
  }

  canIndent(): false {
    return false;
  }
}

export function $createLayoutContainerNode(templateColumns = "1fr 1fr"): LayoutContainerNode {
  return $applyNodeReplacement(new LayoutContainerNode(templateColumns));
}

export function $isLayoutContainerNode(node: LexicalNode | null | undefined): node is LayoutContainerNode {
  return node instanceof LayoutContainerNode;
}

export class LayoutItemNode extends ElementNode {
  static getType(): string {
    return "layout-item";
  }

  static clone(node: LayoutItemNode): LayoutItemNode {
    return new LayoutItemNode(node.__key);
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = document.createElement("div");
    dom.style.minWidth = "0";
    const className = config.theme?.layoutItem;
    if (className) dom.className = className;
    return dom;
  }

  updateDOM(): false {
    return false;
  }

  exportDOM(): DOMExportOutput {
    const el = document.createElement("div");
    el.setAttribute("data-lexical-layout-item", "true");
    el.setAttribute("style", "min-width:0;");
    return { element: el };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute("data-lexical-layout-item")) return null;
        return { priority: 2, conversion: () => ({ node: $createLayoutItemNode() }) };
      },
    };
  }

  static importJSON(): LayoutItemNode {
    return $createLayoutItemNode();
  }

  exportJSON(): SerializedElementNode {
    return { ...super.exportJSON(), type: "layout-item", version: 1 };
  }

  isShadowRoot(): true {
    return true;
  }

  // A column always keeps one block child, or the caret can land on this
  // shadow root and break inserts (see ImagesPlugin's selection repair).
  canBeEmpty(): false {
    return false;
  }
}

export function $createLayoutItemNode(): LayoutItemNode {
  return $applyNodeReplacement(new LayoutItemNode());
}
