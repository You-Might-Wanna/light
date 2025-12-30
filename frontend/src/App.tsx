import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import EntitiesPage from './pages/EntitiesPage';
import EntityPage from './pages/EntityPage';
import CardPage from './pages/CardPage';
import AboutPage from './pages/AboutPage';
import CorrectionsPage from './pages/CorrectionsPage';
import NotFoundPage from './pages/NotFoundPage';

// Admin pages
import AdminLoginPage from './pages/admin/LoginPage';
import AdminDashboardPage from './pages/admin/DashboardPage';
import AdminCardEditPage from './pages/admin/CardEditPage';
import AdminSourceNewPage from './pages/admin/SourceNewPage';
import AdminReviewQueuePage from './pages/admin/ReviewQueuePage';

function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="entities" element={<EntitiesPage />} />
        <Route path="entities/:entityId" element={<EntityPage />} />
        <Route path="cards/:cardId" element={<CardPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="corrections" element={<CorrectionsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Admin routes */}
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin" element={<Layout isAdmin />}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="dashboard" element={<AdminDashboardPage />} />
        <Route path="cards/new" element={<AdminCardEditPage />} />
        <Route path="cards/:cardId/edit" element={<AdminCardEditPage />} />
        <Route path="sources/new" element={<AdminSourceNewPage />} />
        <Route path="review-queue" element={<AdminReviewQueuePage />} />
      </Route>
    </Routes>
  );
}

export default App;
