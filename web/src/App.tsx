import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./routes/Home";
import Review from "./routes/Review";
import CardList from "./routes/CardList";
import Settings from "./routes/Settings";
import Inbox from "./routes/Inbox";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/review" element={<Review />} />
        <Route path="/cards" element={<CardList />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/inbox" element={<Inbox />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

