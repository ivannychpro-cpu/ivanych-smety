import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { useApp } from './store/AppContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import EstimateList from './pages/EstimateList';
import EstimateEditor from './pages/EstimateEditor';
import Catalog from './pages/Catalog';
import Bundles from './pages/Bundles';
import Clients from './pages/Clients';
import Objects from './pages/Objects';
import Contracts from './pages/Contracts';
import Acts from './pages/Acts';
import Briefs from './pages/Briefs';
import Management from './pages/Management';
import Approvals from './pages/Approvals';
import Design from './pages/Design';
import Production from './pages/Production';
import Users from './pages/admin/Users';
import Roles from './pages/admin/Roles';
import Settings from './pages/admin/Settings';
import Profile from './pages/Profile';
import DocumentView from './pages/DocumentView';

function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts no-print">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.message}</div>)}
    </div>
  );
}

export default function App() {
  const { currentUser } = useApp();

  if (!currentUser) {
    return (<><Login /><Toasts /></>);
  }

  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/estimates" element={<EstimateList />} />
          <Route path="/estimates/:id" element={<EstimateEditor />} />
          <Route path="/catalog" element={<Catalog />} />
          <Route path="/bundles" element={<Bundles />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/objects" element={<Objects />} />
          <Route path="/objects/:id" element={<Objects />} />
          <Route path="/contracts" element={<Contracts />} />
          <Route path="/acts" element={<Acts />} />
          <Route path="/briefs" element={<Briefs />} />
          <Route path="/briefs/:id" element={<Briefs />} />
          <Route path="/management" element={<Management />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/design" element={<Design />} />
          <Route path="/production" element={<Production />} />
          <Route path="/documents/:kind/:id" element={<DocumentView />} />
          <Route path="/admin/users" element={<Users />} />
          <Route path="/admin/roles" element={<Roles />} />
          <Route path="/admin/settings" element={<Settings />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toasts />
    </>
  );
}
