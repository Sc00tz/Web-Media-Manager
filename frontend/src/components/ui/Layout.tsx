import { Outlet } from "react-router-dom";
import { NavLink } from "react-router-dom";
import { Film, Tv, LayoutDashboard, Settings, ListChecks, FolderEdit } from "lucide-react";
import { clsx } from "clsx";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/movies", icon: Film, label: "Movies" },
  { to: "/shows", icon: Tv, label: "TV Shows" },
  { to: "/rename", icon: FolderEdit, label: "Rename" },
  { to: "/tasks", icon: ListChecks, label: "Task Queue" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Layout() {
  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
      <aside className="w-56 flex-shrink-0 bg-gray-900 border-r border-white/5 flex flex-col">
        <div className="px-4 py-5 border-b border-white/5">
          <span className="text-lg font-semibold tracking-tight text-white">MediaManager</span>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-gray-400 hover:text-gray-100 hover:bg-white/5"
                )
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
