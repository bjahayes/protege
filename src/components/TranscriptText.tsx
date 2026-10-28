"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";

// Convert raw-HTML mdast nodes into plain text so content like <div>, <system-reminder>,
// or JSX in prose is shown literally instead of being silently dropped by react-markdown.
function remarkHtmlToText() {
  return (tree: any) => {
    visit(tree, "html", (node: any) => {
      node.type = "text";
    });
  };
}

export default function TranscriptText({ children }: { children: string }) {
  return (
    <div className="tx-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkHtmlToText]}
        components={{
          a: ({ href, children }) => {
            const external = !!href && /^https?:\/\//i.test(href);
            return (
              <a
                href={href}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
                className="text-accent underline underline-offset-2 hover:text-accent/80 break-all"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
