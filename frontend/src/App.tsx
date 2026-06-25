import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "@/pages/Landing";
import Host from "@/pages/Host";
import Guest from "@/pages/Guest";

export default function App() {
  return (
    <>
      <div className="gaia-bg" aria-hidden />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/host" element={<Host />} />
          <Route path="/r/:code" element={<Guest />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}
