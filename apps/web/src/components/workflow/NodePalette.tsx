import React, { useState } from "react";
import {
  Zap,
  GitBranch,
  Globe,
  Mail,
  UserCheck,
  Hourglass,
  Flag,
  Search,
  Plus,
  Plug,
} from "lucide-react";
import {
  NODE_REGISTRY,
  PALETTE_CATEGORIES,
  NodeCategory,
} from "../../lib/node-registry";
import { NodeType } from "@flowforge/shared";

const ICON_MAP: Record<string, React.ElementType> = {
  Zap,
  GitBranch,
  Globe,
  Mail,
  UserCheck,
  Hourglass,
  Flag,
  Plug,
};

interface NodePaletteProps {
  onAddNode: (type: NodeType) => void;
  disabled?: boolean;
}

export const NodePalette: React.FC<NodePaletteProps> = ({
  onAddNode,
  disabled = false,
}) => {
  const [searchTerm, setSearchTerm] = useState("");

  const onDragStart = (event: React.DragEvent, nodeType: NodeType) => {
    if (disabled) return;
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  const allItems = Object.values(NODE_REGISTRY);

  const filteredItems = allItems.filter(
    (item) =>
      item.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col h-full text-slate-200 select-none">
      {/* Palette Header */}
      <div className="p-4 border-b border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Node Palette
          </h2>
          <span className="text-[10px] text-indigo-400 font-medium">
            Drag or Click
          </span>
        </div>

        {/* Search Input */}
        <div className="relative">
          <label htmlFor="palette-search" className="sr-only">
            Search node palette
          </label>
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5 pointer-events-none" />
          <input
            id="palette-search"
            type="search"
            placeholder="Search nodes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            disabled={disabled}
            className="w-full bg-slate-800/80 border border-slate-700 rounded-md pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus-ring transition"
          />
        </div>
      </div>

      {/* Categorized List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {PALETTE_CATEGORIES.map((category: NodeCategory) => {
          const categoryItems = filteredItems.filter(
            (i) => i.category === category,
          );
          if (categoryItems.length === 0) return null;

          return (
            <div key={category} className="space-y-1.5">
              <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1">
                {category}
              </h3>
              <div className="space-y-1">
                {categoryItems.map((item) => {
                  const Icon = ICON_MAP[item.icon] || Flag;

                  return (
                    <div
                      key={item.type}
                      tabIndex={disabled ? -1 : 0}
                      role="button"
                      aria-label={`Add ${item.label} node to canvas`}
                      aria-disabled={disabled}
                      draggable={!disabled}
                      onDragStart={(e) => onDragStart(e, item.type)}
                      onClick={() => !disabled && onAddNode(item.type)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          if (!disabled) onAddNode(item.type);
                        }
                      }}
                      className={`group p-2.5 rounded-lg border border-slate-800 bg-slate-800/60 hover:bg-slate-800 hover:border-slate-700 transition cursor-grab active:cursor-grabbing flex items-start gap-2.5 focus-ring ${
                        disabled
                          ? "opacity-50 cursor-not-allowed pointer-events-none"
                          : ""
                      }`}
                    >
                      <div className="p-1.5 rounded-md bg-slate-900 border border-slate-700/80 group-hover:border-indigo-500/50 transition shrink-0">
                        <Icon className="w-3.5 h-3.5 text-indigo-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-100 group-hover:text-indigo-300 transition">
                            {item.label}
                          </span>
                          <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 transition" />
                        </div>
                        <p className="text-[11px] text-slate-400 leading-tight line-clamp-2 mt-0.5">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {filteredItems.length === 0 && (
          <div className="text-center py-8 text-xs text-slate-500">
            No matching nodes found.
          </div>
        )}
      </div>
    </div>
  );
};
