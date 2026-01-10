import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { ensureCsrf } from "./api/client.js";
import Layout from "./components/Layout.jsx";
import CalendarMonth from "./pages/CalendarMonth.jsx";
import CalendarWeek from "./pages/CalendarWeek.jsx";
import NotFound from "./pages/NotFound.jsx";
import TrainerDetail from "./pages/TrainerDetail.jsx";
import TrainerForm from "./pages/TrainerForm.jsx";
import TrainersList from "./pages/TrainersList.jsx";
import TrainingDetail from "./pages/TrainingDetail.jsx";
import TrainingForm from "./pages/TrainingForm.jsx";
import TrainingsList from "./pages/TrainingsList.jsx";
import TrainingTypes from "./pages/TrainingTypes.jsx";

const App = () => {
  useEffect(() => {
    ensureCsrf().catch(() => {});
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<TrainingsList />} />
          <Route path="/trainings/new" element={<TrainingForm mode="new" />} />
          <Route path="/trainings/:id" element={<TrainingDetail />} />
          <Route path="/trainings/:id/edit" element={<TrainingForm mode="edit" />} />
          <Route path="/trainers" element={<TrainersList />} />
          <Route path="/trainers/new" element={<TrainerForm mode="new" />} />
          <Route path="/trainers/:id" element={<TrainerDetail />} />
          <Route path="/trainers/:id/edit" element={<TrainerForm mode="edit" />} />
          <Route path="/training-types" element={<TrainingTypes />} />
          <Route path="/calendar" element={<CalendarMonth />} />
          <Route path="/calendar/week" element={<CalendarWeek />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
