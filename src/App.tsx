import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AboutPage } from "./pages/AboutPage";
import { CollectionPage } from "./pages/CollectionPage";
import { DetailPage } from "./pages/DetailPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<CollectionPage />} />
        <Route path="title/movie/:tmdbId" element={<DetailPage />} />
        <Route path="title/tv/:tmdbId/season/:seasonNumber" element={<DetailPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
