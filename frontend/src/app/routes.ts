import { createBrowserRouter } from "react-router";
import { Root } from "./pages/Root";
import { Dashboard } from "./pages/Dashboard";
import { Chat } from "./pages/Chat";
import { Models } from "./pages/Models";
import { CyberDefence } from "./pages/CyberDefence";
import { Training } from "./pages/Training";
import { Datasets } from "./pages/Datasets";
import { Observability } from "./pages/Observability";
import { Settings } from "./pages/Settings";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true,           Component: Dashboard },
      { path: "chat",          Component: Chat },
      { path: "models",        Component: Models },
      { path: "cyber",         Component: CyberDefence },
      { path: "training",      Component: Training },
      { path: "datasets",      Component: Datasets },
      { path: "observability", Component: Observability },
      { path: "settings",      Component: Settings },
    ],
  },
]);