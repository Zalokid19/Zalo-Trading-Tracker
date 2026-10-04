import { useState } from "react";
import { Menu, X } from "lucide-react";

type View = "dashboard" | "scorer";

interface Props {
  active: View;
  onNavigate: (view: View) => void;
}

function NavLinks({ active, onNavigate }: Props) {
  const base = "w-full flex items-center gap-2 text-left text-sm rounded-lg px-3 py-2.5 font-medium transition-all border";
  const on = "bg-gradient-to-r from-accent/20 to-teal/10 text-accent border-accent/30";
  const off = "text-gray-400 hover:text-white hover:bg-bgdark border-transparent";
  return (
    <nav className="space-y-1">
      <p className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold mb-3 px-1">Main Menu</p>
      <button onClick={() => onNavigate("dashboard")} className={`${base} ${active === "dashboard" ? on : off}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        Overview
      </button>
      <button onClick={() => onNavigate("scorer")} className={`${base} ${active === "scorer" ? on : off}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        Setup Scorer
      </button>
    </nav>
  );
}

export default function Sidebar({ active, onNavigate }: Props) {
  const [open, setOpen] = useState(false);

  function go(view: View) {
    onNavigate(view);
    setOpen(false);
  }

  return (
    <>
      <div className="md:hidden sticky top-0 z-40 flex items-center justify-between bg-card border-b border-border px-4 py-3">
        <p className="text-base font-extrabold text-accent tracking-tight">Zalo Trading</p>
        <button onClick={() => setOpen(true)} className="text-gray-300 p-1" aria-label="Open menu">
          <Menu size={24} />
        </button>
      </div>

      {open && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/60" onClick={() => setOpen(false)}>
          <aside
            className="w-64 max-w-[80%] bg-card border-r border-border h-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-8 pb-5 border-b border-border">
              <p className="text-base font-extrabold text-accent tracking-tight">Zalo Trading</p>
              <button onClick={() => setOpen(false)} className="text-gray-400" aria-label="Close menu">
                <X size={22} />
              </button>
            </div>
            <NavLinks active={active} onNavigate={go} />
          </aside>
        </div>
      )}

      <aside className="hidden md:block w-60 bg-card border-r border-border min-h-screen p-5 flex-shrink-0 relative z-10">
        <div className="mb-8 pb-5 border-b border-border">
          <p className="text-base font-extrabold text-accent tracking-tight">Zalo Trading</p>
          <p className="text-xs text-gray-500 mt-0.5">Dashboard</p>
        </div>
        <NavLinks active={active} onNavigate={onNavigate} />
      </aside>
    </>
  );
}