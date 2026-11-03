"use client";

import * as React from "react";
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import { LexicalComposer, type InitialConfigType } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import {
  $isTextNode,
  isHTMLElement,
  ParagraphNode,
  TextNode,
  type DOMConversionMap,
  type DOMExportOutput,
  type DOMExportOutputMap,
  type Klass,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";

import {
  AttributeNode,
  ImageNode,
  LayoutContainerNode,
  LayoutItemNode,
} from "@/components/proposals/lexical/nodes";
import {
  FloatingLinkPlugin,
  HtmlOnChangePlugin,
  ImagesPlugin,
  LayoutPlugin,
  LoadInitialStatePlugin,
  ToolbarPlugin,
} from "@/components/proposals/lexical/plugins";
import { renderMergeTags, type MergeValues } from "@/lib/proposals";
import { cn } from "@/lib/utils";

export { EditorImageUploadContext } from "@/components/proposals/lexical/plugins";

/* ------------------------------------------------------------------ *
 * HTML import/export — sole-webapp's own rules
 * ------------------------------------------------------------------ */

/** Drops editor-only class names but keeps inline styles (highlight, colour). */
function exportWithoutClasses(editor: LexicalEditor, target: LexicalNode): DOMExportOutput {
  const output = target.exportDOM(editor);
  if (output && isHTMLElement(output.element)) {
    for (const el of [output.element, ...Array.from(output.element.querySelectorAll("[class]"))]) {
      el.removeAttribute("class");
    }
  }
  return output;
}

const EXPORT_MAP: DOMExportOutputMap = new Map<Klass<LexicalNode>, (editor: LexicalEditor, target: LexicalNode) => DOMExportOutput>([
  [ParagraphNode, exportWithoutClasses],
  [TextNode, exportWithoutClasses],
]);

const allowedFontSize = (input: string) => {
  const match = String(input || "").match(/^(\d+(?:\.\d+)?)px$/);
  return match && Number(match[1]) >= 8 && Number(match[1]) <= 72 ? input : "";
};
const allowedColor = (input: string) => (/^rgb\(\d+, \d+, \d+\)$/.test(input) ? input : "");

function extraStyles(element: HTMLElement): string {
  let styles = "";
  const fontSize = allowedFontSize(element.style.fontSize);
  const background = allowedColor(element.style.backgroundColor);
  const color = allowedColor(element.style.color);
  if (fontSize && fontSize !== "15px") styles += `font-size: ${fontSize};`;
  if (background && background !== "rgb(255, 255, 255)") styles += `background-color: ${background};`;
  if (color && color !== "rgb(0, 0, 0)") styles += `color: ${color};`;
  return styles;
}

/** Text importers that also carry inline highlight/colour/size back in. */
function buildImportMap(): DOMConversionMap {
  const importMap: DOMConversionMap = {};
  for (const [tag, fn] of Object.entries(TextNode.importDOM() ?? {})) {
    importMap[tag] = (importNode) => {
      const importer = fn(importNode);
      if (!importer) return null;
      return {
        ...importer,
        conversion: (element) => {
          const output = importer.conversion(element);
          if (!output || output.forChild === undefined || output.after !== undefined || output.node !== null) {
            return output;
          }
          const styles = extraStyles(element);
          if (!styles) return output;
          const { forChild } = output;
          return {
            ...output,
            forChild: (child, parent) => {
              const node = forChild(child, parent);
              if ($isTextNode(node)) node.setStyle(node.getStyle() + styles);
              return node;
            },
          };
        },
      };
    };
  }
  return importMap;
}

const THEME = {
  heading: { h1: "editor-heading-h1", h2: "editor-heading-h2", h3: "editor-heading-h3" },
  image: "editor-image-host",
  layoutContainer: "editor-layout-container",
  layoutItem: "editor-layout-item",
  link: "editor-link",
  list: {
    listitem: "editor-listitem",
    nested: { listitem: "editor-nested-listitem" },
    ol: "editor-list-ol",
    ul: "editor-list-ul",
  },
  paragraph: "editor-paragraph",
  quote: "editor-quote",
  text: {
    bold: "editor-text-bold",
    italic: "editor-text-italic",
    strikethrough: "editor-text-strikethrough",
    underline: "editor-text-underline",
    underlineStrikethrough: "editor-text-underlineStrikethrough",
  },
};

/**
 * The proposal's rich-text editor — sole-webapp's Lexical editor (toolbar,
 * floating link editor, resizable images, column layouts, merge-field
 * pills), restyled to this app.
 *
 * Saves HTML. Merge fields export as `{{tag}}` and resolve to the client's
 * and firm's values on every change, exactly as sole-webapp stores them.
 * Insert → Image appears where an `EditorImageUploadContext` is provided.
 *
 * Uncontrolled: `initialValue` seeds it once; remount with a `key` to load
 * different content.
 */
export function RichTextEditor({
  initialValue,
  onChange,
  placeholder = "Start typing...",
  mergeValues = {},
  invalid,
  className,
  minHeight = 220,
}: {
  initialValue: string;
  onChange: (html: string) => void;
  placeholder?: string;
  mergeValues?: MergeValues;
  invalid?: boolean;
  className?: string;
  minHeight?: number;
}) {
  const onChangeRef = React.useRef(onChange);
  const valuesRef = React.useRef(mergeValues);
  onChangeRef.current = onChange;
  valuesRef.current = mergeValues;

  const [config] = React.useState<InitialConfigType>(() => ({
    namespace: "proposal-editor",
    theme: THEME,
    html: { export: EXPORT_MAP, import: buildImportMap() },
    nodes: [
      ParagraphNode,
      TextNode,
      QuoteNode,
      HeadingNode,
      ListNode,
      ListItemNode,
      LinkNode,
      AutoLinkNode,
      AttributeNode,
      ImageNode,
      LayoutContainerNode,
      LayoutItemNode,
    ],
    onError(error: Error) {
      throw error;
    },
  }));

  const handleChange = React.useCallback(
    (html: string) => onChangeRef.current(renderMergeTags(html, valuesRef.current)),
    [],
  );

  return (
    <LexicalComposer initialConfig={config}>
      <LoadInitialStatePlugin initialValue={initialValue} />
      <div
        className={cn(
          "proposal-lexical relative flex flex-col overflow-hidden rounded-md border bg-background shadow-sm",
          invalid ? "border-destructive" : "border-input",
          className,
        )}
      >
        <ToolbarPlugin mergeValues={mergeValues} />
        <div className="relative flex-1 overflow-y-auto">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="editor-input"
                style={{ minHeight }}
                aria-invalid={invalid || undefined}
                aria-placeholder={placeholder}
                placeholder={<div className="editor-placeholder">{placeholder}</div>}
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HtmlOnChangePlugin onChange={handleChange} />
          <FloatingLinkPlugin />
          <AutoFocusPlugin />
          <HistoryPlugin />
          <ListPlugin />
          <LinkPlugin />
          <ImagesPlugin />
          <LayoutPlugin />
        </div>
      </div>
    </LexicalComposer>
  );
}
