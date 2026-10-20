import Link from "next/link";

const cards = [
  { href: "/demand", title: "Demand Heatmap", blurb: "Hour-by-hour demand forecasting by zone, with rush-hour direction flips.", tag: "Forecasting" },
  { href: "/optimizer", title: "Dispatch Optimizer", blurb: "Exact vehicle-to-zone assignment under capacity and travel-time constraints.", tag: "Optimization" },
  { href: "/experiment", title: "A/B Experiments", blurb: "A 30-day simulated test of dispatch strategies, analysed with the right statistics.", tag: "Experimentation" },
  { href: "/metrics", title: "Fleet Metrics", blurb: "KPIs and utilization curves an operations lead would actually watch.", tag: "Analytics" },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-12 py-6 sm:py-12">
      <section className="max-w-3xl">
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">Fleet Dispatch Optimizer</h1>
        <p className="mt-3 text-lg text-accent">Autonomous Vehicle Marketplace Logistics — Optimization, Demand Forecasting &amp; Experimentation</p>
        <p className="mt-5 text-muted leading-relaxed">
          An interactive demonstration of fleet dispatch for ride-hail marketplaces. Explore demand prediction, vehicle assignment solved as a constrained
          optimization problem, A/B experiment analysis, and fleet utilization metrics. Everything runs live in your browser on synthetic data.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/optimizer" className="rounded-lg bg-accent text-white font-semibold px-5 py-2.5 hover:brightness-110 transition">
            Try the optimizer
          </Link>
          <a
            href="https://github.com/ragurajakrishnan15/Fleet-Dispatch-Optimizer"
            className="rounded-lg border border-line px-5 py-2.5 text-muted hover:text-fg hover:bg-panel-2 transition"
          >
            View source
          </a>
        </div>
      </section>

      <section className="grid sm:grid-cols-2 gap-4" aria-label="Sections">
        {cards.map((c, i) => (
          <Link
            key={c.href}
            href={c.href}
            className="group rounded-xl border border-line bg-panel p-5 hover:border-accent hover:bg-panel-2 transition-colors"
          >
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="uppercase tracking-wide">{c.tag}</span>
              <span className="tabular-nums">0{i + 1}</span>
            </div>
            <h2 className="mt-2 text-xl font-semibold">{c.title}</h2>
            <p className="mt-1 text-muted">{c.blurb}</p>
            <span className="mt-4 inline-block text-sm text-accent group-hover:translate-x-1 transition-transform">Open →</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
