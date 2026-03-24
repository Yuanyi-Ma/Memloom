import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeToggle } from "./components/theme-toggle";
import Home from "./routes/Home";
import Review from "./routes/Review";
import CardList from "./routes/CardList";
import Settings from "./routes/Settings";
import Inbox from "./routes/Inbox";

function App() {
  return (
    <BrowserRouter>
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur-md px-6 h-16">
        <span className="text-xl font-bold tracking-tight text-foreground">忆织</span>
        <ThemeToggle />
      </header>
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
