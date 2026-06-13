import Link from "next/link";

export function Nav() {
  const links = [
    ["Dashboard", "/"], ["Income", "/income"], ["Transactions", "/transactions"], ["Budgets", "/budgets"],
    ["Categories", "/categories"], ["Subscriptions", "/subscriptions"], ["Goals", "/goals"], ["Reports", "/reports"], ["Settings", "/settings"],
  ];
  return <nav className="flex flex-wrap gap-3 mt-6">{links.map(([label, href]) => <Link key={href} href={href} className="rounded-2xl bg-white/10 px-5 py-3 font-black hover:bg-white/20">{label}</Link>)}</nav>;
}

export function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <main className="min-h-screen bg-[#020617] text-white px-6 py-10"><div className="mx-auto max-w-7xl space-y-8"><header><p className="text-emerald-400 font-black tracking-[0.45em] text-sm">FINANCE COMMAND CENTRE V2</p><h1 className="text-5xl md:text-7xl font-black mt-4">{title}</h1>{subtitle && <p className="text-white/60 mt-3">{subtitle}</p>}<Nav /></header>{children}</div></main>;
}

export function Card({ title, value, note, tone = "normal" }: { title: string; value: string; note?: string; tone?: "normal" | "light" | "danger" | "warning" | "success" }) {
  const cls = tone === "light" ? "bg-white text-black border-white" : tone === "danger" ? "bg-red-500/10 border-red-400/30" : tone === "warning" ? "bg-yellow-500/10 border-yellow-400/30" : tone === "success" ? "bg-emerald-500/10 border-emerald-400/30" : "bg-white/10 border-white/10";
  return <div className={`rounded-3xl p-6 border ${cls}`}><p className="text-xs tracking-[0.25em] font-black opacity-60 uppercase">{title}</p><h2 className="text-3xl md:text-4xl font-black mt-4">{value}</h2>{note && <p className="opacity-60 mt-2">{note}</p>}</div>;
}

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-3xl bg-white text-black p-6"><h2 className="text-2xl font-black mb-5">{title}</h2>{children}</section>;
}

export const inputClass = "w-full rounded-2xl border border-black/20 p-4 text-lg";
export const buttonClass = "w-full rounded-2xl bg-black text-white p-4 font-black";
