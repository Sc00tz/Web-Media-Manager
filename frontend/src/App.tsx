import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/ui/Layout.js";
import { Dashboard } from "./pages/Dashboard.js";
import { Movies } from "./pages/Movies.js";
import { Shows } from "./pages/Shows.js";
import { RenamePreview } from "./pages/RenamePreview.js";
import { Settings } from "./pages/Settings.js";
import { TaskLogs } from "./pages/TaskLogs.js";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="movies" element={<Movies />} />
        <Route path="shows" element={<Shows />} />
        <Route path="rename" element={<RenamePreview />} />
        <Route path="tasks" element={<TaskLogs />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
