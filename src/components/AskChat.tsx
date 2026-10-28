"use client";

import Chat from "./Chat";

const STARTERS = [
  "What does this project do, and what's the entry point?",
  "Give me a tour of the architecture.",
  "What's most likely broken or unfinished?",
  "How do I run and test it?",
];

export default function AskChat({ projectId, projectName }: { projectId: string; projectName: string }) {
  return (
    <div className="h-[calc(100vh-190px)] max-w-3xl">
      <Chat
        endpoint={`/api/projects/${projectId}/ask`}
        intro={`Grounded in ${projectName}'s code, assessment and brain notes. Read-only — it reads files to answer, never edits.`}
        starters={STARTERS}
        placeholder="Ask about this codebase…  (Enter to send, Shift+Enter for newline)"
      />
    </div>
  );
}
