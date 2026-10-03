import { createRoot } from "react-dom/client";
import "./static.css";
import AppShell from "@/components/AppShell";
import { usePath } from "./shims/router";
import Economy from "@/app/page";
import Markets from "@/app/marches/page";
import Portfolio from "@/app/portefeuille/page";
import City from "@/app/ville/page";
import World from "@/app/monde/page";
import News from "@/app/actualites/page";
import Relations from "@/app/relations/page";
import Research from "@/app/recherche/page";
import Wiki from "@/app/wiki/page";

const PAGES: Record<string, () => React.ReactNode> = {
  "/": Economy, "/marches": Markets, "/portefeuille": Portfolio, "/ville": City, "/monde": World,
  "/actualites": News, "/relations": Relations, "/recherche": Research, "/wiki": Wiki,
};

function App() {
  const path = usePath();
  const Page = PAGES[path] ?? Economy;
  return <AppShell><Page key={path} /></AppShell>;
}

createRoot(document.getElementById("root")!).render(<App />);
