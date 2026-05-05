import { HashRouter, Routes, Route } from "react-router-dom";
import Prompt from "./Prompt";
import Dashboard from "./Dashboard";
import "./App.css";

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/prompt" element={<Prompt />} />
      </Routes>
    </HashRouter>
  );
}

export default App;