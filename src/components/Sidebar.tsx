interface Props {
  active: "dashboard" | "scorer";
  onNavigate: (view: "dashboard" | "scorer") => void;
}

export default function Sidebar({ active, onNavigate }: Props) {
  return (
    <aside className="w-60 bg-card border-r border-border min-h-screen p-5 flex-shrink-0 hidden md:block">
      <div className="mb-8 pb-5 border-b border-border">
        <p className="text-base font-extrabold text-accent tracking-tight">Zalo Trading</p>
        <p className="text-xs text-gray-500 mt-0.5">Dashboard</p>
      </div>

      <p className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold mb-3 px-1">
        Main Menu
      </p>
      <nav className="space-y-1">
        <button
          onClick={() => onNavigate("dashboard")}
          className={`w-full flex items-center gap-2 text-left text-sm rounded-lg px-3 py-2.5 font-medium transition-all ${
            active === "dashboard"
              ? "bg-accent/15 text-accent border border-accent/30"
              : "text-gray-400 hover:text-white hover:bg-bgdark border border-transparent"
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          Overview
        </button>
        <button
          onClick={() => onNavigate("scorer")}
          className={`w-full flex items-center gap-2 text-left text-sm rounded-lg px-3 py-2.5 font-medium transition-all ${
            active === "scorer"
              ? "bg-accent/15 text-accent border border-accent/30"
              : "text-gray-400 hover:text-white hover:bg-bgdark border border-transparent"
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          Setup Scorer
        </button>
      </nav>
    </aside>
  );
}