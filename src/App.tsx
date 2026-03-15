// App.tsx
import { useEffect, useState } from "react";
import "./App.css";
import { KanbanBoard } from "./components/KanbanBoard";
import { ThemeProvider } from "./components/theme-provider";

const PLACES_KEY = "kanban:places";

type Place = { id: string; name: string; color: string };

function loadPlacesFromStorage(): Place[] {
  try {
    const raw = localStorage.getItem(PLACES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch (e) {
    console.warn("Erro ao ler places do localStorage", e);
    return [];
  }
}

function savePlacesToStorage(places: Place[]) {
  try {
    localStorage.setItem(PLACES_KEY, JSON.stringify(places));
    window.dispatchEvent(new StorageEvent("storage", { key: PLACES_KEY, newValue: JSON.stringify(places) } as any));
  } catch (e) {
    console.warn("Erro ao salvar places no localStorage", e);
  }
}

export default function App() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);

  useEffect(() => {
    setPlaces(loadPlacesFromStorage());

    function onAddPlace(e: any) {
      setTimeout(() => setPlaces(loadPlacesFromStorage()), 50);
    }

    function onColumnHover(e: any) {
      const placeId = e?.detail?.placeId ?? null;
      setHoveredPlaceId(placeId);
    }

    window.addEventListener("kanban:add-place", onAddPlace as EventListener);
    window.addEventListener("kanban:column-hover", onColumnHover as EventListener);
    window.addEventListener("storage", (ev: StorageEvent) => {
      if (ev.key === PLACES_KEY) setPlaces(loadPlacesFromStorage());
    });

    return () => {
      window.removeEventListener("kanban:add-place", onAddPlace as EventListener);
      window.removeEventListener("kanban:column-hover", onColumnHover as EventListener);
    };
  }, []);

  function handleOpenAddModal() {
    setShowAddModal(true);
  }

  function handleCreatePlace(name: string, color: string) {
    const next = [...loadPlacesFromStorage(), { id: `place-${Date.now()}-${Math.floor(Math.random() * 10000)}`, name, color }];
    savePlacesToStorage(next);
    setPlaces(next);
    window.dispatchEvent(new CustomEvent("kanban:add-place", { detail: { name, color } }));
    setShowAddModal(false);
  }

  return (
    <>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <div className="h-screen flex flex-col w-full">
          <main className="h-screen mx-4 flex flex-col gap-3 lg:gap-6">
            <div className="flex relative">
              <div className="absolute mt-2 w-1/5 h-full border rounded flex items-center p-2 overflow-hidden">
                <div className="flex items-center gap-2 overflow-x-auto pr-2">
                  {places.length === 0 ? (
                    <div className="text-sm text-gray-500">Nenhum lugar</div>
                  ) : (
                    places.map((p) => {
                      const isActive = hoveredPlaceId === p.id;
                      return (
                        <div
                          key={p.id}
                          className="flex-shrink-0 px-3 py-1 rounded-full bg-slate-200 dark:bg-slate-700 text-sm font-medium cursor-default select-none"
                          title={p.name}
                          onMouseEnter={() => window.dispatchEvent(new CustomEvent("kanban:place-hover", { detail: { placeId: p.id } }))}
                          onMouseLeave={() => window.dispatchEvent(new CustomEvent("kanban:place-hover", { detail: { placeId: null } }))}
                          style={{ color: isActive ? p.color : undefined, border: isActive ? `1px solid ${p.color}33` : undefined }}
                        >
                          {p.name}
                        </div>
                      );
                    })
                  )}
                </div>

                <button
                  onClick={handleOpenAddModal}
                  aria-label="Adicionar lugar"
                  className="ml-auto -mr-1 w-8 h-8 flex items-center justify-center rounded-full bg-sky-700 text-white hover:opacity-90 transition"
                >
                  +
                </button>
              </div>

              <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl w-full bg--400">
                DnD Investments
              </h1>
            </div>

            <KanbanBoard />
          </main>

        </div>

        {showAddModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setShowAddModal(false)}
          >
            <div className="bg-white dark:bg-slate-900 rounded-xl p-6 w-11/12 max-w-md border-2 border-slate-800 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-3">Criar lugar</h3>
              <AddPlaceForm onCancel={() => setShowAddModal(false)} onCreate={handleCreatePlace} />
            </div>
          </div>
        )}
      </ThemeProvider>
    </>
  );
}

function AddPlaceForm({ onCancel, onCreate }: { onCancel: () => void; onCreate: (name: string, color: string) => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#06b6d4");

  return (
    <div>
      <div className="space-y-3">
        <div>
          <label className="block text-sm">Nome</label>
          <input className="w-full px-3 py-2 rounded border" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <label className="block text-sm">Cor</label>
          <div className="flex items-center gap-3">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            <div className="text-sm text-gray-500">Escolha uma cor para identificar o lugar</div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} className="px-3 py-2 rounded border">Cancelar</button>
          <button
            onClick={() => {
              const trimmed = name.trim();
              if (!trimmed) return alert("Informe um nome");
              onCreate(trimmed, color);
            }}
            className="px-3 py-2 rounded bg-sky-700 text-white"
          >
            Criar
          </button>
        </div>
      </div>
    </div>
  );
}
