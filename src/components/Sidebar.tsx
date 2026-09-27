import { useState } from "react";
import { Menu, X } from "lucide-react";

interface Props {
  active: "dashboard" | "scorer";
  onNavigate: (view: "dashboard" | "scorer") => void;
}

export default function Sidebar({ active, onNavigate }: Props) {
  const [open, setOpen] = useState(false);

  function navigate(view: "dashboard" | "scorer") {
    onNavigate(view);
    setOpen(false);
  }

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between bg-card border-b border-border px-4 py-3">
        <p className="text-base font-extrabold text-accent tracking-tight">Zalo Trading</p>
        <button onClick={() => setOpen(true)} className="text-gray-300">
          <Menu size={22} />
        </button>
      </div>

      {/* Mobile drawer overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/60" onClick={() => setOpen(false)}>
          <aside
            className="w-64 bg-card border-r border-border h-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-8 pb-5 border-b border-border">
              <div>
                <p className="text-base font-extrabold text-accent tracking-tight">Zalo Trading</p>
                <p className="text-xs text-gray-500 mt-0.5">Dashboard</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400">
                <X size={20} />
              </button>
            </div>
            <NavLinks active={active} onNavigate={navigate} />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="w-60 bg-card border-r border-border min-h-screen p-5 flex-shrink-0 hidden md:block">
        <div className="mb-8 pb-5 border-b border-border">
          <p className="text-base font-extrabold text-accent tracking-tight">Zalo Trading</p>
          <p className="text-xs text-gray-500 mt-0.5">Dashboard</p>
        </div>
        <NavLinks active={active} onNavigate={onNavigate} />
      </aside>
    </>
  );
}

function NavLinks({ active, onNavigate }: Props) {
  return (
    <nav className="space-y-1">
      <p className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold mb-3 px-1">Main Menu</p>
      <button
        onClick={() => onNavigate("dashboard")}
        className={`w-full flex items-center gap-2 text-left text-sm rounded-lg px-3 py-2.5 font-medium transition-all ${
          active === "dashboard" ? "bg-accent/15 text-accent border border-accent/30" : "text-gray-400 hover:text-white hover:bg-bgdark border border-transparent"
        }`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        Overview
      </button>
      <button
        onClick={() => onNavigate("scorer")}
        className={`w-full flex items-center gap-2 text-left text-sm rounded-lg px-3 py-2.5 font-medium transition-all ${
          active === "scorer" ? "bg-accent/15 text-accent border border-accent/30" : "text-gray-400 hover:text-white hover:bg-bgdark border border-transparent"
        }`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        Setup Scorer
      </button>
    </nav>
  );
}
