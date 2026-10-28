"use client";

const STEPS = [
  { icon: "💬", title: "You ask", body: "Tell Protégé what you'd like, in plain English." },
  { icon: "📖", title: "It reads your work", body: "Protégé looks through the project to understand it." },
  { icon: "✍️", title: "It does the task", body: "In projects you start here, it works on a safe, separate copy, so your originals aren't touched until you keep the change. In folders you brought in yourself, it changes the files directly, and says so before it starts." },
  { icon: "✓", title: "It checks itself", body: "Where possible, it runs the project's own checks to make sure nothing broke." },
  { icon: "👍", title: "You decide", body: "You see exactly what changed and choose to keep it or throw it away." },
];

export default function SimpleHelp() {
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">How this works</h1>
      <p className="text-muted mt-1">A quick guide to using Protégé. No technical knowledge needed.</p>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-muted mb-3">What happens when you ask for something</h2>
        <div className="space-y-2">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-12 h-12 shrink-0 rounded-2xl bg-accent/10 border border-accent/25 flex items-center justify-center text-2xl">
                {s.icon}
              </div>
              <div className="flex-1 rounded-2xl border border-border bg-panel px-4 py-3">
                <div className="font-semibold text-sm">
                  {i + 1}. {s.title}
                </div>
                <div className="text-sm text-muted mt-0.5">{s.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-panel p-5">
          <div className="text-2xl mb-1.5">💬</div>
          <div className="font-semibold">Asking a question</div>
          <p className="text-sm text-muted mt-1 leading-relaxed">
            The safest thing you can do. Protégé reads your work and answers — it never changes anything. Ask
            anything: what a project does, where it&apos;s up to, what to watch out for.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-panel p-5">
          <div className="text-2xl mb-1.5">✍️</div>
          <div className="font-semibold">Asking for a change</div>
          <p className="text-sm text-muted mt-1 leading-relaxed">
            In projects you start in Protégé, it does the work on a separate copy and shows you exactly what changed.
            Nothing is kept until you press <span className="text-good font-medium">Keep these changes</span>, and you can
            always throw them away. In a folder you brought in yourself, it changes the files directly; the task page
            tells you which applies before you start.
          </p>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-good/25 bg-good/5 p-5">
        <div className="font-semibold text-good">Your work is safe</div>
        <p className="text-sm text-muted mt-1 leading-relaxed">
          Protégé runs on your own computer. It only touches the project you&apos;re in, works on a copy when
          making changes, and never keeps anything without your say-so.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-muted mb-3">Common questions</h2>
        <div className="space-y-2">
          {[
            {
              q: "Do my files ever leave my computer?",
              a: "No. Everything runs locally on your machine. Your documents and code stay on your computer — they aren't uploaded anywhere or shared.",
            },
            {
              q: "Can it break something I can't undo?",
              a: "In projects you start in Protégé, it works on a separate copy and shows you first: nothing is kept until you press “Keep these changes”, and you can undo a change you kept afterwards. In a folder you brought in yourself, it changes the files directly, so ask a question first if you're unsure. The task page tells you which applies before you start.",
            },
            {
              q: "How do I know its answers are right?",
              a: "When you ask a question, it reads your actual files to answer and tells you which ones it used, so you can check for yourself. If it can't find something, it says so instead of guessing.",
            },
            {
              q: "What if I don't know what to ask?",
              a: "That's fine — on the “Do a task” screen it suggests specific things you could ask for, tailored to your project. Click one, or tweak it. You can also just ask it a question first.",
            },
            {
              q: "Does it cost me anything to run?",
              a: "It uses your existing Claude Code sign-in. There's nothing extra to set up.",
            },
          ].map((item, i) => (
            <details key={i} className="rounded-xl border border-border bg-panel px-4 py-3 group">
              <summary className="cursor-pointer text-sm font-medium list-none flex items-center justify-between">
                {item.q}
                <span className="text-muted group-open:rotate-180 transition-transform">⌄</span>
              </summary>
              <p className="text-sm text-muted mt-2 leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <p className="text-[11px] text-muted mt-6">
        Prefer the full, detailed view? Use “Switch to full view” at the bottom of the sidebar.
      </p>
    </div>
  );
}
