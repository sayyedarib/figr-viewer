import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./host/App";
import { createServices } from "./host/app/services";
import "./host/styles.css";

// Services live outside React: they own long-lived connections and must not be
// created or torn down by (StrictMode-doubled) renders and effects.
const services = createServices();
services.board.load();
if (import.meta.env.DEV) Object.assign(window, { __figr: services }); // debugging handle

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App services={services} />
  </StrictMode>,
);
