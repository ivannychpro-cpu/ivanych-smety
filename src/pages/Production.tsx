import { useApp } from '../store/AppContext';
import TaskBoard from '../components/TaskBoard';
import { Empty } from '../components/ui';

export default function Production() {
  const { can } = useApp();
  if (!can('production.view')) return <Empty icon="🔒" title="Раздел недоступен" />;
  return (
    <TaskBoard
      department="production"
      canEdit={can('production.edit')}
      title="Отдел производства"
      hint="Этапы работ на объектах. Задачи, зависящие от дизайна, разблокируются автоматически."
    />
  );
}
