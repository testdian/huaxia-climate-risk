import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import TaskListPage from './pages/tasks/TaskListPage';
import TaskDetailPage from './pages/tasks/TaskDetailPage';
import ResultAnalysisPage from './pages/results/ResultAnalysisPage';
import IndustryMappingPage from './pages/config/IndustryMappingPage';
import FactorListPage from './pages/config/FactorListPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Navigate to="/tasks" replace />} />
          <Route path="tasks" element={<TaskListPage />} />
          <Route path="tasks/:id" element={<TaskDetailPage />} />
          <Route path="results" element={<ResultAnalysisPage />} />
          <Route path="config/industry-mapping" element={<IndustryMappingPage />} />
          <Route path="config/factors" element={<FactorListPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
