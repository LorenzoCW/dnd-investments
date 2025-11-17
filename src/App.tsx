import "./App.css";
import { KanbanBoard } from "./components/KanbanBoard";
import { ThemeProvider } from "./components/theme-provider";

function App() {
  return (
    <>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <div className="h-screen flex flex-col w-full">

          <main className="h-screen mx-4 flex flex-col gap-6">
            <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">
              DnD Investments
            </h1>
            <KanbanBoard />
          </main>

        </div>
      </ThemeProvider>
    </>
  );
}

export default App;
