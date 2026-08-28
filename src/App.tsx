import { Route, Routes } from "react-router-dom";
import { useSession } from "./auth/session-context";
import { Layout } from "./components/Layout";
import { AboutPage } from "./pages/AboutPage";
import { CollectionPage } from "./pages/CollectionPage";
import { DetailPage } from "./pages/DetailPage";
import { MetadataReviewPage } from "./pages/MetadataReviewPage";
import { NotFoundPage } from "./pages/NotFoundPage";

function AdminRoute() {
  return useSession().isAdmin ? <MetadataReviewPage /> : <NotFoundPage />;
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<CollectionPage />} />
        <Route path="title/movie/:tmdbId" element={<DetailPage />} />
        <Route path="title/tv/:tmdbId/season/:seasonNumber" element={<DetailPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="admin/review" element={<AdminRoute />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
