export interface TabItem<T extends string = string> {
  id: T;
  label: string;
}

interface UnderlineTabsProps<T extends string> {
  tabs: TabItem<T>[];
  activeTab: T;
  onChange: (id: T) => void;
}

export function UnderlineTabs<T extends string>({
  tabs,
  activeTab,
  onChange,
}: UnderlineTabsProps<T>) {
  return (
    <div
      role="tablist"
      className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto"
    >
      {tabs.map(tab => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`relative px-4 py-3 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              isActive ? 'text-slate-950' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {tab.label}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-700 rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
