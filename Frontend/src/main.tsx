import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { APP_NAME } from "@/lib/branding";
import "./index.css";

document.title = APP_NAME;

createRoot(document.getElementById("root")!).render(<App />);
