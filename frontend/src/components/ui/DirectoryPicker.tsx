import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { libraryApi } from "../../lib/api.js";
import { ChevronRight, Folder, FolderOpen, ArrowUp, Check } from "lucide-react";

interface Props {
  value: string;
  onChange: (path: string) => void;
  onClose: () => void;
}

export function DirectoryPicker({ value, onChange, onClose }: Props) {
  const [dir, setDir] = useState(value || "/");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["browse", dir],
    queryFn: () => libraryApi.browse(dir),
  });

  return (
    <div className="flex flex-col h-full">
      {/* Current path */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-gray-950 flex-shrink-0">
        <FolderOpen size={14} className="text-blue-400 flex-shrink-0" />
        <span className="text-xs font-mono text-gray-300 truncate flex-1" title={data?.current ?? dir}>
          {data?.current ?? dir}
        </span>
      </div>

      {/* Directory listing */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading && (
          <div className="px-4 py-6 text-center text-xs text-gray-500">Loading...</div>
        )}
        {isError && (
          <div className="px-4 py-6 text-center text-xs text-red-400">Cannot read directory</div>
        )}

        {data && (
          <>
            {/* Up one level */}
            {data.parent !== null && (
              <button
                onClick={() => setDir(data.parent!)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 border-b border-white/5 text-gray-400 hover:text-gray-200"
              >
                <ArrowUp size={14} className="flex-shrink-0" />
                <span className="text-sm">..</span>
              </button>
            )}

            {data.entries.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-gray-500">No subdirectories</div>
            )}

            {data.entries.map((entry) => (
              <button
                key={entry.path}
                onClick={() => setDir(entry.path)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 border-b border-white/5 last:border-0 group"
              >
                <Folder size={14} className="text-yellow-500/70 flex-shrink-0" />
                <span className="text-sm flex-1 truncate">{entry.name}</span>
                <ChevronRight size={12} className="text-gray-600 group-hover:text-gray-400 flex-shrink-0" />
              </button>
            ))}
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-white/10 bg-gray-950 flex-shrink-0">
        <span className="text-xs text-gray-500 flex-1 font-mono truncate">{data?.current ?? dir}</span>
        <button
          onClick={() => onClose()}
          className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-white/10 rounded"
        >
          Cancel
        </button>
        <button
          onClick={() => { onChange(data?.current ?? dir); onClose(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 rounded"
        >
          <Check size={12} /> Select
        </button>
      </div>
    </div>
  );
}
