import { HashRouter, Route, Routes } from "react-router-dom";
import Dashboard from "./dashboard/Dashboard";
import Prompt from "./prompt/Prompt";
import "./App.css";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/prompt" element={<Prompt />} />
      </Routes>
    </HashRouter>
  );
}
